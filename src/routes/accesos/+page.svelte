<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { supabase } from '$lib/supabase';
	import { auth } from '$lib/auth.svelte';
	import { confirmDialog } from '$lib/utils/confirm';
	import { DIAS, DIA_NOMBRE, type Dia } from '$lib/fechas';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import TimePicker from '$lib/components/TimePicker.svelte';
	import { Plus, Trash2, LoaderCircle, Search, School, Info } from '@lucide/svelte';

	type Curso = { id: string; nombre: string; horas: Partial<Record<Dia, string>>; secciones: Set<string> };
	type Alumno = { id: string; email: string; curso_id: string | null };

	// Recreativo está siempre disponible para todos los alumnos: sólo se configuran estos dos.
	const SECCIONES = [
		{ key: 'comedor', label: 'Comedor' },
		{ key: 'PP', label: 'Pasantías' }
	];

	let tab = $state(page.url.searchParams.get('tab') === 'alumnos' ? 'alumnos' : 'cursos');
	let cursos = $state<Curso[]>([]);
	let alumnos = $state<Alumno[]>([]);
	let cargando = $state(true);

	async function cargar() {
		const [c, p, a] = await Promise.all([
			supabase.from('cursos').select('id, nombre, horarios:cursos_horarios(dia, hora_regreso)').order('nombre'),
			supabase.from('seccion_cursos_permitidos').select('seccion, curso_id'),
			supabase.from('perfiles').select('id, email, curso_id').eq('rol', 'student').order('email')
		]);
		if (c.error || p.error || a.error) toast.error('No se pudieron cargar los datos. Probá recargar.');
		cursos = (c.data ?? []).map((cu) => ({
			id: cu.id,
			nombre: cu.nombre,
			horas: Object.fromEntries((cu.horarios ?? []).map((h) => [h.dia, h.hora_regreso.slice(0, 5)])),
			secciones: new Set((p.data ?? []).filter((x) => x.curso_id === cu.id).map((x) => x.seccion))
		}));
		alumnos = a.data ?? [];
		cargando = false;
	}

	onMount(cargar);

	let alumnosPorCurso = $derived(
		alumnos.reduce<Record<string, number>>((acc, a) => {
			if (a.curso_id) acc[a.curso_id] = (acc[a.curso_id] ?? 0) + 1;
			return acc;
		}, {})
	);

	// ---------- cursos ----------
	let nuevoCurso = $state('');
	let agregando = $state(false);

	async function agregarCurso(event: Event) {
		event.preventDefault();
		const nombre = nuevoCurso.trim();
		if (!nombre) return;
		agregando = true;
		const { error } = await supabase.from('cursos').insert({ nombre });
		agregando = false;
		if (error) return toast.error(error.code === '23505' ? 'Ya existe un curso con ese nombre.' : 'No se pudo agregar: ' + error.message);
		nuevoCurso = '';
		toast.success(`Curso ${nombre} agregado`);
		await cargar();
	}

	async function borrarCurso(c: Curso) {
		const n = alumnosPorCurso[c.id] ?? 0;
		const ok = await confirmDialog({
			title: `¿Borrar el curso ${c.nombre}?`,
			description:
				(n > 0 ? `Sus ${n} alumnos quedan sin curso. ` : '') + 'También se borran sus horarios y los módulos habilitados.',
			confirmLabel: 'Borrar',
			destructive: true
		});
		if (!ok) return;
		const { data, error } = await supabase.from('cursos').delete().eq('id', c.id).select('id');
		if (error || !data?.length) return toast.error('No se pudo borrar' + (error ? ': ' + error.message : '.'));
		toast.success(`Curso ${c.nombre} borrado`);
		await cargar();
	}

	async function cambiarSeccion(c: Curso, seccion: string, habilitada: boolean) {
		const { error } = habilitada
			? await supabase.from('seccion_cursos_permitidos').insert({ seccion, curso_id: c.id })
			: await supabase.from('seccion_cursos_permitidos').delete().eq('seccion', seccion).eq('curso_id', c.id);
		if (error) {
			toast.error('No se pudo guardar: ' + error.message);
			return;
		}
		const s = new Set(c.secciones);
		if (habilitada) s.add(seccion);
		else s.delete(seccion);
		c.secciones = s;
		// El cambio puede afectar lo que ve el propio usuario si fuera alumno de ese curso.
		if (auth.perfil?.curso_id === c.id) void auth.recargarPerfil();
	}

	async function guardarHora(c: Curso, dia: Dia, hora: string) {
		if (!hora || c.horas[dia] === hora) return;
		const anterior = c.horas[dia];
		c.horas[dia] = hora;
		const { error } = await supabase
			.from('cursos_horarios')
			.upsert({ curso_id: c.id, dia, hora_regreso: hora }, { onConflict: 'curso_id,dia' });
		if (error) {
			c.horas[dia] = anterior;
			toast.error('No se pudo guardar el horario: ' + error.message);
			return;
		}
		toast.success(`${c.nombre}: regreso del ${DIA_NOMBRE[dia].toLowerCase()} a las ${hora}`);
	}

	// ---------- alumnos ----------
	let busqueda = $state('');
	let soloSinCurso = $state(false);
	const MAX = 100;

	let filtrados = $derived(
		alumnos.filter((a) => a.email.toLowerCase().includes(busqueda.trim().toLowerCase()) && (!soloSinCurso || !a.curso_id))
	);

	async function asignarCurso(a: Alumno, cursoId: string) {
		const anterior = a.curso_id;
		a.curso_id = cursoId || null;
		const { data, error } = await supabase.from('perfiles').update({ curso_id: a.curso_id }).eq('id', a.id).select('id');
		if (error || !data?.length) {
			a.curso_id = anterior;
			toast.error('No se pudo asignar el curso' + (error ? ': ' + error.message : '.'));
			return;
		}
		const nombre = cursos.find((c) => c.id === a.curso_id)?.nombre;
		toast.success(nombre ? `${a.email} → ${nombre}` : `${a.email} quedó sin curso`);
	}
</script>

<svelte:head>
	<title>Cursos y accesos • Ingresos y egresos</title>
</svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">Cursos y accesos</h1>
		<p class="text-muted-foreground">Qué módulos usa cada curso, horarios de regreso del comedor y curso de cada alumno</p>
	</div>

	<Tabs.Root bind:value={tab}>
		<Tabs.List>
			<Tabs.Trigger value="cursos">Cursos</Tabs.Trigger>
			<Tabs.Trigger value="alumnos">Alumnos</Tabs.Trigger>
		</Tabs.List>
	</Tabs.Root>

	{#if cargando}
		<div class="grid gap-4 md:grid-cols-2">
			{#each Array(4) as _, i (i)}<Skeleton class="h-48 rounded-xl" />{/each}
		</div>
	{:else if tab === 'cursos'}
		<form class="flex max-w-md gap-2" onsubmit={agregarCurso}>
			<Input bind:value={nuevoCurso} placeholder="Nuevo curso (ej. 6ET)" aria-label="Nombre del curso nuevo" class="min-w-0 flex-1" />
			<Button type="submit" disabled={agregando || !nuevoCurso.trim()}>
				{#if agregando}<LoaderCircle class="animate-spin" />{:else}<Plus />{/if}
				Agregar
			</Button>
		</form>

		<p class="-mt-2 flex items-center gap-2 text-sm text-muted-foreground">
			<Info class="size-4 shrink-0" />
			Recreativo está siempre disponible para todos los alumnos, tengan o no curso.
		</p>

		{#if cursos.length === 0}
			<div class="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-muted-foreground">
				<School class="size-10" strokeWidth={1.5} />
				<p>Todavía no hay cursos.</p>
			</div>
		{:else}
			<div class="grid gap-4 md:grid-cols-2">
				{#each cursos as c (c.id)}
					<Card.Root class="gap-4">
						<Card.Header class="flex flex-row items-center gap-2">
							<Card.Title class="text-lg">{c.nombre}</Card.Title>
							<Badge variant="secondary">{alumnosPorCurso[c.id] ?? 0} alumnos</Badge>
							<Button
								variant="ghost"
								size="icon-sm"
								class="ml-auto text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
								aria-label="Borrar el curso {c.nombre}"
								onclick={() => borrarCurso(c)}
							>
								<Trash2 />
							</Button>
						</Card.Header>
						<Card.Content class="grid gap-4">
							<div class="flex flex-wrap gap-x-6 gap-y-2">
								{#each SECCIONES as s (s.key)}
									<div class="flex items-center gap-2">
										<Switch
											id="sec-{c.id}-{s.key}"
											checked={c.secciones.has(s.key)}
											onCheckedChange={(v) => cambiarSeccion(c, s.key, v)}
										/>
										<Label for="sec-{c.id}-{s.key}" class="font-normal">{s.label}</Label>
									</div>
								{/each}
							</div>
							<div class="grid gap-2">
								<span class="text-sm text-muted-foreground">Regreso del comedor</span>
								<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
									{#each DIAS as dia (dia)}
										<div class="grid gap-1">
											<span class="text-xs text-muted-foreground">{DIA_NOMBRE[dia]}</span>
											<TimePicker
												bind:value={() => c.horas[dia] ?? '', (v) => guardarHora(c, dia, v)}
												fromHour={10}
												toHour={17}
											/>
										</div>
									{/each}
								</div>
							</div>
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		{/if}
	{:else}
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
			<div class="relative sm:w-80">
				<Search class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input bind:value={busqueda} placeholder="Buscar por mail" class="pl-8" aria-label="Buscar alumno por mail" />
			</div>
			<div class="flex items-center gap-2">
				<Switch id="sin-curso" bind:checked={soloSinCurso} />
				<Label for="sin-curso" class="font-normal">Sólo sin curso</Label>
			</div>
			<span class="text-sm text-muted-foreground sm:ml-auto">
				{filtrados.length} de {alumnos.length} alumnos
			</span>
		</div>

		<Card.Root class="gap-0 py-0">
			{#if filtrados.length === 0}
				<p class="py-12 text-center text-sm text-muted-foreground">No hay alumnos con esos criterios.</p>
			{:else}
				<ul class="divide-y">
					{#each filtrados.slice(0, MAX) as a (a.id)}
						<li class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
							<div class="flex min-w-0 flex-1 items-center gap-2">
								<span class="truncate">{a.email}</span>
								{#if !a.curso_id}
									<Badge variant="outline" class="shrink-0 border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300">Sin curso</Badge>
								{/if}
							</div>
							<Select.Root type="single" value={a.curso_id ?? ''} onValueChange={(v) => asignarCurso(a, v)}>
								<Select.Trigger class="w-full sm:w-44" aria-label="Curso de {a.email}">
									{cursos.find((c) => c.id === a.curso_id)?.nombre ?? 'Sin curso'}
								</Select.Trigger>
								<Select.Content>
									<Select.Item value="">Sin curso</Select.Item>
									{#each cursos as c (c.id)}
										<Select.Item value={c.id}>{c.nombre}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</li>
					{/each}
				</ul>
				{#if filtrados.length > MAX}
					<p class="border-t px-4 py-3 text-sm text-muted-foreground">
						Mostrando {MAX} de {filtrados.length}: buscá para encontrar al resto.
					</p>
				{/if}
			{/if}
		</Card.Root>
	{/if}
</div>
