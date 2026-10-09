// Bouton d'installation de l'application.
//
// L'API d'installation est standard mais uneven selon les navigateurs :
//   - Chromium (desktop et Android) déclenchent `beforeinstallprompt`, que
//     l'application doit écouter et garder pour appeler `prompt()` plus tard.
//   - iOS Safari n'expose rien : il faut proposer l'installation manuelle via
//     le menu Partager.
//   - En mode already installed, l'événement n'est jamais émis.
//
// D'où les trois états affichés : proposable, deja-installe, ou iOS.
// L'événement n'apparaît qu'une fois : si l'utilisateur l'a ignoré, on ne
// le redemande pas à chaque visite, le navigateur ne le renverrait pas.

import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";

/**
 * L'invite est mémorisée au niveau du module, et non dans un état React.
 * Deux raisons :
 *   - `beforeinstallprompt` n'est émis qu'une seule fois ; si le composant se
 *     monte après, l'événement est perdu. Or le Layout (donc ce composant)
 *     n'apparaît qu'après la connexion, ce qui arrive souvent trop tard.
 *   - En développement, StrictMode monte et remonte les composants : l'effet
 *     d'écoute serait détendu puis rejoué, et l'invite déjà consommée
 *     disparaîtrait.
 * Le module, lui, survit aux remontages.
 */
let inviteEnAttente = null;
let inviteEcoutee = false;

function ecouterInvite() {
  if (inviteEcoutee || typeof window === "undefined") return;
  inviteEcoutee = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    // On neutralise la bannière du navigateur (l'infobar en bas d'écran) et
    // c'est notre bouton « Installer l'application » qui déclenche l'installation
    // au moment choisi. Ce message d'avertissement de Chrome
    // « Banner not shown: beforeinstallprompt event.preventDefault() called »
    // est donc le comportement attendu, pas une erreur : sans cet appel,
    // l'utilisateur verrait deux invitations concurrentes.
    event.preventDefault();
    inviteEnAttente = event;
    window.dispatchEvent(new Event("cag:invite-recue"));
  });
}

// Posée au chargement du module, pas au montage du composant : ce module
// n'est importé qu'après la connexion (via le Layout), et l'invite est émise
// bien avant. `demarrerEcouteInstallation()` est donc appelé depuis main.jsx.
export function demarrerEcouteInstallation() {
  ecouterInvite();
}

/** iOS : Safari sur iPhone/iPad, qui n'a pas d'installation programmatique. */
function estIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return /iPhone|iPad|iPod/.test(ua) || iPad;
}

/** L'application tourne-t-elle déjà dans une fenêtre installée ? */
function estInstallee() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

/**
 * @param {object} props
 * @param {'nav'|'bouton'|'icone'} props.variante
 *   nav    : lien de navigation, dans le pied du sidebar (par défaut)
 *   bouton : bouton classique, à côté d'une action principale
 *   icone  : icône seule, dans la barre du haut sur mobile
 */
export default function BoutonInstaller({ variante = "nav" }) {
  // Filet de sécurité si le composant est monté sans que main.jsx soit passé.
  ecouterInvite();

  const [, forceRendu] = useState(0);
  const [installee, setInstallee] = useState(estInstallee);
  const [inviteConsommee, setInviteConsommee] = useState(false);
  const [aide, setAide] = useState(false);
  const [surIos] = useState(estIos);
  useEffect(() => {
    ecouterInvite();

    // L'invite a pu arriver avant que ce composant n'existe.
    if (inviteEnAttente) forceRendu((n) => n + 1);

    const surInviteRecue = () => {
      setAide(false);
      forceRendu((n) => n + 1);
    };
    const surAffiche = () => {
      inviteEnAttente = null;
      setInstallee(true);
    };

    window.addEventListener("cag:invite-recue", surInviteRecue);
    window.addEventListener("appinstalled", surAffiche);

    return () => {
      window.removeEventListener("cag:invite-recue", surInviteRecue);
      window.removeEventListener("appinstalled", surAffiche);
    };
  }, []);

  // Une fois installée, le bouton n'a plus lieu d'être.
  if (installee) return null;

  // Invite déjà consommée, variante discrète (sidebar, icône mobile) : le
  // navigateur ne la réémettra pas, on masque alors le lien pour ne pas
  // promettre une installation impossible. Le bouton du tableau de bord, lui,
  // reste visible (c'est une demande explicite de l'utilisateur) : il bascule
  // alors en mode « comment installer manuellement ».
  if (!inviteEnAttente && inviteConsommee && !surIos && variante !== "bouton") return null;

  const installer = async () => {
    // L'invite n'est disponible qu'une fois, et seulement si le navigateur la
    // propose encore. Un clic sans invite ne doit rien casser : on explique
    // comment installer à la main plutôt que de ne rien faire.
    if (!inviteEnAttente) {
      setAide(true);
      return;
    }
    const invite = inviteEnAttente;
    inviteEnAttente = null;
    setInviteConsommee(true);
    forceRendu((n) => n + 1);
    await invite.prompt();
    await invite.userChoice;
    // Après un refus, le navigateur n'émettra plus d'invite : on masque le
    // bouton, faute de quoi il promettrait une installation impossible.
    if (window.matchMedia("(display-mode: standalone)").matches) setInstallee(true);
  };

  // iOS : on ne peut pas déclencher l'installation, on guide l'utilisateur.
  if (surIos) {
    // Pas de place dans la barre du haut : on n'y montre que l'icône.
    if (variante === "icone") return null;
    return (
      <div className={`install-hint ${variante === "bouton" ? "install-hint-inline" : ""}`}>
        <Share size={15} />
        <span>
          Pour installer : touchez <strong>Partager</strong> puis{" "}
          <strong>Sur l'écran d'accueil</strong>.
        </span>
      </div>
    );
  }

  if (variante === "icone") {
    return (
      <button
        type="button"
        className="menu-btn"
        onClick={installer}
        aria-label="Installer l'application"
        title="Installer l'application"
      >
        <Download size={20} />
      </button>
    );
  }

  // Variante « bouton » : à côté d'une action principale (tableau de bord).
  if (variante === "bouton") {
    return (
      <div className="install-bloc">
        <button type="button" className="btn btn-secondary install-btn-inline" onClick={installer}>
          <Download size={16} />
          Installer l'application
        </button>
        {aide && (
          <div className="install-hint install-hint-aide">
            <Download size={15} />
            <span>
              Ce navigateur ne propose pas encore l'installation en un clic. Ouvrez le{" "}
              <strong>menu du navigateur</strong> (⋮) puis choisissez{" "}
              <strong>Installer l'application</strong> ou{" "}
              <strong>Sur l'écran d'accueil</strong>.
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <button type="button" className="nav-link install-btn" onClick={installer}>
      <Download size={18} className="nav-icon" />
      Installer l'application
    </button>
  );
}