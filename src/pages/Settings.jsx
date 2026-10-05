import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { Save, Building2 } from "lucide-react";

export default function Settings() {
  const { owner } = useApp();
  const { addToast } = useToast();
  const [form, setForm] = useState({
    nom: owner?.nom || "",
    prenoms: owner?.prenoms || "",
    telephone: owner?.telephone || "",
    adresse: owner?.adresse || "",
    ifu: owner?.ifu || "",
  });
  const [errors, setErrors] = useState({});

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const errs = {};
    if (!form.nom.trim()) errs.nom = "Le nom est requis";
    if (!form.prenoms.trim()) errs.prenoms = "Le prénom est requis";
    if (!form.telephone.trim()) errs.telephone = "Le téléphone est requis";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    // TODO: sauvegarder via l'API quand le backend sera disponible
    addToast("Paramètres enregistrés");
  };

  return (
    <div>
      <h1 className="page-title">Paramètres</h1>
      <p className="text-muted" style={{ marginBottom: "1.5rem" }}>
        Informations du propriétaire affichées sur les quittances
      </p>

      <form className="card form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label>Nom *</label>
            <input className="input" value={form.nom} onChange={set("nom")} />
            {errors.nom && <span className="error">{errors.nom}</span>}
          </div>
          <div className="form-group">
            <label>Prénoms *</label>
            <input className="input" value={form.prenoms} onChange={set("prenoms")} />
            {errors.prenoms && <span className="error">{errors.prenoms}</span>}
          </div>
          <div className="form-group">
            <label>Téléphone *</label>
            <input className="input" value={form.telephone} onChange={set("telephone")} />
            {errors.telephone && <span className="error">{errors.telephone}</span>}
          </div>
          <div className="form-group">
            <label>Adresse</label>
            <input className="input" value={form.adresse} onChange={set("adresse")} />
          </div>
          <div className="form-group">
            <label>IFU</label>
            <input className="input" value={form.ifu} onChange={set("ifu")} />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            <Save size={16} /> Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}
