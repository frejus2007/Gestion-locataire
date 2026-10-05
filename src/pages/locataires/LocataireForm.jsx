// Création et modification d'une fiche locataire.

import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Save, X, Users } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/ToastContext";
import { Card, Field, TextInput, Select, ErrorBanner, EmptyState } from "../../components/ui";

const VIDE = {
  nom: "",
  prenoms: "",
  telephone: "",
  ifu: "",
  pieceNature: "CNI",
  pieceNumero: "",
  email: "",
  notes: "",
};

const NATURES_PIECE = [
  { id: "CNI", label: "Carte nationale d'identité" },
  { id: "Passeport", label: "Passeport" },
  { id: "Attestation", label: "Attestation d'identité" },
  { id: "Permis", label: "Permis de conduire" },
  { id: "Autre", label: "Autre" },
];

export default function LocataireForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { locatairesParId, saveLocataire } = useApp();
  const { addToast } = useToast();

  const existant = id ? locatairesParId.get(id) : null;
  const [form, setForm] = useState(() => (existant ? { ...existant } : { ...VIDE }));
  const [erreurs, setErreurs] = useState({});
  const [erreurGlobale, setErreurGlobale] = useState(null);

  if (id && !existant) {
    return (
      <Card>
        <EmptyState
          icon={Users}
          message="Locataire introuvable."
          action={
            <Link to="/locataires" className="btn btn-primary" style={{ marginTop: "0.75rem" }}>
              Retour à la liste
            </Link>
          }
        />
      </Card>
    );
  }

  const set = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }));

  const valider = () => {
    const e = {};
    if (!form.nom.trim()) e.nom = "Le nom est requis";
    if (!form.prenoms.trim()) e.prenoms = "Le prénom est requis";
    if (!form.telephone.trim()) e.telephone = "Le téléphone est requis";
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) e.email = "Adresse électronique invalide";
    setErreurs(e);
    return Object.keys(e).length === 0;
  };

  const enregistrer = (e) => {
    e.preventDefault();
    if (!valider()) return;
    const res = saveLocataire(
      {
        ...form,
        nom: form.nom.trim().toUpperCase(),
        prenoms: form.prenoms.trim(),
        telephone: form.telephone.trim(),
      },
      id || null
    );
    if (!res.ok) {
      setErreurGlobale(res.erreur);
      return;
    }
    addToast(id ? "Fiche mise à jour" : "Locataire créé");
    if (id) {
      navigate(`/locataires/${id}`);
    } else {
      // Un locataire sans bail ne peut rien encaisser : on enchaîne.
      navigate(`/locataires/${res.resultat.id}/bail`);
      addToast("Créez maintenant son bail pour pouvoir encaisser les loyers");
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <Link
            to={id ? `/locataires/${id}` : "/locataires"}
            className="btn btn-small btn-secondary"
            style={{ marginBottom: "0.5rem" }}
          >
            <X size={14} /> Retour
          </Link>
          <h1 className="page-title">{id ? "Modifier le locataire" : "Nouveau locataire"}</h1>
          <p className="page-subtitle">
            {id
              ? "Les informations d'identification du locataire."
              : "Sa fiche d'abord, puis son bail sur un lot."}
          </p>
        </div>
      </div>

      <ErrorBanner message={erreurGlobale} />

      <Card title="Identité">
        <form onSubmit={enregistrer}>
          <div className="form-grid">
            <Field label="Nom" required error={erreurs.nom}>
              <TextInput value={form.nom} onChange={set("nom")} error={erreurs.nom} placeholder="ADJOVI" />
            </Field>

            <Field label="Prénoms" required error={erreurs.prenoms}>
              <TextInput value={form.prenoms} onChange={set("prenoms")} error={erreurs.prenoms} placeholder="Marie" />
            </Field>

            <Field label="Téléphone" required error={erreurs.telephone}>
              <TextInput
                value={form.telephone}
                onChange={set("telephone")}
                error={erreurs.telephone}
                placeholder="+229 96 11 22 33"
              />
            </Field>

            <Field label="IFU" hint="identifiant fiscal unique, si connu">
              <TextInput value={form.ifu || ""} onChange={set("ifu")} placeholder="202400000001" />
            </Field>

            <Field label="Pièce d'identité">
              <Select value={form.pieceNature || "CNI"} onChange={set("pieceNature")} options={NATURES_PIECE} />
            </Field>

            <Field label="Numéro de la pièce">
              <TextInput value={form.pieceNumero || ""} onChange={set("pieceNumero")} placeholder="CNI0012345" />
            </Field>

            <Field label="Adresse électronique" error={erreurs.email} className="span-2" hint=" facultative">
              <TextInput
                type="email"
                value={form.email || ""}
                onChange={set("email")}
                error={erreurs.email}
                placeholder="nom@example.bj"
              />
            </Field>

            <Field label="Notes" className="span-2">
              <textarea
                className="input"
                value={form.notes || ""}
                onChange={set("notes")}
                placeholder="Informations utiles : contacts d'urgence, particularités du dossier…"
              />
            </Field>
          </div>

          <div className="form-actions">
            <Link to={id ? `/locataires/${id}` : "/locataires"} className="btn btn-secondary">
              Annuler
            </Link>
            <button type="submit" className="btn btn-primary">
              <Save size={16} /> {id ? "Enregistrer" : "Créer le locataire"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}