// Exportar tablas a Excel o PDF. Las librerías se cargan recién al exportar (son pesadas y
// la mayoría de las visitas no las usa).

export async function exportarExcel(archivo: string, hoja: string, filas: Record<string, string | number>[], anchos?: number[]) {
	const XLSX = await import('xlsx');
	const ws = XLSX.utils.json_to_sheet(filas);
	if (anchos) ws['!cols'] = anchos.map((wch) => ({ wch }));
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, hoja);
	XLSX.writeFile(wb, archivo);
}

export async function exportarPdf(opciones: {
	archivo: string;
	titulo: string;
	subtitulo: string;
	columnas: string[];
	filas: (string | number)[][];
	centradas?: number[];
}) {
	const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
	const doc = new jsPDF();
	doc.setFontSize(14);
	doc.text(opciones.titulo, 14, 15);
	doc.setFontSize(9);
	doc.setTextColor(120);
	doc.text(opciones.subtitulo, 14, 21);
	autoTable(doc, {
		startY: 26,
		head: [opciones.columnas],
		body: opciones.filas,
		headStyles: { fillColor: [15, 47, 107] },
		styles: { fontSize: 8 },
		columnStyles: Object.fromEntries((opciones.centradas ?? []).map((i) => [i, { halign: 'center' }]))
	});
	doc.save(opciones.archivo);
}
