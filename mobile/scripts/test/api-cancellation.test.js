'use strict';
const assert = require('assert/strict');
const Module = require('module');
const { loadFresh } = require('./_harness');
const original = Module._load;
Module._load = function (request, ...rest) {
  if (request === './config') return { API_CONFIG: { TIMEOUT_MS: 1000 }, getBaseApiUrl: () => 'https://example.test' };
  if (request === '../utils/appVersion') return { APP_CHANNEL: 'test', getAppVersionInfo: () => ({ version: '1', buildNumber: 1, clientId: 'test' }) };
  if (request === '../utils/linkFrozen' || request === '../utils/accountSuspended') return {};
  if (request === '../services/secureStorage') return { secureStorage: { getAuthToken: async () => 'stored' } };
  return original.call(this, request, ...rest);
};
const { apiClient } = loadFresh(['api/client.ts']).client;

(async () => {
  let fetchSignal;
  global.fetch = async (_url, options) => {
    fetchSignal = options.signal;
    return new Promise((_, reject) => {
      const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      if (options.signal.aborted) abort();
      else options.signal.addEventListener('abort', abort, { once: true });
    });
  };
  const caller = new AbortController();
  const pending = apiClient('/api/auth/devices', { skipAuth: true, signal: caller.signal });
  assert.equal(fetchSignal.aborted, false);
  caller.abort();
  await assert.rejects(pending);
  assert.equal(fetchSignal.aborted, true);
  const preAborted = new AbortController();
  preAborted.abort();
  await assert.rejects(apiClient('/api/auth/devices', { skipAuth: true, signal: preAborted.signal }));
  // Successful requests remove the listener instead of retaining a screen/session.
  let removes = 0;
  const successful = new AbortController();
  const remove = successful.signal.removeEventListener.bind(successful.signal);
  successful.signal.removeEventListener = (...args) => { removes++; return remove(...args); };
  global.fetch = async () => ({ ok: true, text: async () => '[]' });
  assert.deepEqual(await apiClient('/api/auth/devices', { skipAuth: true, signal: successful.signal }), []);
  assert.equal(removes, 1);
  console.log('api-cancellation: PASS (pending abort, pre-abort, listener cleanup)');
})().catch(error => { console.error(error); process.exitCode = 1; });
