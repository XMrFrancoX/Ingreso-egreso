-- ==============================================================================
-- ESCUELA PHILIPS - SISTEMA DE INGRESO/EGRESO Y PASANTÍAS
-- Esquema Unificado de Base de Datos (Supabase)
-- ==============================================================================

-- 1. EXTENSIONES Y FUNCIONES BASE
create extension if not exists "uuid-ossp";

-- 2. TABLAS

-- Empresas (Para Pasantías)
create table if not exists public.empresas (
    id uuid default uuid_generate_v4() primary key,
    nombre text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Perfiles de usuario (Compartido entre Comedor y Pasantías)
create table if not exists public.perfiles (
    id uuid references auth.users on delete cascade primary key,
    email text not null,
    rol text default 'student'::text, -- 'student', 'preceptor', 'admin'
    
    -- Campos específicos de Pasantías (PP)
    empresa_id uuid references public.empresas(id) on delete set null,
    horario_entrada time without time zone,
    
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Días habilitados para pasantías (Para PP)
create table if not exists public.dias_habilitados (
    id uuid default uuid_generate_v4() primary key,
    perfil_id uuid references public.perfiles(id) on delete cascade not null,
    dia text not null check (dia in ('L', 'M', 'X', 'J', 'V')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(perfil_id, dia)
);

-- Registros de entrada de pasantías (Para PP)
create table if not exists public.registros (
    id uuid default uuid_generate_v4() primary key,
    perfil_id uuid references public.perfiles(id) on delete cascade not null,
    fecha date not null,
    hora_entrada_real time without time zone not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(perfil_id, fecha)
);

-- Movimientos de salida al mediodía (Para Comedor)
create table if not exists public.movimientos (
    id uuid default uuid_generate_v4() primary key,
    perfil_id uuid references public.perfiles(id) on delete cascade not null,
    fecha date not null,
    hora_salida time without time zone not null,
    firma_salida text not null,
    hora_ingreso time without time zone,
    firma_ingreso text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. SEGURIDAD (Row Level Security - RLS)

alter table public.empresas enable row level security;
alter table public.perfiles enable row level security;
alter table public.dias_habilitados enable row level security;
alter table public.registros enable row level security;
alter table public.movimientos enable row level security;

-- Políticas para Empresas
create policy "Todos pueden ver empresas" on public.empresas for select using (true);
create policy "Admins pueden modificar empresas" on public.empresas for all using (
    exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin')
);

-- Políticas para Perfiles
create policy "Usuarios pueden ver perfiles" on public.perfiles for select using (true);
create policy "Admins y Preceptores pueden actualizar perfiles" on public.perfiles for update using (
    exists (select 1 from public.perfiles where id = auth.uid() and rol in ('admin', 'preceptor'))
);

-- Políticas para Días Habilitados
create policy "Usuarios pueden ver sus días" on public.dias_habilitados for select using (true);
create policy "Admins pueden modificar días" on public.dias_habilitados for all using (
    exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin')
);

-- Políticas para Registros (PP)
create policy "Usuarios ven sus propios registros" on public.registros for select using (
    auth.uid() = perfil_id or exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin')
);
create policy "Alumnos pueden insertar su registro" on public.registros for insert with check (
    auth.uid() = perfil_id
);

-- Políticas para Movimientos (Comedor)
create policy "Todos pueden ver movimientos" on public.movimientos for select using (true);
create policy "Alumnos pueden insertar su salida" on public.movimientos for insert with check (
    auth.uid() = perfil_id
);
create policy "Alumnos pueden actualizar su ingreso" on public.movimientos for update using (
    auth.uid() = perfil_id or exists (select 1 from public.perfiles where id = auth.uid() and rol in ('admin', 'preceptor'))
);

-- 4. TRIGGERS

-- Trigger para crear un perfil automáticamente cuando se registra un usuario en Supabase Auth
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.perfiles (id, email, rol)
  values (new.id, new.email, 'student');
  return new;
end;
$$ language plpgsql security definer;

-- Borrar el trigger si ya existía para evitar errores
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ==============================================================================
-- INSTRUCCIONES DE CONFIGURACIÓN
-- ==============================================================================
-- 1. Ve al Dashboard de Supabase -> SQL Editor
-- 2. Copia y pega TODO este archivo.
-- 3. Haz clic en "Run" en la esquina inferior derecha.
-- 4. ¡Listo! Toda la base de datos para Comedor y PP estará configurada.
