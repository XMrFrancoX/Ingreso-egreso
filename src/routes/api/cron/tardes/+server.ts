import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { autorizarCron } from '$lib/server/cron';
import { clienteServicio, enviarTardes } from '$lib/server/procesador';

// Cada 5 minutos, si hay tardes por mandar (pg_cron, public.disparar_tardes_procesador): las
// manda al procesador de asistencias y guarda qué respondió. ?simular → sólo dice qué mandaría.
export const GET: RequestHandler = async ({ request, url }) => {
	const corte = autorizarCron(request, url);
	if (corte) return corte;

	const servicio = clienteServicio();
	if (typeof servicio === 'string') return json({ error: servicio }, { status: 500 });
	try {
		return json(await enviarTardes(servicio, url.searchParams.has('simular')));
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
	}
};
