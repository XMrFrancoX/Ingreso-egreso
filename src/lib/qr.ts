// QR "de firma": el preceptor muestra un QR que cambia cada minuto con la hora en que se
// generó; el alumno lo escanea para demostrar que está frente al preceptor. Cualquier QR de
// la escuela (comedor, PP o recreativo) sirve en cualquier módulo, para simplificarle el
// trabajo al preceptor.
export type AppQr = 'comedor' | 'PP' | 'recreativo';

export const VIGENCIA_QR_MS = 5 * 60 * 1000; // tolera relojes desfasados entre dispositivos
export const RENOVAR_QR_S = 60;

/** Diferencia entre la hora del servidor y la del dispositivo (ms), para no depender del reloj local. */
export async function desfaseConServidor() {
	try {
		const res = await fetch(`${window.location.origin}/?_t=${Date.now()}`, { method: 'HEAD' });
		const fecha = res.headers.get('Date');
		return fecha ? new Date(fecha).getTime() - Date.now() : 0;
	} catch {
		return 0;
	}
}

export function contenidoQr(app: AppQr, desfase: number) {
	return JSON.stringify({ app, timestamp: Date.now() + desfase });
}

export type ResultadoQr = { ok: true } | { ok: false; motivo: string };

export function validarQr(texto: string, desfase: number): ResultadoQr {
	let data: { app?: string; timestamp?: number };
	try {
		data = JSON.parse(texto);
	} catch {
		return { ok: false, motivo: 'Ese código no es un QR de la escuela.' };
	}
	if (!['comedor', 'PP', 'recreativo'].includes(data.app ?? '') || typeof data.timestamp !== 'number') {
		return { ok: false, motivo: 'Ese código no es un QR de la escuela.' };
	}
	if (Math.abs(Date.now() + desfase - data.timestamp) > VIGENCIA_QR_MS) {
		return { ok: false, motivo: 'El QR venció. Pedile al preceptor que muestre uno nuevo.' };
	}
	return { ok: true };
}
