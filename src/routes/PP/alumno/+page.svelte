<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { supabase } from '$lib/supabase';
	import { auth } from '$lib/auth.svelte';
	import { DIAS, DIA_NOMBRE, diaDe, fmtHora, hoyISO, horaAhora, type Dia } from '$lib/fechas';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import EscanearQr from '$lib/components/EscanearQr.svelte';
	import { Building2, Clock, CircleCheck, CalendarX, LoaderCircle, Hourglass } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn.js';

	let cargando = $state(true);
	let empresa = $state<string | null>(null);
	let horario = $state<string | null>(null);
	let dias = $state<Dia[]>([]);
	let registroHoy = $state<{ hora_entrada_real: string } | null>(null);
	let qrValidado = $state(false);
	let registrando = $state(false);

	const hoy = hoyISO();
	let hoyToca = $derived(dias.includes(diaDe(hoy) as Dia));

	async function cargar() {
		const id = auth.perfil!.id;
		// Si un admin precargó empresa, horario y días para este mail, la base los aplica ahora.
		const { error: errPre } = await supabase.rpc('aplicar_precarga_pp');
		if (errPre) console.error('Error aplicando la precarga:', errPre);

		const [p, d, r] = await Promise.all([
			supabase.from('perfiles').select('horario_entrada, empresa:empresa_id(nombre)').eq('id', id).single(),
			supabase.from('dias_habilitados').select('dia').eq('perfil_id', id),
			supabase.from('registros').select('hora_entrada_real').eq('perfil_id', id).eq('fecha', hoy).maybeSingle()
		]);
		if (p.error || d.error || r.error) toast.error('No se pudo cargar tu pasantía. Probá recargar.');
		empresa = (p.data?.empresa as { nombre: string } | null)?.nombre ?? null;
		horario = p.data?.horario_entrada ?? null;
		dias = (d.data ?? []).map((x) => x.dia as Dia);
		registroHoy = r.data;
		cargando = false;
	}

	onMount(cargar);

	async function registrar() {
		registrando = true;
		const { data, error } = await supabase
			.from('registros')
			.insert({ perfil_id: auth.perfil!.id, fecha: hoy, hora_entrada_real: horaAhora() })
			.select('hora_entrada_real')
			.single();
		registrando = false;
		if (error) {
			console.error(error);
			return toast.error(error.code === '23505' ? 'Ya registraste tu entrada de hoy.' : 'No se pudo registrar. Probá de nuevo.');
		}
		registroHoy = data;
		toast.success('Entrada registrada');
	}
</script>

<svelte:head>
	<title>Mi pasantía • Ingresos y egresos</title>
</svelte:head>

<div class="mx-auto flex max-w-lg flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">Mi pasantía</h1>
		<p class="text-muted-foreground">Registrá tu entrada los días que tenés práctica</p>
	</div>

	{#if cargando}
		<Skeleton class="h-28 rounded-xl" />
		<Skeleton class="h-64 rounded-xl" />
	{:else}
		<Card.Root class="gap-0 py-0">
			<div class="flex items-center gap-3 border-b px-5 py-4">
				<div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary dark:text-blue-300">
					<Building2 class="size-5" />
				</div>
				<div class="min-w-0">
					<div class="text-xs text-muted-foreground">Empresa</div>
					<div class="truncate font-semibold">{empresa ?? 'Sin asignar todavía'}</div>
				</div>
			</div>
			<div class="grid grid-cols-2 divide-x">
				<div class="px-5 py-4">
					<div class="text-xs text-muted-foreground">Horario de entrada</div>
					<div class="font-semibold tabular-nums">{horario ? fmtHora(horario) : 'Sin definir'}</div>
				</div>
				<div class="px-5 py-4">
					<div class="text-xs text-muted-foreground">Días</div>
					<div class="mt-1 flex gap-1">
						{#each DIAS as d (d)}
							<span
								title={DIA_NOMBRE[d]}
								class={cn(
									'flex size-6 items-center justify-center rounded-full text-xs font-medium',
									dias.includes(d) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
								)}
							>
								{d}
							</span>
						{/each}
					</div>
				</div>
			</div>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Entrada de hoy</Card.Title>
			</Card.Header>
			<Card.Content>
				{#if registroHoy}
					<div class="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
						<CircleCheck class="size-6 shrink-0 text-emerald-600 dark:text-emerald-300" />
						<div>
							<div class="font-semibold">Entrada registrada</div>
							<div class="text-sm text-muted-foreground">Hoy a las {fmtHora(registroHoy.hora_entrada_real)}</div>
						</div>
					</div>
				{:else if !empresa}
					<div class="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3 text-sm">
						<Hourglass class="size-5 shrink-0 text-muted-foreground" />
						Esperá a que un administrador te asigne una empresa.
					</div>
				{:else if !hoyToca}
					<div class="flex items-start gap-3 rounded-lg border bg-muted/50 px-4 py-3 text-sm">
						<CalendarX class="mt-0.5 size-5 shrink-0 text-muted-foreground" />
						<div>
							<div class="font-medium">Hoy no tenés pasantía</div>
							<div class="text-muted-foreground">
								Tus días: {dias.length ? dias.map((d) => DIA_NOMBRE[d]).join(', ') : 'ninguno asignado'}
							</div>
						</div>
					</div>
				{:else if !qrValidado}
					<EscanearQr onValidado={() => (qrValidado = true)} ayuda="Escaneá el QR del preceptor para registrar tu entrada." />
				{:else}
					<div class="grid gap-3">
						<p class="flex items-center gap-2 text-sm text-muted-foreground">
							<Clock class="size-4" />
							{DIA_NOMBRE[diaDe(hoy) as Dia]} · entrada esperada {fmtHora(horario)}
						</p>
						<Button size="lg" class="w-full" onclick={registrar} disabled={registrando}>
							{#if registrando}<LoaderCircle class="animate-spin" />{/if}
							Registrar entrada
						</Button>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
