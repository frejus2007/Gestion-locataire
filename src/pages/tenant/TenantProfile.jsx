import { useParams } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { formatDate } from "../../utils/format";
import { User, Phone, CreditCard, Calendar, Hash } from "lucide-react";

export default function TenantProfile() {
  const { id } = useParams();
  const { tenants, owner } = useApp();

  const tenant = tenants.find((t) => t.id === Number(id));
  if (!tenant) return null;

  return (
    <div>
      <h1 className="tenant-page-title">Mon profil</h1>
      <p className="tenant-page-subtitle">Vos informations personnelles</p>

      <div className="tenant-card">
        <div className="tenant-profile-header">
          <div className="tenant-profile-avatar">
            {tenant.nom.charAt(0)}{tenant.prenoms.charAt(0)}
          </div>
          <div>
            <div className="tenant-profile-name">{tenant.nom} {tenant.prenoms}</div>
            <div className="tenant-profile-sub">Locataire</div>
          </div>
        </div>
      </div>

      <div className="tenant-card">
        <div className="tenant-info-item">
          <div className="tenant-info-icon"><Phone size={16} /></div>
          <div>
            <div className="tenant-info-label">Téléphone</div>
            <div className="tenant-info-value">{tenant.telephone}</div>
          </div>
        </div>
        <div className="tenant-info-item">
          <div className="tenant-info-icon"><CreditCard size={16} /></div>
          <div>
            <div className="tenant-info-label">IFU</div>
            <div className="tenant-info-value">{tenant.ifu || "—"}</div>
          </div>
        </div>
        <div className="tenant-info-item">
          <div className="tenant-info-icon"><Hash size={16} /></div>
          <div>
            <div className="tenant-info-label">Pièce d'identité</div>
            <div className="tenant-info-value">{tenant.pieceNature} n° {tenant.pieceNumero || "—"}</div>
          </div>
        </div>
        <div className="tenant-info-item">
          <div className="tenant-info-icon"><Calendar size={16} /></div>
          <div>
            <div className="tenant-info-label">Date d'entrée</div>
            <div className="tenant-info-value">{formatDate(tenant.dateEntree)}</div>
          </div>
        </div>
      </div>

      {/* Propriétaire */}
      <div className="tenant-card">
        <div className="tenant-card-title">Votre propriétaire</div>
        <div className="tenant-info-item">
          <div className="tenant-info-icon"><User size={16} /></div>
          <div>
            <div className="tenant-info-label">Nom</div>
            <div className="tenant-info-value">{owner?.nom} {owner?.prenoms}</div>
          </div>
        </div>
        <div className="tenant-info-item">
          <div className="tenant-info-icon"><Phone size={16} /></div>
          <div>
            <div className="tenant-info-label">Téléphone</div>
            <div className="tenant-info-value">{owner?.telephone}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
