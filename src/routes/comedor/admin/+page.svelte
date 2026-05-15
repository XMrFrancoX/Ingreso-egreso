<script>
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { goto } from '$app/navigation';

	let session = $state(null);
	let loading = $state(true);
	let errorMsg = $state('');
	let successMsg = $state('');

	let cursos = $state([]);
	let alumnos = $state([]);
	let nuevoCursoNombre = $state('');
	let addingCurso = $state(false);
	let savingAlumnos = $state(new Set());

	let movimientos = $state([]);
    let selectedAlumnoId = $state('');
    let isAuthorizing = $state(false);

	const DIAS = ['L', 'M', 'X', 'J', 'V'];
	const DIAS_NOMBRE = { L: 'Lunes', M: 'Martes', X: 'Miércoles', J: 'Jueves', V: 'Viernes' };

	function showSuccess(msg) {
		successMsg = msg;
		setTimeout(() => { successMsg = ''; }, 3000);
	}

	onMount(async () => {
		const { data } = await supabase.auth.getSession();
		session = data.session;
		if (!session) { goto('/comedor'); return; }

		const { data: p } = await supabase
			.from('perfiles').select('rol').eq('id', session.user.id).single();
		if (!p || (p.rol !== 'admin' && p.rol !== 'preceptor')) { goto('/comedor'); return; }

		await Promise.all([cargarCursos(), cargarAlumnos(), cargarMovimientos()]);
		loading = false;
	});

    async function cargarMovimientos() {
        const today = new Date().toLocaleDateString('en-CA');
        const { data } = await supabase
            .from('movimientos')
            .select('*')
            .eq('fecha', today);
        movimientos = data || [];
    }

	async function cargarCursos() {
		const { data, error } = await supabase
			.from('cursos')
			.select(`id, nombre, horarios:cursos_horarios(dia, hora_regreso)`)
			.order('nombre');
		if (error) { console.error(error); return; }
		
		cursos = (data ?? []).map(c => {
			const hMap = {};
			c.horarios.forEach(h => { hMap[h.dia] = h.hora_regreso; });
			return { ...c, hMap };
		});
	}

	async function cargarAlumnos() {
		const { data, error } = await supabase
			.from('perfiles')
			.select('id, email, curso_id, curso:curso_id(nombre)')
			.eq('rol', 'student')
			.order('email');
		if (error) { console.error(error); return; }
		alumnos = data ?? [];
	}

	async function agregarCurso() {
		if (!nuevoCursoNombre.trim()) return;
		addingCurso = true;
		const { error } = await supabase.from('cursos').insert({ nombre: nuevoCursoNombre.trim() });
		if (error) { errorMsg = 'Error: ' + error.message; }
		else { nuevoCursoNombre = ''; await cargarCursos(); showSuccess('Curso agregado'); }
		addingCurso = false;
	}

	async function guardarHorario(cursoId, dia, hora) {
		if (!hora) return;
		const { error } = await supabase
			.from('cursos_horarios')
			.upsert({ curso_id: cursoId, dia, hora_regreso: hora }, { onConflict: 'curso_id,dia' });
		if (error) { errorMsg = 'Error al guardar horario: ' + error.message; }
		else { showSuccess(`Horario ${dia} guardado`); }
	}

	async function eliminarCurso(id) {
		if (!confirm('¿Eliminar curso? Esto desvinculará a los alumnos asignados.')) return;
		const { error } = await supabase.from('cursos').delete().eq('id', id);
		if (error) { errorMsg = 'Error: ' + error.message; }
		else { await cargarCursos(); await cargarAlumnos(); showSuccess('Curso eliminado'); }
	}

	async function asignarCurso(alumnoId, cursoId) {
		savingAlumnos.add(alumnoId);
		const { error } = await supabase
			.from('perfiles')
			.update({ curso_id: cursoId || null })
			.eq('id', alumnoId);
		
		if (error) { errorMsg = 'Error al asignar curso: ' + error.message; }
		else { showSuccess('Alumno actualizado'); }
		savingAlumnos.delete(alumnoId);
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
                    firma_ingreso: 'Autorizado por Admin' 
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
                    firma_salida: 'Autorizado por Admin'
                });
            error = err;
        }

        if (error) {
            alert('Error: ' + error.message);
        } else {
            selectedAlumnoId = '';
            await cargarMovimientos();
            // Cerrar modal
            const modal = document.getElementById('autorizarModal');
            const bsModal = bootstrap.Modal.getInstance(modal);
            bsModal.hide();
            showSuccess('Movimiento registrado');
        }
        isAuthorizing = false;
    }

</script>

<svelte:head>
	<title>Configuración Comedor — Escuela Philips</title>
</svelte:head>

<div class="row align-items-center mb-4">
	<div class="col-md-6">
		<h2 class="fw-bold philips-text mb-1">Configuración Comedor</h2>
		<p class="text-muted small mb-0">Gestión de cursos, horarios de regreso y alumnos</p>
	</div>
	<div class="col-md-6 text-md-end mt-3 mt-md-0 d-flex gap-2 justify-content-md-end">
		<button class="btn btn-warning fw-bold px-4 shadow-sm" data-bs-toggle="modal" data-bs-target="#autorizarModal">
			AUTORIZAR ALUMNO
		</button>
		<a href="/comedor/preceptor" class="btn btn-outline-secondary fw-bold px-4 shadow-sm">
			VOLVER AL PANEL
		</a>
	</div>
</div>

<!-- Modal Autorizar Manual -->
<div class="modal fade" id="autorizarModal" tabindex="-1" aria-hidden="true">
	<div class="modal-dialog modal-dialog-centered">
		<div class="modal-content glass-card border-0">
			<div class="modal-header border-0 pb-0">
				<h5 class="modal-title fw-bold philips-text w-100 text-center">Autorización Manual (Admin)</h5>
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

{#if loading}
	<div class="text-center p-5">
		<div class="spinner-border text-primary"></div>
	</div>
{:else}

{#if errorMsg}
	<div class="alert alert-danger border-0 rounded-3 mb-4">{errorMsg}</div>
{/if}
{#if successMsg}
	<div class="alert alert-success border-0 rounded-3 mb-4">{successMsg}</div>
{/if}

<!-- Sección Cursos y Horarios -->
<div class="card glass-card mb-4 overflow-hidden">
	<div class="p-4 border-bottom d-flex justify-content-between align-items-center bg-light">
		<h5 class="fw-bold mb-0">Gestión de Cursos y Horarios</h5>
		<div class="input-group" style="max-width: 300px;">
			<input type="text" class="form-control form-control-sm" placeholder="Nombre del curso..." bind:value={nuevoCursoNombre} />
			<button class="btn btn-primary btn-sm" onclick={agregarCurso} disabled={addingCurso}>+ Agregar</button>
		</div>
	</div>

	{#if cursos.length === 0}
		<div class="p-4 text-center text-muted small">No hay cursos creados.</div>
	{:else}
		<div class="table-responsive">
			<table class="table table-hover mb-0 align-middle">
				<thead class="table-light text-muted small text-uppercase">
					<tr>
						<th class="ps-4">Curso</th>
						{#each DIAS as dia}
							<th class="text-center">{DIAS_NOMBRE[dia]}</th>
						{/each}
						<th class="pe-4 text-end">Acción</th>
					</tr>
				</thead>
				<tbody>
					{#each cursos as curso (curso.id)}
						<tr>
							<td class="ps-4 fw-bold">{curso.nombre}</td>
							{#each DIAS as dia}
								<td>
									<input 
										type="time" 
										class="form-control form-control-sm mx-auto" 
										style="max-width: 100px;"
										bind:value={curso.hMap[dia]}
										onchange={() => guardarHorario(curso.id, dia, curso.hMap[dia])}
									/>
								</td>
							{/each}
							<td class="pe-4 text-end">
								<button class="btn btn-sm btn-outline-danger" onclick={() => eliminarCurso(curso.id)}>🗑</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<!-- Sección Asignación de Alumnos -->
<div class="card glass-card mb-4 overflow-hidden">
	<div class="p-4 border-bottom bg-light">
		<h5 class="fw-bold mb-0">Asignación de Alumnos a Cursos</h5>
		<p class="text-muted small mb-0">Vinculá cada email con su curso correspondiente</p>
	</div>

	{#if alumnos.length === 0}
		<div class="p-4 text-center text-muted small">No hay alumnos registrados.</div>
	{:else}
		<div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
			<table class="table table-hover mb-0 align-middle">
				<thead class="table-light text-muted small text-uppercase sticky-top">
					<tr>
						<th class="ps-4">Email</th>
						<th class="pe-4">Asignar Curso</th>
					</tr>
				</thead>
				<tbody>
					{#each alumnos as alumno (alumno.id)}
						<tr>
							<td class="ps-4 small">{alumno.email}</td>
							<td class="pe-4">
								<select 
									class="form-select form-select-sm" 
									style="max-width: 250px;"
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
	{/if}
</div>

{/if}
