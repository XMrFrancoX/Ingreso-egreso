<script lang="ts" module>
	export interface AlumnoOpcion {
		id: string;
		email: string;
		curso?: { nombre: string } | null;
	}
</script>

<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';
	import { Check, Search } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn.js';

	// Buscar y elegir un alumno por mail o curso (reemplaza al <select> nativo de 200 opciones).

	let {
		alumnos,
		value = $bindable(''),
		id
	}: { alumnos: AlumnoOpcion[]; value?: string; id?: string } = $props();

	let busqueda = $state('');
	const MAX = 50;

	let filtrados = $derived.by(() => {
		const q = busqueda.trim().toLowerCase();
		const lista = q
			? alumnos.filter((a) => a.email.toLowerCase().includes(q) || (a.curso?.nombre ?? '').toLowerCase().includes(q))
			: alumnos;
		return lista.slice(0, MAX);
	});
</script>

<div class="grid gap-2">
	<div class="relative">
		<Search class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
		<Input {id} bind:value={busqueda} placeholder="Buscar por mail o curso" class="pl-8" autocomplete="off" />
	</div>
	<div class="max-h-56 overflow-y-auto rounded-lg border" role="listbox" aria-label="Alumnos">
		{#each filtrados as a (a.id)}
			<button
				type="button"
				role="option"
				aria-selected={value === a.id}
				onclick={() => (value = a.id)}
				class={cn(
					'flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent/50',
					value === a.id && 'bg-primary/10'
				)}
			>
				<span class="min-w-0 flex-1 truncate">{a.email}</span>
				<span class="shrink-0 text-xs text-muted-foreground">{a.curso?.nombre ?? 'Sin curso'}</span>
				<Check class={cn('size-4 shrink-0 text-primary', value !== a.id && 'invisible')} />
			</button>
		{:else}
			<p class="px-3 py-6 text-center text-sm text-muted-foreground">Nadie coincide con “{busqueda.trim()}”.</p>
		{/each}
	</div>
	{#if !busqueda.trim() && alumnos.length > MAX}
		<p class="text-xs text-muted-foreground">Mostrando {MAX} de {alumnos.length}: buscá para encontrar al resto.</p>
	{/if}
</div>
