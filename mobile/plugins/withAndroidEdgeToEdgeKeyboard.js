const { withMainActivity } = require('@expo/config-plugins');

function modifyMainActivity(contents) {
  if (contents.includes('WindowInsetsCompat.Type.ime()')) {
    return contents;
  }

  // Add imports
  const importTarget = 'import android.os.Bundle';
  const importReplacement = `import android.os.Bundle
import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding`;

  let newContents = contents.replace(importTarget, importReplacement);

  // Add listener in onCreate
  const onCreateTarget = 'super.onCreate(null)';
  const onCreateReplacement = `super.onCreate(null)

    // Android 15 (API 35) & Android 16 (API 36+): Enforced Edge-to-Edge disables default adjustResize behavior.
    // We attach an OnApplyWindowInsetsListener to restore resize behavior by applying IME insets as bottom padding.
    // On Android 10 (API 29) to Android 14 (API 34), adjustResize works natively, so we keep native behavior to avoid double padding.
    if (Build.VERSION.SDK_INT >= 35) {
      val rootView = findViewById<View>(android.R.id.content)
      ViewCompat.setOnApplyWindowInsetsListener(rootView) { v, insets ->
        val imeInsets = insets.getInsets(WindowInsetsCompat.Type.ime())
        v.updatePadding(bottom = imeInsets.bottom)
        insets
      }
    }`;

  newContents = newContents.replace(onCreateTarget, onCreateReplacement);
  return newContents;
}

module.exports = function withAndroidEdgeToEdgeKeyboard(config) {
  return withMainActivity(config, (modConfig) => {
    modConfig.modResults.contents = modifyMainActivity(modConfig.modResults.contents);
    return modConfig;
  });
};
