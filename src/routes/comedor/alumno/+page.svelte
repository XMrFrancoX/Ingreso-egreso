<script>
	import { Html5Qrcode } from 'html5-qrcode';
	import { onMount, onDestroy } from 'svelte';
    import { supabase } from '$lib/supabaseClient';
    import { goto } from '$app/navigation';
	
	let session = $state(null);
	let loading = $state(true);
	let pendingMovement = $state(null);
	let signature = $state('');
	
	let qrVerified = $state(false);
	let html5QrCode;
	let cameraError = $state('');

	let timeOffset = 0;

	async function syncTime() {
		try {
			const res = await fetch(window.location.origin + '/?_t=' + Date.now(), { method: 'HEAD' });
			const dateStr = res.headers.get('Date');
			if (dateStr) {
				timeOffset = new Date(dateStr).getTime() - Date.now();
			}
		} catch (e) {
			console.warn('Error sincronizando hora:', e);
		}
	}

	onMount(async () => {
        const { data } = await supabase.auth.getSession();
        session = data.session;
        if (!session) {
            goto('/comedor');
            return;
        }

		await syncTime();
		await checkPendingMovement();
		if (!qrVerified) {
			setTimeout(startScanner, 500);
		}
	});

	onDestroy(async () => {
		if (html5QrCode && html5QrCode.isScanning) {
			await html5QrCode.stop().catch(e => console.error(e));
		}
	});

	async function startScanner() {
		if (html5QrCode) return;
        
        if (!window.isSecureContext && window.location.hostname !== 'localhost') {
            cameraError = '⚠️ Error de Seguridad: El acceso a la cámara requiere HTTPS. Verifica que la URL empiece con https://';
            return;
        }

		html5QrCode = new Html5Qrcode("qr-reader");
        
        try {
            const config = { fps: 10, qrbox: { width: 250, height: 250 } };
            await html5QrCode.start(
                { facingMode: "environment" }, 
                config, 
                onScanSuccess
            );
        } catch (err) {
            console.error("No se pudo iniciar la cámara:", err);
            cameraError = 'No se pudo acceder a la cámara. Asegúrate de dar permisos y usar HTTPS.';
        }
	}

	async function onScanSuccess(decodedText) {
		try {
			const data = JSON.parse(decodedText);
			if (data.app === 'comedor') {
				// Allow up to 5 minutes (300000 ms) of difference to account for clock drift between devices
				if (Math.abs((Date.now() + timeOffset) - data.timestamp) <= 300000) {
					qrVerified = true;
					if (html5QrCode && html5QrCode.isScanning) {
						await html5QrCode.stop().catch(e => console.error(e));
					}
				} else {
					alert('Código QR Expirado. Pídele al preceptor que genere uno nuevo.');
				}
			} else {
				alert('Código QR Inválido. Asegúrate de escanear el código de comedor.');
			}
		} catch (e) {
			alert('Código QR Inválido. Formato no reconocido.');
		}
	}

	function onScanFailure(error) {
		// silent error
	}



	async function checkPendingMovement() {
		loading = true;
		const today = new Date().toLocaleDateString('en-CA');
		
		const { data, error } = await supabase
			.from('movimientos')
			.select('*')
			.eq('perfil_id', session.user.id)
			.eq('fecha', today)
			.is('hora_ingreso', null)
			.order('hora_salida', { ascending: false })
			.limit(1)
			.single();
			
		if (!error && data) {
			pendingMovement = data;
		} else {
			pendingMovement = null;
		}
		
		loading = false;
	}

	async function registrarSalida() {
		if (!signature.trim()) return alert('Por favor, escribe tu nombre completo.');
		
		loading = true;
		const ahora = new Date();
		const hora_salida = ahora.toTimeString().split(' ')[0];
		const fecha = ahora.toLocaleDateString('en-CA');

		const { error } = await supabase.from('movimientos').insert({
			perfil_id: session.user.id,
			fecha,
			hora_salida,
			firma_salida: signature.trim(),
			hora_ingreso: null,
			firma_ingreso: null
		});
		
		if (error) {
			alert('Error al registrar salida: ' + error.message);
			loading = false;
			return;
		}
		
		signature = '';
		qrVerified = false;
		await checkPendingMovement();
		alert('Salida registrada con éxito.');
        window.location.reload(); 
	}

	async function registrarIngreso() {
		if (!signature.trim()) return alert('Por favor, firma para confirmar tu vuelta.');
		
		loading = true;
		const ahora = new Date();
		const hora_ingreso = ahora.toTimeString().split(' ')[0];

		const { error } = await supabase
			.from('movimientos')
			.update({
				hora_ingreso: hora_ingreso,
				firma_ingreso: signature.trim()
			})
			.eq('id', pendingMovement.id);

		if (error) {
			alert('Error al registrar ingreso: ' + error.message);
			loading = false;
			return;
		}

		signature = '';
		pendingMovement = null;
		qrVerified = false;
		loading = false;
		alert('Ingreso registrado correctamente.');
        window.location.href = '/comedor';
	}
</script>

<div class="row justify-content-center">
	<div class="col-md-8 col-lg-6 text-center">
		<h2 class="fw-bold philips-text mb-4">Registro de Alumno</h2>

		{#if loading}
			<div class="spinner-border text-primary" role="status"></div>
		{:else}
			<div class="card glass-card shadow-sm p-4 text-center">
				{#if !qrVerified}
					<div class="alert alert-info border-0 shadow-sm mb-4">
						<h6 class="fw-bold mb-1">Punto de Control</h6>
						<p class="small mb-0">Escanea el QR del Preceptor para poder realizar el trámite.</p>
					</div>

					<div id="qr-reader" class="mb-3 overflow-hidden border border-primary rounded shadow-sm bg-black" style="min-height: 250px;">
						{#if cameraError}
							<div class="p-4 text-white d-flex flex-column align-items-center justify-content-center h-100">
								<p class="mb-3 text-warning">{cameraError}</p>
								<button class="btn btn-outline-light btn-sm" onclick={() => window.location.reload()}>REINTENTAR</button>
							</div>
						{/if}
					</div>
					

				{:else}
					{#if pendingMovement}
						<div class="bg-warning-subtle text-warning-emphasis p-3 rounded mb-4 border border-warning-subtle">
							<h5 class="fw-bold mb-1">Actualmente: FUERA</h5>
							<p class="mb-0 small text-muted">Salida registrada a las {pendingMovement.hora_salida}</p>
						</div>

						<h4 class="fw-semibold mb-3">Registrar Regreso</h4>
						<input type="text" class="form-control form-control-lg text-center bg-light border-0 mb-3" bind:value={signature} placeholder="Tu firma aquí...">
						<button class="btn btn-primary btn-lg w-100 fw-bold shadow-sm" onclick={registrarIngreso}>CONFIRMAR INGRESO</button>
					{:else}
						<div class="bg-success-subtle text-success-emphasis p-3 rounded mb-4 border border-success-subtle">
							<h5 class="fw-bold mb-1">Estado: DENTRO</h5>
							<p class="mb-0 small text-muted">Listo para registrar salida de almuerzo.</p>
						</div>

						<h4 class="fw-semibold mb-3">Registrar Salida</h4>
						<input type="text" class="form-control form-control-lg text-center bg-light border-0 mb-3" bind:value={signature} placeholder="Tu firma aquí...">
						<button class="btn btn-warning btn-lg w-100 fw-bold shadow-sm" onclick={registrarSalida}>REGISTRAR SALIDA</button>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	:global(#qr-reader video) {
		object-fit: cover !important;
	}
</style>
