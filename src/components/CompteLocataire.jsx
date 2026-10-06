// Compte du locataire : le relevé ligne à ligne des loyers et des règlements.
// C'est l'écran que le propriétaire consulte à la place de son cahier.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Receipt, ArrowRight } from "lucide-react";
import {
  formatMoney,
  formatDate,
  periodeToLabel,
  periodeToCourt,
  pluriel,
  accorde,
} from "../utils/format";
import { Card, EmptyState, Field, Modal, TextInput } from "./ui";
import { useToast } from "../context/ToastContext";

const POSTES = [
  { id: "loyer", label: "Loyer" },
  { id: "eau", label: "Eau" },
  { id: "electricite", label: "Électricité" },
  { id: "orduresMenageres", label: "Ordures ménagères" },
  { id: "autre1", label: "Autre 1" },
  { id: "autre2", label: "Autre 2" },
];

function montantPoste(loyer, poste) {
  if (loyer[poste] !== undefined) return Number(loyer[poste]) || 0;
  return poste === "loyer" ? Number(loyer.montantDu) || 0 : 0;
}

/**
 * @param {object} props
 * @param {string} props.bailId
 * @param {boolean} props.compact  limite le nombre de lignes affichées
 */
export default function CompteLocataire({
  bailId,
  loyersDe,
  paiementsDe,
  quittancesParPaiement,
  saveLoyer,
  compact = false,
}) {
  const loyers = useMemo(() => loyersDe(bailId), [loyersDe, bailId]);
  const paiements = useMemo(() => paiementsDe(bailId), [paiementsDe, bailId]);
  const { addToast } = useToast();
  const [loyerEnEdition, setLoyerEnEdition] = useState(null);
  const [montants, setMontants] = useState(null);
  const [erreurEdition, setErreurEdition] = useState("");

  // Solde cumulé, mois après mois : c'est la colonne qui sert à retrouver
  // « depuis quand il me doit de l'argent ». On repart des allocations réelles.
  const lignes = useMemo(() => {
    const payeParLoyer = new Map();
    for (const p of paiements) {
      for (const a of p.allocations || []) {
        payeParLoyer.set(a.loyerId, (payeParLoyer.get(a.loyerId) || 0) + a.montant);
      }
    }
    // Solde cumulé : on le porte dans chaque ligne via reduce, sans variable
    // partagée entre deux rendus.
    return loyers.reduce(
      (acc, l) => {
        const paye = payeParLoyer.get(l.id) || 0;
        const precedent = acc.length ? acc[acc.length - 1].solde : 0;
        const solde = precedent + l.montantDu - paye;
        acc.push({ loyer: l, paye, solde });
        return acc;
      },
      []
    );
  }, [loyers, paiements]);

  const affichees = compact ? lignes.slice(-6) : lignes;
  const masquees = lignes.length - affichees.length;

  const totauxPostes = Object.fromEntries(
    POSTES.map(({ id }) => [
      id,
      loyers.reduce((total, l) => total + montantPoste(l, id), 0),
    ])
  );
  const totalDu = loyers.reduce((s, l) => s + l.montantDu, 0);
  const totalPaye = paiements.reduce((s, p) => s + p.montant, 0);
  const soldeFinal = totalDu - totalPaye;
  const payePourLoyerEnEdition = loyerEnEdition
    ? paiements.reduce(
        (total, paiement) =>
          total + (paiement.allocations || [])
            .filter((allocation) => allocation.loyerId === loyerEnEdition.id)
            .reduce((sousTotal, allocation) => sousTotal + allocation.montant, 0),
        0
      )
    : 0;
  const totalEnEdition = montants
    ? POSTES.reduce((total, { id }) => total + (Number(montants[id]) || 0), 0)
    : 0;

  // Les derniers versements, pour la colonne de droite du détail locataire.
  const derniersPaiements = paiements.slice(0, 4);

  const ouvrirEdition = (loyer) => {
    setLoyerEnEdition(loyer);
    setMontants(Object.fromEntries(POSTES.map(({ id }) => [id, String(montantPoste(loyer, id))])));
    setErreurEdition("");
  };

  const enregistrerPostes = () => {
    const saisieInvalide = POSTES.some(
      ({ id }) => montants[id] !== "" && !/^\d+$/.test(montants[id])
    );
    const data = Object.fromEntries(POSTES.map(({ id }) => [id, Number(montants[id]) || 0]));
    if (saisieInvalide || Object.values(data).some((montant) => !Number.isSafeInteger(montant))) {
      setErreurEdition("Saisissez des montants entiers positifs ou nuls.");
      return;
    }
    const resultat = saveLoyer(loyerEnEdition.id, data);
    if (!resultat.ok) {
      setErreurEdition(resultat.erreur);
      return;
    }
    addToast(`Frais de ${periodeToLabel(loyerEnEdition.periode)} enregistrés`);
    setLoyerEnEdition(null);
  };

  return (
    <div className="stack">
      <Card
        title="Compte du locataire — détail mensuel"
        className="tenant-account-card"
        action={
          compact && masquees > 0 ? (
            <span className="text-muted" style={{ fontSize: "0.8rem" }}>
              {`${pluriel(masquees, "période")} antérieure${accorde(masquees)}`}
            </span>
          ) : null
        }
      >
        <p className="text-muted" style={{ margin: "0 0 0.85rem", fontSize: "0.84rem" }}>
          Les frais de chaque mois sont additionnés dans « Total dû ». « Payé » indique ce qui a été versé pour le mois ;
          le « Solde cumulé » montre ce qu’il reste à payer depuis le début du bail. Tous les montants sont en FCFA.
          {!compact && saveLoyer && " Cliquez sur le crayon à côté d’un mois pour modifier ses frais."}
        </p>
        {loyers.length === 0 ? (
          <EmptyState
            message="Aucun loyer généré pour ce bail. Utilisez « Générer les loyers » pour reconstituer l'historique."
          />
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Mois</th>
                  {POSTES.map(({ id, label }) => <th key={id} className="num">{label}</th>)}
                  <th className="num" title="Somme des frais du mois">Total dû</th>
                  <th className="num" title="Paiements imputés à ce mois">Payé</th>
                  <th className="num" title="Montant restant dû depuis le début du bail">Solde cumulé</th>
                </tr>
              </thead>
              <tbody>
                {affichees.map(({ loyer, paye, solde }) => {
                  return (
                    <tr key={loyer.id}>
                      <td title={periodeToLabel(loyer.periode)}>
                        <span>{periodeToCourt(loyer.periode)}</span>
                        {!compact && saveLoyer && (
                          <button
                            type="button"
                            className="btn btn-small btn-ghost"
                            style={{ marginLeft: "0.25rem" }}
                            onClick={() => ouvrirEdition(loyer)}
                            aria-label={`Modifier les frais de ${periodeToLabel(loyer.periode)}`}
                            title="Modifier les frais"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                      </td>
                      {POSTES.map(({ id }) => (
                        <td key={id} className="num">
                          {formatMoney(montantPoste(loyer, id))}
                        </td>
                      ))}
                      <td className="num">{formatMoney(loyer.montantDu)}</td>
                      <td className="num">{paye > 0 ? formatMoney(paye) : "—"}</td>
                      <td className="num">
                        <span style={{ color: solde > 0 ? "var(--danger)" : "var(--success)", fontWeight: 600 }}>
                          {solde === 0 ? "À jour" : `${formatMoney(Math.abs(solde))} ${solde > 0 ? "à payer" : "de crédit"}`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <th>Total</th>
                  {POSTES.map(({ id }) => (
                    <th key={id} className="num">{formatMoney(totauxPostes[id])}</th>
                  ))}
                  <th className="num">{formatMoney(totalDu)}</th>
                  <th className="num">{formatMoney(totalPaye)}</th>
                  <th className="num">
                    <span style={{ color: soldeFinal > 0 ? "var(--danger)" : "var(--success)", fontSize: "1rem" }}>
                      {soldeFinal === 0 ? "À jour" : `${formatMoney(Math.abs(soldeFinal))} ${soldeFinal > 0 ? "à payer" : "de crédit"}`}
                    </span>
                  </th>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {loyerEnEdition && montants && (
        <Modal
          title={`Frais — ${periodeToLabel(loyerEnEdition.periode)}`}
          onClose={() => setLoyerEnEdition(null)}
          width="560px"
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setLoyerEnEdition(null)}>
                Annuler
              </button>
              <button type="button" className="btn btn-primary" onClick={enregistrerPostes}>
                Enregistrer
              </button>
            </>
          }
        >
          <p className="text-muted" style={{ marginTop: 0 }}>
            Saisissez les frais applicables pour ce mois. Le total dû est calculé automatiquement.
          </p>
          <div className="form-grid">
            {POSTES.map(({ id, label }) => (
              <Field key={id} label={`${label} (FCFA)`} htmlFor={`frais-${id}`}>
                <TextInput
                  id={`frais-${id}`}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={montants[id]}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setMontants((actuels) => ({ ...actuels, [id]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
          <p style={{ margin: "0.75rem 0 0", fontWeight: 600 }}>
            Total : {formatMoney(totalEnEdition)}
          </p>
          {totalEnEdition < payePourLoyerEnEdition && (
            <p className="text-muted" style={{ margin: "0.5rem 0 0", fontSize: "0.84rem" }}>
              Ce total est inférieur au paiement déjà reçu ({formatMoney(payePourLoyerEnEdition)}).
              La différence sera ajoutée au crédit du locataire.
            </p>
          )}
          {erreurEdition && (
            <p className="error-text" role="alert" style={{ marginTop: "0.5rem" }}>{erreurEdition}</p>
          )}
        </Modal>
      )}

      <Card title="Derniers versements">
        {derniersPaiements.length === 0 ? (
          <EmptyState message="Aucun versement enregistré." />
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Montant</th>
                  <th>Quittance</th>
                </tr>
              </thead>
              <tbody>
                {derniersPaiements.map((p) => {
                  const q = quittancesParPaiement.get(p.id);
                  return (
                    <tr key={p.id}>
                      <td>
                        {formatDate(p.date)}
                        {p.note && (
                          <div className="text-muted" style={{ fontSize: "0.76rem" }}>
                            {p.note}
                          </div>
                        )}
                      </td>
                      <td className="num">{formatMoney(p.montant)}</td>
                      <td>
                        {q ? (
                          <Link to={`/quittances/${q.id}`} className="btn btn-small btn-ghost" title={q.numero}>
                            <Receipt size={14} />
                          </Link>
                        ) : (
                          <span className="text-muted" style={{ fontSize: "0.78rem" }}>
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!compact && (
          <Link to="/paiements" className="btn btn-small btn-secondary" style={{ marginTop: "0.9rem" }}>
            Voir tous les versements <ArrowRight size={14} />
          </Link>
        )}
      </Card>
    </div>
  );
}