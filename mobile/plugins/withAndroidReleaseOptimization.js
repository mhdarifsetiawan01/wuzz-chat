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

  // 2. Inject ABI Splits into app/build.gradle
  config = withAppBuildGradle(config, (modConfig) => {
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
