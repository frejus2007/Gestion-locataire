// Routage de l'application.
//
// Chaque page est chargée à la demande : le premier rendu ne transporte que
// le tableau de bord, pas tout le reste.

import { Suspense, lazy, useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import { ToastProvider } from "./context/ToastContext";
import { AuthProvider } from "./context/AuthContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import SplashScreen from "./components/SplashScreen";
import { EmptyState } from "./components/ui";
import { FileQuestion } from "lucide-react";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));

// Immeubles
const ImmeubleList = lazy(() => import("./pages/immeubles/ImmeubleList"));
const ImmeubleDetail = lazy(() => import("./pages/immeubles/ImmeubleDetail"));
const ImmeubleForm = lazy(() => import("./pages/immeubles/ImmeubleForm"));

// Locataires
const LocataireList = lazy(() => import("./pages/locataires/LocataireList"));
const LocataireDetail = lazy(() => import("./pages/locataires/LocataireDetail"));
const LocataireForm = lazy(() => import("./pages/locataires/LocataireForm"));
const BailForm = lazy(() => import("./pages/locataires/BailForm"));

// Argent
const PaiementList = lazy(() => import("./pages/paiements/PaiementList"));
const PaiementForm = lazy(() => import("./pages/paiements/PaiementForm"));
const QuittanceList = lazy(() => import("./pages/quittances/QuittanceList"));
const QuittanceView = lazy(() => import("./pages/quittances/QuittanceView"));
const DepenseList = lazy(() => import("./pages/depenses/DepenseList"));
const Journal = lazy(() => import("./pages/Journal"));

const Parametres = lazy(() => import("./pages/Parametres"));

function Chargement() {
  return (
    <div style={{ padding: "3rem 0" }}>
      <p className="text-muted" style={{ textAlign: "center" }}>
        Chargement…
      </p>
    </div>
  );
}

function Introuvable() {
  return (
    <EmptyState
      icon={FileQuestion}
      message="Cette page n'existe pas."
      action={
        <Link to="/" className="btn btn-primary" style={{ marginTop: "0.75rem" }}>
          Retour au tableau de bord
        </Link>
      }
    />
  );
}

export default function App() {
  const [splashActif, setSplashActif] = useState(true);
  const [appPrete, setAppPrete] = useState(false);

  useEffect(() => {
    const handleReload = () => {
      setSplashActif(true);
      setAppPrete(false);
    };
    const handleLogin = () => setSplashActif(true);
    window.addEventListener("cag:reconnect", handleReload);
    window.addEventListener("cag:login", handleLogin);
    return () => {
      window.removeEventListener("cag:reconnect", handleReload);
      window.removeEventListener("cag:login", handleLogin);
    };
  }, []);

  return (
    <AppProvider>
      <ToastProvider>
        <AuthProvider>
          {splashActif && (
            <SplashScreen
              duration={1800}
              onStartFade={() => setAppPrete(true)}
              onFinish={() => {
                setAppPrete(true);
                setSplashActif(false);
              }}
            />
          )}
          {appPrete && (
            <BrowserRouter>
              <Suspense fallback={<Chargement />}>
              <Routes>
                {/* Route publique de connexion */}
                <Route path="/login" element={<Login />} />

                {/* Routes protégées par authentification */}
                <Route
                  element={
                    <ProtectedRoute>
                      <Layout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Dashboard />} />

                  <Route path="immeubles">
                    <Route index element={<ImmeubleList />} />
                    <Route path="nouveau" element={<ImmeubleForm />} />
                    <Route path=":id" element={<ImmeubleDetail />} />
                    <Route path=":id/modifier" element={<ImmeubleForm />} />
                  </Route>

                  <Route path="locataires">
                    <Route index element={<LocataireList />} />
                    <Route path="nouveau" element={<LocataireForm />} />
                    <Route path=":id" element={<LocataireDetail />} />
                    <Route path=":id/modifier" element={<LocataireForm />} />
                    <Route path=":id/bail" element={<BailForm />} />
                    <Route path=":id/paiement" element={<PaiementForm />} />
                  </Route>

                  <Route path="paiements">
                    <Route index element={<PaiementList />} />
                    <Route path="nouveau" element={<PaiementForm />} />
                  </Route>

                  <Route path="quittances">
                    <Route index element={<QuittanceList />} />
                    <Route path=":id" element={<QuittanceView />} />
                  </Route>

                  <Route path="depenses" element={<DepenseList />} />
                  <Route path="journal" element={<Journal />} />
                  <Route path="parametres" element={<Parametres />} />

                  <Route path="*" element={<Introuvable />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
        )}
        </AuthProvider>
      </ToastProvider>
    </AppProvider>
  );
}