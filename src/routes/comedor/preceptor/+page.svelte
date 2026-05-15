<script>
	import { onMount, onDestroy } from 'svelte';
	import QRCode from 'qrcode';
    import { supabase } from '$lib/supabaseClient';
    import { goto } from '$app/navigation';

    let session = $state(null);
	let movimientos = $state([]);
	let interval;
	let qrInterval;
	let qrToken = $state('');
	let qrDataURL = $state('');
    let selectedDate = $state(new Date().toLocaleDateString('en-CA'));
	let timeLeft = $state(60);
	let timerInterval;
	let errorMsg = $state('');

    let alumnos = $state([]);
    let selectedAlumnoId = $state('');
    let isAuthorizing = $state(false);

	let totalSalidas = $derived(movimientos.length);
	let pendingReturns = $derived(movimientos.filter(m => !m.hora_ingreso).length);
	let completedReturns = $derived(movimientos.filter(m => m.hora_ingreso).length);

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
            goto('/comedor');
            return;
        }

		await syncTime();
		await Promise.all([loadMovimientos(), cargarAlumnos()]);
		interval = setInterval(loadMovimientos, 5000); // Polling cada 5 segundos
		
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
            .from('movimientos')
            .select(`
                *,
                perfiles:perfil_id (
					email,
					curso:curso_id (
						nombre,
						horarios:cursos_horarios (dia, hora_regreso)
					)
				)
            `)
            .eq('fecha', selectedDate)
            .order('hora_salida', { ascending: false });

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
        if (error) console.error('Error cargando alumnos:', error);
        else alumnos = data;
    }

	function createNewQR() {
		const payload = { app: 'comedor', timestamp: Date.now() + timeOffset };
		const newToken = JSON.stringify(payload);
		qrToken = 'QR Dinámico Activo';
		generateQRCode(newToken);
		timeLeft = 60;
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

	function fmtHora(t) { return t ? t.substring(0, 5) : '—'; }

	function getDiaDeFecha(fechaStr) {
		const d = new Date(fechaStr + 'T12:00:00');
		const keys = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
		return keys[d.getDay()];
	}

	function fmtDiferencia(real, asignado) {
		if (!real || !asignado) return null;
		const [hR, mR] = real.split(':').map(Number);
		const [hA, mA] = asignado.split(':').map(Number);
		const minReal = hR * 60 + mR;
		const minAsignado = hA * 60 + mA;
		const diff = minReal - minAsignado;
		
		if (diff <= 0) return { texto: 'En Escuela', clase: 'bg-success-subtle text-success border-success-subtle' };
		if (diff < 60) return { texto: `Tarde: ${diff} min`, clase: 'bg-danger-subtle text-danger border-danger-subtle' };
		
		const h = Math.floor(diff / 60);
		const m = diff % 60;
		return { texto: `Tarde: ${h}h ${m}m`, clase: 'bg-danger-subtle text-danger border-danger-subtle' };
	}

	function toggleFullScreen() {
		const elem = document.getElementById('fullscreen-qr-view');
		if (!document.fullscreenElement) {
			elem?.requestFullscreen().catch(err => {
				console.error(`Error attempting to enable fullscreen: ${err.message}`);
			});
		} else {
			document.exitFullscreen();
		}
	}

    async function autorizarManual() {
        if (!selectedAlumnoId) return alert('Seleccioná un alumno');
        
        isAuthorizing = true;
        const ahora = new Date();
        const hora = ahora.toTimeString().split(' ')[0];
        const fecha = ahora.toLocaleDateString('en-CA');

        // Verificar si tiene movimiento abierto hoy
        const { data: abierto } = await supabase
            .from('movimientos')
            .select('*')
            .eq('perfil_id', selectedAlumnoId)
            .eq('fecha', fecha)
            .is('hora_ingreso', null)
            .maybeSingle();

        let error;
        if (abierto) {
            // Registrar ingreso
            const { error: err } = await supabase
                .from('movimientos')
                .update({ 
                    hora_ingreso: hora, 
                    firma_ingreso: 'Autorizado por Preceptor' 
                })
                .eq('id', abierto.id);
            error = err;
        } else {
            // Registrar salida
            const { error: err } = await supabase
                .from('movimientos')
                .insert({
                    perfil_id: selectedAlumnoId,
                    fecha,
                    hora_salida: hora,
                    firma_salida: 'Autorizado por Preceptor'
                });
            error = err;
        }

        if (error) {
            alert('Error: ' + error.message);
        } else {
            selectedAlumnoId = '';
            await loadMovimientos();
            // Cerrar modal (esto es rústico pero efectivo con BS5)
            const modal = document.getElementById('autorizarModal');
            const bsModal = bootstrap.Modal.getInstance(modal);
            bsModal.hide();
        }
        isAuthorizing = false;
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
            <span class="input-group-text bg-white border-end-0">Fecha:</span>
            <input type="date" class="form-control border-start-0" bind:value={selectedDate} onchange={() => loadMovimientos()}>
        </div>
    </div>
	<div class="col-md-4 text-md-end mt-3 mt-md-0 d-flex gap-2 justify-content-md-end">
		<a href="/comedor/admin" class="btn btn-outline-secondary fw-bold px-3 shadow-sm d-flex align-items-center gap-2">
			CONFIG
		</a>
		<button class="btn btn-warning fw-bold px-3 shadow-sm" data-bs-toggle="modal" data-bs-target="#autorizarModal">
			AUTORIZAR ALUMNO
		</button>
		<button class="btn btn-primary fw-bold px-3 shadow-sm" data-bs-toggle="modal" data-bs-target="#qrModal" onclick={createNewQR}>
			GENERAR QR DE SALIDA
		</button>
	</div>
</div>

{#if errorMsg}
	<div class="alert alert-danger border-0 rounded-3 mb-4">{errorMsg}</div>
{/if}

<!-- Modal Autorizar Manual -->
<div class="modal fade" id="autorizarModal" tabindex="-1" aria-hidden="true">
	<div class="modal-dialog modal-dialog-centered">
		<div class="modal-content glass-card border-0">
			<div class="modal-header border-0 pb-0">
				<h5 class="modal-title fw-bold philips-text w-100 text-center">Autorización Manual</h5>
				<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
			</div>
			<div class="modal-body py-4">
				<div class="mb-3">
					<label for="alumnoSelect" class="form-label small fw-bold text-muted">SELECCIONAR ALUMNO</label>
					<select id="alumnoSelect" class="form-select" bind:value={selectedAlumnoId}>
						<option value="">Buscar alumno...</option>
						{#each alumnos as a}
							<option value={a.id}>{a.email} ({a.curso?.nombre || 'Sin curso'})</option>
						{/each}
					</select>
				</div>

				{#if selectedAlumnoId}
					{@const estaAfuera = movimientos.some(m => m.perfil_id === selectedAlumnoId && !m.hora_ingreso)}
					<div class="alert {estaAfuera ? 'alert-warning' : 'alert-success'} border-0 small mb-4">
						<h6 class="fw-bold mb-1">Estado actual: {estaAfuera ? 'FUERA' : 'DENTRO'}</h6>
						<p class="mb-0">Se registrará un {estaAfuera ? 'INGRESO' : 'EGRESO'} para este alumno.</p>
					</div>

					<button 
						class="btn {estaAfuera ? 'btn-primary' : 'btn-warning'} w-100 fw-bold shadow-sm" 
						onclick={autorizarManual}
						disabled={isAuthorizing}
					>
						{#if isAuthorizing}
							<span class="spinner-border spinner-border-sm me-2"></span> Procesando...
						{:else}
							CONFIRMAR {estaAfuera ? 'INGRESO' : 'EGRESO'}
						{/if}
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>

{#if qrToken}
<div class="row mb-4 justify-content-center">
    <div class="col-md-4">
        <div class="card glass-card text-center p-3">
            <p class="text-muted small mb-1">Estado del QR</p>
            <h5 class="fw-bold philips-text mb-2">Expira en {timeLeft}s</h5>
            {#if qrDataURL}
                <img src={qrDataURL} alt="QR" class="img-fluid mx-auto mb-2" style="max-width: 150px;" />
                <div class="d-grid mt-2">
                    <button class="btn btn-dark btn-sm fw-bold" onclick={toggleFullScreen}>⛶ Pantalla Completa</button>
                </div>
            {/if}
            <p class="small text-muted mb-0 mt-2">Se actualiza automáticamente</p>
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
				<div class="bg-light p-2 rounded fw-bold text-danger mb-3">
					Expira en: {timeLeft} segundos
				</div>
                <div class="d-flex justify-content-center gap-2 mt-3">
                    <button class="btn btn-outline-primary btn-sm" onclick={createNewQR}>Forzar nuevo código</button>
                    <button class="btn btn-dark btn-sm" onclick={toggleFullScreen}>⛶ Pantalla Completa</button>
                </div>
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
					<th>Curso</th>
					<th>Salida</th>
					<th>Límite</th>
					<th>Ingreso</th>
					<th class="pe-4">Estado</th>
				</tr>
			</thead>
			<tbody>
				{#if movimientos.length === 0}
					<tr><td colspan="5" class="py-5 text-center text-muted">No hay movimientos registrados hoy.</td></tr>
				{:else}
					{#each movimientos as mov (mov.id)}
						{@const diaActual = getDiaDeFecha(selectedDate)}
						{@const horarioRegreso = mov.perfiles?.curso?.horarios?.find(h => h.dia === diaActual)?.hora_regreso}
						{@const diff = mov.hora_ingreso ? fmtDiferencia(mov.hora_ingreso, horarioRegreso) : null}
						<tr>
							<td class="ps-4">
								<div class="fw-medium text-primary small">{mov.perfiles?.email || 'Desconocido'}</div>
								<div class="text-muted" style="font-size: 0.7rem;">{mov.firma_salida}</div>
							</td>
							<td class="small text-muted">{mov.perfiles?.curso?.nombre || '—'}</td>
							<td><span class="badge bg-light text-dark border-0 fw-normal">{mov.hora_salida.substring(0,5)}</span></td>
							<td class="small">
								{#if horarioRegreso}
									<span class="badge bg-light text-muted border-0 fw-normal">{horarioRegreso.substring(0,5)}</span>
								{:else}
									<span class="text-muted">—</span>
								{/if}
							</td>
							<td>
								{#if mov.hora_ingreso}
									<span class="badge bg-light text-dark border">{mov.hora_ingreso.substring(0,5)}</span>
								{:else}
									<span class="text-muted">—</span>
								{/if}
							</td>
							<td class="pe-4">
								{#if !mov.hora_ingreso}
									<span class="badge rounded-pill bg-warning-subtle text-warning-emphasis border border-warning-subtle px-3">Ausente</span>
								{:else if diff}
									<span class="badge rounded-pill border px-3 {diff.clase}">{diff.texto}</span>
								{:else}
									<span class="badge rounded-pill bg-success-subtle text-success border border-success-subtle px-3">En Escuela</span>
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
		<h1 class="fw-bold philips-text mb-4" style="font-size: 4vw;">Control de Comedor</h1>
		<p class="text-muted fs-4 mb-4">Escaneá este código para registrar tu salida/ingreso.</p>
		<img src={qrDataURL} alt="QR" style="width: 50vw; max-width: 50vh; object-fit: contain;" class="shadow-lg border rounded p-4 mb-4 bg-white" />
		<h2 class="fw-bold text-danger mb-5" style="font-size: 3vw;">Expira en: {timeLeft}s</h2>
		<button class="btn btn-outline-secondary btn-lg" onclick={toggleFullScreen}>Salir de Pantalla Completa</button>
	{/if}
</div>
