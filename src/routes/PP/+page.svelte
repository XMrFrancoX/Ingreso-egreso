<script>
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { goto } from '$app/navigation';

	let loading = $state(true);

	async function checkAccesoYRedirigir(userSession, retries = 3) {
		if (!userSession) return;

		const { data, error } = await supabase
			.from('perfiles')
			.select('rol, curso_id')
			.eq('id', userSession.user.id)
			.single();

		if (error || !data) {
			if (retries > 0) {
				await new Promise(r => setTimeout(r, 1000));
				return checkAccesoYRedirigir(userSession, retries - 1);
			}
			goto('/');
			return;
		}

		// Preceptor/admin: acceso directo
		if (data.rol === 'admin' || data.rol === 'preceptor') {
			goto('/PP/admin');
			return;
		}

		// Alumno: verificar permiso
		if (data.curso_id) {
			const { data: permiso } = await supabase
				.from('seccion_cursos_permitidos')
				.select('id')
				.eq('seccion', 'PP')
				.eq('curso_id', data.curso_id)
				.maybeSingle();

			if (permiso) {
				goto('/PP/alumno');
				return;
			}
		}

		// Sin permiso → volver al inicio con mensaje
		goto('/?acceso=denegado&seccion=Pasantías');
	}

	onMount(async () => {
		const { data } = await supabase.auth.getSession();

		if (!data.session) {
			goto('/');
			return;
		}

		await checkAccesoYRedirigir(data.session);
		loading = false;
	});
</script>

{#if loading}
	<div class="row justify-content-center mt-5">
		<div class="col-auto text-center">
			<div class="spinner-border text-primary mb-3" role="status"></div>
			<p class="text-muted small">Verificando acceso...</p>
		</div>
	</div>
{/if}
