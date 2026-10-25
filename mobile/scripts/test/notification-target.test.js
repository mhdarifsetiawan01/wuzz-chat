'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const { loadFresh } = require('./_harness');
const { notificationTarget: { parseNotificationTarget: parse, createNotificationNavigationQueue: queue }, memoryDraftTarget: { validateMemoryDraftTarget: validate, memoryDraftTargetError: error } } = loadFresh(['services/notificationTarget.ts', 'components/memory/memoryDraftTarget.ts']);
const data = { type: 'memory_draft_ready', group_id: 'grp_test', forum_id: 'sub_test', draft_id: 'draft_test' };
test('memory push validates IDs and cannot fall back to chat on malformed data', () => {
  assert.deepEqual(parse(data), { type: data.type, groupId: 'grp_test', forumId: 'sub_test', draftId: 'draft_test' });
  for (const patch of [{ group_id: '' }, { forum_id: 'grp_wrong' }, { draft_id: null }, { draft_id: {} }]) assert.equal(parse({ ...data, room_id: 'grp_fallback', ...patch }), null);
  assert.equal(parse({ room_id: {} }), null); assert.equal(parse(), null);
});
test('message and call push retain navigation metadata', () => {
  const chat = parse({ room_id: 'sub_one', sender_id: 'u', sender_public_key: 'key' });
  assert.equal(chat.type, 'room'); assert.equal(chat.isGroup, true); assert.equal(chat.senderPublicKey, 'key');
  const call = parse({ room_id: 'dm_one', type: 'call_incoming', caller_id: 'caller', call_id: 'call', sdp: 'offer' });
  assert.equal(call.isCall, true); assert.equal(call.senderId, 'caller'); assert.equal(call.sdp, 'offer');
  assert.equal(parse({ room_id: 'dm_one', is_call: 'false' }).isCall, false);
});
test('warm/background taps navigate; cold start waits for ready; session cleanup drops pending navigation', () => {
  let ready = false; const calls = [];
  const q = queue(() => ready, (t) => calls.push(t)), target = parse(data);
  q.enqueue(target); q.flush(); assert.equal(calls.length, 0);
  ready = true; q.flush(); q.flush(); assert.deepEqual(calls, [target]);
  q.enqueue(target); assert.equal(calls.length, 2);
  q.enqueue(target); assert.equal(calls.length, 3);
  ready = false; q.enqueue(target); q.dispose(); ready = true; q.flush(); q.enqueue(target); assert.equal(calls.length, 3);
});
test('review rejects mixed IDs/decided drafts and explains forbidden/missing/conflict', () => {
  const draft = { group_id: 'grp_test', forum_id: 'sub_test', status: 'DRAFT' };
  assert.equal(validate(draft, 'grp_test', 'sub_test'), null);
  assert.ok(validate(draft, 'grp_other', 'sub_test')); assert.ok(validate(draft, 'grp_test', 'sub_other'));
  for (const status of ['APPROVED', 'REJECTED']) assert.match(validate({ ...draft, status }, 'grp_test'), /sudah/);
  assert.match(error({ status: 403 }), /akses/); assert.match(error({ status: 404 }), /tidak tersedia/); assert.match(error({ status: 409 }), /sudah/);
});
test('native tap listener and cold-start response share deduplication', async () => {
  let listener, response; const original = Module._load;
  Module._load = function (name, ...rest) {
    if (name === 'expo-device') return {};
    if (name === 'expo-constants') return { __esModule: true, default: {}, ExecutionEnvironment: { StoreClient: 'store' } };
    if (name === '../api/notifications') return { notificationsApi: {} };
    if (name === './secureStorage') return { secureStorage: {} };
    if (name === './notificationBackgroundTask') return { BACKGROUND_NOTIFICATION_TASK: 'test' };
    if (name === 'expo-notifications') return { setNotificationHandler() {}, addNotificationResponseReceivedListener(fn) { listener = fn; return { remove() {} }; }, async getLastNotificationResponseAsync() { return response; } };
    return original.call(this, name, ...rest);
  };
  try {
    const service = loadFresh(['services/notificationService.ts']).notificationService.notificationService;
    const calls = []; service.addNotificationResponseListener((t) => calls.push(t));
    response = { notification: { request: { identifier: 'same-id', content: { data } } } };
    listener(response); await service.checkColdStartNotification((t) => calls.push(t)); listener(response);
    assert.equal(calls.length, 1); assert.equal(calls[0].draftId, 'draft_test');
    const fresh = loadFresh(['services/notificationService.ts']).notificationService.notificationService;
    await fresh.checkColdStartNotification((t) => calls.push(t)); assert.equal(calls.length, 2);
  } finally { Module._load = original; }
});
test('game reminder tap opens the game screen and never needs a room', () => {
  assert.deepEqual(parse({ type: 'game_reminder', kind: 'game_reminder' }), { type: 'game' });
  assert.deepEqual(parse({ type: 'game_reminder', room_id: 'grp_x' }), { type: 'game' }, 'tipe game menang atas room_id');
  assert.notDeepEqual(parse({ type: 'game_remind' }), { type: 'game' });
});
