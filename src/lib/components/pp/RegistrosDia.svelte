<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { supabase } from '$lib/supabase';
	import { fmtHora, fmtMinutos, hoyISO, minutosDeDiferencia } from '$lib/fechas';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import { BriefcaseBusiness } from '@lucide/svelte';

	type Registro = {
		id: string;
		hora_entrada_real: string;
		perfil: { email: string; horario_entrada: string | null; empresa: { nombre: string } | null } | null;
	};

	let fecha = $state(hoyISO());
	let registros = $state<Registro[]>([]);
	let cargando = $state(true);
	let reloj: ReturnType<typeof setInterval> | undefined;

	async function cargar() {
		const { data, error } = await supabase
			.from('registros')
			.select('id, hora_entrada_real, perfil:perfil_id(email, horario_entrada, empresa:empresa_id(nombre))')
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
		const tarde = minutosDeDiferencia(r.hora_entrada_real, r.perfil?.horario_entrada);
		if (tarde !== null && tarde > 0) {
			return { texto: `Tarde ${fmtMinutos(tarde)}`, clase: 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300' };
		}
		return { texto: 'A horario', clase: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' };
	}

	let tardes = $derived(registros.filter((r) => (minutosDeDiferencia(r.hora_entrada_real, r.perfil?.horario_entrada) ?? 0) > 0).length);
</script>

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
						<Table.Head>Esperada</Table.Head>
						<Table.Head>Entrada</Table.Head>
						<Table.Head>Estado</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each registros as r (r.id)}
						{@const e = estado(r)}
						<Table.Row>
							<Table.Cell class="max-w-72 truncate font-medium">{r.perfil?.email ?? '—'}</Table.Cell>
							<Table.Cell>{r.perfil?.empresa?.nombre ?? '—'}</Table.Cell>
							<Table.Cell class="text-muted-foreground tabular-nums">{fmtHora(r.perfil?.horario_entrada)}</Table.Cell>
							<Table.Cell class="tabular-nums">{fmtHora(r.hora_entrada_real)}</Table.Cell>
							<Table.Cell><Badge variant="outline" class={e.clase}>{e.texto}</Badge></Table.Cell>
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
						Esperada {fmtHora(r.perfil?.horario_entrada)} · Entrada {fmtHora(r.hora_entrada_real)}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
