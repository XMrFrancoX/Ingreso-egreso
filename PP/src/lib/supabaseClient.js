import { createClient } from '@supabase/supabase-js';

// Placeholders para que la app levante sin credenciales configuradas.
// Reemplazar con los valores reales en .env cuando se conecte Supabase.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    db: { schema: 'pp' }
});
