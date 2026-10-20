import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { toast } from 'svelte-sonner';
import { supabase } from '$lib/supabase';

export type Rol = 'student' | 'preceptor' | 'admin';
export type Seccion = 'comedor' | 'PP' | 'recreativo';
// Doble rol: un preceptor o admin que además es alumno (tiene curso) elige con qué rol usar la
// app desde el menú de su usuario. Se recuerda en este dispositivo.
export type Vista = 'staff' | 'alumno';
const CLAVE_VISTA = 'ingresos-vista';

// Filtro de perfiles para las listas de alumnos: los alumnos y el staff que también es alumno
// (tiene curso), así un admin con pasantía o comedor también aparece para editarlo.
export const FILTRO_ALUMNOS = 'rol.eq.student,curso_id.not.is.null';

function leerVista(): Vista {
	try {
		return localStorage.getItem(CLAVE_VISTA) === 'alumno' ? 'alumno' : 'staff';
	} catch {
		return 'staff';
	}
}

export interface Perfil {
	id: string;
	email: string;
	rol: Rol;
	curso_id: string | null;
	curso: { nombre: string } | null;
}

export const ROL_NOMBRE: Record<Rol, string> = {
	student: 'Alumno',
	preceptor: 'Preceptor',
	admin: 'Administrador'
};

const DOMINIO = '@philips.edu.ar';

// Sesión y perfil de toda la app, en un solo lugar (antes cada pantalla consultaba el perfil
// por su cuenta, con reintentos y auto-reparación repetidos).
class Auth {
	session = $state<Session | null>(null);
	perfil = $state<Perfil | null>(null);
	// Secciones habilitadas para el curso del alumno (el staff ve todas).
	secciones = $state<Set<Seccion>>(new Set());
	cargando = $state(true);
	vista = $state<Vista>(typeof window === 'undefined' ? 'staff' : leerVista());

	#iniciado = false;

	get email() {
		return this.session?.user.email ?? '';
	}
	// Preceptor o admin que también es alumno (tiene curso): puede usar la app como alumno.
	get puedeCambiarVista() {
		return !!this.perfil && this.perfil.rol !== 'student' && !!this.perfil.curso_id;
	}
	// Rol con el que se está usando la app (el real, salvo que haya elegido la vista de alumno).
	// Las pantallas deciden con esto; los permisos de la base siguen siendo los del rol real.
	get rol(): Rol {
		if (!this.perfil) return 'student';
		return this.puedeCambiarVista && this.vista === 'alumno' ? 'student' : this.perfil.rol;
	}
	get esStaff() {
		return this.rol === 'preceptor' || this.rol === 'admin';
	}
	get esAdmin() {
		return this.rol === 'admin';
	}
	puedeVer(seccion: Seccion) {
		return this.esStaff || this.secciones.has(seccion);
	}

	async iniciar() {
		if (this.#iniciado) return;
		this.#iniciado = true;

		const { data } = await supabase.auth.getSession();
		await this.#aplicar(data.session);

		// supabase-js ejecuta este callback con su lock de sesión tomado y cualquier consulta
		// pide ese mismo lock: si el callback la espera, todo queda trabado (deadlock
		// documentado por Supabase). Era la causa de que la app quedara "cargando" al volver
		// de un rato de inactividad, cuando se renueva el token. Por eso el callback no espera
		// nada y el trabajo va aparte.
		supabase.auth.onAuthStateChange((evento, sesion) => {
			setTimeout(() => void this.#alCambiar(evento, sesion), 0);
		});
	}

	async #alCambiar(evento: AuthChangeEvent, sesion: Session | null) {
		// Renovar el token no cambia el perfil: no hace falta volver a pedirlo.
		if (evento === 'TOKEN_REFRESHED' && sesion && this.perfil) {
			this.session = sesion;
			return;
		}
		if (evento === 'INITIAL_SESSION') return; // ya lo resolvió iniciar()
		await this.#aplicar(sesion);
	}

	async #aplicar(sesion: Session | null) {
		if (!sesion) {
			this.session = null;
			this.perfil = null;
			this.secciones = new Set();
			this.cargando = false;
			return;
		}
		if (!sesion.user.email?.toLowerCase().endsWith(DOMINIO)) {
			await supabase.auth.signOut();
			this.session = null;
			this.perfil = null;
			this.cargando = false;
			toast.error(`Sólo se puede entrar con una cuenta ${DOMINIO}`);
			return;
		}
		this.cargando = true;
		this.session = sesion;
		try {
			const perfil = await cargarPerfil(sesion);
			this.perfil = perfil;
			this.secciones = perfil ? await cargarSecciones(perfil, this.rol) : new Set();
		} catch (e) {
			console.error('Error cargando el perfil:', e);
			toast.error('No se pudo cargar tu perfil. Probá recargar la página.');
		} finally {
			this.cargando = false;
		}
	}

	async entrarConGoogle(volverA = '/') {
		const { error } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: window.location.origin + volverA,
				queryParams: { hd: 'philips.edu.ar', prompt: 'select_account' }
			}
		});
		if (error) throw error;
	}

	async salir() {
		await supabase.auth.signOut();
		this.session = null;
		this.perfil = null;
		this.secciones = new Set();
	}

	async cambiarVista(vista: Vista) {
		this.vista = vista;
		try {
			localStorage.setItem(CLAVE_VISTA, vista);
		} catch {
			// Sin almacenamiento (modo privado): vale hasta recargar.
		}
		if (this.perfil) this.secciones = await cargarSecciones(this.perfil, this.rol);
	}

	// Para pantallas que cambian el curso o el rol del propio usuario.
	async recargarPerfil() {
		if (this.session) await this.#aplicar(this.session);
	}
}

async function leerPerfil(id: string) {
	const { data, error } = await supabase
		.from('perfiles')
		.select('id, email, rol, curso_id, curso:curso_id(nombre)')
		.eq('id', id)
		.maybeSingle();
	if (error) throw error;
	return data as Perfil | null;
}

async function cargarPerfil(sesion: Session): Promise<Perfil | null> {
	let perfil = await leerPerfil(sesion.user.id);

	// Auto-reparación: si el trigger handle_new_user no creó el perfil (o un backfill viejo
	// lo salteó), se crea acá. Sin esto el usuario queda sin ninguna sección y sin forma de
	// que el admin le asigne curso. RLS lo permite (perfiles_insert_own).
	if (!perfil) {
		const { error } = await supabase
			.from('perfiles')
			.upsert({ id: sesion.user.id, email: sesion.user.email!, rol: 'student' }, { onConflict: 'id' });
		if (error) throw error;
		perfil = await leerPerfil(sesion.user.id);
		if (!perfil) return null;
	}

	// Precarga de rol: si un admin cargó preceptor/admin para este mail antes de que la cuenta
	// existiera, se aplica ahora (el trigger prevent_non_admin_role_change la consume).
	const { data: precarga } = await supabase
		.from('roles_precargados')
		.select('rol')
		.eq('email', perfil.email)
		.maybeSingle();
	if (precarga && precarga.rol !== perfil.rol) {
		const { data: actualizado, error } = await supabase
			.from('perfiles')
			.update({ rol: precarga.rol })
			.eq('id', perfil.id)
			.select('rol')
			.maybeSingle();
		if (error) console.error('Error aplicando la precarga de rol:', error);
		else if (actualizado) perfil.rol = actualizado.rol as Rol;
	}

	return perfil;
}

async function cargarSecciones(perfil: Perfil, rol: Rol): Promise<Set<Seccion>> {
	if (rol !== 'student') return new Set(['comedor', 'PP', 'recreativo']);
	// Recreativo está siempre disponible para los alumnos, tengan o no curso asignado.
	const secciones = new Set<Seccion>(['recreativo']);
	if (!perfil.curso_id) return secciones;
	const { data, error } = await supabase
		.from('seccion_cursos_permitidos')
		.select('seccion')
		.eq('curso_id', perfil.curso_id);
	if (error) throw error;
	for (const fila of data ?? []) secciones.add(fila.seccion as Seccion);
	return secciones;
}

export const auth = new Auth();
