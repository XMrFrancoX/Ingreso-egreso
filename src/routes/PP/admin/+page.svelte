<script>
	import { onMount, onDestroy } from 'svelte';
	import QRCode from 'qrcode';
	import { supabase } from '$lib/supabaseClient';
	import { goto } from '$app/navigation';

	let session = $state(null);
	let loading = $state(true);
	let saving = $state(null);
	let errorMsg = $state('');
	let successMsg = $state('');
	let loadingRegistros = $state(false);
	let isAdmin = $state(false);

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

	let qrToken = $state('');
	let qrDataURL = $state('');
	let timeLeft = $state(60);
	let timerInterval;

	let nuevaEmpresa = $state('');
	let addingEmpresa = $state(false);
	let alumnos = $state([]);
	let empresas = $state([]);
	let registros = $state([]);
	let selectedDate = $state(new Date().toLocaleDateString('en-CA'));

	// Precarga
	let precargaEmail = $state('');
	let precargaEmpresaId = $state('');
	let precargaHorario = $state('');
	let precargaDias = $state([]);
	let addingPrecarga = $state(false);
	let precargados = $state([]);

	// Confirmación eliminación
	let confirmDelete = $state(null); // { tipo: 'empresa'|'alumno'|'precarga', id, nombre }

	const TODOS_DIAS = ['L', 'M', 'X', 'J', 'V'];
	const DIAS_NOMBRE = { L: 'Lunes', M: 'Martes', X: 'Miércoles', J: 'Jueves', V: 'Viernes' };

	function fmtHora(t) { return t ? t.substring(0, 5) : '—'; }

	function showSuccess(msg) {
		successMsg = msg;
		setTimeout(() => { successMsg = ''; }, 3000);
	}

	onMount(async () => {
		const { data } = await supabase.auth.getSession();
		session = data.session;
		if (!session) { goto('/PP'); return; }

		const { data: p } = await supabase
			.from('perfiles').select('rol').eq('id', session.user.id).single();
		if (!p || (p.rol !== 'admin' && p.rol !== 'preceptor')) { goto('/PP/alumno'); return; }

		isAdmin = p.rol === 'admin';

		await Promise.all([
			syncTime(),
			isAdmin ? cargarAlumnos() : Promise.resolve(),
			isAdmin ? cargarEmpresas() : Promise.resolve(),
			isAdmin ? cargarPrecargados() : Promise.resolve(),
			cargarRegistros()
		]);

		createNewQR();
		timerInterval = setInterval(() => {
			timeLeft--;
			if (timeLeft <= 0) createNewQR();
		}, 1000);

		document.addEventListener('fullscreenchange', () => {
			isFullScreen = !!document.fullscreenElement;
		});

		loading = false;
	});

	onDestroy(() => {
		if (timerInterval) clearInterval(timerInterval);
	});

	function createNewQR() {
		const payload = { app: 'PP', timestamp: Date.now() + timeOffset };
		const newToken = JSON.stringify(payload);
		qrToken = 'QR Dinámico Activo';
		generateQRCode(newToken);
		timeLeft = 60;
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

	async function cargarAlumnos() {
		const { data, error } = await supabase
			.from('perfiles')
			.select(`id, email, horario_entrada, empresa:empresa_id ( id, nombre ), dias_habilitados ( dia )`)
			.eq('rol', 'student')
			.order('email');
		if (error) { console.error(error); return; }
		const list = (data ?? []).map(a => ({
			...a,
			empresa_id: a.empresa?.id ?? '',
			dias: a.dias_habilitados?.map(d => d.dia) ?? [],
			horario_entrada: a.horario_entrada ?? ''
		}));
		
		// Filtrar: Solo mostrar si tienen empresa, horario o días asignados 
		// (evita mostrar alumnos que solo se registraron para Comedor)
		alumnos = list.filter(a => a.empresa_id || a.horario_entrada || a.dias.length > 0);
	}

	async function cargarEmpresas() {
		const { data } = await supabase.from('empresas').select('id, nombre').order('nombre');
		empresas = data ?? [];
	}

	async function cargarPrecargados() {
		const { data } = await supabase
			.from('alumnos_precargados')
			.select(`id, email, horario_entrada, empresa:empresa_id ( id, nombre ), alumnos_precargados_dias ( dia )`)
			.order('email');
		precargados = (data ?? []).map(p => ({
			...p,
			empresa_nombre: p.empresa?.nombre ?? '—',
			dias: p.alumnos_precargados_dias?.map(d => d.dia) ?? []
		}));
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
		showSuccess('✓ Alumno guardado correctamente');
	}

	function toggleDia(alumno, dia) {
		if (alumno.dias.includes(dia)) {
			alumno.dias = alumno.dias.filter(d => d !== dia);
		} else {
			alumno.dias = [...alumno.dias, dia];
		}
	}

	function togglePrecargaDia(dia) {
		if (precargaDias.includes(dia)) {
			precargaDias = precargaDias.filter(d => d !== dia);
		} else {
			precargaDias = [...precargaDias, dia];
		}
	}

	async function agregarEmpresa() {
		if (!nuevaEmpresa.trim()) return;
		addingEmpresa = true;

		const { error } = await supabase.from('empresas').insert({ nombre: nuevaEmpresa.trim() });
		if (error) { errorMsg = 'Error al agregar empresa: ' + error.message; }
		else { nuevaEmpresa = ''; await cargarEmpresas(); showSuccess('✓ Empresa agregada'); }
		addingEmpresa = false;
	}

	async function eliminarEmpresa(emp) {
		// Verificar si tiene alumnos asignados
		const { count } = await supabase
			.from('perfiles')
			.select('id', { count: 'exact', head: true })
			.eq('empresa_id', emp.id);

		if (count > 0) {
			confirmDelete = {
				tipo: 'empresa',
				id: emp.id,
				nombre: emp.nombre,
				advertencia: `Esta empresa tiene ${count} alumno(s) asignado(s). Al eliminarla quedarán sin empresa.`
			};
		} else {
			confirmDelete = { tipo: 'empresa', id: emp.id, nombre: emp.nombre, advertencia: null };
		}
	}

	async function eliminarAlumno(alumno) {
		confirmDelete = {
			tipo: 'alumno',
			id: alumno.id,
			nombre: alumno.email,
			advertencia: 'Se eliminarán sus días habilitados y datos del sistema. No podrá ingresar hasta que el admin lo vuelva a cargar.'
		};
	}

	async function eliminarPrecarga(p) {
		confirmDelete = {
			tipo: 'precarga',
			id: p.id,
			nombre: p.email,
			advertencia: null
		};
	}

	async function confirmarEliminacion() {
		if (!confirmDelete) return;
		errorMsg = '';

		if (confirmDelete.tipo === 'empresa') {
			const { data, error } = await supabase.from('empresas').delete().eq('id', confirmDelete.id).select();
			if (error) { errorMsg = 'Error al eliminar empresa: ' + error.message; }
			else if (!data || data.length === 0) { errorMsg = 'Fallo de permisos (RLS). No tienes permiso para eliminar empresas.'; }
			else { await cargarEmpresas(); await cargarAlumnos(); showSuccess('✓ Empresa eliminada'); }
		}

		if (confirmDelete.tipo === 'alumno') {
			// En lugar de borrar el perfil (que rompería Comedor), solo limpiamos los datos de PP
			await supabase.from('dias_habilitados').delete().eq('perfil_id', confirmDelete.id);
			const { data, error } = await supabase
				.from('perfiles')
				.update({ empresa_id: null, horario_entrada: null })
				.eq('id', confirmDelete.id)
				.select();
				
			if (error) { errorMsg = 'Error al quitar de pasantías: ' + error.message; }
			else { await cargarAlumnos(); showSuccess('✓ Alumno quitado de pasantías'); }
		}

		if (confirmDelete.tipo === 'precarga') {
			const { data, error } = await supabase.from('alumnos_precargados').delete().eq('id', confirmDelete.id).select();
			if (error) { errorMsg = 'Error al eliminar precarga: ' + error.message; }
			else if (!data || data.length === 0) { errorMsg = 'Fallo de permisos (RLS). No puedes borrar esta precarga.'; }
			else { await cargarPrecargados(); showSuccess('✓ Precarga eliminada'); }
		}

		if (!errorMsg) confirmDelete = null;
	}

	async function agregarPrecarga() {
		if (!precargaEmail.trim()) { errorMsg = 'Ingresá un email válido.'; return; }
		addingPrecarga = true;
		const email = precargaEmail.trim().toLowerCase();
		
		// Verificar si ya está en precarga
		const { data: yaPrecargado } = await supabase
			.from('alumnos_precargados').select('id').eq('email', email).maybeSingle();
		if (yaPrecargado) {
			errorMsg = 'Este email ya está en la lista de espera (precarga).';
			addingPrecarga = false;
			return;
		}
		
		// Verificar si ya tiene datos de PP en su perfil
		const { data: perfilExistente } = await supabase
			.from('perfiles')
			.select(`id, empresa_id, horario_entrada, dias_habilitados ( dia )`)
			.eq('email', email)
			.maybeSingle();

		if (perfilExistente) {
			const tieneDatos = perfilExistente.empresa_id || perfilExistente.horario_entrada || (perfilExistente.dias_habilitados?.length > 0);
			if (tieneDatos) {
				errorMsg = 'Este alumno ya está activo en Pasantías. Buscalo en la tabla de Alumnos Registrados.';
				addingPrecarga = false;
				return;
			}
		}

		const { data: precarga, error: pe } = await supabase
			.from('alumnos_precargados')
			.insert({
				email,
				empresa_id: precargaEmpresaId || null,
				horario_entrada: precargaHorario || null
			})
			.select()
			.single();

		if (pe) { errorMsg = 'Error al precargar: ' + pe.message; addingPrecarga = false; return; }

		if (precargaDias.length > 0) {
			const rows = precargaDias.map(d => ({ precargado_id: precarga.id, dia: d }));
			await supabase.from('alumnos_precargados_dias').insert(rows);
		}

		// Resetear formulario
		precargaEmail = '';
		precargaEmpresaId = '';
		precargaHorario = '';
		precargaDias = [];

		await cargarPrecargados();
		showSuccess('✓ Email precargado correctamente');
		addingPrecarga = false;
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
		<p class="text-muted small mb-0">{isAdmin ? 'Gestión de alumnos en pasantía' : 'Generación de acceso a pasantías'}</p>
	</div>
	<div class="col-md-6 text-md-end mt-3 mt-md-0">
		<div class="d-flex flex-column align-items-md-end gap-2">
			<button class="btn btn-primary fw-bold px-4 shadow-sm" data-bs-toggle="modal" data-bs-target="#qrModal" onclick={createNewQR}>
			NUEVO QR DE INGRESO
			</button>
			{#if qrDataURL}
				<div class="card glass-card p-2 text-center" style="max-width: 200px;">
					<img src={qrDataURL} alt="QR" class="img-fluid mx-auto mb-1" style="max-width: 100px;" />
					<button class="btn btn-dark btn-sm py-0 fw-bold" style="font-size: 0.7rem;" onclick={toggleFullScreen}>⛶ PANTALLA COMPLETA</button>
					<div class="text-danger fw-bold mt-1" style="font-size: 0.7rem;">{timeLeft}s</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Modal QR -->
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

<!-- Modal Confirmación Eliminación -->
{#if confirmDelete}
<div class="modal fade show d-block" tabindex="-1" style="background:rgba(0,0,0,.5);">
	<div class="modal-dialog modal-dialog-centered">
		<div class="modal-content border-0 shadow-lg">
			<div class="modal-header border-0 pb-0">
				<h5 class="modal-title fw-bold text-danger">Confirmar eliminación</h5>
			</div>
			<div class="modal-body">
				<p>¿Eliminás <strong>{confirmDelete.nombre}</strong>?</p>
				{#if confirmDelete.advertencia}
					<div class="alert alert-warning border-0 small">{confirmDelete.advertencia}</div>
				{/if}
			</div>
			<div class="modal-footer border-0 pt-0">
				<button class="btn btn-outline-secondary btn-sm" onclick={() => confirmDelete = null}>Cancelar</button>
				<button class="btn btn-danger btn-sm fw-bold" onclick={confirmarEliminacion}>Sí, eliminar</button>
			</div>
		</div>
	</div>
</div>
{/if}

{#if errorMsg}
	<div class="alert alert-danger border-0 rounded-3 mb-4">{errorMsg}</div>
{/if}
{#if successMsg}
	<div class="alert alert-success border-0 rounded-3 mb-4">{successMsg}</div>
{/if}

<!-- ── SECCIÓN ADMIN ── -->
{#if isAdmin}

<!-- Empresas -->
<div class="card glass-card mb-4 p-4">
	<h5 class="fw-bold mb-3">Empresas</h5>
	<div class="d-flex flex-wrap gap-2 mb-3">
		{#each empresas as emp (emp.id)}
			<span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-3 py-2 d-flex align-items-center gap-2">
				{emp.nombre}
				<button
					class="btn-close btn-close-sm ms-1"
					style="font-size:.6rem; filter:invert(28%) sepia(90%) saturate(800%) hue-rotate(200deg);"
					title="Eliminar empresa"
					onclick={() => eliminarEmpresa(emp)}
					aria-label="Eliminar {emp.nombre}"
				></button>
			</span>
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

<!-- Precarga de Alumnos -->
<div class="card glass-card mb-4 overflow-hidden">
	<div class="p-4 border-bottom">
		<h5 class="fw-bold mb-0">Precarga de Alumnos</h5>
		<p class="text-muted small mb-0">Cargá el email de Google de un alumno antes de que inicie sesión. Al hacer login, verá todo configurado.</p>
	</div>

	<!-- Formulario de precarga -->
	<div class="p-4 border-bottom bg-light bg-opacity-50">
		<div class="row g-3 align-items-end">
			<div class="col-md-4">
				<label class="form-label small fw-semibold text-muted text-uppercase" style="font-size:.75rem;">Email de Google</label>
				<input
					id="input-precarga-email"
					type="email"
					class="form-control form-control-sm"
					placeholder="alumno@gmail.com"
					bind:value={precargaEmail}
				/>
			</div>
			<div class="col-md-3">
				<label class="form-label small fw-semibold text-muted text-uppercase" style="font-size:.75rem;">Empresa</label>
				<select class="form-select form-select-sm" bind:value={precargaEmpresaId}>
					<option value="">Sin asignar</option>
					{#each empresas as emp}
						<option value={emp.id}>{emp.nombre}</option>
					{/each}
				</select>
			</div>
			<div class="col-md-2">
				<label class="form-label small fw-semibold text-muted text-uppercase" style="font-size:.75rem;">Horario entrada</label>
				<input type="time" class="form-control form-control-sm" bind:value={precargaHorario} />
			</div>
			<div class="col-md-2">
				<label class="form-label small fw-semibold text-muted text-uppercase d-block" style="font-size:.75rem;">Días</label>
				<div class="d-flex gap-1">
					{#each TODOS_DIAS as dia}
						<button
							class="btn btn-sm px-2 py-1 rounded-2 fw-semibold {precargaDias.includes(dia) ? 'btn-primary' : 'btn-outline-secondary'}"
							onclick={() => togglePrecargaDia(dia)}
							title={DIAS_NOMBRE[dia]}
							style="min-width:30px; font-size:.78rem;"
						>{dia}</button>
					{/each}
				</div>
			</div>
			<div class="col-md-1 d-flex align-items-end">
				<button class="btn btn-success btn-sm w-100 fw-semibold" onclick={agregarPrecarga} disabled={addingPrecarga}>
					{#if addingPrecarga}<span class="spinner-border spinner-border-sm"></span>{:else}+ Agregar{/if}
				</button>
			</div>
		</div>
	</div>

	<!-- Lista de precargados -->
	{#if precargados.length === 0}
		<div class="p-4 text-center text-muted small fst-italic">No hay emails precargados.</div>
	{:else}
		<div class="table-responsive">
			<table class="table table-hover mb-0 align-middle">
				<thead class="table-light text-muted small text-uppercase">
					<tr>
						<th class="ps-4">Email</th>
						<th>Empresa</th>
						<th>Horario</th>
						<th>Días</th>
						<th class="pe-4">Acción</th>
					</tr>
				</thead>
				<tbody>
					{#each precargados as p (p.id)}
						<tr>
							<td class="ps-4">
								<span class="fw-medium text-dark small">{p.email}</span>
								<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle ms-2" style="font-size:.7rem;">En espera</span>
							</td>
							<td class="small text-muted">{p.empresa_nombre}</td>
							<td><span class="badge bg-light text-dark border">{fmtHora(p.horario_entrada)}</span></td>
							<td>
								<div class="d-flex gap-1">
									{#each TODOS_DIAS as dia}
										<span class="badge rounded-pill px-2 {p.dias.includes(dia) ? 'bg-primary' : 'bg-light text-muted border'}" style="font-size:.75rem;">{dia}</span>
									{/each}
								</div>
							</td>
							<td class="pe-4">
								<button class="btn btn-sm btn-outline-danger px-2" onclick={() => eliminarPrecarga(p)} title="Eliminar precarga">🗑</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<!-- Alumnos registrados -->
<div class="card glass-card mb-4 overflow-hidden">
	<div class="p-4 border-bottom">
		<h5 class="fw-bold mb-0">Alumnos Registrados</h5>
		<p class="text-muted small mb-0">Alumnos que ya iniciaron sesión. Asigná empresa, horario y días.</p>
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
						<th class="pe-4">Acciones</th>
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
								<div class="d-flex gap-2">
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
									<button
										class="btn btn-sm btn-outline-danger px-2"
										onclick={() => eliminarAlumno(alumno)}
										title="Eliminar alumno"
									>🗑</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
{/if}

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

<!-- FULLSCREEN VIEW -->
<div id="fullscreen-qr-view" class="bg-white flex-column justify-content-center align-items-center text-center" style="display: {isFullScreen ? 'flex' : 'none'} !important; width: 100vw; height: 100vh;">
	{#if isFullScreen}
		<h1 class="fw-bold philips-text mb-4" style="font-size: 4vw;">Control de Pasantías</h1>
		<p class="text-muted fs-4 mb-4">Escaneá este código para registrar tu ingreso a la pasantía.</p>
		<img src={qrDataURL} alt="QR" style="width: 50vw; max-width: 50vh; object-fit: contain;" class="shadow-lg border rounded p-4 mb-4 bg-white" />
		<h2 class="fw-bold text-danger mb-5" style="font-size: 3vw;">Expira en: {timeLeft}s</h2>
		<button class="btn btn-outline-secondary btn-lg" onclick={toggleFullScreen}>Salir de Pantalla Completa</button>
	{/if}
</div>

{/if}
