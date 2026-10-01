<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { supabase } from '$lib/supabase';
	import { confirmDialog } from '$lib/utils/confirm';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { Plus, Trash2, LoaderCircle, Building2 } from '@lucide/svelte';

	type Empresa = { id: string; nombre: string; alumnos: number };

	let empresas = $state<Empresa[]>([]);
	let cargando = $state(true);
	let nueva = $state('');
	let agregando = $state(false);

	async function cargar() {
		const [e, p] = await Promise.all([
			supabase.from('empresas').select('id, nombre').order('nombre'),
			supabase.from('perfiles').select('empresa_id').not('empresa_id', 'is', null)
		]);
		if (e.error) toast.error('No se pudieron cargar las empresas.');
		const cuenta: Record<string, number> = {};
		for (const x of p.data ?? []) if (x.empresa_id) cuenta[x.empresa_id] = (cuenta[x.empresa_id] ?? 0) + 1;
		empresas = (e.data ?? []).map((x) => ({ ...x, alumnos: cuenta[x.id] ?? 0 }));
		cargando = false;
	}

	onMount(cargar);

	async function agregar(event: Event) {
		event.preventDefault();
		const nombre = nueva.trim();
		if (!nombre) return;
		agregando = true;
		const { error } = await supabase.from('empresas').insert({ nombre });
		agregando = false;
		if (error) return toast.error('No se pudo agregar: ' + error.message);
		nueva = '';
		toast.success(`${nombre} agregada`);
		await cargar();
	}

	async function borrar(e: Empresa) {
		const ok = await confirmDialog({
			title: `¿Borrar ${e.nombre}?`,
			description: e.alumnos ? `Sus ${e.alumnos} alumnos quedan sin empresa asignada.` : 'No tiene alumnos asignados.',
			confirmLabel: 'Borrar',
			destructive: true
		});
		if (!ok) return;
		const { data, error } = await supabase.from('empresas').delete().eq('id', e.id).select('id');
		if (error || !data?.length) return toast.error('No se pudo borrar' + (error ? ': ' + error.message : '.'));
		toast.success(`${e.nombre} borrada`);
		await cargar();
	}
</script>

<Card.Root class="max-w-2xl">
	<Card.Header>
		<Card.Title>Empresas</Card.Title>
		<Card.Description>Donde hacen las prácticas los alumnos.</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-4">
		<form class="flex gap-2" onsubmit={agregar}>
			<Input bind:value={nueva} placeholder="Nombre de la empresa" aria-label="Empresa nueva" class="min-w-0 flex-1" />
			<Button type="submit" disabled={agregando || !nueva.trim()}>
				{#if agregando}<LoaderCircle class="animate-spin" />{:else}<Plus />{/if}
				Agregar
			</Button>
		</form>
		{#if cargando}
			<Skeleton class="h-32 rounded-lg" />
		{:else if empresas.length === 0}
			<div class="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-sm text-muted-foreground">
				<Building2 class="size-8" strokeWidth={1.5} />
				Todavía no hay empresas.
			</div>
		{:else}
			<ul class="divide-y rounded-lg border">
				{#each empresas as e (e.id)}
					<li class="flex items-center gap-3 py-2 pr-2 pl-3">
						<span class="min-w-0 flex-1 truncate">{e.nombre}</span>
						<Badge variant="secondary">{e.alumnos} {e.alumnos === 1 ? 'alumno' : 'alumnos'}</Badge>
						<Button
							variant="ghost"
							size="icon-sm"
							class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
							aria-label="Borrar {e.nombre}"
							onclick={() => borrar(e)}
						>
							<Trash2 />
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>
