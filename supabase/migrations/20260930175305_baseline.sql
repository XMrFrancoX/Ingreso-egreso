-- Baseline del esquema de Ingreso-egreso.
-- Reconstruido desde el catálogo de la base original (xtdfyuszilxksjvomazt) el 2026-09-30,
-- para mudar la base al proyecto nuevo de la organización "Escuela Philips".
-- Es una copia fiel: cualquier corrección de permisos va en migraciones posteriores.

set check_function_bodies = false;
set search_path = public, extensions;

-- ============ Tablas ============
create table public.alumnos_precargados (
	id uuid default gen_random_uuid() not null,
	email text not null,
	empresa_id uuid,
	horario_entrada time without time zone,
	created_at timestamp with time zone default now()
);

create table public.alumnos_precargados_dias (
	id uuid default gen_random_uuid() not null,
	precargado_id uuid not null,
	dia text not null
);

create table public.cursos (
	id uuid default uuid_generate_v4() not null,
	nombre text not null,
	created_at timestamp with time zone default now()
);

create table public.cursos_horarios (
	id uuid default uuid_generate_v4() not null,
	curso_id uuid,
	dia text not null,
	hora_regreso time without time zone not null
);

create table public.dias_habilitados (
	id uuid default uuid_generate_v4() not null,
	perfil_id uuid not null,
	dia text not null,
	created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.empresas (
	id uuid default uuid_generate_v4() not null,
	nombre text not null,
	created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.movimientos (
	id uuid default uuid_generate_v4() not null,
	perfil_id uuid not null,
	fecha date not null,
	hora_salida time without time zone not null,
	firma_salida text not null,
	hora_ingreso time without time zone,
	firma_ingreso text,
	created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.perfiles (
	id uuid not null,
	email text not null,
	rol text default 'student'::text,
	empresa_id uuid,
	horario_entrada time without time zone,
	created_at timestamp with time zone default timezone('utc'::text, now()) not null,
	curso_id uuid
);

create table public.recreativo_items (
	id uuid default gen_random_uuid() not null,
	nombre text not null,
	activo boolean default true,
	creado_en timestamp with time zone default now()
);

create table public.recreativo_movimientos (
	id uuid default gen_random_uuid() not null,
	perfil_id uuid not null,
	item_id uuid not null,
	fecha date default CURRENT_DATE not null,
	hora_retiro time without time zone not null,
	preceptor_retiro_id uuid,
	hora_devolucion time without time zone,
	preceptor_devolucion_id uuid,
	estado_devolucion text,
	observaciones text
);

create table public.registros (
	id uuid default uuid_generate_v4() not null,
	perfil_id uuid not null,
	fecha date not null,
	hora_entrada_real time without time zone not null,
	created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.roles_precargados (
	id uuid default gen_random_uuid() not null,
	email text not null,
	rol text not null,
	created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.seccion_cursos_permitidos (
	id uuid default gen_random_uuid() not null,
	seccion text not null,
	curso_id uuid not null
);

-- ============ Constraints (PK, unique, check) ============
alter table public.alumnos_precargados add constraint alumnos_precargados_pkey PRIMARY KEY (id);
alter table public.alumnos_precargados add constraint alumnos_precargados_email_key UNIQUE (email);
alter table public.alumnos_precargados_dias add constraint alumnos_precargados_dias_pkey PRIMARY KEY (id);
alter table public.alumnos_precargados_dias add constraint alumnos_precargados_dias_dia_check CHECK (dia = ANY (ARRAY['L'::text, 'M'::text, 'X'::text, 'J'::text, 'V'::text]));
alter table public.cursos add constraint cursos_pkey PRIMARY KEY (id);
alter table public.cursos add constraint cursos_nombre_key UNIQUE (nombre);
alter table public.cursos_horarios add constraint cursos_horarios_pkey PRIMARY KEY (id);
alter table public.cursos_horarios add constraint cursos_horarios_curso_id_dia_key UNIQUE (curso_id, dia);
alter table public.dias_habilitados add constraint dias_habilitados_pkey PRIMARY KEY (id);
alter table public.dias_habilitados add constraint dias_habilitados_perfil_id_dia_key UNIQUE (perfil_id, dia);
alter table public.dias_habilitados add constraint dias_habilitados_dia_check CHECK (dia = ANY (ARRAY['L'::text, 'M'::text, 'X'::text, 'J'::text, 'V'::text]));
alter table public.empresas add constraint empresas_pkey PRIMARY KEY (id);
alter table public.movimientos add constraint movimientos_pkey PRIMARY KEY (id);
alter table public.perfiles add constraint perfiles_pkey PRIMARY KEY (id);
alter table public.recreativo_items add constraint recreativo_items_pkey PRIMARY KEY (id);
alter table public.recreativo_movimientos add constraint recreativo_movimientos_pkey PRIMARY KEY (id);
alter table public.registros add constraint registros_pkey PRIMARY KEY (id);
alter table public.registros add constraint registros_perfil_id_fecha_key UNIQUE (perfil_id, fecha);
alter table public.roles_precargados add constraint roles_precargados_pkey PRIMARY KEY (id);
alter table public.roles_precargados add constraint roles_precargados_email_key UNIQUE (email);
alter table public.roles_precargados add constraint roles_precargados_rol_check CHECK (rol = ANY (ARRAY['preceptor'::text, 'admin'::text]));
alter table public.seccion_cursos_permitidos add constraint seccion_cursos_permitidos_pkey PRIMARY KEY (id);
alter table public.seccion_cursos_permitidos add constraint seccion_cursos_permitidos_seccion_curso_id_key UNIQUE (seccion, curso_id);
alter table public.seccion_cursos_permitidos add constraint seccion_cursos_permitidos_seccion_check CHECK (seccion = ANY (ARRAY['comedor'::text, 'PP'::text, 'recreativo'::text]));

-- ============ Foreign keys ============
alter table public.alumnos_precargados add constraint alumnos_precargados_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL;
alter table public.alumnos_precargados_dias add constraint alumnos_precargados_dias_precargado_id_fkey FOREIGN KEY (precargado_id) REFERENCES alumnos_precargados(id) ON DELETE CASCADE;
alter table public.cursos_horarios add constraint cursos_horarios_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE CASCADE;
alter table public.dias_habilitados add constraint dias_habilitados_perfil_id_fkey FOREIGN KEY (perfil_id) REFERENCES perfiles(id) ON DELETE CASCADE;
alter table public.movimientos add constraint movimientos_perfil_id_fkey FOREIGN KEY (perfil_id) REFERENCES perfiles(id) ON DELETE CASCADE;
alter table public.perfiles add constraint perfiles_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES cursos(id);
alter table public.perfiles add constraint perfiles_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL;
alter table public.perfiles add constraint perfiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.recreativo_movimientos add constraint recreativo_movimientos_item_id_fkey FOREIGN KEY (item_id) REFERENCES recreativo_items(id);
alter table public.recreativo_movimientos add constraint recreativo_movimientos_perfil_id_fkey FOREIGN KEY (perfil_id) REFERENCES perfiles(id);
alter table public.recreativo_movimientos add constraint recreativo_movimientos_preceptor_devolucion_id_fkey FOREIGN KEY (preceptor_devolucion_id) REFERENCES perfiles(id);
alter table public.recreativo_movimientos add constraint recreativo_movimientos_preceptor_retiro_id_fkey FOREIGN KEY (preceptor_retiro_id) REFERENCES perfiles(id);
alter table public.registros add constraint registros_perfil_id_fkey FOREIGN KEY (perfil_id) REFERENCES perfiles(id) ON DELETE CASCADE;
alter table public.seccion_cursos_permitidos add constraint seccion_cursos_permitidos_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE CASCADE;

-- ============ Índices ============

-- ============ Funciones ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.perfiles (id, email, rol)
  VALUES (new.id, new.email, 'student')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_non_admin_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
	if new.rol is distinct from old.rol then
		if auth.uid() is not null then
			if exists (select 1 from perfiles where id = auth.uid() and rol = 'admin') then
				return new;
			end if;

			if auth.uid() = new.id and exists (
				select 1 from roles_precargados where email = new.email and rol = new.rol
			) then
				delete from roles_precargados where email = new.email and rol = new.rol;
				return new;
			end if;

			raise exception 'Solo un administrador puede modificar el rol de un usuario';
		end if;
	end if;
	return new;
end;
$function$;

-- ============ Triggers ============
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER trg_prevent_non_admin_role_change BEFORE UPDATE ON perfiles FOR EACH ROW EXECUTE FUNCTION prevent_non_admin_role_change();

-- ============ Row Level Security ============
alter table public.alumnos_precargados enable row level security;
alter table public.alumnos_precargados_dias enable row level security;
alter table public.cursos enable row level security;
alter table public.cursos_horarios enable row level security;
alter table public.dias_habilitados enable row level security;
alter table public.empresas enable row level security;
alter table public.movimientos enable row level security;
alter table public.perfiles enable row level security;
alter table public.recreativo_items enable row level security;
alter table public.recreativo_movimientos enable row level security;
alter table public.registros enable row level security;
alter table public.roles_precargados enable row level security;
alter table public.seccion_cursos_permitidos enable row level security;

create policy admin_full_alumnos_precargados on public.alumnos_precargados
	as permissive
	for all
	to public
	using ((EXISTS ( SELECT 1
   FROM perfiles
  WHERE ((perfiles.id = auth.uid()) AND (perfiles.rol = 'admin'::text)))));

create policy alumno_delete_own_precarga on public.alumnos_precargados
	as permissive
	for delete
	to public
	using ((email = (auth.jwt() ->> 'email'::text)));

create policy alumno_read_own_precarga on public.alumnos_precargados
	as permissive
	for select
	to public
	using ((email = (auth.jwt() ->> 'email'::text)));

create policy admin_full_alumnos_precargados_dias on public.alumnos_precargados_dias
	as permissive
	for all
	to public
	using ((EXISTS ( SELECT 1
   FROM perfiles
  WHERE ((perfiles.id = auth.uid()) AND (perfiles.rol = 'admin'::text)))));

create policy alumno_read_own_precarga_dias on public.alumnos_precargados_dias
	as permissive
	for select
	to public
	using ((precargado_id IN ( SELECT alumnos_precargados.id
   FROM alumnos_precargados
  WHERE (alumnos_precargados.email = (auth.jwt() ->> 'email'::text)))));

create policy "Cursos editables por staff" on public.cursos
	as permissive
	for all
	to public
	using ((EXISTS ( SELECT 1
   FROM perfiles
  WHERE ((perfiles.id = auth.uid()) AND ((perfiles.rol = 'admin'::text) OR (perfiles.rol = 'preceptor'::text))))));

create policy "Cursos visibles para todos" on public.cursos
	as permissive
	for select
	to public
	using (true);

create policy "Horarios editables por staff" on public.cursos_horarios
	as permissive
	for all
	to public
	using ((EXISTS ( SELECT 1
   FROM perfiles
  WHERE ((perfiles.id = auth.uid()) AND ((perfiles.rol = 'admin'::text) OR (perfiles.rol = 'preceptor'::text))))));

create policy "Horarios visibles para todos" on public.cursos_horarios
	as permissive
	for select
	to public
	using (true);

create policy "Admins pueden modificar días" on public.dias_habilitados
	as permissive
	for all
	to public
	using ((EXISTS ( SELECT 1
   FROM perfiles
  WHERE ((perfiles.id = auth.uid()) AND (perfiles.rol = 'admin'::text)))));

create policy "Usuarios pueden ver sus días" on public.dias_habilitados
	as permissive
	for select
	to public
	using (true);

create policy admin_delete_dias on public.dias_habilitados
	as permissive
	for delete
	to public
	using ((EXISTS ( SELECT 1
   FROM perfiles p_admin
  WHERE ((p_admin.id = auth.uid()) AND (p_admin.rol = 'admin'::text)))));

create policy alumno_delete_own_dias on public.dias_habilitados
	as permissive
	for delete
	to public
	using ((perfil_id = auth.uid()));

create policy alumno_insert_dias on public.dias_habilitados
	as permissive
	for insert
	to public
	with check ((perfil_id = auth.uid()));

create policy alumno_select_own_dias on public.dias_habilitados
	as permissive
	for select
	to public
	using ((perfil_id = auth.uid()));

create policy "Admins pueden modificar empresas" on public.empresas
	as permissive
	for all
	to public
	using ((EXISTS ( SELECT 1
   FROM perfiles
  WHERE ((perfiles.id = auth.uid()) AND (perfiles.rol = 'admin'::text)))));

create policy "Todos pueden ver empresas" on public.empresas
	as permissive
	for select
	to public
	using (true);

create policy admin_delete_empresas on public.empresas
	as permissive
	for delete
	to public
	using ((EXISTS ( SELECT 1
   FROM perfiles p_admin
  WHERE ((p_admin.id = auth.uid()) AND (p_admin.rol = 'admin'::text)))));

create policy "Alumnos pueden actualizar su ingreso" on public.movimientos
	as permissive
	for update
	to public
	using (((auth.uid() = perfil_id) OR (EXISTS ( SELECT 1
   FROM perfiles
  WHERE ((perfiles.id = auth.uid()) AND (perfiles.rol = ANY (ARRAY['admin'::text, 'preceptor'::text])))))));

create policy "Alumnos y Preceptores pueden insertar salida" on public.movimientos
	as permissive
	for insert
	to public
	with check (((auth.uid() = perfil_id) OR (EXISTS ( SELECT 1
   FROM perfiles
  WHERE ((perfiles.id = auth.uid()) AND (perfiles.rol = ANY (ARRAY['admin'::text, 'preceptor'::text])))))));

create policy "Todos pueden ver movimientos" on public.movimientos
	as permissive
	for select
	to public
	using (true);

create policy "Admins y Preceptores pueden actualizar perfiles" on public.perfiles
	as permissive
	for update
	to public
	using ((EXISTS ( SELECT 1
   FROM perfiles perfiles_1
  WHERE ((perfiles_1.id = auth.uid()) AND (perfiles_1.rol = ANY (ARRAY['admin'::text, 'preceptor'::text]))))));

create policy "Staff puede asignar cursos a perfiles" on public.perfiles
	as permissive
	for update
	to public
	using ((EXISTS ( SELECT 1
   FROM perfiles perfiles_1
  WHERE ((perfiles_1.id = auth.uid()) AND ((perfiles_1.rol = 'admin'::text) OR (perfiles_1.rol = 'preceptor'::text))))));

create policy "Usuarios pueden ver perfiles" on public.perfiles
	as permissive
	for select
	to public
	using (true);

create policy admin_delete_perfiles on public.perfiles
	as permissive
	for delete
	to public
	using ((EXISTS ( SELECT 1
   FROM perfiles p_admin
  WHERE ((p_admin.id = auth.uid()) AND (p_admin.rol = 'admin'::text)))));

create policy perfiles_insert_own on public.perfiles
	as permissive
	for insert
	to public
	with check ((auth.uid() = id));

create policy perfiles_update_own on public.perfiles
	as permissive
	for update
	to public
	using ((auth.uid() = id));

create policy "Preceptores actualizan items recreativo" on public.recreativo_items
	as permissive
	for update
	to public
	using ((EXISTS ( SELECT 1
   FROM perfiles
  WHERE ((perfiles.id = auth.uid()) AND (perfiles.rol = ANY (ARRAY['preceptor'::text, 'admin'::text]))))));

create policy "Preceptores insertan items recreativo" on public.recreativo_items
	as permissive
	for insert
	to public
	with check ((EXISTS ( SELECT 1
   FROM perfiles
  WHERE ((perfiles.id = auth.uid()) AND (perfiles.rol = ANY (ARRAY['preceptor'::text, 'admin'::text]))))));

create policy "Ver items recreativo para todos" on public.recreativo_items
	as permissive
	for select
	to public
	using (true);

create policy "Actualizar movimientos recreativo" on public.recreativo_movimientos
	as permissive
	for update
	to public
	using ((EXISTS ( SELECT 1
   FROM perfiles
  WHERE ((perfiles.id = auth.uid()) AND (perfiles.rol = ANY (ARRAY['preceptor'::text, 'admin'::text]))))));

create policy "Insertar movimientos recreativo" on public.recreativo_movimientos
	as permissive
	for insert
	to public
	with check (true);

create policy "Ver movimientos recreativo para todos" on public.recreativo_movimientos
	as permissive
	for select
	to public
	using (true);

create policy "Alumnos pueden insertar su registro" on public.registros
	as permissive
	for insert
	to public
	with check ((auth.uid() = perfil_id));

create policy "Usuarios ven sus propios registros" on public.registros
	as permissive
	for select
	to public
	using (((auth.uid() = perfil_id) OR (EXISTS ( SELECT 1
   FROM perfiles
  WHERE ((perfiles.id = auth.uid()) AND (perfiles.rol = 'admin'::text))))));

create policy preceptor_select_registros_pp on public.registros
	as permissive
	for select
	to public
	using (((auth.uid() = perfil_id) OR (EXISTS ( SELECT 1
   FROM perfiles
  WHERE ((perfiles.id = auth.uid()) AND (perfiles.rol = ANY (ARRAY['admin'::text, 'preceptor'::text])))))));

create policy admin_full_roles_precargados on public.roles_precargados
	as permissive
	for all
	to public
	using ((EXISTS ( SELECT 1
   FROM perfiles
  WHERE ((perfiles.id = auth.uid()) AND (perfiles.rol = 'admin'::text)))));

create policy usuario_read_own_role_precarga on public.roles_precargados
	as permissive
	for select
	to public
	using ((email = (auth.jwt() ->> 'email'::text)));

create policy "Preceptores eliminan visibilidad" on public.seccion_cursos_permitidos
	as permissive
	for delete
	to public
	using ((EXISTS ( SELECT 1
   FROM perfiles
  WHERE ((perfiles.id = auth.uid()) AND (perfiles.rol = ANY (ARRAY['preceptor'::text, 'admin'::text]))))));

create policy "Preceptores insertan visibilidad" on public.seccion_cursos_permitidos
	as permissive
	for insert
	to public
	with check ((EXISTS ( SELECT 1
   FROM perfiles
  WHERE ((perfiles.id = auth.uid()) AND (perfiles.rol = ANY (ARRAY['preceptor'::text, 'admin'::text]))))));

create policy "Ver visibilidad para todos autenticados" on public.seccion_cursos_permitidos
	as permissive
	for select
	to public
	using ((auth.uid() IS NOT NULL));

-- ============ Permisos de la Data API ============
-- Explícitos: los branches nuevos de Supabase pueden salir sin estos grants.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

-- ============ Realtime ============
