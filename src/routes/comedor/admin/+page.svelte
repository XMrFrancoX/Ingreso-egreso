<script lang="ts">
	import { goto } from '$app/navigation';

	// Cursos, horarios de regreso y asignación de alumnos ahora están en "Cursos y accesos";
	// la autorización manual, en el panel del preceptor.
	goto('/accesos?tab=cursos', { replaceState: true });
</script>
