import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Los endpoints de /api/cron/* los llama la base (pg_cron + pg_net) con
// "Authorization: Bearer <CRON_SECRET>"; la misma clave está en Vault (ingresos_cron_secret).
// Sin la variable configurada no corre nada.
//
// Devuelve una Response si hay que cortar (401/500, o el ping de prueba), o null si sigue.
export function autorizarCron(request: Request, url: URL): Response | null {
	const secreto = env.CRON_SECRET;
	if (!secreto) return json({ error: 'Falta configurar CRON_SECRET' }, { status: 500 });

	const header = request.headers.get('authorization') ?? '';
	const recibido = header.startsWith('Bearer ') ? header.slice(7) : '';
	if (!igualesEnTiempoConstante(recibido, secreto)) {
		return json({ error: 'No autorizado' }, { status: 401 });
	}

	// ?ping: sólo confirma que la clave es correcta, sin ejecutar la tarea.
	if (url.searchParams.has('ping')) return json({ ok: true, ping: true });

	return null;
}

// Sin node:crypto (el proyecto de Cloudflare no tiene nodejs_compat): recorre siempre
// todo el secreto para no revelar por el tiempo de respuesta cuántos caracteres coinciden.
function igualesEnTiempoConstante(a: string, b: string) {
	let diff = a.length ^ b.length;
	for (let i = 0; i < b.length; i++) diff |= (a.charCodeAt(i) || 0) ^ b.charCodeAt(i);
	return diff === 0;
}
