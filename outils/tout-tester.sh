#!/usr/bin/env bash
# PlaceLibre · lance tous les contrôles, comme sur GitHub à chaque pull request.
# Usage (à la racine du dépôt) : bash outils/tout-tester.sh
# Aucun test n'envoie de message sur le canal réel : ils simulent les téléphones sans réseau.
set -u
cd "$(dirname "$0")/.."
echecs=()

etape(){ # etape "nom" commande...
  local nom="$1"; shift
  printf '\n▶ %s\n' "$nom"
  if "$@"; then printf '✔ %s\n' "$nom"; else printf '✘ %s\n' "$nom"; echecs+=("$nom"); fi
}

etape "Site publié (Netlify)" node outils/verifier-site.js
etape "Registre des places" node outils/verifier-places.js
for t in tests/*.test.cjs; do etape "$t" node "$t"; done
if ls tests/test_*.py >/dev/null 2>&1; then
  etape "Tests Python" python3 -m unittest discover -s tests -p 'test_*.py'
fi
if [ -f tests/simulateur/simulateur.cjs ]; then
  etape "Simulateur du quartier" node tests/simulateur/simulateur.cjs --silencieux
fi

echo
if [ ${#echecs[@]} -eq 0 ]; then echo "Tout est correct."; exit 0; fi
echo "${#echecs[@]} contrôle(s) en échec :"; printf ' - %s\n' "${echecs[@]}"; exit 1
