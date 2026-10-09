# Intégration Firebase

## Configuration
Ton .env.local est déjà créé avec tes valeurs.

## À faire dans Firebase Console
1. **Authentication > Méthode de connexion** → Activer `Email/mot de passe`
2. **Firestore Database** → Créer base de données (production ou test)
3. **Règles Firestore** → Coller ces règles

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

4. **Authentication > Utilisateurs** → Ajouter un compte (email + mot de passe)

## Lancer
```bash
npm run dev
```

Mode actuel : VITE_USE_FIREBASE=true
