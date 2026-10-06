// Encaissement d'un versement.
//
// Le propriétaire choisit les mois à régler ; le surplus est affecté aux mois
// suivants du bail et génère automatiquement les périodes nécessaires.

import { useState, useMemo } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { Save, X, Users, CheckCircle2, AlertTriangle, Info, Receipt } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/ToastContext";
import AllocationLoyers from "../../components/AllocationLoyers";
import { Card, Field, TextInput, Select, ErrorBanner, EmptyState, Badge, Avatar } from "../../components/ui";
import { formatMoney, formatDate, periodeToLabel, periodeDecalee, pluriel } from "../../utils/format";
import { MOIS_DE_PAYEMENT } from "../../data/db";

const AUJOURDHUI = new Date().toISOString().slice(0, 10);

export default function PaiementForm() {
  // Le locataire peut venir de l'URL (/locataires/:id/paiement) ou non.
  const { id: locataireIdUrl } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const {
    baux,
    bauxParId,
    lotsParId,
    immeublesParId,
    locatairesParId,
    bailCourantDuLocataire,
    bailEstActif,
    impayesDe,
    resteDuLoyer,
    loyers,
    soldesParBail,
    enregistrerPaiement,
    genererQuittance,
  } = useApp();
  const { addToast } = useToast();

  // Baux actifs, groupés par locataire, pour le sélecteur.
  const bauxActifs = useMemo(
    () => baux.filter((b) => bailEstActif(b)),
    [baux, bailEstActif]
  );

  const [bailId, setBailId] = useState(() => {
    if (locataireIdUrl) {
      const b = bailCourantDuLocataire(locataireIdUrl);
      return b ? b.id : "";
    }
    return params.get("bail") || "";
  });

  const bail = bailId ? bauxParId.get(bailId) : null;
  const locataire = bail ? locatairesParId.get(bail.locataireId) : null;
  const lot = bail ? lotsParId.get(bail.lotId) : null;
  const immeuble = lot ? immeublesParId.get(lot.immeubleId) : null;

  const [form, setForm] = useState(() => ({
    date: AUJOURDHUI,
    mode: "especes",
    reference: "",
    note: "",
    montant: (() => {
      const b = bauxParId.get(bailId);
      if (!b) return "";
      const premier = impayesDe(bailId).find((loyer) => resteDuLoyer(loyer.id) > 0);
      return premier ? String(resteDuLoyer(premier.id)) : "";
    })(),
  }));
  const [allocations, setAllocations] = useState(() => {
    const bailInitial = bauxParId.get(bailId);
    const premierImpaye = bailInitial
      ? impayesDe(bailInitial.id).find((loyer) => resteDuLoyer(loyer.id) > 0)
      : null;
    return premierImpaye
      ? [{ loyerId: premierImpaye.id, montant: resteDuLoyer(premierImpaye.id) }]
      : [];
  });
  const [erreurs, setErreurs] = useState({});
  const [erreurGlobale, setErreurGlobale] = useState(null);

  // Les impayés du bail sélectionné, du plus ancien au plus récent.
  const impayes = useMemo(
    () => (bailId ? impayesDe(bailId) : []),
    [impayesDe, bailId]
  );

  const montant = Number(form.montant) || 0;
  const detteTotale = bailId ? soldesParBail.get(bailId) || 0 : 0;
  const sommeDesSoldes = impayes.reduce((total, loyer) => total + resteDuLoyer(loyer.id), 0);
  const totalAlloue = allocations.reduce((s, a) => s + a.montant, 0);
  const avance = Math.max(0, montant - totalAlloue);
  const repartitionValide = allocations.length > 0 && totalAlloue <= montant;
  const apercuAvance = useMemo(() => {
    if (!bail || avance <= 0) return { periodes: [], nonAffecte: 0 };
    const periodesSelectionnees = allocations
      .map((allocation) => loyers.find((loyer) => loyer.id === allocation.loyerId)?.periode)
      .filter(Boolean)
      .sort();
    let periode = periodesSelectionnees.at(-1) || bail.dateDebut.slice(0, 7);
    let restant = avance;
    const futures = [];

    for (let garde = 0; restant > 0 && garde < 600; garde += 1) {
      periode = periodeDecalee(periode, 1);
      if (bail.dateFin && periode > bail.dateFin.slice(0, 7)) break;

      const loyerExistant = loyers.find(
        (loyer) => loyer.bailId === bail.id && loyer.periode === periode
      );
      const reste = loyerExistant ? resteDuLoyer(loyerExistant.id) : bail.loyerMensuel;
      if (reste <= 0) continue;
      const montantAffecte = Math.min(restant, reste);
      futures.push({ periode, montant: montantAffecte, aGenerer: !loyerExistant });
      restant -= montantAffecte;
    }
    return { periodes: futures, nonAffecte: restant };
  }, [bail, allocations, avance, loyers, resteDuLoyer]);

  const set = (champ) => (e) => {
    const valeur = e.target.value;
    setForm((f) => ({ ...f, [champ]: valeur }));
  };

  const changerBail = (e) => {
    const nouveauBail = e.target.value;
    setBailId(nouveauBail);
    setErreurGlobale(null);
    const premier = nouveauBail
      ? impayesDe(nouveauBail).find((loyer) => resteDuLoyer(loyer.id) > 0)
      : null;
    const restePremier = premier ? resteDuLoyer(premier.id) : 0;
    setAllocations(premier ? [{ loyerId: premier.id, montant: restePremier }] : []);
    setForm((f) => ({ ...f, montant: restePremier > 0 ? String(restePremier) : "" }));
    setErreurs((x) => ({ ...x, bailId: undefined, montant: undefined }));
  };

  const valider = () => {
    const e = {};
    if (!bailId) e.bailId = "Choisissez le locataire";
    if (!form.date) e.date = "La date est requise";
    if (!Number.isSafeInteger(montant) || montant <= 0) e.montant = "Saisissez un montant entier supérieur à zéro";
    else if (allocations.length === 0) e.montant = "Sélectionnez au moins un mois à régler";
    else if (totalAlloue > montant) e.montant = "Les montants des mois sélectionnés dépassent le montant reçu";
    else if (apercuAvance.nonAffecte > 0) e.montant = "L’avance dépasse la durée restante du bail";
    if (form.mode === "virement" && !form.reference.trim()) {
      e.reference = "Indiquez la référence du virement";
    }
    setErreurs(e);
    return Object.keys(e).length === 0;
  };

  const enregistrer = (e) => {
    e.preventDefault();
    if (!valider()) return;

    const res = enregistrerPaiement({
      bailId,
      date: form.date,
      montant,
      mode: form.mode,
      reference: form.reference.trim(),
      note: form.note.trim(),
      allocations,
    });

    if (!res.ok) {
      setErreurGlobale(res.erreur);
      return;
    }

    const paiement = res.resultat.paiement;
    addToast("Versement enregistré");

    // La quittance est émise dans la foulée : c'est la paperasse qui compte.
    const q = genererQuittance(paiement.id);
    if (q.ok) {
      addToast(`Quittance ${q.resultat.numero} générée`);
      navigate(`/quittances/${q.resultat.id}`);
      return;
    }
    navigate("/paiements");
  };

  if (bauxActifs.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Users}
          message="Aucun bail en cours. Créez d'abord un bail avant d'encaisser un versement."
          action={
            <Link to="/locataires" className="btn btn-primary" style={{ marginTop: "0.75rem" }}>
              Voir les locataires
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to={locataireIdUrl ? `/locataires/${locataireIdUrl}` : "/paiements"} className="btn btn-small btn-secondary" style={{ marginBottom: "0.5rem" }}>
            <X size={14} /> Retour
          </Link>
          <h1 className="page-title">Encaisser un versement</h1>
          <p className="page-subtitle">
            Choisissez les mois à régler et indiquez le montant reçu. Toute avance sera affectée aux mois suivants.
          </p>
        </div>
      </div>

      <ErrorBanner message={erreurGlobale} />

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="stack">
          <Card title="Versement">
            <form onSubmit={enregistrer}>
              <div className="form-grid">
                <Field label="Locataire" required error={erreurs.bailId} className="span-2">
                  <Select
                    value={bailId}
                    onChange={changerBail}
                    error={erreurs.bailId}
                    options={[{ id: "", label: "— Choisir un locataire —" }].concat(
                      bauxActifs.map((b) => ({
                        id: b.id,
                        label: libelleBail(b, lotsParId, immeublesParId, locatairesParId),
                      }))
                    )}
                  />
                </Field>

                <Field label="Date du versement" required error={erreurs.date}>
                  <TextInput type="date" value={form.date} onChange={set("date")} error={erreurs.date} />
                </Field>

                <Field label="Mode de paiement">
                  <Select
                    value={form.mode}
                    onChange={set("mode")}
                    options={MOIS_DE_PAYEMENT.map((m) => ({ id: m.id, label: m.label }))}
                  />
                </Field>

                <Field
                  label="Montant reçu"
                  required
                  error={erreurs.montant}
                  hint={bail && sommeDesSoldes > 0 ? `Total restant dû : ${formatMoney(sommeDesSoldes)}` : "Montant en FCFA"}
                  className="span-2"
                >
                  <TextInput
                    type="number"
                    min="0"
                    step="1"
                    value={form.montant}
                    onChange={set("montant")}
                    error={erreurs.montant}
                    placeholder="50000"
                  />
                </Field>

                {form.mode === "virement" && (
                  <Field label="Référence du virement" required error={erreurs.reference} className="span-2">
                    <TextInput
                      value={form.reference}
                      onChange={set("reference")}
                      error={erreurs.reference}
                      placeholder="VIR-20261045"
                    />
                  </Field>
                )}

                <Field label="Note" className="span-2" hint=" facultative">
                  <textarea
                    className="input"
                    value={form.note}
                    onChange={set("note")}
                    placeholder="Avance sur le mois suivant, remise accordée…"
                    style={{ minHeight: 55 }}
                  />
                </Field>
              </div>

              <div className="form-actions">
                <Link to={locataireIdUrl ? `/locataires/${locataireIdUrl}` : "/paiements"} className="btn btn-secondary">
                  Annuler
                </Link>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={
                    !bailId
                    || !Number.isSafeInteger(montant)
                    || montant <= 0
                    || !repartitionValide
                    || apercuAvance.nonAffecte > 0
                  }
                >
                  <Save size={16} /> Enregistrer et générer la quittance
                </button>
              </div>
            </form>
          </Card>

          {bail && (
            impayes.length > 0 && (
              <Card title="Mois à régler">
                  <AllocationLoyers
                    impayes={impayes}
                    allocations={allocations}
                    onChange={setAllocations}
                    resteDuLoyer={resteDuLoyer}
                  />
              </Card>
            )
          )}
        </div>

        {/* Colonne de droite : ce qui va être produit. */}
        <div className="stack">
          {bail && locataire && (
            <Card title="Locataire">
              <div className="row" style={{ gap: "0.7rem", marginBottom: "0.9rem" }}>
                <Avatar nom={locataire.nom} prenoms={locataire.prenoms} size={44} />
                <div>
                  <div className="entity-title">{locataire.nom} {locataire.prenoms}</div>
                  <div className="entity-sub">{lot ? lot.designation : "—"}</div>
                </div>
              </div>

              <dl className="info-list">
                <div>
                  <dt>Immeuble</dt>
                  <dd>
                    {immeuble ? <Link to={`/immeubles/${immeuble.id}`}>{immeuble.nom}</Link> : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Loyer mensuel</dt>
                  <dd>{formatMoney(bail.loyerMensuel)}</dd>
                </div>
                <div>
                  <dt>Bail depuis</dt>
                  <dd>{formatDate(bail.dateDebut)}</dd>
                </div>
                <div>
                  <dt>Situation</dt>
                  <dd>
                    {detteTotale > 0 ? (
                      <span style={{ color: "var(--danger)", fontWeight: 600 }}>
                        {formatMoney(detteTotale)} dus sur {pluriel(impayes.length, "période")}
                      </span>
                    ) : (
                      <Badge classe="badge-green">À jour</Badge>
                    )}
                  </dd>
                </div>
              </dl>
            </Card>
          )}

          <Card title="Récapitulatif">
            {!bail ? (
              <p className="text-muted" style={{ margin: 0 }}>
                Choisissez un locataire pour voir le récapitulatif.
              </p>
            ) : (
              <div className="stack" style={{ gap: "0.7rem" }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="text-muted">Montant reçu</span>
                  <strong>{formatMoney(montant)}</strong>
                </div>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="text-muted">Mois sélectionnés</span>
                  <strong>{pluriel(allocations.length, "période")}</strong>
                </div>

                {allocations.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "0.6rem" }}>
                    {allocations.map((a) => {
                      const l = impayes.find((x) => x.id === a.loyerId);
                      return (
                        <div key={a.loyerId} className="row" style={{ justifyContent: "space-between", fontSize: "0.85rem", padding: "0.15rem 0" }}>
                          <span className="text-muted">
                            {l ? periodeToLabel(l.periode) : "—"}
                          </span>
                          <span>{formatMoney(a.montant)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {avance > 0 && (
                  <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "0.6rem" }}>
                    <div className="row" style={{ justifyContent: "space-between", fontSize: "0.85rem", padding: "0.15rem 0" }}>
                      <span className="text-muted">Avance sur les mois suivants</span>
                      <strong>{formatMoney(avance)}</strong>
                    </div>
                    {apercuAvance.periodes.map(({ periode, montant: montantFuture, aGenerer }) => (
                      <div key={periode} className="row" style={{ justifyContent: "space-between", fontSize: "0.85rem", padding: "0.15rem 0" }}>
                        <span className="text-muted">
                          {periodeToLabel(periode)}{aGenerer ? " (à créer)" : ""}
                        </span>
                        <span>{formatMoney(montantFuture)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {montant > 0 && totalAlloue > montant && (
                  <div className="alert alert-warn" style={{ marginBottom: 0, marginTop: "0.3rem" }}>
                    <Info size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
                    Les montants affectés dépassent le montant reçu de {formatMoney(totalAlloue - montant)}.
                  </div>
                )}

                {repartitionValide && apercuAvance.nonAffecte === 0 && (
                  <div className="alert alert-info" style={{ marginBottom: 0 }}>
                    <CheckCircle2 size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
                    Les montants sont répartis. La quittance sera générée automatiquement.
                  </div>
                )}

                {apercuAvance.nonAffecte > 0 && (
                  <div className="alert alert-warn" style={{ marginBottom: 0 }}>
                    <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
                    Le bail ne couvre pas tous les mois nécessaires pour affecter l’avance. Il reste {formatMoney(apercuAvance.nonAffecte)}.
                  </div>
                )}

                {impayes.length === 0 && bail && (
                  <div className="alert alert-warn" style={{ marginBottom: 0 }}>
                    <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
                    Ce locataire n’a aucun mois impayé à sélectionner.
                  </div>
                )}

                <div className="row" style={{ gap: "0.4rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  <Receipt size={13} /> Une quittance numérotée sera produite.
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// Libellé d'un bail pour le sélecteur : locataire, logement, immeuble.
function libelleBail(bail, lots, immeubles, locataires) {
  const loc = locataires.get(bail.locataireId);
  const lot = lots.get(bail.lotId);
  const im = lot ? immeubles.get(lot.immeubleId) : null;
  const nom = loc ? `${loc.nom} ${loc.prenoms}` : "Locataire";
  const lieu = lot ? `${im ? im.nom + " — " : ""}${lot.designation}` : "";
  return lieu ? `${nom} · ${lieu}` : nom;
}
