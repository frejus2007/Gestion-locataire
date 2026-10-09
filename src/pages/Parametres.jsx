// Paramètres du propriétaire : identité, signature, numéros de réception
// et mot de passe. Tout ce qui est saisi ici est repris en tête des quittances.

import { useState, useRef } from "react";
import { Users, Landmark, Trash2, Plus, Check, ShieldCheck } from "lucide-react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { Card, Field, TextInput } from "../components/ui";

const RESEAUX = [
  "MTN MoMo",
  "Moov Money",
  "Celtis",
  "Wave",
  "Orange Money",
  "Virement bancaire",
  "Chèque",
  "Autre",
];

function ligneVide() {
  return { reseau: "MTN MoMo", numero: "" };
}

export default function Parametres() {
  const { proprietaire, saveProprietaire } = useApp();
  const { addToast } = useToast();
  const { user, changePassword } = useAuth();
  const fichierRef = useRef(null);

  const [identite, setIdentite] = useState({
    nom: proprietaire?.nom || "",
    prenoms: proprietaire?.prenoms || "",
    adresse: proprietaire?.adresse || "",
    ville: proprietaire?.ville || "",
    telephone: proprietaire?.telephone || "",
    ifu: proprietaire?.ifu || "",
  });
  const [reception, setReception] = useState(() => {
    const existant = Array.isArray(proprietaire?.reception) ? proprietaire.reception : [];
    return existant.length ? existant : [ligneVide()];
  });
  const [motsDePasse, setMotsDePasse] = useState({ actuel: "", nouveau: "", confirmation: "" });

  const maj = (champ) => (e) => setIdentite((v) => ({ ...v, [champ]: e.target.value }));

  const enregistrerIdentite = async (e) => {
    e.preventDefault();
    saveProprietaire(identite);
    addToast("Informations du propriétaire enregistrées", "success");
  };

  const majLigne = (index, champ, valeur) => {
    setReception((lignes) => lignes.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l)));
  };

  const ajouterLigne = () => setReception((lignes) => [...lignes, ligneVide()]);

  const retirerLigne = (index) =>
    setReception((lignes) => (lignes.length > 1 ? lignes.filter((_, i) => i !== index) : lignes));

  const enregistrerReception = (e) => {
    e.preventDefault();
    // Les lignes laissées vides sont écartées plutôt que conservées.
    const propre = reception.filter((l) => (l.numero || "").trim() !== "");
    saveProprietaire({ reception: propre });
    setReception(propre.length ? propre : [ligneVide()]);
    addToast(
      propre.length
        ? `${propre.length} numéro${propre.length > 1 ? "s" : ""} enregistré${propre.length > 1 ? "s" : ""}`
        : "Aucun numéro enregistré",
      "success"
    );
  };

  const choisirSignature = (e) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    const lecteur = new FileReader();
    lecteur.onload = () => {
      saveProprietaire({ signatureUrl: lecteur.result });
      addToast("Signature enregistrée", "success");
    };
    lecteur.readAsDataURL(fichier);
  };

  const retirerSignature = () => {
    saveProprietaire({ signatureUrl: null });
    addToast("Signature retirée", "info");
    if (fichierRef.current) fichierRef.current.value = "";
  };

  const changerMotDePasse = async (e) => {
    e.preventDefault();
    if (motsDePasse.nouveau !== motsDePasse.confirmation) {
      addToast("La confirmation ne correspond pas", "error");
      return;
    }
    if (motsDePasse.nouveau.length < 4) {
      addToast("Le mot de passe doit contenir au moins 4 caractères", "error");
      return;
    }
    const res = await changePassword(motsDePasse.actuel, motsDePasse.nouveau);
    if (res?.ok) {
      setMotsDePasse({ actuel: "", nouveau: "", confirmation: "" });
      addToast("Mot de passe modifié", "success");
    } else {
      addToast(res?.error || "Mot de passe actuel incorrect", "error");
    }
  };

  return (
    <div>
      <header className="cag-page-head">
        <div>
          <h1>Paramètres</h1>
          <p>Informations du propriétaire et mot de passe</p>
        </div>
      </header>

      <Card
        title={
          <>
            <Users size={17} /> Informations du propriétaire
          </>
        }
        className="cag-card"
      >
        <p className="text-muted" style={{ margin: "0 0 1rem", fontSize: "0.84rem" }}>
          Ces informations figurent sur chaque quittance et chaque compte.
        </p>
        <form onSubmit={enregistrerIdentite}>
          <div className="grid grid-2">
            <Field label="Nom">
              <TextInput value={identite.nom} onChange={maj("nom")} />
            </Field>
            <Field label="Prénom(s)">
              <TextInput value={identite.prenoms} onChange={maj("prenoms")} />
            </Field>
            <Field label="Adresse">
              <TextInput value={identite.adresse} onChange={maj("adresse")} />
            </Field>
            <Field label="Ville">
              <TextInput value={identite.ville} onChange={maj("ville")} />
            </Field>
            <Field label="Téléphone">
              <TextInput value={identite.telephone} onChange={maj("telephone")} />
            </Field>
            <Field label="IFU" hint="Bénin, pour la quittance">
              <TextInput value={identite.ifu} onChange={maj("ifu")} />
            </Field>
          </div>
          <div style={{ marginTop: "0.5rem" }}>
            <button type="submit" className="btn btn-primary">
              <Check size={15} /> Enregistrer
            </button>
          </div>
        </form>
      </Card>

      <Card
        className="cag-card"
        title={
          <>
            <Landmark size={17} /> Numéros de réception des loyers
          </>
        }
      >
        <p className="text-muted" style={{ margin: "0 0 0.9rem", fontSize: "0.84rem" }}>
          Ces numéros sont rappelés au locataire sur sa quittance, pour qu'il sache où
          envoyer son loyer. Ajoutez-en autant que nécessaire, ou retirez ceux dont vous
          ne servez plus.
        </p>
        <form onSubmit={enregistrerReception}>
          <div className="cag-reception">
            {reception.map((ligne, index) => (
              <div className="cag-reception-row" key={index}>
                <select
                  className="select"
                  value={ligne.reseau || ""}
                  onChange={(e) => majLigne(index, "reseau", e.target.value)}
                  aria-label="Réseau"
                >
                  {RESEAUX.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <TextInput
                  value={ligne.numero || ""}
                  onChange={(e) => majLigne(index, "numero", e.target.value)}
                  placeholder="Numéro (ex : +229 97 12 34 56)"
                  inputMode="tel"
                  aria-label={`Numéro ${ligne.reseau || ""}`}
                />
                <button
                  type="button"
                  className="btn btn-danger btn-small"
                  onClick={() => retirerLigne(index)}
                  disabled={reception.length <= 1}
                  aria-label="Retirer ce numéro"
                  title="Retirer ce numéro"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-small" onClick={ajouterLigne}>
            <Plus size={14} /> Ajouter un numéro
          </button>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit" className="btn btn-primary">
              <Check size={15} /> Enregistrer les numéros
            </button>
          </div>
        </form>
      </Card>

      <Card className="cag-card" title={<>Signature</>}>
        <p className="text-muted" style={{ margin: "0 0 0.9rem", fontSize: "0.84rem" }}>
          Votre signature est apposée au bas de chaque quittance, dans le cadre prévu par
          le format officiel.
        </p>
        <input
          ref={fichierRef}
          type="file"
          accept="image/*"
          onChange={choisirSignature}
          className="input"
          style={{ maxWidth: "320px" }}
          aria-label="Choisir une image de signature"
        />
        {/* Sans signature importée, c'est celle embarquée dans l'application
            qui s'imprime : il faut la montrer, sinon l'écran affirme le
            contraire de ce que produit la quittance. */}
        <div style={{ marginTop: "0.9rem" }}>
          <img
            src={proprietaire?.signatureUrl || "/signature.png"}
            alt="Signature du propriétaire"
            style={{
              maxHeight: "86px",
              padding: "0.4rem",
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
            }}
          />
          <div style={{ marginTop: "0.5rem", fontSize: "0.84rem", color: "var(--text-muted)" }}>
            {proprietaire?.signatureUrl
              ? "Signature importée — remplacera la signature par défaut sur toutes les quittances."
              : "Signature par défaut, apposée sur toutes les quittances. Importez une image pour la remplacer."}
          </div>
          {proprietaire?.signatureUrl ? (
            <div style={{ marginTop: "0.5rem" }}>
              <button type="button" className="btn btn-ghost btn-small" onClick={retirerSignature}>
                <Trash2 size={14} /> Retirer la signature
              </button>
            </div>
          ) : null}
        </div>
      </Card>

      <Card title={<><ShieldCheck size={17} /> Mot de passe administrateur</>}>
        <p className="text-muted" style={{ margin: "0 0 0.9rem", fontSize: "0.84rem" }}>
          Connecté en tant que <strong>{user?.nom || "admin"}</strong>.
        </p>
        <form onSubmit={changerMotDePasse}>
          <div className="grid grid-3">
            <Field label="Mot de passe actuel">
              <TextInput
                type="password"
                value={motsDePasse.actuel}
                onChange={(e) => setMotsDePasse((v) => ({ ...v, actuel: e.target.value }))}
                autoComplete="current-password"
              />
            </Field>
            <Field label="Nouveau mot de passe">
              <TextInput
                type="password"
                value={motsDePasse.nouveau}
                onChange={(e) => setMotsDePasse((v) => ({ ...v, nouveau: e.target.value }))}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirmation">
              <TextInput
                type="password"
                value={motsDePasse.confirmation}
                onChange={(e) => setMotsDePasse((v) => ({ ...v, confirmation: e.target.value }))}
                autoComplete="new-password"
              />
            </Field>
          </div>
          <div style={{ marginTop: "0.5rem" }}>
            <button type="submit" className="btn btn-primary">
              <Check size={15} /> Changer le mot de passe
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}