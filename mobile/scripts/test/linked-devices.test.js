'use strict';
const assert = require('assert/strict');
const { loadFresh } = require('./_harness');
const { normalizeDevices, createLinkedDevicesController } = loadFresh(['services/linkedDevices.ts']).linkedDevices;
const device = (id, extra = {}) => ({ id, user_id: 'alice', name: id, platform: 'android', is_active: true, created_at: '2026-10-18T00:00:00Z', last_seen_at: null, ...extra });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

(async () => {
  const latest = device('other', { last_seen_at: '2026-10-18T02:00:00Z' });
  assert.deepEqual(normalizeDevices([
    device('other'), device('self'), latest, device('foreign', { user_id: 'bob' }), device('old', { is_active: false }),
  ], 'alice', 'self'), [device('self'), latest]);

  let state, removes = [], listCalls = 0;
  let pending = deferred();
  const controller = createLinkedDevicesController({
    userId: 'alice', deviceId: 'self', onChange: next => { state = next; },
    api: { list: async () => { listCalls++; return [device('self'), device('other')]; }, remove: (id, signal) => { removes.push({ id, signal }); return pending.promise; } },
  });
  await controller.refresh();
  await controller.remove('self');
  await controller.remove('unknown');
  assert.equal(removes.length, 0);
  const removing = controller.remove('other');
  await controller.remove('other');
  await controller.refresh();
  assert.equal(removes.length, 1);
  assert.equal(listCalls, 1);
  pending.reject({ detail: 'Timeout' });
  await removing;
  assert.equal(state.devices.length, 2);
  assert.equal(state.notice, '');
  assert.match(state.error, /Timeout.*Muat ulang/);
  pending = deferred();
  const retry = controller.remove('other');
  pending.resolve({});
  await retry;
  assert.deepEqual(state.devices.map(d => d.id), ['self']);
  assert.ok(state.notice);

  // Account/session closes while the server is working; even a fetch that ignores
  // cancellation cannot publish old data or success into the next screen.
  for (const operation of ['refresh', 'remove']) {
    let changes = 0, signal;
    const response = deferred();
    const scoped = createLinkedDevicesController({ userId: 'alice', deviceId: 'self', onChange: () => changes++, api: {
      list: s => { signal = s; return operation === 'refresh' ? response.promise : Promise.resolve([device('other')]); },
      remove: (_id, s) => { signal = s; return response.promise; },
    } });
    if (operation === 'remove') await scoped.refresh();
    const running = operation === 'refresh' ? scoped.refresh() : scoped.remove('other');
    scoped.dispose();
    const before = changes;
    assert.equal(signal.aborted, true);
    response.resolve(operation === 'refresh' ? [device('other')] : {});
    await running;
    await scoped.remove('other');
    assert.equal(changes, before);
  }
  console.log('linked-devices: PASS (identity, deduplication, self guard, duplicate actions, retry, stale sessions)');
})().catch(error => { console.error(error); process.exitCode = 1; });
