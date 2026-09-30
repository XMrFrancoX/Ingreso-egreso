import { createClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';

// Variables de entorno de Vite (se incrustan al compilar): en local salen de .env.local,
// en Cloudflare Pages de las variables del proyecto (producción y preview por separado).
const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient<Database>(url, anonKey);

export type Tablas = Database['public']['Tables'];
export type Fila<T extends keyof Tablas> = Tablas[T]['Row'];
