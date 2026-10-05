'use strict';
// Status media panggilan: dipetakan dari RTCPeerConnection.connectionState; STUN cadangan tanpa TURN publik yang mati.
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { webrtcService } = loadFresh(['services/webrtcService.ts']);
const { mapPeerConnectionState, DEFAULT_ICE_SERVERS } = webrtcService;

assert.strictEqual(mapPeerConnectionState('connecting'), 'connecting');
assert.strictEqual(mapPeerConnectionState('connected'), 'connected');
assert.strictEqual(mapPeerConnectionState('disconnected'), 'disconnected');
assert.strictEqual(mapPeerConnectionState('failed'), 'failed');
// 'new' dan 'closed' tidak boleh mengubah status tampilan
assert.strictEqual(mapPeerConnectionState('new'), null);
assert.strictEqual(mapPeerConnectionState('closed'), null);
assert.strictEqual(mapPeerConnectionState('apa-saja'), null);

const all = JSON.stringify(DEFAULT_ICE_SERVERS);
assert.ok(all.includes('stun:'), 'STUN cadangan wajib ada');
assert.ok(!all.includes('turn:') && !all.includes('openrelayproject'), 'tidak boleh ada TURN publik bawaan (tidak berfungsi)');

console.log('call-media-state: pemetaan 7 kasus, STUN cadangan tanpa TURN publik');
