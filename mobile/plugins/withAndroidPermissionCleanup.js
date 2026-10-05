const { withAndroidManifest } = require('@expo/config-plugins');

// Izin yang ditarik library tetapi tidak dipakai WuzzChat. Menghapusnya menghindari deklarasi sensitif di Play Console:
// - SYSTEM_ALERT_WINDOW: bawaan plugin react-native-webrtc, panggilan masuk memakai notifikasi/layar penuh biasa.
// - FOREGROUND_SERVICE(_MEDIA_PLAYBACK) + AudioControlsService: kontrol layar kunci expo-audio (tidak dipakai; pemutar
//   pesan suara hanya berjalan saat aplikasi terbuka).
// - MediaProjectionService (foregroundServiceType=mediaProjection): berbagi layar react-native-webrtc, tidak dipakai.
// Tanpa ketiganya aplikasi tidak memiliki Foreground Service sehingga tidak perlu formulir deklarasinya di Play Console.
const REMOVE_PERMISSIONS = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
];
const REMOVE_SERVICES = [
  'expo.modules.audio.service.AudioControlsService',
  'com.oney.WebRTCModule.MediaProjectionService',
];

// BLUETOOTH lama hanya berlaku sampai Android 11 (API 30); Android 12+ memakai izin BLUETOOTH_* terpisah.
const LEGACY_BLUETOOTH = 'android.permission.BLUETOOTH';

module.exports = function withAndroidPermissionCleanup(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';

    const perms = (manifest['uses-permission'] = manifest['uses-permission'] || []);

    for (const name of REMOVE_PERMISSIONS) {
      const existing = perms.find((p) => p.$['android:name'] === name);
      if (existing) {
        existing.$['tools:node'] = 'remove';
      } else {
        perms.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
      }
    }

    const bt = perms.find((p) => p.$['android:name'] === LEGACY_BLUETOOTH);
    if (bt) {
      bt.$['android:maxSdkVersion'] = '30';
      bt.$['tools:replace'] = 'android:maxSdkVersion';
    } else {
      perms.push({ $: { 'android:name': LEGACY_BLUETOOTH, 'android:maxSdkVersion': '30', 'tools:replace': 'android:maxSdkVersion' } });
    }

    const app = manifest.application[0];
    app.service = app.service || [];
    for (const name of REMOVE_SERVICES) {
      const existing = app.service.find((s) => s.$['android:name'] === name);
      if (existing) {
        existing.$['tools:node'] = 'remove';
      } else {
        app.service.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
      }
    }

    return modConfig;
  });
};
