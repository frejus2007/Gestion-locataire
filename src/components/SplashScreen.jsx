// Écran de démarrage haut de gamme avec animation fluide du logo CAG.
// Apparaît au chargement initial, à la connexion ou au rafraîchissement.

import { useState, useEffect } from "react";

export default function SplashScreen({ onFinish, duration = 3000 }) {
  const [fading, setFading] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    // Transition d'entrée fluide dès le premier cycle d'affichage
    const enterTimer = setTimeout(() => setEntered(true), 20);

    const fadeTimer = setTimeout(() => {
      setFading(true);
    }, duration);

    const removeTimer = setTimeout(() => {
      if (onFinish) onFinish();
    }, duration + 400);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [duration, onFinish]);

  return (
    <div
      className={`splash-overlay ${entered ? "splash-entered" : ""} ${fading ? "splash-fading" : ""}`}
      style={{ "--splash-duration": `${duration}ms` }}
      role="status"
      aria-label="Chargement de l'application"
    >
      {/* Halo lumineux d'ambiance en arrière-plan */}
      <div className="splash-ambient-glow" />

      <div className="splash-card">
        {/* Capsule élégante respectant le ratio naturel du logo avec éclat de lumière */}
        <div className="splash-logo-capsule">
          <img
            src="/logo-cag.png"
            alt="Cabinet Albert & Gilles"
            className="splash-logo-image"
          />
          <div className="splash-sheen" />
        </div>

        {/* Typographie institutionnelle sobre et raffinée */}
        <div className="splash-meta">
          <span className="splash-tag">Cabinet Albert & Gilles</span>
          <h1 className="splash-heading">Gestion Locative & Immobilière</h1>
        </div>

        {/* Ligne indicatrice ultra-fine avec dégradé lumineux */}
        <div className="splash-loader-track">
          <div className="splash-loader-bar" />
        </div>
      </div>
    </div>
  );
}
