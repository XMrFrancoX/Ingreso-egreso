// Instalar la app en el celular (PWA). Chrome y Edge (Android y compu) avisan que se puede con
// el evento `beforeinstallprompt`, que a veces llega antes de que cargue la app: por eso lo
// guarda un script de app.html en `window.__eventoInstalar`. La instalación se dispara desde
// nuestro botón. Safari en iPhone no tiene ese evento: ahí se muestran los pasos para
// "Agregar a inicio" (ver AppInstalable.svelte).
type EventoInstalar = Event & {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

declare global {
	interface Window {
		__eventoInstalar?: EventoInstalar | null;
	}
}

class Instalacion {
	evento = $state<EventoInstalar | null>(null);
	instalada = $state(false);
	esIOS = $state(false);
	mostrarPasosIOS = $state(false);
	#iniciada = false;

	/** Se puede ofrecer instalar: el navegador lo permite, o es un iPhone/iPad que todavía no la tiene. */
	disponible = $derived(!this.instalada && (this.evento !== null || this.esIOS));

	iniciar() {
		if (this.#iniciada || typeof window === 'undefined') return;
		this.#iniciada = true;
		this.instalada =
			matchMedia('(display-mode: standalone)').matches ||
			(navigator as Navigator & { standalone?: boolean }).standalone === true;
		const ua = navigator.userAgent;
		this.esIOS = /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
		this.evento = window.__eventoInstalar ?? null;
		window.addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();
			this.evento = e as EventoInstalar;
		});
		window.addEventListener('appinstalled', () => {
			this.instalada = true;
			this.evento = null;
		});
	}

	/** Abre el diálogo de instalación del navegador (o los pasos en iPhone). true si la instaló. */
	async instalar() {
		if (this.evento) {
			const evento = this.evento;
			this.evento = null; // el navegador no deja usar el mismo evento dos veces
			await evento.prompt();
			const { outcome } = await evento.userChoice;
			return outcome === 'accepted';
		}
		if (this.esIOS) this.mostrarPasosIOS = true;
		return false;
	}
}

export const instalacion = new Instalacion();
