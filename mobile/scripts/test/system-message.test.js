'use strict';
// Pengenal pesan sistem: pengirim "server" atau type "system"; pesan pengguna biasa tidak boleh cocok.
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { systemMessage } = loadFresh(['utils/systemMessage.ts']);
const { isSystemMessage } = systemMessage;

assert.ok(isSystemMessage({ from: 'server' }));
assert.ok(isSystemMessage({ sender_id: 'server' }));
assert.ok(isSystemMessage({ type: 'system' }));
assert.ok(isSystemMessage({ type: 'text', from: 'server', sender_id: 'usr_1' }));

for (const m of [{}, { from: 'alice' }, { sender_id: 'usr_1', type: 'text' }, { nickname: 'Sistem', from: 'usr_2' }, { from: 'servers' }]) {
  assert.ok(!isSystemMessage(m), 'seharusnya bukan pesan sistem: ' + JSON.stringify(m));
}
console.log('system-message: 4 kasus cocok, 5 kasus sengaja tidak cocok');
