import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Inbox } from "lucide-react";

/** Bloc de titre de section avec action à droite. */
export function Card({ title, action, children, className = "", ...rest }) {
  return (
    <section className={`card ${className}`} {...rest}>
      {(title || action) && (
        <header className="card-header">
          <h2 className="card-title">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** État vide : quand une liste n'a rien à afficher. */
export function EmptyState({ icon: Icon = Inbox, message, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon-halo">
        <Icon size={24} />
      </div>
      <p style={{ margin: "0 0 0.5rem", fontWeight: 500, fontSize: "0.92rem", color: "var(--text-secondary)" }}>
        {message}
      </p>
      {action}
    </div>
  );
}

/** Modale : ferme sur Échap et au clic sur le fond. */
export function Modal({ title, onClose, children, footer, width }) {
  const ref = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal"
        style={width ? { maxWidth: width } : undefined}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <h3>{title}</h3>
        {children}
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>
  );
}

/** Confirmation avant une action destructive. */
export function ConfirmDialog({ title = "Confirmer", message, confirmLabel = "Supprimer", danger = true, onConfirm, onCancel }) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Annuler
          </button>
          <button type="button" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-muted" style={{ margin: 0 }}>
        {message}
      </p>
    </Modal>
  );
}

/**
 * Champ de formulaire. `error` affiche un message sous le champ.
 */
export function Field({ label, error, hint, required, children, className = "" }) {
  return (
    <div className={`form-group ${className}`}>
      <label>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}

/** Champ texte controlled. */
export function TextInput({ error, ...rest }) {
  return <input className={`input ${error ? "error" : ""}`} {...rest} />;
}

/** Liste déroulante controlled. */
export function Select({ options, error, ...rest }) {
  return (
    <select className={`select ${error ? "error" : ""}`} {...rest}>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Badge coloré pour un statut. */
export function Badge({ children, classe = "badge-neutral" }) {
  return <span className={`badge ${classe}`}>{children}</span>;
}

/** Avatar coloré, initiales calculées. */
export function Avatar({ nom, prenoms, couleur, size = 38 }) {
  const lettres = [nom, prenoms]
    .filter(Boolean)
    .map((n) => String(n).trim().charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  let teinte = couleur;
  if (!teinte) {
    const cle = String(nom || "x");
    let hash = 0;
    for (let i = 0; i < cle.length; i++) hash = cle.charCodeAt(i) + ((hash << 5) - hash);
    const palette = ["#1D4ED8", "#047857", "#B45309", "#BE123C", "#0E7490", "#6D28D9", "#BE185D", "#0F766E"];
    teinte = palette[Math.abs(hash) % palette.length];
  }

  return (
    <span className="avatar" style={{ background: teinte, width: size, height: size, fontSize: size * 0.38 }}>
      {lettres}
    </span>
  );
}

/**
 * Lien interactif vers la fiche d'un locataire, stylisé avec ou sans avatar.
 * Remplace les liens textuels basiques soulignés par un rendu moderne et soigné.
 */
export function LocataireLink({
  locataire,
  id,
  nom,
  prenoms,
  avatar = false,
  avatarSize = 26,
  telephone,
  showPhone = false,
  className = "",
  style,
}) {
  const locId = id || locataire?.id;
  const nomComplet = locataire
    ? `${locataire.nom || ""} ${locataire.prenoms || ""}`.trim()
    : [nom, prenoms].filter(Boolean).join(" ").trim() || "—";

  if (!locId) {
    return (
      <span className={`locataire-chip no-link ${avatar ? "has-avatar" : "no-avatar"} ${className}`} style={style}>
        {avatar && (
          <Avatar
            nom={locataire?.nom || nom}
            prenoms={locataire?.prenoms || prenoms}
            size={avatarSize}
          />
        )}
        <span className="locataire-nom">{nomComplet}</span>
      </span>
    );
  }

  return (
    <Link
      to={`/locataires/${locId}`}
      className={`locataire-chip ${avatar ? "has-avatar" : "no-avatar"} ${className}`}
      style={style}
      title={`Voir la fiche de ${nomComplet}`}
    >
      {avatar && (
        <Avatar
          nom={locataire?.nom || nom}
          prenoms={locataire?.prenoms || prenoms}
          size={avatarSize}
        />
      )}
      <span className="locataire-nom">{nomComplet}</span>
      {showPhone && (locataire?.telephone || telephone) && (
        <span className="locataire-phone">{locataire?.telephone || telephone}</span>
      )}
    </Link>
  );
}

/**
 * Barre de progression 0-100.
 */
export function ProgressBar({ valeur, label, couleur = "var(--primary)" }) {
  const v = Math.max(0, Math.min(100, Math.round(valeur)));
  return (
    <div>
      {label && (
        <div className="row" style={{ justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "0.35rem" }}>
          <span className="text-muted" style={{ fontWeight: 500 }}>{label}</span>
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>{v} %</strong>
        </div>
      )}
      <div style={{ height: 8, background: "var(--bg-subtle)", border: "1px solid var(--border-light)", borderRadius: 9999, overflow: "hidden" }}>
        <div style={{ width: `${v}%`, height: "100%", background: couleur, borderRadius: 9999, transition: "width .4s ease" }} />
      </div>
    </div>
  );
}

/** Message d'erreur global, masqué s'il n'y a rien à dire. */
export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="alert alert-error" role="alert">
      {message}
    </div>
  );
}