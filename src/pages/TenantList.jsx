import { useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { formatMoney, formatDate } from "../utils/format";
import { Search, Plus, Trash2, Eye, Edit, Users, Inbox, Phone, Calendar } from "lucide-react";

// Génère des couleurs d'avatar à partir du nom
const avatarColors = [
  "bg-indigo-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500",
  "bg-cyan-500", "bg-violet-500", "bg-pink-500", "bg-teal-500",
];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function getInitials(nom, prenoms) {
  return `${nom.charAt(0)}${prenoms.charAt(0)}`.toUpperCase();
}

export default function TenantList() {
  const { tenants, getBalance, removeTenant } = useApp();
  const { addToast } = useToast();
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const filtered = tenants.filter((t) =>
    `${t.nom} ${t.prenoms} ${t.telephone}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id) => {
    await removeTenant(id);
    setConfirmDelete(null);
    addToast("Locataire supprimé avec succès");
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Locataires</h1>
          <p className="text-muted">{tenants.length} locataire{tenants.length > 1 ? "s" : ""} enregistré{tenants.length > 1 ? "s" : ""}</p>
        </div>
        <Link to="/locataires/nouveau" className="btn btn-primary">
          <Plus size={16} /> Nouveau locataire
        </Link>
      </div>

      {/* Barre de recherche */}
      <div className="card" style={{ padding: "1rem 1.5rem" }}>
        <div style={{ position: "relative", maxWidth: 400 }}>
          <Search size={16} style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
          <input
            type="search"
            className="input"
            style={{ paddingLeft: "2.5rem" }}
            placeholder="Rechercher par nom, téléphone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Inbox className="empty-icon" size={24} />
            <p>
              {tenants.length === 0
                ? "Aucun locataire enregistré. Cliquez sur « Nouveau locataire » pour commencer."
                : "Aucun résultat pour cette recherche."}
            </p>
          </div>
        </div>
      ) : (
        <div className="tenant-grid">
          {filtered.map((t) => {
            const balance = getBalance(t.id);
            const isEndette = balance > 0;
            return (
              <div key={t.id} className="tenant-card">
                <div className="tenant-card-header">
                  <div className={`tenant-avatar ${getAvatarColor(t.nom)}`}>
                    {getInitials(t.nom, t.prenoms)}
                  </div>
                  <div className="tenant-card-info">
                    <div className="tenant-name">{t.nom} {t.prenoms}</div>
                    <div className="tenant-phone">
                      <Phone size={12} style={{ verticalAlign: "middle", marginRight: "0.3rem" }} />
                      {t.telephone}
                    </div>
                  </div>
                  <span className={`badge ${isEndette ? "badge-red" : "badge-green"}`}>
                    {isEndette ? formatMoney(balance) : "À jour"}
                  </span>
                </div>

                <div className="tenant-card-details">
                  <div className="tenant-detail-item">
                    <span className="tenant-detail-label">Loyer</span>
                    <span className="tenant-detail-value">{formatMoney(t.loyerMensuel)}/mois</span>
                  </div>
                  <div className="tenant-detail-item">
                    <span className="tenant-detail-label">Entrée</span>
                    <span className="tenant-detail-value">{formatDate(t.dateEntree)}</span>
                  </div>
                </div>

                <div className="tenant-card-actions">
                  <Link to={`/locataires/${t.id}`} className="btn btn-small btn-secondary">
                    <Eye size={14} /> Voir
                  </Link>
                  <Link to={`/locataires/${t.id}/modifier`} className="btn btn-small btn-secondary">
                    <Edit size={14} />
                  </Link>
                  <button
                    className="btn btn-small btn-danger"
                    onClick={() => setConfirmDelete(t.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modale de confirmation */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Confirmer la suppression</h3>
            <p>
              Voulez-vous vraiment supprimer ce locataire et tout son historique de paiements ?
              Cette action est irréversible.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>
                Annuler
              </button>
              <button className="btn btn-danger" onClick={() => handleDelete(confirmDelete)}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
