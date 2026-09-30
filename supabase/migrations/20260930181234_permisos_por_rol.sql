-- Permisos por rol. Antes varias políticas eran "true" para el rol public: cualquiera con la
-- clave pública (que está en la página y en el repo) podía leer todos los perfiles, los
-- movimientos de comedor y de recreativo, y cargar movimientos de recreativo a nombre de
-- cualquiera. Además un alumno podía modificar su propio perfil completo (curso, empresa,
-- horario de pasantía) y sus días habilitados.
--
-- Criterio: todo es sólo para usuarios autenticados; cada alumno ve lo suyo y el staff
-- (preceptor/admin) ve todo. Lo que un alumno puede cambiar lo limitan triggers por columna.

-- ============ Helpers ============
-- security definer: las políticas de perfiles no pueden consultar perfiles directamente
-- (recursión infinita de RLS).
create or replace function public.rol_actual()
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select rol from public.perfiles where id = auth.uid();
$$;

create or replace function public.es_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(public.rol_actual() in ('preceptor', 'admin'), false);
$$;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(public.rol_actual() = 'admin', false);
$$;

revoke all on function public.rol_actual(), public.es_staff(), public.es_admin() from public, anon;
grant execute on function public.rol_actual(), public.es_staff(), public.es_admin() to authenticated;

-- Crea el perfil de cada usuario nuevo de Auth (se le fija el search_path, antes no tenía).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	insert into public.perfiles (id, email, rol)
	values (new.id, new.email, 'student')
	on conflict (id) do nothing;
	return new;
end;
$$;

-- ============ Se reemplazan todas las políticas ============
do $$
declare p record;
begin
	for p in select tablename, policyname from pg_policies where schemaname = 'public' loop
		execute format('drop policy %I on public.%I', p.policyname, p.tablename);
	end loop;
end $$;

-- ---------- perfiles ----------
create policy "Cada uno ve su perfil; el staff ve todos" on public.perfiles
	for select to authenticated
	using (id = auth.uid() or public.es_staff());

create policy "Cada uno crea su propio perfil (auto-reparación)" on public.perfiles
	for insert to authenticated
	with check (id = auth.uid() and rol = 'student');

create policy "Cada uno actualiza su perfil; el staff, cualquiera" on public.perfiles
	for update to authenticated
	using (id = auth.uid() or public.es_staff())
	with check (id = auth.uid() or public.es_staff());

create policy "El admin borra perfiles" on public.perfiles
	for delete to authenticated
	using (public.es_admin());

-- Un alumno sólo puede cambiar su rol en su perfil (y únicamente para consumir una precarga,
-- ver prevent_non_admin_role_change). Curso, empresa y horario los asigna el staff.
create or replace function public.limitar_cambios_perfil()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if auth.uid() is null or public.es_staff() then
		return new;
	end if;
	if (to_jsonb(new) - 'rol') is distinct from (to_jsonb(old) - 'rol') then
		raise exception 'Tu curso, empresa y horario los asigna un preceptor' using errcode = '42501';
	end if;
	return new;
end;
$$;

create trigger limitar_cambios_perfil
	before update on public.perfiles
	for each row execute function public.limitar_cambios_perfil();

-- ---------- catálogos (cualquier usuario autenticado los lee) ----------
create policy "Usuarios ven los cursos" on public.cursos for select to authenticated using (true);
create policy "El staff administra los cursos" on public.cursos for all to authenticated
	using (public.es_staff()) with check (public.es_staff());

create policy "Usuarios ven los horarios de regreso" on public.cursos_horarios for select to authenticated using (true);
create policy "El staff administra los horarios" on public.cursos_horarios for all to authenticated
	using (public.es_staff()) with check (public.es_staff());

create policy "Usuarios ven qué secciones tiene cada curso" on public.seccion_cursos_permitidos for select to authenticated using (true);
create policy "El staff administra las secciones por curso" on public.seccion_cursos_permitidos for all to authenticated
	using (public.es_staff()) with check (public.es_staff());

create policy "Usuarios ven las empresas" on public.empresas for select to authenticated using (true);
create policy "El admin administra las empresas" on public.empresas for all to authenticated
	using (public.es_admin()) with check (public.es_admin());

create policy "Usuarios ven los ítems de recreativo" on public.recreativo_items for select to authenticated using (true);
create policy "El staff administra los ítems de recreativo" on public.recreativo_items for all to authenticated
	using (public.es_staff()) with check (public.es_staff());

-- ---------- pasantías ----------
create policy "Cada alumno ve sus días; el staff, todos" on public.dias_habilitados
	for select to authenticated
	using (perfil_id = auth.uid() or public.es_staff());
create policy "El admin asigna los días de pasantía" on public.dias_habilitados
	for all to authenticated
	using (public.es_admin()) with check (public.es_admin());

create policy "Cada alumno ve sus registros; el staff, todos" on public.registros
	for select to authenticated
	using (perfil_id = auth.uid() or public.es_staff());
create policy "Cada alumno registra su propia entrada" on public.registros
	for insert to authenticated
	with check (perfil_id = auth.uid());

create policy "El admin administra las precargas de alumnos" on public.alumnos_precargados
	for all to authenticated
	using (public.es_admin()) with check (public.es_admin());
create policy "El admin administra los días precargados" on public.alumnos_precargados_dias
	for all to authenticated
	using (public.es_admin()) with check (public.es_admin());

create policy "El admin administra las precargas de rol" on public.roles_precargados
	for all to authenticated
	using (public.es_admin()) with check (public.es_admin());
create policy "Cada uno ve su propia precarga de rol" on public.roles_precargados
	for select to authenticated
	using (email = (auth.jwt() ->> 'email'));

-- Precarga de pasantía: antes la aplicaba el navegador del alumno (y por eso el alumno podía
-- escribirse empresa, horario y días). Ahora la aplica la base: toma la precarga del mail del
-- usuario, se la asigna a su perfil y la borra. Devuelve true si había una.
create or replace function public.aplicar_precarga_pp()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
	pre public.alumnos_precargados%rowtype;
	uid uuid := auth.uid();
begin
	if uid is null then
		return false;
	end if;
	select * into pre from public.alumnos_precargados
		where lower(email) = lower(auth.jwt() ->> 'email')
		limit 1;
	if not found then
		return false;
	end if;

	update public.perfiles
		set empresa_id = pre.empresa_id, horario_entrada = pre.horario_entrada
		where id = uid;

	delete from public.dias_habilitados where perfil_id = uid;
	insert into public.dias_habilitados (perfil_id, dia)
		select uid, d.dia from public.alumnos_precargados_dias d where d.precargado_id = pre.id;

	delete from public.alumnos_precargados_dias where precargado_id = pre.id;
	delete from public.alumnos_precargados where id = pre.id;
	return true;
end;
$$;

revoke all on function public.aplicar_precarga_pp() from public, anon;
grant execute on function public.aplicar_precarga_pp() to authenticated;

-- ---------- comedor ----------
create policy "Cada alumno ve sus salidas; el staff, todas" on public.movimientos
	for select to authenticated
	using (perfil_id = auth.uid() or public.es_staff());
create policy "Cada alumno registra su salida; el staff, la de cualquiera" on public.movimientos
	for insert to authenticated
	with check (perfil_id = auth.uid() or public.es_staff());
create policy "Cada alumno registra su vuelta; el staff corrige" on public.movimientos
	for update to authenticated
	using (perfil_id = auth.uid() or public.es_staff())
	with check (perfil_id = auth.uid() or public.es_staff());

-- El alumno sólo puede completar la vuelta de una salida abierta (hora y firma de ingreso).
create or replace function public.limitar_cambios_movimiento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if auth.uid() is null or public.es_staff() then
		return new;
	end if;
	if old.hora_ingreso is not null
		or new.hora_ingreso is null
		or (to_jsonb(new) - 'hora_ingreso' - 'firma_ingreso') is distinct from (to_jsonb(old) - 'hora_ingreso' - 'firma_ingreso') then
		raise exception 'Sólo podés registrar tu vuelta de una salida abierta' using errcode = '42501';
	end if;
	return new;
end;
$$;

create trigger limitar_cambios_movimiento
	before update on public.movimientos
	for each row execute function public.limitar_cambios_movimiento();

-- ---------- recreativo ----------
create policy "Cada alumno ve sus préstamos; el staff, todos" on public.recreativo_movimientos
	for select to authenticated
	using (perfil_id = auth.uid() or public.es_staff());
create policy "Cada alumno retira a su nombre; el staff, a nombre de cualquiera" on public.recreativo_movimientos
	for insert to authenticated
	with check (perfil_id = auth.uid() or public.es_staff());
create policy "Cada alumno devuelve lo suyo; el staff registra devoluciones" on public.recreativo_movimientos
	for update to authenticated
	using (perfil_id = auth.uid() or public.es_staff())
	with check (perfil_id = auth.uid() or public.es_staff());

-- El alumno sólo puede marcar como devuelto algo que tiene retirado (la hora de devolución);
-- el estado del ítem lo registra el preceptor.
create or replace function public.limitar_cambios_recreativo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if auth.uid() is null or public.es_staff() then
		return new;
	end if;
	if old.hora_devolucion is not null
		or new.hora_devolucion is null
		or (to_jsonb(new) - 'hora_devolucion') is distinct from (to_jsonb(old) - 'hora_devolucion') then
		raise exception 'Sólo podés devolver algo que tenés retirado' using errcode = '42501';
	end if;
	return new;
end;
$$;

create trigger limitar_cambios_recreativo
	before update on public.recreativo_movimientos
	for each row execute function public.limitar_cambios_recreativo();
