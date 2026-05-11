<script>
	import { onMount, onDestroy } from 'svelte';
	import QRCode from 'qrcode';
	import { supabase } from '$lib/supabaseClient';
	import { goto } from '$app/navigation';

	let session = $state(null);
	let loading = $state(true);
	let saving = $state(null);
	let errorMsg = $state('');
	let loadingRegistros = $state(false);

	let qrToken = $state('');
	let qrDataURL = $state('');
	let qrInterval;

	const TODOS_DIAS = ['L', 'M', 'X', 'J', 'V'];
	const DIAS_NOMBRE = { L: 'Lunes', M: 'Martes', X: 'Miércoles', J: 'Jueves', V: 'Viernes' };

	function fmtHora(t) { return t ? t.substring(0, 5) : '—'; }

	onMount(async () => {
		const { data } = await supabase.auth.getSession();
		session = data.session;
		if (!session) { goto('/PP'); return; }

		const { data: p } = await supabase
			.from('perfiles').select('rol').eq('id', session.user.id).single();
		if (!p || p.rol !== 'admin') { goto('/PP/alumno'); return; }

		await Promise.all([cargarAlumnos(), cargarEmpresas(), cargarRegistros()]);
		
		const existingToken = localStorage.getItem('active_qr_token_pp') || 'PHILIPS-DEMO-PP';
		qrToken = existingToken;
		generateQRCode(existingToken);
		qrInterval = setInterval(createNewQR, 60000);
		
		loading = false;
	});

	onDestroy(() => {
		if (qrInterval) clearInterval(qrInterval);
	});

	function createNewQR() {
		const newToken = 'PHILIPS-PP-' + Math.random().toString(36).substring(2, 8).toUpperCase();
		qrToken = newToken;
		localStorage.setItem('active_qr_token_pp', newToken);
		generateQRCode(newToken);
	}

	async function generateQRCode(text) {
		try {
			qrDataURL = await QRCode.toDataURL(text, {
				width: 300,
				margin: 2,
				color: { dark: '#0B5EAA', light: '#ffffff' }
			});
		} catch (err) {
			console.error('Error generando QR:', err);
		}
	}

	async function cargarAlumnos() {
		const { data, error } = await supabase
			.from('perfiles')
			.select(`id, email, horario_entrada, empresa:empresa_id ( id, nombre ), dias_habilitados ( dia )`)
			.eq('rol', 'student')
			.order('email');
		if (error) { console.error(error); return; }
		alumnos = (data ?? []).map(a => ({
			...a,
			empresa_id: a.empresa?.id ?? '',
			dias: a.dias_habilitados?.map(d => d.dia) ?? [],
			horario_entrada: a.horario_entrada ?? ''
		}));
	}

	async function cargarEmpresas() {
		const { data } = await supabase.from('empresas').select('id, nombre').order('nombre');
		empresas = data ?? [];
	}

	async function cargarRegistros() {
		loadingRegistros = true;
		const { data, error } = await supabase
			.from('registros')
			.select(`id, fecha, hora_entrada_real, perfil:perfil_id ( email, empresa:empresa_id ( nombre ) )`)
			.eq('fecha', selectedDate)
			.order('hora_entrada_real');
		if (error) console.error(error);
		registros = data ?? [];
		loadingRegistros = false;
	}

	async function guardarAlumno(alumno) {
		saving = alumno.id;
		errorMsg = '';

		const { error: pe } = await supabase
			.from('perfiles')
			.update({ empresa_id: alumno.empresa_id || null, horario_entrada: alumno.horario_entrada || null })
			.eq('id', alumno.id);
		if (pe) { errorMsg = 'Error guardando: ' + pe.message; saving = null; return; }

		await supabase.from('dias_habilitados').delete().eq('perfil_id', alumno.id);
		if (alumno.dias.length > 0) {
			const rows = alumno.dias.map(d => ({ perfil_id: alumno.id, dia: d }));
			const { error: de } = await supabase.from('dias_habilitados').insert(rows);
			if (de) { errorMsg = 'Error guardando días: ' + de.message; saving = null; return; }
		}
		saving = null;
	}

	function toggleDia(alumno, dia) {
		if (alumno.dias.includes(dia)) {
			alumno.dias = alumno.dias.filter(d => d !== dia);
		} else {
			alumno.dias = [...alumno.dias, dia];
		}
	}

	async function agregarEmpresa() {
		if (!nuevaEmpresa.trim()) return;
		addingEmpresa = true;

		const { error } = await supabase.from('empresas').insert({ nombre: nuevaEmpresa.trim() });
		if (error) { errorMsg = 'Error al agregar empresa: ' + error.message; }
		else { nuevaEmpresa = ''; await cargarEmpresas(); }
		addingEmpresa = false;
	}
</script>

<svelte:head>
	<title>Panel Admin — Pasantías Philips</title>
</svelte:head>

{#if loading}
	<div class="row justify-content-center mt-5">
		<div class="col-auto text-center">
			<div class="spinner-border text-primary mb-3" role="status"></div>
			<p class="text-muted small">Cargando...</p>
		</div>
	</div>
{:else}

<div class="row align-items-center mb-4">
	<div class="col-md-6">
		<h2 class="fw-bold philips-text mb-1">Panel Administrador</h2>
		<p class="text-muted small mb-0">Gestión de alumnos en pasantía</p>
	</div>
	<div class="col-md-6 text-md-end mt-3 mt-md-0">
		<button class="btn btn-primary fw-bold px-3 shadow-sm" data-bs-toggle="modal" data-bs-target="#qrModal" onclick={createNewQR}>
			GENERAR QR DE INGRESO
		</button>
	</div>
</div>

<div class="modal fade" id="qrModal" tabindex="-1" aria-hidden="true">
	<div class="modal-dialog modal-dialog-centered">
		<div class="modal-content glass-card border-0">
			<div class="modal-header border-0 pb-0">
				<h5 class="modal-title fw-bold philips-text w-100 text-center">QR de Acceso Pasantías</h5>
				<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
			</div>
			<div class="modal-body text-center py-4">
				<p class="text-muted small mb-3">Muestra este código a los alumnos para que validen su ingreso.</p>
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

{#if errorMsg}
	<div class="alert alert-danger border-0 rounded-3 mb-4">{errorMsg}</div>
{/if}

<!-- Empresas -->
<div class="card glass-card mb-4 p-4">
	<h5 class="fw-bold mb-3">Empresas</h5>
	<div class="d-flex flex-wrap gap-2 mb-3">
		{#each empresas as emp}
			<span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-3 py-2">{emp.nombre}</span>
		{/each}
		{#if empresas.length === 0}
			<span class="text-muted small fst-italic">Sin empresas cargadas.</span>
		{/if}
	</div>
	<div class="input-group" style="max-width: 380px;">
		<input
			id="input-nueva-empresa"
			type="text"
			class="form-control"
			placeholder="Nueva empresa..."
			bind:value={nuevaEmpresa}
			onkeydown={(e) => e.key === 'Enter' && agregarEmpresa()}
		/>
		<button class="btn btn-primary" onclick={agregarEmpresa} disabled={addingEmpresa}>
			{#if addingEmpresa}<span class="spinner-border spinner-border-sm"></span>{:else}Agregar{/if}
		</button>
	</div>
</div>

<!-- Alumnos -->
<div class="card glass-card mb-4 overflow-hidden">
	<div class="p-4 border-bottom">
		<h5 class="fw-bold mb-0">Alumnos</h5>
		<p class="text-muted small mb-0">Asigná empresa, horario y días a cada alumno.</p>
	</div>

	{#if alumnos.length === 0}
		<div class="p-5 text-center text-muted">No hay alumnos registrados aún.</div>
	{:else}
		<div class="table-responsive">
			<table class="table table-hover mb-0 align-middle">
				<thead class="table-light text-muted small text-uppercase">
					<tr>
						<th class="ps-4">Email</th>
						<th>Empresa</th>
						<th>Horario entrada</th>
						<th>Días habilitados</th>
						<th class="pe-4">Acción</th>
					</tr>
				</thead>
				<tbody>
					{#each alumnos as alumno (alumno.id)}
						<tr>
							<td class="ps-4">
								<span class="fw-medium text-dark small">{alumno.email}</span>
							</td>
							<td>
								<select class="form-select form-select-sm" style="min-width:190px;" bind:value={alumno.empresa_id}>
									<option value="">Sin asignar</option>
									{#each empresas as emp}
										<option value={emp.id}>{emp.nombre}</option>
									{/each}
								</select>
							</td>
							<td>
								<input type="time" class="form-control form-control-sm" style="min-width:110px;" bind:value={alumno.horario_entrada} />
							</td>
							<td>
								<div class="d-flex gap-1 flex-wrap">
									{#each TODOS_DIAS as dia}
										<button
											class="btn btn-sm px-2 py-1 rounded-2 fw-semibold {alumno.dias.includes(dia) ? 'btn-primary' : 'btn-outline-secondary'}"
											onclick={() => toggleDia(alumno, dia)}
											title={DIAS_NOMBRE[dia]}
											style="min-width:30px; font-size:.78rem;"
										>{dia}</button>
									{/each}
								</div>
							</td>
							<td class="pe-4">
								<button
									class="btn btn-sm btn-success fw-semibold px-3"
									onclick={() => guardarAlumno(alumno)}
									disabled={saving === alumno.id}
								>
									{#if saving === alumno.id}
										<span class="spinner-border spinner-border-sm"></span>
									{:else}
										Guardar
									{/if}
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<!-- Registros del día -->
<div class="card glass-card overflow-hidden">
	<div class="p-4 border-bottom d-flex align-items-center gap-3 flex-wrap">
		<div class="flex-grow-1">
			<h5 class="fw-bold mb-0">Registros de Entrada</h5>
			<p class="text-muted small mb-0">Entradas registradas por los alumnos</p>
		</div>
		<div class="input-group input-group-sm shadow-sm" style="max-width:210px;">
			<span class="input-group-text bg-white border-end-0">Fecha:</span>
			<input
				type="date"
				class="form-control border-start-0"
				bind:value={selectedDate}
				onchange={cargarRegistros}
			/>
		</div>
	</div>

	{#if loadingRegistros}
		<div class="p-4 text-center"><div class="spinner-border spinner-border-sm text-primary"></div></div>
	{:else if registros.length === 0}
		<div class="p-5 text-center text-muted">No hay registros para esta fecha.</div>
	{:else}
		<div class="table-responsive">
			<table class="table table-hover mb-0 align-middle">
				<thead class="table-light text-muted small text-uppercase">
					<tr>
						<th class="ps-4">Alumno</th>
						<th>Empresa</th>
						<th>Hora de Entrada</th>
						<th class="pe-4">Estado</th>
					</tr>
				</thead>
				<tbody>
					{#each registros as reg (reg.id)}
						<tr>
							<td class="ps-4 fw-medium text-primary small">{reg.perfil?.email ?? '—'}</td>
							<td class="small text-muted">{reg.perfil?.empresa?.nombre ?? '—'}</td>
							<td><span class="badge bg-light text-dark border">{fmtHora(reg.hora_entrada_real)}</span></td>
							<td class="pe-4">
								<span class="badge rounded-pill bg-success-subtle text-success border border-success-subtle px-3">Registrado</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

{/if}
