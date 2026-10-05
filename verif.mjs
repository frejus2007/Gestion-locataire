// Verification fonctionnelle : rend chaque page et extrait le texte visible.
// Detecte les pluriels casses, les valeurs undefined et les etats vides.
import { createServer } from 'vite';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter, Routes, Route } from 'react-router';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { AppProvider } = await server.ssrLoadModule('/src/context/AppContext.jsx');
const { ToastProvider } = await server.ssrLoadModule('/src/context/ToastContext.jsx');
const db = await server.ssrLoadModule('/src/data/db.js');

const cibles = [
  ['/', 'pages/Dashboard.jsx'],
  ['/immeubles', 'pages/immeubles/ImmeubleList.jsx'],
  ['/immeubles/nouveau', 'pages/immeubles/ImmeubleForm.jsx'],
  ['/immeubles/imm_1', 'pages/immeubles/ImmeubleDetail.jsx'],
  ['/locataires', 'pages/locataires/LocataireList.jsx'],
  ['/locataires/nouveau', 'pages/locataires/LocataireForm.jsx'],
  ['/locataires/loc_1', 'pages/locataires/LocataireDetail.jsx'],
  ['/locataires/loc_1/bail', 'pages/locataires/BailForm.jsx'],
  ['/paiements', 'pages/paiements/PaiementList.jsx'],
  ['/paiements/nouveau', 'pages/paiements/PaiementForm.jsx'],
  ['/quittances', 'pages/quittances/QuittanceList.jsx'],
  ['/quittances/' + db.listQuittances()[0].id, 'pages/quittances/QuittanceView.jsx'],
  ['/depenses', 'pages/depenses/DepenseList.jsx'],
  ['/journal', 'pages/Journal.jsx'],
  ['/parametres', 'pages/Parametres.jsx'],
];

const nettoyer = (h) => h
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&[a-z]+;/g, ' ')
  .replace(/\s+/g, ' ').trim();

let problemes = 0;
for (const [loc, fichier] of cibles) {
  // Reproduit l'imbrication de App.jsx : un segment litteral comme
  // « nouveau » doit etre declare avant « :id », sinon React Router le
  // capture comme un identifiant.
  const seg = loc.split('/')[1] || 'racine';
  const reste = loc.split('/').slice(2);
  let path;
  if (!reste.length) path = seg === 'racine' ? '/' : '/:section';
  else if (reste[0] === 'nouveau') path = '/:section/nouveau';
  else path = `/:section/:id${reste.length > 1 ? '/*' : ''}`;

  const { default: Page } = await server.ssrLoadModule('/src/' + fichier);
  let html;
  try {
    html = renderToString(React.createElement(StaticRouter, { location: loc },
      React.createElement(Routes, null,
        React.createElement(Route, { path,
          element: React.createElement(AppProvider, null,
            React.createElement(ToastProvider, null, React.createElement(Page))) }))));
  } catch (e) {
    problemes++;
    console.log(`ERREUR  ${loc.padEnd(30)} ${e.message.split('\n')[0]}`);
    continue;
  }

  const texte = nettoyer(html);
  const vides = /(?:Locataire|Immeuble|Quittance|Bail) introuvable\./i.test(texte);
  const undef = /\bundefined\b/.test(texte);
  const espacePluriel = /[a-zà-ÿ] (s|impa\\w*) (\\w)/.test(texte);

  const drapeaux = [];
  if (vides) drapeaux.push('ETAT VIDE');
  if (undef) drapeaux.push('UNDEFINED');
  if (espacePluriel) drapeaux.push('ESPACE PLURIEL');
  if (texte.length < 250) drapeaux.push('TROP COURT');

  if (drapeaux.length) {
    problemes++;
    console.log(`PROBLEME ${loc.padEnd(30)} ${drapeaux.join(', ')}`);
    const extrait = texte.match(/.{0,45}(undefined|introuvable| \w{1,6}s \w{2,8}).{0,45}/);
    if (extrait) console.log(`         « ${extrait[0].trim()} »`);
  } else {
    console.log(`OK       ${loc.padEnd(30)} ${String(html.length).padStart(6)} car.`);
  }
}

console.log(problemes === 0 ? '\nAUCUN PROBLEME DETECTE' : `\n${problemes} page(s) a corriger`);
await server.close();
