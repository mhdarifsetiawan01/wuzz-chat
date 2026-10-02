const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Menandatangani build release dengan keystore release milik sendiri (bukan debug.keystore bawaan template).
 * Keystore TIDAK disimpan di repo; lokasi dan password dibaca dari environment variable:
 *   WUZZ_KEYSTORE_PATH, WUZZ_KEYSTORE_PASSWORD, WUZZ_KEY_ALIAS, WUZZ_KEY_PASSWORD
 * Build release dihentikan jika keystore belum diatur, agar tidak diam-diam kembali memakai kunci debug.
 */
module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    if (contents.includes('WUZZ_KEYSTORE_PATH')) return modConfig;

    const guard = `
// Release wajib memakai keystore release (lihat plugins/withAndroidReleaseSigning.js)
def wuzzIsReleaseTask = gradle.startParameter.taskNames.any { it.toLowerCase().contains("release") }
if (wuzzIsReleaseTask) {
    ["WUZZ_KEYSTORE_PATH", "WUZZ_KEYSTORE_PASSWORD", "WUZZ_KEY_ALIAS", "WUZZ_KEY_PASSWORD"].each { name ->
        if (!System.getenv(name)) {
            throw new GradleException("❌ Environment variable \${name} belum diatur. Build release memerlukan keystore release (lihat docs/PLAY_STORE_MIGRATION.md).")
        }
    }
    if (!new File(System.getenv("WUZZ_KEYSTORE_PATH")).exists()) {
        throw new GradleException("❌ File keystore tidak ditemukan di WUZZ_KEYSTORE_PATH: \${System.getenv("WUZZ_KEYSTORE_PATH")}")
    }
}
`;
    if (!contents.includes('\nandroid {')) {
      throw new Error('[withAndroidReleaseSigning] Blok "android {" tidak ditemukan di app/build.gradle');
    }
    contents = contents.replace('\nandroid {', `${guard}\nandroid {`);

    const releaseSigning = `signingConfigs {
        release {
            if (System.getenv("WUZZ_KEYSTORE_PATH")) {
                storeFile file(System.getenv("WUZZ_KEYSTORE_PATH"))
                storePassword System.getenv("WUZZ_KEYSTORE_PASSWORD")
                keyAlias System.getenv("WUZZ_KEY_ALIAS")
                keyPassword System.getenv("WUZZ_KEY_PASSWORD")
            }
        }`;
    if (!/signingConfigs \{/.test(contents)) {
      throw new Error('[withAndroidReleaseSigning] Blok "signingConfigs {" tidak ditemukan di app/build.gradle');
    }
    contents = contents.replace('signingConfigs {', releaseSigning);

    // Hanya sasar release di dalam buildTypes (bukan release di signingConfigs yang baru ditambahkan di atas)
    const releaseBlock = /(buildTypes\s*\{[\s\S]*?\n\s+release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
    if (!releaseBlock.test(contents)) {
      throw new Error('[withAndroidReleaseSigning] signingConfig di buildTypes.release tidak ditemukan');
    }
    contents = contents.replace(releaseBlock, '$1signingConfig signingConfigs.release');

    modConfig.modResults.contents = contents;
    return modConfig;
  });
};
