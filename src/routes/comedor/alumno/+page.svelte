<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { supabase } from '$lib/supabase';
	import { auth } from '$lib/auth.svelte';
	import { diaDe, fmtHora, hoyISO, horaAhora } from '$lib/fechas';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import EscanearQr from '$lib/components/EscanearQr.svelte';
	import { LoaderCircle, LogIn, LogOut, School, Clock } from '@lucide/svelte';

	type Salida = { id: string; hora_salida: string };

	let cargando = $state(true);
	let salida = $state<Salida | null>(null); // salida de hoy sin vuelta
	let horaRegreso = $state<string | null>(null);
	let qrValidado = $state(false);
	let firma = $state('');
	let enviando = $state(false);

	async function cargar() {
		const hoy = hoyISO();
		const [mov, hor] = await Promise.all([
			supabase
				.from('movimientos')
				.select('id, hora_salida')
				.eq('perfil_id', auth.perfil!.id)
				.eq('fecha', hoy)
				.is('hora_ingreso', null)
				.order('hora_salida', { ascending: false })
				.limit(1)
				.maybeSingle(),
			auth.perfil!.curso_id
				? supabase
						.from('cursos_horarios')
						.select('hora_regreso')
						.eq('curso_id', auth.perfil!.curso_id)
						.eq('dia', diaDe(hoy))
						.maybeSingle()
				: Promise.resolve({ data: null, error: null })
		]);
		if (mov.error) toast.error('No se pudo cargar tu estado: ' + mov.error.message);
		salida = mov.data;
		horaRegreso = hor.data?.hora_regreso ?? null;
		cargando = false;
	}

	onMount(cargar);

	async function registrar(event: Event) {
		event.preventDefault();
		if (!firma.trim()) return toast.error('Escribí tu nombre completo para firmar.');
		enviando = true;
		const { error } = salida
			? await supabase
					.from('movimientos')
					.update({ hora_ingreso: horaAhora(), firma_ingreso: firma.trim() })
					.eq('id', salida.id)
			: await supabase.from('movimientos').insert({
					perfil_id: auth.perfil!.id,
					fecha: hoyISO(),
					hora_salida: horaAhora(),
					firma_salida: firma.trim()
				});
		enviando = false;
		if (error) return toast.error('No se pudo registrar: ' + error.message);

		if (salida) {
			toast.success('Vuelta registrada. ¡Bienvenido/a!');
			goto('/');
		} else {
			toast.success('Salida registrada. Acordate de registrar la vuelta.');
			firma = '';
			qrValidado = false;
			await cargar();
		}
	}
</script>

<svelte:head>
	<title>Comedor • Ingresos y egresos</title>
</svelte:head>

<div class="mx-auto flex max-w-lg flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">Comedor</h1>
		<p class="text-muted-foreground">Registrá tu salida y tu vuelta del almuerzo</p>
	</div>

	{#if cargando}
		<Skeleton class="h-20 rounded-xl" />
		<Skeleton class="h-80 rounded-xl" />
	{:else}
		<div
			class="flex items-center gap-3 rounded-xl border px-4 py-3 {salida
				? 'border-amber-500/30 bg-amber-500/10'
				: 'border-emerald-500/30 bg-emerald-500/10'}"
		>
			{#if salida}
				<LogOut class="size-6 shrink-0 text-amber-600 dark:text-amber-300" />
				<div>
					<div class="font-semibold">Estás afuera</div>
					<div class="text-sm text-muted-foreground">Saliste a las {fmtHora(salida.hora_salida)}</div>
				</div>
			{:else}
				<School class="size-6 shrink-0 text-emerald-600 dark:text-emerald-300" />
				<div>
					<div class="font-semibold">Estás en la escuela</div>
					<div class="text-sm text-muted-foreground">Podés registrar tu salida al almuerzo.</div>
				</div>
			{/if}
		</div>

		{#if horaRegreso}
			<p class="-mt-3 flex items-center gap-2 text-sm text-muted-foreground">
				<Clock class="size-4" />
				Hoy tenés que volver antes de las {fmtHora(horaRegreso)}.
			</p>
		{/if}

		<Card.Root>
			<Card.Header>
				<Card.Title>{salida ? 'Registrar vuelta' : 'Registrar salida'}</Card.Title>
				<Card.Description>
					{qrValidado ? 'Firmá con tu nombre completo.' : 'Primero escaneá el QR del preceptor.'}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if !qrValidado}
					<EscanearQr onValidado={() => (qrValidado = true)} />
				{:else}
					<form class="grid gap-4" onsubmit={registrar}>
						<div class="grid gap-2">
							<Label for="firma">Firma</Label>
							<Input id="firma" bind:value={firma} placeholder="Nombre y apellido" autocomplete="name" class="h-11 text-base" />
						</div>
						<div class="grid grid-cols-2 gap-2">
							<Button type="button" variant="outline" onclick={() => (qrValidado = false)}>Cancelar</Button>
							<Button type="submit" disabled={enviando}>
								{#if enviando}<LoaderCircle class="animate-spin" />{:else if salida}<LogIn />{:else}<LogOut />{/if}
								{salida ? 'Registrar vuelta' : 'Registrar salida'}
							</Button>
						</div>
					</form>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
