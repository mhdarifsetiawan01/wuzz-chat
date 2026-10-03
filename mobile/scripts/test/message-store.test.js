'use strict';
// Store pesan per-room: update room A tidak mengganti referensi room B; updater no-op tidak memicu notifikasi.
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { messageStore } = loadFresh(['context/messageStore.ts']);
const { createMessageStore, EMPTY_MESSAGES } = messageStore;

const store = createMessageStore();
let calls = 0;
const unsubscribe = store.subscribe(() => calls++);
const msg = (id) => ({ id, content: id });

store.setSlice('messagesByRoom', (p) => ({ ...p, A: [msg('a1')] }));
assert.equal(calls, 1);
const roomA = store.getState().messagesByRoom.A;

store.setSlice('messagesByRoom', (p) => ({ ...p, B: [msg('b1')] }));
assert.equal(calls, 2);
assert.strictEqual(store.getState().messagesByRoom.A, roomA, 'referensi room A berubah saat B diperbarui');

store.setSlice('messagesByRoom', (p) => p);
assert.equal(calls, 2, 'updater no-op tidak boleh memicu notifikasi');

const messagesRef = store.getState().messagesByRoom;
store.setSlice('loadingOlder', (p) => ({ ...p, A: true }));
assert.strictEqual(store.getState().messagesByRoom, messagesRef, 'slice lain tidak boleh menyentuh messagesByRoom');
assert.equal(calls, 3);

unsubscribe();
store.setSlice('roomLoading', (p) => ({ ...p, A: true }));
assert.equal(calls, 3, 'setelah unsubscribe tidak ada notifikasi');

store.reset();
assert.deepEqual(store.getState().messagesByRoom, {});
assert.ok(Array.isArray(EMPTY_MESSAGES) && EMPTY_MESSAGES.length === 0);
console.log('messageStore: referensi room terjaga, no-op senyap, unsubscribe, reset');
