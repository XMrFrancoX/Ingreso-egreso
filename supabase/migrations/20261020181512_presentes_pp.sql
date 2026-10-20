-- Pasantías: además de la hora en que fichan con el QR, se mira a qué hora el docente les puso
-- el presente en el aula (API de la intranet api_presentes.asp). Un pasante que ficha a horario
-- (12:30), almuerza y entra al aula tarde (13:10, cuando tenía que estar a las 13:00) recibe esa
-- tarde en el procesador aunque el docente le haya puesto "presente".
--
-- Cada 10 minutos (lunes a viernes, 12 a 20) pg_cron llama al servidor (/api/cron/presentes), que
-- consulta la asistencia de los que ficharon hoy y guarda acá lo que vio. Si la tarde por el
-- presente es mayor que la ya anotada, actualiza tardes_procesador (fuente 'presente') y el envío
-- de siempre (/api/cron/tardes) la manda.

-- Lo que marcó el docente en la clase de la hora de aula, por fichada.
create table public.presentes_pp (
	registro_id uuid primary key references public.registros (id) on delete cascade,
	clase text,
	clase_inicio time,
	-- presente / tarde / ausente / sin_tomar (como la intranet) o sin_clase (no hay clase a esa hora)
	estado text not null,
	marcado timestamptz,
	lista_tomada timestamptz,
	-- Minutos tarde por el presente (0 si llegó a tiempo).
	minutos integer not null default 0,
	revisado_en timestamptz not null default now()
);

alter table public.presentes_pp enable row level security;

create policy "El staff ve los presentes de los pasantes" on public.presentes_pp
	for select to authenticated using (public.es_staff());

grant select on public.presentes_pp to authenticated;
grant select, insert, update, delete on public.presentes_pp to service_role;

-- De dónde salió la tarde: la hora en que fichó o el presente del docente.
alter table public.tardes_procesador add column fuente text not null default 'fichada'
	check (fuente in ('fichada', 'presente'));

-- Cada 10 minutos de 12 a 20 (hora argentina), si hoy fichó algún pasante con DNI y horario.
create or replace function public.disparar_presentes_pp()
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
		select 1 from public.registros r
		join public.perfiles p on p.id = r.perfil_id
		where r.fecha = (now() at time zone 'America/Argentina/Buenos_Aires')::date
			and p.dni is not null and p.horario_entrada is not null
	) then
		return null;
	end if;
	if base is null or clave is null then
		raise exception 'Faltan los secretos ingresos_url / ingresos_cron_secret en Vault';
	end if;
	return net.http_get(
		url := base || '/api/cron/presentes',
		headers := jsonb_build_object('Authorization', 'Bearer ' || clave),
		timeout_milliseconds := 60000
	);
end;
$$;

revoke all on function public.disparar_presentes_pp() from public, anon, authenticated;

select cron.schedule('ingresos-presentes-pp', '*/10 15-22 * * 1-5', 'select public.disparar_presentes_pp()');
