<script lang="ts">
	import '../tailwind.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ModeWatcher } from 'mode-watcher';
	import { toast } from 'svelte-sonner';
	import { auth, type Seccion } from '$lib/auth.svelte';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import AppSidebar from '$lib/components/AppSidebar.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import Login from '$lib/components/Login.svelte';
	import AppInstalable from '$lib/components/AppInstalable.svelte';
	import { LoaderCircle } from '@lucide/svelte';

	let { children } = $props();

	onMount(() => void auth.iniciar());

	// Título de la barra superior (el prefijo más largo que coincida).
	const titulos: [string, string][] = [
		['/comedor', 'Comedor'],
		['/PP', 'Pasantías'],
		['/recreativo', 'Recreativo'],
		['/accesos', 'Cursos y accesos'],
		['/usuarios', 'Usuarios y roles'],
		['/', 'Inicio']
	];
	let titulo = $derived(titulos.find(([p]) => page.url.pathname.startsWith(p))?.[1] ?? '');

	// Quién puede entrar a cada ruta. Antes cada pantalla lo chequeaba por su cuenta (y
	// algunas no lo hacían): acá queda en un solo lugar.
	const SOLO_ADMIN = ['/usuarios'];
	const SOLO_STAFF = ['/accesos', '/comedor/preceptor', '/PP/admin', '/recreativo/preceptor'];
	const SECCION_DE: [string, Seccion, string][] = [
		['/comedor', 'comedor', 'Comedor'],
		['/PP', 'PP', 'Pasantías'],
		['/recreativo', 'recreativo', 'Recreativo']
	];
	const empieza = (ruta: string, prefijos: string[]) => prefijos.some((p) => ruta === p || ruta.startsWith(p + '/'));

	$effect(() => {
		if (auth.cargando || !auth.perfil) return;
		const ruta = page.url.pathname;
		let negado = '';
		if (empieza(ruta, SOLO_ADMIN) && !auth.esAdmin) negado = 'esa sección';
		else if (empieza(ruta, SOLO_STAFF) && !auth.esStaff) negado = 'esa sección';
		else {
			const s = SECCION_DE.find(([p]) => empieza(ruta, [p]));
			if (s && !auth.puedeVer(s[1])) negado = s[2];
		}
		if (negado) {
			toast.error(`No tenés acceso a ${negado}.`);
			goto('/', { replaceState: true });
		}
	});
</script>

<!-- themeColors: color de la barra del sistema (celular / app instalada) según el tema. -->
<ModeWatcher themeColors={{ light: '#ffffff', dark: '#07090f' }} />
<Toaster richColors position="top-center" />
<ConfirmDialog />

{#if auth.cargando}
	<div class="flex min-h-svh flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
		<LoaderCircle class="size-8 animate-spin text-primary" />
		<p class="text-sm">Cargando…</p>
	</div>
{:else if !auth.session}
	<Login />
{:else}
	<Sidebar.Provider>
		<AppSidebar />
		<Sidebar.Inset class="min-w-0">
			<header
				class="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur supports-backdrop-filter:bg-background/70"
			>
				<Sidebar.Trigger class="-ml-1" />
				<Separator orientation="vertical" class="mr-1 h-4!" />
				<span class="truncate text-sm font-medium">{titulo}</span>
				<ThemeToggle class="-mr-1 ml-auto" />
			</header>
			<AppInstalable />
			<div class="flex-1 p-4 md:p-6 lg:p-8">
				{@render children()}
			</div>
		</Sidebar.Inset>
	</Sidebar.Provider>
{/if}
