// Fechas y horas siempre en hora de Argentina, sin depender de la zona del dispositivo.
const TZ = 'America/Argentina/Buenos_Aires';

export type Dia = 'L' | 'M' | 'X' | 'J' | 'V';
export const DIAS: Dia[] = ['L', 'M', 'X', 'J', 'V'];
export const DIA_NOMBRE: Record<Dia, string> = { L: 'Lunes', M: 'Martes', X: 'Miércoles', J: 'Jueves', V: 'Viernes' };
const DIAS_SEMANA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] as const;

/** Días como vienen de la base (en cualquier orden) ordenados de lunes a viernes. */
export function ordenarDias(dias: { dia: string }[] | null | undefined): Dia[] {
	return DIAS.filter((d) => dias?.some((x) => x.dia === d));
}

/** "2026-09-30" (fecha de hoy en Argentina). */
export function hoyISO(fecha = new Date()) {
	return fecha.toLocaleDateString('en-CA', { timeZone: TZ });
}

/** "13:05:42" (hora actual en Argentina), el formato de las columnas `time`. */
export function horaAhora(fecha = new Date()) {
	return fecha.toLocaleTimeString('en-GB', { timeZone: TZ, hour12: false });
}

/** Letra del día de una fecha "AAAA-MM-DD" (L, M, X, J, V, S o D). */
export function diaDe(fechaISO: string) {
	return DIAS_SEMANA[new Date(`${fechaISO}T12:00:00`).getDay()];
}

/** "13:05" a partir de "13:05:42"; "—" si no hay hora. */
export function fmtHora(t: string | null | undefined) {
	return t ? t.slice(0, 5) : '—';
}

/** "mié 30/09" a partir de "2026-09-30". */
export function fmtFecha(fechaISO: string) {
	return new Date(`${fechaISO}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

/** Pasantías: minutos para almorzar de los alumnos con el tilde de almuerzo (igual que en la base). */
export const MINUTOS_ALMUERZO = 30;

/**
 * Pasantías: hora a la que tiene que estar en el aula: su horario de ingreso, más el almuerzo si
 * lo tiene ("12:30" con almuerzo → "13:00"). La tarde se cuenta desde acá.
 */
export function entradaAula(horario: string | null | undefined, almuerzo: boolean | null | undefined) {
	if (!horario) return null;
	if (!almuerzo) return horario.slice(0, 5);
	const [h, m] = horario.split(':').map(Number);
	const total = h * 60 + m + MINUTOS_ALMUERZO;
	return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Minutos de diferencia entre una hora real y la esperada ("HH:MM[:SS]"); positivo = tarde. */
export function minutosDeDiferencia(real: string | null | undefined, esperada: string | null | undefined) {
	if (!real || !esperada) return null;
	const [hr, mr] = real.split(':').map(Number);
	const [he, me] = esperada.split(':').map(Number);
	return hr * 60 + mr - (he * 60 + me);
}

/** "12 min" / "1 h 05 min". */
export function fmtMinutos(min: number) {
	if (min < 60) return `${min} min`;
	return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}
