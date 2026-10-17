'use strict';
const assert = require('assert');
const { loadFresh, state } = require('./_harness');
const { secureStorage: storage } = loadFresh(['services/exclusiveQueue.ts', 'services/secureStorage.ts']).secureStorage;
const oldPair = { privateKeyHex: 'aa', publicKeyJWK: 'old-public' };
const newPair = { privateKeyHex: 'bb', publicKeyJWK: 'new-public' };

(async () => {
  state.secureStore.clear();
  await storage.setE2EEKeyPair('u', oldPair);
  const originalSet = storage.setItem;
  let valid = true;
  storage.setItem = async function(key, value) {
    await originalSet.call(this, key, value);
    if (value === newPair.privateKeyHex) valid = false;
  };
  await assert.rejects(storage.setE2EEKeyPair('u', newPair, undefined, () => {
    if (!valid) throw new Error('cancelled');
  }), /cancelled/);
  assert.deepEqual(await storage.getE2EEKeyPair('u'), oldPair);

  // Public-key write failure restores the entire previous pair.
  storage.setItem = async function(key, value) {
    if (value === newPair.publicKeyJWK) throw new Error('storage failure');
    await originalSet.call(this, key, value);
  };
  await assert.rejects(storage.setE2EEKeyPair('u', newPair), /storage failure/);
  assert.deepEqual(await storage.getE2EEKeyPair('u'), oldPair);
  storage.setItem = originalSet;

  // A cancelled first import must not leave a private half-key behind.
  valid = true;
  storage.setItem = async function(key, value) {
    await originalSet.call(this, key, value);
    if (value === newPair.privateKeyHex) valid = false;
  };
  await assert.rejects(storage.setE2EEKeyPair('fresh-user', newPair, undefined, () => {
    if (!valid) throw new Error('cancelled');
  }));
  assert.equal(await storage.getE2EEKeyPair('fresh-user'), null);
  assert.ok(![...state.secureStore.keys()].some(key => key.includes('fresh-user')));
  storage.setItem = originalSet;

  // A reset queued during cancellation wins after rollback finishes.
  valid = true;
  let reset;
  storage.setItem = async function(key, value) {
    await originalSet.call(this, key, value);
    if (value === newPair.privateKeyHex) {
      valid = false;
      reset = storage.setE2EEKeyPair('u', { privateKeyHex: 'cc', publicKeyJWK: 'reset-public' });
    }
  };
  await assert.rejects(storage.setE2EEKeyPair('u', newPair, undefined, () => {
    if (!valid) throw new Error('cancelled');
  }));
  await reset;
  assert.equal((await storage.getE2EEKeyPair('u')).privateKeyHex, 'cc');
  await storage.deleteE2EEKeyPair('u', newPair.privateKeyHex);
  assert.equal((await storage.getE2EEKeyPair('u')).privateKeyHex, 'cc', 'late discard preserves the reset key');
  await storage.deleteE2EEKeyPair('u', 'cc');
  assert.equal(await storage.getE2EEKeyPair('u'), null);
  storage.setItem = originalSet;
  console.log('Transfer storage: cancellation rollback, partial-write failure, serialized reset and conditional discard: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
