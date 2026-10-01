<script lang="ts">
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth.svelte';

	// Entrada al módulo: cada rol va a su pantalla (el layout ya chequeó el acceso).
	$effect(() => {
		if (auth.perfil) goto(auth.esStaff ? '/PP/admin' : '/PP/alumno', { replaceState: true });
	});
</script>
