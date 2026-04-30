<script>
	import { Html5Qrcode } from 'html5-qrcode';
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let session = $state(null);
	let perfil = $state(null);
	let empresa = $state(null);
	let diasHabilitados = $state([]);
	let registroHoy = $state(null);
	let loading = $state(true);
	let registrando = $state(false);
	let errorMsg = $state('');

	let qrVerified = $state(false);
	let html5QrCode;
	let cameraError = $state('');

	const DIAS = { L: 'Lunes', M: 'Martes', X: 'Miércoles', J: 'Jueves', V: 'Viernes' };

	function diaDeHoy() {
		const mapa = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
		return mapa[new Date().getDay()];
	}

	function fechaHoy() {
		return new Date().toLocaleDateString('en-CA');
	}

	function fmtHora(t) {
		return t ? t.substring(0, 5) : '—';
	}

	onMount(async () => {
		const { data } = await supabase.auth.getSession();
		session = data.session;
		if (!session) { goto('/'); return; }

		await cargarPerfil();
		
		if (!qrVerified && !registroHoy && empresa && hoyHabilitado) {
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
            cameraError = '⚠️ Error de Seguridad: El acceso a la cámara requiere HTTPS.';
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
		const activeToken = localStorage.getItem('active_qr_token_pp') || 'PHILIPS-DEMO-PP';
		if (decodedText === activeToken || decodedText === 'PHILIPS-DEMO-PP') {
			qrVerified = true;
			if (html5QrCode && html5QrCode.isScanning) {
                await html5QrCode.stop().catch(e => console.error(e));
            }
		} else {
			alert('Código QR Inválido. Asegúrate de escanear el código de pasantías.');
		}
	}

	async function cargarPerfil() {
		loading = true;
		errorMsg = '';

		const { data: p, error: pe } = await supabase
			.from('perfiles')
			.select(`id, email, rol, horario_entrada, empresa:empresa_id ( id, nombre )`)
			.eq('id', session.user.id)
			.single();

		if (pe || !p) {
			errorMsg = 'No se encontró tu perfil. Contactá al administrador.';
			loading = false;
			return;
		}

		if (p.rol !== 'student') { goto('/admin'); return; }

		perfil = p;
		empresa = p.empresa;

		const { data: dias } = await supabase
			.from('dias_habilitados')
			.select('dia')
			.eq('perfil_id', p.id);
		diasHabilitados = dias?.map(d => d.dia) ?? [];

		const { data: reg } = await supabase
			.from('registros')
			.select('id, fecha, hora_entrada_real')
			.eq('perfil_id', p.id)
			.eq('fecha', fechaHoy())
			.maybeSingle();
		registroHoy = reg ?? null;

		loading = false;
	}

	async function registrarEntrada() {
		registrando = true;
		errorMsg = '';

		const hora = new Date().toTimeString().split(' ')[0];
		const { data, error } = await supabase
			.from('registros')
			.insert({ perfil_id: perfil.id, fecha: fechaHoy(), hora_entrada_real: hora })
			.select()
			.single();

		if (error) { errorMsg = 'Error al registrar. Intentá de nuevo.'; console.error(error); }
		else { registroHoy = data; }

		registrando = false;
	}

	let hoyHabilitado = $derived(diasHabilitados.includes(diaDeHoy()));
</script>

<svelte:head>
	<title>Mi Pasantía — Escuela Philips</title>
</svelte:head>

{#if loading}
	<div class="row justify-content-center mt-5">
		<div class="col-auto text-center">
			<div class="spinner-border text-primary mb-3" role="status"></div>
			<p class="text-muted small">Cargando tu información...</p>
		</div>
	</div>
{:else}
	<div class="row justify-content-center">
		<div class="col-md-7 col-lg-6">

			<h2 class="fw-bold philips-text mb-1">Mi Pasantía</h2>
			<p class="text-muted small mb-4">Bienvenido/a, <strong>{session?.user?.email}</strong></p>

			{#if errorMsg}
				<div class="alert alert-danger border-0 rounded-3">{errorMsg}</div>
			{/if}

			<!-- Empresa -->
			<div class="card glass-card mb-3 p-4">
				<div class="row align-items-center">
					<div class="col">
						<p class="text-muted small fw-semibold mb-1 text-uppercase" style="letter-spacing:.05em;">Empresa Asignada</p>
						{#if empresa}
							<h4 class="fw-bold mb-0 philips-text">{empresa.nombre}</h4>
						{:else}
							<p class="text-muted fst-italic mb-0">Sin empresa asignada aún</p>
						{/if}
					</div>
					<div class="col-auto">
						<!-- Icono eliminado -->
					</div>
				</div>
			</div>

			<!-- Horario y días -->
			<div class="row g-3 mb-4">
				<div class="col-6">
					<div class="card glass-card p-3 h-100">
						<p class="text-muted small fw-semibold mb-1 text-uppercase" style="letter-spacing:.05em;">Horario Entrada</p>
						<h5 class="fw-bold mb-0 philips-text">
							{#if perfil?.horario_entrada}
								{fmtHora(perfil.horario_entrada)}
							{:else}
								<span class="text-muted fst-italic fw-normal fs-6">No definido</span>
							{/if}
						</h5>
					</div>
				</div>
				<div class="col-6">
					<div class="card glass-card p-3 h-100">
						<p class="text-muted small fw-semibold mb-1 text-uppercase" style="letter-spacing:.05em;">Días Habilitados</p>
						<div class="d-flex flex-wrap gap-1 mt-1">
							{#each ['L','M','X','J','V'] as d}
								<span class="badge rounded-pill px-2 py-1 {diasHabilitados.includes(d) ? 'bg-primary' : 'bg-light text-muted border'}">
									{d}
								</span>
							{/each}
						</div>
					</div>
				</div>
			</div>

			<!-- Registro -->
			<div class="card glass-card p-4 text-center">
				<h5 class="fw-bold mb-3">Registro de Entrada — Hoy</h5>

				{#if registroHoy}
					<div class="bg-success-subtle text-success-emphasis rounded-3 p-4 border border-success-subtle mb-3">
						<h5 class="fw-bold mb-1">¡Entrada registrada!</h5>
						<p class="mb-0">Hoy a las <strong>{fmtHora(registroHoy.hora_entrada_real)}</strong></p>
					</div>
					<p class="text-muted small">Ya completaste tu entrada para hoy.</p>

				{:else if !empresa}
					<div class="bg-warning-subtle text-warning-emphasis rounded-3 p-4 border border-warning-subtle">
						<p class="mb-0 fw-semibold">Esperá que el admin te asigne una empresa.</p>
					</div>

				{:else if !hoyHabilitado}
					<div class="bg-light rounded-3 p-4 border">
						<p class="mb-0 fw-semibold">Hoy no tenés pasantía.</p>
						<p class="text-muted small mt-1 mb-0">
							Tus días: {diasHabilitados.length > 0 ? diasHabilitados.map(d => DIAS[d]).join(', ') : 'ninguno asignado'}
						</p>
					</div>

				{:else}
					{#if !qrVerified}
						<div class="alert alert-info border-0 shadow-sm mb-4">
							<h6 class="fw-bold mb-1">Punto de Control</h6>
							<p class="small mb-0">Escanea el QR del Preceptor para poder registrar tu entrada.</p>
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
						<div class="bg-primary-subtle text-primary-emphasis rounded-3 p-3 border border-primary-subtle mb-4">
							<p class="mb-0 small">
								<strong>{DIAS[diaDeHoy()]}</strong> — Horario esperado: <strong>{fmtHora(perfil?.horario_entrada)}</strong>
							</p>
						</div>
						<button
							id="btn-registrar-entrada"
							class="btn btn-primary btn-lg w-100 fw-bold shadow-sm"
							onclick={registrarEntrada}
							disabled={registrando}
						>
							{#if registrando}
								<span class="spinner-border spinner-border-sm me-2"></span>Registrando...
							{:else}
								Registrar Entrada
							{/if}
						</button>
					{/if}
				{/if}
			</div>

		</div>
	</div>
{/if}
