<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { supabase } from '$lib/supabase';
	import { auth } from '$lib/auth.svelte';
	import { confirmDialog } from '$lib/utils/confirm';
	import { fmtFecha, fmtHora, hoyISO, horaAhora } from '$lib/fechas';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import EscanearQr from '$lib/components/EscanearQr.svelte';
	import { Check, CornerDownLeft, LoaderCircle, PackageOpen } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn.js';

	type Item = { id: string; nombre: string };
	type Prestamo = { id: string; fecha: string; hora_retiro: string; item: { nombre: string } | null };

	let items = $state<Item[]>([]);
	let prestamos = $state<Prestamo[]>([]);
	let cargando = $state(true);
	let qrValidado = $state(false);
	let elegidos = $state<string[]>([]);
	let retirando = $state(false);
	let devolviendo = $state<string | null>(null);

	async function cargar() {
		const [it, pr] = await Promise.all([
			supabase.from('recreativo_items').select('id, nombre').eq('activo', true).order('nombre'),
			supabase
				.from('recreativo_movimientos')
				.select('id, fecha, hora_retiro, item:item_id(nombre)')
				.eq('perfil_id', auth.perfil!.id)
				.is('hora_devolucion', null)
				.order('fecha', { ascending: false })
				.order('hora_retiro', { ascending: false })
		]);
		if (it.error || pr.error) toast.error('No se pudieron cargar los datos. Probá recargar.');
		items = it.data ?? [];
		prestamos = (pr.data as Prestamo[] | null) ?? [];
		cargando = false;
	}

	onMount(cargar);

	function alternar(id: string) {
		elegidos = elegidos.includes(id) ? elegidos.filter((x) => x !== id) : [...elegidos, id];
	}

	async function retirar() {
		if (elegidos.length === 0) return;
		retirando = true;
		const fecha = hoyISO();
		const hora_retiro = horaAhora();
		const { error } = await supabase
			.from('recreativo_movimientos')
			.insert(elegidos.map((item_id) => ({ perfil_id: auth.perfil!.id, item_id, fecha, hora_retiro })));
		retirando = false;
		if (error) {
			console.error(error);
			toast.error('No se pudo registrar el retiro: ' + error.message);
			return;
		}
		toast.success('Retiro registrado. Pedile los elementos al preceptor.');
		elegidos = [];
		qrValidado = false;
		await cargar();
	}

	async function devolver(p: Prestamo) {
		const nombre = p.item?.nombre ?? 'el elemento';
		const ok = await confirmDialog({
			title: `¿Devolviste ${nombre}?`,
			description: 'Queda registrado como devuelto por vos. El preceptor después revisa en qué estado llegó.',
			confirmLabel: 'Sí, lo devolví',
			cancelLabel: 'Todavía no'
		});
		if (!ok) return;
		devolviendo = p.id;
		const { data, error } = await supabase
			.from('recreativo_movimientos')
			.update({ hora_devolucion: horaAhora() })
			.eq('id', p.id)
			.select('id');
		devolviendo = null;
		if (error || !data?.length) {
			console.error(error);
			toast.error('No se pudo registrar la devolución.' + (error ? ' ' + error.message : ''));
			return;
		}
		toast.success(`${nombre}: devolución registrada`);
		prestamos = prestamos.filter((x) => x.id !== p.id);
	}
</script>

<svelte:head>
	<title>Recreativo • Ingresos y egresos</title>
</svelte:head>

<div class="mx-auto flex max-w-lg flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">Recreativo</h1>
		<p class="text-muted-foreground">Retirá y devolvé paletas, pelotas y otros materiales</p>
	</div>

	{#if cargando}
		<Skeleton class="h-24 rounded-xl" />
		<Skeleton class="h-80 rounded-xl" />
	{:else}
		{#if prestamos.length > 0}
			<Card.Root class="gap-0 py-0">
				<div class="border-b px-5 py-3">
					<h2 class="text-base font-semibold">Lo que tenés retirado</h2>
					<p class="text-sm text-muted-foreground">Cuando lo entregues, marcalo como devuelto.</p>
				</div>
				<ul class="divide-y">
					{#each prestamos as p (p.id)}
						<li class="flex items-center gap-3 px-5 py-3">
							<div class="min-w-0 flex-1">
								<div class="truncate font-medium">{p.item?.nombre ?? 'Elemento'}</div>
								<div class="text-sm text-muted-foreground">
									Retirado {p.fecha === hoyISO() ? 'hoy' : `el ${fmtFecha(p.fecha)}`} a las {fmtHora(p.hora_retiro)}
								</div>
							</div>
							<Button variant="outline" size="sm" disabled={devolviendo === p.id} onclick={() => devolver(p)}>
								{#if devolviendo === p.id}<LoaderCircle class="animate-spin" />{:else}<CornerDownLeft />{/if}
								Devolver
							</Button>
						</li>
					{/each}
				</ul>
			</Card.Root>
		{/if}

		<Card.Root>
			<Card.Header>
				<Card.Title>Retirar</Card.Title>
				<Card.Description>
					{qrValidado ? 'Elegí qué te llevás.' : 'Primero escaneá el QR del preceptor.'}
				</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-4">
				{#if !qrValidado}
					<EscanearQr onValidado={() => (qrValidado = true)} />
				{:else if items.length === 0}
					<div class="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
						<PackageOpen class="size-8" strokeWidth={1.5} />
						No hay elementos disponibles para retirar.
					</div>
				{:else}
					<div class="grid grid-cols-2 gap-2" role="group" aria-label="Elementos para retirar">
						{#each items as it (it.id)}
							{@const elegido = elegidos.includes(it.id)}
							<button
								type="button"
								aria-pressed={elegido}
								onclick={() => alternar(it.id)}
								class={cn(
									'flex min-h-12 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50',
									elegido && 'border-primary bg-primary/10 ring-1 ring-primary'
								)}
							>
								<span
									class={cn(
										'flex size-4 shrink-0 items-center justify-center rounded border',
										elegido && 'border-primary bg-primary text-primary-foreground'
									)}
								>
									{#if elegido}<Check class="size-3" />{/if}
								</span>
								<span class="min-w-0 flex-1">{it.nombre}</span>
							</button>
						{/each}
					</div>
					<div class="grid grid-cols-2 gap-2">
						<Button variant="outline" onclick={() => ((qrValidado = false), (elegidos = []))}>Cancelar</Button>
						<Button disabled={elegidos.length === 0 || retirando} onclick={retirar}>
							{#if retirando}<LoaderCircle class="animate-spin" />{/if}
							Retirar{elegidos.length > 0 ? ` (${elegidos.length})` : ''}
						</Button>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
