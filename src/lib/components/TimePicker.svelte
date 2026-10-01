<script lang="ts">
	import { tick } from 'svelte';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Clock } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn.js';

	// Selector de hora (en vez del <input type="time"> nativo). El valor es "HH:MM"
	// (o '' sin hora), igual que el input nativo. Horas del turno escolar y minutos
	// de a 5, que alcanzan para los módulos de clase.
	let {
		value = $bindable(''),
		id,
		placeholder = '--:--',
		fromHour = 7,
		toHour = 22,
		class: className
	}: {
		value?: string;
		id?: string;
		placeholder?: string;
		fromHour?: number;
		toHour?: number;
		class?: string;
	} = $props();

	let open = $state(false);
	let listEl = $state<HTMLElement | null>(null);

	const pad = (n: number) => n.toString().padStart(2, '0');
	const hours = $derived(Array.from({ length: toHour - fromHour + 1 }, (_, i) => pad(fromHour + i)));
	const minutes = Array.from({ length: 12 }, (_, i) => pad(i * 5));

	let hour = $derived(value ? value.slice(0, 2) : '');
	let minute = $derived(value ? value.slice(3, 5) : '');

	function pickHour(h: string) {
		value = `${h}:${minute || '00'}`;
	}

	function pickMinute(m: string) {
		value = `${hour || pad(fromHour)}:${m}`;
		open = false;
	}

	// Al abrir, mostrar la hora elegida (o la primera) arriba de cada columna.
	$effect(() => {
		if (!open) return;
		tick().then(() => {
			listEl?.querySelectorAll<HTMLElement>('[data-selected]').forEach((el) => {
				el.parentElement!.scrollTop = el.offsetTop - 4;
			});
		});
	});
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				{id}
				variant="outline"
				class={cn('w-full justify-start font-normal tabular-nums', !value && 'text-muted-foreground', className)}
			>
				<Clock />
				{value || placeholder}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-auto p-1" align="start">
		<div bind:this={listEl} class="flex gap-1">
			<div class="no-scrollbar relative flex max-h-60 flex-col gap-0.5 overflow-y-auto" role="listbox" aria-label="Hora">
				{#each hours as h (h)}
					<Button
						variant={h === hour ? 'default' : 'ghost'}
						size="sm"
						class="w-12 shrink-0 tabular-nums"
						role="option"
						aria-selected={h === hour}
						data-selected={h === hour ? '' : undefined}
						onclick={() => pickHour(h)}
					>
						{h}
					</Button>
				{/each}
			</div>
			<div class="w-px bg-border"></div>
			<div class="no-scrollbar relative flex max-h-60 flex-col gap-0.5 overflow-y-auto" role="listbox" aria-label="Minutos">
				{#each minutes as m (m)}
					<Button
						variant={m === minute ? 'default' : 'ghost'}
						size="sm"
						class="w-12 shrink-0 tabular-nums"
						role="option"
						aria-selected={m === minute}
						data-selected={m === minute ? '' : undefined}
						onclick={() => pickMinute(m)}
					>
						{m}
					</Button>
				{/each}
			</div>
		</div>
	</Popover.Content>
</Popover.Root>
