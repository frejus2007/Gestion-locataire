// Saisie des frais d'un mois.
// Le loyer est repris du bail ; les six autres postes sont cochés et saisis
// quand ils s'appliquent. Le total est calculé, jamais tapé : c'est lui qui
// détermine ce que le locataire doit ce mois-ci.

import { formatMoney } from "../utils/format";
import { TextInput } from "./ui";

/**
 * @param {object} props
 * @param {object} props.detail       { loyer, eau, … } montantsCurrently saisis
 * @param {Set|Array} props.actives   postes cochés (clé = poste.key)
 * @param {Array}  props.postes       lignes à afficher, avec leur libellé
 * @param {Function} props.onToggle   (posteKey) => void
 * @param {Function} props.onChange   (poste, valeur) => void
 * @param {Function} props.onLibelle  (poste, texte) => void
 * @param {number} props.total
 * @param {boolean} props.onLectureSeule  ne pas laisser modifier le loyer
 */
export default function BlocFrais({
  detail,
  actives,
  postes,
  onToggle,
  onChange,
  onLibelle,
  total,
  onLectureSeule = false,
}) {
  const estActif = (key) => (actives instanceof Set ? actives.has(key) : actives.includes(key));

  return (
    <div>
      <div className="alloc-row" style={{ borderBottom: "2px solid var(--border)", paddingBottom: "0.5rem" }}>
        <div>
          <div className="bloc-frais-titre">Facture du mois</div>
          <div className="alloc-reste">Cochez les charges appliquées ce mois-ci</div>
        </div>
        <div />
        <div className="alloc-input alloc-total">{formatMoney(total)}</div>
      </div>

      {postes.map((poste) => {
        const estLoyer = poste.key === "loyer";
        // Le loyer est toujours présent ; les autres dépendent d'une case
        // explicite, pas du montant : décocher ne doit pas effacer la saisie.
        const actif = estLoyer || estActif(poste.key);
        const valeur = detail[poste.key] ?? 0;

        return (
          <div className={`alloc-row bloc-frais-ligne${actif ? " actif" : ""}`} key={poste.key}>
            <div className="bloc-frais-libelle">
              {estLoyer ? (
                <span className="alloc-periode">{poste.label}</span>
              ) : (
                <>
                  <label className="bloc-frais-case" htmlFor={`frais-case-${poste.key}`}>
                    <input
                      id={`frais-case-${poste.key}`}
                      type="checkbox"
                      checked={actif}
                      onChange={() => onToggle(poste.key)}
                    />
                    <span className="bloc-frais-case-nom">{poste.label}</span>
                  </label>
                  {poste.libre && (
                    <input
                      type="text"
                      className="input bloc-frais-renom"
                      value={poste.nomLibelle ?? poste.label}
                      onChange={(e) => onLibelle(poste.key, e.target.value)}
                      placeholder="Renommer cette charge"
                      aria-label={`Nom de la charge ${poste.label}`}
                    />
                  )}
                </>
              )}
            </div>

            <div />

            {actif ? (
              <TextInput
                type="number"
                className="input alloc-input"
                min="0"
                step="1"
                value={String(valeur)}
                onChange={(e) => onChange(poste.key, e.target.value)}
                disabled={estLoyer && onLectureSeule}
                aria-label={`Montant de ${poste.label}`}
              />
            ) : (
              <div className="alloc-input bloc-frais-absent">non facturé</div>
            )}
          </div>
        );
      })}

      <p className="text-muted bloc-frais-note">
        Ce total devient le montant dû du mois. Il sera reporté sur la quittance et sur le
        relevé du locataire.
      </p>
    </div>
  );
}