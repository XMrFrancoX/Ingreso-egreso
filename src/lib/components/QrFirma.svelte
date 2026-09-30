<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import QRCode from 'qrcode';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { contenidoQr, desfaseConServidor, RENOVAR_QR_S, type AppQr } from '$lib/qr';
	import { Maximize, RefreshCw, X } from '@lucide/svelte';

	// QR "de firma" que muestra el preceptor: se renueva solo cada minuto. Los alumnos lo
	// escanean para registrar su salida, entrada o retiro.
	let { app }: { app: AppQr } = $props();

	let desfase = 0;
	let imagen = $state('');
	let restante = $state(RENOVAR_QR_S);
	let completa = $state(false);
	let reloj: ReturnType<typeof setInterval> | undefined;
	let vista: HTMLDivElement | undefined = $state();

	async function renovar() {
		imagen = await QRCode.toDataURL(contenidoQr(app, desfase), {
			width: 512,
			margin: 2,
			color: { dark: '#0f2f6b', light: '#ffffff' }
		});
		restante = RENOVAR_QR_S;
	}

	// Muestra la capa y la pasa a pantalla completa; donde el navegador no lo permite
	// (iPhone) queda igual como capa encima de todo.
	async function pantallaCompleta() {
		if (completa) {
			if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
			completa = false;
			return;
		}
		completa = true;
		await tick();
		await vista?.requestFullscreen?.().catch(() => {});
	}

	function alCambiarPantalla() {
		if (!document.fullscreenElement) completa = false;
	}

	onMount(async () => {
		desfase = await desfaseConServidor();
		await renovar();
		reloj = setInterval(() => {
			restante -= 1;
			if (restante <= 0) void renovar();
		}, 1000);
		document.addEventListener('fullscreenchange', alCambiarPantalla);
	});
	onDestroy(() => {
		clearInterval(reloj);
		if (typeof document !== 'undefined') document.removeEventListener('fullscreenchange', alCambiarPantalla);
	});
</script>

<Card.Root class="gap-3">
	<Card.Header>
		<Card.Title>QR de firma</Card.Title>
		<Card.Description>Los alumnos lo escanean para registrarse. Se renueva cada minuto.</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col items-center gap-3">
		<div class="w-full max-w-56 rounded-xl bg-white p-2 ring-1 ring-border">
			{#if imagen}
				<img src={imagen} alt="QR de firma" class="w-full" />
			{:else}
				<div class="aspect-square"></div>
			{/if}
		</div>
		<p class="text-sm text-muted-foreground tabular-nums">Se renueva en {restante} s</p>
		<div class="grid w-full grid-cols-2 gap-2">
			<Button variant="outline" size="sm" onclick={renovar}>
				<RefreshCw />
				Nuevo código
			</Button>
			<Button size="sm" onclick={pantallaCompleta}>
				<Maximize />
				Pantalla completa
			</Button>
		</div>
	</Card.Content>
</Card.Root>

<!-- Vista para proyectar: siempre fondo blanco, el QR lo más grande posible. -->
<div
	bind:this={vista}
	class="{completa ? 'fixed inset-0 z-50 flex' : 'hidden'} flex-col items-center justify-center gap-6 bg-white p-6 text-center text-neutral-900"
>
	<h2 class="text-3xl font-bold md:text-5xl">Escaneá para registrarte</h2>
	{#if imagen}
		<img src={imagen} alt="QR de firma" class="aspect-square w-[min(80vw,70vh)]" />
	{/if}
	<p class="text-xl text-neutral-500 tabular-nums md:text-2xl">Se renueva en {restante} s</p>
	<Button variant="outline" onclick={pantallaCompleta} class="border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100">
		<X />
		Salir de pantalla completa
	</Button>
</div>
