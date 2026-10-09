import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Port fixe : les captures et les tests s'appuient sur 5199, un port
    // choisi au hasard à chaque redémarrage les rendrait caducs.
    port: 5199,
    strictPort: true,
    // `host: true` écoute sur toutes les interfaces, pas seulement la boucle
    // locale : sans cela le téléphone ne peut pas ouvrir l'application.
    // L'accès réseau reste protégé par la connexion au compte.
    host: true,
  },
  preview: {
    port: 5199,
    strictPort: true,
    host: true,
  },
})