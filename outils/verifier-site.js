/* PlaceLibre · vérifie le site avant publication (ce que Netlify met en ligne : dossier "publish")
   Usage : node outils/verifier-site.js
   Contrôles :
   - netlify.toml : le dossier publié existe et contient index.html ;
   - chaque page HTML : fichiers locaux cités (scripts, styles, manifeste, icônes) présents ;
   - chaque script JavaScript du site : syntaxe valide ;
   - chaque fichier JSON du site (dont le manifeste) : lisible ;
   - service worker : chaque fichier mis en cache existe, et chaque script de la page principale
     est dans le cache (sinon l'appli hors ligne s'ouvre avec un script manquant) ;
   - aucune clé ou mot de passe apparent dans les fichiers publiés. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const err = [], rel = p => path.relative(ROOT, p);

// 1. Dossier publié (netlify.toml : [build] publish = "public")
const toml = fs.existsSync(path.join(ROOT, 'netlify.toml')) ? fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8') : '';
const m = toml.match(/^\s*publish\s*=\s*["']([^"']+)["']/m);
if(!toml) err.push('netlify.toml absent');
else if(!m) err.push('netlify.toml : pas de "publish = ..." dans [build]');
const PUB = path.join(ROOT, m ? m[1] : 'public');
if(!fs.existsSync(path.join(PUB, 'index.html'))){
  console.error('Dossier publié introuvable ou sans index.html : ' + rel(PUB)); process.exit(1);
}

const walk = d => fs.readdirSync(d, {withFileTypes:true}).flatMap(e =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(PUB);
const local = u => u && !/^(https?:|data:|mailto:|tel:|#|\/\/)/i.test(u);
const clean = u => decodeURIComponent(u.split(/[?#]/)[0]);

// 2. Pages HTML : références locales
const pageScripts = {};
files.filter(f => f.endsWith('.html')).forEach(f => {
  const html = fs.readFileSync(f, 'utf8'), dir = path.dirname(f), scripts = [];
  for(const r of html.matchAll(/<(script|link|img)\b[^>]*?\s(src|href)\s*=\s*["']([^"']+)["']/gi)){
    const u = r[3]; if(!local(u)) continue;
    const target = path.resolve(dir, clean(u));
    if(r[1].toLowerCase() === 'script') scripts.push(path.relative(PUB, target).split(path.sep).join('/'));
    if(!target.startsWith(PUB)) err.push(rel(f) + ' : ' + u + ' sort du dossier publié');
    else if(!fs.existsSync(target)) err.push(rel(f) + ' : fichier cité absent ' + u);
  }
  pageScripts[path.relative(PUB, f)] = scripts;
});

// 3. Syntaxe JavaScript et JSON
files.filter(f => f.endsWith('.js')).forEach(f => {
  try{ new vm.Script(fs.readFileSync(f, 'utf8'), {filename:rel(f)}); }
  catch(e){ err.push(rel(f) + ' : erreur de syntaxe — ' + e.message); }
});
files.filter(f => /\.(json|webmanifest)$/.test(f)).forEach(f => {
  try{ JSON.parse(fs.readFileSync(f, 'utf8')); } catch(e){ err.push(rel(f) + ' : JSON illisible — ' + e.message); }
});

// 4. Manifeste : icônes présentes
const manPath = path.join(PUB, 'manifest.webmanifest');
if(fs.existsSync(manPath)){
  try{
    (JSON.parse(fs.readFileSync(manPath, 'utf8')).icons || []).forEach(i => {
      if(local(i.src) && !fs.existsSync(path.join(PUB, clean(i.src)))) err.push('manifeste : icône absente ' + i.src);
    });
  }catch(e){}
}

// 5. Service worker : fichiers mis en cache
const swPath = path.join(PUB, 'sw.js');
if(fs.existsSync(swPath)){
  const sw = fs.readFileSync(swPath, 'utf8'), s = sw.match(/const\s+SHELL\s*=\s*\[([\s\S]*?)\]/);
  if(!s) err.push('sw.js : liste SHELL introuvable');
  else{
    const shell = [...s[1].matchAll(/["']([^"']+)["']/g)].map(x => x[1]);
    shell.forEach(u => { if(u !== './' && !fs.existsSync(path.join(PUB, clean(u)))) err.push('sw.js : fichier mis en cache absent ' + u); });
    (pageScripts['index.html'] || []).forEach(js => {
      if(!shell.includes(js)) err.push('sw.js : ' + js + ' est chargé par index.html mais absent du cache hors ligne (SHELL)');
    });
  }
}

// 6. Secrets apparents dans les fichiers publiés
const SECRET = [/AKIA[0-9A-Z]{16}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bsk-[A-Za-z0-9_-]{20,}/, /\bAIza[0-9A-Za-z_-]{35}\b/, /(api[_-]?key|secret|password|mot_de_passe)\s*[:=]\s*["'][^"']{8,}["']/i];
files.filter(f => /\.(js|html|css|json|webmanifest|txt|md)$/.test(f)).forEach(f => {
  const t = fs.readFileSync(f, 'utf8');
  if(SECRET.some(re => re.test(t))) err.push(rel(f) + ' : ressemble à une clé ou un mot de passe, à retirer');
});

if(err.length){ console.error(err.length + ' problème(s) dans le site publié :\n- ' + err.join('\n- ')); process.exit(1); }
console.log('Site correct : ' + files.length + ' fichiers publiés depuis ' + rel(PUB) + ', ' +
  Object.keys(pageScripts).length + ' page(s) HTML vérifiée(s).');
