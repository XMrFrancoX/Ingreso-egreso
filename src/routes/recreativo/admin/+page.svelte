<script>
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabaseClient';
    import { goto } from '$app/navigation';

    let session = $state(null);
    let items = $state([]);
    let newItemName = $state('');
    let loading = $state(true);
    let errorMsg = $state('');

    onMount(async () => {
        const { data } = await supabase.auth.getSession();
        session = data.session;
        if (!session) {
            goto('/recreativo');
            return;
        }

        // Validate role
        const { data: perfil } = await supabase
            .from('perfiles')
            .select('rol')
            .eq('id', session.user.id)
            .single();

        if (!perfil || (perfil.rol !== 'preceptor' && perfil.rol !== 'admin')) {
            goto('/recreativo');
            return;
        }

        await loadItems();
        loading = false;
    });

    async function loadItems() {
        const { data, error } = await supabase
            .from('recreativo_items')
            .select('*')
            .order('creado_en', { ascending: false });

        if (error) {
            errorMsg = 'Error al cargar ítems: ' + error.message;
        } else {
            items = data;
        }
    }

    async function addItem() {
        if (!newItemName.trim()) return;

        const { error } = await supabase
            .from('recreativo_items')
            .insert({ nombre: newItemName.trim() });

        if (error) {
            alert('Error al agregar ítem: ' + error.message);
        } else {
            newItemName = '';
            await loadItems();
        }
    }

    async function toggleActive(item) {
        const { error } = await supabase
            .from('recreativo_items')
            .update({ activo: !item.activo })
            .eq('id', item.id);

        if (error) {
            alert('Error al actualizar: ' + error.message);
        } else {
            await loadItems();
        }
    }
</script>

<svelte:head>
    <title>Configuración Recreativo - Escuela Philips</title>
</svelte:head>

<div class="row mb-4">
    <div class="col-md-8">
        <h2 class="fw-bold philips-text mb-1">Configuración Recreativo</h2>
        <p class="text-muted small">Gestión de ítems disponibles para retiro</p>
    </div>
    <div class="col-md-4 text-md-end">
        <a href="/recreativo/preceptor" class="btn btn-outline-secondary fw-bold px-3 shadow-sm">
            VOLVER AL PANEL
        </a>
    </div>
</div>

{#if loading}
    <div class="text-center py-5">
        <div class="spinner-border text-primary" role="status"></div>
    </div>
{:else}
    {#if errorMsg}
        <div class="alert alert-danger">{errorMsg}</div>
    {/if}

    <div class="card glass-card shadow-sm border-0 mb-4 p-4">
        <h5 class="fw-bold mb-3">Agregar Nuevo Ítem</h5>
        <div class="d-flex gap-2">
            <input type="text" class="form-control" placeholder="Ej: Paleta de Ping Pong 1" bind:value={newItemName} onkeydown={(e) => e.key === 'Enter' && addItem()} />
            <button class="btn btn-primary fw-bold" onclick={addItem}>AGREGAR</button>
        </div>
    </div>

    <div class="card glass-card shadow-sm border-0 overflow-hidden">
        <div class="table-responsive">
            <table class="table table-hover mb-0 align-middle">
                <thead class="table-light text-muted small text-uppercase">
                    <tr>
                        <th class="ps-4">Nombre del Ítem</th>
                        <th>Estado</th>
                        <th class="text-end pe-4">Acción</th>
                    </tr>
                </thead>
                <tbody>
                    {#if items.length === 0}
                        <tr><td colspan="3" class="py-4 text-center text-muted">No hay ítems registrados.</td></tr>
                    {:else}
                        {#each items as item (item.id)}
                            <tr>
                                <td class="ps-4 fw-medium {item.activo ? 'text-dark' : 'text-muted text-decoration-line-through'}">
                                    {item.nombre}
                                </td>
                                <td>
                                    {#if item.activo}
                                        <span class="badge bg-success-subtle text-success border border-success-subtle">Activo</span>
                                    {:else}
                                        <span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">Inactivo</span>
                                    {/if}
                                </td>
                                <td class="text-end pe-4">
                                    <button 
                                        class="btn btn-sm {item.activo ? 'btn-outline-danger' : 'btn-outline-success'}" 
                                        onclick={() => toggleActive(item)}
                                    >
                                        {item.activo ? 'Desactivar' : 'Activar'}
                                    </button>
                                </td>
                            </tr>
                        {/each}
                    {/if}
                </tbody>
            </table>
        </div>
    </div>
{/if}
