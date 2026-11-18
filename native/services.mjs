// Adaptateurs testables sans iPhone. Les plugins sont injectés par bridge.mjs.
export const PUBLIC_URL = 'https://taupe-axolotl-872d89.netlify.app/';

export function invitationPath(value) {
  const url = new URL(value.trim());
  const publicUrl = new URL(PUBLIC_URL);
  if (url.origin !== publicUrl.origin || url.pathname !== '/' || url.username || url.password) {
    throw new Error('Utilise un lien d’invitation du site PlaceLibre.');
  }
  const key = url.hash.match(/^#cle=([a-z0-9]{20,40})$/i);
  if (!key || [...url.searchParams.keys()].some(k => k !== 'canal') ||
      (url.search && url.search !== '?canal=test')) {
    throw new Error('Ce lien d’invitation est incomplet ou non reconnu.');
  }
  return '/' + url.search + '#cle=' + key[1].toLowerCase();
}

// watchPosition natif renvoie une Promise<string>, contrairement au navigateur.
// On conserve un jeton synchrone et arrête aussi les inscriptions encore en cours
// lors du passage en arrière-plan (aucun suivi en arrière-plan dans cette version).
export function foregroundGeolocation(plugin) {
  const watches = new Map();
  let active = true, nextToken = 0;
  const clear = id => plugin.clearWatch({ id }).catch(() => {});
  async function start(watch) {
    const generation = ++watch.generation;
    try {
      const id = await plugin.watchPosition(watch.options, (position, error) => {
        if (!active || generation !== watch.generation) return;
        if (error) watch.failure(error);
        else if (position) watch.success(position);
      });
      if (!active || generation !== watch.generation) await clear(id);
      else watch.id = id;
    } catch (error) {
      if (active && generation === watch.generation) watch.failure(error);
    }
  }
  function stop(watch) {
    watch.generation++;
    if (watch.id !== null) void clear(watch.id);
    watch.id = null;
  }
  return {
    getCurrentPosition(success, failure, options) {
      plugin.getCurrentPosition(options).then(success, failure);
    },
    watchPosition(success, failure = () => {}, options = {}) {
      const token = ++nextToken;
      const watch = { success, failure, options, id: null, generation: 0 };
      watches.set(token, watch);
      if (active) void start(watch);
      return token;
    },
    clearWatch(token) {
      const watch = watches.get(token);
      if (watch) stop(watch);
      watches.delete(token);
    },
    setActive(value) {
      if (active === value) return;
      active = value;
      for (const watch of watches.values()) {
        if (active) void start(watch); else stop(watch);
      }
    }
  };
}

export function fileExporter(filesystem, share, cacheDirectory, utf8) {
  let busy = false;
  return async function exportCsv(csv, name) {
    if (busy) return false;
    // Le nom est généré par l'application, jamais un chemin fourni par l'utilisateur.
    if (!/^placelibre-journal-\d{4}-\d{2}-\d{2}(-test)?\.csv$/.test(name)) {
      throw new Error('Nom de fichier invalide.');
    }
    busy = true;
    const options = { directory: cacheDirectory, path: name };
    try {
      const file = await filesystem.writeFile({ ...options, data: csv, encoding: utf8 });
      await share.share({ title: 'Journal PlaceLibre', files: [file.uri] });
      return true;
    } finally {
      // Le partage est terminé ou annulé : ne pas accumuler de journaux dans le cache.
      await filesystem.deleteFile(options).catch(() => {});
      busy = false;
    }
  };
}

// Signaux du téléphone pour la détection du stationnement : voir ParkingSignalsPlugin.swift.
// Le plugin natif enregistre les signaux (même si la page est suspendue) ; la page les relit avec drain().
export function parkingSignals(plugin) {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  return {
    start: () => plugin.start(),
    stop: () => plugin.stop(),
    status: () => plugin.status(),
    drain: async after => {
      const result = await plugin.drain({ after: Number.isFinite(after) ? after : 0 });
      return { signals: Array.isArray(result && result.signals) ? result.signals : [] };
    },
    onSignal(callback) {
      plugin.addListener('signal', callback);
    },
    // iOS montre les fenêtres d'autorisation l'une après l'autre : on attend la réponse (au plus 60 s).
    async requestAccess() {
      await plugin.requestAccess();
      for (let i = 0; i < 60; i++) {
        const status = await plugin.status();
        if (status.location !== 'unknown' && status.motion !== 'unknown') return status;
        await wait(1000);
      }
      return plugin.status();
    }
  };
}
