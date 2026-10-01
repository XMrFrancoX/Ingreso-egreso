<script lang="ts">
	import { get } from 'svelte/store';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { confirmRequest, type ConfirmRequest } from '$lib/utils/confirm';

	// Se guarda el último pedido para que el texto no desaparezca durante la
	// animación de cierre (el store ya vuelve a null apenas se responde).
	let current = $state<ConfirmRequest | null>(null);
	$effect(() => {
		if ($confirmRequest) current = $confirmRequest;
	});

	function settle(confirmed: boolean) {
		const request = get(confirmRequest);
		if (!request) return;
		confirmRequest.set(null);
		request.resolve(confirmed);
	}
</script>

<AlertDialog.Root
	open={$confirmRequest !== null}
	onOpenChange={(open) => {
		if (!open) settle(false);
	}}
>
	<AlertDialog.Content class="sm:max-w-md">
		{#if current}
			<AlertDialog.Header>
				<AlertDialog.Title class="font-semibold">{current.title}</AlertDialog.Title>
				{#if current.description}
					<AlertDialog.Description>{current.description}</AlertDialog.Description>
				{/if}
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel variant="secondary">{current.cancelLabel ?? 'Cancelar'}</AlertDialog.Cancel>
				<AlertDialog.Action
					class={current.destructive
						? 'bg-destructive text-white hover:bg-destructive/85 focus-visible:ring-destructive/30'
						: ''}
					onclick={() => settle(true)}
				>
					{current.confirmLabel ?? 'Confirmar'}
				</AlertDialog.Action>
			</AlertDialog.Footer>
		{/if}
	</AlertDialog.Content>
</AlertDialog.Root>
