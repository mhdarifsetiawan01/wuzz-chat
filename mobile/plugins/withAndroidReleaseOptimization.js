const { withGradleProperties, withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withAndroidReleaseOptimization(config) {
  // 1. Inject R8, Resource Shrinking, & Targeted Physical Architectures into gradle.properties
  config = withGradleProperties(config, (modConfig) => {
    const props = [
      { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'true' },
      { type: 'property', key: 'android.enableShrinkResourcesInReleaseBuilds', value: 'true' },
      { type: 'property', key: 'reactNativeArchitectures', value: 'armeabi-v7a,arm64-v8a' }
    ];
    props.forEach((p) => {
      const idx = modConfig.modResults.findIndex((item) => item.key === p.key);
      if (idx >= 0) {
        modConfig.modResults[idx] = p;
      } else {
        modConfig.modResults.push(p);
      }
    });
    return modConfig;
  });

  // 2. Inject ABI Splits & Smart Version Bumper into app/build.gradle
  config = withAppBuildGradle(config, (modConfig) => {
    if (!modConfig.modResults.contents.includes('smart-bump.js')) {
      const smartBumpHook = `
import groovy.json.JsonSlurper

// Auto-detect Release Tasks for Smart Version Bumping
def isReleaseTask = gradle.startParameter.taskNames.any { taskName ->
    taskName.toLowerCase().contains("release")
}

if (isReleaseTask && !project.hasProperty('skipSmartBump')) {
    println "🚀 [Gradle Smart Version Bumper] Release task terdeteksi! Menjalankan analisis Conventional Commits..."
    def bumpProcess = ["node", "\${projectRoot}/scripts/smart-bump.js"].execute(null, new File(projectRoot))
    bumpProcess.waitForProcessOutput(System.out, System.err)
    if (bumpProcess.exitValue() != 0) {
        throw new GradleException("❌ Gagal menjalankan smart-bump.js. Build release dihentikan.")
    }
}

// Baca app.json secara dinamis sebagai Single Source of Truth
def getAppConfig(String rootPath) {
    def appJsonFile = new File(rootPath, "app.json")
    if (appJsonFile.exists()) {
        try {
            def json = new JsonSlurper().parseText(appJsonFile.text)
            def vName = json?.expo?.version ?: "1.0.0"
            def vCode = json?.expo?.android?.versionCode ?: 1
            return [versionName: vName.toString(), versionCode: vCode as Integer]
        } catch (Exception e) {
            println "⚠️ Gagal membaca app.json: \${e.message}. Menggunakan default."
        }
    }
    return [versionName: "1.0.0", versionCode: 1]
}

def appConfig = getAppConfig(projectRoot)
`;
      modConfig.modResults.contents = modConfig.modResults.contents.replace(
        'def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()',
        `def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()\n${smartBumpHook}`
      );
      modConfig.modResults.contents = modConfig.modResults.contents.replace(
        /versionCode \d+/,
        'versionCode appConfig.versionCode'
      );
      modConfig.modResults.contents = modConfig.modResults.contents.replace(
        /versionName "[^"]+"/,
        'versionName appConfig.versionName'
      );
    }

    if (!modConfig.modResults.contents.includes('splits {')) {
      const splitsBlock = `
    splits {
        abi {
            reset()
            def isBundle = gradle.startParameter.taskNames.any { it.toLowerCase().contains("bundle") }
            enable !isBundle
            universalApk false
            include "armeabi-v7a", "arm64-v8a"
        }
    }
`;
      modConfig.modResults.contents = modConfig.modResults.contents.replace(
        'packagingOptions {',
        `${splitsBlock}\n    packagingOptions {`
      );
    }
    return modConfig;
  });

  // 3. Inject ProGuard rules into app/proguard-rules.pro
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const proguardPath = path.join(modConfig.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      if (fs.existsSync(proguardPath)) {
        let content = fs.readFileSync(proguardPath, 'utf8');
        const ruleMarker = '# react-native-webrtc';
        if (!content.includes(ruleMarker)) {
          const rulesToAdd = `
# react-native-webrtc
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**

# Expo Modules
-keep class expo.modules.** { *; }
-keep class * extends expo.modules.kotlin.modules.Module { *; }

# Keep native methods for JNI
-keepclassmembers,includedescriptorclasses class * {
    native <methods>;
}

# Ignore warnings for common libraries
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
`;
          content += rulesToAdd;
          fs.writeFileSync(proguardPath, content, 'utf8');
        }
      }
      return modConfig;
    }
  ]);

  return config;
};
