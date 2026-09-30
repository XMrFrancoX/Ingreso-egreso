-- Borrar un curso con alumnos asignados fallaba: perfiles.curso_id no tenía regla ON DELETE.
-- Ahora esos alumnos quedan sin curso (como ya decía la pantalla al confirmar el borrado);
-- los permisos por sección y los horarios del curso ya se borraban en cascada.
alter table public.perfiles drop constraint perfiles_curso_id_fkey;
alter table public.perfiles
	add constraint perfiles_curso_id_fkey foreign key (curso_id) references public.cursos(id) on delete set null;
