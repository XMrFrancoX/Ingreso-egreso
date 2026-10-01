<script lang="ts">
	import { auth, ROL_NOMBRE, type Seccion } from '$lib/auth.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { UtensilsCrossed, BriefcaseBusiness, Volleyball, School, ShieldCheck, ChevronRight, Info } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn.js';
	import type { Component } from 'svelte';

	type Tarjeta = { href: string; titulo: string; descripcion: string; icon: Component; tinte: string; seccion?: Seccion };

	const modulos: Tarjeta[] = [
		{
			href: '/comedor',
			titulo: 'Comedor',
			descripcion: 'Salida e ingreso en el horario de almuerzo.',
			icon: UtensilsCrossed,
			tinte: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
			seccion: 'comedor'
		},
		{
			href: '/PP',
			titulo: 'Pasantías',
			descripcion: 'Asistencia a las Prácticas Profesionalizantes.',
			icon: BriefcaseBusiness,
			tinte: 'bg-primary/10 text-primary dark:text-blue-300',
			seccion: 'PP'
		},
		{
			href: '/recreativo',
			titulo: 'Recreativo',
			descripcion: 'Préstamo de paletas, pelotas y otros materiales.',
			icon: Volleyball,
			tinte: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
			seccion: 'recreativo'
		}
	];

	let visibles = $derived(modulos.filter((m) => m.seccion && auth.puedeVer(m.seccion)));
	let administracion = $derived<Tarjeta[]>([
		{
			href: '/accesos',
			titulo: 'Cursos y accesos',
			descripcion: 'Cursos, qué módulos ve cada uno, horarios de regreso y alumnos.',
			icon: School,
			tinte: 'bg-violet-500/15 text-violet-600 dark:text-violet-300'
		},
		...(auth.esAdmin
			? [
					{
						href: '/usuarios',
						titulo: 'Usuarios y roles',
						descripcion: 'Preceptores, administradores y roles precargados.',
						icon: ShieldCheck,
						tinte: 'bg-sky-500/15 text-sky-600 dark:text-sky-300'
					}
				]
			: [])
	]);

	let nombre = $derived<string>(
		(auth.session?.user.user_metadata?.full_name as string | undefined)?.split(' ')[0] ?? auth.email.split('@')[0]
	);
</script>

<svelte:head>
	<title>Inicio • Ingresos y egresos</title>
</svelte:head>

{#snippet tarjetas(items: Tarjeta[])}
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each items as t (t.href)}
			<Card.Root class="gap-0 py-0 transition-colors hover:bg-accent/30">
				<a href={t.href} class="flex items-center gap-4 rounded-xl p-5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
					<div class={cn('flex size-12 shrink-0 items-center justify-center rounded-xl', t.tinte)}>
						<t.icon class="size-6" />
					</div>
					<div class="min-w-0 flex-1">
						<h2 class="text-base font-semibold">{t.titulo}</h2>
						<p class="text-sm text-muted-foreground">{t.descripcion}</p>
					</div>
					<ChevronRight class="size-5 shrink-0 text-muted-foreground" />
				</a>
			</Card.Root>
		{/each}
	</div>
{/snippet}

<div class="mx-auto flex max-w-5xl flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">Hola, {nombre}</h1>
		<p class="text-muted-foreground">
			{#if auth.perfil?.rol === 'student'}
				{auth.perfil.curso ? `Curso ${auth.perfil.curso.nombre}` : 'Alumno'}
			{:else if auth.perfil}
				{ROL_NOMBRE[auth.perfil.rol]}
			{/if}
		</p>
	</div>

	{#if auth.perfil?.rol === 'student' && !auth.perfil.curso_id}
		<div class="flex items-start gap-2 rounded-lg border bg-muted/50 px-4 py-3 text-sm">
			<Info class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
			<p>
				Tu cuenta todavía no tiene curso asignado, así que por ahora sólo podés usar Recreativo. Pedile a un preceptor que
				te asigne tu curso.
			</p>
		</div>
	{/if}

	{@render tarjetas(visibles)}

	{#if auth.esStaff}
		<section class="flex flex-col gap-3">
			<h2 class="text-sm font-medium text-muted-foreground">Administración</h2>
			{@render tarjetas(administracion)}
		</section>
	{/if}
</div>
