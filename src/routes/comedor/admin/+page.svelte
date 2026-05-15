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

		await Promise.all([cargarCursos(), cargarAlumnos()]);
		loading = false;
	});

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
			.select('id, email, curso_id')
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
</script>

<svelte:head>
	<title>Configuración Comedor — Escuela Philips</title>
</svelte:head>

<div class="row align-items-center mb-4">
	<div class="col-md-6">
		<h2 class="fw-bold philips-text mb-1">Configuración Comedor</h2>
		<p class="text-muted small mb-0">Gestión de cursos, horarios de regreso y alumnos</p>
	</div>
	<div class="col-md-6 text-md-end mt-3 mt-md-0">
		<a href="/comedor/preceptor" class="btn btn-outline-secondary fw-bold px-4 shadow-sm">
			VOLVER AL PANEL
		</a>
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
