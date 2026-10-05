import { createContext, useContext, useState, useEffect, useCallback } from "react";
import * as api from "../api/client";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [owner, setOwner] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [o, t, p] = await Promise.all([api.getOwner(), api.getTenants(), api.getPayments()]);
    setOwner(o);
    setTenants(t);
    setPayments(p);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Synchronisation temps réel avec l'app locataire
  useEffect(() => {
    const unsubscribe = api.subscribeToUpdates(() => {
      refresh();
    });
    return unsubscribe;
  }, [refresh]);

  // Calcul du solde d'un locataire
  const getBalance = useCallback(
    (tenantId) => {
      const tenantPayments = payments.filter((p) => p.tenantId === tenantId);
      const totalDu = tenantPayments.reduce((s, p) => s + p.montantDu, 0);
      const totalPaye = tenantPayments.reduce((s, p) => s + p.montantPaye, 0);
      return totalDu - totalPaye;
    },
    [payments]
  );

  const addPayment = useCallback(async (data) => {
    const created = await api.createPayment(data);
    setPayments((prev) => [...prev, created]);
    return created;
  }, []);

  const addTenant = useCallback(async (data) => {
    const created = await api.createTenant(data);
    setTenants((prev) => [...prev, created]);
    return created;
  }, []);

  const editTenant = useCallback(async (id, data) => {
    const updated = await api.updateTenant(id, data);
    setTenants((prev) => prev.map((t) => (t.id === id ? updated : t)));
    return updated;
  }, []);

  const removeTenant = useCallback(async (id) => {
    await api.deleteTenant(id);
    setTenants((prev) => prev.filter((t) => t.id !== id));
    setPayments((prev) => prev.filter((p) => p.tenantId !== id));
  }, []);

  const value = {
    owner,
    tenants,
    payments,
    loading,
    refresh,
    getBalance,
    addPayment,
    addTenant,
    editTenant,
    removeTenant,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp doit être utilisé dans AppProvider");
  return ctx;
}
