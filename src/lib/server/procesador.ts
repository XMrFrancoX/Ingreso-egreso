import { env } from '$env/dynamic/private';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';

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

// Manda las tardes pendientes (y las que fallaron por conexión) de los últimos 14 días.
export async function enviarTardes(servicio: SupabaseClient<Database>) {
	if (!env.INTRANET_TARDES_TOKEN) throw new Error('Falta configurar INTRANET_TARDES_TOKEN');

	const desde = new Date(Date.now() - 14 * 24 * 60 * 60_000).toISOString();
	const { data, error } = await servicio
		.from('tardes_procesador')
		.select('registro_id, minutos, hora_fichada, perfil:perfiles(dni)')
		.in('estado', ['pendiente', 'error'])
		.lt('intentos', 10)
		.gt('hora_fichada', desde)
		.order('hora_fichada')
		.limit(POR_TANDA);
	if (error) throw new Error(error.message);

	const permitidos = dniPermitidos();
	const resultados: Resultado[] = [];
	for (let i = 0; i < data.length; i += EN_PARALELO) {
		const tanda = data.slice(i, i + EN_PARALELO).map(async (t): Promise<Resultado> => {
			const dni = (t.perfil?.dni ?? '').replace(/\D/g, '');
			if (!dni) return { registro_id: t.registro_id, estado: 'sin_dni', respuesta: 'El alumno no tiene DNI cargado.' };
			if (permitidos && !permitidos.has(dni)) {
				return { registro_id: t.registro_id, estado: 'omitido', respuesta: 'Develop: el DNI no está entre los de prueba, no se mandó.' };
			}
			return { registro_id: t.registro_id, ...(await mandar(dni, t.minutos, t.hora_fichada)) };
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
