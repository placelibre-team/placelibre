import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Clipboard } from '@capacitor/clipboard';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Geolocation } from '@capacitor/geolocation';
import { Share } from '@capacitor/share';
import { PUBLIC_URL, invitationPath, foregroundGeolocation, fileExporter } from './services.mjs';

if (Capacitor.isNativePlatform()) {
  const geolocation = foregroundGeolocation(Geolocation);
  // Enregistré avant de demander l'état initial pour ne pas manquer une transition.
  let stateEvent = false;
  App.addListener('appStateChange', ({ isActive }) => {
    stateEvent = true;
    geolocation.setActive(isActive);
  }).catch(() => {});
  App.getState().then(({ isActive }) => {
    if (!stateEvent) geolocation.setActive(isActive);
  }).catch(() => {});
  window.PlaceLibreNative = {
    publicUrl: PUBLIC_URL,
    geolocation,
    copyText: text => Clipboard.write({ string: text }),
    share: options => Share.share(options),
    exportCsv: fileExporter(Filesystem, Share, Directory.Cache, Encoding.UTF8),
    invitationPath
  };
}
