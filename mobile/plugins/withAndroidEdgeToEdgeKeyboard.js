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

    // Universal Android Keyboard Resilience (Android 11-16+ & Edge-to-Edge):
    // Transparent status & navigation bars disable default adjustResize behavior on Android.
    // We attach an OnApplyWindowInsetsListener on android.R.id.content to dynamically apply
    // IME insets as bottom padding whenever the software keyboard appears or disappears.
    val rootView = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(rootView) { v, insets ->
      val imeInsets = insets.getInsets(WindowInsetsCompat.Type.ime())
      v.updatePadding(bottom = imeInsets.bottom)
      insets
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
