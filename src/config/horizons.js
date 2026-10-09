// Horizons et étendues d'affichage, regroupés en un seul endroit.
//
// Ces valeurs étaient dispersées dans les pages, en dur, et limitaient
// l'application au bout de quelques années : une liste de mois qui s'arrêtait
// à dix-huit mois ne permettait plus d'encaisser un loyer sur un bail de trois
// ans. Un logiciel de gestion locative se garde des décennies ; une borne
// temporelle écrite dans une page est un bogue daté qui ne demande qu'à
// revenir.
//
// La règle suivie ici : ne jamais limiter une liste à une durée arbitraire.
// On borne par les *données réelles* (premier loyer généré, fin de bail) et,
// quand une borne de confort reste nécessaire, on la déclare ici pour être
// ajustée en un seul endroit.

/**
 * Mois d'avance proposés par le sélecteur de période d'encaissement, après la
 * date du jour.
 *
 * Un bail peut être encaissé d'avance sur des années — un propriétaire reçoit
 * parfois plusieurs loyers d'un coup. 60 mois couvrent cinq années de paiement
 * anticipé, ce qui couvre les besoins. Au-delà, il suffit d'encaisser
 * plusieurs fois : c'est le geste normal.
 */
export const MOIS_ENCAISSEMENT_AVANCE = 60;

/** Choix proposés pour l'étendue du graphique du tableau de bord. */
export const PERIODES_GRAPHIQUE = [
  { valeur: 6, label: "6 mois" },
  { valeur: 12, label: "12 mois" },
  { valeur: 24, label: "24 mois" },
  { valeur: 36, label: "3 ans" },
  { valeur: 60, label: "5 ans" },
];