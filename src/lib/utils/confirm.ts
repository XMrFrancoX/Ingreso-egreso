import { writable } from 'svelte/store';

export interface ConfirmOptions {
	title: string;
	description?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	/** Acción que borra o quita algo: el botón de confirmar sale en rojo. */
	destructive?: boolean;
}

export interface ConfirmRequest extends ConfirmOptions {
	resolve: (confirmed: boolean) => void;
}

/** Pedido de confirmación en curso; lo muestra <ConfirmDialog /> (montado en el layout). */
export const confirmRequest = writable<ConfirmRequest | null>(null);

/**
 * Reemplazo de `window.confirm()` con un Alert Dialog de shadcn-svelte. Devuelve una
 * promesa que resuelve `true` si el usuario confirma y `false` si cancela, aprieta
 * Escape o se abre otra confirmación encima.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
	return new Promise((resolve) => {
		confirmRequest.update((previous) => {
			previous?.resolve(false);
			return { ...options, resolve };
		});
	});
}
