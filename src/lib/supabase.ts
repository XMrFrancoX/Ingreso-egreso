import { createClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';

// Base de develop (rama develop del proyecto Ingreso-Egreso en la org "Escuela Philips").
// La clave anon es pública: viaja en la página igual, lo que protege los datos es RLS.
const DEVELOP = {
	url: 'https://vcezthwggekmikquawzr.supabase.co',
	anonKey:
		'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjZXp0aHdnZ2VrbWlrcXVhd3pyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MDUxNjMsImV4cCI6MjEwNjE4MTE2M30.23t8RjIKLv3qnW5jAhU2UFXNyFtmeN3K0N3eQIst1NE'
};

// El preview de la rama develop (develop.ingresos-egresos.pages.dev) usa siempre la base de
// develop, aunque las variables de Preview de Cloudflare no estén cargadas o apunten a
// producción: así nunca se prueba contra los datos reales. El resto (producción y local) sale
// de las variables de entorno de Vite (.env.local en local, variables del proyecto en Cloudflare).
const esPreviewDevelop = typeof location !== 'undefined' && location.hostname.startsWith('develop.');

const url = esPreviewDevelop ? DEVELOP.url : (import.meta.env.VITE_SUPABASE_URL ?? '');
const anonKey = esPreviewDevelop ? DEVELOP.anonKey : (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '');

export const supabase = createClient<Database>(url, anonKey);

export type Tablas = Database['public']['Tables'];
export type Fila<T extends keyof Tablas> = Tablas[T]['Row'];
