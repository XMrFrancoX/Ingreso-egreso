/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Service worker de la app instalable (SvelteKit lo registra solo, en producción).
// - Guarda el JS/CSS de cada versión y los archivos de static/ para que la app abra rápido.
// - Las páginas se piden siempre a la red (los datos vienen de Supabase y sin red no sirven);
//   si no hay conexión, muestra un aviso en vez de la pantalla de error del navegador.
// - No toca pedidos a otros dominios (Supabase, Google) ni nada que no sea GET.
// OJO: borrar este archivo NO saca el service worker de los celulares que ya lo tienen (el
// navegador se queda con el instalado); para sacarlo hay que publicar uno que se desregistre.
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `app-${version}`;
const ARCHIVOS = [...build, ...files];
const GUARDADOS = new Set(ARCHIVOS);

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ARCHIVOS))
			.then(() => sw.skipWaiting())
	);
});

// La versión nueva toma el control enseguida y borra lo guardado de las anteriores.
sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const clave of await caches.keys()) {
				if (clave !== CACHE) await caches.delete(clave);
			}
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;

	if (GUARDADOS.has(url.pathname)) {
		event.respondWith(caches.match(url.pathname).then((guardado) => guardado ?? fetch(request)));
		return;
	}
	if (request.mode === 'navigate') {
		event.respondWith(fetch(request).catch(() => sinConexion()));
	}
});

function sinConexion() {
	const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sin conexión</title>
<style>
	:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
	body { margin: 0; min-height: 100svh; display: grid; place-items: center; padding: 24px; box-sizing: border-box;
		background: #fff; color: #171717; text-align: center; }
	@media (prefers-color-scheme: dark) { body { background: #07090f; color: #f4f5f7; } p { color: #9ca3af; } }
	h1 { font-size: 1.25rem; margin: 0 0 8px; }
	p { margin: 0 0 20px; color: #6b7280; }
	button { font: inherit; font-weight: 500; border: 0; border-radius: 8px; padding: 10px 18px; background: #0033a0; color: #fff; }
</style>
</head>
<body>
<main>
	<h1>Sin conexión</h1>
	<p>La app necesita internet. Revisá el wifi o los datos y probá de nuevo.</p>
	<button onclick="location.reload()">Reintentar</button>
</main>
</body>
</html>`;
	return new Response(html, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
