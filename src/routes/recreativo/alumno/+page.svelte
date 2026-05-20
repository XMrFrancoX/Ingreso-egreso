<script>
	import { Html5Qrcode } from 'html5-qrcode';
	import { onMount, onDestroy } from 'svelte';
    import { supabase } from '$lib/supabaseClient';
    import { goto } from '$app/navigation';
	
	let session = $state(null);
	let loading = $state(true);
	
	let qrVerified = $state(false);
	let html5QrCode;
	let cameraError = $state('');

    let items = $state([]);
    let selectedItemIds = $state([]);
    let pendingMovimientos = $state([]);

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
            goto('/recreativo');
            return;
        }

		await syncTime();
        await Promise.all([cargarItems(), loadMisPendientes()]);
		
		if (!qrVerified) {
			setTimeout(startScanner, 500);
		}
	});

	onDestroy(async () => {
		if (html5QrCode && html5QrCode.isScanning) {
			await html5QrCode.stop().catch(e => console.error(e));
		}
	});

    async function cargarItems() {
        const { data, error } = await supabase
            .from('recreativo_items')
            .select('id, nombre')
            .eq('activo', true)
            .order('nombre');
        if (!error) items = data;
    }

    async function loadMisPendientes() {
        loading = true;
        const { data, error } = await supabase
            .from('recreativo_movimientos')
            .select('*, item:item_id(nombre)')
            .eq('perfil_id', session.user.id)
            .is('hora_devolucion', null)
            .order('fecha', { ascending: false });
        if (!error) pendingMovimientos = data;
        loading = false;
    }

	async function startScanner() {
		if (html5QrCode) return;
        
        if (!window.isSecureContext && window.location.hostname !== 'localhost') {
            cameraError = '⚠️ Error de Seguridad: El acceso a la cámara requiere HTTPS.';
            return;
        }

		html5QrCode = new Html5Qrcode("qr-reader");
        
        try {
            const config = { fps: 10, qrbox: { width: 250, height: 250 } };
            await html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess);
        } catch (err) {
            console.error("No se pudo iniciar la cámara:", err);
            cameraError = 'No se pudo acceder a la cámara. Asegúrate de dar permisos y usar HTTPS.';
        }
	}

	async function onScanSuccess(decodedText) {
		try {
			const data = JSON.parse(decodedText);
			// Aceptamos cualquier QR para facilitar
			if (data.app === 'recreativo' || data.app === 'comedor' || data.app === 'PP') {
				if (Math.abs((Date.now() + timeOffset) - data.timestamp) <= 300000) {
					qrVerified = true;
					if (html5QrCode && html5QrCode.isScanning) {
						await html5QrCode.stop().catch(e => console.error(e));
					}
				} else {
					alert('Código QR Expirado. Pídele al preceptor que genere uno nuevo.');
				}
			} else {
				alert('Código QR Inválido. Asegúrate de escanear un código válido de la escuela.');
			}
		} catch (e) {
			alert('Código QR Inválido. Formato no reconocido.');
		}
	}

	async function registrarRetiro() {
		if (selectedItemIds.length === 0) return alert('Por favor, selecciona al menos un ítem para retirar.');
		
		loading = true;
		const ahora = new Date();
		const hora_retiro = ahora.toTimeString().split(' ')[0];
		const fecha = ahora.toLocaleDateString('en-CA');

        const registros = selectedItemIds.map(id => ({
			perfil_id: session.user.id,
            item_id: id,
			fecha,
			hora_retiro
        }));

		const { error } = await supabase.from('recreativo_movimientos').insert(registros);
		
		if (error) {
			alert('Error al registrar retiro: ' + error.message);
			loading = false;
			return;
		}
		
		selectedItemIds = [];
		qrVerified = false;
		await loadMisPendientes();
		alert('Retiro registrado con éxito. Acercate al preceptor para recibir los ítems.');
        window.location.reload(); 
	}
</script>

<div class="row justify-content-center">
	<div class="col-md-8 col-lg-6 text-center">
		<h2 class="fw-bold philips-text mb-4">Retiro Recreativo</h2>

		{#if loading}
			<div class="spinner-border text-primary" role="status"></div>
		{:else}
            {#if pendingMovimientos.length > 0}
                <div class="alert alert-warning border-0 shadow-sm mb-4 text-start">
                    <h6 class="fw-bold mb-2">Tienes ítems sin devolver:</h6>
                    <ul class="mb-0 small">
                        {#each pendingMovimientos as mov}
                            <li><strong>{mov.item?.nombre}</strong> (Retirado a las {mov.hora_retiro.substring(0,5)})</li>
                        {/each}
                    </ul>
                    <p class="small text-muted mt-2 mb-0">Un preceptor debe registrar la devolución.</p>
                </div>
            {/if}

			<div class="card glass-card shadow-sm p-4 text-center">
				{#if !qrVerified}
					<div class="alert alert-info border-0 shadow-sm mb-4">
						<h6 class="fw-bold mb-1">Escáner de Retiro</h6>
						<p class="small mb-0">Escanea el QR del Preceptor para poder retirar un elemento.</p>
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
					<div class="bg-primary-subtle text-primary p-3 rounded mb-4 border border-primary-subtle">
						<h5 class="fw-bold mb-1">Punto de Control Verificado</h5>
						<p class="mb-0 small">Selecciona el ítem que deseas retirar.</p>
					</div>

					<h4 class="fw-semibold mb-3">Solicitar Ítems</h4>
					<p class="small text-muted mb-3">Selecciona los elementos que te vas a llevar:</p>
                    
					<div class="card p-3 mb-4 shadow-sm text-start" style="max-height: 250px; overflow-y: auto;">
						{#if items.length === 0}
							<p class="text-muted small mb-0">No hay ítems disponibles actualmente.</p>
						{/if}
                        {#each items as item}
							<div class="form-check mb-2">
								<input class="form-check-input" type="checkbox" value={item.id} id="item-{item.id}" bind:group={selectedItemIds}>
								<label class="form-check-label" for="item-{item.id}">
									{item.nombre}
								</label>
							</div>
                        {/each}
                    </div>

					<button class="btn btn-primary btn-lg w-100 fw-bold shadow-sm" onclick={registrarRetiro}>REGISTRAR RETIRO</button>
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
