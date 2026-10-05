// Création et modification d'un immeuble.
//
// La création se fait en deux temps : l'immeuble d'abord, puis ses lots.
// C'est volontaire — un immeuble sans lot ne peut pas être loué, et l'inverse
// (un lot sans immeuble) n'a pas de sens.

import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Save, X, Plus, Trash2, Home } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/ToastContext";
import { Card, Field, TextInput, Select, Modal, ConfirmDialog, ErrorBanner, EmptyState, Badge } from "../../components/ui";
import { formatMoney } from "../../utils/format";

const VIDE = { nom: "", adresse: "", quartier: "", ville: "Cotonou", notes: "", dateAcquisition: "", statut: "actif" };

const LOT_VIDE = { designation: "", etage: "", nbPieces: "", loyerReference: "", notes: "" };

export default function ImmeubleForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { immeublesParId, saveImmeuble, saveLot } = useApp();
  const { addToast } = useToast();

  const existant = id ? immeublesParId.get(id) : null;
  const [form, setForm] = useState(() => (existant ? { ...existant } : { ...VIDE }));
  const [erreurs, setErreurs] = useState({});
  const [modalLot, setModalLot] = useState(false);
  const [lot, setLot] = useState({ ...LOT_VIDE });
  const [erreurGlobale, setErreurGlobale] = useState(null);

  const set = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }));

  const valider = () => {
    const e = {};
    if (!form.nom.trim()) e.nom = "Le nom de l'immeuble est requis";
    if (!form.quartier.trim()) e.quartier = "Le quartier est requis";
    setErreurs(e);
    return Object.keys(e).length === 0;
  };

  const enregistrer = (e) => {
    e.preventDefault();
    if (!valider()) return;
    const res = saveImmeuble({ ...form, nom: form.nom.trim() }, id || null);
    if (!res.ok) {
      setErreurGlobale(res.erreur);
      return;
    }
    addToast(id ? "Immeuble mis à jour" : "Immeuble créé");
    if (id) {
      navigate(`/immeubles/${id}`);
    } else {
      // On enchaîne directement sur la création du premier lot : c'est
      // l'étape suivante logique et l'immeuble vient d'être créé.
      navigate(`/immeubles/${res.resultat.id}`);
      addToast("Ajoutez maintenant ses lots pour pouvoir les louer");
    }
  };

  const ajouterLot = (e) => {
    e.preventDefault();
    if (!lot.designation.trim()) {
      setErreurGlobale("La désignation du lot est requise.");
      return;
    }
    const res = saveLot({
      ...lot,
      immeubleId: id,
      nbPieces: Number(lot.nbPieces) || null,
      loyerReference: Number(lot.loyerReference) || 0,
    });
    if (!res.ok) {
      setErreurGlobale(res.erreur);
      return;
    }
    addToast(`Lot « ${lot.designation} » ajouté`);
    setLot({ ...LOT_VIDE });
    setModalLot(false);
    setErreurGlobale(null);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to={id ? `/immeubles/${id}` : "/immeubles"} className="btn btn-small btn-secondary" style={{ marginBottom: "0.5rem" }}>
            <X size={14} /> Retour
          </Link>
          <h1 className="page-title">{id ? "Modifier l'immeuble" : "Nouvel immeuble"}</h1>
          <p className="page-subtitle">
            {id
              ? "Les informations de l'immeuble et de ses lots."
              : "Commencez par l'immeuble ; vous ajouterez ses lots juste après."}
          </p>
        </div>
      </div>

      <ErrorBanner message={erreurGlobale} />

      <Card title="Informations générales">
        <form onSubmit={enregistrer}>
          <div className="form-grid">
            <Field label="Nom de l'immeuble" required error={erreurs.nom} className="span-2">
              <TextInput
                value={form.nom}
                onChange={set("nom")}
                error={erreurs.nom}
                placeholder="Ex : Résidence Les Palmiers"
              />
            </Field>

            <Field label="Quartier" required error={erreurs.quartier}>
              <TextInput value={form.quartier} onChange={set("quartier")} error={erreurs.quartier} placeholder="Fidjrossè" />
            </Field>

            <Field label="Ville">
              <TextInput value={form.ville} onChange={set("ville")} />
            </Field>

            <Field label="Adresse précise" className="span-2">
              <TextInput value={form.adresse} onChange={set("adresse")} placeholder="Rue des Pêches, en face de la pharmacie" />
            </Field>

            <Field label="Date d'acquisition" hint=" facultative">
              <TextInput type="date" value={form.dateAcquisition || ""} onChange={set("dateAcquisition")} />
            </Field>

            <Field label="Statut">
              <Select
                value={form.statut}
                onChange={set("statut")}
                options={[
                  { id: "actif", label: "Actif" },
                  { id: "travaux", label: "En travaux" },
                  { id: "vendu", label: "Vendu" },
                ]}
              />
            </Field>

            <Field label="Notes" className="span-2">
              <textarea
                className="input"
                value={form.notes}
                onChange={set("notes")}
                placeholder="Immeuble R+2, 4 appartements, générateur commun…"
              />
            </Field>
          </div>

          <div className="form-actions">
            <Link to={id ? `/immeubles/${id}` : "/immeubles"} className="btn btn-secondary">
              Annuler
            </Link>
            <button type="submit" className="btn btn-primary">
              <Save size={16} /> {id ? "Enregistrer" : "Créer l'immeuble"}
            </button>
          </div>
        </form>
      </Card>

      {/* Les lots ne peuvent être créés qu'une fois l'immeuble enregistré,
          puisqu'ils doivent le référencer. */}
      {id && (
        <Card
          title="Lots de cet immeuble"
          action={
            <button type="button" className="btn btn-small btn-primary" onClick={() => setModalLot(true)}>
              <Plus size={14} /> Ajouter un lot
            </button>
          }
          style={{ marginTop: "1rem" }}
        >
          <LotTable immeubleId={id} onAjouter={() => setModalLot(true)} />
        </Card>
      )}

      {modalLot && (
        <Modal
          title="Nouveau lot"
          onClose={() => setModalLot(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setModalLot(false)}>
                Annuler
              </button>
              <button type="button" className="btn btn-primary" onClick={ajouterLot}>
                <Plus size={15} /> Ajouter
              </button>
            </>
          }
        >
          <ErrorBanner message={erreurGlobale} />
          <div className="form-grid">
            <Field label="Désignation" required className="span-2">
              <TextInput
                value={lot.designation}
                onChange={(e) => setLot((l) => ({ ...l, designation: e.target.value }))}
                placeholder="Appartement 1 — RDC gauche"
              />
            </Field>
            <Field label="Étage">
              <TextInput
                value={lot.etage}
                onChange={(e) => setLot((l) => ({ ...l, etage: e.target.value }))}
                placeholder="RDC, 1er, 2e…"
              />
            </Field>
            <Field label="Nombre de pièces">
              <TextInput
                type="number"
                min="0"
                value={lot.nbPieces}
                onChange={(e) => setLot((l) => ({ ...l, nbPieces: e.target.value }))}
              />
            </Field>
            <Field label="Loyer de référence" hint="prix indicatif du lot">
              <TextInput
                type="number"
                min="0"
                value={lot.loyerReference}
                onChange={(e) => setLot((l) => ({ ...l, loyerReference: e.target.value }))}
                placeholder="50000"
              />
            </Field>
            <Field label="Notes">
              <TextInput
                value={lot.notes}
                onChange={(e) => setLot((l) => ({ ...l, notes: e.target.value }))}
                placeholder="Avec balcon…"
              />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Tableau des lots d'un immeuble, isolé ici pour alléger le formulaire.
function LotTable({ immeubleId, onAjouter }) {
  const { lotsDImmeuble, bailActifDuLot, lotsParId, locatairesParId, removeLot } = useApp();
  const { addToast } = useToast();
  const [aSupprimer, setASupprimer] = useState(null);

  const lots = lotsDImmeuble(immeubleId);

  if (lots.length === 0) {
    return (
      <EmptyState
        icon={Home}
        message="Aucun lot dans cet immeuble. Ajoutez au moins un lot pour pouvoir le louer."
        action={
          <button type="button" className="btn btn-primary" style={{ marginTop: "0.75rem" }} onClick={onAjouter}>
            <Plus size={16} /> Ajouter le premier lot
          </button>
        }
      />
    );
  }

  const supprimer = () => {
    const res = removeLot(aSupprimer);
    if (res.ok) addToast("Lot supprimé");
    setASupprimer(null);
  };

  return (
    <>
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Désignation</th>
              <th>Étage</th>
              <th className="num">Pièces</th>
              <th className="num">Loyer réf.</th>
              <th>Occupation</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => {
              const bail = bailActifDuLot(l.id);
              const loc = bail ? locatairesParId.get(bail.locataireId) : null;
              return (
                <tr key={l.id}>
                  <td style={{ fontWeight: 600 }}>{l.designation}</td>
                  <td className="text-muted">{l.etage || "—"}</td>
                  <td className="num">{l.nbPieces ?? "—"}</td>
                  <td className="num">
                    {l.loyerReference ? formatMoney(l.loyerReference) : "—"}
                  </td>
                  <td>
                    {bail && loc ? (
                      <Link to={`/locataires/${loc.id}`} style={{ fontWeight: 500 }}>
                        {loc.nom} {loc.prenoms}
                      </Link>
                    ) : (
                      <Badge classe="badge-cyan">Vacant</Badge>
                    )}
                  </td>
                  <td className="actions">
                    <button
                      type="button"
                      className="btn btn-small btn-danger"
                      onClick={() => setASupprimer(l)}
                      aria-label={`Supprimer ${l.designation}`}
                      title="Supprimer le lot"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {aSupprimer && (
        <ConfirmDialog
          message={`Supprimer « ${lotsParId.get(aSupprimer)?.designation} » ? Si un bail y est rattaché, il sera supprimé aussi, ainsi que son historique de versements.`}
          onConfirm={supprimer}
          onCancel={() => setASupprimer(null)}
        />
      )}
    </>
  );
}