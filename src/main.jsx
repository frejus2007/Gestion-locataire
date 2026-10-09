import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles-cag.css'
import App from './App.jsx'
import { demarrerEcouteInstallation } from './components/BoutonInstaller.jsx'

// L'écoute de l'invite d'installation doit démarrer avant le premier rendu :
// le navigateur émet `beforeinstallprompt` une seule fois, bien avant que
// l'utilisateur ne soit connecté et que le Layout n'existe.
demarrerEcouteInstallation()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker : sans lui l'application n'est pas installable.
// En développement, Vite sert les modules à la demande ; un cache mis en place
// ici casserait le rechargement à chaud. On n'enregistre donc le service worker
// qu'en production.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((erreur) => {
      console.warn("Service worker non enregistré :", erreur)
    })
  })
}