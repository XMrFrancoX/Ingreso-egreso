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
                // Pequeña espera por si el trigger de la base de datos aún no terminó
                await new Promise(r => setTimeout(r, 1000));
                return checkRoleAndRedirect(userSession, retries - 1);
            }
            console.error('Error obteniendo rol:', error);
            return;
        }

        if (data.rol === 'student') {
            goto('/comedor/alumno');
        } else if (data.rol === 'preceptor' || data.rol === 'admin') {
            goto('/comedor/preceptor');
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
                loading = true; // Mantener cargando mientras redirige
                await checkRoleAndRedirect(session);
                // Si llegamos aquí y no redirigió (ej. no encontró perfil), quitamos loading
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

    async function logout() {
        await supabase.auth.signOut();
        session = null;
    }
</script>

<div class="row text-center mt-5">
	<div class="col-12">
		<h2 class="fw-bold philips-text">Sistema de Control Escolar</h2>
		<p class="text-muted">Gestión de Ingreso y Egreso - Escuela Philips</p>
	</div>
</div>

{#if loading}
    <div class="row justify-content-center mt-5">
        <div class="col-auto text-center">
            <div class="spinner-border text-primary mb-3" role="status"></div>
            <p class="text-muted small">Cargando tu perfil...</p>
        </div>
    </div>
{:else}
    {#if errorMsg}
        <div class="row justify-content-center mt-3">
            <div class="col-md-6">
                <div class="alert alert-danger text-center shadow-sm">
                    {errorMsg}
                </div>
            </div>
        </div>
    {/if}

    {#if !session}
        <div class="row justify-content-center mt-4">
            <div class="col-md-6 text-center">
                <div class="card glass-card shadow-sm p-5">
                    <h4 class="fw-bold mb-4">Acceso Institucional</h4>
                    <button class="btn btn-lg btn-white border shadow-sm d-flex align-items-center justify-content-center mx-auto" onclick={loginGoogle}>
                        <img src="https://www.google.com/favicon.ico" alt="Google" class="me-2" width="20">
                        Iniciar sesión con Google
                    </button>
                    <p class="text-muted small mt-3">Usa tu cuenta institucional @philips.edu.ar</p>
                </div>
            </div>
        </div>
    {:else}
        <!-- Esto solo se verá un instante si la redirección falla -->
        <div class="row text-center mb-4">
            <div class="col-12 text-muted">
                <p class="small">Redirigiendo... ({session.user.email}) | <button class="btn btn-link btn-sm text-danger p-0" onclick={logout}>Cerrar sesión</button></p>
            </div>
        </div>
    {/if}
{/if}
