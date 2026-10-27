import { env } from '$env/dynamic/private';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';
import { entradaAula } from '$lib/fechas';
import { aMinutos, claseDeAula, consultar } from '$lib/server/presentes';

// Tardes de pasantías → procesador de asistencias del colegio (API de la intranet, la mantiene
// otro equipo): POST api_tardes.asp con el DNI, los minutos tarde y la hora en que fichó.
// Configuración (Cloudflare): SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (la base de ese entorno),
// INTRANET_TARDES_TOKEN (clave de la intranet) y, en develop, INTRANET_DNI_PERMITIDOS (sólo esos
// DNI: así las pruebas no les ponen tardes a alumnos reales).
const URL_PROCESADOR = 'https://intranet.philips.edu.ar/alumnos/padres/services/AsistenciaClase/api_tardes.asp';

// Por corrida: Cloudflare corta a los 50 pedidos salientes (los de la base cuentan).
const POR_TANDA = 40;
const EN_PARALELO = 5;

type Estado = 'enviado' | 'ya_estaba' | 'en_cola' | 'sin_dni' | 'rechazado' | 'error' | 'omitido';
type Resultado = { registro_id: string; estado: Estado; respuesta: string };

const ERRORES: Record<string, string> = {
	missing_fields: 'Faltaron datos para el procesador.',
	invalid_dni: 'El procesador dice que el DNI no es válido.',
	invalid_time_late: 'El procesador no aceptó los minutos tarde.',
	invalid_time_sent: 'El procesador no aceptó la hora de entrada.',
	unauthorized: 'El procesador rechazó la clave (INTRANET_TARDES_TOKEN).',
	student_not_found: 'El procesador no tiene un alumno activo con ese DNI.',
	ambiguous_dni: 'En el procesador hay más de un alumno activo con ese DNI: no se mandó.',
	method_not_allowed: 'El procesador no aceptó el pedido.',
	not_configured: 'El procesador no está configurado.',
	db_error: 'El procesador tuvo un error de base de datos.'
};

type RespuestaProcesador = { ok: boolean; status?: string; error?: string; message?: string };

export function clienteServicio(): SupabaseClient<Database> | string {
	if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
		return 'Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY';
	}
	return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
}

// La intranet antepone a la respuesta un <script> de la sesión de padres: el JSON va al final.
function leerJson(texto: string): RespuestaProcesador | null {
	const inicio = texto.lastIndexOf('{"ok"');
	if (inicio < 0) return null;
	try {
		return JSON.parse(texto.slice(inicio)) as RespuestaProcesador;
	} catch {
		return null;
	}
}

function dniPermitidos() {
	const lista = (env.INTRANET_DNI_PERMITIDOS ?? '').split(',').map((d) => d.replace(/\D/g, '')).filter(Boolean);
	return lista.length ? new Set(lista) : null;
}

async function mandar(dni: string, minutos: number, horaFichada: string): Promise<Omit<Resultado, 'registro_id'>> {
	let res: Response;
	try {
		res = await fetch(URL_PROCESADOR, {
			method: 'POST',
			headers: {
				'X-Api-Token': env.INTRANET_TARDES_TOKEN ?? '',
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: new URLSearchParams({
				dni,
				time_late: String(minutos),
				time_sent: new Date(horaFichada).toISOString()
			})
		});
	} catch (e) {
		return { estado: 'error', respuesta: 'Sin conexión con el procesador: ' + (e instanceof Error ? e.message : String(e)) };
	}

	const cuerpo = leerJson(await res.text());
	const detalle = cuerpo?.error ? (ERRORES[cuerpo.error] ?? cuerpo.message ?? cuerpo.error) : '';
	if (res.status === 201) return { estado: 'enviado', respuesta: 'Registrada en el procesador.' };
	if (res.status === 200 && cuerpo?.ok) return { estado: 'ya_estaba', respuesta: 'El procesador ya la tenía.' };
	if (res.status === 202) {
		return { estado: 'en_cola', respuesta: 'Todavía no hay lista de esa clase: el procesador la aplica cuando se cree.' };
	}
	// DNI inexistente, inválido o repetido, o datos que no acepta: reintentar no cambia nada
	// hasta que se corrija algo (el DNI vuelve a mandarla solo; si no, "Reintentar").
	if (res.status === 400 || res.status === 404 || res.status === 409) {
		return { estado: 'rechazado', respuesta: detalle || `El procesador la rechazó (HTTP ${res.status}).` };
	}
	return { estado: 'error', respuesta: detalle || `El procesador respondió HTTP ${res.status}.` };
}

// Hora con la que se manda la tarde: el procesador la anota en la clase que hay a esa hora. Se usa
// el inicio (+1 min) de la clase de la hora de aula (ingreso, + 30 min si tiene almuerzo): si se
// manda la hora de la fichada o de la marca del docente, puede caer en un recreo o en la clase
// siguiente (pasó: lista retomada a las 14:15 en una clase que terminaba 14:10) y queda en cola.
// Si no se sabe la clase, va la hora de siempre.
function horaDeEnvio(fecha: string, inicio: string | null | undefined, porDefecto: string) {
	if (!inicio) return porDefecto;
	const minutos = aMinutos(inicio) + 1;
	const hh = String(Math.floor(minutos / 60)).padStart(2, '0');
	const mm = String(minutos % 60).padStart(2, '0');
	return `${fecha}T${hh}:${mm}:00-03:00`;
}

type Fila = {
	registro_id: string;
	minutos: number;
	hora_fichada: string;
	estado: string;
	perfil: { dni: string | null; horario_entrada: string | null; almuerzo_extra: boolean } | null;
	registro: { fecha: string; visto: { clase_inicio: string | null } | null } | null;
};
const COLUMNAS =
	'registro_id, minutos, hora_fichada, estado, perfil:perfiles(dni, horario_entrada, almuerzo_extra), registro:registros(fecha, visto:presentes_pp(clase_inicio))';

// Manda las tardes pendientes (y las que fallaron por conexión) de los últimos 14 días, y vuelve a
// mandar cada hora, durante 3 días, las que quedaron "en cola": si el procesador ya la aplicó
// contesta "ya estaba" (Anotada); si estaba esperando la planilla, la aplica ahora.
// Con `simular` no manda ni guarda nada: dice qué mandaría y con qué hora.
export async function enviarTardes(servicio: SupabaseClient<Database>, simular = false) {
	if (!env.INTRANET_TARDES_TOKEN) throw new Error('Falta configurar INTRANET_TARDES_TOKEN');

	const ahora = Date.now();
	const [nuevas, enCola] = await Promise.all([
		servicio
			.from('tardes_procesador')
			.select(COLUMNAS)
			.in('estado', ['pendiente', 'error'])
			.lt('intentos', 10)
			.gt('hora_fichada', new Date(ahora - 14 * 24 * 60 * 60_000).toISOString())
			.order('hora_fichada')
			.limit(POR_TANDA),
		servicio
			.from('tardes_procesador')
			.select(COLUMNAS)
			.eq('estado', 'en_cola')
			.lt('enviado_en', new Date(ahora - 60 * 60_000).toISOString())
			.gt('hora_fichada', new Date(ahora - 3 * 24 * 60 * 60_000).toISOString())
			.order('hora_fichada')
			.limit(POR_TANDA)
	]);
	if (nuevas.error) throw new Error(nuevas.error.message);
	if (enCola.error) throw new Error(enCola.error.message);
	const filas = [...(nuevas.data ?? []), ...(enCola.data ?? [])].slice(0, POR_TANDA) as unknown as Fila[];

	// La clase de la hora de aula: la guardada por la revisión de presentes o, si todavía no está,
	// preguntándole a la intranet (una consulta por día para todos los DNI).
	const faltan = new Map<string, Set<string>>();
	for (const f of filas) {
		const dni = (f.perfil?.dni ?? '').replace(/\D/g, '');
		if (dni && f.registro && !f.registro.visto?.clase_inicio) {
			faltan.set(f.registro.fecha, (faltan.get(f.registro.fecha) ?? new Set()).add(dni));
		}
	}
	const clasesPorFecha = new Map<string, Awaited<ReturnType<typeof consultar>>>();
	for (const [fecha, dnis] of faltan) {
		try {
			clasesPorFecha.set(fecha, await consultar(fecha, [...dnis]));
		} catch (e) {
			console.error('No se pudo consultar la clase en la intranet:', e);
		}
	}
	const envio = (f: Fila) => {
		if (!f.registro) return f.hora_fichada;
		let inicio = f.registro.visto?.clase_inicio?.slice(0, 5);
		const aula = entradaAula(f.perfil?.horario_entrada, f.perfil?.almuerzo_extra);
		if (!inicio && aula) {
			const clases = clasesPorFecha.get(f.registro.fecha)?.get((f.perfil?.dni ?? '').replace(/\D/g, '')) ?? [];
			inicio = claseDeAula(clases, aula)?.inicio;
		}
		return horaDeEnvio(f.registro.fecha, inicio, f.hora_fichada);
	};

	if (simular) {
		return {
			simulacion: true,
			tardes: filas.map((f) => ({ registro_id: f.registro_id, estado: f.estado, minutos: f.minutos, hora_envio: envio(f) }))
		};
	}

	const permitidos = dniPermitidos();
	const resultados: Resultado[] = [];
	for (let i = 0; i < filas.length; i += EN_PARALELO) {
		const tanda = filas.slice(i, i + EN_PARALELO).map(async (t): Promise<Resultado> => {
			const dni = (t.perfil?.dni ?? '').replace(/\D/g, '');
			if (!dni) return { registro_id: t.registro_id, estado: 'sin_dni', respuesta: 'El alumno no tiene DNI cargado.' };
			if (permitidos && !permitidos.has(dni)) {
				return { registro_id: t.registro_id, estado: 'omitido', respuesta: 'Develop: el DNI no está entre los de prueba, no se mandó.' };
			}
			return { registro_id: t.registro_id, ...(await mandar(dni, t.minutos, envio(t))) };
		});
		resultados.push(...(await Promise.all(tanda)));
	}

	if (resultados.length) {
		const { error: errGuardar } = await servicio.rpc('registrar_tardes_procesador', { p_resultados: resultados });
		if (errGuardar) throw new Error('No se pudieron guardar los resultados: ' + errGuardar.message);
	}

	const cuenta: Partial<Record<Estado, number>> = {};
	for (const r of resultados) cuenta[r.estado] = (cuenta[r.estado] ?? 0) + 1;
	return { procesadas: resultados.length, ...cuenta };
}
