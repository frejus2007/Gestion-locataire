import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { Save, X } from "lucide-react";

export default function PaymentForm() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const { tenants, addPayment } = useApp();
  const { addToast } = useToast();
  const tenant = tenants.find((t) => t.id === Number(tenantId));

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    periode: "",
    montantDu: tenant ? tenant.loyerMensuel : "",
    montantPaye: "",
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (tenant) setForm((f) => ({ ...f, montantDu: tenant.loyerMensuel }));
  }, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tenant) {
    return (
      <div className="card">
        <p className="empty-state">Locataire introuvable.</p>
        <button className="btn btn-primary" onClick={() => navigate("/locataires")}>Retour</button>
      </div>
    );
  }

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const errs = {};
    if (!form.date) errs.date = "La date est requise";
    if (!form.periode.trim()) errs.periode = "La période est requise";
    if (!form.montantDu || Number(form.montantDu) <= 0) errs.montantDu = "Montant invalide";
    if (!form.montantPaye || Number(form.montantPaye) <= 0) errs.montantPaye = "Montant invalide";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    const payment = await addPayment({
      tenantId: tenant.id,
      date: form.date,
      periode: form.periode,
      montantDu: Number(form.montantDu),
      montantPaye: Number(form.montantPaye),
    });
    addToast("Paiement enregistré — quittance générée");
    navigate(`/quittances/${payment.id}`);
  };

  return (
    <div>
      <h1 className="page-title">Enregistrer un paiement</h1>
      <p className="text-muted" style={{ marginBottom: "1.5rem" }}>
        Pour <strong>{tenant.nom} {tenant.prenoms}</strong> — quittance générée automatiquement après validation.
      </p>

      <form className="card form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label>Date de paiement *</label>
            <input type="date" className="input" value={form.date} onChange={set("date")} />
            {errors.date && <span className="error">{errors.date}</span>}
          </div>
          <div className="form-group">
            <label>Période du loyer *</label>
            <input
              className="input"
              value={form.periode}
              onChange={set("periode")}
              placeholder="Ex : Juillet 2026"
            />
            {errors.periode && <span className="error">{errors.periode}</span>}
          </div>
          <div className="form-group">
            <label>Loyer à payer (FCFA) *</label>
            <input type="number" min="0" className="input" value={form.montantDu} onChange={set("montantDu")} />
            {errors.montantDu && <span className="error">{errors.montantDu}</span>}
          </div>
          <div className="form-group">
            <label>Montant payé (FCFA) *</label>
            <input type="number" min="0" className="input" value={form.montantPaye} onChange={set("montantPaye")} />
            {errors.montantPaye && <span className="error">{errors.montantPaye}</span>}
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
            <X size={16} /> Annuler
          </button>
          <button type="submit" className="btn btn-primary">
            <Save size={16} /> Valider et générer la quittance
          </button>
        </div>
      </form>
    </div>
  );
}
