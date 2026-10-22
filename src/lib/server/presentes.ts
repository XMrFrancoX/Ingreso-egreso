import { env } from '$env/dynamic/private';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';
import { entradaAula } from '$lib/fechas';

// Presentes del docente → tardes de pasantías. La intranet (api_presentes.asp, la mantiene otro
// equipo) dice, por DNI y fecha, qué estado le puso el docente en cada clase y a qué hora. Para
// cada pasante que fichó hoy se mira la clase de su hora de aula (ingreso, + 30 min si tiene
// almuerzo): si el docente le puso presente o tarde después de esa hora (o del inicio de la clase,
// si empieza después), esos minutos son su tarde. Se cuenta desde la marca aunque el docente haya
// tomado lista tarde (lo decidió el colegio).
// Vale el PRIMER presente que se ve: si el docente vuelve a tomar lista, la intranet cambia la marca
// de todos a la hora nueva (pasó: 13:06 → 14:15 y a cinco alumnos les quedaron 75 min). Una vez
// guardado un presente (o tarde) con su hora, esa fichada ya no se vuelve a calcular.
// Si superan lo que ya se anotó al fichar, se actualiza tardes_procesador (fuente 'presente') y el
// envío de siempre (/api/cron/tardes) lo manda al procesador, con la hora del presente para que
// caiga en esa clase. Usa la misma clave que api_tardes (INTRANET_TARDES_TOKEN).
const URL_PRESENTES = 'https://intranet.philips.edu.ar/alumnos/padres/services/AsistenciaClase/api_presentes.asp';
const DNIS_POR_PEDIDO = 50;

type Clase = {
	inicio: string;
	fin: string;
	materia: string;
	estado: 'presente' | 'tarde' | 'ausente' | 'sin_tomar' | string;
	marcado: string | null;
	lista_tomada: string | null;
	minutos_tarde: number;
};
type RespuestaPresentes = { ok: boolean; alumnos?: { dni: string; clases: Clase[] }[]; error?: string; message?: string };

export type Decision = {
	registro_id: string;
	email: string;
	hora_aula: string | null;
	clase: string | null;
	estado: string;
	marcado: string | null;
	minutos: number;
	ya_anotados: number;
	accion: 'nada' | 'anotar_tarde';
	motivo: string;
};

// En el horario de la intranet también figuran el almuerzo y los recreos: no son clases.
const NO_ES_CLASE = /almuerzo|recreo/i;

const aMinutos = (hhmm: string) => {
	const [h, m] = hhmm.split(':').map(Number);
	return h * 60 + m;
};
// Hora argentina ("HH:MM") de un timestamp ISO con offset.
const horaAR = (iso: string) =>
	new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

// La intranet antepone a veces un <script> de la sesión de padres: el JSON va al final.
function leerJson(texto: string): RespuestaPresentes | null {
	const inicio = texto.lastIndexOf('{"ok"');
	if (inicio < 0) return null;
	try {
		return JSON.parse(texto.slice(inicio)) as RespuestaPresentes;
	} catch {
		return null;
	}
}

async function consultar(fecha: string, dnis: string[]) {
	const porDni = new Map<string, Clase[]>();
	for (let i = 0; i < dnis.length; i += DNIS_POR_PEDIDO) {
		const res = await fetch(URL_PRESENTES, {
			method: 'POST',
			headers: { 'X-Api-Token': env.INTRANET_TARDES_TOKEN ?? '', 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ fecha, dni: dnis.slice(i, i + DNIS_POR_PEDIDO).join(',') })
		});
		const cuerpo = leerJson(await res.text());
		// 404 = ningún DNI encontrado en esa tanda: se sigue con las demás.
		if (res.status === 404) continue;
		if (!res.ok || !cuerpo?.ok) throw new Error(`La intranet respondió ${res.status}: ${cuerpo?.message ?? cuerpo?.error ?? 'sin detalle'}`);
		for (const a of cuerpo.alumnos ?? []) porDni.set(String(a.dni).replace(/\D/g, ''), a.clases ?? []);
	}
	return porDni;
}

// La clase de la hora de aula: la que está en curso a esa hora o, si cae en un recreo, la siguiente.
function claseDeAula(clases: Clase[], aula: string) {
	const a = aMinutos(aula);
	return (
		[...clases]
			.filter((c) => !NO_ES_CLASE.test(c.materia))
			.sort((x, y) => aMinutos(x.inicio) - aMinutos(y.inicio))
			.find((c) => aMinutos(c.fin) > a) ?? null
	);
}

/**
 * Revisa los presentes de hoy. Con `simular` no escribe nada: sólo devuelve qué haría (para
 * probar sin mandarle tardes reales al procesador).
 */
export async function revisarPresentes(servicio: SupabaseClient<Database>, fecha: string, simular = false) {
	if (!env.INTRANET_TARDES_TOKEN) throw new Error('Falta configurar INTRANET_TARDES_TOKEN');

	const { data, error } = await servicio
		.from('registros')
		.select(
			'id, perfil_id, perfil:perfiles(email, dni, horario_entrada, almuerzo_extra), tarde:tardes_procesador(minutos, estado, fuente), visto:presentes_pp(clase, clase_inicio, estado, marcado, minutos)'
		)
		.eq('fecha', fecha);
	if (error) throw new Error(error.message);

	const registros = (data ?? []).filter((r) => r.perfil?.dni && r.perfil.horario_entrada);
	const dnis = [...new Set(registros.map((r) => r.perfil!.dni!.replace(/\D/g, '')).filter(Boolean))];
	const porDni = dnis.length ? await consultar(fecha, dnis) : new Map<string, Clase[]>();

	const decisiones: Decision[] = [];
	for (const r of registros) {
		const p = r.perfil!;
		const aula = entradaAula(p.horario_entrada, p.almuerzo_extra);
		const clases = porDni.get(p.dni!.replace(/\D/g, '')) ?? [];
		const clase = aula ? claseDeAula(clases, aula) : null;
		const yaAnotados = r.tarde?.minutos ?? 0;

		// Ya se vio su primer presente: queda ése, aunque el docente haya vuelto a tomar lista.
		const visto = r.visto;
		if (visto?.marcado && (visto.estado === 'presente' || visto.estado === 'tarde')) {
			decisiones.push({
				registro_id: r.id,
				email: p.email,
				hora_aula: aula,
				clase: visto.clase ? `${visto.clase_inicio?.slice(0, 5) ?? ''} ${visto.clase}` : null,
				estado: visto.estado,
				marcado: visto.marcado,
				minutos: visto.minutos,
				ya_anotados: yaAnotados,
				accion: 'nada',
				motivo: `Ya tenía su primer presente (${horaAR(visto.marcado)})`
			});
			continue;
		}

		let minutos = 0;
		let motivo = !clase ? 'No hay clase a la hora de aula' : 'Lista sin tomar o ausente';
		if (clase && aula && clase.marcado && (clase.estado === 'presente' || clase.estado === 'tarde')) {
			const referencia = Math.max(aMinutos(aula), aMinutos(clase.inicio));
			minutos = Math.max(0, aMinutos(horaAR(clase.marcado)) - referencia);
			motivo = `${clase.estado === 'tarde' ? 'Tarde' : 'Presente'} a las ${horaAR(clase.marcado)}`;
		}
		decisiones.push({
			registro_id: r.id,
			email: p.email,
			hora_aula: aula,
			clase: clase ? `${clase.inicio}-${clase.fin} ${clase.materia}` : null,
			estado: clase?.estado ?? 'sin_clase',
			marcado: clase?.marcado ?? null,
			minutos,
			ya_anotados: yaAnotados,
			accion: minutos > yaAnotados ? 'anotar_tarde' : 'nada',
			motivo
		});

		if (simular) continue;
		const { error: e1 } = await servicio.from('presentes_pp').upsert({
			registro_id: r.id,
			clase: clase?.materia ?? null,
			clase_inicio: clase?.inicio ?? null,
			estado: clase?.estado ?? 'sin_clase',
			marcado: clase?.marcado ?? null,
			lista_tomada: clase?.lista_tomada ?? null,
			minutos,
			revisado_en: new Date().toISOString()
		});
		if (e1) throw new Error(e1.message);

		if (minutos > yaAnotados && clase?.marcado) {
			const { error: e2 } = await servicio.from('tardes_procesador').upsert({
				registro_id: r.id,
				perfil_id: r.perfil_id,
				minutos,
				hora_fichada: clase.marcado,
				fuente: 'presente',
				estado: 'pendiente',
				intentos: 0,
				respuesta: null,
				actualizado_en: new Date().toISOString()
			});
			if (e2) throw new Error(e2.message);
		}
	}

	return {
		fecha,
		simulacion: simular,
		revisados: decisiones.length,
		tardes_nuevas: decisiones.filter((d) => d.accion === 'anotar_tarde').length,
		decisiones
	};
}
