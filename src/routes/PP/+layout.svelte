<script>
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';

	let { children } = $props();
	let session = $state(null);

	onMount(() => {
		supabase.auth.getSession().then(({ data }) => {
			session = data.session;
		});

		const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, _session) => {
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
		<a class="navbar-brand d-flex align-items-center fw-bold philips-text gap-2" href="/">
			<img src="https://www.philips.edu.ar/favicon.png" alt="Escuela Philips" width="32" height="32" style="border-radius:6px;" />
			<span>Escuela Philips <span class="text-muted fw-normal fs-6">— Pasantías</span></span>
		</a>
		<div class="d-flex align-items-center gap-2">
			{#if session}
				<span class="badge bg-light text-muted border small fw-normal d-none d-md-inline">{session.user.email}</span>
				<button class="btn btn-outline-secondary btn-sm" onclick={signOut}>Cerrar Sesión</button>
			{/if}
		</div>
	</div>
</nav>

<main class="container pb-5">
	{@render children()}
</main>
