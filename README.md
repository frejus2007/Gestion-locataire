# Gestion locataires

Application web de gestion locative : suivi des locataires et des paiements,
avec un espace dédié aux locataires pour consulter leurs informations et leurs
quittances.

## Prérequis

- Node.js
- npm
- Le backend de l’application, accessible sur `http://localhost:3001`

Le backend n’est pas inclus dans ce dépôt. Le frontend utilise son API REST
pour récupérer et modifier les propriétaires, les locataires et les paiements.

## Installation et démarrage

```sh
npm ci
npm run dev
```

Vite affiche l’adresse locale de l’application dans le terminal.

## Vérifications

```sh
npm run lint
npm run build
```

## Technologies

- React
- Vite
- React Router
- Recharts
- Oxlint
