<script>
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabaseClient';
	import { goto } from '$app/navigation';

	let loading = $state(true);
	let session = $state(null);
	let errorMsg = $state('');

	async function checkRoleAndRedirect(userSession, retries = 3) {
		if (!userSession) return;

		const { data, error } = await supabase
			.from('perfiles')
			.select('rol')
			.eq('id', userSession.user.id)
			.single();

		if (error || !data) {
			if (retries > 0) {
				await new Promise(r => setTimeout(r, 1000));
				return checkRoleAndRedirect(userSession, retries - 1);
			}
			console.error('Error obteniendo rol:', error);
			loading = false;
			return;
		}

		if (data.rol === 'student') {
			goto('/PP/alumno');
		} else if (data.rol === 'admin') {
			goto('/PP/admin');
		}
	}

	onMount(async () => {
		const { data } = await supabase.auth.getSession();
		session = data.session;

		if (session) {
			if (!session.user.email.endsWith('@philips.edu.ar')) {
				errorMsg = 'Acceso denegado. Solo se permiten correos @philips.edu.ar';
				await supabase.auth.signOut();
				session = null;
				loading = false;
			} else {
				await checkRoleAndRedirect(session);
				loading = false;
			}
		} else {
			loading = false;
		}

		supabase.auth.onAuthStateChange(async (_event, _session) => {
			session = _session;
			if (session) {
				if (!session.user.email.endsWith('@philips.edu.ar')) {
					errorMsg = 'Acceso denegado. Solo se permiten correos @philips.edu.ar';
					supabase.auth.signOut();
					session = null;
				} else {
					loading = true;
					await checkRoleAndRedirect(session);
					loading = false;
				}
			}
		});
	});

	async function loginGoogle() {
		errorMsg = '';
		const { error } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				queryParams: {
					hd: 'philips.edu.ar',
					prompt: 'select_account'
				}
			}
		});
		if (error) errorMsg = 'Error al iniciar sesión: ' + error.message;
	}
</script>

<svelte:head>
	<title>Pasantías - Escuela Philips</title>
</svelte:head>

<div class="row justify-content-center mt-3 mb-5">
	<div class="col-md-5 text-center">
		<img src="https://www.philips.edu.ar/favicon.png" alt="Philips" width="64" class="mb-3" style="border-radius:12px;" />
		<h1 class="fw-bold philips-text fs-2">Sistema de Pasantías</h1>
		<p class="text-muted">Registro de entrada — Escuela Philips</p>
	</div>
</div>

{#if loading}
	<div class="row justify-content-center">
		<div class="col-auto text-center">
			<div class="spinner-border text-primary mb-3" role="status"></div>
			<p class="text-muted small">Cargando tu perfil...</p>
		</div>
	</div>
{:else}
	{#if errorMsg}
		<div class="row justify-content-center mb-3">
			<div class="col-md-5">
				<div class="alert alert-danger text-center shadow-sm border-0 rounded-3">
					{errorMsg}
				</div>
			</div>
		</div>
	{/if}

	{#if !session}
		<div class="row justify-content-center">
			<div class="col-md-5">
				<div class="card glass-card p-5 text-center">
					<div class="mb-4">
						<span class="badge bg-primary-subtle text-primary border border-primary-subtle px-3 py-2 rounded-pill mb-3">
							Acceso Institucional
						</span>
						<h4 class="fw-bold mb-1">Iniciá sesión</h4>
						<p class="text-muted small mb-0">Usá tu cuenta <strong>@philips.edu.ar</strong></p>
					</div>
					<button
						id="btn-google-login"
						class="btn btn-lg btn-white border shadow-sm d-flex align-items-center justify-content-center mx-auto gap-2 px-4"
						onclick={loginGoogle}
					>
						<img src="https://www.google.com/favicon.ico" alt="Google" width="20">
						Iniciar sesión con Google
					</button>
				</div>
			</div>
		</div>
	{:else}
		<div class="row justify-content-center">
			<div class="col-auto text-center text-muted small">
				Redirigiendo... ({session.user.email})
			</div>
		</div>
	{/if}
{/if}
