import { useState, useCallback } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import { ToastProvider } from "./context/ToastContext";
import SplashScreen from "./components/SplashScreen";
import Layout from "./components/Layout";
import TenantLayout from "./components/TenantLayout";
import Dashboard from "./pages/Dashboard";
import TenantList from "./pages/TenantList";
import TenantForm from "./pages/TenantForm";
import TenantDetail from "./pages/TenantDetail";
import PaymentForm from "./pages/PaymentForm";
import ReceiptList from "./pages/ReceiptList";
import ReceiptView from "./pages/ReceiptView";
import Settings from "./pages/Settings";
import TenantLogin from "./pages/TenantLogin";
import TenantHome from "./pages/tenant/TenantHome";
import TenantReceipts from "./pages/tenant/TenantReceipts";
import TenantProfile from "./pages/tenant/TenantProfile";

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
  }, []);

  return (
    <AppProvider>
      <ToastProvider>
        {showSplash && <SplashScreen onFinish={handleSplashFinish} />}
        <BrowserRouter>
          <Routes>
            {/* ===== Espace propriétaire ===== */}
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/locataires" element={<TenantList />} />
              <Route path="/locataires/nouveau" element={<TenantForm />} />
              <Route path="/locataires/:id" element={<TenantDetail />} />
              <Route path="/locataires/:id/modifier" element={<TenantForm />} />
              <Route path="/locataires/:tenantId/paiement" element={<PaymentForm />} />
              <Route path="/quittances" element={<ReceiptList />} />
              <Route path="/quittances/:id" element={<ReceiptView />} />
              <Route path="/parametres" element={<Settings />} />
            </Route>

            {/* ===== Espace locataire (séparé) ===== */}
            <Route path="/espace-locataire" element={<TenantLogin />} />
            <Route path="/espace-locataire/:id" element={<TenantLayout />}>
              <Route index element={<TenantHome />} />
              <Route path="quittances" element={<TenantReceipts />} />
              <Route path="profil" element={<TenantProfile />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AppProvider>
  );
}
