// Client API — utilise le backend partagé sur http://localhost:3001
// Les deux plateformes (propriétaire + locataire) utilisent la même base de données

const API = "http://localhost:3001/api";

async function request(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`Erreur API: ${res.status}`);
  return res.json();
}

// --- Propriétaire ---
export async function getOwner() {
  return request(`${API}/owner`);
}

// --- Locataires ---
export async function getTenants() {
  return request(`${API}/tenants`);
}

export async function getTenant(id) {
  return request(`${API}/tenants/${id}`);
}

export async function createTenant(data) {
  return request(`${API}/tenants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateTenant(id, data) {
  return request(`${API}/tenants/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteTenant(id) {
  return request(`${API}/tenants/${id}`, { method: "DELETE" });
}

// --- Paiements ---
export async function getPayments(tenantId = null) {
  const url = tenantId ? `${API}/payments?tenantId=${tenantId}` : `${API}/payments`;
  return request(url);
}

export async function createPayment(data) {
  return request(`${API}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// --- Espace locataire ---
export async function loginTenant(telephone, code) {
  return request(`${API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telephone, code }),
  });
}

// Polling pour la synchronisation (toutes les 5 secondes)
export function subscribeToUpdates(callback) {
  const interval = setInterval(callback, 5000);
  return () => clearInterval(interval);
}
