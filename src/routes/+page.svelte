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

	<div class="col-md-5 col-lg-4 mb-4">
		<div class="card glass-card h-100 p-5 text-center transition-hover" style="cursor: pointer;" onclick={() => window.location.href='/recreativo'}>
			<div class="mb-4">
				<div class="bg-primary-subtle text-primary rounded-circle d-inline-flex p-3 mb-3 shadow-sm">
					<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" class="bi bi-controller" viewBox="0 0 16 16">
					  <path d="M11.5 6.027a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0zm-1.5 1.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm2.5-.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0zm-1.5 1.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm-6.5-3h1v1h1v1h-1v1h-1v-1h-1v-1h1v-1z"/>
					  <path d="M3.051 3.26a.5.5 0 0 1 .354-.613l1.932-.518a.5.5 0 0 1 .62.39c.655-.079 1.35-.117 2.043-.117.72 0 1.443.041 2.12.126a.5.5 0 0 1 .622-.399l1.932.518a.5.5 0 0 1 .306.729c.14.09.266.19.373.297.408.408.78 1.05 1.068 1.777.294.739.468 1.513.538 2.222.067.689-.01 1.488-.309 2.115-.226.476-.582.88-1.042 1.15-.36.213-.748.336-1.125.409a6.223 6.223 0 0 1-.954.103c-.22.007-.442.012-.676.012h-3.32c-.22 0-.441-.005-.66-.012a6.383 6.383 0 0 1-.955-.103 3.655 3.655 0 0 1-1.124-.41c-.461-.27-.817-.674-1.043-1.15-.298-.627-.375-1.426-.309-2.115.07-.71.244-1.483.538-2.222.288-.727.66-1.37 1.068-1.777a2.6 2.6 0 0 1 .374-.297zm4.949-1.018a14.707 14.707 0 0 0-3.792.428l-1.314.352c-.655.228-1.455.77-1.921 1.94-.403 1.015-.558 1.834-.633 2.597-.063.633.024 1.25.176 1.57.172.361.427.618.665.758.261.153.565.25.865.309.288.057.6.096.903.119.26.02.525.029.79.034h3.63c.266-.005.53-.014.791-.034.303-.023.614-.062.902-.12.3-.058.604-.155.865-.308.238-.14.493-.397.665-.758.152-.32.239-.937.176-1.57-.075-.763-.23-1.582-.633-2.597-.466-1.17-1.266-1.712-1.92-1.94l-1.315-.352a14.707 14.707 0 0 0-3.792-.428z"/>
					</svg>
				</div>
				<h3 class="fw-bold philips-text mb-2">Recreativo</h3>
				<p class="text-muted small mb-0">Gestión de préstamos de paletas, pelotas, etc.</p>
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
