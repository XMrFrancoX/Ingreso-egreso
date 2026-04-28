<script>
	import { onMount, onDestroy } from 'svelte';
	import QRCode from 'qrcode';
    import { supabase } from '$lib/supabaseClient';
    import { goto } from '$app/navigation';

    let session = $state(null);
	let movimientos = $state([]);
	let interval;
	let qrToken = $state('');
	let qrDataURL = $state('');
    let selectedDate = $state(new Date().toLocaleDateString('en-CA'));

	let totalSalidas = $derived(movimientos.length);
	let pendingReturns = $derived(movimientos.filter(m => !m.hora_ingreso).length);
	let completedReturns = $derived(movimientos.filter(m => m.hora_ingreso).length);

	onMount(async () => {
        const { data } = await supabase.auth.getSession();
        session = data.session;
        if (!session) {
            goto('/');
            return;
        }

		await loadMovimientos();
		interval = setInterval(loadMovimientos, 5000); // Polling cada 5 segundos
		
		const existingToken = localStorage.getItem('active_qr_token') || 'PHILIPS-DEMO';
		qrToken = existingToken;
		generateQRCode(existingToken);
	});

	onDestroy(() => {
		if (interval) clearInterval(interval);
	});

	async function loadMovimientos() {
		const { data, error } = await supabase
            .from('movimientos')
            .select(`
                *,
                perfiles:perfil_id (email)
            `)
            .eq('fecha', selectedDate)
            .order('hora_salida', { ascending: false });

        if (error) {
            console.error('Error cargando movimientos:', error);
        } else {
            movimientos = data;
        }
	}

	function createNewQR() {
		const newToken = 'PHILIPS-' + Math.random().toString(36).substring(2, 8).toUpperCase();
		qrToken = newToken;
		localStorage.setItem('active_qr_token', newToken);
		generateQRCode(newToken);
	}

	async function generateQRCode(text) {
		console.log('Generando QR para:', text);
		try {
			qrDataURL = await QRCode.toDataURL(text, {
				width: 300,
				margin: 2,
				color: {
					dark: '#0B5EAA',
					light: '#ffffff'
				}
			});
			console.log('QR generado con éxito');
		} catch (err) {
			console.error('Error generando QR:', err);
		}
	}
</script>

<svelte:head>
	<title>Panel Preceptor - Escuela Philips</title>
</svelte:head>

<div class="row mb-4 align-items-center">
	<div class="col-md-5">
		<h2 class="fw-bold philips-text mb-1">Panel de Preceptor</h2>
		<p class="text-muted small mb-0">Gestión de alumnos en tiempo real</p>
	</div>
    <div class="col-md-3">
        <div class="input-group input-group-sm shadow-sm">
            <span class="input-group-text bg-white border-end-0">📅 Fecha:</span>
            <input type="date" class="form-control border-start-0" bind:value={selectedDate} onchange={loadMovimientos}>
        </div>
    </div>
	<div class="col-md-4 text-md-end mt-3 mt-md-0">
		<button class="btn btn-primary fw-bold px-3 shadow-sm" data-bs-toggle="modal" data-bs-target="#qrModal" onclick={createNewQR}>
			GENERAR QR DE SALIDA
		</button>
	</div>
</div>

{#if qrToken}
<div class="row mb-4 justify-content-center">
    <div class="col-md-4">
        <div class="card glass-card text-center p-3">
            <p class="text-muted small mb-1">Código Activo</p>
            <h5 class="fw-bold philips-text mb-2">{qrToken}</h5>
            {#if qrDataURL}
                <img src={qrDataURL} alt="QR" class="img-fluid mx-auto mb-2" style="max-width: 150px;" />
            {/if}
            <p class="small text-muted mb-0">Usa este código para la demo</p>
        </div>
    </div>
</div>
{/if}
<div class="modal fade" id="qrModal" tabindex="-1" aria-hidden="true">
	<div class="modal-dialog modal-dialog-centered">
		<div class="modal-content glass-card border-0">
			<div class="modal-header border-0 pb-0">
				<h5 class="modal-title fw-bold philips-text w-100 text-center">QR de Control Philips</h5>
				<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
			</div>
			<div class="modal-body text-center py-4">
				<p class="text-muted small mb-3">Muestra este código a los alumnos para que validen su ubicación antes de firmar.</p>
				{#if qrDataURL}
					<img src={qrDataURL} alt="QR de Acceso" class="img-fluid shadow-sm border rounded mb-3" style="max-width: 250px;" />
				{:else}
					<div class="p-5 text-muted small">Generando código...</div>
				{/if}
				<div class="bg-light p-2 rounded fw-bold font-monospace">
					{qrToken}
				</div>
                <button class="btn btn-outline-primary btn-sm mt-3" onclick={createNewQR}>Generar otro código</button>
			</div>
		</div>
	</div>
</div>

<!-- Resumen -->
<div class="row mb-4">
	<div class="col-md-4">
		<div class="card glass-card text-center p-3 border-0 shadow-sm mb-3">
			<h5 class="text-muted small fw-bold mb-1">TOTAL SALIDAS HOY</h5>
			<h2 class="fw-bold mb-0 text-primary">{totalSalidas}</h2>
		</div>
	</div>
	<div class="col-md-4">
		<div class="card glass-card text-center p-3 border-0 shadow-sm mb-3" style="background-color: #fff3cd;">
			<h5 class="text-muted small fw-bold mb-1" style="color: #664d03 !important;">AFUERA</h5>
			<h2 class="fw-bold mb-0" style="color: #664d03;">{pendingReturns}</h2>
		</div>
	</div>
	<div class="col-md-4">
		<div class="card glass-card text-center p-3 border-0 shadow-sm mb-3" style="background-color: #d1e7dd;">
			<h5 class="text-muted small fw-bold mb-1" style="color: #0f5132 !important;">YA VOLVIERON</h5>
			<h2 class="fw-bold mb-0" style="color: #0f5132;">{completedReturns}</h2>
		</div>
	</div>
</div>

<!-- Tabla -->
<div class="card glass-card shadow-sm border-0 overflow-hidden">
	<div class="table-responsive">
		<table class="table table-hover mb-0 align-middle">
			<thead class="table-light text-muted small text-uppercase">
				<tr>
					<th class="ps-4">Alumno</th>
					<th>Hora Salida</th>
					<th>Firma Salida</th>
					<th>Hora Ingreso</th>
					<th class="pe-4">Estado</th>
				</tr>
			</thead>
			<tbody>
				{#if movimientos.length === 0}
					<tr><td colspan="5" class="py-5 text-center text-muted">No hay movimientos registrados hoy.</td></tr>
				{:else}
					{#each movimientos as mov (mov.id)}
						<tr>
							<td class="ps-4 fw-medium text-primary">{mov.perfiles?.email || 'Desconocido'}</td>
							<td><span class="badge bg-light text-dark border">{mov.hora_salida.substring(0,5)}</span></td>
							<td class="text-muted small italic">{mov.firma_salida}</td>
							<td>
								{#if mov.hora_ingreso}
									<span class="badge bg-success">{mov.hora_ingreso.substring(0,5)}</span>
								{:else}
									<span class="text-muted">-</span>
								{/if}
							</td>
							<td class="pe-4">
								{#if mov.hora_ingreso}
									<span class="badge rounded-pill bg-success-subtle text-success border border-success-subtle px-3">En Escuela</span>
								{:else}
									<span class="badge rounded-pill bg-warning-subtle text-warning-emphasis border border-warning-subtle px-3">Ausente</span>
								{/if}
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</div>
