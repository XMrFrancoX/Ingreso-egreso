<svelte:head>
	<title>Plataforma de Control — Escuela Philips</title>
</svelte:head>

<div class="row justify-content-center mt-5 mb-5">
	<div class="col-md-6 text-center">
		<img src="https://www.philips.edu.ar/favicon.png" alt="Philips" width="80" class="mb-3 shadow-sm" style="border-radius:16px;" />
		<h1 class="fw-bold philips-text fs-1">Escuela Técnica Philips</h1>
		<p class="text-muted fs-5">Plataforma unificada de control de alumnos</p>
	</div>
</div>

<div class="row justify-content-center px-3">
	<div class="col-md-5 col-lg-4 mb-4">
		<div class="card glass-card h-100 p-5 text-center transition-hover" style="cursor: pointer;" onclick={() => window.location.href='/comedor'}>
			<div class="mb-4">
				<div class="bg-primary-subtle text-primary rounded-circle d-inline-flex p-3 mb-3 shadow-sm">
					<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" class="bi bi-cup-hot-fill" viewBox="0 0 16 16">
						<path fill-rule="evenodd" d="M.5 6a.5.5 0 0 0-.488.608l1.652 7.434A2.5 2.5 0 0 0 4.104 16h5.792a2.5 2.5 0 0 0 2.44-1.958l.131-.59a3 3 0 0 0 1.3-5.854l.221-.99A.5.5 0 0 0 13.5 6H.5ZM13 12.5a2.001 2.001 0 0 1-.316-.025l.867-3.898A2.001 2.001 0 0 1 13 12.5Z"/>
						<path d="m4.4.8-.003.004-.014.019a4 4 0 0 0-.204.31 2 2 0 0 0-.141.267c-.026.06-.034.092-.037.103v.004a.6.6 0 0 0 .091.248c.075.114.243.208.521.285.45.125 1.05.21 1.714.269.055-.164.12-.34.195-.531.054-.136.115-.282.18-.43.084-.194.17-.384.246-.534.015-.03.028-.056.039-.077l.008-.014.002-.004A.6.6 0 0 0 6.9.596c-.075-.114-.243-.208-.521-.285-.45-.125-1.05-.21-1.714-.269a4.8 4.8 0 0 0-.195.531c-.054.136-.115.282-.18.43-.084.194-.17.384-.246.534a2.2 2.2 0 0 0-.039.077l-.008.014a.04.04 0 0 0-.002.004ZM7.4.8l-.003.004-.014.019a4 4 0 0 0-.204.31 2 2 0 0 0-.141.267c-.026.06-.034.092-.037.103v.004a.6.6 0 0 0 .091.248c.075.114.243.208.521.285.45.125 1.05.21 1.714.269.055-.164.12-.34.195-.531.054-.136.115-.282.18-.43.084-.194.17-.384.246-.534.015-.03.028-.056.039-.077l.008-.014.002-.004A.6.6 0 0 0 9.9.596c-.075-.114-.243-.208-.521-.285-.45-.125-1.05-.21-1.714-.269a4.8 4.8 0 0 0-.195.531c-.054.136-.115.282-.18.43-.084.194-.17.384-.246.534a2.2 2.2 0 0 0-.039.077l-.008.014a.04.04 0 0 0-.002.004ZM10.4.8l-.003.004-.014.019a4 4 0 0 0-.204.31 2 2 0 0 0-.141.267c-.026.06-.034.092-.037.103v.004a.6.6 0 0 0 .091.248c.075.114.243.208.521.285.45.125 1.05.21 1.714.269.055-.164.12-.34.195-.531.054-.136.115-.282.18-.43.084-.194.17-.384.246-.534.015-.03.028-.056.039-.077l.008-.014.002-.004A.6.6 0 0 0 12.9.596c-.075-.114-.243-.208-.521-.285-.45-.125-1.05-.21-1.714-.269a4.8 4.8 0 0 0-.195.531c-.054.136-.115.282-.18.43-.084.194-.17.384-.246.534a2.2 2.2 0 0 0-.039.077l-.008.014a.04.04 0 0 0-.002.004Z"/>
					</svg>
				</div>
				<h3 class="fw-bold philips-text mb-2">Comedor</h3>
				<p class="text-muted small mb-0">Gestión de salida e ingreso durante horario de almuerzo</p>
			</div>
			<button class="btn btn-primary fw-bold w-100 rounded-pill shadow-sm">Ingresar</button>
		</div>
	</div>

	<div class="col-md-5 col-lg-4 mb-4">
		<div class="card glass-card h-100 p-5 text-center transition-hover" style="cursor: pointer;" onclick={() => window.location.href='/PP'}>
			<div class="mb-4">
				<div class="bg-primary-subtle text-primary rounded-circle d-inline-flex p-3 mb-3 shadow-sm">
					<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" class="bi bi-briefcase-fill" viewBox="0 0 16 16">
						<path d="M6.5 1A1.5 1.5 0 0 0 5 2.5V3H1.5A1.5 1.5 0 0 0 0 4.5v1.384l7.614 2.03a1.5 1.5 0 0 0 .772 0L16 5.884V4.5A1.5 1.5 0 0 0 14.5 3H11v-.5A1.5 1.5 0 0 0 9.5 1h-3zm0 1h3a.5.5 0 0 1 .5.5V3H6v-.5a.5.5 0 0 1 .5-.5z"/>
						<path d="M0 12.5A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5V6.85L8.129 8.947a.5.5 0 0 1-.258 0L0 6.85v5.65z"/>
					</svg>
				</div>
				<h3 class="fw-bold philips-text mb-2">Pasantías (PP)</h3>
				<p class="text-muted small mb-0">Registro de asistencia a Prácticas Profesionalizantes</p>
			</div>
			<button class="btn btn-primary fw-bold w-100 rounded-pill shadow-sm">Ingresar</button>
		</div>
	</div>
</div>

<style>
	.transition-hover {
		transition: all 0.3s ease;
	}
	.transition-hover:hover {
		transform: translateY(-8px);
		box-shadow: 0 12px 40px rgba(11, 94, 170, 0.15) !important;
		border-color: rgba(11, 94, 170, 0.3);
	}
</style>
