// Contexte applicatif : expose les données et les sélecteurs dérivés.
//
// Les composants ne calculent jamais un solde eux-mêmes : ils appellent les
// sélecteurs ci-dessous, qui sont la seule source de vérité des montants.
//
// Firestore est asynchrone : la lecture ne peut pas être faite pendant le
// rendu. Les données vivent donc dans un état, chargées au montage et
// rechargées après chaque écriture.

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from "react";
import * as db from "../data/db.supabase";
import { useAuth } from "./AuthContext";
import {
  fusionner,
  supprimerBail,
  supprimerImmeuble,
  supprimerLocataire,
  supprimerPaiement,
} from "./optimiste";
import { comparePeriode, periodeCourante } from "../utils/format";

const { CATEGORIES_DEPENSE, MOIS_DE_PAYEMENT, LIGNES_FRAIS } = db;

const AppContext = createContext(null);

// Délai au-delà duquel une lecture est réputée morte. Assez long pour une
// connexion mobile lente, assez court pour que le propriétaire ne croie pas à
// un gel de l'application.
const DELAI_LECTURE = 12000;

const VIDE = {
  proprietaire: null,
  immeubles: [],
  lots: [],
  locataires: [],
  baux: [],
  loyers: [],
  paiements: [],
  depenses: [],
  quittances: [],
};

export function AppProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [donnees, setDonnees] = useState(VIDE);
  // Dernier état connu, lisible sans attendre le rendu : une action enchaînée
  // juste après une autre doit partir de l'état déjà modifié.
  const donneesRef = useRef(VIDE);
  donneesRef.current = donnees;
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(null);

  // Relit l'ensemble de la base. Volontairement exhaustive plutôt que ciblée :
  // le volume d'un parc locatif tient largement en mémoire, et un rechargement
  // partiel finit toujours par laisser un écran incohérent.
  //
  // Renvoie les données lues : après une écriture, l'appelant a souvent besoin
  // du document qu'il vient de créer (un loyer à imputer, un lot à ouvrir).
  // Se fier à l'état du composant ne marcherait pas — il date du rendu
  // précédent, donc d'avant l'écriture.
  // Les lectures de chaque collection, réutilisées par `refresh` et par
  // `refreshPartiel`. Isolées ici pour que les deux chemins partagent
  // exactement les mêmes appels.
  const LECTEURS = {
    proprietaire: () => db.getProprietaire(),
    immeubles: () => db.listImmeubles(),
    lots: () => db.listLots(),
    locataires: () => db.listLocataires(),
    baux: () => db.listBaux(),
    loyers: () => db.listLoyers(),
    paiements: () => db.listPaiements(),
    depenses: () => db.listDepenses(),
    quittances: () => db.listQuittances(),
  };

  const TOUTES = Object.keys(LECTEURS);

  // Un canal Firestore interrompu — réseau coupé, onglet réveillé après une
  // longue veille — laisse une promesse en suspens au lieu de la rejeter. Sans
  // ce délai, l'interface attendrait indéfiniment.
  const avecDelai = (promesses) =>
    Promise.race([
      promesses,
      new Promise((_, rejeter) =>
        setTimeout(() => rejeter(new Error("Le serveur ne répond pas")), DELAI_LECTURE)
      ),
    ]);

  /**
   * Relit tout. Réservé au démarrage et aux retours d'onglet.
   *
   * Une relecture déjà en vol est partagée : le retour sur l'onglet déclenche à
   * la fois `visibilitychange` et `focus`, et deux relectures complètes partaient
   * alors en parallèle pour le même résultat.
   */
  const relectureEnVol = useRef(null);
  // Chaque relecture porte un numéro d'ordre. Deux relectures peuvent se
  // croiser, l'action suivante ne les attend plus : la plus ancienne ne doit
  // jamais écraser une collection déjà relue plus récemment.
  const ordre = useRef(0);
  const dernierAppliquee = useRef({});
  const appliquer = useCallback((maj, rang) => {
    const retenues = {};
    for (const [c, valeur] of Object.entries(maj)) {
      if (rang > (dernierAppliquee.current[c] ?? 0)) {
        retenues[c] = valeur;
        dernierAppliquee.current[c] = rang;
      }
    }
    if (Object.keys(retenues).length) setDonnees((d) => ({ ...d, ...retenues }));
  }, []);
  const refresh = useCallback(() => {
    if (relectureEnVol.current) return relectureEnVol.current;
    const rang = ++ordre.current;
    relectureEnVol.current = (async () => {
      try {
        const cles = TOUTES;
        const valeurs = await avecDelai(Promise.all(cles.map((c) => LECTEURS[c]())));
        const lu = Object.fromEntries(cles.map((c, i) => [c, valeurs[i]]));
        appliquer(lu, rang);
        setErreur(null);
        return lu;
      } catch (e) {
        setErreur(e.message);
        return null;
      } finally {
        setLoading(false);
      }
    })().finally(() => {
      relectureEnVol.current = null;
    });
    return relectureEnVol.current;
  }, []);

  /**
   * Ne relit que les collections que l'écriture a pu toucher.
   *
   * C'est le dernier poste de lenteur : après un simple enregistrement de
   * locataire, l'application relisait les neuf collections — neuf requêtes
   * d'environ une seconde — pour n'en voir changer qu'une ou deux.
   */
  const refreshPartiel = useCallback(async (cles) => {
    const utiles = cles.filter((c) => LECTEURS[c]);
    if (!utiles.length) return null;
    const rang = ++ordre.current;
    try {
      const valeurs = await avecDelai(Promise.all(utiles.map((c) => LECTEURS[c]())));
      const maj = Object.fromEntries(utiles.map((c, i) => [c, valeurs[i]]));
      appliquer(maj, rang);
      setErreur(null);
      return maj;
    } catch (e) {
      setErreur(e.message);
      return null;
    }
  }, []);

  // Les règles Firestore n'autorisent que l'utilisateur connecté. Charger au
  // montage seul serait donc une faute : la lecture partirait avant la session
  // et tous les appels seraient refusés, sans qu'aucun rechargement ne
  // rattrape l'erreur ensuite. On attend donc la connexion — et on vide les
  // données à la déconnexion, pour qu'un autre compte ne voie pas les siennes.
  // Écoute en continu de la base. Chaque changement arrive dès qu'il est
  // appliqué localement, avant la confirmation du serveur ; une coupure se
  // rétablit seule, sans relecture périodique ni relecture au retour sur l'onglet.
  useEffect(() => {
    if (!isAuthenticated) {
      setDonnees(VIDE);
      setLoading(false);
      return undefined;
    }
    return db.ecouterDonnees({
      onChangement: (cle, valeur) => setDonnees((d) => ({ ...d, [cle]: valeur })),
      onPret: () => {
        setLoading(false);
        setErreur(null);
      },
      onErreur: (message) => setErreur(message),
    });
  }, [isAuthenticated]);

  // Rattrapage des loyers du mois à l'ouverture. La tâche quotidienne de la base
  // les crée déjà ; cet appel ne fait rien si tout est à jour.
  useEffect(() => {
    if (!isAuthenticated) return;
    db.genererLoyersEchus().catch((e) => console.error("Génération des loyers :", e));
  }, [isAuthenticated]);

  // Une coupure réseau est signalée : les chiffres affichés peuvent être
  // périmés tant que la connexion ne revient pas.
  useEffect(() => {
    const sortir = () =>
      setErreur("Connexion Internet perdue — les chiffres affichés peuvent être périmés");
    const revenir = () => setErreur(null);
    window.addEventListener("offline", sortir);
    window.addEventListener("online", revenir);
    return () => {
      window.removeEventListener("offline", sortir);
      window.removeEventListener("online", revenir);
    };
  }, []);

  // Exécute une écriture, recharge ce qui a changé, et propage le résultat.
  // Toujours `{ ok, resultat }` ou `{ ok: false, erreur }` : les pages
  // testent `res.ok` et affichent `res.erreur`.
  //
  // `coles` liste les collections que l'action a pu modifier. Les énumérer est
  // indispensable : une relecture trop large coûte des secondes, une relecture
  // trop étroite afficherait des données périmées jusqu'à la relecture
  // périodique. Le oubli le plus coûteux étant l'encaissement, qui touche les
  // loyers autant que les paiements, il est traité explicitement.
  //
  // La relecture ne retient pas l'utilisateur : dès que l'écriture est confirmée,
  // la réponse part et la base se met à jour en arrière-plan. Une action qui a
  // besoin des données fraîches — l'encaissement, qui lit les loyers qu'il vient
  // de créer — passe `attendre: true`.
  const run = useCallback(
    async (action, coles = TOUTES, { attendre = false } = {}) => {
      setLoading(true);
      try {
        const resultat = await action();
        const relecture = refreshPartiel(coles);
        const donnees = attendre ? await relecture : null;
        setLoading(false);
        return { ok: true, resultat, donnees };
      } catch (e) {
        refreshPartiel(coles);
        setErreur(e.message);
        setLoading(false);
        return { ok: false, erreur: e.message };
      }
    },
    [refreshPartiel]
  );

  // Écriture optimiste : l'affichage change tout de suite, puis le serveur confirme.
  // `patch` reçoit l'état connu et renvoie les listes à remplacer. Si l'écriture
  // échoue, `run` relit les collections concernées : l'état réel revient seul.
  const lancer = useCallback(
    (patch, ecriture, coles, options) => {
      if (patch) {
        const nouveau = patch(donneesRef.current);
        donneesRef.current = { ...donneesRef.current, ...nouveau };
        setDonnees((d) => ({ ...d, ...nouveau }));
      }
      return run(ecriture, coles, options);
    },
    [run]
  );

  const actions = useMemo(() => {
    // Crée une ligne (identifiant choisi ici, pour l'afficher avant l'écriture)
    // ou modifie une ligne existante.
    const sauver = (cle, prefixe, { creer, modifier }, data, id, coles) => {
      const cible = id || db.nextId(prefixe);
      const ligne = { ...data, id: cible };
      return lancer(
        (d) => ({ [cle]: fusionner(d[cle], [ligne]) }),
        () => (id ? modifier(id, data) : creer(ligne)),
        coles
      );
    };
    const retirerLigne = (cle, id, ecriture, coles) =>
      lancer((d) => ({ [cle]: d[cle].filter((x) => x.id !== id) }), ecriture, coles);

    return {
      refresh,
      run,
      // Contrôle un encaissement sans l'écrire, pour refuser avant de fermer la fenêtre.
      verifierEncaissement: (data) => db.preparerEncaissement(data, donneesRef.current),

      // Propriétaire
      saveProprietaire: (champs) =>
        lancer(
          (d) => ({ proprietaire: { ...d.proprietaire, ...champs } }),
          () => db.updateProprietaire(champs),
          ["proprietaire"]
        ),

      // Immeubles : la suppression emporte les lots libres.
      saveImmeuble: (data, id = null) =>
        sauver(
          "immeubles",
          "imm",
          { creer: db.createImmeuble, modifier: db.updateImmeuble },
          data,
          id,
          ["immeubles", "lots"]
        ),
      removeImmeuble: (id) =>
        lancer(
          (d) => supprimerImmeuble(d, id),
          () => db.deleteImmeuble(id),
          ["immeubles", "lots"]
        ),

      // Lots
      saveLot: (data, id = null) =>
        sauver("lots", "lot", { creer: db.createLot, modifier: db.updateLot }, data, id, ["lots"]),
      removeLot: (id) => retirerLigne("lots", id, () => db.deleteLot(id), ["lots"]),

      // Locataires : la suppression emporte bail, loyers, paiements et quittances.
      saveLocataire: (data, id = null) =>
        sauver(
          "locataires",
          "loc",
          { creer: db.createLocataire, modifier: db.updateLocataire },
          data,
          id,
          id ? ["locataires"] : ["locataires", "baux", "loyers", "paiements", "quittances"]
        ),
      removeLocataire: (id) =>
        lancer(
          (d) => supprimerLocataire(d, id),
          () => db.deleteLocataire(id),
          ["locataires", "baux", "loyers", "paiements", "quittances"]
        ),

      // Baux : leurs loyers suivent, puisqu'ils en dépendent.
      saveBail: (data, id = null) =>
        sauver(
          "baux",
          "bail",
          { creer: db.createBail, modifier: db.updateBail },
          data,
          id,
          ["baux", "lots", "locataires", "loyers"]
        ),
      removeBail: (id) =>
        lancer(
          (d) => supprimerBail(d, id),
          () => db.deleteBail(id),
          ["baux", "loyers", "paiements", "quittances"]
        ),

      // Attend la relecture : l'encaissement qui suit lit les loyers créés ici.
      genererDepuis: (bailId, periodeDebut, periodeFin = null) =>
        run(
          () => db.genererLoyersDepuis(bailId, periodeDebut, periodeFin),
          ["loyers", "baux"],
          { attendre: true }
        ),
      genererPeriode: (periode) => run(() => db.genererLoyersPourPeriode(periode), ["loyers", "baux"]),

      // Le propriétaire ouvre le mois suivant quand un locataire paie d'avance.
      // Le calendrier commun ouvre déjà les mois courants tout seul.
      ajouterMois: (bailId, periode) =>
        run(() => db.genererLoyersDepuis(bailId, periode, periode), ["loyers", "baux"]),

      removeLoyer: (id) => retirerLigne("loyers", id, () => db.deleteLoyer(id), ["loyers"]),

      // Paiements : l'encaissement est affiché tout de suite. Un refus de la base
      // fait revenir l'état réel par la relecture.
      enregistrerPaiement: (data) => {
        let plan;
        try {
          plan = db.preparerEncaissement(data, donneesRef.current);
        } catch (e) {
          return Promise.resolve({ ok: false, erreur: e.message });
        }
        return lancer(
          (d) => ({
            paiements: fusionner(d.paiements, [plan.paiement]),
            loyers: fusionner(d.loyers, plan.loyers),
          }),
          () => db.ecrireEncaissement(plan),
          ["paiements", "loyers", "quittances", "baux"]
        );
      },
      removePaiement: (id) =>
        lancer(
          (d) => supprimerPaiement(d, id),
          () => db.deletePaiement(id),
          ["paiements", "loyers", "quittances"]
        ),

      // Dépenses
      saveDepense: (data, id = null) =>
        sauver(
          "depenses",
          "dep",
          { creer: db.createDepense, modifier: db.updateDepense },
          data,
          id,
          ["depenses"]
        ),
      removeDepense: (id) => retirerLigne("depenses", id, () => db.deleteDepense(id), ["depenses"]),

      // Quittances : la numérotation se fait dans la base ; on attend donc la réponse.
      genererQuittance: (paiementId) =>
        run(
          () => db.genererQuittance(paiementId, db.contexteQuittanceDepuis(donneesRef.current)),
          ["quittances", "counters"]
        ),
      genererQuittancesManquantes: () =>
        run(
          () => db.genererQuittancesManquantes(db.contexteQuittanceDepuis(donneesRef.current)),
          ["quittances", "counters"]
        ),
    };
  }, [refresh, run, lancer]);


  // Sélecteurs : soldes, statuts, totaux. Recalculés à chaque changement de
  // données, jamais par les composants.
  const sel = useMemo(() => createSelecteurs(donnees), [donnees]);

  // Listes de référence : constantes, redefinees hors du useMemo pour ne pas
  // devenir des dependances.
  const value = useMemo(
    () => ({
      ...donnees,
      ...sel,
      ...actions,
      CATEGORIES: CATEGORIES_DEPENSE,
      MODES: MOIS_DE_PAYEMENT,
      // Sept lignes d'un encaissement (loyer, eau, électricité, ordures…).
      LIGNES: LIGNES_FRAIS,
      loading,
      erreur,
      setErreur,
    }),
    [donnees, sel, actions, loading, erreur]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** La période « AAAA-MM » d'un instant donné. */
export function periodeMois(ref) {
  const d = ref instanceof Date ? ref : new Date(ref);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Un loyer est-il échu ?
 *
 * Exportée parce que la page Compte doit appliquer exactement la même règle
 * que la liste des locataires : c'est elle qui fait foi. Deux implémentations
 * donnaient deux chiffres différents pour un même locataire.
 *
 * @param {object} loyer  document du mois
 * @param {object|null} bail  bail auquel il appartient
 * @param {Date}   [ref]  instant de référence
 */
export function estEchuPour(loyer, bail, ref = new Date()) {
  // Sans bail, la période fait foi : elle est au format « AAAA-MM ».
  if (!bail) return (loyer.periode || "") <= periodeMois(ref);
  // Selon le contrat, chaque début de mois est une dette : le loyer est dû dès
  // le 1er. Le jour peut être propre à un bail ; un bail sans jour lisible
  // retombe sur le 1er. Le délai de paiement (le 5) ne décale pas la dette.
  const jour = Number(bail.echeanceJour) || 1;
  return periodeMois(ref) > loyer.periode
    || (periodeMois(ref) === loyer.periode && ref.getDate() >= jour);
}

// --- Sélecteurs ---
//
// Tout ce qui est calculé (soldes, statuts, totaux) est défini ici. Les pages
// lisent ces valeurs sans jamais refaire le calcul elles-mêmes.

export function createSelecteurs(donnees) {
  const { baux, lots, immeubles, locataires, loyers, paiements, depenses, quittances } = donnees;

  const loyersParBail = new Map();
  for (const l of loyers) {
    if (!loyersParBail.has(l.bailId)) loyersParBail.set(l.bailId, []);
    loyersParBail.get(l.bailId).push(l);
  }

  const paiementsParBail = new Map();
  for (const p of paiements) {
    if (!paiementsParBail.has(p.bailId)) paiementsParBail.set(p.bailId, []);
    paiementsParBail.get(p.bailId).push(p);
  }

  const bauxParId = new Map(baux.map((b) => [b.id, b]));
  const lotsParId = new Map(lots.map((l) => [l.id, l]));
  const immeublesParId = new Map(immeubles.map((i) => [i.id, i]));
  const locatairesParId = new Map(locataires.map((l) => [l.id, l]));
  const paiementsParId = new Map(paiements.map((p) => [p.id, p]));
  const quittancesParPaiement = new Map(quittances.map((q) => [q.paiementId, q]));

  /**
   * Ce qu'un versement rapporte réellement au propriétaire. Le supplément de
   * caution est une caution : il rejoint le dépôt du bail, il n'est pas une
   * recette. Il ne doit donc ni gonfler les recettes ni réduire une dette.
   */
  const recetteDuVersement = (p) =>
    (Number(p.montant) || 0) - (Number(p.supplementCaution) || 0);

  const bailEstActif = (bail, ref = new Date()) => {
    if (!bail) return false;
    const auj = ref.toISOString().slice(0, 10);
    if (bail.dateDebut > auj) return false;
    if (bail.dateFin && bail.dateFin < auj) return false;
    return true;
  };

  /** Loyers d'un bail, du plus ancien au plus récent. */
  const loyersDe = (bailId) =>
    [...(loyersParBail.get(bailId) || [])].sort((a, b) => comparePeriode(a.periode, b.periode));

  /** Paiements d'un bail, du plus récent au plus ancien. */
  const paiementsDe = (bailId) =>
    [...(paiementsParBail.get(bailId) || [])].sort((a, b) => b.date.localeCompare(a.date));

  /**
   * Un loyer est-il échu, au sens du temps et non du contrat ?
   *
   * Un bail court souvent bien au-delà du mois courant, et ses loyers sont
   * générés jusqu'à sa fin. additionner tous ces mois donnait à chaque
   * locataire une dette imaginaire : au 1er octobre, novembre et décembre
   * s'ajoutaient au solde alors qu'ils ne sont pas dus. Le propriétaire
   * voyait une urgence qui n'existait pas, et son locataire était à tort.
   *
   * Un loyer n'entre donc dans la dette que le jour de son échéance. Avant,
   * c'est une facture à venir : elle reste visible, elle n'est pas due.
   *
   * @param {object} loyer
   * @param {Date}   ref  instant de référence
   */
  const estEchu = (loyer, ref) => estEchuPour(loyer, bauxParId.get(loyer.bailId), ref);

  /**
   * Ce que les versements couvrent du **loyer** d'un mois, plafonné au loyer.
   * Chaque versement est lu séparément : deux règlements partiels du même mois
   * s'additionnent, chacun avec la part « Loyer » de son propre détail.
   */
  const couvertSurLoyer = (loyer) => {
    const loyerVal = loyerSeul(loyer);
    const total = (paiementsParBail.get(loyer.bailId) || []).reduce(
      (acc, p) =>
        acc + couvertParLoyer((p.allocations || []).find((a) => a.loyerId === loyer.id), loyerVal),
      0
    );
    return Math.min(total, loyerVal);
  };

  /**
   * Loyers échus dont le **loyer** n'est pas entièrement couvert — la file des
   * impayés. Le statut du loyer compte les charges : il ne sert pas ici, sinon
   * une eau impayée ferait passer un mois réglé pour un impayé.
   */
  const impayesDe = (bailId, ref = new Date()) =>
    loyersDe(bailId).filter((l) => estEchu(l, ref) && loyerSeul(l) - couvertSurLoyer(l) > 0);

  /** Reste dû sur un loyer, compte tenu des paiements déjà alloués. */
  const resteDuLoyer = (loyerId) => {
    const loyer = loyers.find((l) => l.id === loyerId);
    if (!loyer) return 0;
    const paye = paiements.reduce((s, p) => {
      const a = (p.allocations || []).find((x) => x.loyerId === loyerId);
      return s + (a ? a.montant : 0);
    }, 0);
    return Math.max(0, loyer.montantDu - paye);
  };

  /** Le loyer seul d'un mois, sans les charges. */
  const loyerSeul = (loyer) =>
    Number(loyer.loyer) || Number(loyer.montantDu) || 0;

  /** Loyer seul impayé sur un mois : le loyer moins ce qui lui est imputé. */
  const resteLoyerSeul = (loyer, payeSurLoyer) =>
    Math.max(0, loyerSeul(loyer) - payeSurLoyer);

/**
   * La part d'une affectation qui couvre le **loyer**, et non une charge.
   *
   * L'encodement porte le détail du mois : on lit la ligne « Loyer » qu'il
   * contient. Un versement de 2 400 d'eau n'a donc rien soldé du loyer, et la
   * dette du mois reste entière.
   *
   * Un affectation sans détail — les anciens encaissements, enregistrés avant
   * les sept lignes — retombe sur le montant entier, plafonné au loyer.
   *
   * @param {object} affectation  une allocation de paiement
   * @param {number} loyer         le loyer du mois imputé
   */
  const couvertParLoyer = (affectation, loyer) => {
    const detail = affectation?.detail;
    if (detail && typeof detail.loyer === "number") {
      return Math.max(0, Math.min(Number(affectation.montant) || 0, detail.loyer));
    }
    return Math.max(0, Math.min(Number(affectation?.montant) || 0, loyer));
  };

  /**
   * Solde d'un bail : ce qui est échu et impayé, en loyers seuls.
   *
   * Positif = le locataire doit des loyers. Jamais négatif : un versement
   * supérieur au loyer laisse le locataire à jour, pas créditeur.
   *
   * Deux règles, à ne pas confondre :
   *
   * 1. Seuls les **loyers** échus comptent. Les mois à venir sont exclus : le
   *    propriétaire ouvre lui-même chaque mois quand il l'encaisse, et un mois
   *    non ouvert ne peut pas être impayé.
   *
   * 2. Seuls les **loyers** sont dus. Les ordures ménagères, l'eau et
   *    l'électricité sont saisis par le propriétaire à l'encaissement : elles
   *    sont flexibles, d'un montant différent chaque mois, et ne doivent donc
   *    jamais gonfler une dette de loyer.
   *
   * Et, symétriquement, **une charge réglée ne solde pas un loyer** : Josue —
   * loyer 40 000, 2 400 d'eau payée en septembre — voyait cette eau réduire la
   * dette d'octobre à 37 600. Elle ne soldait rien. C'est à ça que sert le
   * plafonnement par ligne « Loyer » du détail.
   *
   * Le total est ramené à zéro : un locataire ayant versé plus que son loyer
   * est à jour, pas créditeur.
   *
   * La charge reste suivie ailleurs : le relevé du compte et la quittance
   * l'affichent, et les encaissements l'enregistrent. Elle n'entre
   * simplement dans aucun calcul de dette.
   */
  const soldeBail = (bailId, ref = new Date()) => {
    const dus = (loyersParBail.get(bailId) || []).filter((l) => estEchu(l, ref));
    return dus.reduce((s, l) => s + Math.max(0, loyerSeul(l) - couvertSurLoyer(l)), 0);
  };

  /** Un bail est-il à jour : aucun loyer échu et impayé. */
  const bailEstAJour = (bailId, ref = new Date()) => impayesDe(bailId, ref).length === 0;

  /** Nombre de mois d'impayés consécutifs, du plus ancien impayé. */
  const moisDImpayes = (bailId, ref = new Date()) => impayesDe(bailId, ref).length;

  /** Le lot est-il occupé aujourd'hui ? Dérivé des baux actifs. */
  const lotOccupe = (lotId, ref = new Date()) =>
    baux.some((b) => b.lotId === lotId && bailEstActif(b, ref));

  /** Le bail en cours d'un lot, s'il y en a un. */
  const bailActifDuLot = (lotId, ref = new Date()) =>
    baux.find((b) => b.lotId === lotId && bailEstActif(b, ref)) || null;

  /** Baux d'un lot, du plus récent au plus ancien. */
  const bauxDULot = (lotId) =>
    baux
      .filter((b) => b.lotId === lotId)
      .sort((a, b) => b.dateDebut.localeCompare(a.dateDebut));

  // Les baux d'un locataire, du plus récent au plus ancien. Sert aussi à
  // résoudre un identifiant de locataire en bail dans la page Compte.
  const bauxDuLocataire = (locataireId) =>
    baux
      .filter((b) => b.locataireId === locataireId)
      .sort((a, b) => b.dateDebut.localeCompare(a.dateDebut));

  const bailCourantDuLocataire = (locataireId, ref = new Date()) =>
    bauxDuLocataire(locataireId).find((b) => bailEstActif(b, ref)) || null;

  // --- Immeubles ---

  const lotsDImmeuble = (immeubleId) => lots.filter((l) => l.immeubleId === immeubleId);

  /**
   * Compte de résultat d'un immeuble : ce que les baux actifs ont produit,
   * ce que l'immeuble a coûté, et le solde.
   */
  const bilanImmeuble = (immeubleId, { depuis = null, jusquA = null } = {}) => {
    const lotIds = new Set(lotsDImmeuble(immeubleId).map((l) => l.id));
    const bailIds = new Set(baux.filter((b) => lotIds.has(b.lotId)).map((b) => b.id));

    let recettes = 0;
    for (const p of paiements) {
      if (!bailIds.has(p.bailId)) continue;
      if (depuis && p.date < depuis) continue;
      if (jusquA && p.date > jusquA) continue;
      recettes += recetteDuVersement(p);
    }

    const couts = depenses
      .filter((d) => d.immeubleId === immeubleId)
      .filter((d) => (!depuis || d.date >= depuis) && (!jusquA || d.date <= jusquA));
    const totalCouts = couts.reduce((s, d) => s + d.montant, 0);

    // La dette est celle des baux actifs, calculée comme partout ailleurs
    // (soldeBail) : la somme des soldes des lots, qui est aussi ce que la fiche
    // immeuble affiche ligne par ligne. Un calcul séparé donnait un autre total.
    const dette = baux
      .filter((b) => bailIds.has(b.id) && bailEstActif(b))
      .reduce((s, b) => s + soldeBail(b.id), 0);

    const listeLots = lotsDImmeuble(immeubleId);
    return {
      recettes,
      dette,
      depenses: totalCouts,
      resultat: recettes - totalCouts,
      nbLots: listeLots.length,
      nbLotsOccupes: listeLots.filter((l) => lotOccupe(l.id)).length,
      nbLocataires: baux.filter((b) => lotIds.has(b.lotId) && bailEstActif(b)).length,
    };
  };

  // --- Agrégats globaux ---
  //
  // Tous ces chiffres décrivent le même instant. Sans référence partagée, la
  // liste des impayés et le compteur « à jour » se contredisaient à la minute
  // où le jour changeait.
  const instant = new Date();

  const impayesGlobaux = () =>
    baux
      .filter((b) => bailEstActif(b))
      .map((b) => ({
        bail: b,
        locataire: locatairesParId.get(b.locataireId) || null,
        lot: lotsParId.get(b.lotId) || null,
        immeuble: (() => {
          const l = lotsParId.get(b.lotId);
          return l ? immeublesParId.get(l.immeubleId) || null : null;
        })(),
        solde: soldeBail(b.id, instant),
        mois: moisDImpayes(b.id, instant),
      }))
      .filter((x) => x.solde > 0)
      .sort((a, b) => b.solde - a.solde);

  /** Soldes de tous les baux, indexés par bailId. */
  const soldesParBail = new Map(
    baux.map((b) => [b.id, soldeBail(b.id, instant)])
  );

  /** Baux actifs dont le locataire est à jour. */
  const solvable = () =>
    baux.filter((b) => bailEstActif(b) && impayesDe(b.id, instant).length === 0);

  const cautionTotale = () =>
    baux
      .filter((b) => b.cautionStatut === "deposee")
      .reduce((s, b) => s + (b.cautionVersee || 0), 0);

  // --- Journal mensuel ---

  /** Recettes, dépenses et solde d'une période au format "2026-10". */
  const journalPeriode = (periode) => {
    const recettes = paiements.filter((p) => p.date.slice(0, 7) === periode);
    const couts = depenses.filter((d) => d.date.slice(0, 7) === periode);
    const totalRecettes = recettes.reduce((s, p) => s + recetteDuVersement(p), 0);
    const totalCouts = couts.reduce((s, d) => s + d.montant, 0);
    return {
      periode,
      recettes,
      depenses: couts,
      totalRecettes,
      totalCouts,
      solde: totalRecettes - totalCouts,
    };
  };

  /** Séries mensuelles pour les graphiques, sur les N derniers mois. */
  const serieMensuelle = (nombreMois = 12) => {
    const series = [];
    let cur = periodeCourante();
    for (let i = nombreMois - 1; i >= 0; i--) {
      const d = new Date(Number(cur.slice(0, 4)), Number(cur.slice(5, 7)) - 1 - i, 1);
      const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const j = journalPeriode(p);
      series.push({ periode: p, recettes: j.totalRecettes, depenses: j.totalCouts, solde: j.solde });
    }
    return series;
  };

  /** Taux de remplissage : lots occupés sur lots totals. */
  const tauxOccupation = () => {
    if (!lots.length) return 0;
    return lots.filter((l) => lotOccupe(l.id)).length / lots.length;
  };

  return {
    // Accès directs
    baux,
    bauxParId,
    lotsParId,
    immeublesParId,
    locatairesParId,
    paiementsParId,
    quittancesParPaiement,
    soldesParBail,

    // Fonctions de lecture
    bailEstActif,
    loyersDe,
    paiementsDe,
    impayesDe,
    resteDuLoyer,
    loyerSeul,
    resteLoyerSeul,
    soldeBail,
    bailEstAJour,
    moisDImpayes,
    lotOccupe,
    bailActifDuLot,
    bauxDULot,
    bauxDuLocataire,
    bailCourantDuLocataire,
    lotsDImmeuble,
    bilanImmeuble,
    impayesGlobaux,
    solvable,
    cautionTotale,
    journalPeriode,
    serieMensuelle,
    tauxOccupation,
  };
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp doit être utilisé dans AppProvider");
  return ctx;
}