module.exports = function (api) {
  // Cache dipisah per NODE_ENV agar transform dev & release tidak saling menimpa
  const isProduction = api.cache.using(() => process.env.NODE_ENV === 'production');
  const plugins = [];
  // Release build: buang console.log/info/debug (warn & error tetap untuk diagnosis)
  if (isProduction) {
    plugins.push(['transform-remove-console', { exclude: ['error', 'warn'] }]);
  }
  return {
    // babel-preset-expo ter-install di dalam node_modules/expo, jadi resolve lewat paket expo
    presets: [require.resolve('babel-preset-expo', { paths: [require.resolve('expo/package.json')] })],
    plugins,
  };
};
