import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // Tant que Firebase n'a pas répondu, on ne peut pas conclure : renvoyer vers
  // la connexion ici le ferait par erreur. Un rechargement de page en pleine
  // session prouve le cas — l'utilisateur est authentifié, `loading` est vrai,
  // et le refus serait arbitraire.
  if (loading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
