'use strict';
const assert = require('assert');
const { loadFresh } = require('./_harness');
const { canTransfer, createTransferImporter } = loadFresh(['services/keyTransferPolicy.ts']).keyTransferPolicy;

const conflict = { userId: 'a', session: 'session-1', status: 'conflict', blocked: false, hasKey: false };
const ready = { ...conflict, status: 'ready', hasKey: true };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function setup(initial = conflict) {
  let state = { ...initial };
  const response = deferred();
  const writes = [], activations = [], discards = [];
  let consumes = 0;
  const options = {
    getState: () => state,
    consume: () => { consumes++; return response.promise; },
    persist: async (id, pair) => { writes.push([id, pair]); },
    discard: async (id, pair) => { discards.push([id, pair]); },
    activate: (pair) => { activations.push(pair); state = { ...state, status: 'ready', hasKey: true }; },
  };
  const importer = createTransferImporter(options);
  return { importer, options, response, writes, activations, discards, set: (next) => { state = next; }, consumes: () => consumes };
}

(async () => {
  assert.ok(canTransfer('sender', ready));
  assert.ok(!canTransfer('receiver', ready));
  assert.ok(canTransfer('receiver', conflict));
  assert.ok(!canTransfer('sender', conflict));
  assert.ok(!canTransfer('invalid-role', conflict));
  for (const state of [
    { ...conflict, userId: null }, { ...conflict, session: null }, { ...conflict, blocked: true },
    { ...conflict, hasKey: true }, ...['loading', 'error', 'uninitialized'].map(status => ({ ...conflict, status })),
  ]) assert.ok(!canTransfer('receiver', state));
  for (const state of [{ ...ready, blocked: true }, { ...ready, hasKey: false }, { ...ready, session: null }]) {
    assert.ok(!canTransfer('sender', state));
  }

  const denied = setup(ready);
  await assert.rejects(denied.importer.run('code'));
  assert.equal(denied.consumes(), 0);
  assert.equal(denied.writes.length, 0);

  const success = setup();
  const pending = success.importer.run('code');
  await assert.rejects(success.importer.run('duplicate'));
  success.response.resolve('pair');
  await pending;
  assert.deepEqual(success.writes, [['a', 'pair']]);
  assert.deepEqual(success.activations, ['pair']);
  await assert.rejects(success.importer.run('already-ready'));

  for (const change of [
    h => h.set({ ...conflict, userId: 'b', session: 'session-2' }),
    h => h.set({ ...conflict, session: 'new-session-same-account' }),
    h => h.set(ready),
    h => h.set({ ...conflict, blocked: true }),
    h => h.set({ ...conflict, userId: null, session: null }),
    h => h.importer.invalidate(), // reset/logout even before React renders the new state
  ]) {
    const h = setup();
    const operation = h.importer.run('code');
    change(h);
    h.response.resolve('late-pair');
    await assert.rejects(operation, /dibatalkan/);
    assert.equal(h.writes.length, 0);
    assert.equal(h.activations.length, 0);
  }

  const cancelled = setup();
  const controller = new AbortController();
  const operation = cancelled.importer.run('code', controller.signal);
  controller.abort();
  cancelled.response.resolve('late');
  await assert.rejects(operation, /dibatalkan/);
  assert.equal(cancelled.writes.length, 0);

  // Native write already submitted: remove this operation's key and never activate.
  const duringWrite = setup();
  const writing = deferred();
  duringWrite.options.persist = () => writing.promise;
  const saving = duringWrite.importer.run('code');
  duringWrite.response.resolve('pair');
  await Promise.resolve();
  duringWrite.importer.invalidate();
  writing.resolve();
  await assert.rejects(saving, /dibatalkan/);
  assert.deepEqual(duringWrite.discards, [['a', 'pair']]);
  assert.equal(duringWrite.activations.length, 0);

  const failure = setup();
  failure.options.persist = async () => { throw new Error('disk unavailable'); };
  const failedSave = failure.importer.run('code');
  failure.response.resolve('pair');
  await assert.rejects(failedSave, /disk unavailable/);
  assert.equal(failure.activations.length, 0);
  failure.options.persist = async () => {};
  await failure.importer.run('new-code'); // failures release the lock for a manual retry
  assert.equal(failure.activations.length, 1);

  const network = setup();
  const failedNetwork = network.importer.run('code');
  network.response.reject(new Error('expired/offline'));
  await assert.rejects(failedNetwork, /expired\/offline/);
  assert.equal(network.writes.length, 0);
  console.log('Transfer policy: roles, active-key rejection, single writer, session changes, cancellation, late native write and retry: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
