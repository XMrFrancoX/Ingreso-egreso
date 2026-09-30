<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { supabase } from '$lib/supabase';
	import { confirmDialog } from '$lib/utils/confirm';
	import { DIAS, DIA_NOMBRE, fmtHora, hoyISO, type Dia } from '$lib/fechas';
	import { exportarExcel, exportarPdf } from '$lib/exportar';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import TimePicker from '$lib/components/TimePicker.svelte';
	import { Plus, Pencil, UserMinus, Trash2, Search, LoaderCircle, FileSpreadsheet, FileText, Users, Hourglass } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn.js';

	type Empresa = { id: string; nombre: string };
	type AlumnoPP = { id: string; email: string; empresa_id: string | null; horario: string; dias: Dia[] };
	type Precargado = { id: string; email: string; empresa_id: string | null; horario: string; dias: Dia[] };

	let empresas = $state<Empresa[]>([]);
	let alumnos = $state<AlumnoPP[]>([]);
	let precargados = $state<Precargado[]>([]);
	let cargando = $state(true);
	let busqueda = $state('');

	const nombreEmpresa = (id: string | null) => empresas.find((e) => e.id === id)?.nombre ?? 'Sin empresa';

	async function cargar() {
		const [e, a, p] = await Promise.all([
			supabase.from('empresas').select('id, nombre').order('nombre'),
			supabase.from('perfiles').select('id, email, empresa_id, horario_entrada, dias_habilitados(dia)').eq('rol', 'student').order('email'),
			supabase.from('alumnos_precargados').select('id, email, empresa_id, horario_entrada, alumnos_precargados_dias(dia)').order('email')
		]);
		if (e.error || a.error || p.error) toast.error('No se pudieron cargar los alumnos de pasantías.');
		empresas = e.data ?? [];
		// Sólo los que tienen algo de pasantía (los demás son alumnos que usan comedor o recreativo).
		alumnos = (a.data ?? [])
			.map((x) => ({
				id: x.id,
				email: x.email,
				empresa_id: x.empresa_id,
				horario: x.horario_entrada?.slice(0, 5) ?? '',
				dias: (x.dias_habilitados ?? []).map((d) => d.dia as Dia)
			}))
			.filter((x) => x.empresa_id || x.horario || x.dias.length);
		precargados = (p.data ?? []).map((x) => ({
			id: x.id,
			email: x.email,
			empresa_id: x.empresa_id,
			horario: x.horario_entrada?.slice(0, 5) ?? '',
			dias: (x.alumnos_precargados_dias ?? []).map((d) => d.dia as Dia)
		}));
		cargando = false;
	}

	onMount(cargar);

	let filtrados = $derived(alumnos.filter((a) => a.email.toLowerCase().includes(busqueda.trim().toLowerCase())));

	// ---------- diálogo agregar / editar ----------
	let dialogo = $state<{ modo: 'agregar' | 'editar'; id?: string } | null>(null);
	let email = $state('');
	let empresaId = $state('');
	let horario = $state('');
	let dias = $state<Dia[]>([]);
	let guardando = $state(false);

	function abrirAgregar() {
		dialogo = { modo: 'agregar' };
		email = '';
		empresaId = '';
		horario = '';
		dias = [];
	}

	function abrirEditar(a: AlumnoPP) {
		dialogo = { modo: 'editar', id: a.id };
		email = a.email;
		empresaId = a.empresa_id ?? '';
		horario = a.horario;
		dias = [...a.dias];
	}

	function alternarDia(d: Dia) {
		dias = dias.includes(d) ? dias.filter((x) => x !== d) : DIAS.filter((x) => x === d || dias.includes(x));
	}

	async function guardarPerfil(perfilId: string) {
		const { error } = await supabase
			.from('perfiles')
			.update({ empresa_id: empresaId || null, horario_entrada: horario || null })
			.eq('id', perfilId);
		if (error) throw error;
		const del = await supabase.from('dias_habilitados').delete().eq('perfil_id', perfilId);
		if (del.error) throw del.error;
		if (dias.length) {
			const ins = await supabase.from('dias_habilitados').insert(dias.map((dia) => ({ perfil_id: perfilId, dia })));
			if (ins.error) throw ins.error;
		}
	}

	async function guardar() {
		if (!dialogo) return;
		const mail = email.trim().toLowerCase();
		if (!mail.endsWith('@philips.edu.ar')) return toast.error('Tiene que ser un mail @philips.edu.ar');
		guardando = true;
		try {
			if (dialogo.modo === 'editar') {
				await guardarPerfil(dialogo.id!);
				toast.success(`${mail} actualizado`);
			} else {
				// Si ya entró alguna vez se le asigna directo; si no, queda precargado y se aplica
				// solo en su primer ingreso a Pasantías.
				const { data: perfil } = await supabase.from('perfiles').select('id').eq('email', mail).maybeSingle();
				if (perfil) {
					await guardarPerfil(perfil.id);
					toast.success(`${mail} agregado a pasantías`);
				} else {
					const { data: pre, error } = await supabase
						.from('alumnos_precargados')
						.upsert({ email: mail, empresa_id: empresaId || null, horario_entrada: horario || null }, { onConflict: 'email' })
						.select('id')
						.single();
					if (error) throw error;
					await supabase.from('alumnos_precargados_dias').delete().eq('precargado_id', pre.id);
					if (dias.length) {
						const ins = await supabase.from('alumnos_precargados_dias').insert(dias.map((dia) => ({ precargado_id: pre.id, dia })));
						if (ins.error) throw ins.error;
					}
					toast.success(`${mail} todavía no entró: queda precargado para su primer ingreso`);
				}
			}
			dialogo = null;
			await cargar();
		} catch (e) {
			console.error(e);
			toast.error('No se pudo guardar: ' + (e as { message?: string }).message);
		} finally {
			guardando = false;
		}
	}

	async function quitar(a: AlumnoPP) {
		const ok = await confirmDialog({
			title: `¿Quitar a ${a.email} de pasantías?`,
			description: 'Se le borran la empresa, el horario y los días. Sigue pudiendo usar comedor y recreativo, y sus entradas registradas quedan.',
			confirmLabel: 'Quitar',
			destructive: true
		});
		if (!ok) return;
		const del = await supabase.from('dias_habilitados').delete().eq('perfil_id', a.id);
		const { error } = await supabase.from('perfiles').update({ empresa_id: null, horario_entrada: null }).eq('id', a.id);
		if (del.error || error) return toast.error('No se pudo quitar: ' + (del.error ?? error)!.message);
		toast.success(`${a.email} quitado de pasantías`);
		await cargar();
	}

	async function borrarPrecarga(p: Precargado) {
		const ok = await confirmDialog({
			title: '¿Borrar la precarga?',
			description: `${p.email} no va a tener pasantía asignada cuando entre.`,
			confirmLabel: 'Borrar',
			destructive: true
		});
		if (!ok) return;
		const { data, error } = await supabase.from('alumnos_precargados').delete().eq('id', p.id).select('id');
		if (error || !data?.length) return toast.error('No se pudo borrar' + (error ? ': ' + error.message : '.'));
		precargados = precargados.filter((x) => x.id !== p.id);
		toast.success('Precarga borrada');
	}

	async function exportar(tipo: 'excel' | 'pdf') {
		if (alumnos.length === 0) return toast.info('No hay alumnos para exportar.');
		const nombre = `Planilla_PP_${hoyISO()}`;
		try {
			if (tipo === 'excel') {
				await exportarExcel(
					`${nombre}.xlsx`,
					'PP',
					alumnos.map((a) => ({
						Mail: a.email,
						Empresa: nombreEmpresa(a.empresa_id),
						'Horario de entrada': fmtHora(a.horario),
						...Object.fromEntries(DIAS.map((d) => [DIA_NOMBRE[d], a.dias.includes(d) ? 'Sí' : '']))
					})),
					[32, 22, 16, 8, 8, 10, 8, 8]
				);
			} else {
				await exportarPdf({
					archivo: `${nombre}.pdf`,
					titulo: 'Pasantías (PP) — alumnos',
					subtitulo: `Escuela Técnica Philips — ${new Date().toLocaleDateString('es-AR')}`,
					columnas: ['Mail', 'Empresa', 'Entrada', ...DIAS],
					filas: alumnos.map((a) => [a.email, nombreEmpresa(a.empresa_id), fmtHora(a.horario), ...DIAS.map((d) => (a.dias.includes(d) ? 'Sí' : ''))]),
					centradas: [3, 4, 5, 6, 7]
				});
			}
		} catch (e) {
			console.error(e);
			toast.error('No se pudo generar el archivo.');
		}
	}
</script>

{#snippet pastillasDias(ds: Dia[])}
	<div class="flex gap-1">
		{#each DIAS as d (d)}
			<span
				title={DIA_NOMBRE[d]}
				class={cn(
					'flex size-6 items-center justify-center rounded-full text-xs font-medium',
					ds.includes(d) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
				)}>{d}</span
			>
		{/each}
	</div>
{/snippet}

<div class="flex flex-col gap-4">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
		<div class="relative sm:w-80">
			<Search class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input bind:value={busqueda} placeholder="Buscar por mail" class="pl-8" aria-label="Buscar alumno" />
		</div>
		<div class="grid grid-cols-3 gap-2 sm:ml-auto sm:flex">
			<Button variant="outline" onclick={() => exportar('excel')}><FileSpreadsheet />Excel</Button>
			<Button variant="outline" onclick={() => exportar('pdf')}><FileText />PDF</Button>
			<Button onclick={abrirAgregar}><Plus />Agregar</Button>
		</div>
	</div>

	{#if cargando}
		<Skeleton class="h-64 rounded-xl" />
	{:else}
		<Card.Root class="gap-0 py-0">
			<div class="border-b px-4 py-3 text-sm font-medium text-muted-foreground">
				{alumnos.length} alumnos en pasantías
			</div>
			{#if filtrados.length === 0}
				<div class="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
					<Users class="size-8" strokeWidth={1.5} />
					{busqueda.trim() ? `Nadie coincide con “${busqueda.trim()}”.` : 'Todavía no hay alumnos en pasantías.'}
				</div>
			{:else}
				<ul class="divide-y">
					{#each filtrados as a (a.id)}
						<li class="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center">
							<div class="min-w-0 flex-1">
								<div class="truncate font-medium">{a.email}</div>
								<div class="text-sm text-muted-foreground">
									{nombreEmpresa(a.empresa_id)} · entrada {fmtHora(a.horario)}
								</div>
							</div>
							{@render pastillasDias(a.dias)}
							<div class="flex gap-1">
								<Button variant="outline" size="sm" onclick={() => abrirEditar(a)}><Pencil />Editar</Button>
								<Button
									variant="ghost"
									size="icon-sm"
									class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
									aria-label="Quitar a {a.email} de pasantías"
									onclick={() => quitar(a)}
								>
									<UserMinus />
								</Button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Root>

		{#if precargados.length > 0}
			<Card.Root class="gap-0 py-0">
				<div class="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium text-muted-foreground">
					<Hourglass class="size-4" />
					Esperando su primer ingreso ({precargados.length})
				</div>
				<ul class="divide-y">
					{#each precargados as p (p.id)}
						<li class="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center">
							<div class="min-w-0 flex-1">
								<div class="truncate">{p.email}</div>
								<div class="text-sm text-muted-foreground">{nombreEmpresa(p.empresa_id)} · entrada {fmtHora(p.horario)}</div>
							</div>
							{@render pastillasDias(p.dias)}
							<Button
								variant="ghost"
								size="icon-sm"
								class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
								aria-label="Borrar la precarga de {p.email}"
								onclick={() => borrarPrecarga(p)}
							>
								<Trash2 />
							</Button>
						</li>
					{/each}
				</ul>
			</Card.Root>
		{/if}
	{/if}
</div>

<Dialog.Root open={dialogo !== null} onOpenChange={(o) => { if (!o && !guardando) dialogo = null; }}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{dialogo?.modo === 'editar' ? 'Editar pasantía' : 'Agregar alumno a pasantías'}</Dialog.Title>
			<Dialog.Description>
				{dialogo?.modo === 'editar' ? email : 'Si todavía no entró nunca, se le asigna en su primer ingreso.'}
			</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-4">
			{#if dialogo?.modo === 'agregar'}
				<div class="grid gap-2">
					<Label for="pp-email">Mail</Label>
					<Input id="pp-email" type="email" bind:value={email} placeholder="nombre@philips.edu.ar" />
				</div>
			{/if}
			<div class="grid gap-2">
				<Label for="pp-empresa">Empresa</Label>
				<Select.Root type="single" bind:value={empresaId}>
					<Select.Trigger id="pp-empresa" class="w-full">{empresaId ? nombreEmpresa(empresaId) : 'Sin empresa'}</Select.Trigger>
					<Select.Content>
						<Select.Item value="">Sin empresa</Select.Item>
						{#each empresas as e (e.id)}
							<Select.Item value={e.id}>{e.nombre}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			<div class="grid gap-2">
				<Label>Horario de entrada</Label>
				<TimePicker bind:value={horario} fromHour={6} toHour={20} />
			</div>
			<div class="grid gap-2">
				<Label>Días</Label>
				<div class="grid grid-cols-5 gap-1.5" role="group" aria-label="Días de pasantía">
					{#each DIAS as d (d)}
						<Button
							type="button"
							variant={dias.includes(d) ? 'default' : 'outline'}
							size="sm"
							aria-pressed={dias.includes(d)}
							title={DIA_NOMBRE[d]}
							onclick={() => alternarDia(d)}
						>
							{DIA_NOMBRE[d].slice(0, 3)}
						</Button>
					{/each}
				</div>
			</div>
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (dialogo = null)} disabled={guardando}>Cancelar</Button>
			<Button onclick={guardar} disabled={guardando}>
				{#if guardando}<LoaderCircle class="animate-spin" />{/if}
				Guardar
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
