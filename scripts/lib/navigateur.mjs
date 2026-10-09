// Pilotage de Chrome en headless, pour les captures et les tests.
//
// Les scripts n'ont pas besoin de Puppeteer : le protocole DevTools suffit et
// évite une dépendance de plus dans le projet. Chrome en peignant moins haut que
// la fenêtre, la hauteur se règle par `HAUTEUR` pour rester sous cette limite.
//
//   ▸ Ce fichier                  scripts/lib/navigateur.mjs
//   ▸ Captures des pages          scripts/captures.mjs
//   ▸ Captures des modales        scripts/captures-modales.mjs
//   ▸ Test d'encaissement         scripts/test-encaissement.mjs
//   ▸ Test d'enregistrement       scripts/test-locataire.mjs

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

export const ORIGINE = process.env.ORIGINE || "http://localhost:5199";

/** Session de démonstration : les pages protégées exigent une session posée. */
export const SESSION = {
  id: "usr_admin_01",
  email: "admin@cag-immobilier.bj",
  nom: "KOUASSI",
  prenoms: "Jean-Marc",
  role: "Bailleur gestionnaire",
  cabinet: "Chabi Arnaud GOUNOU",
};

export const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Connexion CDP à un onglet, avec relais des erreurs console. */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.enAttente = new Map();
    this.silencieux = false;
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      // Les refus d'écriture et les exceptions React n'apparaissent que dans la
      // console : sans ce relais, un échec se réduit à un message générique.
      if (!this.silencieux && msg.method === "Runtime.consoleAPICalled"
        && /error|warn/.test(msg.params.type)) {
        console.log(
          `  [console.${msg.params.type}] ` +
            msg.params.args.map((a) => a.description || a.value).join(" ").slice(0, 300)
        );
      }
      if (!this.silencieux && msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails;
        console.log(
          "  [exception] " +
            (d.exception?.description || d.text || "").split("\n").slice(0, 3).join(" ")
        );
      }
      const solves = this.enAttente.get(msg.id);
      if (solves) {
        this.enAttente.delete(msg.id);
        if (msg.error) solves.rejeter(new Error(msg.error.message));
        else solves.resoudre(msg.result);
      }
    });
  }

  envoyer(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resoudre, rejeter) => this.enAttente.set(id, { resoudre, rejeter }));
  }

  /** Évalue une expression et renvoie sa valeur. */
  async evaluer(expression) {
    const r = await this.envoyer("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result?.value;
  }

  /** Clique le premier bouton ou lien dont le texte contient `mot`. */
  cliquer(mot) {
    return this.evaluer(`
      (function () {
        const mot = ${JSON.stringify(mot.toLowerCase())};
        const el = [...document.querySelectorAll("button, a")]
          .find((e) => (e.innerText || "").toLowerCase().includes(mot));
        if (!el) return "introuvable : " + mot;
        el.click();
        return "ok : " + (el.innerText || "").trim().slice(0, 40);
      })();`);
  }

  /**
   * Renseigne un champ contrôlé par React. Passer par le setter natif est
   * indispensable : `el.value = x` seul ne déclenche pas `onChange`.
   */
  saisir(selecteur, valeur) {
    return this.evaluer(`
      (function () {
        const el = document.querySelector(${JSON.stringify(selecteur)});
        if (!el) return "introuvable : " + ${JSON.stringify(selecteur)};
        const proto = el.tagName === "SELECT"
          ? window.HTMLSelectElement
          : window.HTMLInputElement;
        Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, ${JSON.stringify(valeur)});
        el.dispatchEvent(
          new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })
        );
        return "ok";
      })();`);
  }

  /** Choisit la première option utile d'une liste déroulante. */
  choisir(selecteur, index = 1) {
    return this.evaluer(`
      (function () {
        const el = document.querySelector(${JSON.stringify(selecteur)});
        if (!el) return "introuvable";
        const opt = el.options[${index}];
        if (!opt) return "aucune option";
        Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")
          .set.call(el, opt.value);
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return opt.text;
      })();`);
  }

  async shot(fichier) {
    const { data } = await this.envoyer("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(fichier, Buffer.from(data, "base64"));
    console.log(`  ${path.basename(fichier)}`);
    return fichier;
  }

  /** Ouvre une page et attend la fin du voile d'accueil. */
  async ouvrir(chemin, attente = 3800) {
    await this.envoyer("Page.navigate", { url: `${ORIGINE}${chemin}` });
    await attendre(attente);
    return this.evaluer("location.pathname");
  }

  /** Pose la session puis revient sur l'application. */
  async connecter(theme) {
    await this.ouvrir("/login", 3200);
    await this.evaluer(`
      localStorage.setItem("cag_auth_session", ${JSON.stringify(JSON.stringify(SESSION))});
      // La bascule de thème lit « theme » : « dark » pour le mode sombre.
      localStorage.setItem("theme", ${JSON.stringify(theme === "sombre" ? "dark" : "light")});
      true;`);
  }
}

async function chromeCible(port) {
  for (let essai = 0; essai < 40; essai++) {
    try {
      const onglets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = onglets.find((o) => o.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* Chrome n'écoute pas encore */
    }
    await attendre(300);
  }
  throw new Error("Chrome n'a pas ouvert son port de débogage");
}

/**
 * Lance Chrome et rend un contrôleur de page.
 *
 * @param {object} [options]
 * @param {number} [options.port]     port de débogage, à changer d'un script à l'autre
 * @param {number} [options.largeur]  largeur de fenêtre
 * @param {number} [options.hauteur]  hauteur de fenêtre
 * @param {string} [options.silencieux]  coupe le relais des erreurs console
 */
export async function lancerChrome(options = {}) {
  const {
    port = 9222,
    largeur = 1600,
    hauteur = Number(process.env.HAUTEUR || 1000),
    silencieux = false,
  } = options;

  const profil = fs.mkdtempSync(path.join(os.tmpdir(), "cag-chrome-"));
  const chrome = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profil}`,
    `--window-size=${largeur},${hauteur}`,
    "about:blank",
  ], { stdio: "ignore" });

  let cdp;
  try {
    const ws = new WebSocket(await chromeCible(port));
    await new Promise((resoudre, rejeter) => {
      ws.addEventListener("open", resoudre, { once: true });
      ws.addEventListener("error", () => rejeter(new Error("WebSocket refusé")), { once: true });
    });
    cdp = new Cdp(ws);
    cdp.silencieux = silencieux;
    await cdp.envoyer("Page.enable");
    await cdp.envoyer("Runtime.enable");
  } catch (erreur) {
    chrome.kill();
    throw erreur;
  }

  return {
    cdp,
    /** Ferme Chrome et supprime son profil. */
    fermer() {
      chrome.kill();
      // Chrome tient encore un instant le profil : l'échec de suppression est
      // sans conséquence, le dossier est dans le répertoire temporaire.
      try {
        fs.rmSync(profil, { recursive: true, force: true });
      } catch {
        /* profil laissé en place */
      }
    },
  };
}