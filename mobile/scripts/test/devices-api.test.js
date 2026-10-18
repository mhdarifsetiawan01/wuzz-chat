'use strict';
const assert = require('assert/strict');
const Module = require('module');
const { loadFresh } = require('./_harness');
const original = Module._load;
const calls = [];
Module._load = function (request, ...rest) {
  if (request === './client') return { apiClient: async (path, options) => { calls.push({ path, ...options }); return []; } };
  return original.call(this, request, ...rest);
};
const { createDevicesApi } = loadFresh(['api/devices.ts']).devices;

(async () => {
  const api = createDevicesApi('session-at-open', 'dev_current');
  const controller = new AbortController();
  await api.list(controller.signal);
  await api.remove('dev/a?b', controller.signal);
  assert.equal(calls[0].path, '/api/auth/devices');
  assert.equal(calls[1].path, '/api/auth/devices/dev%2Fa%3Fb');
  assert.equal(calls[1].method, 'DELETE');
  for (const call of calls) {
    assert.equal(call.skipAuth, true);
    assert.equal(call.headers.Authorization, 'Bearer session-at-open');
    assert.equal(call.headers['X-Device-ID'], 'dev_current');
    assert.equal(call.signal, controller.signal);
  }
  console.log('devices-api: PASS (device ID path, caller identity, pinned session, cancellation)');
})().catch(error => { console.error(error); process.exitCode = 1; });
