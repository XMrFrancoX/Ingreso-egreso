-- Pasantías: algunos alumnos tienen 30 minutos para almorzar en el colegio después de llegar de
-- la empresa (tilde "30 min de almuerzo" en Pasantías > Alumnos). Para ellos el ingreso sigue
-- siendo su horario (ej. 12:30), pero tienen que estar en el aula 30 minutos después (13:00): la
-- tarde que se manda al procesador se cuenta desde ahí (entra 13:10 → 10 min tarde).

alter table public.perfiles add column almuerzo_extra boolean not null default false;
alter table public.alumnos_precargados add column almuerzo_extra boolean not null default false;

comment on column public.perfiles.almuerzo_extra is
	'Pasantías: tiene 30 min para almorzar; la tarde se cuenta desde horario_entrada + 30 min.';

-- Minutos de almuerzo (uno solo para todos).
create or replace function public.minutos_almuerzo_pp()
returns integer
language sql
immutable
set search_path = ''
as $$
	select 30;
$$;

-- La precarga también trae el tilde de almuerzo.
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
		set empresa_id = pre.empresa_id, horario_entrada = pre.horario_entrada, dni = coalesce(pre.dni, dni),
			almuerzo_extra = pre.almuerzo_extra
		where id = uid;

	delete from public.dias_habilitados where perfil_id = uid;
	insert into public.dias_habilitados (perfil_id, dia)
		select uid, d.dia from public.alumnos_precargados_dias d where d.precargado_id = pre.id;

	delete from public.alumnos_precargados_dias where precargado_id = pre.id;
	delete from public.alumnos_precargados where id = pre.id;
	return true;
end;
$$;

-- Al fichar: la tarde se cuenta desde el horario de entrada al aula (horario + almuerzo).
create or replace function public.anotar_tarde_procesador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	esperada time;
	almuerzo boolean;
	minutos integer;
begin
	select p.horario_entrada, p.almuerzo_extra into esperada, almuerzo from public.perfiles p where p.id = new.perfil_id;
	if almuerzo then
		esperada := esperada + make_interval(mins => public.minutos_almuerzo_pp());
	end if;
	minutos := case when esperada is null then 0 else public.minutos_tarde(new.hora_entrada_real::time, esperada) end;

	if minutos > 0 then
		insert into public.tardes_procesador (registro_id, perfil_id, minutos, hora_fichada)
		values (new.id, new.perfil_id, minutos,
			(new.fecha + new.hora_entrada_real::time) at time zone 'America/Argentina/Buenos_Aires')
		on conflict (registro_id) do update
			set minutos = excluded.minutos, hora_fichada = excluded.hora_fichada, estado = 'pendiente',
				intentos = 0, respuesta = null, actualizado_en = now()
			where public.tardes_procesador.minutos is distinct from excluded.minutos
				or public.tardes_procesador.hora_fichada is distinct from excluded.hora_fichada;
	else
		-- Se corrigió y ya no es tarde: si todavía no salió, no se manda.
		delete from public.tardes_procesador
		where registro_id = new.id and estado in ('pendiente', 'sin_dni', 'rechazado', 'error', 'omitido');
	end if;
	return new;
end;
$$;

-- El alumno puede crearse su perfil (auto-reparación), pero el DNI y el almuerzo los carga el staff.
create or replace function public.dni_lo_carga_el_staff()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if auth.uid() is not null and current_user = 'authenticated' and not public.es_staff() then
		new.dni := null;
		new.almuerzo_extra := false;
	end if;
	return new;
end;
$$;

revoke all on function public.minutos_almuerzo_pp() from public, anon;
grant execute on function public.minutos_almuerzo_pp() to authenticated, service_role;
