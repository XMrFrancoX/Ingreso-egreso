<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Html5Qrcode } from 'html5-qrcode';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { desfaseConServidor, validarQr } from '$lib/qr';
	import { CameraOff, RefreshCw, ScanLine } from '@lucide/svelte';

	// Escáner del QR "de firma" del preceptor (cámara trasera). Llama a onValidado cuando lee
	// un QR vigente de la escuela; mientras tanto avisa si el código venció o no es válido.
	let { onValidado, ayuda = 'Escaneá el QR que muestra el preceptor.' }: { onValidado: () => void; ayuda?: string } = $props();

	const id = `qr-${Math.random().toString(36).slice(2)}`;
	let lector: Html5Qrcode | null = null;
	let desfase = 0;
	let errorCamara = $state('');
	let iniciando = $state(true);
	let ultimoAviso = { texto: '', cuando: 0 };

	async function iniciar() {
		errorCamara = '';
		iniciando = true;
		if (!window.isSecureContext) {
			errorCamara = 'La cámara necesita una conexión segura: la dirección tiene que empezar con https://';
			iniciando = false;
			return;
		}
		try {
			lector ??= new Html5Qrcode(id, { verbose: false });
			await lector.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, alLeer, () => {});
		} catch (e) {
			console.error('No se pudo iniciar la cámara:', e);
			errorCamara = 'No se pudo usar la cámara. Revisá que el navegador tenga permiso para usarla.';
		} finally {
			iniciando = false;
		}
	}

	async function detener() {
		if (lector?.isScanning) await lector.stop().catch(() => {});
	}

	async function alLeer(texto: string) {
		const r = validarQr(texto, desfase);
		if (r.ok) {
			await detener();
			onValidado();
			return;
		}
		// La cámara lee el mismo código varias veces por segundo: avisar una sola vez.
		const ahora = Date.now();
		if (r.motivo !== ultimoAviso.texto || ahora - ultimoAviso.cuando > 4000) {
			toast.error(r.motivo);
			ultimoAviso = { texto: r.motivo, cuando: ahora };
		}
	}

	onMount(async () => {
		desfase = await desfaseConServidor();
		await iniciar();
	});
	onDestroy(() => void detener());
</script>

<div class="grid gap-3">
	<p class="flex items-center justify-center gap-2 text-sm text-muted-foreground">
		<ScanLine class="size-4" />
		{ayuda}
	</p>
	<div class="relative aspect-square w-full overflow-hidden rounded-xl bg-black">
		<div {id} class="size-full [&_video]:size-full! [&_video]:object-cover!"></div>
		{#if iniciando && !errorCamara}
			<div class="absolute inset-0 grid place-items-center text-sm text-white/70">Abriendo la cámara…</div>
		{/if}
		{#if errorCamara}
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
				<CameraOff class="size-8 text-white/70" />
				<p class="text-sm">{errorCamara}</p>
				<Button variant="secondary" size="sm" onclick={iniciar}>
					<RefreshCw />
					Reintentar
				</Button>
			</div>
		{/if}
	</div>
</div>
