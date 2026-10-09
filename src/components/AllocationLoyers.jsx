// Choix des mois réglés par un encaissement.
//
// Le montant n'est pas saisi : il découle des frais que le propriétaire vient
// de renseigner pour le mois. On coche les périodes soldées, le total s'ajuste.
// Un mois peut être réglé partiellement (le locataire donne moins que le dû),
// ce qui laisse le solde ouvert sur le relevé.

import { useMemo } from "react";
import { Check } from "lucide-react";
import { formatMoney, periodeToLabel } from "../utils/format";
import { Badge } from "./ui";

/**
 * @param {object} props
 * @param {Array}  props.impayes        périodes non soldées, de la plus ancienne à la plus récente
 * @param {number} props.montantMois    montant dû d'un mois (loyer + frais saisis)
 * @param {Set|Array} props.coches      périodes actuellement cochées
 * @param {Function} props.onChangeCoche (loyerId, coche) => void
 * @param {Function} props.onChangePartiel (loyerId, montant) => void
 * @param {object} props.partiels       { loyerId: montant } pour les règlements partiels
 * @param {number} props.resteDuLoyer   (loyerId) => reste dû, pour information
 */
export default function AllocationLoyers({
  impayes,
  montantMois,
  coches,
  onChangeCoche,
  onChangePartiel,
  partiels = {},
}) {
  const estCoche = useMemo(
    () => (id) => (coches instanceof Set ? coches.has(id) : coches.includes(id)),
    [coches]
  );

  const tousCoches = impayes.length > 0 && impayes.every((l) => estCoche(l.id));

  const basculerTout = () => {
    const nouvelle = !tousCoches;
    for (const l of impayes) onChangeCoche(l.id, nouvelle);
  };

  if (impayes.length === 0) {
    return (
      <p className="text-muted" style={{ margin: 0 }}>
        Ce locataire n'a aucun loyer impayé. Un versement ne peut pas être enregistré sans période à solder.
      </p>
    );
  }

  const total = impayes
    .filter((l) => estCoche(l.id))
    .reduce((s, l) => s + (partiels[l.id] ?? montantMois), 0);

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <span className="text-muted" style={{ fontSize: "0.85rem" }}>
          {impayes.length === 1 ? "1 période impayée" : `${impayes.length} périodes impayées`}
        </span>
        <button type="button" className="btn btn-small btn-secondary" onClick={basculerTout}>
          {tousCoches ? "Tout décocher" : "Tout cocher"}
        </button>
      </div>

      {impayes.map((l) => {
        const coche = estCoche(l.id);
        const montant = partiels[l.id] ?? montantMois;
        const partiel = montant < l.montantDu;
        return (
          <div className="alloc-row" key={l.id}>
            <div>
              <div className="alloc-periode">{periodeToLabel(l.periode)}</div>
              <div className="alloc-reste">
                Dû {formatMoney(l.montantDu)}
                {partiel && " — règlement partiel"}
              </div>
            </div>

            <button
              type="button"
              className={`alloc-toggle ${coche ? "on" : ""}`}
              onClick={() => onChangeCoche(l.id, !coche)}
              aria-pressed={coche}
              aria-label={coche ? `Ne pas régler ${periodeToLabel(l.periode)}` : `Régler ${periodeToLabel(l.periode)}`}
              title={coche ? "Ne pas régler ce mois" : "Régler ce mois"}
            >
              {coche && <Check size={16} />}
            </button>

            {coche ? (
              <input
                type="number"
                className="input alloc-input"
                min="0"
                max={l.montantDu}
                step="1"
                value={montant}
                onChange={(e) => onChangePartiel(l.id, e.target.value)}
                aria-label={`Montant réglé pour ${periodeToLabel(l.periode)}`}
              />
            ) : (
              <div className="alloc-input" style={{ textAlign: "right", color: "var(--text-muted)" }}>
                <Badge classe="badge-neutral">non réglé</Badge>
              </div>
            )}
          </div>
        );
      })}

      <div
        className="row"
        style={{
          justifyContent: "space-between",
          marginTop: "0.9rem",
          paddingTop: "0.9rem",
          borderTop: "1px solid var(--border)",
          fontWeight: 600,
        }}
      >
        <span>
          {impayes.filter((l) => estCoche(l.id)).length} mois coché
          {impayes.filter((l) => estCoche(l.id)).length > 1 ? "s" : ""}
        </span>
        <span>{formatMoney(total)}</span>
      </div>

      {total === 0 && (
        <p className="error-text" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
          Cochez au moins un mois à régler avant d'enregistrer.
        </p>
      )}
    </div>
  );
}