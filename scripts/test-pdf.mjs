// Vérifie de bout en bout que le bouton « PDF » produit un vrai fichier.
//
// Chrome est piloté par le protocole DevTools : on se connecte, on clique le
// premier bouton « PDF » de la page Paiements & Quittances, et on regarde le
// fichier arrivé dans le dossier de téléchargement.
//
// Usage : node scripts/test-pdf.mjs

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9223;
const ORIGINE = process.env.ORIGINE || "http://localhost:5199";
const DOSSIER = path.join(os.tmpdir(), "cag-pdf");

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function chromeCible() {
  for (let essai = 0; essai < 40; essai++) {
    try {
      const onglets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = onglets.find((o) => o.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* pas encore prêt */
    }
    await attendre(300);
  }
  throw new Error("Chrome n'a pas ouvert son port de débogage");
}

function connecter(url) {
  const ws = new WebSocket(url);
  const enAttente = new Map();
  let id = 0;
  const anomalies = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      anomalies.push(d.exception?.description || d.text || "exception");
    }
    const solve = enAttente.get(msg.id);
    if (solve) {
      enAttente.delete(msg.id);
      if (msg.error) solve.rejeter(new Error(msg.error.message));
      else solve.resoudre(msg.result);
    }
  });
  const envoyer = (method, params = {}) => {
    const i = ++id;
    ws.send(JSON.stringify({ id: i, method, params }));
    return new Promise((resoudre, rejeter) => enAttente.set(i, { resoudre, rejeter }));
  };
  return new Promise((r) => {
    ws.addEventListener("open", () => r({ envoyer, anomalies }));
  });
}

async function main() {
  fs.rmSync(DOSSIER, { recursive: true, force: true });
  fs.mkdirSync(DOSSIER, { recursive: true });

  const profil = fs.mkdtempSync(path.join(os.tmpdir(), "cag-pdf-profil-"));
  const chrome = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profil}`,
    "--window-size=1600,1050",
    "about:blank",
  ], { stdio: "ignore" });

  try {
    const { envoyer, anomalies } = await connecter(await chromeCible());
    await envoyer("Page.enable");
    await envoyer("Runtime.enable");

    // Autorise les téléchargements dans notre dossier, sans dialogue.
    await envoyer("Page.setDownloadBehavior", { behavior: "allow", downloadPath: DOSSIER });

    await envoyer("Page.navigate", { url: `${ORIGINE}/login` });
    await attendre(3000);
    await envoyer("Runtime.evaluate", {
      expression: `localStorage.setItem("cag_auth_session", JSON.stringify({
        id: "usr_admin_01", email: "admin@cag-immobilier.bj",
        nom: "KOUASSI", prenoms: "Jean-Marc", role: "Bailleur gestionnaire"
      }));`,
    });

    await envoyer("Page.navigate", { url: `${ORIGINE}/paiements` });
    await attendre(4000);

    // Compte les boutons PDF, puis clique le premier.
    const compte = await envoyer("Runtime.evaluate", {
      expression: `document.querySelectorAll('button').length && Array.from(
        document.querySelectorAll('button')
      ).filter(b => b.textContent.trim() === 'PDF').length`,
      returnByValue: true,
    });
    const nbBoutons = compte.result.value;
    console.log(`boutons « PDF » trouvés : ${nbBoutons}`);
    if (!nbBoutons) throw new Error("aucun bouton PDF sur la page");

    await envoyer("Runtime.evaluate", {
      expression: `Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim() === 'PDF').click();`,
    });

    // Le fichier doit atterrir sur le disque (le logo embarqué le rend plus lourd).
    let fichier = null;
    for (let i = 0; i < 75 && !fichier; i++) {
      await attendre(400);
      const noms = fs
        .readdirSync(DOSSIER)
        .filter((f) => f.endsWith(".pdf"));
      if (noms.length) fichier = path.join(DOSSIER, noms[0]);
    }

    if (!fichier) {
      console.log("✗ aucun PDF produit");
      console.log("dossier :", fs.readdirSync(DOSSIER));
    } else {
      const tete = fs.readFileSync(fichier).subarray(0, 5).toString();
      const taille = fs.statSync(fichier).size;
      console.log(`✓ fichier produit : ${path.basename(fichier)} (${taille} octets)`);
      console.log(`  signature      : ${tete}`);
      console.log(`  nom conforme   : ${/^Q-\d{4}-\d{6}\.pdf$/.test(path.basename(fichier))}`);
    }

    if (anomalies.length) {
      console.log("\n✗ erreurs JavaScript relevées :");
      anomalies.forEach((a) => console.log("  -", a.split("\n")[0]));
    } else {
      console.log("\n✓ aucune erreur JavaScript");
    }
  } finally {
    chrome.kill();
    await attendre(600);
    fs.rmSync(profil, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((e) => {
  console.error("ÉCHEC :", e.message);
  process.exit(1);
});