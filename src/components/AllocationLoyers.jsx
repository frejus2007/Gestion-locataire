import { useMemo } from "react";
import { formatMoney, periodeToLabel } from "../utils/format";
import { Check } from "lucide-react";

export default function AllocationLoyers({ impayes, allocations, onChange, resteDuLoyer }) {
  const lignes = useMemo(
    () =>
      impayes.map((loyer) => ({
        loyerId: loyer.id,
        label: periodeToLabel(loyer.periode),
        montantDu: loyer.montantDu,
        reste: resteDuLoyer(loyer.id),
      })),
    [impayes, resteDuLoyer]
  );
  const montants = new Map(allocations.map(({ loyerId, montant }) => [loyerId, montant]));

  const definir = (loyerId, valeur) => {
    const ligne = lignes.find((item) => item.loyerId === loyerId);
    const montant = Math.max(0, Math.min(Number(valeur) || 0, ligne?.reste || 0));
    const suivants = new Map(montants);
    suivants.set(loyerId, montant);
    onChange(
      lignes
        .filter((item) => (suivants.get(item.loyerId) || 0) > 0)
        .map((item) => ({ loyerId: item.loyerId, montant: suivants.get(item.loyerId) }))
    );
  };

  if (lignes.length === 0) {
    return <p className="text-muted" style={{ margin: 0 }}>Aucun mois impayé à régler.</p>;
  }

  return (
    <div>
      <p className="text-muted" style={{ margin: "0 0 0.6rem", fontSize: "0.84rem" }}>
        Cochez les mois à régler et indiquez le montant pour chacun. Le surplus sera affecté aux mois suivants.
      </p>
      {lignes.map((ligne) => {
        const montant = montants.get(ligne.loyerId) || 0;
        return (
          <div className="alloc-row" key={ligne.loyerId}>
            <div>
              <div className="alloc-periode">{ligne.label}</div>
              <div className="alloc-reste">
                Reste dû : {formatMoney(ligne.reste)}
                {ligne.reste < ligne.montantDu && ` sur ${formatMoney(ligne.montantDu)}`}
              </div>
            </div>
            <button
              type="button"
              className={`alloc-toggle ${montant > 0 ? "on" : ""}`}
              onClick={() => definir(ligne.loyerId, montant > 0 ? 0 : ligne.reste)}
              aria-pressed={montant > 0}
              aria-label={montant > 0 ? `Retirer ${ligne.label}` : `Inclure ${ligne.label}`}
              title={montant > 0 ? "Retirer ce mois" : "Sélectionner ce mois"}
            >
              {montant > 0 && <Check size={16} />}
            </button>
            <input
              type="number"
              className="input alloc-input"
              min="0"
              max={ligne.reste}
              step="1"
              value={montant}
              onChange={(event) => definir(ligne.loyerId, event.target.value)}
              aria-label={`Montant affecté à ${ligne.label}`}
            />
          </div>
        );
      })}
    </div>
  );
}
