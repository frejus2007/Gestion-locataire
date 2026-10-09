# Intégration Firebase

## Configuration
- Créer projet Firebase (Web)
- Récupérer config dans .env.local (remplacer les valeurs)
- Activer Authentication → Email/Password
- Activer Firestore (mode production ou test)
- Déployer règles Firestore minimales

## Règles Firestore (exemple)
```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAuth() { return request.auth != null; }
    match /proprietaire/{doc} { allow read, write: if isAuth(); }
    match /immeubles/{doc}   { allow read, write: if isAuth(); }
    match /lots/{doc}        { allow read, write: if isAuth(); }
    match /locataires/{doc}  { allow read, write: if isAuth(); }
    match /baux/{doc}        { allow read, write: if isAuth(); }
    match /loyers/{doc}      { allow read, write: if isAuth(); }
    match /paiements/{doc}   { allow read, write: if isAuth(); }
    match /quittances/{doc}  { allow read, write: if isAuth(); }
    match /depenses/{doc}    { allow read, write: if isAuth(); }
    match /users/{uid}       { allow read, write: if isAuth() && request.auth.uid == uid; }
    match /counters/{doc}    { allow read, write: if isAuth(); }
  }
}
```

## Basculer
- Mode local: `VITE_USE_FIREBASE=false` (défaut)
- Mode Firebase: `VITE_USE_FIREBASE=true` + config remplie

## Aide côté utilisateur
1. Créer projet Firebase
2. Coller config dans `.env.local`
3. Passer à `true` quand prêt
4. Créer 1 compte dans Authentication
