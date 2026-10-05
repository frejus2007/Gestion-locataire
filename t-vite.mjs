// Rendu via le pipeline Vite reel (createServer + ssrLoadModule) : c'est la
// source de verite, contrairement au loader maison.
import { createServer } from 'vite';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter, Routes, Route } from 'react-router';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

const ROUTES = {
  '/': 'pages/Dashboard.jsx',
  '/immeubles': 'pages/immeubles/ImmeubleList.jsx',
  '/immeubles/imm_1': 'pages/immeubles/ImmeubleDetail.jsx',
  '/immeubles/nouveau': 'pages/immeubles/ImmeubleForm.jsx',
  '/locataires': 'pages/locataires/LocataireList.jsx',
  '/locataires/loc_1': 'pages/locataires/LocataireDetail.jsx',
  '/locataires/nouveau': 'pages/locataires/LocataireForm.jsx',
  '/locataires/loc_1/bail': 'pages/locataires/BailForm.jsx',
  '/paiements': 'pages/paiements/PaiementList.jsx',
  '/paiements/nouveau': 'pages/paiements/PaiementForm.jsx',
  '/quittances': 'pages/quittances/QuittanceList.jsx',
  '/depenses': 'pages/depenses/DepenseList.jsx',
  '/journal': 'pages/Journal.jsx',
  '/parametres': 'pages/Parametres.jsx',
};
const db = await server.ssrLoadModule('/src/data/db.js');
ROUTES['/quittances/' + db.listQuittances()[0].id] = 'pages/quittances/QuittanceView.jsx';

const { AppProvider } = await server.ssrLoadModule('/src/context/AppContext.jsx');
const { ToastProvider } = await server.ssrLoadModule('/src/context/ToastContext.jsx');

let ko = 0;
for (const [chemin, fichier] of Object.entries(ROUTES)) {
  try {
    const { default: Page } = await server.ssrLoadModule('/src/' + fichier);
    // Les pages lisent useParams() : sans une vraie Route, le parametre :id
    // reste undefined et le test afficherait un etat vide qui n'existe pas.
    // Le patron '/:section/*' reproduit l'imbrication de App.jsx.
    const segment = chemin.split('/')[1] || 'racine';
    const reste = chemin.split('/').slice(2);
    const avecId = reste.length >= 1;
    const path = avecId
      ? `/:section/:id/*`
      : segment === 'racine'
        ? '/'
        : `/:section`;

    const html = renderToString(
      React.createElement(StaticRouter, { location: chemin },
        React.createElement(Routes, null,
          React.createElement(Route, {
            path,
            element: React.createElement(AppProvider, null,
              React.createElement(ToastProvider, null, React.createElement(Page))),
          })
        ))
    );
    const vide = html.length < 300;
    console.log(`${vide ? 'ATTENTION' : 'OK      '} ${chemin.padEnd(32)} ${html.length} car.`);
    if (vide) ko++;
  } catch (e) {
    ko++;
    console.log(`ERREUR  ${chemin.padEnd(32)} ${e.message.split('\n')[0]}`);
    console.log(`         ${(e.stack || '').split('\n')[1]?.trim()}`);
  }
}
console.log(ko === 0 ? '\nTOUTES LES PAGES SE RENDENT' : `\n${ko} probleme(s)`);
await server.close();
