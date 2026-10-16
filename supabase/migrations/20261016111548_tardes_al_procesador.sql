-- Pasantías: las entradas tarde se mandan al procesador de asistencias del colegio (intranet,
-- api_tardes.asp), que les pone "tarde" en la lista; si la lista todavía no existe, la intranet
-- lo deja en cola y lo aplica después. El procesador identifica al alumno por DNI, que carga el
-- admin en "Alumnos" de Pasantías.
--
-- Flujo: al fichar la entrada (registros), si llegó tarde se anota acá como "pendiente"; cada 5
-- minutos pg_cron llama al servidor de la app (/api/cron/tardes), que manda las pendientes y
-- guarda la respuesta. Sólo se mandan las entradas desde que esto existe (no hay carga retroactiva).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

alter table public.perfiles add column dni text;
alter table public.alumnos_precargados add column dni text;

comment on column public.perfiles.dni is 'DNI del alumno (sólo números). Lo usa el procesador de asistencias para las tardes de pasantías.';

-- El control de cambios de perfil también frenaba a aplicar_precarga_pp (corre con el usuario del
-- alumno en auth.uid()), así que la precarga nunca se aplicaba. Los cambios que hace una función
-- de la base (security definer, current_user no es "authenticated") ya están controlados por ella.
create or replace function public.limitar_cambios_perfil()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if auth.uid() is null or current_user <> 'authenticated' or public.es_staff() then
		return new;
	end if;
	if (to_jsonb(new) - 'rol') is distinct from (to_jsonb(old) - 'rol') then
		raise exception 'Tu curso, empresa y horario los asigna un preceptor' using errcode = '42501';
	end if;
	return new;
end;
$$;

-- El alumno puede crearse su perfil (auto-reparación), pero el DNI lo carga el staff.
create or replace function public.dni_lo_carga_el_staff()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if auth.uid() is not null and current_user = 'authenticated' and not public.es_staff() then
		new.dni := null;
	end if;
	return new;
end;
$$;

create trigger dni_lo_carga_el_staff
	before insert on public.perfiles
	for each row execute function public.dni_lo_carga_el_staff();

-- La precarga también trae el DNI (si la precarga no lo tiene, se deja el que ya había).
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
		set empresa_id = pre.empresa_id, horario_entrada = pre.horario_entrada, dni = coalesce(pre.dni, dni)
		where id = uid;

	delete from public.dias_habilitados where perfil_id = uid;
	insert into public.dias_habilitados (perfil_id, dia)
		select uid, d.dia from public.alumnos_precargados_dias d where d.precargado_id = pre.id;

	delete from public.alumnos_precargados_dias where precargado_id = pre.id;
	delete from public.alumnos_precargados where id = pre.id;
	return true;
end;
$$;

-- Estado de cada tarde frente al procesador:
--   pendiente  → por mandar          enviado / ya_estaba / en_cola → listo (201 / 200 / 202)
--   sin_dni    → el alumno no tiene DNI cargado (vuelve a pendiente al cargarlo)
--   rechazado  → el procesador no aceptó el DNI (no existe, inválido o repetido); vuelve a
--                pendiente si se corrige el DNI o con "Reintentar"
--   error      → falla de conexión o del servidor: se reintenta sola (hasta 10 veces)
--   omitido    → en develop, DNI fuera de los de prueba (no se manda)
create table public.tardes_procesador (
	registro_id uuid primary key references public.registros (id) on delete cascade,
	perfil_id uuid not null references public.perfiles (id) on delete cascade,
	minutos integer not null check (minutos > 0),
	hora_fichada timestamptz not null,
	estado text not null default 'pendiente'
		check (estado in ('pendiente', 'enviado', 'ya_estaba', 'en_cola', 'sin_dni', 'rechazado', 'error', 'omitido')),
	intentos integer not null default 0,
	respuesta text,
	enviado_en timestamptz,
	actualizado_en timestamptz not null default now()
);

create index tardes_procesador_estado_idx on public.tardes_procesador (estado, hora_fichada);
create index tardes_procesador_perfil_idx on public.tardes_procesador (perfil_id);

alter table public.tardes_procesador enable row level security;

create policy "El staff ve las tardes mandadas al procesador" on public.tardes_procesador
	for select to authenticated using (public.es_staff());

grant select on public.tardes_procesador to authenticated;
grant select, insert, update, delete on public.tardes_procesador to service_role;

-- Minutos tarde, igual que en los reportes (horas y minutos, sin segundos).
create or replace function public.minutos_tarde(p_real time, p_esperada time)
returns integer
language sql
immutable
set search_path = ''
as $$
	select ((extract(hour from p_real) * 60 + extract(minute from p_real))
		- (extract(hour from p_esperada) * 60 + extract(minute from p_esperada)))::integer;
$$;

-- Al fichar (o corregir) una entrada: si es tarde, queda pendiente para el procesador.
create or replace function public.anotar_tarde_procesador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	esperada time;
	minutos integer;
begin
	select p.horario_entrada into esperada from public.perfiles p where p.id = new.perfil_id;
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

create trigger anotar_tarde_procesador
	after insert or update of hora_entrada_real, fecha on public.registros
	for each row execute function public.anotar_tarde_procesador();

-- Al cargar o corregir el DNI, las tardes que esperaban DNI (o que el procesador rechazó) se
-- vuelven a mandar.
create or replace function public.reintentar_tardes_al_cambiar_dni()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if new.dni is distinct from old.dni then
		update public.tardes_procesador
		set estado = 'pendiente', intentos = 0, respuesta = null, actualizado_en = now()
		where perfil_id = new.id and estado in ('sin_dni', 'rechazado', 'omitido');
	end if;
	return new;
end;
$$;

create trigger reintentar_tardes_al_cambiar_dni
	after update of dni on public.perfiles
	for each row execute function public.reintentar_tardes_al_cambiar_dni();

-- Botón "Reintentar" (staff).
create or replace function public.reintentar_tarde(p_registro uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not public.es_staff() then
		raise exception 'Sin permiso';
	end if;
	update public.tardes_procesador
	set estado = 'pendiente', intentos = 0, respuesta = null, actualizado_en = now()
	where registro_id = p_registro and estado in ('sin_dni', 'rechazado', 'error', 'omitido');
end;
$$;

-- Resultado de una tanda de envíos (lo llama el servidor con la clave de servicio).
-- p_resultados: [{ registro_id, estado, respuesta }]
create or replace function public.registrar_tardes_procesador(p_resultados jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	n integer;
begin
	update public.tardes_procesador t
	set estado = r.estado,
		respuesta = r.respuesta,
		intentos = t.intentos + case when r.estado = 'error' then 1 else 0 end,
		enviado_en = case when r.estado in ('enviado', 'ya_estaba', 'en_cola') then now() else t.enviado_en end,
		actualizado_en = now()
	from jsonb_to_recordset(p_resultados) as r (registro_id uuid, estado text, respuesta text)
	where t.registro_id = r.registro_id;
	get diagnostics n = row_count;
	return n;
end;
$$;

-- Cada 5 minutos: si hay tardes por mandar, llama al servidor de la app. La dirección de la app
-- y la clave (CRON_SECRET de Cloudflare) de cada entorno están en Vault: ingresos_url e
-- ingresos_cron_secret. Sólo se intentan las de los últimos 14 días.
create or replace function public.disparar_tardes_procesador()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
	base text := (select decrypted_secret from vault.decrypted_secrets where name = 'ingresos_url');
	clave text := (select decrypted_secret from vault.decrypted_secrets where name = 'ingresos_cron_secret');
begin
	if not exists (
		select 1 from public.tardes_procesador
		where estado in ('pendiente', 'error') and intentos < 10 and hora_fichada > now() - interval '14 days'
	) then
		return null;
	end if;
	if base is null or clave is null then
		raise exception 'Faltan los secretos ingresos_url / ingresos_cron_secret en Vault';
	end if;
	return net.http_get(
		url := base || '/api/cron/tardes',
		headers := jsonb_build_object('Authorization', 'Bearer ' || clave),
		timeout_milliseconds := 60000
	);
end;
$$;

revoke all on function public.minutos_tarde(time, time) from public, anon;
grant execute on function public.minutos_tarde(time, time) to authenticated, service_role;
revoke all on function public.reintentar_tarde(uuid) from public, anon;
grant execute on function public.reintentar_tarde(uuid) to authenticated;
revoke all on function public.registrar_tardes_procesador(jsonb) from public, anon, authenticated;
grant execute on function public.registrar_tardes_procesador(jsonb) to service_role;
revoke all on function public.disparar_tardes_procesador() from public, anon, authenticated;
revoke all on function public.anotar_tarde_procesador() from public, anon, authenticated;
revoke all on function public.reintentar_tardes_al_cambiar_dni() from public, anon, authenticated;
revoke all on function public.dni_lo_carga_el_staff() from public, anon, authenticated;

select cron.schedule('ingresos-tardes-procesador', '*/5 * * * *', 'select public.disparar_tardes_procesador()');
