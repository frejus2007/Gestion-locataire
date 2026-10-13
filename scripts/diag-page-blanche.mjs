// Diagnostique une page blanche : charge l'application, ouvre la modale
// d'encaissement, et remonte la moindre exception JavaScript.
//
// Un écran blanc ne laisse aucune trace côté serveur : la cause est forcément
// dans le navigateur. Ce script l'intercepte.
//
// Aucune écriture : ouvrir une modale et cocher des mois ne touche pas à
// Firebase. Il faut seulement être connecté, d'où CAG_EMAIL et
// CAG_MOT_DE_PASSE.
//
// Usage : node scripts/diag-page-blanche.mjs

import { lancerChrome, attendre } from "./lib/navigateur.mjs";

const EMAIL = process.env.CAG_EMAIL;
const MOT_DE_PASSE = process.env.CAG_MOT_DE_PASSE;

if (!EMAIL || !MOT_DE_PASSE) {
  console.log(
    "Identifiants absents : renseigne CAG_EMAIL et CAG_MOT_DE_PASSE,\n" +
      "ou ouvre la console (F11 pour quitter le plein écran, puis Ctrl+Maj+I)\n" +
      "et copie-moi la ligne rouge."
  );
  process.exit(0);
}

const { cdp, fermer } = await lancerChrome({ port: 9232 });
try {
  // Toute exception, dans la page comme dans la console, est consignée.
  await cdp.envoyer("Runtime.enable");
  await cdp.envoyer("Log.enable");
  cdp.envoyer("Runtime.evaluate", {
    expression: `
      window.__erreurs = [];
      window.addEventListener("error", (e) => {
        window.__erreurs.push("ERREUR: " + (e.message || "") + " @ " + (e.filename||"").split("/").pop() + ":" + e.lineno);
      });
      window.addEventListener("unhandledrejection", (e) => {
        window.__erreurs.push("REJET: " + (e.reason && (e.reason.message || e.reason)));
      });
      const erreurConsole = console.error;
      console.error = function (...args) {
        window.__erreurs.push("console.error: " + args.map(String).join(" ").slice(0, 300));
        erreurConsole.apply(console, args);
      };
      true;
    `,
  });

  await cdp.ouvrir("/login", 3500);
  await cdp.saisir("input[type=text]", EMAIL);
  await cdp.saisir("input[type=password]", MOT_DE_PASSE);
  await cdp.cliquer("se connecter");
  await attendre(5000);

  const url = await cdp.evaluer("location.pathname");
  console.log("après connexion :", url);
  if (url === "/login") {
    console.log("connexion refusée : vérifie l'identifiant et le mot de passe.");
    process.exit(1);
  }

  await cdp.ouvrir("/paiements");
  await attendre(1500);
  console.log("avant la modale, page 정상 :", await cdp.evaluer("document.body.innerText.length"), "caractères");

  await cdp.cliquer("encaisser un loyer");
  await attendre(2000);

  const etat = await cdp.evaluer(`
    (function () {
      return JSON.stringify({
        modale: !!document.querySelector(".modal"),
        racine: document.getElementById("root")?.children.length || 0,
        texte: document.body.innerText.length,
        erreurs: (window.__erreurs || []).slice(0, 12),
      });
    })();`);
  console.log("\nétat :", etat);

  // Si rien ne s'affiche, on coche pour déclencher le moindre second défaut.
  await cdp.evaluer(`
    (function () {
      const cases = [...document.querySelectorAll(".cag-mois-case")];
      cases.slice(0, 3).forEach((c) => c.querySelector("input")?.click());
      return cases.length;
    })();`);
  await attendre(1200);
  console.log("après cochage :", await cdp.evaluer(`
    JSON.stringify({
      modale: !!document.querySelector(".modal"),
      erreurs: (window.__erreurs || []).slice(0, 12),
    });`));
} finally {
  fermer();
}