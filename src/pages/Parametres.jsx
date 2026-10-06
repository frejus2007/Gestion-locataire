// Paramètres : identité du propriétaire (imprimée sur les quittances),
// signature, et suivi des cautions en cours.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Save, Shield, Upload, Trash2, CheckCircle2 } from "lucide-react";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { Card, Field, TextInput, EmptyState, Badge, LocataireLink } from "../components/ui";
import { formatMoney } from "../utils/format";

export default function Parametres() {
  const {
    proprietaire,
    saveProprietaire,
    baux,
    bailEstActif,
    lotsParId,
    immeublesParId,
    locatairesParId,
    saveBail,
    cautionTotale,
  } = useApp();
  const { addToast } = useToast();

  const [form, setForm] = useState(() => ({
    nom: proprietaire.nom || "",
    prenoms: proprietaire.prenoms || "",
    telephone: proprietaire.telephone || "",
    adresse: proprietaire.adresse || "",
    ville: proprietaire.ville || "",
    ifu: proprietaire.ifu || "",
    banque: proprietaire.banque || "",
  }));
  const [erreurs, setErreurs] = useState({});

  const set = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }));

  const valider = () => {
    const e = {};
    if (!form.nom.trim()) e.nom = "Le nom est requis : il figure sur les quittances";
    if (!form.prenoms.trim()) e.prenoms = "Le prénom est requis";
    if (!form.telephone.trim()) e.telephone = "Le téléphone est requis";
    setErreurs(e);
    return Object.keys(e).length === 0;
  };

  const enregistrer = (e) => {
    e.preventDefault();
    if (!valider()) return;
    const res = saveProprietaire({
      ...form,
      nom: form.nom.trim().toUpperCase(),
      prenoms: form.prenoms.trim(),
      telephone: form.telephone.trim(),
    });
    if (res.ok) addToast("Paramètres enregistrés — les nouvelles quittances utiliseront ces informations");
  };

  // Signature : upload local converti en data URL. Avec Firebase, ce sera un
  // fichier dans Cloud Storage et non une chaîne en base64.
  const choisirSignature = (e) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    if (fichier.size > 1.5 * 1024 * 1024) {
      addToast("Image trop lourde (1,5 Mo maximum)");
      return;
    }
    const lecteur = new FileReader();
    lecteur.onload = () => {
      saveProprietaire({ signatureUrl: lecteur.result });
      addToast("Signature enregistrée");
    };
    lecteur.readAsDataURL(fichier);
  };

  // C cautions : celles encore conservées et celles à rendre.
  const cautions = baux
    .filter((b) => b.cautionVersee > 0)
    .map((b) => ({
      bail: b,
      locataire: locatairesParId.get(b.locataireId),
      lot: lotsParId.get(b.lotId),
      immeuble: (() => {
        const l = lotsParId.get(b.lotId);
        return l ? immeublesParId.get(l.immeubleId) : null;
      })(),
    }))
    .sort((a, b) => (a.bail.cautionStatut === "deposee" ? -1 : 1) - (b.bail.cautionStatut === "deposee" ? -1 : 1));

  const enCours = cautions.filter((c) => c.bail.cautionStatut === "deposee");
  const restituees = cautions.filter((c) => c.bail.cautionStatut === "restituee");

  const changerStatut = (bail, statut) => {
    saveBail({ cautionStatut: statut }, bail.id);
    addToast(statut === "restituee" ? "Caution marquée comme restituée" : "Caution mise à jour");
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Paramètres</h1>
          <p className="page-subtitle">
            Vos informations, imprimées en tête de chaque quittance, et le suivi des cautions.
          </p>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="stack">
          <Card title="Identité du propriétaire">
            <form onSubmit={enregistrer}>
              <div className="form-grid">
                <Field label="Nom" required error={erreurs.nom}>
                  <TextInput value={form.nom} onChange={set("nom")} error={erreurs.nom} placeholder="KOUASSI" />
                </Field>
                <Field label="Prénoms" required error={erreurs.prenoms}>
                  <TextInput value={form.prenoms} onChange={set("prenoms")} error={erreurs.prenoms} placeholder="Jean-Marc" />
                </Field>
                <Field label="Téléphone" required error={erreurs.telephone} className="span-2">
                  <TextInput value={form.telephone} onChange={set("telephone")} error={erreurs.telephone} />
                </Field>
                <Field label="Adresse" className="span-2">
                  <TextInput value={form.adresse} onChange={set("adresse")} />
                </Field>
                <Field label="Ville">
                  <TextInput value={form.ville} onChange={set("ville")} />
                </Field>
                <Field label="IFU" hint=" Benin, pour la quittance">
                  <TextInput value={form.ifu} onChange={set("ifu")} />
                </Field>
                <Field label="Coordonnées bancaires" className="span-2" hint=" facultatives, pour les virements">
                  <TextInput value={form.banque} onChange={set("banque")} placeholder="Ecobank Benin — 0100 4500 1234 56" />
                </Field>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  <Save size={16} /> Enregistrer
                </button>
              </div>
            </form>
          </Card>

          <Card title="Signature">
            <p className="text-muted" style={{ fontSize: "0.86rem", marginTop: 0 }}>
              Apposée au bas des quittances. Une image PNG ou JPG sur fond transparent donne le
              meilleur résultat.
            </p>

            {proprietaire.signatureUrl ? (
              <div className="row" style={{ gap: "1rem" }}>
                <img
                  src={proprietaire.signatureUrl}
                  alt="Signature"
                  style={{ maxHeight: 70, padding: "0.4rem", border: "1px solid var(--border)", borderRadius: 6 }}
                />
                <div className="stack" style={{ gap: "0.4rem" }}>
                  <label className="btn btn-small btn-secondary" style={{ cursor: "pointer" }}>
                    <Upload size={13} /> Remplacer
                    <input type="file" accept="image/png,image/jpeg" onChange={choisirSignature} style={{ display: "none" }} />
                  </label>
                  <button
                    type="button"
                    className="btn btn-small btn-ghost"
                    onClick={() => {
                      saveProprietaire({ signatureUrl: null });
                      addToast("Signature supprimée — un espace sera laissé sur les quittances");
                    }}
                  >
                    <Trash2 size={13} /> Supprimer
                  </button>
                </div>
              </div>
            ) : (
              <label className="btn btn-secondary" style={{ cursor: "pointer", display: "inline-flex" }}>
                <Upload size={15} /> Choisir une image
                <input type="file" accept="image/png,image/jpeg" onChange={choisirSignature} style={{ display: "none" }} />
              </label>
            )}
          </Card>
        </div>

        {/* Suivi des cautions : la première source de litige. */}
        <Card
          title="Cautions"
          action={
            enCours.length > 0 ? (
              <Badge classe="badge-green">{formatMoney(cautionTotale())} conservées</Badge>
            ) : null
          }
        >
          {cautions.length === 0 ? (
            <EmptyState
              icon={Shield}
              message="Aucune caution enregistrée. Renseignez-la lors de la création d'un bail."
            />
          ) : (
            <>
              {enCours.length > 0 && (
                <>
                  <div className="nav-section" style={{ padding: "0 0 0.5rem" }}>
                    Conservées — à restituer au départ
                  </div>
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Locataire</th>
                          <th>Logement</th>
                          <th className="num">Montant</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {enCours.map(({ bail, locataire, immeuble }) => (
                          <tr key={bail.id}>
                            <td>
                              <LocataireLink
                                locataire={locataire}
                                id={bail.locataireId}
                                avatar
                                avatarSize={26}
                              />
                              {!bailEstActif(bail) && (
                                <div style={{ marginTop: "0.2rem" }}>
                                  <Badge classe="badge-amber">Bail terminé</Badge>
                                </div>
                              )}
                            </td>
                            <td className="text-muted" style={{ fontSize: "0.82rem" }}>
                              {immeuble ? immeuble.nom : "—"}
                            </td>
                            <td className="num" style={{ fontWeight: 700 }}>
                              {formatMoney(bail.cautionVersee)}
                            </td>
                            <td className="actions">
                              <button
                                type="button"
                                className="btn btn-small btn-primary"
                                onClick={() => changerStatut(bail, "restituee")}
                                title="Marquer comme restituée"
                              >
                                Restituée
                              </button>
                              <button
                                type="button"
                                className="btn btn-small btn-secondary"
                                onClick={() => changerStatut(bail, "retenue")}
                                title="Une partie a été retenue"
                              >
                                Retenue
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {restituees.length > 0 && (
                <>
                  <div className="nav-section" style={{ padding: "1rem 0 0.5rem" }}>
                    Restituées
                  </div>
                  <div className="table-wrapper">
                    <table className="table">
                      <tbody>
                        {restituees.map(({ bail, locataire }) => (
                          <tr key={bail.id}>
                            <td>
                              <LocataireLink
                                locataire={locataire}
                                id={bail.locataireId}
                                avatar
                                avatarSize={26}
                              />
                            </td>
                            <td className="num text-muted">{formatMoney(bail.cautionVersee)}</td>
                            <td>
                              <Badge classe="badge-blue">
                                <CheckCircle2 size={11} style={{ verticalAlign: -1, marginRight: 3 }} />
                                Restituée
                              </Badge>
                            </td>
                            <td className="actions">
                              <button
                                type="button"
                                className="btn btn-small btn-ghost"
                                onClick={() => changerStatut(bail, "deposee")}
                              >
                                Remettre
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}