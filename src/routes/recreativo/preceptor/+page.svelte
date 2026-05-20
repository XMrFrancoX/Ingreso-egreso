<script>
	import { onMount, onDestroy } from 'svelte';
	import QRCode from 'qrcode';
    import { supabase } from '$lib/supabaseClient';
    import { goto } from '$app/navigation';

    let session = $state(null);
	let movimientos = $state([]);
    let items = $state([]);
    let alumnos = $state([]);
	let interval;
	let qrInterval;
	let qrToken = $state('');
	let qrDataURL = $state('');
    let selectedDate = $state(new Date().toLocaleDateString('en-CA'));
	let timeLeft = $state(60);
	let timerInterval;
	let errorMsg = $state('');

    // Modal Retiro Manual
    let selectedAlumnoId = $state('');
    let selectedItemId = $state('');
    let isAuthorizing = $state(false);

    // Modal Devolución
    let devolucionMovId = $state('');
    let devolucionEstado = $state('Bueno');
    let devolucionObservaciones = $state('');
    let isReturning = $state(false);

	let timeOffset = 0;
	let isFullScreen = $state(false);

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
		await Promise.all([loadMovimientos(), cargarAlumnos(), cargarItems()]);
		interval = setInterval(loadMovimientos, 5000); 
		
		createNewQR();
		timerInterval = setInterval(() => {
			timeLeft--;
			if (timeLeft <= 0) createNewQR();
		}, 1000);

		document.addEventListener('fullscreenchange', () => {
			isFullScreen = !!document.fullscreenElement;
		});
	});

	onDestroy(() => {
		if (interval) clearInterval(interval);
		if (timerInterval) clearInterval(timerInterval);
	});

	async function loadMovimientos() {
		const { data, error } = await supabase
            .from('recreativo_movimientos')
            .select(`
                *,
                perfiles:perfil_id (email, curso:curso_id(nombre)),
                item:item_id (nombre)
            `)
            .eq('fecha', selectedDate)
            .order('hora_retiro', { ascending: false });

        if (error) {
            console.error('Error cargando movimientos:', error);
			errorMsg = 'Error al cargar datos: ' + error.message;
        } else {
            movimientos = data;
			errorMsg = '';
        }
	}

    async function cargarAlumnos() {
        const { data, error } = await supabase
            .from('perfiles')
            .select('id, email, curso:curso_id(nombre)')
            .eq('rol', 'student')
            .order('email');
        if (!error) alumnos = data;
    }

    async function cargarItems() {
        const { data, error } = await supabase
            .from('recreativo_items')
            .select('id, nombre')
            .eq('activo', true)
            .order('nombre');
        if (!error) items = data;
    }

	function createNewQR() {
		const payload = { app: 'recreativo', timestamp: Date.now() + timeOffset };
		const newToken = JSON.stringify(payload);
		qrToken = 'QR Dinámico Activo';
		generateQRCode(newToken);
		timeLeft = 60;
	}

	async function generateQRCode(text) {
		try {
			qrDataURL = await QRCode.toDataURL(text, {
				width: 300, margin: 2, color: { dark: '#0B5EAA', light: '#ffffff' }
			});
		} catch (err) {
			console.error('Error generando QR:', err);
		}
	}

	function toggleFullScreen() {
		const elem = document.getElementById('fullscreen-qr-view');
		if (!document.fullscreenElement) {
			elem?.requestFullscreen().catch(err => console.error(err));
		} else {
			document.exitFullscreen();
		}
	}

    async function registrarRetiroManual() {
        if (!selectedAlumnoId || !selectedItemId) return alert('Seleccioná un alumno y un ítem');
        
        isAuthorizing = true;
        const ahora = new Date();
        const hora = ahora.toTimeString().split(' ')[0];
        const fecha = ahora.toLocaleDateString('en-CA');

        const { error: err } = await supabase
            .from('recreativo_movimientos')
            .insert({
                perfil_id: selectedAlumnoId,
                item_id: selectedItemId,
                fecha,
                hora_retiro: hora,
                preceptor_retiro_id: session.user.id
            });

        if (err) {
            alert('Error: ' + err.message);
        } else {
            selectedAlumnoId = '';
            selectedItemId = '';
            await loadMovimientos();
            const modal = document.getElementById('autorizarModal');
            bootstrap.Modal.getInstance(modal).hide();
        }
        isAuthorizing = false;
    }

    function abrirModalDevolucion(movId) {
        devolucionMovId = movId;
        devolucionEstado = 'Bueno';
        devolucionObservaciones = '';
        const modal = new bootstrap.Modal(document.getElementById('devolucionModal'));
        modal.show();
    }

    async function registrarDevolucion() {
        isReturning = true;
        const ahora = new Date();
        const hora = ahora.toTimeString().split(' ')[0];

        const { error: err } = await supabase
            .from('recreativo_movimientos')
            .update({ 
                hora_devolucion: hora,
                preceptor_devolucion_id: session.user.id,
                estado_devolucion: devolucionEstado,
                observaciones: devolucionObservaciones
            })
            .eq('id', devolucionMovId);

        if (err) {
            alert('Error: ' + err.message);
        } else {
            await loadMovimientos();
            const modal = document.getElementById('devolucionModal');
            bootstrap.Modal.getInstance(modal).hide();
        }
        isReturning = false;
    }

</script>

<svelte:head>
	<title>Panel Preceptor Recreativo - Escuela Philips</title>
</svelte:head>

<div class="row mb-4 align-items-center">
	<div class="col-md-5">
		<h2 class="fw-bold philips-text mb-1">Control Recreativo</h2>
		<p class="text-muted small mb-0">Gestión de préstamos en tiempo real</p>
	</div>
    <div class="col-md-3">
        <div class="input-group input-group-sm shadow-sm">
            <span class="input-group-text bg-white border-end-0">Fecha:</span>
            <input type="date" class="form-control border-start-0" bind:value={selectedDate} onchange={() => loadMovimientos()}>
        </div>
    </div>
	<div class="col-md-4 text-md-end mt-3 mt-md-0 d-flex gap-2 justify-content-md-end">
		<a href="/recreativo/admin" class="btn btn-outline-secondary fw-bold px-3 shadow-sm d-flex align-items-center gap-2">
			CONFIG
		</a>
		<button class="btn btn-warning fw-bold px-3 shadow-sm" data-bs-toggle="modal" data-bs-target="#autorizarModal">
			RETIRO MANUAL
		</button>
		<button class="btn btn-primary fw-bold px-3 shadow-sm" data-bs-toggle="modal" data-bs-target="#qrModal" onclick={createNewQR}>
			QR DE RETIRO
		</button>
	</div>
</div>

{#if errorMsg}
	<div class="alert alert-danger border-0 rounded-3 mb-4">{errorMsg}</div>
{/if}

<!-- Modal Retiro Manual -->
<div class="modal fade" id="autorizarModal" tabindex="-1" aria-hidden="true">
	<div class="modal-dialog modal-dialog-centered">
		<div class="modal-content glass-card border-0">
			<div class="modal-header border-0 pb-0">
				<h5 class="modal-title fw-bold philips-text w-100 text-center">Registrar Retiro</h5>
				<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
			</div>
			<div class="modal-body py-4">
				<div class="mb-3">
					<label class="form-label small fw-bold text-muted">ALUMNO</label>
					<select class="form-select" bind:value={selectedAlumnoId}>
						<option value="">Buscar alumno...</option>
						{#each alumnos as a}
							<option value={a.id}>{a.email} ({a.curso?.nombre || 'Sin curso'})</option>
						{/each}
					</select>
				</div>
                <div class="mb-4">
					<label class="form-label small fw-bold text-muted">ÍTEM A RETIRAR</label>
					<select class="form-select" bind:value={selectedItemId}>
						<option value="">Seleccionar ítem...</option>
						{#each items as i}
							<option value={i.id}>{i.nombre}</option>
						{/each}
					</select>
				</div>
                <button 
                    class="btn btn-primary w-100 fw-bold shadow-sm" 
                    onclick={registrarRetiroManual}
                    disabled={isAuthorizing || !selectedAlumnoId || !selectedItemId}
                >
                    {#if isAuthorizing}
                        <span class="spinner-border spinner-border-sm me-2"></span> Procesando...
                    {:else}
                        CONFIRMAR RETIRO
                    {/if}
                </button>
			</div>
		</div>
	</div>
</div>

<!-- Modal Devolución -->
<div class="modal fade" id="devolucionModal" tabindex="-1" aria-hidden="true">
	<div class="modal-dialog modal-dialog-centered">
		<div class="modal-content glass-card border-0">
			<div class="modal-header border-0 pb-0">
				<h5 class="modal-title fw-bold philips-text w-100 text-center">Registrar Devolución</h5>
				<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
			</div>
			<div class="modal-body py-4">
				<div class="mb-3">
					<label class="form-label small fw-bold text-muted">ESTADO DEL ÍTEM</label>
					<select class="form-select" bind:value={devolucionEstado}>
						<option value="Bueno">Bueno / Intacto</option>
						<option value="Roto">Roto / Dañado</option>
						<option value="Perdido">Perdido / Incompleto</option>
					</select>
				</div>
                <div class="mb-4">
					<label class="form-label small fw-bold text-muted">OBSERVACIONES (Opcional)</label>
                    <textarea class="form-control" rows="2" bind:value={devolucionObservaciones} placeholder="Detalles sobre el estado..."></textarea>
				</div>
                <button 
                    class="btn btn-success w-100 fw-bold shadow-sm" 
                    onclick={registrarDevolucion}
                    disabled={isReturning}
                >
                    {#if isReturning}
                        <span class="spinner-border spinner-border-sm me-2"></span> Guardando...
                    {:else}
                        CONFIRMAR DEVOLUCIÓN
                    {/if}
                </button>
			</div>
		</div>
	</div>
</div>

<div class="modal fade" id="qrModal" tabindex="-1" aria-hidden="true">
	<div class="modal-dialog modal-dialog-centered">
		<div class="modal-content glass-card border-0">
			<div class="modal-header border-0 pb-0">
				<h5 class="modal-title fw-bold philips-text w-100 text-center">QR Retiro Recreativo</h5>
				<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
			</div>
			<div class="modal-body text-center py-4">
				<p class="text-muted small mb-3">Los alumnos esanean esto para solicitar un ítem.</p>
				{#if qrDataURL}
					<img src={qrDataURL} alt="QR de Acceso" class="img-fluid shadow-sm border rounded mb-3" style="max-width: 250px;" />
				{/if}
				<div class="bg-light p-2 rounded fw-bold text-danger mb-3">
					Expira en: {timeLeft} s
				</div>
                <div class="d-flex justify-content-center gap-2 mt-3">
                    <button class="btn btn-dark btn-sm" onclick={toggleFullScreen}>⛶ Pantalla Completa</button>
                </div>
			</div>
		</div>
	</div>
</div>

<div class="card glass-card shadow-sm border-0 overflow-hidden">
	<div class="table-responsive">
		<table class="table table-hover mb-0 align-middle">
			<thead class="table-light text-muted small text-uppercase">
				<tr>
					<th class="ps-4">Alumno</th>
					<th>Ítem</th>
					<th>Hora Retiro</th>
					<th>Devolución</th>
					<th class="pe-4 text-center">Acción / Estado</th>
				</tr>
			</thead>
			<tbody>
				{#if movimientos.length === 0}
					<tr><td colspan="5" class="py-5 text-center text-muted">No hay movimientos registrados hoy.</td></tr>
				{:else}
					{#each movimientos as mov (mov.id)}
						<tr>
							<td class="ps-4">
								<div class="fw-medium text-primary small">{mov.perfiles?.email || 'Desconocido'}</div>
							</td>
							<td class="small fw-bold">{mov.item?.nombre || '—'}</td>
							<td><span class="badge bg-light text-dark border-0 fw-normal">{mov.hora_retiro.substring(0,5)}</span></td>
							<td>
								{#if mov.hora_devolucion}
									<span class="badge bg-light text-dark border">{mov.hora_devolucion.substring(0,5)}</span>
								{:else}
									<span class="text-muted">—</span>
								{/if}
							</td>
							<td class="pe-4 text-center">
								{#if !mov.hora_devolucion}
                                    <button class="btn btn-sm btn-outline-success fw-bold rounded-pill px-3" onclick={() => abrirModalDevolucion(mov.id)}>
                                        Marcar Devolución
                                    </button>
								{:else}
                                    {#if mov.estado_devolucion === 'Bueno'}
									    <span class="badge bg-success-subtle text-success border border-success-subtle px-2">Devuelto: Bueno</span>
                                    {:else if mov.estado_devolucion === 'Roto'}
									    <span class="badge bg-danger-subtle text-danger border border-danger-subtle px-2" title={mov.observaciones}>Devuelto: Roto</span>
                                    {:else}
									    <span class="badge bg-warning-subtle text-warning border border-warning-subtle px-2" title={mov.observaciones}>Devuelto: {mov.estado_devolucion}</span>
                                    {/if}
								{/if}
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</div>

<!-- FULLSCREEN VIEW -->
<div id="fullscreen-qr-view" class="bg-white flex-column justify-content-center align-items-center text-center" style="display: {isFullScreen ? 'flex' : 'none'} !important; width: 100vw; height: 100vh;">
	{#if isFullScreen}
		<h1 class="fw-bold philips-text mb-4" style="font-size: 4vw;">Recreativo</h1>
		<p class="text-muted fs-4 mb-4">Escaneá este código para retirar un ítem.</p>
		<img src={qrDataURL} alt="QR" style="width: 50vw; max-width: 50vh; object-fit: contain;" class="shadow-lg border rounded p-4 mb-4 bg-white" />
		<h2 class="fw-bold text-danger mb-5" style="font-size: 3vw;">Expira en: {timeLeft}s</h2>
		<button class="btn btn-outline-secondary btn-lg" onclick={toggleFullScreen}>Salir de Pantalla Completa</button>
	{/if}
</div>
