// Enregistrement d'un locataire : une seule fiche, une seule modale.
//
// Le modèle de données sépare le locataire, le lot et le bail ; l'écran les
// réunit pour que le propriétaire n'ait qu'une saisie à faire. Dans l'ordre
// où il les connaît : le logement, l'identité, le bail, la caution, les frais
// habituels.
//
// Le logement accepte aussi un lot créé à la volée : sur le terrain, un
// appartement seloue souvent avant d'avoir été déclaré dans l'immeuble.
//
//   ▸ Cette modale                       src/pages/locataires/EnregistrerLocataire.jsx
//   ▸ Liste des locataires               src/pages/locataires/Locataires.jsx
//   ▸ Bail d'un locataire existant       src/pages/locataires/BailForm.jsx

import { useMemo, useState } from "react";
import { Check, Home, IdCard, FileSignature, KeyRound, Receipt } from "lucide-react";
import { Modal, Field, TextInput, Select, ErrorBanner } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/ToastContext";
import { postesALZero } from "../../data/db";
import { formatMoney, periodeCourante } from "../../utils/format";

const AUJOURDHUI = new Date().toISOString().slice(0, 10);

const PIECES = [
  { id: "CNI", label: "Carte nationale d'identité" },
  { id: "passeport", label: "Passeport" },
  { id: "permis", label: "Permis de conduire" },
  { id: "attestation", label: "Attestation / pièce administrative" },
];

const CAUTIONS = [
  { id: "non-versee", label: "Non versée" },
  { id: "deposee", label: "Déposée — conservée" },
  { id: "retenue", label: "Retenue (dommages, impayés)" },
];

const CAUTIONS_SUR = [
  { id: "", label: "— non précisé —" },
  { id: "Loyer", label: "Loyer" },
  { id: "Eau", label: "Eau" },
  { id: "Électricité", label: "Électricité" },
  { id: "Loyer + eau", label: "Loyer et eau" },
  { id: "Loyer + électricité", label: "Loyer et électricité" },
  { id: "Loyer + eau + électricité", label: "Loyer, eau et électricité" },
  { id: "Autre", label: "Autre" },
];

const LOT_NEUF = "nouveau";

/** Frais mensuels par défaut : ce qui sera pré-rempli à chaque encaissement. */
function fraisVierges() {
  return { ...postesALZero(), libelle1: "Autre 1", libelle2: "Autre 2" };
}

export default function EnregistrerLocataire({ onClose, onEnregistre }) {
  const {
    immeubles,
    lots,
    lotsParId,
    bailActifDuLot,
    saveLocataire,
    saveLot,
    saveBail,
    genererDepuis,
  } = useApp();
  const { addToast } = useToast();

  const [form, setForm] = useState({
    // Logement
    immeubleId: immeubles[0]?.id || "",
    lotId: "",
    nouveauLot: "",
    // Identité
    nom: "",
    prenoms: "",
    telephone: "",
    ifu: "",
    pieceType: "CNI",
    pieceNumero: "",
    // Bail
    dateDebut: AUJOURDHUI,
    dateFin: "",
    loyerMensuel: "",
    // Caution
    cautionVersee: 0,
    cautionStatut: "non-versee",
    cautionSur: "",
    // Frais
    fraisDefaut: fraisVierges(),
    notes: "",
  });
  const [erreurs, setErreurs] = useState({});
  const [erreurGlobale, setErreurGlobale] = useState(null);

  const maj = (cle, valeur) => {
    setForm((f) => ({ ...f, [cle]: valeur }));
    setErreurs((e) => ({ ...e, [cle]: undefined }));
  };

  const majFrais = (cle, valeur) =>
    setForm((f) => ({ ...f, fraisDefaut: { ...f.fraisDefaut, [cle]: valeur } }));

  // Lots libres de l'immeuble choisi : c'est là que le locataire va habiter.
  const lotsLibres = useMemo(
    () => lots.filter((l) => l.immeubleId === form.immeubleId && !bailActifDuLot(l.id)),
    [lots, form.immeubleId, bailActifDuLot]
  );

  // Le loyer de référence du lot proposé sert de valeur par défaut.
  const lotChoisi = form.lotId === LOT_NEUF ? null : lotsParId.get(form.lotId);
  const loyerParDefaut =
    lotChoisi?.loyerReference || lotsLibres[0]?.loyerReference || "";

  const enregistrer = async () => {
    const e = {};
    if (!form.immeubleId) e.immeubleId = "Choisissez l'immeuble";
    if (form.lotId !== LOT_NEUF && !form.lotId) e.lotId = "Choisissez le logement";
    if (form.lotId === LOT_NEUF && !form.nouveauLot.trim()) {
      e.nouveauLot = "Indiquez le numéro ou le nom du logement";
    }
    if (!form.nom.trim()) e.nom = "Le nom est requis";
    if (!form.prenoms.trim()) e.prenoms = "Les prénoms sont requis";
    if (!form.telephone.trim()) e.telephone = "Le téléphone est requis";
    if (!form.dateDebut) e.dateDebut = "La date d'entrée est requise";
    if (form.dateFin && form.dateFin < form.dateDebut) {
      e.dateFin = "La sortie doit être postérieure à l'entrée";
    }
    const loyer = Number(form.loyerMensuel) || 0;
    if (loyer <= 0) e.loyerMensuel = "Le loyer mensuel est requis";

    if (Object.keys(e).some((k) => e[k])) {
      setErreurs(e);
      return;
    }

    try {
      // Chaque écriture passe par `run`, qui renvoie { ok, resultat } ou
      // { ok: false, erreur } : l'échec est remonté, pas silencié.
      const creerLot = () =>
        saveLot({
          immeubleId: form.immeubleId,
          designation: form.nouveauLot.trim(),
          loyerReference: loyer,
          statut: "libre",
          notes: "",
        });
      const creerLocataire = () =>
        saveLocataire({
          nom: form.nom.trim(),
          prenoms: form.prenoms.trim(),
          telephone: form.telephone.trim(),
          ifu: form.ifu.trim(),
          pieceType: form.pieceType,
          pieceNumero: form.pieceNumero.trim(),
          actif: true,
          notes: form.notes.trim(),
        });
      const creerBail = (lotId, locataireId) =>
        saveBail({
          lotId,
          locataireId,
          dateDebut: form.dateDebut,
          dateFin: form.dateFin || null,
          loyerMensuel: loyer,
          cautionVersee: Number(form.cautionVersee) || 0,
          cautionStatut: form.cautionStatut,
          cautionSur: form.cautionSur || "",
          fraisDefaut: form.fraisDefaut,
          notes: "",
        });

      // 1. Le logement, si le propriétaire décrit un appartement inconnu.
      let lotId = form.lotId;
      if (lotId === LOT_NEUF) {
        const r = creerLot();
        if (!r?.ok || !r.resultat?.id) throw new Error(r?.erreur || "Le logement n'a pas pu être créé");
        lotId = r.resultat.id;
      }

      // 2. Le locataire.
      const rLoc = creerLocataire();
      const locataireId = rLoc?.resultat?.id;
      if (!rLoc?.ok || !locataireId) {
        throw new Error(rLoc?.erreur || "Le locataire n'a pas pu être créé");
      }

      // 3. Le bail, qui relie le locataire au logement.
      const rBail = creerBail(lotId, locataireId);
      const bailId = rBail?.resultat?.id;
      if (!rBail?.ok || !bailId) throw new Error(rBail?.erreur || "Le bail n'a pas pu être créé");

      // 4. Les loyers dus depuis l'entrée : sans eux, l'historique est vide.
      const debut = form.dateDebut.slice(0, 7);
      const fin = form.dateFin ? form.dateFin.slice(0, 7) : periodeCourante();
      // Via le contexte, et non la couche de données : en mode Firebase un
      // accès direct porterait sur la mémoire locale, et l'historique resterait
      // vide après rechargement.
      const rLoyers = await genererDepuis(bailId, debut);
      if (!rLoyers.ok) throw new Error(rLoyers.erreur || "Les loyers n'ont pas pu être générés");

      addToast(
        `${form.prenoms.trim()} ${form.nom.trim()} enregistré — loyer ${formatMoney(loyer)}`,
        "success"
      );
      onEnregistre?.({ locataireId, bailId, lotId });
    } catch (erreur) {
      setErreurGlobale(erreur.message || "L'enregistrement a échoué");
    }
  };

  return (
    <Modal
      title="Enregistrer un locataire"
      onClose={onClose}
      width="720px"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary" onClick={enregistrer}>
            <Check size={15} /> Enregistrer
          </button>
        </>
      }
    >
      <ErrorBanner message={erreurGlobale} />

      {/* ---------- LOGEMENT ---------- */}
      <p className="cag-soustitre">
        <Home size={13} /> Logement
      </p>
      <div className="grid grid-2">
        <Field label="Immeuble" required error={erreurs.immeubleId}>
          <Select
            value={form.immeubleId}
            error={erreurs.immeubleId}
            onChange={(e) => {
              maj("immeubleId", e.target.value);
              maj("lotId", "");
            }}
            options={immeubles.map((i) => ({ id: i.id, label: i.nom }))}
          />
        </Field>
        <Field label="Appartement" required error={erreurs.lotId || erreurs.nouveauLot}>
          {form.lotId === LOT_NEUF ? (
            <TextInput
              value={form.nouveauLot}
              error={erreurs.nouveauLot}
              onChange={(e) => maj("nouveauLot", e.target.value)}
              placeholder="Numéro ou nom du logement"
            />
          ) : (
            <Select
              value={form.lotId}
              error={erreurs.lotId}
              onChange={(e) => maj("lotId", e.target.value)}
              options={[
                { id: "", label: "— Choisir —" },
                ...lotsLibres.map((l) => ({
                  id: l.id,
                  label: `${l.designation}${l.loyerReference ? ` — ${formatMoney(l.loyerReference)}` : ""}`,
                })),
                { id: LOT_NEUF, label: "+ Autre logement (à créer)" },
              ]}
            />
          )}
        </Field>
      </div>
      {form.lotId === LOT_NEUF ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => maj("lotId", lotsLibres[0]?.id || "")}
        >
          Revenir à la liste des logements
        </button>
      ) : null}

      {/* ---------- IDENTITÉ ---------- */}
      <p className="cag-soustitre">
        <IdCard size={13} /> Identité
      </p>
      <div className="grid grid-2">
        <Field label="Nom" required error={erreurs.nom}>
          <TextInput
            value={form.nom}
            error={erreurs.nom}
            onChange={(e) => maj("nom", e.target.value)}
            placeholder="ADJOVI"
          />
        </Field>
        <Field label="Prénoms" required error={erreurs.prenoms}>
          <TextInput
            value={form.prenoms}
            error={erreurs.prenoms}
            onChange={(e) => maj("prenoms", e.target.value)}
            placeholder="Marie"
          />
        </Field>
        <Field label="Téléphone" required error={erreurs.telephone}>
          <TextInput
            value={form.telephone}
            error={erreurs.telephone}
            onChange={(e) => maj("telephone", e.target.value)}
            placeholder="+229 96 11 22 33"
          />
        </Field>
        <Field label="IFU" hint="identifiant fiscal unique, si connu">
          <TextInput
            value={form.ifu}
            onChange={(e) => maj("ifu", e.target.value)}
            placeholder="2024000000001"
          />
        </Field>
        <Field label="Pièce d'identité">
          <Select
            value={form.pieceType}
            onChange={(e) => maj("pieceType", e.target.value)}
            options={PIECES}
          />
        </Field>
        <Field label="N° de la pièce">
          <TextInput
            value={form.pieceNumero}
            onChange={(e) => maj("pieceNumero", e.target.value)}
            placeholder="CNI012345"
          />
        </Field>
      </div>

      {/* ---------- BAIL ---------- */}
      <p className="cag-soustitre">
        <FileSignature size={13} /> Bail
      </p>
      <div className="grid grid-2">
        <Field label="Date d'entrée" required error={erreurs.dateDebut}>
          <TextInput
            type="date"
            value={form.dateDebut}
            error={erreurs.dateDebut}
            onChange={(e) => maj("dateDebut", e.target.value)}
          />
        </Field>
        <Field label="Date de sortie" error={erreurs.dateFin} hint="vide si le bail est en cours">
          <TextInput
            type="date"
            value={form.dateFin}
            error={erreurs.dateFin}
            min={form.dateDebut}
            onChange={(e) => maj("dateFin", e.target.value)}
          />
        </Field>
        <Field label="Loyer mensuel" required error={erreurs.loyerMensuel}>
          <TextInput
            type="number"
            min="0"
            step="1000"
            value={form.loyerMensuel}
            error={erreurs.loyerMensuel}
            placeholder={String(loyerParDefaut || 50000)}
            onChange={(e) => maj("loyerMensuel", e.target.value)}
          />
        </Field>
      </div>

      {/* ---------- CAUTION ---------- */}
      <p className="cag-soustitre">
        <KeyRound size={13} /> Caution
      </p>
      <div className="grid grid-2">
        <Field label="Montant versé">
          <TextInput
            type="number"
            min="0"
            step="1000"
            value={form.cautionVersee}
            onChange={(e) => maj("cautionVersee", e.target.value)}
          />
        </Field>
        <Field label="Statut">
          <Select
            value={form.cautionStatut}
            onChange={(e) => maj("cautionStatut", e.target.value)}
            options={CAUTIONS}
          />
        </Field>
        <Field label="La caution couvre" className="span-2">
          <Select
            value={form.cautionSur}
            onChange={(e) => maj("cautionSur", e.target.value)}
            options={CAUTIONS_SUR}
          />
        </Field>
      </div>

      {/* ---------- FRAIS MENSUELS ---------- */}
      <p className="cag-soustitre">
        <Receipt size={13} /> Frais mensuels
      </p>
      <p className="text-muted" style={{ margin: "0 0 0.6rem", fontSize: "0.8rem" }}>
        Repris tels quels sur chaque quittance ; ils restent modifiables à chaque
        encaissement.
      </p>
      <div className="grid grid-3">
        <Field label="Eau">
          <TextInput
            type="number"
            min="0"
            step="100"
            value={form.fraisDefaut.eau}
            onChange={(e) => majFrais("eau", Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Électricité">
          <TextInput
            type="number"
            min="0"
            step="100"
            value={form.fraisDefaut.electricite}
            onChange={(e) => majFrais("electricite", Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Ordures ménagères">
          <TextInput
            type="number"
            min="0"
            step="100"
            value={form.fraisDefaut.ordures}
            onChange={(e) => majFrais("ordures", Number(e.target.value) || 0)}
          />
        </Field>
      </div>

      <Field label="Notes" className="span-2" hint="contacts d'urgence, particularités du dossier…">
        <textarea
          className="input"
          rows={2}
          value={form.notes}
          onChange={(e) => maj("notes", e.target.value)}
        />
      </Field>
    </Modal>
  );
}