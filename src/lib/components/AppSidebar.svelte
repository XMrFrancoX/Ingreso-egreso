<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { mergeProps } from 'bits-ui';
	import { auth, ROL_NOMBRE, type Seccion } from '$lib/auth.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import {
		House, UtensilsCrossed, BriefcaseBusiness, Volleyball, School, ShieldCheck, LogOut, ChevronsUpDown, Download
	} from '@lucide/svelte';
	import { instalacion } from '$lib/pwa.svelte';
	import type { Component } from 'svelte';

	type Item = { href: string; label: string; icon: Component; seccion?: Seccion };

	const modulos: Item[] = [
		{ href: '/comedor', label: 'Comedor', icon: UtensilsCrossed, seccion: 'comedor' },
		{ href: '/PP', label: 'Pasantías', icon: BriefcaseBusiness, seccion: 'PP' },
		{ href: '/recreativo', label: 'Recreativo', icon: Volleyball, seccion: 'recreativo' }
	];

	let visibles = $derived(modulos.filter((m) => !m.seccion || auth.puedeVer(m.seccion)));
	let admin = $derived<Item[]>([
		{ href: '/accesos', label: 'Cursos y accesos', icon: School },
		...(auth.esAdmin ? [{ href: '/usuarios', label: 'Usuarios y roles', icon: ShieldCheck }] : [])
	]);

	let meta = $derived(auth.session?.user.user_metadata ?? {});
	let nombre = $derived<string>(meta.full_name || meta.name || auth.email.split('@')[0] || 'Usuario');
	let iniciales = $derived(
		nombre
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map((w: string) => w[0].toUpperCase())
			.join('')
	);

	const sidebar = useSidebar();

	function activo(href: string) {
		const path = page.url.pathname;
		return href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
	}

	// En el celular el menú se superpone: cerrarlo al navegar (mergeProps porque el tooltip
	// trae su propio onclick).
	function alNavegar() {
		if (sidebar.isMobile) sidebar.setOpenMobile(false);
	}

	async function salir() {
		await auth.salir();
		goto('/');
	}
</script>

{#snippet grupo(titulo: string, items: Item[])}
	<Sidebar.Group>
		<Sidebar.GroupLabel>{titulo}</Sidebar.GroupLabel>
		<Sidebar.GroupContent>
			<Sidebar.Menu>
				{#each items as item (item.href)}
					<Sidebar.MenuItem>
						<Sidebar.MenuButton isActive={activo(item.href)} tooltipContent={item.label}>
							{#snippet child({ props })}
								<a href={item.href} {...mergeProps(props, { onclick: alNavegar })}>
									<item.icon />
									<span>{item.label}</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				{/each}
			</Sidebar.Menu>
		</Sidebar.GroupContent>
	</Sidebar.Group>
{/snippet}

<Sidebar.Root collapsible="icon">
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg" tooltipContent="Inicio">
					{#snippet child({ props })}
						<a href="/" {...mergeProps(props, { onclick: alNavegar })}>
							<div class="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-white">
								<img src="https://www.philips.edu.ar/favicon.png" alt="" class="size-6" />
							</div>
							<div class="grid flex-1 text-left leading-tight">
								<span class="truncate font-semibold">Ingresos y egresos</span>
								<span class="truncate text-xs text-muted-foreground">Escuela Técnica Philips</span>
							</div>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content>
		{@render grupo('General', [{ href: '/', label: 'Inicio', icon: House }])}
		{#if visibles.length > 0}
			{@render grupo('Módulos', visibles)}
		{/if}
		{#if auth.esStaff}
			{@render grupo('Administración', admin)}
		{/if}
	</Sidebar.Content>

	<Sidebar.Footer>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Sidebar.MenuButton
								{...props}
								size="lg"
								class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
							>
								<Avatar.Root class="size-8 rounded-lg">
									<Avatar.Image src={meta.avatar_url || meta.picture} alt="" referrerpolicy="no-referrer" />
									<Avatar.Fallback class="rounded-lg">{iniciales}</Avatar.Fallback>
								</Avatar.Root>
								<div class="grid flex-1 text-left leading-tight">
									<span class="truncate font-medium">{nombre}</span>
									<span class="truncate text-xs text-muted-foreground">{auth.perfil ? ROL_NOMBRE[auth.perfil.rol] : ''}</span>
								</div>
								<ChevronsUpDown class="ml-auto" />
							</Sidebar.MenuButton>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content
						class="w-(--bits-dropdown-menu-anchor-width) min-w-56"
						side={sidebar.isMobile ? 'bottom' : 'right'}
						align="end"
						sideOffset={4}
					>
						<DropdownMenu.Label class="font-normal">
							<div class="grid leading-tight">
								<span class="truncate font-medium">{nombre}</span>
								<span class="truncate text-xs text-muted-foreground">{auth.email}</span>
								{#if auth.perfil?.curso}
									<span class="truncate text-xs text-muted-foreground">Curso {auth.perfil.curso.nombre}</span>
								{/if}
							</div>
						</DropdownMenu.Label>
						<DropdownMenu.Separator />
						{#if instalacion.disponible}
							<DropdownMenu.Item onclick={() => instalacion.instalar()}>
								<Download />
								Instalar app
							</DropdownMenu.Item>
						{/if}
						<DropdownMenu.Item onclick={salir}>
							<LogOut />
							Cerrar sesión
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>
	<Sidebar.Rail />
</Sidebar.Root>
