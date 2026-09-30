<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { supabase } from '$lib/supabase';
	import { auth } from '$lib/auth.svelte';
	import { fmtHora, hoyISO, horaAhora } from '$lib/fechas';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import QrFirma from '$lib/components/QrFirma.svelte';
	import AlumnoPicker, { type AlumnoOpcion } from '$lib/components/AlumnoPicker.svelte';
	import { Plus, LoaderCircle, CornerDownLeft, PackageOpen, ClipboardCheck, Volleyball } from '@lucide/svelte';

	type Movimiento = {
		id: string;
		perfil_id: string;
		fecha: string;
		hora_retiro: string;
		hora_devolucion: string | null;
		estado_devolucion: string | null;
		preceptor_devolucion_id: string | null;
		observaciones: string | null;
		perfil: { email: string; curso: { nombre: string } | null } | null;
		item: { nombre: string } | null;
	};
	type Item = { id: string; nombre: string; activo: boolean | null };

	const ESTADOS = [
		{ value: 'Bueno', label: 'Bueno', clase: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
		{ value: 'Roto', label: 'Roto / dañado', clase: 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300' },
		{ value: 'Perdido', label: 'Perdido / incompleto', clase: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300' }
	];

	let tab = $state(page.url.searchParams.get('tab') === 'items' ? 'items' : 'prestamos');
	let fecha = $state(hoyISO());
	let movimientos = $state<Movimiento[]>([]);
	let cargando = $state(true);
	let items = $state<Item[]>([]);
	let alumnos = $state<AlumnoOpcion[]>([]);
	let reloj: ReturnType<typeof setInterval> | undefined;

	let sinDevolver = $derived(movimientos.filter((m) => !m.hora_devolucion).length);
	let devueltos = $derived(movimientos.length - sinDevolver);

	async function cargarMovimientos() {
		const { data, error } = await supabase
			.from('recreativo_movimientos')
			.select(
				'id, perfil_id, fecha, hora_retiro, hora_devolucion, estado_devolucion, preceptor_devolucion_id, observaciones, perfil:perfil_id(email, curso:curso_id(nombre)), item:item_id(nombre)'
			)
			.eq('fecha', fecha)
			.order('hora_retiro', { ascending: false });
		if (error) toast.error('No se pudieron cargar los préstamos: ' + error.message);
		else movimientos = data as unknown as Movimiento[];
		cargando = false;
	}

	async function cargarItems() {
		const { data } = await supabase.from('recreativo_items').select('id, nombre, activo').order('nombre');
		items = data ?? [];
	}

	async function cargarAlumnos() {
		const { data } = await supabase.from('perfiles').select('id, email, curso:curso_id(nombre)').eq('rol', 'student').order('email');
		alumnos = (data as unknown as AlumnoOpcion[]) ?? [];
	}

	onMount(() => {
		void Promise.all([cargarItems(), cargarAlumnos()]); // los préstamos los carga el $effect de la fecha
		// Refresco automático mientras se mira el día de hoy.
		reloj = setInterval(() => {
			if (fecha === hoyISO() && !document.hidden) void cargarMovimientos();
		}, 10000);
	});
	onDestroy(() => clearInterval(reloj));

	$effect(() => {
		void fecha;
		cargando = true;
		void cargarMovimientos();
	});

	// ---------- retiro manual ----------
	let retiroAbierto = $state(false);
	let retiroAlumno = $state('');
	let retiroItem = $state('');
	let retirando = $state(false);

	async function registrarRetiro() {
		if (!retiroAlumno || !retiroItem) return;
		retirando = true;
		const { error } = await supabase.from('recreativo_movimientos').insert({
			perfil_id: retiroAlumno,
			item_id: retiroItem,
			fecha: hoyISO(),
			hora_retiro: horaAhora(),
			preceptor_retiro_id: auth.perfil!.id
		});
		retirando = false;
		if (error) return toast.error('No se pudo registrar el retiro: ' + error.message);
		toast.success('Retiro registrado');
		retiroAbierto = false;
		retiroAlumno = '';
		retiroItem = '';
		fecha = hoyISO();
		await cargarMovimientos();
	}

	// ---------- devolución / revisión ----------
	let devolucion = $state<Movimiento | null>(null);
	let estado = $state('Bueno');
	let observaciones = $state('');
	let guardando = $state(false);

	function abrirDevolucion(m: Movimiento) {
		devolucion = m;
		estado = m.estado_devolucion ?? 'Bueno';
		observaciones = m.observaciones ?? '';
	}

	async function guardarDevolucion() {
		if (!devolucion) return;
		guardando = true;
		const { error } = await supabase
			.from('recreativo_movimientos')
			.update({
				hora_devolucion: devolucion.hora_devolucion ?? horaAhora(),
				estado_devolucion: estado,
				observaciones: observaciones.trim() || null,
				preceptor_devolucion_id: auth.perfil!.id
			})
			.eq('id', devolucion.id);
		guardando = false;
		if (error) return toast.error('No se pudo guardar: ' + error.message);
		toast.success(devolucion.hora_devolucion ? 'Devolución revisada' : 'Devolución registrada');
		devolucion = null;
		await cargarMovimientos();
	}

	// ---------- ítems ----------
	let nuevoItem = $state('');
	let agregando = $state(false);

	async function agregarItem(event: Event) {
		event.preventDefault();
		const nombre = nuevoItem.trim();
		if (!nombre) return;
		agregando = true;
		const { error } = await supabase.from('recreativo_items').insert({ nombre });
		agregando = false;
		if (error) return toast.error('No se pudo agregar: ' + error.message);
		nuevoItem = '';
		toast.success(`${nombre} agregado`);
		await cargarItems();
	}

	async function cambiarActivo(it: Item, activo: boolean) {
		const { error } = await supabase.from('recreativo_items').update({ activo }).eq('id', it.id);
		if (error) {
			toast.error('No se pudo cambiar: ' + error.message);
			await cargarItems();
			return;
		}
		it.activo = activo;
	}

	const estadoDe = (m: Movimiento) => ESTADOS.find((e) => e.value === m.estado_devolucion);
	let itemsActivos = $derived(items.filter((i) => i.activo));
</script>

<svelte:head>
	<title>Recreativo • Ingresos y egresos</title>
</svelte:head>

{#snippet estadoCelda(m: Movimiento)}
	{#if !m.hora_devolucion}
		<Badge variant="outline" class="border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300">Sin devolver</Badge>
	{:else if !m.preceptor_devolucion_id}
		<Badge variant="outline" class="border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-300">Devuelto por el alumno</Badge>
	{:else}
		{@const e = estadoDe(m)}
		<Badge variant="outline" class={e?.clase} title={m.observaciones ?? undefined}>{e?.label ?? m.estado_devolucion}</Badge>
	{/if}
{/snippet}

{#snippet accion(m: Movimiento)}
	{#if !m.hora_devolucion}
		<Button size="sm" variant="outline" onclick={() => abrirDevolucion(m)}><CornerDownLeft />Devolución</Button>
	{:else if !m.preceptor_devolucion_id}
		<Button size="sm" variant="outline" onclick={() => abrirDevolucion(m)}><ClipboardCheck />Revisar</Button>
	{/if}
{/snippet}

<div class="mx-auto flex max-w-7xl flex-col gap-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">Recreativo</h1>
			<p class="text-muted-foreground">Préstamos de materiales</p>
		</div>
		<Button onclick={() => (retiroAbierto = true)} class="w-full sm:w-auto">
			<Plus />
			Retiro manual
		</Button>
	</div>

	<Tabs.Root bind:value={tab}>
		<Tabs.List>
			<Tabs.Trigger value="prestamos">Préstamos</Tabs.Trigger>
			<Tabs.Trigger value="items">Ítems</Tabs.Trigger>
		</Tabs.List>
	</Tabs.Root>

	{#if tab === 'prestamos'}
		<div class="grid gap-6 lg:grid-cols-[18rem_1fr]">
			<div class="order-2 lg:order-1">
				<QrFirma app="recreativo" />
			</div>

			<div class="order-1 flex min-w-0 flex-col gap-4 lg:order-2">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
					<DatePicker bind:value={fecha} class="sm:w-72" />
					{#if fecha !== hoyISO()}
						<Button variant="ghost" size="sm" class="w-fit" onclick={() => (fecha = hoyISO())}>Volver a hoy</Button>
					{/if}
				</div>

				<div class="grid grid-cols-3 gap-3">
					{#each [{ l: 'Retirados', v: movimientos.length }, { l: 'Sin devolver', v: sinDevolver }, { l: 'Devueltos', v: devueltos }] as s (s.l)}
						<Card.Root class="gap-1 px-4 py-3">
							<span class="text-xs text-muted-foreground">{s.l}</span>
							<span class="text-2xl font-semibold tabular-nums">{s.v}</span>
						</Card.Root>
					{/each}
				</div>

				{#if cargando}
					<Skeleton class="h-64 rounded-xl" />
				{:else if movimientos.length === 0}
					<div class="flex flex-col items-center gap-3 rounded-xl border border-dashed py-14 text-muted-foreground">
						<Volleyball class="size-10" strokeWidth={1.5} />
						<p>No hubo préstamos este día.</p>
					</div>
				{:else}
					<!-- Escritorio: tabla -->
					<div class="hidden rounded-xl border xl:block">
						<Table.Root>
							<Table.Header>
								<Table.Row>
									<Table.Head>Alumno</Table.Head>
									<Table.Head>Elemento</Table.Head>
									<Table.Head>Retiro</Table.Head>
									<Table.Head>Devolución</Table.Head>
									<Table.Head>Estado</Table.Head>
									<Table.Head class="text-right">Acciones</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each movimientos as m (m.id)}
									<Table.Row>
										<Table.Cell>
											<div class="max-w-64 truncate font-medium">{m.perfil?.email ?? '—'}</div>
											<div class="text-xs text-muted-foreground">{m.perfil?.curso?.nombre ?? 'Sin curso'}</div>
										</Table.Cell>
										<Table.Cell>{m.item?.nombre ?? '—'}</Table.Cell>
										<Table.Cell class="tabular-nums">{fmtHora(m.hora_retiro)}</Table.Cell>
										<Table.Cell class="tabular-nums">{fmtHora(m.hora_devolucion)}</Table.Cell>
										<Table.Cell>{@render estadoCelda(m)}</Table.Cell>
										<Table.Cell class="text-right">{@render accion(m)}</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					</div>
					<!-- Celular y tablet: tarjetas -->
					<ul class="flex flex-col divide-y rounded-xl border xl:hidden">
						{#each movimientos as m (m.id)}
							<li class="flex flex-col gap-2 px-4 py-3">
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0">
										<div class="font-medium">{m.item?.nombre ?? '—'}</div>
										<div class="truncate text-sm text-muted-foreground">
											{m.perfil?.email ?? '—'} · {m.perfil?.curso?.nombre ?? 'Sin curso'}
										</div>
									</div>
									<div class="shrink-0">{@render estadoCelda(m)}</div>
								</div>
								<div class="flex items-center justify-between gap-2">
									<span class="text-xs text-muted-foreground tabular-nums">
										Retiro {fmtHora(m.hora_retiro)}{#if m.hora_devolucion} · Devolución {fmtHora(m.hora_devolucion)}{/if}
									</span>
									{@render accion(m)}
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{:else}
		<Card.Root class="max-w-2xl">
			<Card.Header>
				<Card.Title>Elementos para prestar</Card.Title>
				<Card.Description>Los desactivados no aparecen para retirar, pero quedan en el historial.</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-4">
				<form class="flex gap-2" onsubmit={agregarItem}>
					<Input bind:value={nuevoItem} placeholder="Ej. Paleta de ping pong" aria-label="Nuevo elemento" class="min-w-0 flex-1" />
					<Button type="submit" disabled={agregando || !nuevoItem.trim()}>
						{#if agregando}<LoaderCircle class="animate-spin" />{:else}<Plus />{/if}
						Agregar
					</Button>
				</form>
				{#if items.length === 0}
					<div class="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-sm text-muted-foreground">
						<PackageOpen class="size-8" strokeWidth={1.5} />
						Todavía no hay elementos.
					</div>
				{:else}
					<ul class="divide-y rounded-lg border">
						{#each items as it (it.id)}
							<li class="flex items-center gap-3 px-3 py-2">
								<span class="min-w-0 flex-1 truncate {it.activo ? '' : 'text-muted-foreground line-through'}">{it.nombre}</span>
								<Label for="activo-{it.id}" class="text-xs font-normal text-muted-foreground">{it.activo ? 'Activo' : 'Inactivo'}</Label>
								<Switch id="activo-{it.id}" checked={!!it.activo} onCheckedChange={(v) => cambiarActivo(it, v)} />
							</li>
						{/each}
					</ul>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>

<Dialog.Root bind:open={retiroAbierto}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Retiro manual</Dialog.Title>
			<Dialog.Description>Para un alumno que no puede escanear el QR.</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-4">
			<div class="grid gap-2">
				<Label for="retiro-alumno">Alumno</Label>
				<AlumnoPicker id="retiro-alumno" {alumnos} bind:value={retiroAlumno} />
			</div>
			<div class="grid gap-2">
				<Label for="retiro-item">Elemento</Label>
				<Select.Root type="single" bind:value={retiroItem}>
					<Select.Trigger id="retiro-item" class="w-full">
						{itemsActivos.find((i) => i.id === retiroItem)?.nombre ?? 'Elegí qué se lleva'}
					</Select.Trigger>
					<Select.Content>
						{#each itemsActivos as it (it.id)}
							<Select.Item value={it.id}>{it.nombre}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (retiroAbierto = false)} disabled={retirando}>Cancelar</Button>
			<Button onclick={registrarRetiro} disabled={retirando || !retiroAlumno || !retiroItem}>
				{#if retirando}<LoaderCircle class="animate-spin" />{/if}
				Registrar retiro
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root open={devolucion !== null} onOpenChange={(o) => { if (!o && !guardando) devolucion = null; }}>
	<Dialog.Content class="sm:max-w-md">
		{#if devolucion}
			<Dialog.Header>
				<Dialog.Title>{devolucion.hora_devolucion ? 'Revisar devolución' : 'Registrar devolución'}</Dialog.Title>
				<Dialog.Description>
					{devolucion.item?.nombre ?? 'Elemento'} · {devolucion.perfil?.email ?? ''}
				</Dialog.Description>
			</Dialog.Header>
			<div class="grid gap-4">
				<div class="grid gap-2">
					<Label>¿En qué estado volvió?</Label>
					<RadioGroup.Root bind:value={estado} class="gap-2">
						{#each ESTADOS as e (e.value)}
							<Label for="estado-{e.value}" class="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 font-normal hover:bg-accent/40">
								<RadioGroup.Item value={e.value} id="estado-{e.value}" />
								{e.label}
							</Label>
						{/each}
					</RadioGroup.Root>
				</div>
				<div class="grid gap-2">
					<Label for="obs">Observaciones <span class="font-normal text-muted-foreground">(opcional)</span></Label>
					<Textarea id="obs" rows={2} bind:value={observaciones} placeholder="Ej. le falta una pelotita" />
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (devolucion = null)} disabled={guardando}>Cancelar</Button>
				<Button onclick={guardarDevolucion} disabled={guardando}>
					{#if guardando}<LoaderCircle class="animate-spin" />{/if}
					Guardar
				</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
