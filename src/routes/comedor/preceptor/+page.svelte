<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { supabase } from '$lib/supabase';
	import { diaDe, fmtHora, fmtMinutos, hoyISO, horaAhora, minutosDeDiferencia } from '$lib/fechas';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import QrFirma from '$lib/components/QrFirma.svelte';
	import AlumnoPicker, { type AlumnoOpcion } from '$lib/components/AlumnoPicker.svelte';
	import { UserCheck, LoaderCircle, UtensilsCrossed, Settings2 } from '@lucide/svelte';

	type Movimiento = {
		id: string;
		perfil_id: string;
		hora_salida: string;
		hora_ingreso: string | null;
		firma_salida: string | null;
		perfil: {
			email: string;
			curso: { nombre: string; horarios: { dia: string; hora_regreso: string }[] } | null;
		} | null;
	};

	let fecha = $state(hoyISO());
	let movimientos = $state<Movimiento[]>([]);
	let cargando = $state(true);
	let alumnos = $state<AlumnoOpcion[]>([]);
	let reloj: ReturnType<typeof setInterval> | undefined;

	let afuera = $derived(movimientos.filter((m) => !m.hora_ingreso).length);

	async function cargarMovimientos() {
		const { data, error } = await supabase
			.from('movimientos')
			.select(
				'id, perfil_id, hora_salida, hora_ingreso, firma_salida, perfil:perfil_id(email, curso:curso_id(nombre, horarios:cursos_horarios(dia, hora_regreso)))'
			)
			.eq('fecha', fecha)
			.order('hora_salida', { ascending: false });
		if (error) toast.error('No se pudieron cargar las salidas: ' + error.message);
		else movimientos = data as unknown as Movimiento[];
		cargando = false;
	}

	onMount(() => {
		void supabase
			.from('perfiles')
			.select('id, email, curso:curso_id(nombre)')
			.eq('rol', 'student')
			.order('email')
			.then(({ data }) => (alumnos = (data as unknown as AlumnoOpcion[]) ?? []));
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

	function limite(m: Movimiento) {
		return m.perfil?.curso?.horarios?.find((h) => h.dia === diaDe(fecha))?.hora_regreso ?? null;
	}

	function estado(m: Movimiento) {
		if (!m.hora_ingreso) return { texto: 'Afuera', clase: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300' };
		const tarde = minutosDeDiferencia(m.hora_ingreso, limite(m));
		if (tarde !== null && tarde > 0) {
			return { texto: `Tarde ${fmtMinutos(tarde)}`, clase: 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300' };
		}
		return { texto: 'Volvió', clase: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' };
	}

	// ---------- autorización manual ----------
	let autorizarAbierto = $state(false);
	let alumnoId = $state('');
	let autorizando = $state(false);
	let salidaAbierta = $state<{ id: string } | null>(null);

	// Estado del alumno elegido hoy (no el del día que se esté mirando).
	$effect(() => {
		const id = alumnoId;
		salidaAbierta = null;
		if (!id) return;
		void supabase
			.from('movimientos')
			.select('id')
			.eq('perfil_id', id)
			.eq('fecha', hoyISO())
			.is('hora_ingreso', null)
			.limit(1)
			.maybeSingle()
			.then(({ data }) => {
				if (alumnoId === id) salidaAbierta = data;
			});
	});

	async function autorizar() {
		if (!alumnoId) return;
		autorizando = true;
		const { error } = salidaAbierta
			? await supabase
					.from('movimientos')
					.update({ hora_ingreso: horaAhora(), firma_ingreso: 'Autorizado por preceptor' })
					.eq('id', salidaAbierta.id)
			: await supabase.from('movimientos').insert({
					perfil_id: alumnoId,
					fecha: hoyISO(),
					hora_salida: horaAhora(),
					firma_salida: 'Autorizado por preceptor'
				});
		autorizando = false;
		if (error) return toast.error('No se pudo registrar: ' + error.message);
		toast.success(salidaAbierta ? 'Vuelta registrada' : 'Salida registrada');
		autorizarAbierto = false;
		alumnoId = '';
		fecha = hoyISO();
		await cargarMovimientos();
	}
</script>

<svelte:head>
	<title>Comedor • Ingresos y egresos</title>
</svelte:head>

<div class="mx-auto flex max-w-7xl flex-col gap-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">Comedor</h1>
			<p class="text-muted-foreground">Salidas y vueltas del almuerzo</p>
		</div>
		<div class="grid grid-cols-2 gap-2 sm:flex">
			<Button variant="outline" href="/accesos?tab=cursos">
				<Settings2 />
				Horarios
			</Button>
			<Button onclick={() => (autorizarAbierto = true)}>
				<UserCheck />
				Autorizar alumno
			</Button>
		</div>
	</div>

	<div class="grid gap-6 lg:grid-cols-[18rem_1fr]">
		<div class="order-2 lg:order-1">
			<QrFirma app="comedor" />
		</div>

		<div class="order-1 flex min-w-0 flex-col gap-4 lg:order-2">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
				<DatePicker bind:value={fecha} class="sm:w-72" />
				{#if fecha !== hoyISO()}
					<Button variant="ghost" size="sm" class="w-fit" onclick={() => (fecha = hoyISO())}>Volver a hoy</Button>
				{/if}
			</div>

			<div class="grid grid-cols-3 gap-3">
				{#each [{ l: 'Salidas', v: movimientos.length }, { l: 'Afuera', v: afuera }, { l: 'Volvieron', v: movimientos.length - afuera }] as s (s.l)}
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
					<UtensilsCrossed class="size-10" strokeWidth={1.5} />
					<p>No hubo salidas este día.</p>
				</div>
			{:else}
				<!-- Escritorio: tabla -->
				<div class="hidden rounded-xl border xl:block">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Alumno</Table.Head>
								<Table.Head>Salida</Table.Head>
								<Table.Head>Límite</Table.Head>
								<Table.Head>Vuelta</Table.Head>
								<Table.Head>Estado</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each movimientos as m (m.id)}
								{@const e = estado(m)}
								<Table.Row>
									<Table.Cell>
										<div class="max-w-72 truncate font-medium">{m.perfil?.email ?? '—'}</div>
										<div class="text-xs text-muted-foreground">
											{m.perfil?.curso?.nombre ?? 'Sin curso'}{#if m.firma_salida} · {m.firma_salida}{/if}
										</div>
									</Table.Cell>
									<Table.Cell class="tabular-nums">{fmtHora(m.hora_salida)}</Table.Cell>
									<Table.Cell class="text-muted-foreground tabular-nums">{fmtHora(limite(m))}</Table.Cell>
									<Table.Cell class="tabular-nums">{fmtHora(m.hora_ingreso)}</Table.Cell>
									<Table.Cell><Badge variant="outline" class={e.clase}>{e.texto}</Badge></Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
				<!-- Celular y tablet: tarjetas -->
				<ul class="flex flex-col divide-y rounded-xl border xl:hidden">
					{#each movimientos as m (m.id)}
						{@const e = estado(m)}
						<li class="flex flex-col gap-1.5 px-4 py-3">
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<div class="truncate font-medium">{m.perfil?.email ?? '—'}</div>
									<div class="text-sm text-muted-foreground">{m.perfil?.curso?.nombre ?? 'Sin curso'}</div>
								</div>
								<Badge variant="outline" class="shrink-0 {e.clase}">{e.texto}</Badge>
							</div>
							<div class="text-xs text-muted-foreground tabular-nums">
								Salida {fmtHora(m.hora_salida)} · Límite {fmtHora(limite(m))} · Vuelta {fmtHora(m.hora_ingreso)}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</div>

<Dialog.Root bind:open={autorizarAbierto}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Autorizar alumno</Dialog.Title>
			<Dialog.Description>Registra la salida o la vuelta de un alumno que no puede escanear el QR.</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-4">
			<div class="grid gap-2">
				<Label for="autorizar-alumno">Alumno</Label>
				<AlumnoPicker id="autorizar-alumno" {alumnos} bind:value={alumnoId} />
			</div>
			{#if alumnoId}
				<p class="rounded-lg border bg-muted/50 px-3 py-2 text-sm">
					{#if salidaAbierta}
						Está <strong>afuera</strong>: se registra su <strong>vuelta</strong>.
					{:else}
						Está <strong>en la escuela</strong>: se registra su <strong>salida</strong>.
					{/if}
				</p>
			{/if}
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (autorizarAbierto = false)} disabled={autorizando}>Cancelar</Button>
			<Button onclick={autorizar} disabled={autorizando || !alumnoId}>
				{#if autorizando}<LoaderCircle class="animate-spin" />{/if}
				{salidaAbierta ? 'Registrar vuelta' : 'Registrar salida'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
