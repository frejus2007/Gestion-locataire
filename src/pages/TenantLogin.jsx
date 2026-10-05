import { useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../api/client";
import { useToast } from "../context/ToastContext";
import { Smartphone, LogIn } from "lucide-react";

export default function TenantLogin() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [telephone, setTelephone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const tenant = await api.loginTenant(telephone, code);
    setLoading(false);
    if (tenant) {
      addToast(`Bienvenue ${tenant.prenoms} !`);
      navigate(`/espace-locataire/${tenant.id}`);
    } else {
      setError("Téléphone ou code d'accès incorrect.");
    }
  };

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={handleSubmit}>
        <div className="login-icon">
          <Smartphone size={32} />
        </div>
        <h1 className="login-title">Espace locataire</h1>
        <p className="text-muted">Connectez-vous avec votre téléphone et votre code d'accès à 6 chiffres.</p>

        <div className="form-group" style={{ textAlign: "left" }}>
          <label>Téléphone</label>
          <input
            className="input"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            placeholder="+229 96 00 00 00"
            required
          />
        </div>
        <div className="form-group" style={{ textAlign: "left" }}>
          <label>Code d'accès</label>
          <input
            className="input"
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="••••••"
            required
          />
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          <LogIn size={16} /> {loading ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
