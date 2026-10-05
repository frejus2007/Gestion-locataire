// Création d'un bail sur un lot, pour un locataire.
//
// Deux cas de figure, et c'est le cœur de la mise en service chez un client qui
// a déjà des locataires en place :
//   - bail qui commence aujourd'hui : seuls les loyers du mois en cours sont dus ;
//   - bail qui commence dans le passé : il faut reconstituer tous les loyers dus
//     depuis l'entrée, sinon l'historique du locataire est vide.

import { useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Save, X, Users, Home, AlertTriangle, Calendar, Sparkles } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/ToastContext";
import { Card, Field, TextInput, Select, ErrorBanner, EmptyState } from "../../components/ui";
import {
  formatMoney,
  periodeCourante,
  periodeToLabel,
  periodesEntre,
  comparePeriode,
} from "../../utils/format";

const CAUTIONS = [
  { id: "non-versee", label: "Non versée" },
  { id: "deposee", label: "Déposée — conservée" },
  { id: "restituee", label: "Restituée" },
  { id: "retenue", label: "Retenue (damage, impayés)" },
];

// Date du jour, figée au chargement : évite de recalculer pendant le rendu.
const AUJOURDHUI = new Date().toISOString().slice(0, 10);

export default function BailForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    locatairesParId,
    lots,
    lotsParId,
    immeublesParId,
    bailActifDuLot,
    bauxDuLocataire,
    bailEstActif,
    saveBail,
    genererDepuis,
  } = useApp();
  const { addToast } = useToast();

  const locataire = locatairesParId.get(id);

  const [form, setForm] = useState({
    lotId: "",
    dateDebut: AUJOURDHUI,
    dateFin: "",
    loyerMensuel: "",
    cautionVersee: 0,
    cautionStatut: "non-versee",
    notes: "",
  });
  const [erreurs, setErreurs] = useState({});
  const [erreurGlobale, setErreurGlobale] = useState(null);
  const [genererHistorique, setGenererHistorique] = useState(true);

  // Lots encore libres, moins ceux déjà occupés par un bail en cours.
  const lotsDisponibles = useMemo(
    () => lots.filter((l) => !bailActifDuLot(l.id)),
    [lots, bailActifDuLot]
  );

  // Tous les hooks avant toute sortie conditionnelle.
  const bailActifExistant = useMemo(
    () => bauxDuLocataire(id || "").find((b) => bailEstActif(b)),
    [bauxDuLocataire, bailEstActif, id]
  );

  // Combien de loyers seront à générer depuis la date d'entrée.
  const moisADebiter = useMemo(() => {
    if (!form.dateDebut) return [];
    const debut = form.dateDebut.slice(0, 7);
    // On s'arrête au mois courant, ou à la date de sortie si elle est plus proche.
    const borne = form.dateFin ? form.dateFin.slice(0, 7) : periodeCourante();
    if (comparePeriode(debut, borne) > 0) return [];
    return periodesEntre(debut, borne);
  }, [form.dateDebut, form.dateFin]);

  if (!locataire) {
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

  // À la sélection d'un lot, on propose son loyer de référence comme base.
  const choisirLot = (e) => {
    const lotId = e.target.value;
    const lot = lotsParId.get(lotId);
    setForm((f) => ({
      ...f,
      lotId,
      loyerMensuel: lot?.loyerReference ? String(lot.loyerReference) : f.loyerMensuel,
    }));
    setErreurs((e) => ({ ...e, lotId: undefined }));
  };

  const dansLePasse = form.dateDebut && form.dateDebut < AUJOURDHUI;
  const loyer = Number(form.loyerMensuel) || 0;
  const totalDu = moisADebiter.length * loyer;

  const valider = () => {
    const e = {};
    if (!form.lotId) e.lotId = "Choisissez le lot loué";
    if (!form.dateDebut) e.dateDebut = "La date de début est requise";
    if (form.dateFin && form.dateFin < form.dateDebut) {
      e.dateFin = "La date de sortie doit être postérieure à l'entrée";
    }
    if (!loyer || loyer <= 0) e.loyerMensuel = "Le loyer mensuel est requis";
    setErreurs(e);
    return Object.keys(e).length === 0;
  };

  const enregistrer = (e) => {
    e.preventDefault();
    if (!valider()) return;

    // Un bail ne peut pas couvrir un lot déjà occupé.
    if (bailActifDuLot(form.lotId)) {
      setErreurGlobale("Ce lot est déjà occupé par un bail en cours.");
      return;
    }

    const res = saveBail(
      {
        lotId: form.lotId,
        locataireId: id,
        dateDebut: form.dateDebut,
        dateFin: form.dateFin || null,
        loyerMensuel: loyer,
        cautionVersee: Number(form.cautionVersee) || 0,
        cautionStatut: form.cautionStatut,
        notes: form.notes,
      },
      null
    );

    if (!res.ok) {
      setErreurGlobale(res.erreur);
      return;
    }

    // Reconstitution de l'historique : sans cela, le compte d'un locataire
    // entrant dans le passé est vide et le site paraît faux.
    if (genererHistorique && moisADebiter.length > 0) {
      const gen = genererDepuis(res.resultat.id, form.dateDebut.slice(0, 7), form.dateFin || periodeCourante());
      if (gen.ok) {
        addToast(
          gen.resultat > 0
            ? `${gen.resultat} loyer${gen.resultat > 1 ? "s" : ""} à encaisser généré${gen.resultat > 1 ? "s" : ""}`
            : "Aucun loyer à générer"
        );
      }
    }

    addToast("Bail créé");
    navigate(`/locataires/${id}`);
  };

  const lotChoisi = form.lotId ? lotsParId.get(form.lotId) : null;
  const immeubleChoisi = lotChoisi ? immeublesParId.get(lotChoisi.immeubleId) : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link
            to={`/locataires/${id}`}
            className="btn btn-small btn-secondary"
            style={{ marginBottom: "0.5rem" }}
          >
            <X size={14} /> Fiche du locataire
          </Link>
          <h1 className="page-title">Nouveau bail</h1>
          <p className="page-subtitle">
            Bail de {locataire.nom} {locataire.prenoms}
            {bailActifExistant && " — ce locataire a déjà un bail en cours"}
          </p>
        </div>
      </div>

      <ErrorBanner message={erreurGlobale} />

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <Card title="Conditions du bail">
          <form onSubmit={enregistrer}>
            <div className="form-grid">
              <Field label="Logement" required error={erreurs.lotId} className="span-2">
                {lotsDisponibles.length === 0 ? (
                  <div className="alert alert-warn" style={{ marginBottom: 0 }}>
                    Tous les lots sont occupés. Clôturez un bail existant ou ajoutez un lot à un immeuble.
                  </div>
                ) : (
                  <Select value={form.lotId} onChange={choisirLot} error={erreurs.lotId} options={lotsDisponibles.map((l) => {
                    const im = immeublesParId.get(l.immeubleId);
                    return {
                      id: l.id,
                      label: `${im ? im.nom + " — " : ""}${l.designation} (${formatMoney(l.loyerReference || 0)})`,
                    };
                  }).concat([{ id: "", label: "— Choisir un lot —" }]).reverse()}
                  />
                )}
              </Field>

              {lotChoisi && (
                <div className="alert alert-info span-2" style={{ marginBottom: 0 }}>
                  <Home size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
                  {lotChoisi.designation}
                  {lotChoisi.etage ? ` · ${lotChoisi.etage}` : ""}
                  {lotChoisi.nbPieces ? ` · ${lotChoisi.nbPieces} pièces` : ""}
                  {immeubleChoisi && ` — ${immeubleChoisi.nom}, ${immeubleChoisi.quartier}`}
                </div>
              )}

              <Field label="Loyer mensuel" required error={erreurs.loyerMensuel}>
                <TextInput
                  type="number"
                  min="0"
                  value={form.loyerMensuel}
                  onChange={set("loyerMensuel")}
                  error={erreurs.loyerMensuel}
                  placeholder="50000"
                />
              </Field>

              <Field label="Date d'entrée" required error={erreurs.dateDebut}>
                <TextInput type="date" value={form.dateDebut} onChange={set("dateDebut")} error={erreurs.dateDebut} />
              </Field>

              <Field label="Date de sortie" error={erreurs.dateFin} hint=" laisser vide si le bail est en cours">
                <TextInput type="date" value={form.dateFin} onChange={set("dateFin")} error={erreurs.dateFin} />
              </Field>

              <Field label="Caution versée">
                <TextInput
                  type="number"
                  min="0"
                  value={form.cautionVersee}
                  onChange={set("cautionVersee")}
                  placeholder="100000"
                />
              </Field>

              <Field label="État de la caution" className="span-2">
                <Select value={form.cautionStatut} onChange={set("cautionStatut")} options={CAUTIONS} />
              </Field>

              <Field label="Notes sur le bail" className="span-2">
                <textarea
                  className="input"
                  value={form.notes}
                  onChange={set("notes")}
                  placeholder="Conditions particulières, révision du loyer…"
                />
              </Field>
            </div>

            <div className="form-actions">
              <Link to={`/locataires/${id}`} className="btn btn-secondary">
                Annuler
              </Link>
              <button type="submit" className="btn btn-primary" disabled={lotsDisponibles.length === 0}>
                <Save size={16} /> Créer le bail
              </button>
            </div>
          </form>
        </Card>

        {/* Panneau latéral : ce qui va se passer concrètement. */}
        <Card title="Conséquences">
          <div className="stack">
            <div>
              <div className="stat-label">Périodes à encaisser</div>
              <div className="stat-value">{moisADebiter.length}</div>
              {moisADebiter.length > 0 && (
                <div className="stat-hint">
                  {periodeToLabel(moisADebiter[0])} → {periodeToLabel(moisADebiter[moisADebiter.length - 1])}
                </div>
              )}
            </div>

            {loyer > 0 && moisADebiter.length > 0 && (
              <div>
                <div className="stat-label">Total dû à l'entrée</div>
                <div className="stat-value">{formatMoney(totalDu)}</div>
                <div className="stat-hint">
                  {moisADebiter.length} × {formatMoney(loyer)}
                </div>
              </div>
            )}

            {moisADebiter.length > 1 && (
              <div className="alert alert-info" style={{ marginBottom: 0 }}>
                <Calendar size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
                Ces {moisADebiter.length} périodes seront créées comme loyers impayés. Vous pourrez
                ensuite enregistrer les versements déjà reçus, mois par mois, depuis la fiche du locataire.
              </div>
            )}

            {dansLePasse && (
              <div className="alert alert-warn" style={{ marginBottom: 0 }}>
                <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
                La date d'entrée est dans le passé : c'est le cas d'un locataire déjà logé chez vous.
                Les loyers dus depuis cette date seront reconstitués pour que son compte soit complet.
              </div>
            )}

            {moisADebiter.length > 0 && (
              <label
                className="row"
                style={{
                  gap: "0.5rem",
                  cursor: "pointer",
                  padding: "0.7rem",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--border-light)",
                }}
              >
                <input
                  type="checkbox"
                  checked={genererHistorique}
                  onChange={(e) => setGenererHistorique(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontSize: "0.87rem" }}>
                  <Sparkles size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                  Générer automatiquement les loyers dus
                </span>
              </label>
            )}

            {form.cautionStatut === "deposee" && Number(form.cautionVersee) > 0 && (
              <div className="alert alert-info" style={{ marginBottom: 0 }}>
                Caution de {formatMoney(Number(form.cautionVersee))} enregistrée comme conservée.
                Elle apparaîtra dans le suivi des cautions.
              </div>
            )}

            {moisADebiter.length === 0 && form.dateDebut && (
              <div className="alert alert-warn" style={{ marginBottom: 0 }}>
                Aucune période à générer : vérifiez que la date d'entrée est bien antérieure à aujourd'hui.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}