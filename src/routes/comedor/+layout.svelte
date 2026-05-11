<script>
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';

	let { children } = $props();
	let session = $state(null);

	onMount(() => {
		supabase.auth.getSession().then(({ data }) => {
			session = data.session;
		});

		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange((_event, _session) => {
			session = _session;
		});
		
		return () => subscription.unsubscribe();
	});

	async function signOut() {
		await supabase.auth.signOut();
	}
</script>

<nav class="navbar navbar-expand-lg bg-white shadow-sm mb-4">
	<div class="container">
		<a class="navbar-brand d-flex align-items-center fw-bold philips-text" href="/">
			<img src="https://www.philips.edu.ar/favicon.png" alt="Escuela Philips Logo" width="32" height="32" class="me-2" style="border-radius: 4px;" />
			Escuela Philips - Ingresos/Egresos
		</a>
		<div class="d-flex">
			{#if session}
				<span class="navbar-text me-3">{session.user.email}</span>
				<button class="btn btn-outline-secondary btn-sm" onclick={signOut}>Cerrar Sesión</button>
			{/if}
		</div>
	</div>
</nav>

<main class="container">
	{@render children()}
</main>
