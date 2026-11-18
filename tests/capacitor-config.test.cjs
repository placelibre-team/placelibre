// Vérifie la configuration Capacitor sans rien installer : identifiant, dossier web, secrets.
const fs = require('fs');
const path = require('path');
const racine = path.resolve(__dirname, '..');
const erreurs = [];

const config = JSON.parse(fs.readFileSync(path.join(racine, 'capacitor.config.json'), 'utf8'));
if (config.appId !== 'fr.placelibre.app') erreurs.push('appId doit rester fr.placelibre.app (identifiant réservé chez Apple)');
if (config.appName !== 'PlaceLibre') erreurs.push('appName doit être PlaceLibre');
if (!fs.existsSync(path.join(racine, config.webDir, 'index.html'))) erreurs.push('webDir ne contient pas index.html');

const pkg = JSON.parse(fs.readFileSync(path.join(racine, 'package.json'), 'utf8'));
for (const nom of ['@capacitor/core', '@capacitor/ios']) {
  if (!pkg.dependencies || !pkg.dependencies[nom]) erreurs.push(nom + ' manque dans dependencies');
}
if (!pkg.devDependencies || !pkg.devDependencies['@capacitor/cli']) erreurs.push('@capacitor/cli manque dans devDependencies');

const ignore = fs.readFileSync(path.join(racine, '.gitignore'), 'utf8');
for (const motif of ['*.p12', '*.p8', '*.mobileprovision', '*.cer']) {
  if (!ignore.includes(motif)) erreurs.push('.gitignore doit exclure ' + motif + ' (certificats Apple)');
}

if (erreurs.length) { console.error('ÉCHEC :\n- ' + erreurs.join('\n- ')); process.exit(1); }
console.log('OK : configuration Capacitor cohérente (fr.placelibre.app, dossier public, certificats exclus).');
