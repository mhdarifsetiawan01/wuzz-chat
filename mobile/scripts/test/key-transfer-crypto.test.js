'use strict';
const assert = require('assert');
const Module = require('module');
const original = Module._load;
let transferBundle;
Module._load = function(request, ...rest) {
  if (request === '../api/transfer') return { consumeTransferSession: async () => ({ encrypted_bundle: transferBundle }) };
  return original.call(this, request, ...rest);
};
const { loadFresh, state } = require('./_harness');
const modules = loadFresh(['services/crypto.ts', 'services/keyTransfer.ts']);
const { generateE2EEKeyPair } = modules.crypto;
const { encryptKeyBundleForTransfer, decryptKeyBundleFromTransfer, consumeAndDecryptTransfer, keyPairToJWK, jwkToKeyPair } = modules.keyTransfer;

(async () => {
  const pair = generateE2EEKeyPair();
  const code = 'a'.repeat(64);
  const bundle = await encryptKeyBundleForTransfer(pair, code);
  transferBundle = bundle;
  assert.deepEqual(await consumeAndDecryptTransfer(code, 'device'), pair);
  assert.equal(state.secureStore.size, 0, 'consume service never writes keys');
  assert.deepEqual(await decryptKeyBundleFromTransfer(bundle, code), pair);
  await assert.rejects(decryptKeyBundleFromTransfer(bundle, 'b'.repeat(64)));
  const jwk = keyPairToJWK(pair);
  const other = generateE2EEKeyPair();
  assert.throws(() => jwkToKeyPair(jwk.privateKeyJWK, other.publicKeyJWK), /tidak valid/);
  assert.throws(() => jwkToKeyPair(JSON.stringify({ ...JSON.parse(jwk.privateKeyJWK), d: 'AA' }), jwk.publicKeyJWK));
  await assert.rejects(decryptKeyBundleFromTransfer('{}', code));
  console.log('Transfer crypto: valid roundtrip, wrong code, mismatched public/private key and invalid bundle: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
