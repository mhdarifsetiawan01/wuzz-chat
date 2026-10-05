'use strict';
// Diagnostik panggilan untuk Crashlytics harus aman privasi: hanya jumlah kandidat per jenis, tanpa alamat IP.
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { webrtcService } = loadFresh(['services/webrtcService.ts']);
const { countCandidateType, formatCandidateCounts } = webrtcService;

const counts = {};
const candidates = [
  'candidate:1 1 udp 2122260223 192.168.104.238 51000 typ host generation 0',
  'candidate:2 1 udp 1686052607 36.73.251.127 51000 typ srflx raddr 192.168.104.238 rport 51000 generation 0',
  'candidate:3 1 udp 41885439 43.157.227.115 49200 typ relay raddr 36.73.251.127 rport 51000 generation 0',
  'candidate:4 1 udp 41885439 43.157.227.115 49201 typ relay raddr 36.73.251.127 rport 51001 generation 0',
  'candidate:5 1 tcp 1518280447 192.168.104.238 9 typ host tcptype active generation 0',
];
candidates.forEach((c) => countCandidateType(counts, c));
assert.deepStrictEqual(counts, { host: 2, srflx: 1, relay: 2 });

const text = formatCandidateCounts(counts);
assert.strictEqual(text, 'host:2,relay:2,srflx:1', 'urutan alfabet, stabil');
assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(text), 'ringkasan tidak boleh memuat alamat IP');

// masukan tak valid diabaikan tanpa error
const c2 = {};
[undefined, null, 42, {}, 'bukan kandidat', 'candidate:9 1 udp 1 1.2.3.4 5 typ aneh'].forEach((x) => countCandidateType(c2, x));
assert.deepStrictEqual(c2, {});
assert.strictEqual(formatCandidateCounts({}), 'none');

console.log('call-diagnostics: hitung per jenis (host/srflx/relay), format stabil, tanpa IP, masukan tak valid aman');
