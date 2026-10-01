<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { supabase } from '$lib/supabase';
	import { fmtHora, fmtMinutos, hoyISO, minutosDeDiferencia } from '$lib/fechas';
	import { exportarExcel, exportarPdf } from '$lib/exportar';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import { FileSpreadsheet, FileText, LoaderCircle } from '@lucide/svelte';

	// Reporte de entradas de pasantía entre dos fechas, a Excel o PDF.
	let desde = $state(hoyISO());
	let hasta = $state(hoyISO());
	let generando = $state<'excel' | 'pdf' | null>(null);

	function rango(tipo: 'hoy' | 'semana' | 'mes') {
		const hoy = new Date(`${hoyISO()}T12:00:00`);
		hasta = hoyISO();
		if (tipo === 'hoy') desde = hasta;
		else if (tipo === 'semana') {
			const lunes = new Date(hoy);
			lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
			desde = hoyISO(lunes);
		} else desde = hoyISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1, 12));
	}

	type Fila = { fecha: string; alumno: string; empresa: string; esperada: string; entrada: string; estado: string };

	async function datos(): Promise<Fila[] | null> {
		if (desde > hasta) {
			toast.error('La fecha "desde" es posterior a "hasta".');
			return null;
		}
		const { data, error } = await supabase
			.from('registros')
			.select('fecha, hora_entrada_real, perfil:perfil_id(email, horario_entrada, empresa:empresa_id(nombre))')
			.gte('fecha', desde)
			.lte('fecha', hasta)
			.order('fecha')
			.order('hora_entrada_real');
		if (error) {
			toast.error('No se pudo generar el reporte: ' + error.message);
			return null;
		}
		const filas = (data as unknown as { fecha: string; hora_entrada_real: string; perfil: { email: string; horario_entrada: string | null; empresa: { nombre: string } | null } | null }[]).map((r) => {
			const tarde = minutosDeDiferencia(r.hora_entrada_real, r.perfil?.horario_entrada);
			return {
				fecha: r.fecha,
				alumno: r.perfil?.email ?? '—',
				empresa: r.perfil?.empresa?.nombre ?? '—',
				esperada: fmtHora(r.perfil?.horario_entrada),
				entrada: fmtHora(r.hora_entrada_real),
				estado: tarde !== null && tarde > 0 ? `Tarde ${fmtMinutos(tarde)}` : 'A horario'
			};
		});
		if (filas.length === 0) {
			toast.info('No hay entradas registradas en ese rango.');
			return null;
		}
		return filas;
	}

	async function exportar(tipo: 'excel' | 'pdf') {
		generando = tipo;
		try {
			const filas = await datos();
			if (!filas) return;
			const nombre = `Registros_PP_${desde}_a_${hasta}`;
			if (tipo === 'excel') {
				await exportarExcel(
					`${nombre}.xlsx`,
					'Registros',
					filas.map((f) => ({ Fecha: f.fecha, Alumno: f.alumno, Empresa: f.empresa, 'Entrada esperada': f.esperada, 'Entrada real': f.entrada, Estado: f.estado })),
					[12, 32, 22, 16, 14, 18]
				);
			} else {
				await exportarPdf({
					archivo: `${nombre}.pdf`,
					titulo: 'Pasantías (PP) — entradas registradas',
					subtitulo: `Escuela Técnica Philips — del ${desde} al ${hasta}`,
					columnas: ['Fecha', 'Alumno', 'Empresa', 'Esperada', 'Entrada', 'Estado'],
					filas: filas.map((f) => [f.fecha, f.alumno, f.empresa, f.esperada, f.entrada, f.estado])
				});
			}
			toast.success(`${filas.length} registros exportados`);
		} catch (e) {
			console.error(e);
			toast.error('No se pudo generar el archivo.');
		} finally {
			generando = null;
		}
	}
</script>

<Card.Root class="max-w-2xl">
	<Card.Header>
		<Card.Title>Reporte de entradas</Card.Title>
		<Card.Description>Todas las entradas registradas entre dos fechas, con su estado.</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-4">
		<div class="flex flex-wrap gap-2">
			<Button variant="outline" size="sm" onclick={() => rango('hoy')}>Hoy</Button>
			<Button variant="outline" size="sm" onclick={() => rango('semana')}>Esta semana</Button>
			<Button variant="outline" size="sm" onclick={() => rango('mes')}>Este mes</Button>
		</div>
		<div class="grid gap-4 sm:grid-cols-2">
			<div class="grid gap-2">
				<Label for="desde">Desde</Label>
				<DatePicker id="desde" bind:value={desde} />
			</div>
			<div class="grid gap-2">
				<Label for="hasta">Hasta</Label>
				<DatePicker id="hasta" bind:value={hasta} />
			</div>
		</div>
		<div class="grid grid-cols-2 gap-2 sm:flex">
			<Button variant="outline" disabled={generando !== null} onclick={() => exportar('excel')}>
				{#if generando === 'excel'}<LoaderCircle class="animate-spin" />{:else}<FileSpreadsheet />{/if}
				Excel
			</Button>
			<Button variant="outline" disabled={generando !== null} onclick={() => exportar('pdf')}>
				{#if generando === 'pdf'}<LoaderCircle class="animate-spin" />{:else}<FileText />{/if}
				PDF
			</Button>
		</div>
	</Card.Content>
</Card.Root>
