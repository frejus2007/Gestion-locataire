// Fiche d'un locataire : identité, logement, compte et caution.

import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Edit,
  Wallet,
  Plus,
  Trash2,
  FileText,
  Users,
  Phone,
  Shield,
  Calendar,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/ToastContext";
import CompteLocataire from "../../components/CompteLocataire";
import { Card, EmptyState, Badge, Avatar, ConfirmDialog, Modal, Field, TextInput } from "../../components/ui";
import { formatMoney, formatDate, LIBELLE_CAUTION, pluriel, accordMot } from "../../utils/format";

export default function LocataireDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    locatairesParId,
    bauxDuLocataire,
    bailEstActif,
    lotsParId,
    immeublesParId,
    soldesParBail,
    loyersDe,
    paiementsDe,
    quittancesParPaiement,
    saveLoyer,
    impayesDe,
    saveBail,
    removeLocataire,
    removeBail,
  } = useApp();
  const { addToast } = useToast();

  const locataire = locatairesParId.get(id);
  const [aSupprimer, setASupprimer] = useState(null);
  // null = modale fermée ; sinon la date de sortie saisie.
  const [sortie, setSortie] = useState(null);

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

  const baux = bauxDuLocataire(id);
  const bailActif = baux.find((b) => bailEstActif(b)) || null;
  const lot = bailActif ? lotsParId.get(bailActif.lotId) : null;
  const immeuble = lot ? immeublesParId.get(lot.immeubleId) : null;
  const dette = bailActif ? soldesParBail.get(bailActif.id) || 0 : 0;
  const caution = LIBELLE_CAUTION[bailActif?.cautionStatut] || LIBELLE_CAUTION["non-versee"];

  const supprimerLocataire = () => {
    const res = removeLocataire(id);
    if (res.ok) {
      addToast("Locataire supprimé");
      navigate("/locataires");
    }
  };

  const cloturerBail = () => {
    if (!sortie) return;
    const res = saveBail({ dateFin: sortie }, bailActif.id);
    if (res.ok) {
      addToast("Bail clôturé");
      setSortie(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/locataires" className="btn btn-small btn-secondary" style={{ marginBottom: "0.5rem" }}>
            <ArrowLeft size={14} /> Locataires
          </Link>
          <div className="row" style={{ gap: "0.75rem" }}>
            <Avatar nom={locataire.nom} prenoms={locataire.prenoms} size={46} />
            <div>
              <h1 className="page-title">{locataire.nom} {locataire.prenoms}</h1>
              <p className="page-subtitle" style={{ marginBottom: 0 }}>
                {bailActif ? (
                  <>
                    {lot ? lot.designation : "—"}
                    {immeuble ? ` · ${immeuble.nom}` : ""}
                  </>
                ) : (
                  "Aucun bail en cours"
                )}
              </p>
            </div>
          </div>
        </div>
        <div className="btn-group">
          <Link to={`/locataires/${id}/modifier`} className="btn btn-secondary">
            <Edit size={15} /> Modifier
          </Link>
          {bailActif ? (
            <Link to={`/locataires/${id}/paiement`} className="btn btn-primary">
              <Wallet size={15} /> Encaisser
            </Link>
          ) : (
            <Link to={`/locataires/${id}/bail`} className="btn btn-primary">
              <Plus size={15} /> Nouveau bail
            </Link>
          )}
          <button type="button" className="btn btn-danger" onClick={() => setASupprimer(id)} title="Supprimer">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Bandeau d'état : ce que le propriétaire cherche en premier. */}
      {bailActif && (
        <Card
          style={{
            marginBottom: "1rem",
            background: dette > 0 ? "var(--danger-light)" : "var(--success-light)",
            borderColor: dette > 0 ? "var(--danger)" : "var(--success)",
          }}
        >
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="stat-label">
                {dette > 0 ? "Montant restant à payer" : "Situation du compte"}
              </div>
              <div
                className="stat-value"
                style={{ color: dette > 0 ? "var(--danger)" : "var(--success)" }}
              >
                {dette > 0 ? formatMoney(dette) : "À jour"}
              </div>
              {dette > 0 && (
                <div className="stat-hint">
                  {pluriel(impayesDe(bailActif.id).length, "période")} {accordMot(impayesDe(bailActif.id).length, "impayée")}
                </div>
              )}
            </div>
            {dette > 0 && (
              <Link to={`/locataires/${id}/paiement`} className="btn btn-primary">
                <Wallet size={15} /> Encaisser
              </Link>
            )}
          </div>
        </Card>
      )}

      <div className="grid grid-2" style={{ marginBottom: "1rem" }}>
        <Card title="Identité">
          <dl className="info-list">
            <div>
              <dt>Téléphone</dt>
              <dd className="row" style={{ gap: "0.3rem" }}>
                <Phone size={13} /> {locataire.telephone || "—"}
              </dd>
            </div>
            <div>
              <dt>IFU</dt>
              <dd className="mono">{locataire.ifu || "—"}</dd>
            </div>
            <div>
              <dt>Pièce d'identité</dt>
              <dd>
                {locataire.pieceNature || "—"}
                {locataire.pieceNumero ? ` n° ${locataire.pieceNumero}` : ""}
              </dd>
            </div>
            {locataire.email && (
              <div>
                <dt>Courriel</dt>
                <dd>{locataire.email}</dd>
              </div>
            )}
            {locataire.notes && (
              <div>
                <dt>Notes</dt>
                <dd>{locataire.notes}</dd>
              </div>
            )}
          </dl>
        </Card>

        <Card
          title="Logement et bail"
          action={
            bailActif && (
              <button
                type="button"
                className="btn btn-small btn-secondary"
                onClick={() => setSortie(new Date().toISOString().slice(0, 10))}
              >
                Clôturer le bail
              </button>
            )
          }
        >
          {!bailActif ? (
            <EmptyState
              icon={FileText}
              message={
                baux.length > 0
                  ? "Ce locataire n'a plus de bail en cours."
                  : "Aucun bail. Créez un bail sur un lot vacant pour commencer à encaisser."
              }
              action={
                <Link to={`/locataires/${id}/bail`} className="btn btn-primary" style={{ marginTop: "0.75rem" }}>
                  <Plus size={15} /> Créer un bail
                </Link>
              }
            />
          ) : (
            <dl className="info-list">
              <div>
                <dt>Lot</dt>
                <dd>
                  {lot ? (
                    <>
                      {lot.designation}
                      {lot.etage ? ` (${lot.etage})` : ""}
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt>Immeuble</dt>
                <dd>{immeuble ? <Link to={`/immeubles/${immeuble.id}`}>{immeuble.nom}</Link> : "—"}</dd>
              </div>
              <div>
                <dt>Loyer mensuel</dt>
                <dd>{formatMoney(bailActif.loyerMensuel)}</dd>
              </div>
              <div>
                <dt>Début du bail</dt>
                <dd className="row" style={{ gap: "0.3rem" }}>
                  <Calendar size={13} /> {formatDate(bailActif.dateDebut)}
                </dd>
              </div>
              <div>
                <dt>Fin du bail</dt>
                <dd>{bailActif.dateFin ? formatDate(bailActif.dateFin) : "—"}</dd>
              </div>
              <div>
                <dt>Caution</dt>
                <dd className="row" style={{ gap: "0.4rem" }}>
                  <Shield size={13} />
                  <Badge classe={caution.classe}>{caution.label}</Badge>
                  {bailActif.cautionVersee > 0 && <span>{formatMoney(bailActif.cautionVersee)}</span>}
                </dd>
              </div>
            </dl>
          )}
        </Card>
      </div>

      {/* Historique des baux, quand le locataire en a eu plusieurs. */}
      {baux.length > 1 && (
        <Card title="Historique des baux" style={{ marginBottom: "1rem" }}>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Début</th>
                  <th>Fin</th>
                  <th className="num">Loyer</th>
                  <th>Statut</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {baux.map((b) => {
                  const l = lotsParId.get(b.lotId);
                  const actif = bailEstActif(b);
                  return (
                    <tr key={b.id}>
                      <td>{l ? l.designation : "—"}</td>
                      <td>{formatDate(b.dateDebut)}</td>
                      <td>{b.dateFin ? formatDate(b.dateFin) : "—"}</td>
                      <td className="num">{formatMoney(b.loyerMensuel)}</td>
                      <td>
                        {actif ? (
                          <Badge classe="badge-green">En cours</Badge>
                        ) : (
                          <Badge classe="badge-neutral">Terminé</Badge>
                        )}
                      </td>
                      <td className="actions">
                        <button
                          type="button"
                          className="btn btn-small btn-danger"
                          onClick={() => setASupprimer(b.id)}
                          title="Supprimer ce bail"
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
        </Card>
      )}

      {bailActif ? (
        <CompteLocataire
          bailId={bailActif.id}
          loyersDe={loyersDe}
          paiementsDe={paiementsDe}
          quittancesParPaiement={quittancesParPaiement}
          saveLoyer={saveLoyer}
        />
      ) : (
        <Card>
          <EmptyState
            icon={FileText}
            message="Le compte s'affiche ici dès qu'un bail est en cours."
          />
        </Card>
      )}

      {aSupprimer === id && (
        <ConfirmDialog
          title="Supprimer le locataire"
          message={`Supprimer ${locataire.nom} ${locataire.prenoms} supprimera aussi ${baux.length} bail(s), les loyers, versements et quittances associés. Action irréversible.`}
          onConfirm={supprimerLocataire}
          onCancel={() => setASupprimer(null)}
        />
      )}

      {aSupprimer && aSupprimer !== id && (
        <ConfirmDialog
          title="Supprimer ce bail"
          message="Supprimer ce bail supprimera ses loyers, versements et quittances. Le locataire sera conservé, mais restera sans logement. Action irréversible."
          onConfirm={() => {
            removeBail(aSupprimer);
            addToast("Bail supprimé");
            setASupprimer(null);
          }}
          onCancel={() => setASupprimer(null)}
        />
      )}

      {sortie && (
        <Modal
          title="Clôturer le bail"
          onClose={() => setSortie(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setSortie(null)}>
                Annuler
              </button>
              <button type="button" className="btn btn-primary" onClick={cloturerBail}>
                Clôturer
              </button>
            </>
          }
        >
          <p className="text-muted">
            Le locataire partira de cette date. Les loyers déjà générés au-delà de cette date
            resteront visibles dans le compte, mais le lot sera considéré comme vacant.
          </p>
          <Field label="Date de sortie" required>
            <TextInput type="date" value={sortie} onChange={(e) => setSortie(e.target.value)} />
          </Field>
        </Modal>
      )}
    </div>
  );
}