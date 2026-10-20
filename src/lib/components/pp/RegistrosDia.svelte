<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { supabase } from '$lib/supabase';
	import { entradaAula, fmtHora, fmtMinutos, hoyISO, MINUTOS_ALMUERZO, minutosDeDiferencia } from '$lib/fechas';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import { cn } from '$lib/utils/cn.js';
	import { BriefcaseBusiness, RotateCcw } from '@lucide/svelte';

	type Procesador = { estado: string; respuesta: string | null; intentos: number };
	type Registro = {
		id: string;
		hora_entrada_real: string;
		perfil: { email: string; horario_entrada: string | null; almuerzo_extra: boolean; empresa: { nombre: string } | null } | null;
		procesador: Procesador | null;
		// Lo que marcó el docente en la clase de su hora de aula (api_presentes de la intranet).
		presente: { clase: string | null; estado: string; marcado: string | null; minutos: number } | null;
	};

	let fecha = $state(hoyISO());
	let registros = $state<Registro[]>([]);
	let cargando = $state(true);
	let reloj: ReturnType<typeof setInterval> | undefined;

	async function cargar() {
		const { data, error } = await supabase
			.from('registros')
			.select(
				'id, hora_entrada_real, perfil:perfil_id(email, horario_entrada, almuerzo_extra, empresa:empresa_id(nombre)), procesador:tardes_procesador(estado, respuesta, intentos), presente:presentes_pp(clase, estado, marcado, minutos)'
			)
			.eq('fecha', fecha)
			.order('hora_entrada_real');
		if (error) toast.error('No se pudieron cargar los registros: ' + error.message);
		else registros = data as unknown as Registro[];
		cargando = false;
	}

	$effect(() => {
		void fecha;
		cargando = true;
		void cargar();
	});

	onMount(() => {
		reloj = setInterval(() => {
			if (fecha === hoyISO() && !document.hidden) void cargar();
		}, 15000);
	});
	onDestroy(() => clearInterval(reloj));

	function estado(r: Registro) {
		const tarde = minutosTarde(r);
		if (tarde !== null && tarde > 0) {
			return { texto: `Tarde ${fmtMinutos(tarde)}`, clase: 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300' };
		}
		return { texto: 'A horario', clase: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' };
	}

	// La tarde se cuenta desde la hora de entrada al aula: el ingreso, más 30 min si tiene almuerzo
	// (igual que lo que se manda al procesador).
	const aula = (r: Registro) => entradaAula(r.perfil?.horario_entrada, r.perfil?.almuerzo_extra);
	// Lo mayor entre la hora en que fichó y la hora en que el docente le puso el presente.
	const minutosTarde = (r: Registro) => {
		const fichada = minutosDeDiferencia(r.hora_entrada_real, aula(r));
		const presente = r.presente?.minutos ?? 0;
		return fichada === null ? (presente || null) : Math.max(fichada, presente);
	};
	const horaAR = (iso: string) =>
		new Date(iso).toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
	function enAula(r: Registro) {
		const p = r.presente;
		if (!p) return null;
		if ((p.estado === 'presente' || p.estado === 'tarde') && p.marcado) {
			return { texto: `${p.estado === 'tarde' ? 'Tarde' : 'Presente'} ${horaAR(p.marcado)}`, clase: p.clase, tarde: p.minutos > 0 };
		}
		const textos: Record<string, string> = { ausente: 'Ausente', sin_tomar: 'Lista sin tomar', sin_clase: 'Sin clase a esa hora' };
		return { texto: textos[p.estado] ?? p.estado, clase: p.clase, tarde: false };
	}
	let tardes = $derived(registros.filter((r) => (minutosTarde(r) ?? 0) > 0).length);

	// Cómo quedó la tarde en el procesador de asistencias del colegio (la manda la base cada 5 min).
	const GRIS = 'border-border bg-muted text-muted-foreground';
	const ROJO = 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300';
	const AMBAR = 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300';
	const VERDE = 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
	function enProcesador(p: Procesador) {
		switch (p.estado) {
			case 'enviado':
			case 'ya_estaba':
				return { texto: 'Anotada', clase: VERDE, problema: false, reintentar: false };
			case 'en_cola':
				return { texto: 'En cola', clase: 'border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300', problema: false, reintentar: false };
			case 'pendiente':
				return { texto: 'Por mandar', clase: GRIS, problema: false, reintentar: false };
			case 'sin_dni':
				return { texto: 'Falta DNI', clase: AMBAR, problema: true, reintentar: false };
			case 'rechazado':
				return { texto: 'Rechazada', clase: ROJO, problema: true, reintentar: true };
			case 'omitido':
				return { texto: 'No se mandó', clase: GRIS, problema: true, reintentar: true };
			default:
				return p.intentos >= 10
					? { texto: 'Falló', clase: ROJO, problema: true, reintentar: true }
					: { texto: 'Reintentando', clase: AMBAR, problema: true, reintentar: false };
		}
	}

	let reintentando = $state<string | null>(null);
	async function reintentar(r: Registro) {
		reintentando = r.id;
		const { error } = await supabase.rpc('reintentar_tarde', { p_registro: r.id });
		reintentando = null;
		if (error) return toast.error('No se pudo reintentar: ' + error.message);
		toast.success('Se vuelve a mandar en los próximos 5 minutos.');
		await cargar();
	}
</script>

{#snippet aulaCelda(r: Registro)}
	{@const a = enAula(r)}
	{#if a}
		<div class="grid gap-0.5">
			<span class={cn('text-sm tabular-nums', a.tarde && 'font-medium text-red-700 dark:text-red-300')}>{a.texto}</span>
			{#if a.clase}<span class="text-xs text-muted-foreground">{a.clase}</span>{/if}
		</div>
	{:else}
		<span class="text-muted-foreground">—</span>
	{/if}
{/snippet}

{#snippet procesador(r: Registro)}
	{#if r.procesador}
		{@const p = enProcesador(r.procesador)}
		<div class="flex min-w-0 flex-col items-start gap-1">
			<div class="flex items-center gap-1">
				<Badge variant="outline" class={p.clase}>{p.texto}</Badge>
				{#if p.reintentar}
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Volver a mandar la tarde de {r.perfil?.email ?? 'este alumno'}"
						disabled={reintentando === r.id}
						onclick={() => reintentar(r)}
					>
						<RotateCcw />
					</Button>
				{/if}
			</div>
			{#if p.problema && r.procesador.respuesta}
				<span class="text-xs text-muted-foreground">{r.procesador.respuesta}</span>
			{/if}
		</div>
	{:else}
		<span class="text-muted-foreground">—</span>
	{/if}
{/snippet}

<div class="flex min-w-0 flex-col gap-4">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
		<DatePicker bind:value={fecha} class="sm:w-72" />
		{#if fecha !== hoyISO()}
			<Button variant="ghost" size="sm" class="w-fit" onclick={() => (fecha = hoyISO())}>Volver a hoy</Button>
		{/if}
	</div>

	<div class="grid grid-cols-2 gap-3">
		{#each [{ l: 'Entradas registradas', v: registros.length }, { l: 'Llegaron tarde', v: tardes }] as s (s.l)}
			<Card.Root class="gap-1 px-4 py-3">
				<span class="text-xs text-muted-foreground">{s.l}</span>
				<span class="text-2xl font-semibold tabular-nums">{s.v}</span>
			</Card.Root>
		{/each}
	</div>

	{#if cargando}
		<Skeleton class="h-56 rounded-xl" />
	{:else if registros.length === 0}
		<div class="flex flex-col items-center gap-3 rounded-xl border border-dashed py-14 text-muted-foreground">
			<BriefcaseBusiness class="size-10" strokeWidth={1.5} />
			<p>No hay entradas registradas este día.</p>
		</div>
	{:else}
		<div class="hidden rounded-xl border xl:block">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Alumno</Table.Head>
						<Table.Head>Empresa</Table.Head>
						<Table.Head>Ingreso</Table.Head>
						<Table.Head>Almuerzo</Table.Head>
						<Table.Head>Entrada</Table.Head>
						<Table.Head>Aula</Table.Head>
						<Table.Head>Estado</Table.Head>
						<Table.Head>Procesador</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each registros as r (r.id)}
						{@const e = estado(r)}
						<Table.Row>
							<Table.Cell class="max-w-72 truncate font-medium">{r.perfil?.email ?? '—'}</Table.Cell>
							<Table.Cell>{r.perfil?.empresa?.nombre ?? '—'}</Table.Cell>
							<Table.Cell class="text-muted-foreground tabular-nums">{fmtHora(r.perfil?.horario_entrada)}</Table.Cell>
							<Table.Cell class="text-muted-foreground tabular-nums">
								{r.perfil?.almuerzo_extra ? `+${MINUTOS_ALMUERZO} min · aula ${aula(r)}` : '—'}
							</Table.Cell>
							<Table.Cell class="tabular-nums">{fmtHora(r.hora_entrada_real)}</Table.Cell>
							<Table.Cell class="max-w-48 whitespace-normal">{@render aulaCelda(r)}</Table.Cell>
							<Table.Cell><Badge variant="outline" class={e.clase}>{e.texto}</Badge></Table.Cell>
							<Table.Cell class="max-w-64 whitespace-normal">{@render procesador(r)}</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
		<ul class="flex flex-col divide-y rounded-xl border xl:hidden">
			{#each registros as r (r.id)}
				{@const e = estado(r)}
				<li class="flex flex-col gap-1.5 px-4 py-3">
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0">
							<div class="truncate font-medium">{r.perfil?.email ?? '—'}</div>
							<div class="text-sm text-muted-foreground">{r.perfil?.empresa?.nombre ?? 'Sin empresa'}</div>
						</div>
						<Badge variant="outline" class="shrink-0 {e.clase}">{e.texto}</Badge>
					</div>
					<div class="text-xs text-muted-foreground tabular-nums">
						Ingreso {fmtHora(r.perfil?.horario_entrada)}{r.perfil?.almuerzo_extra ? ` · almuerzo, aula ${aula(r)}` : ''} · Entrada {fmtHora(r.hora_entrada_real)}{enAula(r) ? ` · Aula: ${enAula(r)!.texto}` : ''}
					</div>
					{#if r.procesador}
						<div class="flex items-start gap-2 text-xs text-muted-foreground">
							<span class="pt-0.5">Procesador:</span>
							{@render procesador(r)}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
