<script>
	import { onMount, onDestroy } from 'svelte';
	import QRCode from 'qrcode';
	import * as XLSX from 'xlsx';
	import jsPDF from 'jspdf';
	import autoTable from 'jspdf-autotable';
	import { supabase } from '$lib/supabaseClient';
	import { goto } from '$app/navigation';

	let session = $state(null);
	let loading = $state(true);
	let saving = $state(null);
	let errorMsg = $state('');
	let successMsg = $state('');
	let loadingRegistros = $state(false);
	let isAdmin = $state(false);

	let timeOffset = 0;
	let isFullScreen = $state(false);

	async function syncTime() {
		try {
			const res = await fetch(window.location.origin + '/?_t=' + Date.now(), { method: 'HEAD' });
			const dateStr = res.headers.get('Date');
			if (dateStr) {
				timeOffset = new Date(dateStr).getTime() - Date.now();
			}
		} catch (e) {
			console.warn('Error sincronizando hora:', e);
		}
	}

	let qrToken = $state('');
	let qrDataURL = $state('');
	let timeLeft = $state(60);
	let timerInterval;

	let nuevaEmpresa = $state('');
	let addingEmpresa = $state(false);
	let alumnos = $state([]);
	let empresas = $state([]);
	let registros = $state([]);
	let selectedDate = $state(new Date().toLocaleDateString('en-CA'));

	// Precarga
	let precargaEmail = $state('');
	let precargaEmpresaId = $state('');
	let precargaHorario = $state('');
	let precargaDias = $state([]);
	let addingPrecarga = $state(false);
	let precargados = $state([]);

	// Confirmación eliminación
	let confirmDelete = $state(null); // { tipo: 'empresa'|'alumno'|'precarga', id, nombre }

	// Gestión de roles
	let usuarios = $state([]);
	let usuarioFiltro = $state('');
	let savingRol = $state(new Set());

	// Precarga de rol (preceptor/admin) para emails que aún no iniciaron sesión
	let rolesPrecargados = $state([]);
	let precargaRolEmail = $state('');
	let precargaRolValor = $state('preceptor');
	let addingPrecargaRol = $state(false);

	// Reporte de registros por rango de fechas
	let reporteDesde = $state(new Date().toLocaleDateString('en-CA'));
	let reporteHasta = $state(new Date().toLocaleDateString('en-CA'));
	let generandoReporte = $state(false);

	const TODOS_DIAS = ['L', 'M', 'X', 'J', 'V'];
	const DIAS_NOMBRE = { L: 'Lunes', M: 'Martes', X: 'Miércoles', J: 'Jueves', V: 'Viernes' };
	const ROLES = ['student', 'preceptor', 'admin'];
	const ROL_NOMBRE = { student: 'Alumno', preceptor: 'Preceptor', admin: 'Admin' };

		function fmtHora(t) { return t ? t.substring(0, 5) : '—'; }

	function fmtDiferencia(real, asignado) {
		if (!real || !asignado) return null;
		const [hR, mR] = real.split(':').map(Number);
		const [hA, mA] = asignado.split(':').map(Number);
		const minReal = hR * 60 + mR;
		const minAsignado = hA * 60 + mA;
		const diff = minReal - minAsignado;
		
		if (diff <= 0) return { texto: 'En Escuela', clase: 'bg-success-subtle text-success border-success-subtle' };
		if (diff < 60) return { texto: `Tarde: ${diff} min`, clase: 'bg-danger-subtle text-danger border-danger-subtle' };
		
		const h = Math.floor(diff / 60);
		const m = diff % 60;
		return { texto: `Tarde: ${h}h ${m}m`, clase: 'bg-danger-subtle text-danger border-danger-subtle' };
	}


	function showSuccess(msg) {
		successMsg = msg;
		setTimeout(() => { successMsg = ''; }, 3000);
	}

	onMount(async () => {
		const { data } = await supabase.auth.getSession();
		session = data.session;
		if (!session) { goto('/'); return; }

		const { data: p } = await supabase
			.from('perfiles').select('rol').eq('id', session.user.id).single();
		if (!p || (p.rol !== 'admin' && p.rol !== 'preceptor')) { goto('/'); return; }

		isAdmin = p.rol === 'admin';

		await Promise.all([
			syncTime(),
			isAdmin ? cargarAlumnos() : Promise.resolve(),
			isAdmin ? cargarEmpresas() : Promise.resolve(),
			isAdmin ? cargarPrecargados() : Promise.resolve(),
			isAdmin ? cargarUsuarios() : Promise.resolve(),
			isAdmin ? cargarRolesPrecargados() : Promise.resolve(),
			cargarRegistros()
		]);

		createNewQR();
		timerInterval = setInterval(() => {
			timeLeft--;
			if (timeLeft <= 0) createNewQR();
		}, 1000);

		document.addEventListener('fullscreenchange', () => {
			isFullScreen = !!document.fullscreenElement;
		});

		loading = false;
	});

	onDestroy(() => {
		if (timerInterval) clearInterval(timerInterval);
	});

	function createNewQR() {
		const payload = { app: 'PP', timestamp: Date.now() + timeOffset };
		const newToken = JSON.stringify(payload);
		qrToken = 'QR Dinámico Activo';
		generateQRCode(newToken);
		timeLeft = 60;
	}

	async function generateQRCode(text) {
		try {
			qrDataURL = await QRCode.toDataURL(text, {
				width: 300,
				margin: 2,
				color: { dark: '#0B5EAA', light: '#ffffff' }
			});
		} catch (err) {
			console.error('Error generando QR:', err);
		}
	}

	function toggleFullScreen() {
		const elem = document.getElementById('fullscreen-qr-view');
		if (!document.fullscreenElement) {
			elem?.requestFullscreen().catch(err => {
				console.error(`Error attempting to enable fullscreen: ${err.message}`);
			});
		} else {
			document.exitFullscreen();
		}
	}

	async function cargarAlumnos() {
		const { data, error } = await supabase
			.from('perfiles')
			.select(`id, email, horario_entrada, empresa:empresa_id ( id, nombre ), dias_habilitados ( dia )`)
			.eq('rol', 'student')
			.order('email');
		if (error) { console.error(error); return; }
		const list = (data ?? []).map(a => ({
			...a,
			empresa_id: a.empresa?.id ?? '',
			dias: a.dias_habilitados?.map(d => d.dia) ?? [],
			horario_entrada: a.horario_entrada ?? ''
		}));
		
		// Filtrar: Solo mostrar si tienen empresa, horario o días asignados 
		// (evita mostrar alumnos que solo se registraron para Comedor)
		alumnos = list.filter(a => a.empresa_id || a.horario_entrada || a.dias.length > 0);
	}

	async function cargarEmpresas() {
		const { data } = await supabase.from('empresas').select('id, nombre').order('nombre');
		empresas = data ?? [];
	}

	async function cargarPrecargados() {
		const { data } = await supabase
			.from('alumnos_precargados')
			.select(`id, email, horario_entrada, empresa:empresa_id ( id, nombre ), alumnos_precargados_dias ( dia )`)
			.order('email');
		precargados = (data ?? []).map(p => ({
			...p,
			empresa_nombre: p.empresa?.nombre ?? '—',
			dias: p.alumnos_precargados_dias?.map(d => d.dia) ?? []
		}));
	}

	async function cargarUsuarios() {
		const { data, error } = await supabase
			.from('perfiles')
			.select('id, email, rol')
			.order('email');
		if (error) { console.error(error); return; }
		usuarios = data ?? [];
	}

	async function actualizarRol(usuario, nuevoRol) {
		if (usuario.id === session.user.id) {
			errorMsg = 'No podés cambiar tu propio rol desde acá.';
			return;
		}
		const rolAnterior = usuario.rol;
		savingRol.add(usuario.id);
		savingRol = new Set(savingRol);
		errorMsg = '';

		const { data, error } = await supabase
			.from('perfiles')
			.update({ rol: nuevoRol })
			.eq('id', usuario.id)
			.select();

		if (error || !data || data.length === 0) {
			errorMsg = 'Error al cambiar el rol: ' + (error?.message ?? 'Sin permisos (RLS).');
			usuario.rol = rolAnterior;
		} else {
			usuario.rol = nuevoRol;
			showSuccess(`✓ ${usuario.email} ahora es ${ROL_NOMBRE[nuevoRol]}`);
		}

		savingRol.delete(usuario.id);
		savingRol = new Set(savingRol);
	}

	async function cargarRolesPrecargados() {
		const { data, error } = await supabase
			.from('roles_precargados')
			.select('id, email, rol')
			.order('email');
		if (error) { console.error(error); return; }
		rolesPrecargados = data ?? [];
	}

	async function agregarPrecargaRol() {
		if (!precargaRolEmail.trim()) { errorMsg = 'Ingresá un email válido.'; return; }
		addingPrecargaRol = true;
		errorMsg = '';
		const email = precargaRolEmail.trim().toLowerCase();

		const { error } = await supabase
			.from('roles_precargados')
			.upsert({ email, rol: precargaRolValor }, { onConflict: 'email' });

		if (error) {
			errorMsg = 'Error al precargar el rol: ' + error.message;
		} else {
			precargaRolEmail = '';
			precargaRolValor = 'preceptor';
			await cargarRolesPrecargados();
			showSuccess('✓ Rol precargado correctamente');
		}
		addingPrecargaRol = false;
	}

	async function eliminarPrecargaRol(p) {
		const { data, error } = await supabase.from('roles_precargados').delete().eq('id', p.id).select();
		if (error || !data || data.length === 0) {
			errorMsg = 'Error al eliminar la precarga: ' + (error?.message ?? 'Sin permisos (RLS).');
		} else {
			await cargarRolesPrecargados();
			showSuccess('✓ Precarga de rol eliminada');
		}
	}

	function rangoReporteHoy() {
		const hoy = new Date().toLocaleDateString('en-CA');
		reporteDesde = hoy;
		reporteHasta = hoy;
	}

	function rangoReporteSemana() {
		const hoy = new Date();
		const offset = hoy.getDay() === 0 ? 6 : hoy.getDay() - 1;
		const lunes = new Date(hoy);
		lunes.setDate(hoy.getDate() - offset);
		reporteDesde = lunes.toLocaleDateString('en-CA');
		reporteHasta = hoy.toLocaleDateString('en-CA');
	}

	function rangoReporteMes() {
		const hoy = new Date();
		reporteDesde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toLocaleDateString('en-CA');
		reporteHasta = hoy.toLocaleDateString('en-CA');
	}

	async function obtenerRegistrosRango() {
		const { data, error } = await supabase
			.from('registros')
			.select(`id, fecha, hora_entrada_real, perfil:perfil_id ( email, horario_entrada, empresa:empresa_id ( nombre ) )`)
			.gte('fecha', reporteDesde)
			.lte('fecha', reporteHasta)
			.order('fecha')
			.order('hora_entrada_real');

		if (error) { errorMsg = 'Error al generar el reporte: ' + error.message; return null; }
		return data ?? [];
	}

	async function exportarReporteExcel() {
		generandoReporte = true;
		errorMsg = '';
		const data = await obtenerRegistrosRango();
		generandoReporte = false;
		if (!data) return;
		if (data.length === 0) { errorMsg = 'No hay registros en ese rango de fechas.'; return; }

		const filas = data.map(r => ({
			Fecha: r.fecha,
			Alumno: r.perfil?.email ?? '—',
			Empresa: r.perfil?.empresa?.nombre ?? '—',
			'Horario asignado': fmtHora(r.perfil?.horario_entrada),
			'Entrada real': fmtHora(r.hora_entrada_real),
			Estado: fmtDiferencia(r.hora_entrada_real, r.perfil?.horario_entrada)?.texto ?? 'En Escuela'
		}));
		const ws = XLSX.utils.json_to_sheet(filas);
		ws['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 18 }];
		const wb = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(wb, ws, 'Registros');
		XLSX.writeFile(wb, `Registros_PP_${reporteDesde}_a_${reporteHasta}.xlsx`);
		showSuccess(`✓ ${data.length} registro(s) exportado(s)`);
	}

	async function exportarReportePDF() {
		generandoReporte = true;
		errorMsg = '';
		const data = await obtenerRegistrosRango();
		generandoReporte = false;
		if (!data) return;
		if (data.length === 0) { errorMsg = 'No hay registros en ese rango de fechas.'; return; }

		const doc = new jsPDF();
		doc.setFontSize(14);
		doc.text('Registro de Pasantías (PP) — Reporte', 14, 15);
		doc.setFontSize(9);
		doc.setTextColor(120);
		doc.text(`Escuela Philips — Del ${reporteDesde} al ${reporteHasta}`, 14, 21);

		autoTable(doc, {
			startY: 26,
			head: [['Fecha', 'Alumno', 'Empresa', 'Asignado', 'Entrada real', 'Estado']],
			body: data.map(r => [
				r.fecha,
				r.perfil?.email ?? '—',
				r.perfil?.empresa?.nombre ?? '—',
				fmtHora(r.perfil?.horario_entrada),
				fmtHora(r.hora_entrada_real),
				fmtDiferencia(r.hora_entrada_real, r.perfil?.horario_entrada)?.texto ?? 'En Escuela'
			]),
			headStyles: { fillColor: [11, 94, 170] },
			styles: { fontSize: 8 }
		});

		doc.save(`Registros_PP_${reporteDesde}_a_${reporteHasta}.pdf`);
		showSuccess(`✓ ${data.length} registro(s) exportado(s)`);
	}

	function exportarExcel() {
		const filas = alumnos.map(a => ({
			Email: a.email,
			Empresa: a.empresa?.nombre ?? 'Sin asignar',
			'Horario de entrada': fmtHora(a.horario_entrada),
			Lunes: a.dias.includes('L') ? 'Sí' : '',
			Martes: a.dias.includes('M') ? 'Sí' : '',
			Miércoles: a.dias.includes('X') ? 'Sí' : '',
			Jueves: a.dias.includes('J') ? 'Sí' : '',
			Viernes: a.dias.includes('V') ? 'Sí' : ''
		}));
		const ws = XLSX.utils.json_to_sheet(filas);
		ws['!cols'] = [{ wch: 28 }, { wch: 20 }, { wch: 16 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 8 }];
		const wb = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(wb, ws, 'PP');
		XLSX.writeFile(wb, `Planilla_PP_${selectedDate}.xlsx`);
	}

	function exportarPDF() {
		const doc = new jsPDF();
		doc.setFontSize(14);
		doc.text('Planilla de Pasantías (PP) — Resumen', 14, 15);
		doc.setFontSize(9);
		doc.setTextColor(120);
		doc.text(`Escuela Philips — Generado el ${new Date().toLocaleDateString('es-AR')}`, 14, 21);

		autoTable(doc, {
			startY: 26,
			head: [['Email', 'Empresa', 'Horario entrada', 'L', 'M', 'X', 'J', 'V']],
			body: alumnos.map(a => [
				a.email,
				a.empresa?.nombre ?? 'Sin asignar',
				fmtHora(a.horario_entrada),
				a.dias.includes('L') ? '✓' : '',
				a.dias.includes('M') ? '✓' : '',
				a.dias.includes('X') ? '✓' : '',
				a.dias.includes('J') ? '✓' : '',
				a.dias.includes('V') ? '✓' : ''
			]),
			headStyles: { fillColor: [11, 94, 170] },
			styles: { fontSize: 9 },
			columnStyles: { 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'center' }, 7: { halign: 'center' } }
		});

		doc.save(`Planilla_PP_${selectedDate}.pdf`);
	}

	async function cargarRegistros() {
		loadingRegistros = true;
		errorMsg = '';
		const { data, error } = await supabase
			.from('registros')
			.select(`id, fecha, hora_entrada_real, perfil:perfil_id ( email, horario_entrada, empresa:empresa_id ( nombre ) )`)
			.eq('fecha', selectedDate)
			.order('hora_entrada_real');
		
		if (error) {
			console.error(error);
			errorMsg = 'Error al cargar registros: ' + error.message;
			registros = [];
		} else {
			registros = data ?? [];
		}
		loadingRegistros = false;
	}

	async function guardarAlumno(alumno) {
		saving = alumno.id;
		errorMsg = '';

		const { error: pe } = await supabase
			.from('perfiles')
			.update({ empresa_id: alumno.empresa_id || null, horario_entrada: alumno.horario_entrada || null })
			.eq('id', alumno.id);
		if (pe) { errorMsg = 'Error guardando: ' + pe.message; saving = null; return; }

		await supabase.from('dias_habilitados').delete().eq('perfil_id', alumno.id);
		if (alumno.dias.length > 0) {
			const rows = alumno.dias.map(d => ({ perfil_id: alumno.id, dia: d }));
			const { error: de } = await supabase.from('dias_habilitados').insert(rows);
			if (de) { errorMsg = 'Error guardando días: ' + de.message; saving = null; return; }
		}
		saving = null;
		showSuccess('✓ Alumno guardado correctamente');
	}

	function toggleDia(alumno, dia) {
		if (alumno.dias.includes(dia)) {
			alumno.dias = alumno.dias.filter(d => d !== dia);
		} else {
			alumno.dias = [...alumno.dias, dia];
		}
	}

	function togglePrecargaDia(dia) {
		if (precargaDias.includes(dia)) {
			precargaDias = precargaDias.filter(d => d !== dia);
		} else {
			precargaDias = [...precargaDias, dia];
		}
	}

	async function agregarEmpresa() {
		if (!nuevaEmpresa.trim()) return;
		addingEmpresa = true;

		const { error } = await supabase.from('empresas').insert({ nombre: nuevaEmpresa.trim() });
		if (error) { errorMsg = 'Error al agregar empresa: ' + error.message; }
		else { nuevaEmpresa = ''; await cargarEmpresas(); showSuccess('✓ Empresa agregada'); }
		addingEmpresa = false;
	}

	async function eliminarEmpresa(emp) {
		// Verificar si tiene alumnos asignados
		const { count } = await supabase
			.from('perfiles')
			.select('id', { count: 'exact', head: true })
			.eq('empresa_id', emp.id);

		if (count > 0) {
			confirmDelete = {
				tipo: 'empresa',
				id: emp.id,
				nombre: emp.nombre,
				advertencia: `Esta empresa tiene ${count} alumno(s) asignado(s). Al eliminarla quedarán sin empresa.`
			};
		} else {
			confirmDelete = { tipo: 'empresa', id: emp.id, nombre: emp.nombre, advertencia: null };
		}
	}

	async function eliminarAlumno(alumno) {
		confirmDelete = {
			tipo: 'alumno',
			id: alumno.id,
			nombre: alumno.email,
			advertencia: 'Se eliminarán sus días habilitados y datos del sistema. No podrá ingresar hasta que el admin lo vuelva a cargar.'
		};
	}

	async function eliminarPrecarga(p) {
		confirmDelete = {
			tipo: 'precarga',
			id: p.id,
			nombre: p.email,
			advertencia: null
		};
	}

	async function confirmarEliminacion() {
		if (!confirmDelete) return;
		errorMsg = '';

		if (confirmDelete.tipo === 'empresa') {
			const { data, error } = await supabase.from('empresas').delete().eq('id', confirmDelete.id).select();
			if (error) { errorMsg = 'Error al eliminar empresa: ' + error.message; }
			else if (!data || data.length === 0) { errorMsg = 'Fallo de permisos (RLS). No tienes permiso para eliminar empresas.'; }
			else { await cargarEmpresas(); await cargarAlumnos(); showSuccess('✓ Empresa eliminada'); }
		}

		if (confirmDelete.tipo === 'alumno') {
			// En lugar de borrar el perfil (que rompería Comedor), solo limpiamos los datos de PP
			await supabase.from('dias_habilitados').delete().eq('perfil_id', confirmDelete.id);
			const { data, error } = await supabase
				.from('perfiles')
				.update({ empresa_id: null, horario_entrada: null })
				.eq('id', confirmDelete.id)
				.select();
				
			if (error) { errorMsg = 'Error al quitar de pasantías: ' + error.message; }
			else { await cargarAlumnos(); showSuccess('✓ Alumno quitado de pasantías'); }
		}

		if (confirmDelete.tipo === 'precarga') {
			const { data, error } = await supabase.from('alumnos_precargados').delete().eq('id', confirmDelete.id).select();
			if (error) { errorMsg = 'Error al eliminar precarga: ' + error.message; }
			else if (!data || data.length === 0) { errorMsg = 'Fallo de permisos (RLS). No puedes borrar esta precarga.'; }
			else { await cargarPrecargados(); showSuccess('✓ Precarga eliminada'); }
		}

		if (!errorMsg) confirmDelete = null;
	}

	async function agregarPrecarga() {
		if (!precargaEmail.trim()) { errorMsg = 'Ingresá un email válido.'; return; }
		addingPrecarga = true;
		const email = precargaEmail.trim().toLowerCase();
		
		// Verificar si ya está en precarga
		const { data: yaPrecargado } = await supabase
			.from('alumnos_precargados').select('id').eq('email', email).maybeSingle();
		if (yaPrecargado) {
			errorMsg = 'Este email ya está en la lista de espera (precarga).';
			addingPrecarga = false;
			return;
		}
		
		// Verificar si ya tiene datos de PP en su perfil
		const { data: perfilExistente } = await supabase
			.from('perfiles')
			.select(`id, empresa_id, horario_entrada, dias_habilitados ( dia )`)
			.eq('email', email)
			.maybeSingle();

		if (perfilExistente) {
			const tieneDatos = perfilExistente.empresa_id || perfilExistente.horario_entrada || (perfilExistente.dias_habilitados?.length > 0);
			if (tieneDatos) {
				errorMsg = 'Este alumno ya está activo en Pasantías. Buscalo en la tabla de Alumnos Registrados.';
				addingPrecarga = false;
				return;
			}
		}

		const { data: precarga, error: pe } = await supabase
			.from('alumnos_precargados')
			.insert({
				email,
				empresa_id: precargaEmpresaId || null,
				horario_entrada: precargaHorario || null
			})
			.select()
			.single();

		if (pe) { errorMsg = 'Error al precargar: ' + pe.message; addingPrecarga = false; return; }

		if (precargaDias.length > 0) {
			const rows = precargaDias.map(d => ({ precargado_id: precarga.id, dia: d }));
			await supabase.from('alumnos_precargados_dias').insert(rows);
		}

		// Resetear formulario
		precargaEmail = '';
		precargaEmpresaId = '';
		precargaHorario = '';
		precargaDias = [];

		await cargarPrecargados();
		showSuccess('✓ Email precargado correctamente');
		addingPrecarga = false;
	}
</script>

<svelte:head>
	<title>Panel Admin — Pasantías Philips</title>
</svelte:head>

{#if loading}
	<div class="row justify-content-center mt-5">
		<div class="col-auto text-center">
			<div class="spinner-border text-primary mb-3" role="status"></div>
			<p class="text-muted small">Cargando...</p>
		</div>
	</div>
{:else}

<div class="row align-items-center mb-4">
	<div class="col-md-6">
		<h2 class="fw-bold philips-text mb-1">Panel Administrador</h2>
		<p class="text-muted small mb-0">{isAdmin ? 'Gestión de alumnos en pasantía' : 'Generación de acceso a pasantías'}</p>
	</div>
	<div class="col-md-6 text-md-end mt-3 mt-md-0">
		<div class="d-flex flex-column align-items-md-end gap-2">
			<button class="btn btn-primary fw-bold px-4 shadow-sm" data-bs-toggle="modal" data-bs-target="#qrModal" onclick={createNewQR}>
				<i class="bi bi-qr-code me-2"></i>GENERAR QR DE FIRMA
			</button>
			{#if qrDataURL}
				<div class="card glass-card p-2 text-center" style="max-width: 200px;">
					<img src={qrDataURL} alt="QR" class="img-fluid mx-auto mb-1" style="max-width: 100px;" />
					<button class="btn btn-dark btn-sm py-0 fw-bold" style="font-size: 0.7rem;" onclick={toggleFullScreen}>⛶ PANTALLA COMPLETA</button>
					<div class="text-danger fw-bold mt-1" style="font-size: 0.7rem;">{timeLeft}s</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Modal QR -->
<div class="modal fade" id="qrModal" tabindex="-1" aria-hidden="true">
	<div class="modal-dialog modal-dialog-centered">
		<div class="modal-content glass-card border-0">
			<div class="modal-header border-0 pb-0">
				<h5 class="modal-title fw-bold philips-text w-100 text-center">QR DE FIRMA</h5>
				<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
			</div>
			<div class="modal-body text-center py-4">
				<p class="text-muted small mb-3">Muestra este código a los alumnos para que validen su ingreso.</p>
				{#if qrDataURL}
					<img src={qrDataURL} alt="QR de Acceso" class="img-fluid shadow-sm border rounded mb-3" style="max-width: 250px;" />
				{:else}
					<div class="p-5 text-muted small">Generando código...</div>
				{/if}
				<div class="bg-light p-2 rounded fw-bold text-danger mb-3">
					Expira en: {timeLeft} segundos
				</div>
                <div class="d-flex justify-content-center gap-2 mt-3">
                    <button class="btn btn-outline-primary btn-sm" onclick={createNewQR}>Forzar nuevo código</button>
                    <button class="btn btn-dark btn-sm" onclick={toggleFullScreen}>⛶ Pantalla Completa</button>
                </div>
			</div>
		</div>
	</div>
</div>

<!-- Modal Confirmación Eliminación -->
{#if confirmDelete}
<div class="modal fade show d-block" tabindex="-1" style="background:rgba(0,0,0,.5);">
	<div class="modal-dialog modal-dialog-centered">
		<div class="modal-content border-0 shadow-lg">
			<div class="modal-header border-0 pb-0">
				<h5 class="modal-title fw-bold text-danger">Confirmar eliminación</h5>
			</div>
			<div class="modal-body">
				<p>¿Eliminás <strong>{confirmDelete.nombre}</strong>?</p>
				{#if confirmDelete.advertencia}
					<div class="alert alert-warning border-0 small">{confirmDelete.advertencia}</div>
				{/if}
			</div>
			<div class="modal-footer border-0 pt-0">
				<button class="btn btn-outline-secondary btn-sm" onclick={() => confirmDelete = null}>Cancelar</button>
				<button class="btn btn-danger btn-sm fw-bold" onclick={confirmarEliminacion}>Sí, eliminar</button>
			</div>
		</div>
	</div>
</div>
{/if}

{#if errorMsg}
	<div class="alert alert-danger border-0 rounded-3 mb-4">{errorMsg}</div>
{/if}
{#if successMsg}
	<div class="alert alert-success border-0 rounded-3 mb-4">{successMsg}</div>
{/if}

<!-- ── SECCIÓN ADMIN ── -->
{#if isAdmin}

<!-- Empresas -->
<div class="card glass-card mb-4 p-4">
	<h5 class="fw-bold mb-3">Empresas</h5>
	<div class="d-flex flex-wrap gap-2 mb-3">
		{#each empresas as emp (emp.id)}
			<span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-3 py-2 d-flex align-items-center gap-2">
				{emp.nombre}
				<button
					class="btn-close btn-close-sm ms-1"
					style="font-size:.6rem; filter:invert(28%) sepia(90%) saturate(800%) hue-rotate(200deg);"
					title="Eliminar empresa"
					onclick={() => eliminarEmpresa(emp)}
					aria-label="Eliminar {emp.nombre}"
				></button>
			</span>
		{/each}
		{#if empresas.length === 0}
			<span class="text-muted small fst-italic">Sin empresas cargadas.</span>
		{/if}
	</div>
	<div class="input-group" style="max-width: 380px;">
		<input
			id="input-nueva-empresa"
			type="text"
			class="form-control"
			placeholder="Nueva empresa..."
			bind:value={nuevaEmpresa}
			onkeydown={(e) => e.key === 'Enter' && agregarEmpresa()}
		/>
		<button class="btn btn-primary" onclick={agregarEmpresa} disabled={addingEmpresa}>
			{#if addingEmpresa}<span class="spinner-border spinner-border-sm"></span>{:else}Agregar{/if}
		</button>
	</div>
</div>

<!-- Gestión de Roles -->
<div class="card glass-card mb-4 overflow-hidden">
	<div class="p-4 border-bottom">
		<h5 class="fw-bold mb-0">Gestión de Roles</h5>
		<p class="text-muted small mb-0">Asigná el rol de administrador (u otro) a cualquier usuario registrado.</p>
	</div>

	<div class="p-4 border-bottom bg-light bg-opacity-50">
		<input
			type="text"
			class="form-control form-control-sm"
			style="max-width: 320px;"
			placeholder="Buscar por email..."
			bind:value={usuarioFiltro}
		/>
	</div>

	{#if usuarios.length === 0}
		<div class="p-4 text-center text-muted small fst-italic">No hay usuarios registrados.</div>
	{:else}
		{@const usuariosFiltrados = usuarios.filter(u => u.email.toLowerCase().includes(usuarioFiltro.toLowerCase()))}
		{#if usuariosFiltrados.length === 0}
			<div class="p-4 text-center text-muted small fst-italic">Sin resultados para "{usuarioFiltro}".</div>
		{:else}
			<div class="table-responsive" style="max-height: 360px; overflow-y: auto;">
				<table class="table table-hover mb-0 align-middle">
					<thead class="table-light text-muted small text-uppercase sticky-top">
						<tr>
							<th class="ps-4">Email</th>
							<th>Rol</th>
							<th class="pe-4">Cambiar rol</th>
						</tr>
					</thead>
					<tbody>
						{#each usuariosFiltrados as usuario (usuario.id)}
							<tr>
								<td class="ps-4">
									<span class="fw-medium text-dark small">{usuario.email}</span>
									{#if usuario.id === session.user.id}
										<span class="badge bg-light text-muted border ms-2" style="font-size:.68rem;">Vos</span>
									{/if}
								</td>
								<td>
									<span class="badge {usuario.rol === 'admin' ? 'bg-danger-subtle text-danger border-danger-subtle' : usuario.rol === 'preceptor' ? 'bg-info-subtle text-info-emphasis border-info-subtle' : 'bg-light text-dark border'} border">
										{ROL_NOMBRE[usuario.rol] ?? usuario.rol}
									</span>
								</td>
								<td class="pe-4">
									<div class="d-flex align-items-center gap-2">
										<select
											class="form-select form-select-sm"
											style="max-width: 160px;"
											value={usuario.rol}
											disabled={usuario.id === session.user.id || savingRol.has(usuario.id)}
											onchange={(e) => actualizarRol(usuario, e.target.value)}
										>
											{#each ROLES as r}
												<option value={r}>{ROL_NOMBRE[r]}</option>
											{/each}
										</select>
										{#if savingRol.has(usuario.id)}
											<span class="spinner-border spinner-border-sm text-primary"></span>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}

	<!-- Precarga de rol para emails que aún no iniciaron sesión -->
	<div class="p-4 border-top bg-light bg-opacity-50">
		<p class="fw-semibold mb-1">Precargar rol para un email nuevo</p>
		<p class="text-muted small mb-3">Si el usuario todavía no inició sesión nunca, precargá acá su rol (preceptor o admin). Se le aplica automáticamente la primera vez que entre con Google.</p>
		<div class="row g-3 align-items-end">
			<div class="col-md-5">
				<label class="form-label small fw-semibold text-muted text-uppercase" style="font-size:.75rem;">Email de Google</label>
				<input
					type="email"
					class="form-control form-control-sm"
					placeholder="preceptor@philips.edu.ar"
					bind:value={precargaRolEmail}
					onkeydown={(e) => e.key === 'Enter' && agregarPrecargaRol()}
				/>
			</div>
			<div class="col-md-3">
				<label class="form-label small fw-semibold text-muted text-uppercase" style="font-size:.75rem;">Rol</label>
				<select class="form-select form-select-sm" bind:value={precargaRolValor}>
					<option value="preceptor">Preceptor</option>
					<option value="admin">Admin</option>
				</select>
			</div>
			<div class="col-md-2">
				<button class="btn btn-success btn-sm w-100 fw-semibold" onclick={agregarPrecargaRol} disabled={addingPrecargaRol}>
					{#if addingPrecargaRol}<span class="spinner-border spinner-border-sm"></span>{:else}+ Agregar{/if}
				</button>
			</div>
		</div>

		{#if rolesPrecargados.length > 0}
			<div class="d-flex flex-wrap gap-2 mt-3">
				{#each rolesPrecargados as p (p.id)}
					<span class="badge bg-white text-dark border rounded-pill px-3 py-2 d-flex align-items-center gap-2">
						{p.email} → {ROL_NOMBRE[p.rol] ?? p.rol}
						<button
							class="btn-close btn-close-sm ms-1"
							style="font-size:.6rem;"
							title="Eliminar precarga"
							onclick={() => eliminarPrecargaRol(p)}
							aria-label="Eliminar precarga de {p.email}"
						></button>
					</span>
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Precarga de Alumnos -->
<div class="card glass-card mb-4 overflow-hidden">
	<div class="p-4 border-bottom">
		<h5 class="fw-bold mb-0">Precarga de Alumnos</h5>
		<p class="text-muted small mb-0">Cargá el email de Google de un alumno antes de que inicie sesión. Al hacer login, verá todo configurado.</p>
	</div>

	<!-- Formulario de precarga -->
	<div class="p-4 border-bottom bg-light bg-opacity-50">
		<div class="row g-3 align-items-end">
			<div class="col-md-4">
				<label class="form-label small fw-semibold text-muted text-uppercase" style="font-size:.75rem;">Email de Google</label>
				<input
					id="input-precarga-email"
					type="email"
					class="form-control form-control-sm"
					placeholder="alumno@gmail.com"
					bind:value={precargaEmail}
				/>
			</div>
			<div class="col-md-3">
				<label for="precargaEmpresaId" class="form-label small fw-semibold text-muted text-uppercase" style="font-size:.75rem;">Empresa</label>
				<select id="precargaEmpresaId" class="form-select form-select-sm" bind:value={precargaEmpresaId}>
					<option value="">Sin asignar</option>
					{#each empresas as emp}
						<option value={emp.id}>{emp.nombre}</option>
					{/each}
				</select>
			</div>
			<div class="col-md-2">
				<label for="precargaHorario" class="form-label small fw-semibold text-muted text-uppercase" style="font-size:.75rem;">Horario entrada</label>
				<input id="precargaHorario" type="time" class="form-control form-control-sm" bind:value={precargaHorario} />
			</div>
			<div class="col-md-2">
				<label class="form-label small fw-semibold text-muted text-uppercase d-block" style="font-size:.75rem;">Días</label>
				<div class="d-flex gap-1">
					{#each TODOS_DIAS as dia}
						<button
							class="btn btn-sm px-2 py-1 rounded-2 fw-semibold {precargaDias.includes(dia) ? 'btn-primary' : 'btn-outline-secondary'}"
							onclick={() => togglePrecargaDia(dia)}
							title={DIAS_NOMBRE[dia]}
							style="min-width:30px; font-size:.78rem;"
						>{dia}</button>
					{/each}
				</div>
			</div>
			<div class="col-md-1 d-flex align-items-end">
				<button class="btn btn-success btn-sm w-100 fw-semibold" onclick={agregarPrecarga} disabled={addingPrecarga}>
					{#if addingPrecarga}<span class="spinner-border spinner-border-sm"></span>{:else}+ Agregar{/if}
				</button>
			</div>
		</div>
	</div>

	<!-- Lista de precargados -->
	{#if precargados.length === 0}
		<div class="p-4 text-center text-muted small fst-italic">No hay emails precargados.</div>
	{:else}
		<div class="table-responsive">
			<table class="table table-hover mb-0 align-middle">
				<thead class="table-light text-muted small text-uppercase">
					<tr>
						<th class="ps-4">Email</th>
						<th>Empresa</th>
						<th>Horario</th>
						<th>Días</th>
						<th class="pe-4">Acción</th>
					</tr>
				</thead>
				<tbody>
					{#each precargados as p (p.id)}
						<tr>
							<td class="ps-4">
								<span class="fw-medium text-dark small">{p.email}</span>
								<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle ms-2" style="font-size:.7rem;">En espera</span>
							</td>
							<td class="small text-muted">{p.empresa_nombre}</td>
							<td><span class="badge bg-light text-dark border">{fmtHora(p.horario_entrada)}</span></td>
							<td>
								<div class="d-flex gap-1">
									{#each TODOS_DIAS as dia}
										<span class="badge rounded-pill px-2 {p.dias.includes(dia) ? 'bg-primary' : 'bg-light text-muted border'}" style="font-size:.75rem;">{dia}</span>
									{/each}
								</div>
							</td>
							<td class="pe-4">
								<button class="btn btn-sm btn-outline-danger px-2" onclick={() => eliminarPrecarga(p)} title="Eliminar precarga">🗑</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<!-- Alumnos registrados -->
<div class="card glass-card mb-4 overflow-hidden">
	<div class="p-4 border-bottom d-flex align-items-center justify-content-between flex-wrap gap-2">
		<div>
			<h5 class="fw-bold mb-0">Alumnos Registrados</h5>
			<p class="text-muted small mb-0">Alumnos que ya iniciaron sesión. Asigná empresa, horario y días.</p>
		</div>
		{#if alumnos.length > 0}
			<div class="d-flex gap-2">
				<button class="btn btn-outline-success btn-sm fw-semibold" onclick={exportarExcel} title="Exportar planilla en Excel">
					<i class="bi bi-file-earmark-excel me-1"></i>Excel
				</button>
				<button class="btn btn-outline-danger btn-sm fw-semibold" onclick={exportarPDF} title="Exportar planilla en PDF">
					<i class="bi bi-file-earmark-pdf me-1"></i>PDF
				</button>
			</div>
		{/if}
	</div>

	{#if alumnos.length === 0}
		<div class="p-5 text-center text-muted">No hay alumnos registrados aún.</div>
	{:else}
		<div class="table-responsive">
			<table class="table table-hover mb-0 align-middle">
				<thead class="table-light text-muted small text-uppercase">
					<tr>
						<th class="ps-4">Email</th>
						<th>Empresa</th>
						<th>Horario entrada</th>
						<th>Días habilitados</th>
						<th class="pe-4">Acciones</th>
					</tr>
				</thead>
				<tbody>
					{#each alumnos as alumno (alumno.id)}
						<tr>
							<td class="ps-4">
								<span class="fw-medium text-dark small">{alumno.email}</span>
							</td>
							<td>
								<select class="form-select form-select-sm" style="min-width:190px;" bind:value={alumno.empresa_id}>
									<option value="">Sin asignar</option>
									{#each empresas as emp}
										<option value={emp.id}>{emp.nombre}</option>
									{/each}
								</select>
							</td>
							<td>
								<input type="time" class="form-control form-control-sm" style="min-width:110px;" bind:value={alumno.horario_entrada} />
							</td>
							<td>
								<div class="d-flex gap-1 flex-wrap">
									{#each TODOS_DIAS as dia}
										<button
											class="btn btn-sm px-2 py-1 rounded-2 fw-semibold {alumno.dias.includes(dia) ? 'btn-primary' : 'btn-outline-secondary'}"
											onclick={() => toggleDia(alumno, dia)}
											title={DIAS_NOMBRE[dia]}
											style="min-width:30px; font-size:.78rem;"
										>{dia}</button>
									{/each}
								</div>
							</td>
							<td class="pe-4">
								<div class="d-flex gap-2">
									<button
										class="btn btn-sm btn-success fw-semibold px-3"
										onclick={() => guardarAlumno(alumno)}
										disabled={saving === alumno.id}
									>
										{#if saving === alumno.id}
											<span class="spinner-border spinner-border-sm"></span>
										{:else}
											Guardar
										{/if}
									</button>
									<button
										class="btn btn-sm btn-outline-danger px-2"
										onclick={() => eliminarAlumno(alumno)}
										title="Eliminar alumno"
									>🗑</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
{/if}

<!-- Reporte de Registros por rango de fechas -->
<div class="card glass-card mb-4 overflow-hidden">
	<div class="p-4 border-bottom">
		<h5 class="fw-bold mb-0">Descargar Reporte de Registros</h5>
		<p class="text-muted small mb-0">Elegí un rango de fechas y descargá el registro de ingresos (quién entró, qué día y a qué hora) en Excel o PDF.</p>
	</div>
	<div class="p-4">
		<div class="d-flex flex-wrap gap-2 mb-3">
			<button class="btn btn-outline-secondary btn-sm fw-semibold" onclick={rangoReporteHoy}>Hoy</button>
			<button class="btn btn-outline-secondary btn-sm fw-semibold" onclick={rangoReporteSemana}>Esta semana</button>
			<button class="btn btn-outline-secondary btn-sm fw-semibold" onclick={rangoReporteMes}>Este mes</button>
		</div>
		<div class="row g-3 align-items-end mb-3">
			<div class="col-auto">
				<label class="form-label small fw-semibold text-muted text-uppercase" style="font-size:.75rem;">Desde</label>
				<input type="date" class="form-control form-control-sm" bind:value={reporteDesde} />
			</div>
			<div class="col-auto">
				<label class="form-label small fw-semibold text-muted text-uppercase" style="font-size:.75rem;">Hasta</label>
				<input type="date" class="form-control form-control-sm" bind:value={reporteHasta} />
			</div>
		</div>
		<div class="d-flex gap-2">
			<button class="btn btn-outline-success btn-sm fw-semibold" onclick={exportarReporteExcel} disabled={generandoReporte}>
				{#if generandoReporte}<span class="spinner-border spinner-border-sm me-1"></span>{:else}<i class="bi bi-file-earmark-excel me-1"></i>{/if}Excel
			</button>
			<button class="btn btn-outline-danger btn-sm fw-semibold" onclick={exportarReportePDF} disabled={generandoReporte}>
				{#if generandoReporte}<span class="spinner-border spinner-border-sm me-1"></span>{:else}<i class="bi bi-file-earmark-pdf me-1"></i>{/if}PDF
			</button>
		</div>
	</div>
</div>

<!-- Registros del día -->
<div class="card glass-card overflow-hidden">
	<div class="p-4 border-bottom d-flex align-items-center gap-3 flex-wrap">
		<div class="flex-grow-1">
			<h5 class="fw-bold mb-0">Registros de Entrada</h5>
			<p class="text-muted small mb-0">Entradas registradas por los alumnos</p>
		</div>
		<div class="input-group input-group-sm shadow-sm" style="max-width:210px;">
			<span class="input-group-text bg-white border-end-0">Fecha:</span>
			<input
				type="date"
				class="form-control border-start-0"
				bind:value={selectedDate}
				onchange={() => cargarRegistros()}
			/>
		</div>
	</div>

	{#if loadingRegistros}
		<div class="p-4 text-center"><div class="spinner-border spinner-border-sm text-primary"></div></div>
	{:else if registros.length === 0}
		<div class="p-5 text-center text-muted">No hay registros para esta fecha.</div>
	{:else}
		<div class="table-responsive">
			<table class="table table-hover mb-0 align-middle">
				<thead class="table-light text-muted small text-uppercase">
					<tr>
						<th class="ps-4">Alumno</th>
						<th>Empresa</th>
						<th>Asignado</th>
						<th>Entrada Real</th>
						<th class="pe-4">Estado</th>
					</tr>
				</thead>
				<tbody>
					{#each registros as reg (reg.id)}
						{@const diff = fmtDiferencia(reg.hora_entrada_real, reg.perfil?.horario_entrada)}
						<tr>
							<td class="ps-4 fw-medium text-primary small">{reg.perfil?.email ?? '—'}</td>
							<td class="small text-muted">{reg.perfil?.empresa?.nombre ?? '—'}</td>
							<td><span class="badge bg-light text-muted border-0 fw-normal">{fmtHora(reg.perfil?.horario_entrada)}</span></td>
							<td><span class="badge bg-light text-dark border">{fmtHora(reg.hora_entrada_real)}</span></td>
							<td class="pe-4">
								{#if diff}
									<span class="badge rounded-pill border px-3 {diff.clase}">{diff.texto}</span>
								{:else}
									<span class="badge rounded-pill bg-light text-muted border px-3">Presente</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<!-- FULLSCREEN VIEW -->
<div id="fullscreen-qr-view" class="bg-white flex-column justify-content-center align-items-center text-center" style="display: {isFullScreen ? 'flex' : 'none'} !important; width: 100vw; height: 100vh;">
	{#if isFullScreen}
		<h1 class="fw-bold philips-text mb-4" style="font-size: 4vw;">QR DE FIRMA</h1>
		<p class="text-muted fs-4 mb-4">Escaneá este código para registrar tu ingreso a la pasantía.</p>
		<img src={qrDataURL} alt="QR" style="width: 50vw; max-width: 50vh; object-fit: contain;" class="shadow-lg border rounded p-4 mb-4 bg-white" />
		<h2 class="fw-bold text-danger mb-5" style="font-size: 3vw;">Expira en: {timeLeft}s</h2>
		<button class="btn btn-outline-secondary btn-lg" onclick={toggleFullScreen}>Salir de Pantalla Completa</button>
	{/if}
</div>

{/if}
