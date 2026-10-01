<script lang="ts">
	import { auth } from '$lib/auth.svelte';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import QrFirma from '$lib/components/QrFirma.svelte';
	import RegistrosDia from '$lib/components/pp/RegistrosDia.svelte';
	import ReportePP from '$lib/components/pp/ReportePP.svelte';
	import AlumnosPP from '$lib/components/pp/AlumnosPP.svelte';
	import EmpresasPP from '$lib/components/pp/EmpresasPP.svelte';

	let tab = $state('hoy');
</script>

<svelte:head>
	<title>Pasantías • Ingresos y egresos</title>
</svelte:head>

<div class="mx-auto flex max-w-7xl flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">Pasantías</h1>
		<p class="text-muted-foreground">Asistencia a las Prácticas Profesionalizantes</p>
	</div>

	<Tabs.Root bind:value={tab}>
		<Tabs.List class="h-auto max-w-full flex-wrap justify-start">
			<Tabs.Trigger value="hoy">Entradas</Tabs.Trigger>
			<Tabs.Trigger value="reportes">Reportes</Tabs.Trigger>
			{#if auth.esAdmin}
				<Tabs.Trigger value="alumnos">Alumnos</Tabs.Trigger>
				<Tabs.Trigger value="empresas">Empresas</Tabs.Trigger>
			{/if}
		</Tabs.List>
	</Tabs.Root>

	{#if tab === 'hoy'}
		<div class="grid gap-6 lg:grid-cols-[18rem_1fr]">
			<div class="order-2 lg:order-1"><QrFirma app="PP" /></div>
			<div class="order-1 min-w-0 lg:order-2"><RegistrosDia /></div>
		</div>
	{:else if tab === 'reportes'}
		<ReportePP />
	{:else if tab === 'alumnos' && auth.esAdmin}
		<AlumnosPP />
	{:else if tab === 'empresas' && auth.esAdmin}
		<EmpresasPP />
	{/if}
</div>
