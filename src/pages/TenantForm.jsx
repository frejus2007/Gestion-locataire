import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { Save, X } from "lucide-react";

const emptyForm = {
  nom: "",
  prenoms: "",
  telephone: "",
  ifu: "",
  pieceNumero: "",
  pieceNature: "CNI",
  dateEntree: "",
  dateSortie: "",
  loyerMensuel: "",
  codeAcces: "",
};

export default function TenantForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { addTenant, editTenant, tenants } = useApp();
  const { addToast } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isEdit) {
      const t = tenants.find((t) => t.id === Number(id));
      if (t) setForm({ ...t, loyerMensuel: String(t.loyerMensuel) });
    }
  }, [id, isEdit, tenants]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const errs = {};
    if (!form.nom.trim()) errs.nom = "Le nom est requis";
    if (!form.prenoms.trim()) errs.prenoms = "Le prénom est requis";
    if (!form.telephone.trim()) errs.telephone = "Le téléphone est requis";
    if (!form.dateEntree) errs.dateEntree = "La date d'entrée est requise";
    if (!form.loyerMensuel || Number(form.loyerMensuel) <= 0)
      errs.loyerMensuel = "Le loyer doit être supérieur à 0";
    if (!form.codeAcces || !/^\d{6}$/.test(form.codeAcces))
      errs.codeAcces = "Le code d'accès doit contenir exactement 6 chiffres";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    const data = { ...form, loyerMensuel: Number(form.loyerMensuel) };
    if (isEdit) {
      await editTenant(Number(id), data);
      addToast("Locataire modifié avec succès");
    } else {
      await addTenant(data);
      addToast("Locataire créé avec succès");
    }
    navigate("/locataires");
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{isEdit ? "Modifier le locataire" : "Nouveau locataire"}</h1>
      </div>

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
            <input className="input" value={form.telephone} onChange={set("telephone")} placeholder="+229 …" />
            {errors.telephone && <span className="error">{errors.telephone}</span>}
          </div>
          <div className="form-group">
            <label>IFU</label>
            <input className="input" value={form.ifu} onChange={set("ifu")} />
          </div>
          <div className="form-group">
            <label>Numéro de pièce d'identité</label>
            <input className="input" value={form.pieceNumero} onChange={set("pieceNumero")} />
          </div>
          <div className="form-group">
            <label>Nature de la pièce</label>
            <select className="input" value={form.pieceNature} onChange={set("pieceNature")}>
              <option value="CNI">CNI</option>
              <option value="Passeport">Passeport</option>
              <option value="Permis">Permis de conduire</option>
              <option value="Autre">Autre</option>
            </select>
          </div>
          <div className="form-group">
            <label>Date d'entrée *</label>
            <input type="date" className="input" value={form.dateEntree} onChange={set("dateEntree")} />
            {errors.dateEntree && <span className="error">{errors.dateEntree}</span>}
          </div>
          <div className="form-group">
            <label>Date de sortie</label>
            <input type="date" className="input" value={form.dateSortie} onChange={set("dateSortie")} />
          </div>
          <div className="form-group">
            <label>Loyer mensuel (FCFA) *</label>
            <input type="number" min="0" className="input" value={form.loyerMensuel} onChange={set("loyerMensuel")} />
            {errors.loyerMensuel && <span className="error">{errors.loyerMensuel}</span>}
          </div>
          <div className="form-group">
            <label>Code d'accès (6 chiffres) *</label>
            <input
              className="input"
              maxLength={6}
              value={form.codeAcces}
              onChange={(e) => setForm((f) => ({ ...f, codeAcces: e.target.value.replace(/\D/g, "") }))}
              placeholder="Ex : 123456"
            />
            {errors.codeAcces && <span className="error">{errors.codeAcces}</span>}
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/locataires")}>
            <X size={16} /> Annuler
          </button>
          <button type="submit" className="btn btn-primary">
            <Save size={16} /> {isEdit ? "Enregistrer" : "Créer le locataire"}
          </button>
        </div>
      </form>
    </div>
  );
}
