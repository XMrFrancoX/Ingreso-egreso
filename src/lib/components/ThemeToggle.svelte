<script lang="ts">
	import { setMode, resetMode, userPrefersMode } from 'mode-watcher';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Sun, Moon, Monitor } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn.js';

	let { class: className }: { class?: string } = $props();

	const options = [
		{ value: 'light', label: 'Claro', icon: Sun },
		{ value: 'dark', label: 'Oscuro', icon: Moon },
		{ value: 'system', label: 'Como el dispositivo', icon: Monitor }
	] as const;

	function choose(value: string) {
		if (value === 'system') resetMode();
		else setMode(value as 'light' | 'dark');
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon" class={cn('relative', className)} aria-label="Cambiar tema">
				<Sun class="scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90" />
				<Moon class="absolute scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="min-w-48">
		<DropdownMenu.RadioGroup value={userPrefersMode.current} onValueChange={choose}>
			{#each options as opt (opt.value)}
				<DropdownMenu.RadioItem value={opt.value}>
					<opt.icon />
					{opt.label}
				</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
