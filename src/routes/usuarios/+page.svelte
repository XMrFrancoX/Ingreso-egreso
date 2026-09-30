<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { supabase } from '$lib/supabase';
	import { auth, ROL_NOMBRE, type Rol } from '$lib/auth.svelte';
	import { confirmDialog } from '$lib/utils/confirm';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { Plus, Trash2, LoaderCircle, Search, Mail } from '@lucide/svelte';

	type Usuario = { id: string; email: string; rol: Rol };
	type Precarga = { id: string; email: string; rol: string };

	const ROLES: Rol[] = ['student', 'preceptor', 'admin'];
	const DOMINIO = '@philips.edu.ar';

	let tab = $state('usuarios');
	let usuarios = $state<Usuario[]>([]);
	let precargas = $state<Precarga[]>([]);
	let cargando = $state(true);
	let busqueda = $state('');
	let soloStaff = $state(true);
	let guardando = $state<string | null>(null);

	async function cargar() {
		const [u, p] = await Promise.all([
			supabase.from('perfiles').select('id, email, rol').order('email'),
			supabase.from('roles_precargados').select('id, email, rol').order('email')
		]);
		if (u.error || p.error) toast.error('No se pudieron cargar los usuarios.');
		usuarios = (u.data as Usuario[] | null) ?? [];
		precargas = p.data ?? [];
		cargando = false;
	}

	onMount(cargar);

	let filtrados = $derived(
		usuarios.filter(
			(u) =>
				u.email.toLowerCase().includes(busqueda.trim().toLowerCase()) &&
				(busqueda.trim() ? true : !soloStaff || u.rol !== 'student')
		)
	);

	async function cambiarRol(u: Usuario, rol: Rol) {
		if (u.rol === rol) return;
		if (rol === 'admin') {
			const ok = await confirmDialog({
				title: `¿Hacer administrador a ${u.email}?`,
				description: 'Va a poder cambiar roles, empresas, precargas y todo lo demás.',
				confirmLabel: 'Hacer administrador'
			});
			if (!ok) return;
		}
		guardando = u.id;
		const { data, error } = await supabase.from('perfiles').update({ rol }).eq('id', u.id).select('rol');
		guardando = null;
		if (error || !data?.length) return toast.error('No se pudo cambiar el rol' + (error ? ': ' + error.message : '.'));
		u.rol = rol;
		toast.success(`${u.email} ahora es ${ROL_NOMBRE[rol].toLowerCase()}`);
	}

	// ---------- precargas ----------
	let nuevoEmail = $state('');
	let nuevoRol = $state<'preceptor' | 'admin'>('preceptor');
	let agregando = $state(false);

	async function agregarPrecarga(event: Event) {
		event.preventDefault();
		const email = nuevoEmail.trim().toLowerCase();
		if (!email.endsWith(DOMINIO)) return toast.error(`Tiene que ser un mail ${DOMINIO}`);
		agregando = true;
		const { error } = await supabase.from('roles_precargados').upsert({ email, rol: nuevoRol }, { onConflict: 'email' });
		agregando = false;
		if (error) return toast.error('No se pudo precargar: ' + error.message);
		nuevoEmail = '';
		toast.success(`${email} va a entrar como ${ROL_NOMBRE[nuevoRol].toLowerCase()}`);
		await cargar();
	}

	async function borrarPrecarga(p: Precarga) {
		const ok = await confirmDialog({
			title: '¿Quitar la precarga?',
			description: `${p.email} va a entrar como alumno cuando inicie sesión.`,
			confirmLabel: 'Quitar',
			destructive: true
		});
		if (!ok) return;
		const { data, error } = await supabase.from('roles_precargados').delete().eq('id', p.id).select('id');
		if (error || !data?.length) return toast.error('No se pudo quitar' + (error ? ': ' + error.message : '.'));
		precargas = precargas.filter((x) => x.id !== p.id);
		toast.success('Precarga quitada');
	}
</script>

<svelte:head>
	<title>Usuarios y roles • Ingresos y egresos</title>
</svelte:head>

<div class="mx-auto flex max-w-4xl flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">Usuarios y roles</h1>
		<p class="text-muted-foreground">Preceptores y administradores</p>
	</div>

	<Tabs.Root bind:value={tab}>
		<Tabs.List>
			<Tabs.Trigger value="usuarios">Usuarios</Tabs.Trigger>
			<Tabs.Trigger value="precargas">
				Precargados
				{#if !cargando}<span class="text-muted-foreground tabular-nums">{precargas.length}</span>{/if}
			</Tabs.Trigger>
		</Tabs.List>
	</Tabs.Root>

	{#if cargando}
		<Skeleton class="h-72 rounded-xl" />
	{:else if tab === 'usuarios'}
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
			<div class="relative sm:w-80">
				<Search class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input bind:value={busqueda} placeholder="Buscar por mail (incluye alumnos)" class="pl-8" aria-label="Buscar usuario" />
			</div>
			{#if !busqueda.trim()}
				<p class="text-sm text-muted-foreground">Mostrando el staff. Buscá un mail para ver alumnos.</p>
			{/if}
		</div>

		<Card.Root class="gap-0 py-0">
			{#if filtrados.length === 0}
				<p class="py-12 text-center text-sm text-muted-foreground">Nadie coincide con “{busqueda.trim()}”.</p>
			{:else}
				<ul class="divide-y">
					{#each filtrados.slice(0, 100) as u (u.id)}
						{@const yo = u.id === auth.perfil?.id}
						<li class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
							<div class="flex min-w-0 flex-1 items-center gap-2">
								<span class="truncate">{u.email}</span>
								{#if yo}<Badge variant="secondary">Vos</Badge>{/if}
							</div>
							<Select.Root type="single" value={u.rol} disabled={yo || guardando === u.id} onValueChange={(v) => cambiarRol(u, v as Rol)}>
								<Select.Trigger class="w-full sm:w-44" aria-label="Rol de {u.email}">
									<span class="flex items-center gap-2">
										{#if guardando === u.id}<LoaderCircle class="animate-spin" />{/if}
										{ROL_NOMBRE[u.rol] ?? u.rol}
									</span>
								</Select.Trigger>
								<Select.Content>
									{#each ROLES as r (r)}
										<Select.Item value={r}>{ROL_NOMBRE[r]}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title>Rol al primer ingreso</Card.Title>
				<Card.Description>
					Para quien todavía no entró: cuando inicie sesión con ese mail, recibe el rol elegido.
				</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-4">
				<form class="flex flex-col gap-2 sm:flex-row" onsubmit={agregarPrecarga}>
					<Input type="email" bind:value={nuevoEmail} placeholder="nombre{DOMINIO}" aria-label="Mail" class="min-w-0 flex-1" />
					<Select.Root type="single" bind:value={nuevoRol}>
						<Select.Trigger class="w-full sm:w-40" aria-label="Rol">{ROL_NOMBRE[nuevoRol]}</Select.Trigger>
						<Select.Content>
							<Select.Item value="preceptor">Preceptor</Select.Item>
							<Select.Item value="admin">Administrador</Select.Item>
						</Select.Content>
					</Select.Root>
					<Button type="submit" disabled={agregando || !nuevoEmail.trim()}>
						{#if agregando}<LoaderCircle class="animate-spin" />{:else}<Plus />{/if}
						Agregar
					</Button>
				</form>
				{#if precargas.length === 0}
					<div class="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-sm text-muted-foreground">
						<Mail class="size-8" strokeWidth={1.5} />
						No hay roles precargados.
					</div>
				{:else}
					<ul class="divide-y rounded-lg border">
						{#each precargas as p (p.id)}
							<li class="flex items-center gap-3 py-2 pr-2 pl-3">
								<span class="min-w-0 flex-1 truncate text-sm">{p.email}</span>
								<Badge variant="secondary">{ROL_NOMBRE[p.rol as Rol] ?? p.rol}</Badge>
								<Button
									variant="ghost"
									size="icon-sm"
									class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
									aria-label="Quitar {p.email}"
									onclick={() => borrarPrecarga(p)}
								>
									<Trash2 />
								</Button>
							</li>
						{/each}
					</ul>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
