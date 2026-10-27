-- Las tardes que el procesador dejó "en cola" (no encontró la planilla de la clase) se vuelven a
-- mandar cada hora durante 3 días: si ya la aplicó contesta "ya estaba" (Anotada) y si seguía
-- esperando la planilla, la aplica. El servidor (/api/cron/tardes) elige cuáles; acá sólo se
-- dispara la llamada también cuando hay alguna en cola para reintentar.
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
		where (estado in ('pendiente', 'error') and intentos < 10 and hora_fichada > now() - interval '14 days')
			or (estado = 'en_cola' and enviado_en < now() - interval '1 hour' and hora_fichada > now() - interval '3 days')
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
