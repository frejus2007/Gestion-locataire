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
import FiletErreur from "./components/FiletErreur";
import ProtectedRoute from "./components/ProtectedRoute";
import SplashScreen from "./components/SplashScreen";
import { EmptyState } from "./components/ui";
import { preparerLogo, preparerSignature } from "./utils/quittancePdf";
import { FileQuestion } from "lucide-react";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));

// Immeubles
const ImmeubleList = lazy(() => import("./pages/immeubles/ImmeubleList"));
const ImmeubleDetail = lazy(() => import("./pages/immeubles/ImmeubleDetail"));
const ImmeubleForm = lazy(() => import("./pages/immeubles/ImmeubleForm"));

// Argent
const PaiementsQuittances = lazy(() => import("./pages/PaiementsQuittances"));

// Locataires
const Locataires = lazy(() => import("./pages/locataires/Locataires"));
const LocataireForm = lazy(() => import("./pages/locataires/LocataireForm"));
const Compte = lazy(() => import("./pages/locataires/Compte"));
const BailForm = lazy(() => import("./pages/locataires/BailForm"));

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

  useEffect(() => {
    // Logo et signature sont chargés une fois, en tâche de fond : les
    // quittances produites ensuite les embarquent sans attente.
    preparerLogo();
    preparerSignature();
  }, []);

  return (
    <ToastProvider>
      <AuthProvider>
        {/* AppProvider lit la session pour savoir quand charger : il doit être
            à l'intérieur d'AuthProvider, sinon useAuth ne trouve pas son
            contexte. */}
        <AppProvider>
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
              {/* Le filet d'enveloppe les écrans : une exception y affiche un
                  message au lieu de vider la page, ce qui laisse l'application
                  utilisable et le défaut visible. */}
              <FiletErreur>
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
                    <Route index element={<Locataires />} />
                    <Route path="nouveau" element={<LocataireForm />} />
                    <Route path=":id" element={<Compte />} />
                    <Route path=":id/modifier" element={<LocataireForm />} />
                    <Route path=":id/bail" element={<BailForm />} />
                  </Route>

                  <Route path="paiements" element={<PaiementsQuittances />} />

                  <Route path="parametres" element={<Parametres />} />

                  <Route path="*" element={<Introuvable />} />
                </Route>
              </Routes>
              </FiletErreur>
            </Suspense>
            </BrowserRouter>
          )}
        </AppProvider>
      </AuthProvider>
    </ToastProvider>
  );
}