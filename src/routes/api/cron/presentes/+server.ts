import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { autorizarCron } from '$lib/server/cron';
import { clienteServicio } from '$lib/server/procesador';
import { revisarPresentes } from '$lib/server/presentes';

// Cada 10 minutos de 12 a 20 (pg_cron, public.disparar_presentes_pp): mira a qué hora el docente
// les puso el presente a los pasantes que ficharon hoy y anota las tardes que correspondan.
// ?simular → sólo dice qué haría, sin escribir nada. ?fecha=AAAA-MM-DD → otro día (para probar).
export const GET: RequestHandler = async ({ request, url }) => {
	const corte = autorizarCron(request, url);
	if (corte) return corte;

	const servicio = clienteServicio();
	if (typeof servicio === 'string') return json({ error: servicio }, { status: 500 });

	const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
	const fecha = url.searchParams.get('fecha') ?? hoy;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return json({ error: 'fecha inválida' }, { status: 400 });

	try {
		return json(await revisarPresentes(servicio, fecha, url.searchParams.has('simular')));
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
	}
};
