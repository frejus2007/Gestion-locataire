// Ajout et modification d'un locataire.
//
// Un locataire se saisit en une seule fois : son identité, le logement qu'il
// occupe, le loyer et la date d'entrée. Tout ce qui concernait le bail —
// logement, loyer, date — vit dans le même formulaire.
//
// Pourquoi : le logiciel range les loyers et les encaissements sous le bail,
// pas sous le locataire. Exiger une seconde page pour le bail laissait un
// locataire enregistré mais invisible, donc inexistant du point de vue de
// l'utilisateur. Le bail est donc créé dans la foulée, sans lui demander de
// décision à ce sujet.

import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Save, X, Users } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/ToastContext";
import { Card, Field, TextInput, Select, ErrorBanner, EmptyState } from "../../components/ui";

const LOT_NEUF = "__nouveau__";

const VIDE = {
  nom: "",
  prenoms: "",
  telephone: "",
  ifu: "",
  pieceNature: "CNI",
  pieceNumero: "",
  email: "",
  notes: "",
  lotId: "",
  nouveauLot: "",
  loyerMensuel: "",
  dateDebut: new Date().toISOString().slice(0, 10),
};

const NATURES_PIECE = [
  { id: "CNI", label: "Carte nationale d'identité" },
  { id: "Passeport", label: "Passeport" },
  { id: "Attestation", label: "Attestation d'identité" },
  { id: "Permis", label: "Permis de conduire" },
  { id: "Autre", label: "Autre" },
];

export default function LocataireForm() {
  const { id: idRoute } = useParams();
  const navigate = useNavigate();
  const {
    bauxParId,
    baux,
    lots,
    lotsParId,
    immeubles,
    immeublesParId,
    saveLocataire,
    saveBail,
    saveLot,
    genererDepuis,
    bailActifDuLot,
  } = useApp();
  const { addToast } = useToast();

  // Cette route sert à deux usages : édition d'un locataire, et édition d'un
  // bail (depuis la liste, « Éditer » passe par l'identifiant du bail). On
  // résout vers le locataire pour que les deux fonctionnent.
  const bail = idRoute ? bauxParId.get(idRoute) : null;
  const id = bail ? bail.locataireId : idRoute;
  const fiche = useApp().locatairesParId.get(id);
  const bailDuLocataire = id ? baux.find((b) => b.locataireId === id) : null;

  const [form, setForm] = useState(() => ({
    ...VIDE,
    ...(fiche || {}),
    ...(bailDuLocataire
      ? {
          lotId: bailDuLocataire.lotId || "",
          loyerMensuel: String(bailDuLocataire.loyerMensuel || ""),
          dateDebut: bailDuLocataire.dateDebut || VIDE.dateDebut,
        }
      : {}),
  }));
  const [erreurs, setErreurs] = useState({});
  const [erreurGlobale, setErreurGlobale] = useState(null);

  if (id && !fiche) {
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

  // Logements libres : un logement déjà loué n'est pas proposé, sauf s'il s'agit
  // du bail en cours d'édition.
  const lotsLibres = lots.filter(
    (l) => !bailActifDuLot(l.id) || l.id === bailDuLocataire?.lotId
  );

  const lotChoisi = form.lotId && form.lotId !== LOT_NEUF ? lotsParId.get(form.lotId) : null;

  const valider = () => {
    const e = {};
    if (!form.nom.trim()) e.nom = "Le nom est requis";
    if (!form.prenoms.trim()) e.prenoms = "Le prénom est requis";
    if (!form.telephone.trim()) e.telephone = "Le téléphone est requis";
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) e.email = "Adresse électronique invalide";

    if (form.lotId === LOT_NEUF && !form.nouveauLot.trim()) {
      e.nouveauLot = "Indiquez le logement";
    } else if (form.lotId === LOT_NEUF && !form.immeubleId) {
      e.immeubleId = "Choisissez l'immeuble";
    } else if (!form.lotId) {
      e.lotId = "Choisissez le logement";
    }
    if (!(Number(form.loyerMensuel) > 0)) e.loyerMensuel = "Le loyer mensuel est requis";
    if (!form.dateDebut) e.dateDebut = "La date d'entrée est requise";

    setErreurs(e);
    return Object.keys(e).length === 0;
  };

  const enregistrer = async (e) => {
    e.preventDefault();
    setErreurGlobale(null);
    if (!valider()) return;

    const loyer = Number(form.loyerMensuel) || 0;

    try {
      // 1. La fiche du locataire.
      const resLoc = await saveLocataire(
        {
          nom: form.nom.trim().toUpperCase(),
          prenoms: form.prenoms.trim(),
          telephone: form.telephone.trim(),
          ifu: (form.ifu || "").trim(),
          pieceNature: form.pieceNature,
          pieceNumero: (form.pieceNumero || "").trim(),
          email: (form.email || "").trim(),
          notes: (form.notes || "").trim(),
        },
        id || null
      );
      if (!resLoc.ok) throw new Error(resLoc.erreur || "Le locataire n'a pas pu être enregistré");
      const locataireId = id || resLoc.resultat.id;

      // 2. Le logement, s'il n'existe pas encore.
      let lotId = form.lotId;
      if (lotId === LOT_NEUF) {
        const resLot = await saveLot({
          immeubleId: form.immeubleId || lotChoisi?.immeubleId || "",
          designation: form.nouveauLot.trim(),
          loyerReference: loyer,
          statut: "libre",
          notes: "",
        });
        if (!resLot.ok) throw new Error(resLot.erreur || "Le logement n'a pas pu être créé");
        lotId = resLot.resultat.id;
      }

      // 3. Le bail, qui relie le locataire à son logement. Il est créé ici
      //    sans être demandé : c'est lui qui porte le loyer et les encaissements,
      //    donc un locataire sans bail ne peut rien percevoir.
      const donneesBail = {
        lotId,
        locataireId,
        dateDebut: form.dateDebut,
        dateFin: bailDuLocataire?.dateFin || null,
        loyerMensuel: loyer,
        cautionVersee: bailDuLocataire?.cautionVersee ?? 0,
        cautionStatut: bailDuLocataire?.cautionStatut || "non-versee",
        cautionSur: bailDuLocataire?.cautionSur || "",
        fraisDefaut: bailDuLocataire?.fraisDefaut || {
          eau: 0, electricite: 0, ordures: 0, degats: 0, autre1: 0, autre2: 0,
        },
        notes: bailDuLocataire?.notes || "",
      };
      const resBail = await saveBail(donneesBail, bailDuLocataire?.id || null);
      if (!resBail.ok) throw new Error(resBail.erreur || "Le bail n'a pas pu être enregistré");

      // 4. Les loyers dus depuis l'entrée : sans eux, le compte est vide et le
      //    l'écran paraît faux.
      if (!bailDuLocataire) {
        const debut = form.dateDebut.slice(0, 7);
        const resLoyers = await genererDepuis(resBail.resultat.id, debut);
        if (!resLoyers.ok) throw new Error(resLoyers.erreur || "Les loyers n'ont pas pu être préparés");
      }

      addToast(`${form.prenoms.trim()} ${form.nom.trim()} enregistré — loyer ${loyer.toLocaleString("fr-FR")} FCFA`, "success");
      navigate(`/locataires/${resBail.resultat.id}`);
    } catch (erreur) {
      setErreurGlobale(erreur.message || "L'enregistrement a échoué");
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to={id ? `/locataires/${bailDuLocataire?.id || id}` : "/locataires"} className="btn btn-small btn-secondary" style={{ marginBottom: "0.5rem" }}>
            <X size={14} /> Retour
          </Link>
          <h1 className="page-title">{id ? "Modifier le locataire" : "Nouveau locataire"}</h1>
          <p className="page-subtitle">
            {id ? "Son identité, son logement et son loyer." : "Son identité, son logement et son loyer — tout se saisit ici."}
          </p>
        </div>
      </div>

      <ErrorBanner message={erreurGlobale} />

      <form onSubmit={enregistrer}>
        <Card title="Identité">
          <div className="form-grid">
            <Field label="Nom" required error={erreurs.nom}>
              <TextInput value={form.nom} onChange={set("nom")} error={erreurs.nom} placeholder="ADJOVI" />
            </Field>
            <Field label="Prénoms" required error={erreurs.prenoms}>
              <TextInput value={form.prenoms} onChange={set("prenoms")} error={erreurs.prenoms} placeholder="Marie" />
            </Field>
            <Field label="Téléphone" required error={erreurs.telephone}>
              <TextInput value={form.telephone} onChange={set("telephone")} error={erreurs.telephone} placeholder="+229 96 11 22 33" />
            </Field>
            <Field label="IFU" hint="si connu">
              <TextInput value={form.ifu || ""} onChange={set("ifu")} placeholder="202400000001" />
            </Field>
            <Field label="Pièce d'identité">
              <Select value={form.pieceNature || "CNI"} onChange={set("pieceNature")} options={NATURES_PIECE} />
            </Field>
            <Field label="Numéro de la pièce">
              <TextInput value={form.pieceNumero || ""} onChange={set("pieceNumero")} placeholder="CNI0012345" />
            </Field>
            <Field label="Adresse électronique" error={erreurs.email} className="span-2" hint=" facultative">
              <TextInput type="email" value={form.email || ""} onChange={set("email")} error={erreurs.email} placeholder="nom@example.bj" />
            </Field>
          </div>
        </Card>

        <Card title="Logement et loyer">
          <div className="form-grid">
            <Field label="Logement" required error={erreurs.lotId} className="span-2">
              <Select
                value={form.lotId || ""}
                onChange={(e) => {
                  const v = e.target.value;
                  const lot = lotsParId.get(v);
                  setForm((f) => ({
                    ...f,
                    lotId: v,
                    loyerMensuel: lot?.loyerReference ? String(lot.loyerReference) : f.loyerMensuel,
                  }));
                  setErreurs((x) => ({ ...x, lotId: undefined }));
                }}
                options={[
                  { id: "", label: lotsLibres.length ? "Choisissez le logement" : "Aucun logement disponible" },
                  ...lotsLibres.map((l) => ({
                    id: l.id,
                    label: `${immeublesParId.get(l.immeubleId)?.nom || "Immeuble"} — ${l.designation}${
                      l.loyerReference ? ` (${l.loyerReference.toLocaleString("fr-FR")})` : ""
                    }`,
                  })),
                  { id: LOT_NEUF, label: "＋ Nouveau logement" },
                ]}
              />
            </Field>

            {form.lotId === LOT_NEUF ? (
              <>
                <Field label="Immeuble" required error={erreurs.immeubleId} className="span-2">
                  <Select
                    value={form.immeubleId || ""}
                    onChange={set("immeubleId")}
                    options={[
                      { id: "", label: immeubles.length ? "Choisissez l'immeuble" : "Aucun immeuble : créez-le d'abord" },
                      ...immeubles.map((i) => ({ id: i.id, label: i.nom })),
                    ]}
                  />
                </Field>
                <Field label="Désignation du nouveau logement" required error={erreurs.nouveauLot} className="span-2">
                  <TextInput
                    value={form.nouveauLot}
                    onChange={set("nouveauLot")}
                    error={erreurs.nouveauLot}
                    placeholder="Studio 5 — 1er étage gauche"
                  />
                </Field>
              </>
            ) : null}

            <Field label="Loyer mensuel" required error={erreurs.loyerMensuel}>
              <TextInput
                value={form.loyerMensuel}
                onChange={set("loyerMensuel")}
                error={erreurs.loyerMensuel}
                placeholder="60000"
              />
            </Field>

            <Field label="Date d'entrée" required error={erreurs.dateDebut}>
              <TextInput
                type="date"
                value={form.dateDebut}
                onChange={set("dateDebut")}
                error={erreurs.dateDebut}
              />
            </Field>
          </div>
        </Card>

        <div className="form-actions">
          <Link to={id ? `/locataires/${bailDuLocataire?.id || id}` : "/locataires"} className="btn btn-secondary">
            Annuler
          </Link>
          <button type="submit" className="btn btn-primary" disabled={Boolean(erreurGlobale)}>
            <Save size={16} /> {id ? "Enregistrer" : "Enregistrer le locataire"}
          </button>
        </div>
      </form>
    </div>
  );
}