// Client Supabase. La clé publiable est destinée au navigateur : elle ne donne
// accès aux données qu'à un utilisateur connecté, grâce aux règles de la base.
// La clé service_role ne doit jamais figurer dans l'application.

import { createClient } from "@supabase/supabase-js";

const env = import.meta.env ?? {};
const url = env.VITE_SUPABASE_URL;
const cle = env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Sans configuration, l'application démarre quand même et affiche l'erreur de
// connexion, au lieu de planter au chargement.
export const configure = Boolean(url && cle);

export const supabase = createClient(url || "http://localhost", cle || "non-configure", {
  auth: { persistSession: true, autoRefreshToken: true },
});
