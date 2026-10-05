// Détail d'un immeuble : ses lots, son compte de résultat, ses impayés.

import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Edit,
  Plus,
  Home,
  Trash2,
  Wrench,
  Wallet,
  Building2,
  MapPin,
  Calendar,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/ToastContext";
import {
  Card,
  EmptyState,
  Badge,
  Field,
  TextInput,
  Modal,
  ConfirmDialog,
  ProgressBar,
} from "../../components/ui";
import { formatMoney, formatDate } from "../../utils/format";

const STATUTS = {
  actif: { label: "Actif", classe: "badge-green" },
  travaux: { label: "Travaux", classe: "badge-amber" },
  vendu: { label: "Vendu", classe: "badge-neutral" },
};

const LOT_VIDE = { designation: "", etage: "", nbPieces: "", loyerReference: "", notes: "" };

export default function ImmeubleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    immeublesParId,
    lotsDImmeuble,
    bailActifDuLot,
    locatairesParId,
    soldesParBail,
    bilanImmeuble,
    removeImmeuble,
    saveLot,
    removeLot,
  } = useApp();
  const { addToast } = useToast();

  const immeuble = immeublesParId.get(id);
  const [modaleLot, setModaleLot] = useState(false);
  const [lot, setLot] = useState({ ...LOT_VIDE });
  const [aSupprimerImmeuble, setASupprimerImmeuble] = useState(false);
  const [aSupprimerLot, setASupprimerLot] = useState(null);
  const [erreur, setErreur] = useState(null);

  if (!immeuble) {
    return (
      <Card>
        <EmptyState
          icon={Building2}
          message="Immeuble introuvable."
          action={
            <Link to="/immeubles" className="btn btn-primary" style={{ marginTop: "0.75rem" }}>
              Retour à la liste
            </Link>
          }
        />
      </Card>
    );
  }

  const lots = lotsDImmeuble(id);
  const bilan = bilanImmeuble(id);
  const st = STATUTS[immeuble.statut] || STATUTS.actif;
  const taux = bilan.nbLots > 0 ? (bilan.nbLotsOccupes / bilan.nbLots) * 100 : 0;

  // Les impayés de cet immeuble, tous lots confondus.
  const impayes = lots
    .map((l) => {
      const bail = bailActifDuLot(l.id);
      if (!bail) return null;
      const dette = soldesParBail.get(bail.id) || 0;
      if (dette <= 0) return null;
      return { bail, lot: l, dette, locataire: locatairesParId.get(bail.locataireId) };
    })
    .filter(Boolean)
    .sort((a, b) => b.dette - a.dette);

  const supprimerImmeuble = () => {
    const res = removeImmeuble(id);
    if (res.ok) {
      addToast("Immeuble supprimé");
      navigate("/immeubles");
    } else {
      setErreur(res.erreur);
    }
  };

  const ajouterLot = () => {
    if (!lot.designation.trim()) {
      setErreur("La désignation du lot est requise.");
      return;
    }
    const res = saveLot(
      {
        ...lot,
        immeubleId: id,
        nbPieces: Number(lot.nbPieces) || null,
        loyerReference: Number(lot.loyerReference) || 0,
      },
      null
    );
    if (!res.ok) {
      setErreur(res.erreur);
      return;
    }
    addToast("Lot ajouté");
    setLot({ ...LOT_VIDE });
    setModaleLot(false);
    setErreur(null);
  };

  const supprimerLot = () => {
    const res = removeLot(aSupprimerLot);
    if (res.ok) addToast("Lot supprimé");
    setASupprimerLot(null);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/immeubles" className="btn btn-small btn-secondary" style={{ marginBottom: "0.5rem" }}>
            <ArrowLeft size={14} /> Immeubles
          </Link>
          <h1 className="page-title">{immeuble.nom}</h1>
          <p className="page-subtitle row" style={{ gap: "0.4rem" }}>
            <Badge classe={st.classe}>{st.label}</Badge>
            <span className="row" style={{ gap: "0.25rem" }}>
              <MapPin size={13} /> {immeuble.adresse ? `${immeuble.adresse}, ` : ""}
              {immeuble.quartier}, {immeuble.ville}
            </span>
            {immeuble.dateAcquisition && (
              <span className="row" style={{ gap: "0.25rem" }}>
                <Calendar size={13} /> acquis le {formatDate(immeuble.dateAcquisition)}
              </span>
            )}
          </p>
        </div>
        <div className="btn-group">
          <Link to={`/immeubles/${id}/modifier`} className="btn btn-secondary">
            <Edit size={15} /> Modifier
          </Link>
          <button type="button" className="btn btn-danger" onClick={() => setASupprimerImmeuble(true)}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {erreur && <div className="alert alert-error">{erreur}</div>}

      <div className="grid grid-4" style={{ marginBottom: "1rem" }}>
        <div className="stat-card stat-blue">
          <div className="stat-label">Recettes</div>
          <div className="stat-value">{formatMoney(bilan.recettes)}</div>
          <div className="stat-hint">versements encaissés</div>
        </div>
        <div className="stat-card stat-red">
          <div className="stat-label">Dépenses</div>
          <div className="stat-value">{formatMoney(bilan.depenses)}</div>
          <div className="stat-hint">charges et travaux</div>
        </div>
        <div className="stat-card stat-cyan">
          <div className="stat-label">Résultat</div>
          <div className="stat-value" style={{ color: bilan.resultat >= 0 ? "var(--success)" : "var(--danger)" }}>
            {formatMoney(bilan.resultat)}
          </div>
          <div className="stat-hint">recettes moins dépenses</div>
        </div>
        <div className="stat-card stat-amber">
          <div className="stat-label">Dette des locataires</div>
          <div className="stat-value" style={{ color: bilan.dette > 0 ? "var(--danger)" : "var(--success)" }}>
            {bilan.dette > 0 ? formatMoney(bilan.dette) : "—"}
          </div>
          <div className="stat-hint">non encaissé</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: "1rem" }}>
        <Card title="Occupation">
          <div className="row" style={{ gap: "1.5rem", marginBottom: "1rem" }}>
            <div>
              <div className="stat-label">Lots loués</div>
              <div className="stat-value">
                {bilan.nbLotsOccupes}
                <span className="text-muted" style={{ fontSize: "1rem" }}>
                  {" "}
                  / {bilan.nbLots}
                </span>
              </div>
            </div>
            <div>
              <div className="stat-label">Locataires</div>
              <div className="stat-value">{bilan.nbLocataires}</div>
            </div>
          </div>
          <ProgressBar valeur={taux} label="Taux d'occupation" couleur="var(--success)" />
        </Card>

        <Card title="Informations">
          <dl className="info-list">
            <div>
              <dt>Quartier</dt>
              <dd>{immeuble.quartier}</dd>
            </div>
            <div>
              <dt>Ville</dt>
              <dd>{immeuble.ville}</dd>
            </div>
            <div>
              <dt>Adresse</dt>
              <dd>{immeuble.adresse || "—"}</dd>
            </div>
            <div>
              <dt>Acquisition</dt>
              <dd>{immeuble.dateAcquisition ? formatDate(immeuble.dateAcquisition) : "—"}</dd>
            </div>
            {immeuble.notes && (
              <div>
                <dt>Notes</dt>
                <dd>{immeuble.notes}</dd>
              </div>
            )}
          </dl>
        </Card>
      </div>

      <Card
        title="Lots"
        action={
          <button type="button" className="btn btn-small btn-primary" onClick={() => setModaleLot(true)}>
            <Plus size={14} /> Ajouter un lot
          </button>
        }
      >
        {lots.length === 0 ? (
          <EmptyState
            icon={Home}
            message="Aucun lot. Ajoutez les appartements ou studios de cet immeuble pour pouvoir les louer."
            action={
              <button type="button" className="btn btn-primary" style={{ marginTop: "0.75rem" }} onClick={() => setModaleLot(true)}>
                <Plus size={16} /> Ajouter un lot
              </button>
            }
          />
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Désignation</th>
                  <th>Étage</th>
                  <th className="num">Pièces</th>
                  <th className="num">Loyer du bail</th>
                  <th>Locataire</th>
                  <th className="num">Solde</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lots.map((l) => {
                  const bail = bailActifDuLot(l.id);
                  const loc = bail ? locatairesParId.get(bail.locataireId) : null;
                  const dette = bail ? soldesParBail.get(bail.id) || 0 : 0;
                  return (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 600 }}>{l.designation}</td>
                      <td className="text-muted">{l.etage || "—"}</td>
                      <td className="num">{l.nbPieces ?? "—"}</td>
                      <td className="num">
                        {bail ? formatMoney(bail.loyerMensuel) : l.loyerReference ? (
                          <span className="text-muted">{formatMoney(l.loyerReference)}</span>
                        ) : "—"}
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
                      <td className="num">
                        {!bail ? (
                          <span className="text-muted">—</span>
                        ) : dette > 0 ? (
                          <span style={{ color: "var(--danger)", fontWeight: 600 }}>{formatMoney(dette)}</span>
                        ) : (
                          <Badge classe="badge-green">À jour</Badge>
                        )}
                      </td>
                      <td className="actions">
                        {bail && (
                          <Link
                            to={`/locataires/${bail.locataireId}/paiement`}
                            className="btn btn-small btn-primary"
                            title="Encaisser un versement"
                          >
                            <Wallet size={13} />
                          </Link>
                        )}
                        <button
                          type="button"
                          className="btn btn-small btn-danger"
                          onClick={() => setASupprimerLot(l.id)}
                          aria-label={`Supprimer ${l.designation}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {impayes.length > 0 && (
        <Card title="Impayés de cet immeuble" style={{ marginTop: "1rem" }}>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Locataire</th>
                  <th>Lot</th>
                  <th className="num">Dette</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {impayes.map((x) => (
                  <tr key={x.bail.id}>
                    <td>
                      <Link to={`/locataires/${x.bail.locataireId}`} style={{ fontWeight: 600 }}>
                        {x.locataire ? `${x.locataire.nom} ${x.locataire.prenoms}` : "—"}
                      </Link>
                    </td>
                    <td className="text-muted">{x.lot.designation}</td>
                    <td className="num" style={{ color: "var(--danger)", fontWeight: 700 }}>
                      {formatMoney(x.dette)}
                    </td>
                    <td className="actions">
                      <Link to={`/locataires/${x.bail.locataireId}/paiement`} className="btn btn-small btn-primary">
                        Encaisser
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Dépenses de l'immeuble : accès rapide depuis sa fiche. */}
      <Card
        title="Dépenses"
        action={
          <Link to="/depenses" className="btn btn-small btn-secondary">
            <Wrench size={13} /> Voir tout
          </Link>
        }
        style={{ marginTop: "1rem" }}
      >
        <DepensesImmeuble immeubleId={id} />
      </Card>

      {modaleLot && (
        <Modal
          title="Nouveau lot"
          onClose={() => setModaleLot(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setModaleLot(false)}>
                Annuler
              </button>
              <button type="button" className="btn btn-primary" onClick={ajouterLot}>
                <Plus size={15} /> Ajouter
              </button>
            </>
          }
        >
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
              />
            </Field>
            <Field label="Notes">
              <TextInput
                value={lot.notes}
                onChange={(e) => setLot((l) => ({ ...l, notes: e.target.value }))}
              />
            </Field>
          </div>
        </Modal>
      )}

      {aSupprimerImmeuble && (
        <ConfirmDialog
          title="Supprimer l'immeuble"
          message={`Supprimer « ${immeuble.nom} » supprimera aussi ses ${lots.length} lot(s), les baux rattachés, leurs loyers, versements et quittances. Cette action est irréversible.`}
          onConfirm={supprimerImmeuble}
          onCancel={() => setASupprimerImmeuble(false)}
        />
      )}

      {aSupprimerLot && (
        <ConfirmDialog
          message="Supprimer ce lot supprimera le bail qui y est rattaché, ainsi que son historique. Action irréversible."
          onConfirm={supprimerLot}
          onCancel={() => setASupprimerLot(null)}
        />
      )}
    </div>
  );
}

// Dépenses d'un immeuble, les plus récentes d'abord.
function DepensesImmeuble({ immeubleId }) {
  const { depenses, CATEGORIES } = useApp();
  const lignes = depenses
    .filter((d) => d.immeubleId === immeubleId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  if (lignes.length === 0) {
    return <EmptyState icon={Wrench} message="Aucune dépense enregistrée pour cet immeuble." />;
  }

  return (
    <div className="table-wrapper">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Catégorie</th>
            <th>Note</th>
            <th className="num">Montant</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((d) => (
            <tr key={d.id}>
              <td>{formatDate(d.date)}</td>
              <td>
                <Badge classe="badge-neutral">{CATEGORIES.find((c) => c.id === d.categorie)?.label || d.categorie}</Badge>
              </td>
              <td className="text-muted">{d.note || "—"}</td>
              <td className="num" style={{ fontWeight: 600 }}>
                {formatMoney(d.montant)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}