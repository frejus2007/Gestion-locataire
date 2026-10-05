// Allocation d'un versement sur les loyers.
//
// C'est le cœur de l'encaissement : le propriétaire indique un montant, et
// l'application le répartit sur les périodes impayées, de la plus ancienne à la
// plus récente. Tout reste modifiable à la main.

import { useMemo, useState } from "react";
import { formatMoney, periodeToLabel, pluriel, accorde } from "../utils/format";
import { Check } from "lucide-react";

/**
 * @param {object} props
 * @param {Array}  props.impayes       loyers non soldés, du plus ancien au plus récent
 * @param {number} props.montant       montant total versé par le locataire
 * @param {Function} props.onChange     reçoit [{loyerId, montant}]
 */
export default function AllocationLoyers({ impayes, montant, onChange, resteDuLoyer }) {
  const [manuel, setManuel] = useState({});

  const lignes = useMemo(
    () =>
      impayes.map((l) => ({
        loyerId: l.id,
        periode: l.periode,
        label: periodeToLabel(l.periode),
        montantDu: l.montantDu,
        reste: resteDuLoyer(l.id),
        // Un loyer déjà soldé ne peut rien recevoir.
        solde: resteDuLoyer(l.id) === 0,
      })),
    [impayes, resteDuLoyer]
  );

  // Répartition proposée : on solde les impayés du plus ancien au plus récent.
  const propose = useMemo(() => {
    let budget = Number(montant) || 0;
    const out = {};
    for (const l of lignes) {
      if (budget <= 0) {
        out[l.loyerId] = 0;
        continue;
      }
      const affecte = Math.min(budget, l.reste);
      out[l.loyerId] = affecte;
      budget -= affecte;
    }
    return out;
  }, [lignes, montant]);

  const valeurs = { ...propose, ...manuel };

  const totalAffecte = lignes.reduce((s, l) => s + (valeurs[l.loyerId] || 0), 0);
  const nonAlloue = (Number(montant) || 0) - totalAffecte;

  const definir = (loyerId, valeur) => {
    const v = valeur === "" ? 0 : Math.max(0, Math.min(Number(valeur) || 0, lignes.find((l) => l.loyerId === loyerId)?.reste ?? 0));
    setManuel((m) => ({ ...m, [loyerId]: v }));
    // On propage immédiatement pour que le parent voie le total à jour.
    const suivant = { ...valeurs, [loyerId]: v };
    onChange(
      lignes
        .filter((l) => (suivant[l.loyerId] || 0) > 0)
        .map((l) => ({ loyerId: l.loyerId, montant: Math.round(suivant[l.loyerId]) }))
    );
  };

  const basculer = (l) => {
    definir(l.loyerId, (valeurs[l.loyerId] || 0) > 0 ? 0 : l.reste);
  };

  const remplirTout = () => {
    const tous = Object.fromEntries(lignes.map((l) => [l.loyerId, l.reste]));
    setManuel(tous);
    onChange(lignes.filter((l) => l.reste > 0).map((l) => ({ loyerId: l.loyerId, montant: l.reste })));
  };

  const repartir = () => {
    setManuel({});
    onChange(
      lignes
        .filter((l) => (propose[l.loyerId] || 0) > 0)
        .map((l) => ({ loyerId: l.loyerId, montant: Math.round(propose[l.loyerId]) }))
    );
  };

  if (lignes.length === 0) {
    return (
      <p className="text-muted" style={{ margin: 0 }}>
        Ce locataire n'a aucun loyer impayé. Un versement ne peut pas être enregistré sans période à solder.
      </p>
    );
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <span className="text-muted" style={{ fontSize: "0.85rem" }}>
          Répartition sur {`${pluriel(lignes.length, "période")} impayée${accorde(lignes.length)}`}
        </span>
        <span className="row" style={{ gap: "0.4rem" }}>
          <button type="button" className="btn btn-small btn-secondary" onClick={repartir}>
            Ancienneté
          </button>
          <button type="button" className="btn btn-small btn-secondary" onClick={remplirTout}>
            Tout solder
          </button>
        </span>
      </div>

      {lignes.map((l) => {
        const v = valeurs[l.loyerId] || 0;
        return (
          <div className="alloc-row" key={l.loyerId}>
            <div>
              <div className="alloc-periode">{l.label}</div>
              <div className="alloc-reste">
                Reste {formatMoney(l.reste)}
                {l.reste < l.montantDu && ` sur ${formatMoney(l.montantDu)}`}
              </div>
            </div>

            <button
              type="button"
              className={`alloc-toggle ${v > 0 ? "on" : ""}`}
              onClick={() => basculer(l)}
              aria-pressed={v > 0}
              aria-label={v > 0 ? `Retirer ${l.label}` : `Solder ${l.label}`}
              title={v > 0 ? "Retirer cette période" : "Solder cette période"}
            >
              {v > 0 && <Check size={16} />}
            </button>

            <input
              type="number"
              className="input alloc-input"
              min="0"
              max={l.reste}
              step="1"
              value={v}
              onChange={(e) => definir(l.loyerId, e.target.value)}
              aria-label={`Montant alloué à ${l.label}`}
            />
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
          Alloué <span className="mono">{formatMoney(totalAffecte)}</span>
        </span>
        {nonAlloue !== 0 ? (
          <span style={{ color: nonAlloue > 0 ? "var(--warning)" : "var(--danger)" }}>
            {nonAlloue > 0 ? "Reste à affecter " : "Sur-affecté "}
            {formatMoney(Math.abs(nonAlloue))}
          </span>
        ) : (
          <span style={{ color: "var(--success)" }}>Montant entièrement réparti</span>
        )}
      </div>

      {nonAlloue !== 0 && (
        <p className="error-text" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
          La totalité du versement doit être répartie sur une ou plusieurs périodes avant de valider.
        </p>
      )}
    </div>
  );
}