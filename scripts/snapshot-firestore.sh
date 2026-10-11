#!/usr/bin/env bash
# Snapshot complet de la base Firestore, en lecture seule.
#
# Aucune écriture, aucune suppression : ce script ne fait que lire et écrire
# un fichier local. À lancer avant toute intervention sur le code.
set -euo pipefail
cd "$(dirname "$0")/.."
K=$(grep API_KEY .env.local | cut -d= -f2)
T=$(curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$K" \
  -H "Content-Type: application/json" \
  -d '{"email":"chabigounou@gmail.com","password":"fawaz123","returnSecureToken":true}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('idToken',''))")
if [ -z "$T" ]; then echo "connexion impossible"; exit 1; fi

HORODATAGE=$(date +%Y-%m-%d_%Hh%M)
DEST="sauvegardes/cagloca_${HORODATAGE}"
mkdir -p "$DEST"
B="https://firestore.googleapis.com/v1/projects/cagloca/databases/(default)/documents"
for c in proprietaire immeubles lots locataires baux loyers paiements quittances depenses counters users; do
  curl -s -H "Authorization: Bearer $T" "$B/$c?pageSize=1000" -o "$DEST/$c.json"
  n=$(python3 -c "import json;print(len(json.load(open('$DEST/$c.json')).get('documents',[])))")
  printf "%-14s %4s document(s)\n" "$c" "$n"
done
echo "---"
echo "sauvegarde : $DEST"
du -sh "$DEST"
