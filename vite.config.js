import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// La cámara (escáner de QR) exige una conexión segura. localhost ya cuenta como segura; para
// probar desde el celular en la red local (npm run dev:host) se levanta con HTTPS.
const enRed = process.argv.includes('--host');

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), ...(enRed ? [basicSsl()] : [])]
});
