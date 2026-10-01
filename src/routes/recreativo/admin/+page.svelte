<script lang="ts">
	import { goto } from '$app/navigation';

	// Los ítems ahora son una pestaña del panel del preceptor.
	goto('/recreativo/preceptor?tab=items', { replaceState: true });
</script>
