// Vérifie la configuration Capacitor sans rien installer : identifiant, dossier web, secrets.
const fs = require('fs');
const path = require('path');
const racine = path.resolve(__dirname, '..');
const erreurs = [];

const config = JSON.parse(fs.readFileSync(path.join(racine, 'capacitor.config.json'), 'utf8'));
if (config.appId !== 'fr.placelibre.app') erreurs.push('appId doit correspondre au projet Xcode (sa disponibilité chez Apple reste à vérifier)');
if (config.appName !== 'PlaceLibre') erreurs.push('appName doit être PlaceLibre');
if (!fs.existsSync(path.join(racine, config.webDir, 'index.html'))) erreurs.push('Interface native absente : exécuter npm ci puis npm run ios:preparer');
else {
  const html = fs.readFileSync(path.join(racine, config.webDir, 'index.html'), 'utf8');
  if (!html.includes('js/native.js') || html.indexOf('js/native.js') > html.indexOf('js/config.js')) erreurs.push('Le pont natif doit précéder le code de l’application');
}
if (config.server?.url) erreurs.push('Le site doit être embarqué dans l’application, pas chargé depuis une URL distante');
const xcode = fs.readFileSync(path.join(racine, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
if (!xcode.includes('PRODUCT_BUNDLE_IDENTIFIER = ' + config.appId)) erreurs.push('Identifiant incohérent dans Xcode');
if (!xcode.includes('PrivacyInfo.xcprivacy in Resources')) erreurs.push('Manifeste de confidentialité absent des ressources Xcode');

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
console.log('OK : projet Xcode, interface embarquée et pont natif cohérents ; certificats exclus.');
