<script>
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';

	let loading = $state(true);
	let session = $state(null);
	let perfil = $state(null);
	let errorMsg = $state('');
	let accessDeniedMsg = $state('');

	let seccionesPermitidas = $state(new Set());

	// ── CONFIG MODAL ──────────────────────────────────────────
	let showConfig = $state(false);
	let cursos = $state([]);
	let alumnos = $state([]);
	let visibilidad = $state({});
	let loadingConfig = $state(false);
	let savingConfig = $state(false);
	let configMsg = $state('');
	let nuevoCursoNombre = $state('');
	let addingCurso = $state(false);
	let savingAlumnos = $state(new Set());

	// Filtros pestaña alumnos
	let alumnoFiltro = $state('');
	let soloSinCurso = $state(false);

	// Tab activo en el modal
	let activeTab = $state('visibilidad'); // 'visibilidad' | 'alumnos'

	const SECCIONES = [
		{ key: 'comedor',    label: 'Comedor',    icon: 'bi-cup-hot-fill' },
		{ key: 'PP',         label: 'Pasantías',  icon: 'bi-briefcase-fill' },
		{ key: 'recreativo', label: 'Recreativo', icon: 'bi-controller' },
	];

	// ── INICIO ────────────────────────────────────────────────
	onMount(async () => {
		const params = new URLSearchParams(window.location.search);
		if (params.get('acceso') === 'denegado') {
			const seccion = params.get('seccion') || '';
			accessDeniedMsg = `No tenés permiso para acceder${seccion ? ' a ' + seccion : ' a esa sección'}.`;
			history.replaceState({}, '', '/');
		}

		const { data } = await supabase.auth.getSession();
		session = data.session;
		if (session) await cargarPerfil(session);
		loading = false;

		supabase.auth.onAuthStateChange(async (_event, _session) => {
			session = _session;
			if (session) {
				loading = true;
				await cargarPerfil(session);
				loading = false;
			} else {
				perfil = null;
				seccionesPermitidas = new Set();
			}
		});
	});

	async function cargarPerfil(userSession, retries = 3) {
		const { data, error } = await supabase
			.from('perfiles')
			.select('rol, curso_id, curso:curso_id(nombre)')
			.eq('id', userSession.user.id)
			.single();

		if (error || !data) {
			if (retries > 0) {
				await new Promise(r => setTimeout(r, 1000));
				return cargarPerfil(userSession, retries - 1);
			}
			return;
		}

		await aplicarPrecargaRol(userSession, data);

		perfil = data;
		if (data.rol === 'student') await cargarSeccionesPermitidas(data.curso_id);
	}

	// Si un admin precargó un rol (preceptor/admin) para este email antes de que
	// existiera la cuenta, se aplica acá y se consume (la borra) el propio trigger de DB.
	async function aplicarPrecargaRol(userSession, perfilData) {
		const { data: precarga } = await supabase
			.from('roles_precargados')
			.select('rol')
			.eq('email', userSession.user.email)
			.maybeSingle();

		if (!precarga || precarga.rol === perfilData.rol) return;

		const { data: actualizado, error } = await supabase
			.from('perfiles')
			.update({ rol: precarga.rol })
			.eq('id', userSession.user.id)
			.select('rol')
			.maybeSingle();

		if (error || !actualizado) {
			console.error('Error aplicando precarga de rol:', error);
			return;
		}
		perfilData.rol = actualizado.rol;
	}

	async function cargarSeccionesPermitidas(cursoId) {
		// Recreativo siempre está disponible para alumnos, tengan o no curso asignado
		const base = new Set(['recreativo']);
		if (!cursoId) { seccionesPermitidas = base; return; }
		const { data } = await supabase
			.from('seccion_cursos_permitidos')
			.select('seccion')
			.eq('curso_id', cursoId);
		seccionesPermitidas = new Set([...base, ...(data ?? []).map(r => r.seccion)]);
	}

	// ── AUTH ──────────────────────────────────────────────────
	async function loginGoogle() {
		errorMsg = '';
		const { error } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: window.location.origin + '/',
				queryParams: { hd: 'philips.edu.ar', prompt: 'select_account' }
			}
		});
		if (error) errorMsg = 'Error al iniciar sesión: ' + error.message;
	}

	async function logout() {
		await supabase.auth.signOut();
		session = null; perfil = null; seccionesPermitidas = new Set();
	}

	// ── VISIBILIDAD ───────────────────────────────────────────
	function esPreceptor() { return perfil?.rol === 'preceptor' || perfil?.rol === 'admin'; }
	function puedeVerSeccion(key) { return esPreceptor() || seccionesPermitidas.has(key); }
	function seccionesVisibles() { return SECCIONES.filter(s => puedeVerSeccion(s.key)); }

	// ── CONFIG MODAL ──────────────────────────────────────────
	async function abrirConfig() {
		showConfig = true;
		activeTab = 'visibilidad';
		loadingConfig = true;
		await Promise.all([cargarCursos(), cargarVisibilidad(), cargarAlumnos()]);
		loadingConfig = false;
	}

	function cerrarConfig() { showConfig = false; configMsg = ''; nuevoCursoNombre = ''; }

	async function cargarCursos() {
		const { data } = await supabase.from('cursos').select('id, nombre').order('nombre');
		cursos = data ?? [];
	}

	async function cargarAlumnos() {
		const { data } = await supabase
			.from('perfiles')
			.select('id, email, curso_id, curso:curso_id(nombre)')
			.eq('rol', 'student')
			.order('email');
		alumnos = data ?? [];
	}

	async function cargarVisibilidad() {
		const { data } = await supabase.from('seccion_cursos_permitidos').select('seccion, curso_id');
		const v = { comedor: new Set(), PP: new Set(), recreativo: new Set() };
		(data ?? []).forEach(r => { v[r.seccion]?.add(r.curso_id); });
		visibilidad = v;
	}

	async function togglePermiso(seccion, cursoId, habilitado) {
		savingConfig = true;
		if (habilitado) {
			await supabase.from('seccion_cursos_permitidos').insert({ seccion, curso_id: cursoId });
			visibilidad[seccion] = new Set([...visibilidad[seccion], cursoId]);
		} else {
			await supabase.from('seccion_cursos_permitidos').delete().eq('seccion', seccion).eq('curso_id', cursoId);
			visibilidad[seccion] = new Set([...visibilidad[seccion]].filter(id => id !== cursoId));
		}
		flashMsg('Guardado');
		savingConfig = false;
	}

	async function agregarCurso() {
		if (!nuevoCursoNombre.trim()) return;
		addingCurso = true;
		const { error } = await supabase.from('cursos').insert({ nombre: nuevoCursoNombre.trim() });
		if (error) { configMsg = 'Error: ' + error.message; }
		else { nuevoCursoNombre = ''; await cargarCursos(); flashMsg('Curso agregado'); }
		addingCurso = false;
	}

	async function eliminarCurso(id, nombre) {
		if (!confirm(`¿Eliminar el curso "${nombre}"? Esto quitará los permisos y desvinculará alumnos.`)) return;
		const { error } = await supabase.from('cursos').delete().eq('id', id);
		if (error) { configMsg = 'Error: ' + error.message; }
		else { await Promise.all([cargarCursos(), cargarVisibilidad(), cargarAlumnos()]); flashMsg('Curso eliminado'); }
	}

	async function asignarCurso(alumnoId, cursoId) {
		savingAlumnos.add(alumnoId);
		savingAlumnos = new Set(savingAlumnos);
		await supabase.from('perfiles').update({ curso_id: cursoId || null }).eq('id', alumnoId);
		savingAlumnos.delete(alumnoId);
		savingAlumnos = new Set(savingAlumnos);
		flashMsg('Alumno actualizado');
	}

	function flashMsg(msg) {
		configMsg = msg;
		setTimeout(() => { configMsg = ''; }, 2500);
	}
</script>

<svelte:head>
	<title>Plataforma de Control — Escuela Philips</title>
</svelte:head>

<!-- ENCABEZADO -->
<div class="row justify-content-center mt-5 mb-4">
	<div class="col-md-6 text-center">
		<img src="https://www.philips.edu.ar/favicon.png" alt="Philips" width="80" class="mb-3 shadow-sm" style="border-radius:16px;" />
		<h1 class="fw-bold philips-text fs-1">Escuela Técnica Philips</h1>
		<p class="text-muted fs-5">Plataforma unificada de control de alumnos</p>
	</div>
</div>

<!-- LOADING -->
{#if loading}
	<div class="row justify-content-center mt-4">
		<div class="col-auto text-center">
			<div class="spinner-border text-primary mb-3" role="status"></div>
			<p class="text-muted small">Cargando tu perfil...</p>
		</div>
	</div>

<!-- SIN SESIÓN -->
{:else if !session}
	{#if errorMsg}
		<div class="row justify-content-center mb-3">
			<div class="col-md-5">
				<div class="alert alert-danger text-center shadow-sm border-0 rounded-3">{errorMsg}</div>
			</div>
		</div>
	{/if}
	{#if accessDeniedMsg}
		<div class="row justify-content-center mb-3">
			<div class="col-md-5">
				<div class="alert alert-warning text-center shadow-sm border-0 rounded-3">
					<i class="bi bi-lock-fill me-2"></i>{accessDeniedMsg}
				</div>
			</div>
		</div>
	{/if}
	<div class="row justify-content-center">
		<div class="col-md-5">
			<div class="card glass-card shadow-sm p-5 text-center">
				<h4 class="fw-bold mb-4">Acceso Institucional</h4>
				<button
					id="btn-google-login"
					class="btn btn-lg btn-white border shadow-sm d-flex align-items-center justify-content-center mx-auto gap-2 px-4"
					onclick={loginGoogle}
				>
					<img src="https://www.google.com/favicon.ico" alt="Google" width="20" />
					Iniciar sesión con Google
				</button>
				<p class="text-muted small mt-3">Usá tu cuenta institucional @philips.edu.ar</p>
			</div>
		</div>
	</div>

<!-- CON SESIÓN -->
{:else}
	<!-- Barra superior -->
	<div class="row justify-content-end mb-4 px-2">
		<div class="col-auto d-flex align-items-center gap-2">
			{#if esPreceptor()}
				<button
					id="btn-config-accesos"
					class="btn btn-outline-secondary btn-sm fw-bold d-flex align-items-center gap-2 px-3"
					onclick={abrirConfig}
				>
					<i class="bi bi-gear-fill"></i> Configurar Accesos
				</button>
			{/if}
			<span class="text-muted small">{session.user.email}</span>
			<button class="btn btn-outline-danger btn-sm d-flex align-items-center gap-1" onclick={logout}>
				<i class="bi bi-box-arrow-right"></i> Salir
			</button>
		</div>
	</div>

	{#if accessDeniedMsg}
		<div class="row justify-content-center mb-3">
			<div class="col-md-8">
				<div class="alert alert-warning border-0 rounded-3 text-center shadow-sm">
					<i class="bi bi-lock-fill me-2"></i>{accessDeniedMsg}
				</div>
			</div>
		</div>
	{/if}

	{@const visibles = seccionesVisibles()}
	{#if visibles.length === 0 && perfil?.rol === 'student'}

		<div class="row justify-content-center mt-3">
			<div class="col-md-6 text-center">
				<div class="card glass-card p-5 border-0 shadow-sm">
					<i class="bi bi-slash-circle text-muted mb-3" style="font-size: 3rem;"></i>
					<h5 class="fw-bold mb-2">Sin secciones habilitadas</h5>
					<p class="text-muted small mb-0">
						Tu curso (<strong>{perfil?.curso?.nombre}</strong>) aún no tiene secciones habilitadas. Consultá con un preceptor.
					</p>
				</div>
			</div>
		</div>
	{:else}
		{#if perfil?.rol === 'student' && !perfil?.curso_id}
			<div class="row justify-content-center mb-3">
				<div class="col-md-8">
					<div class="alert alert-info border-0 rounded-3 text-center shadow-sm py-2">
						<i class="bi bi-info-circle-fill me-2"></i>
						Tu cuenta no tiene curso asignado aún. Por ahora podés usar <strong>Recreativo</strong>. Comunicate con un preceptor para que te asignen a tu curso.
					</div>
				</div>
			</div>
		{/if}
		<div class="row justify-content-center px-3">

				{#if puedeVerSeccion('comedor')}
				<div class="col-md-5 col-lg-4 mb-4">
					<div class="card glass-card h-100 p-5 text-center transition-hover" style="cursor:pointer;" onclick={() => window.location.href='/comedor'} role="button" tabindex="0" onkeydown={(e) => e.key==='Enter' && (window.location.href='/comedor')}>
						<div class="mb-4">
							<div class="bg-primary-subtle text-primary rounded-circle d-inline-flex p-3 mb-3 shadow-sm">
								<i class="bi bi-cup-hot-fill" style="font-size:2rem;"></i>
							</div>
							<h3 class="fw-bold philips-text mb-2">Comedor</h3>
							<p class="text-muted small mb-0">Gestión de salida e ingreso durante horario de almuerzo</p>
						</div>
						<button class="btn btn-primary fw-bold w-100 rounded-pill shadow-sm">Ingresar</button>
					</div>
				</div>
				{/if}

				{#if puedeVerSeccion('PP')}
				<div class="col-md-5 col-lg-4 mb-4">
					<div class="card glass-card h-100 p-5 text-center transition-hover" style="cursor:pointer;" onclick={() => window.location.href='/PP'} role="button" tabindex="0" onkeydown={(e) => e.key==='Enter' && (window.location.href='/PP')}>
						<div class="mb-4">
							<div class="bg-primary-subtle text-primary rounded-circle d-inline-flex p-3 mb-3 shadow-sm">
								<i class="bi bi-briefcase-fill" style="font-size:2rem;"></i>
							</div>
							<h3 class="fw-bold philips-text mb-2">Pasantías (PP)</h3>
							<p class="text-muted small mb-0">Registro de asistencia a Prácticas Profesionalizantes</p>
						</div>
						<button class="btn btn-primary fw-bold w-100 rounded-pill shadow-sm">Ingresar</button>
					</div>
				</div>
				{/if}

				{#if puedeVerSeccion('recreativo')}
				<div class="col-md-5 col-lg-4 mb-4">
					<div class="card glass-card h-100 p-5 text-center transition-hover" style="cursor:pointer;" onclick={() => window.location.href='/recreativo'} role="button" tabindex="0" onkeydown={(e) => e.key==='Enter' && (window.location.href='/recreativo')}>
						<div class="mb-4">
							<div class="bg-primary-subtle text-primary rounded-circle d-inline-flex p-3 mb-3 shadow-sm">
								<i class="bi bi-controller" style="font-size:2rem;"></i>
							</div>
							<h3 class="fw-bold philips-text mb-2">Recreativo</h3>
							<p class="text-muted small mb-0">Gestión de préstamos de paletas, pelotas, etc.</p>
						</div>
						<button class="btn btn-primary fw-bold w-100 rounded-pill shadow-sm">Ingresar</button>
					</div>
				</div>
				{/if}

		</div>
	{/if}
{/if}

<!-- ══════════════════════════════════════════
     MODAL DE CONFIGURACIÓN
═══════════════════════════════════════════ -->
{#if showConfig}
<div class="modal-backdrop-custom" onclick={cerrarConfig} role="button" tabindex="-1" aria-label="Cerrar"></div>
<div class="config-modal" role="dialog" aria-modal="true" aria-labelledby="config-title">

	<div class="config-modal-header">
		<h5 class="fw-bold philips-text mb-0" id="config-title">
			<i class="bi bi-gear-fill me-2"></i>Configurar Accesos
		</h5>
		<button class="btn-close" onclick={cerrarConfig} aria-label="Cerrar"></button>
	</div>

	<!-- Tabs -->
	<div class="border-bottom px-3">
		<ul class="nav nav-tabs border-0">
			<li class="nav-item">
				<button
					class="nav-link {activeTab === 'visibilidad' ? 'active fw-bold' : 'text-muted'}"
					onclick={() => activeTab = 'visibilidad'}
				>
					<i class="bi bi-eye me-1"></i>Visibilidad por Sección
				</button>
			</li>
			<li class="nav-item">
				<button
					class="nav-link {activeTab === 'alumnos' ? 'active fw-bold' : 'text-muted'}"
					onclick={() => activeTab = 'alumnos'}
				>
					<i class="bi bi-people me-1"></i>Asignar Cursos a Alumnos
				</button>
			</li>
		</ul>
	</div>

	<div class="config-modal-body">
		{#if loadingConfig}
			<div class="text-center py-5">
				<div class="spinner-border text-primary"></div>
				<p class="text-muted small mt-2">Cargando...</p>
			</div>
		{:else}
			{#if configMsg}
				<div class="alert alert-success border-0 py-2 small mb-3">
					<i class="bi bi-check-circle-fill me-1"></i>{configMsg}
				</div>
			{/if}

			<!-- ── TAB: VISIBILIDAD ── -->
			{#if activeTab === 'visibilidad'}
				<!-- Crear curso -->
				<div class="mb-4">
					<p class="text-muted small fw-bold text-uppercase mb-2">Nuevo curso</p>
					<div class="input-group input-group-sm">
						<input
							type="text"
							class="form-control"
							placeholder="Nombre del curso (ej: 6ET)"
							bind:value={nuevoCursoNombre}
							onkeydown={(e) => e.key === 'Enter' && agregarCurso()}
						/>
						<button
							class="btn btn-primary d-flex align-items-center gap-1"
							onclick={agregarCurso}
							disabled={addingCurso || !nuevoCursoNombre.trim()}
						>
							{#if addingCurso}
								<span class="spinner-border spinner-border-sm"></span>
							{:else}
								<i class="bi bi-plus-lg"></i> Agregar
							{/if}
						</button>
					</div>
				</div>

				{#if cursos.length === 0}
					<p class="text-center text-muted small py-3">No hay cursos creados todavía.</p>
				{:else}
					<div class="table-responsive">
						<table class="table table-hover align-middle mb-0 config-table">
							<thead class="table-light text-muted small text-uppercase">
								<tr>
									<th class="ps-3">Curso</th>
									{#each SECCIONES as s}
										<th class="text-center">
											<i class="bi {s.icon} me-1"></i>{s.label}
										</th>
									{/each}
									<th class="pe-3 text-end">Acción</th>
								</tr>
							</thead>
							<tbody>
								{#each cursos as curso (curso.id)}
									<tr>
										<td class="ps-3 fw-bold">{curso.nombre}</td>
										{#each SECCIONES as s}
											<td class="text-center">
												<div class="form-check d-flex justify-content-center mb-0">
													<input
														class="form-check-input"
														type="checkbox"
														id="perm-{s.key}-{curso.id}"
														checked={visibilidad[s.key]?.has(curso.id) ?? false}
														disabled={savingConfig}
														onchange={(e) => togglePermiso(s.key, curso.id, e.target.checked)}
													/>
												</div>
											</td>
										{/each}
										<td class="pe-3 text-end">
											<button
												class="btn btn-sm btn-outline-danger"
												onclick={() => eliminarCurso(curso.id, curso.nombre)}
												title="Eliminar curso"
											>
												<i class="bi bi-trash"></i>
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<p class="text-muted small mt-2 mb-0">Los cambios se guardan al tildar/destildar.</p>
				{/if}

			<!-- ── TAB: ALUMNOS ── -->
			{:else if activeTab === 'alumnos'}
				{#if alumnos.length === 0}
					<p class="text-center text-muted small py-4">No hay alumnos registrados aún.</p>
				{:else}
					<!-- Barra de búsqueda + filtro -->
					<div class="d-flex gap-2 mb-3 flex-wrap align-items-center">
						<div class="input-group input-group-sm flex-grow-1" style="min-width: 200px;">
							<span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
							<input
								type="text"
								class="form-control border-start-0"
								placeholder="Buscar por email..."
								bind:value={alumnoFiltro}
							/>
						</div>
						<div class="form-check form-check-inline mb-0">
							<input
								class="form-check-input"
								type="checkbox"
								id="filtro-sin-curso"
								bind:checked={soloSinCurso}
							/>
							<label class="form-check-label small" for="filtro-sin-curso">
								Sin curso asignado
							</label>
						</div>
					</div>

					{@const alumnosFiltrados = alumnos.filter(a =>
						a.email.toLowerCase().includes(alumnoFiltro.toLowerCase()) &&
						(!soloSinCurso || !a.curso_id)
					)}

					{#if alumnosFiltrados.length === 0}
						<p class="text-center text-muted small py-3">No se encontraron alumnos con esos criterios.</p>
					{:else}
						<div class="table-responsive" style="max-height: 360px; overflow-y: auto;">
							<table class="table table-hover align-middle mb-0 config-table">
								<thead class="table-light text-muted small text-uppercase sticky-top">
									<tr>
										<th class="ps-3">Email</th>
										<th class="pe-3">Curso asignado</th>
									</tr>
								</thead>
								<tbody>
									{#each alumnosFiltrados as alumno (alumno.id)}
										<tr>
											<td class="ps-3 small">
												{alumno.email}
												{#if !alumno.curso_id}
													<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle ms-1" style="font-size:.65rem;">Sin curso</span>
												{/if}
											</td>
											<td class="pe-3">
												<select
													class="form-select form-select-sm"
													style="max-width: 200px;"
													bind:value={alumno.curso_id}
													onchange={() => asignarCurso(alumno.id, alumno.curso_id)}
													disabled={savingAlumnos.has(alumno.id)}
												>
													<option value={null}>Sin curso</option>
													{#each cursos as c}
														<option value={c.id}>{c.nombre}</option>
													{/each}
												</select>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						<p class="text-muted small mt-2 mb-0">
							Mostrando {alumnosFiltrados.length} de {alumnos.length} alumnos. Los cambios se guardan al seleccionar.
						</p>
					{/if}
				{/if}
			{/if}
		{/if}
	</div>
</div>
{/if}

<style>
	.transition-hover { transition: all 0.3s ease; }
	.transition-hover:hover {
		transform: translateY(-8px);
		box-shadow: 0 12px 40px rgba(11, 94, 170, 0.15) !important;
		border-color: rgba(11, 94, 170, 0.3);
	}

	.modal-backdrop-custom {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		z-index: 1040;
		cursor: pointer;
	}

	.config-modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 1050;
		background: #fff;
		border-radius: 1rem;
		box-shadow: 0 20px 60px rgba(0,0,0,0.2);
		width: min(92vw, 740px);
		max-height: 88vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.config-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid #e9ecef;
		flex-shrink: 0;
	}

	.config-modal-body {
		padding: 1.25rem 1.5rem;
		overflow-y: auto;
		flex: 1;
	}

	.config-table th, .config-table td { padding: 0.6rem 0.5rem; }

	.nav-link { border: none; background: none; padding: 0.65rem 1rem; cursor: pointer; }
	.nav-link.active { border-bottom: 2px solid #0B5EAA; color: #0B5EAA; }
</style>
