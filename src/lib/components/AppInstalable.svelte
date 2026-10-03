<script lang="ts">
	import { onMount } from 'svelte';
	import { updated } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { instalacion } from '$lib/pwa.svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Check, Download, Share, SquarePlus, X } from '@lucide/svelte';

	// La app instalable (PWA), dentro del marco de la app:
	// 1. Ofrece instalarla: una franja arriba del contenido sólo en pantallas táctiles (se puede
	//    cerrar y no vuelve) y, en iPhone, los pasos de Safari. En compu queda el ítem
	//    "Instalar app" del menú del usuario.
	// 2. Avisa cuando se publica una versión nueva. Las pestañas que quedan abiertas días en el
	//    celular seguían usando la versión vieja (así se escribió en la base vieja de Ingresos
	//    después del cambio): en el celular, al volver a la app después de un rato, si hay
	//    versión nueva se recarga sola; si no (o en compu), queda el aviso con "Actualizar".
	const CLAVE_CERRADA = 'app-instalable-cerrada';
	const AUSENCIA_MS = 60_000;

	let cerrada = $state(true);
	let tactil = $state(false);

	const hayDialogoAbierto = () =>
		document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]') !== null;

	onMount(() => {
		instalacion.iniciar();
		tactil = matchMedia('(pointer: coarse)').matches;
		try {
			cerrada = localStorage.getItem(CLAVE_CERRADA) === '1';
		} catch {
			cerrada = false;
		}

		let ocultaDesde = 0;
		const alCambiarVisibilidad = async () => {
			if (document.visibilityState === 'hidden') {
				ocultaDesde = Date.now();
				return;
			}
			const estuvoAfuera = ocultaDesde > 0 && Date.now() - ocultaDesde >= AUSENCIA_MS;
			if (!estuvoAfuera || !(await updated.check())) return;
			if (tactil && !hayDialogoAbierto()) location.reload();
		};
		document.addEventListener('visibilitychange', alCambiarVisibilidad);
		return () => document.removeEventListener('visibilitychange', alCambiarVisibilidad);
	});

	$effect(() => {
		if (!updated.current) return;
		toast.info('Hay una versión nueva de la app', {
			id: 'version-nueva',
			duration: Infinity,
			action: { label: 'Actualizar', onClick: () => location.reload() }
		});
	});

	function cerrar() {
		cerrada = true;
		try {
			localStorage.setItem(CLAVE_CERRADA, '1');
		} catch {
			// sin almacenamiento (modo privado): se vuelve a mostrar la próxima vez
		}
	}
</script>

{#if instalacion.disponible && tactil && !cerrada}
	<div class="flex items-center gap-3 border-b bg-primary/5 px-4 py-2.5 text-sm">
		<Download class="size-4 shrink-0 text-primary" />
		<p class="min-w-0 flex-1">Instalá la app para abrirla desde el inicio del celular.</p>
		<Button size="sm" onclick={() => instalacion.instalar()}>Instalar</Button>
		<Button variant="ghost" size="icon-sm" class="-mr-2" aria-label="No mostrar más" onclick={cerrar}>
			<X />
		</Button>
	</div>
{/if}

<Dialog.Root bind:open={instalacion.mostrarPasosIOS}>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Instalar en el iPhone</Dialog.Title>
			<Dialog.Description>Desde Safari, en tres pasos:</Dialog.Description>
		</Dialog.Header>
		<ol class="grid gap-3 text-sm">
			<li class="flex items-center gap-3">
				<span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted"><Share class="size-4" /></span>
				<span>Tocá <strong>Compartir</strong> en la barra de Safari.</span>
			</li>
			<li class="flex items-center gap-3">
				<span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted"><SquarePlus class="size-4" /></span>
				<span>Elegí <strong>Agregar a inicio</strong> (si no aparece, deslizá la lista hacia abajo).</span>
			</li>
			<li class="flex items-center gap-3">
				<span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted"><Check class="size-4" /></span>
				<span>Tocá <strong>Agregar</strong>: la app queda en tu pantalla de inicio.</span>
			</li>
		</ol>
		<Dialog.Footer>
			<Button onclick={() => (instalacion.mostrarPasosIOS = false)}>Entendido</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
