// Paiements & Quittances : l'historique des encaissements, et le point de
// départ pour tout imprimer ou envoyer une quittance.
//
// Elle remplace les deux anciennes listes « Versements » et « Quittances ».
//
//   ▸ Cette page                src/pages/PaiementsQuittances.jsx
//   ▸ Modale d'encaissement     src/pages/paiements/Encaissement.jsx
//   ▸ Génération du PDF         src/utils/quittancePdf.js

import { useMemo, useState } from "react";
import {
  Wallet,
  Download,
  Receipt,
  Search,
  Inbox,
  Trash2,
  FileText,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { Card, EmptyState, ConfirmDialog, Modal } from "../components/ui";
import { LIGNES_FRAIS, POSTES_FRAIS } from "../data/db.firebase";
import { formatMoney, formatDate } from "../utils/format";
import { construireQuittance, telecharger, ouvrir, preparerLogo, preparerSignature } from "../utils/quittancePdf";
import Encaissement from "./paiements/Encaissement";

const LIBELLES_MODE = {
  especes: "Espèces",
  mtn: "MTN MoMo",
  moov: "Moov Money",
  celtis: "Celtis",
  virement: "Virement bancaire",
  cheque: "Chèque",
  mobile: "Mobile Money",
};

const libelleMode = (mode) => LIBELLES_MODE[mode] || mode || "—";

/** « loyer seul » ou la liste des charges facturées, sous le montant. */
function detailResume(quittance) {
  const detail = quittance.detail || {};
  const parts = POSTES_FRAIS.filter(
    (k) => k !== "loyer" && (Number(detail[k]) || 0) > 0
  ).map((k) => {
    const court = { electricite: "élec", ordures: "ordures", degats: "dégâts" }[k] || k;
    return `${court} ${formatMoney(detail[k])}`;
  });
  return parts.length ? `+ ${parts.join(", ")}` : "loyer seul";
}

export default function PaiementsQuittances() {
  const {
    paiements,
    quittances,
    baux,
    lotsParId,
    immeublesParId,
    locatairesParId,
    removePaiement,
    genererQuittancesManquantes,
    proprietaire,
  } = useApp();
  const { addToast } = useToast();

  const [recherche, setRecherche] = useState("");
  const [filtreMode, setFiltreMode] = useState("tous");
  const [aSupprimer, setASupprimer] = useState(null);
  const [encaissement, setEncaissement] = useState(false);
  const [aVoir, setAVoir] = useState(null);
  const [emission, setEmission] = useState(false);

  const lignes = useMemo(
    () =>
      quittances
        .map((quittance) => {
          const bail = baux.find((b) => b.id === quittance.bailId) || null;
          const lot = bail ? lotsParId.get(bail.lotId) || null : null;
          return {
            quittance,
            paiement: paiements.find((p) => p.id === quittance.paiementId) || null,
            locataire: locatairesParId.get(quittance.locataireId) || null,
            immeuble: lot ? immeublesParId.get(lot.immeubleId) || null : null,
            bail,
          };
        })
        .sort((a, b) =>
          (b.quittance.emission || "").localeCompare(a.quittance.emission || "")
        ),
    [quittances, paiements, baux, lotsParId, immeublesParId, locatairesParId]
  );

  const filtrees = lignes.filter(({ quittance, paiement, locataire }) => {
    if (filtreMode !== "tous" && paiement?.mode !== filtreMode) return false;
    if (!recherche.trim()) return true;
    const texte = [quittance.numero, locataire?.nom, locataire?.prenoms, quittance.periode]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return texte.includes(recherche.toLowerCase().trim());
  });

  const modesPresents = useMemo(
    () => Array.from(new Set(paiements.map((p) => p.mode).filter(Boolean))),
    [paiements]
  );

  const sansQuittance = paiements.filter(
    (p) => !quittances.some((q) => q.paiementId === p.id)
  );

  /** Construit le PDF au format officiel, puis l'ouvre ou le télécharge. */
  const fabriquer = async (quittance, action) => {
    try {
      // On attend logo et signature avant de construire : un PDF sans l'un
      // des deux est incomplet — le premier clic peut arriver avant la fin
      // des téléchargements de fond lancés au démarrage. La promesse est
      // mémorisée : attendre une ressource déjà prête ne coûte rien.
      await Promise.all([preparerLogo(), preparerSignature()]);
      const bail = baux.find((b) => b.id === quittance.bailId);
      const doc = construireQuittance(quittance, {
        proprietaire,
        periode: quittance.periode,
        cautionSur: bail?.cautionSur || "",
      });
      if (action === "ouvrir") ouvrir(doc);
      else telecharger(doc, `${quittance.numero || "quittance"}.pdf`);
    } catch (erreur) {
      addToast(erreur.message || "PDF impossible", "error");
    }
  };

  const supprimer = async () => {
    const res = await removePaiement(aSupprimer);
    if (res?.ok !== false) {
      addToast("Paiement supprimé — les loyers concernés redeviennent impayés", "success");
      setASupprimer(null);
    } else {
      addToast(res?.error || "Suppression impossible", "error");
    }
  };

// L'émission est une écriture Firestore : elle est donc asynchrone. Sans
  // `await`, `creees` était une promesse et la comparaison renvoyait toujours
  // faux — le message annonçait « toutes les quittances sont déjà émises »
  // juste après les avoir émises.
  const emettreManquantes = async () => {
    setEmission(true);
    try {
      const res = await genererQuittancesManquantes();
      const creees = res?.ok ? res.resultat?.length || 0 : 0;
      if (!res?.ok) {
        addToast(res?.erreur || "Émission impossible", "error");
        return;
      }
      addToast(
        creees > 0
          ? `${creees} quittance(s) émise(s)`
          : "Toutes les quittances sont déjà émises",
        "success"
      );
    } finally {
      setEmission(false);
    }
  };

  return (
    <div>
      <header className="cag-page-head">
        <div>
          <h1>Paiements &amp; Quittances</h1>
          <p>Encaisser les loyers et établir les quittances</p>
        </div>
        <div className="cag-page-actions">
          <button
            type="button"
            className="btn btn-success"
            onClick={() => setEncaissement(true)}
          >
            <Wallet size={16} /> Encaisser un loyer
          </button>
        </div>
      </header>

      {encaissement ? (
        <Encaissement
          baux={baux}
          lotsParId={lotsParId}
          immeublesParId={immeublesParId}
          onClose={() => setEncaissement(false)}
          onEncaisser={() => setEncaissement(false)}
        />
      ) : null}

      <Card className="cag-card">
        <div className="row">
          <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 380 }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
                pointerEvents: "none",
              }}
            />
            <input
              type="search"
              className="input"
              style={{ paddingLeft: "2.3rem" }}
              placeholder="Rechercher (nom, référence…)"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              aria-label="Rechercher un paiement"
            />
          </div>
          <div style={{ minWidth: 170 }}>
            <select
              className="select"
              value={filtreMode}
              onChange={(e) => setFiltreMode(e.target.value)}
              aria-label="Filtrer par mode de paiement"
            >
              <option value="tous">Tous les modes</option>
              {modesPresents.map((m) => (
                <option key={m} value={m}>
                  {libelleMode(m)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <Card className="cag-card">
        <div className="panel-head">
          <h2>
            <Receipt size={17} /> Historique des paiements &amp; quittances ({lignes.length})
          </h2>
        </div>
        {filtrees.length === 0 ? (
          <EmptyState
            icon={lignes.length === 0 ? Inbox : Search}
            message={
              lignes.length === 0
                ? "Aucune quittance pour le moment. Enregistrez un premier paiement."
                : "Aucun paiement ne correspond à cette recherche."
            }
          />
        ) : (
          <div className="cag-table-wrap">
            <table className="cag-table">
              <thead>
                <tr>
                  <th>N° / Référence</th>
                  <th>Locataire</th>
                  <th className="num">Montant</th>
                  <th>Période</th>
                  <th>Date paiement</th>
                  <th>Mode</th>
                  <th className="actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtrees.map(({ quittance, paiement, locataire }) => (
                  <tr key={quittance.id}>
                    <td className="cag-strong">{quittance.numero}</td>
                    <td>{[locataire?.prenoms, locataire?.nom].filter(Boolean).join(" ")}</td>
                    <td className="num">
                      <strong>{formatMoney(quittance.montant)}</strong>
                      <div className="cag-sub">{detailResume(quittance)}</div>
                    </td>
                    <td>{quittance.periode || "—"}</td>
                    <td className="cag-muted">{formatDate(quittance.datePaiement)}</td>
                    <td>
                      <span className={`cag-pill ${paiement?.mode === "especes" ? "warn" : "info"}`}>
                        {libelleMode(paiement?.mode)}
                      </span>
                    </td>
                    <td className="actions">
                      <button
                        type="button"
                        className="btn btn-small btn-primary"
                        onClick={() => fabriquer(quittance, "telecharger")}
                        title="Télécharger le PDF"
                      >
                        <Download size={13} /> PDF
                      </button>
                      <button
                        type="button"
                        className="btn btn-small btn-ghost"
                        onClick={() => fabriquer(quittance, "ouvrir")}
                        title="Ouvrir le PDF"
                      >
                        <FileText size={13} /> Voir
                      </button>
                      <button
                        type="button"
                        className="btn btn-small btn-ghost"
                        onClick={() => setAVoir(quittance)}
                        title="Détail de la quittance"
                      >
                        <Receipt size={13} /> Détail
                      </button>
                      <button
                        type="button"
                        className="btn btn-small btn-danger"
                        onClick={() => setASupprimer(quittance.paiementId)}
                        title="Supprimer le paiement"
                        aria-label="Supprimer ce paiement"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {sansQuittance.length > 0 ? (
        <Card className="cag-card">
          <h2>
            <Receipt size={17} /> {sansQuittance.length} paiement(s) sans quittance
          </h2>
          <p className="text-muted" style={{ margin: "0 0 0.8rem", fontSize: "0.84rem" }}>
            Ces encaissements n'ont pas encore reçu de quittance.
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={emettreManquantes}
            disabled={emission}
          >
            {emission ? "Émission…" : "Émettre les quittances manquantes"}
          </button>
        </Card>
      ) : null}

      <Card className="cag-card">
        <h2>
          <FileText size={17} /> Numérotation et format des quittances
        </h2>
        <p className="text-muted" style={{ margin: 0, fontSize: "0.84rem" }}>
          Les numéros sont attribués automatiquement sous le format{" "}
          <code>Q-ANNÉE-NNNNNN</code>. Chaque quittance reprend les sept lignes de
          l&apos;encaissement, vos numéros de réception et votre signature, au format
          officiel CAGOUNOU. Elle est générée en PDF dans le navigateur : rien ne
          transite par un serveur.
        </p>
      </Card>

      {aSupprimer ? (
        <ConfirmDialog
          title="Supprimer le paiement"
          message="Le paiement et sa quittance seront supprimés. Les loyers concernés redeviendront impayés. Action irréversible."
          confirmLabel="Supprimer"
          onConfirm={supprimer}
          onCancel={() => setASupprimer(null)}
        />
      ) : null}

      {aVoir ? (
        <ApercuQuittance
          quittance={aVoir}
          onClose={() => setAVoir(null)}
          onTelecharger={() => fabriquer(aVoir, "telecharger")}
          onOuvrir={() => fabriquer(aVoir, "ouvrir")}
        />
      ) : null}
    </div>
  );
}

/** Aperçu du détail d'une quittance, avant impression. */
function ApercuQuittance({ quittance, onClose, onTelecharger, onOuvrir }) {
  const lignes = LIGNES_FRAIS.map((l) => {
    const valeur = Number(quittance.detail?.[l.key]) || 0;
    const libelle =
      l.key === "autre1"
        ? quittance.libelles?.autre1 || l.label
        : l.key === "autre2"
        ? quittance.libelles?.autre2 || l.label
        : l.label;
    return { ...l, libelle, valeur };
  });
  const total = lignes.reduce((s, l) => s + l.valeur, 0);

  return (
    <Modal
      title={`Quittance ${quittance.numero}`}
      onClose={onClose}
      width="520px"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Fermer
          </button>
          <button type="button" className="btn btn-secondary" onClick={onOuvrir}>
            <FileText size={15} /> Ouvrir le PDF
          </button>
          <button type="button" className="btn btn-primary" onClick={onTelecharger}>
            <Download size={15} /> Télécharger
          </button>
        </>
      }
    >
      <p className="text-muted" style={{ margin: "0 0 1rem", fontSize: "0.84rem" }}>
        {quittance.periode || "—"} · payée le {formatDate(quittance.datePaiement)} par{" "}
        {libelleMode(quittance.mode)}
      </p>
      <div className="cag-lignes">
        {lignes.map((l) => (
          <div key={l.key} className={`cag-ligne ${l.key === "loyer" ? "loyer" : ""}`}>
            <span className="cag-ligne-label">{l.libelle}</span>
            <span className="montant">{l.valeur > 0 ? formatMoney(l.valeur) : "—"}</span>
          </div>
        ))}
      </div>
      <div className="cag-total">
        <span>Total payé</span>
        <strong>{formatMoney(total || quittance.montant)} FCFA</strong>
      </div>
    </Modal>
  );
}