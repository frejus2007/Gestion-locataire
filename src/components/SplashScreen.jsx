import { useState, useEffect } from "react";
import { Building2 } from "lucide-react";

export default function SplashScreen({ onFinish }) {
  const [phase, setPhase] = useState("logo"); // logo → tagline → fadeout

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("tagline"), 900);
    const t2 = setTimeout(() => setPhase("fadeout"), 1800);
    const t3 = setTimeout(() => onFinish(), 2400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onFinish]);

  return (
    <div className={`splash-screen ${phase === "fadeout" ? "splash-fadeout" : ""}`}>
      <div className={`splash-logo ${phase !== "logo" ? "splash-logo-animated" : ""}`}>
        <div className="splash-logo-icon">
          <Building2 size={48} />
        </div>
        <div className="splash-logo-text">Gestion Locataires</div>
        <div className={`splash-tagline ${phase !== "logo" ? "splash-tagline-visible" : ""}`}>
          Quittances · Suivi des comptes · Espace mobile
        </div>
      </div>
      <div className={`splash-loader ${phase !== "logo" ? "splash-loader-visible" : ""}`}>
        <div className="splash-loader-bar" />
      </div>
    </div>
  );
}
