<script lang="ts">
	import { parseDate, getLocalTimeZone, type DateValue } from '@internationalized/date';
	import { Calendar } from '$lib/components/ui/calendar/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { CalendarDays, X } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn.js';

	// Selector de fecha (Calendar de shadcn en un Popover). El valor es un string
	// "AAAA-MM-DD" (o '' si no hay fecha), igual que un <input type="date">, así las
	// páginas no dependen de @internationalized/date.
	let {
		value = $bindable(''),
		id,
		placeholder = 'Elegí una fecha',
		min,
		clearable = false,
		class: className
	}: {
		value?: string;
		id?: string;
		placeholder?: string;
		min?: string;
		clearable?: boolean;
		class?: string;
	} = $props();

	let open = $state(false);
	let selected = $derived(value ? parseDate(value) : undefined);
	let minValue = $derived(min ? parseDate(min) : undefined);

	const label = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

	function pick(v: DateValue | undefined) {
		value = v ? v.toString() : '';
		open = false;
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				{id}
				variant="outline"
				class={cn('w-full justify-start font-normal', !selected && 'text-muted-foreground', className)}
			>
				<CalendarDays />
				<span class="truncate first-letter:uppercase">
					{selected ? label.format(selected.toDate(getLocalTimeZone())) : placeholder}
				</span>
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-auto p-0" align="start">
		<Calendar
			type="single"
			value={selected}
			onValueChange={(v: DateValue | undefined) => pick(v)}
			locale="es-AR"
			weekStartsOn={1}
			{minValue}
			captionLayout="dropdown"
		/>
		{#if clearable && selected}
			<div class="border-t p-2">
				<Button variant="ghost" size="sm" class="w-full" onclick={() => pick(undefined)}>
					<X />
					Quitar fecha
				</Button>
			</div>
		{/if}
	</Popover.Content>
</Popover.Root>
