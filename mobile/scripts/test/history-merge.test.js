'use strict';
// Penggabungan riwayat server dengan pesan yang sudah ada (D3): halaman lama tidak boleh hilang saat `history` tiba.
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { mergeHistoryWindow: merge } = loadFresh(['utils/historyMerge.ts']).historyMerge;
const msg = (i, extra = {}) => ({
  id: 'm' + String(i).padStart(4, '0'),
  content: 'p' + i,
  status: 'delivered',
  created_at: new Date(Date.UTC(2026, 9, 4, 0, 0, i)).toISOString(),
  ...extra,
});
const range = (a, b) => Array.from({ length: b - a }, (_, i) => msg(a + i));
const ids = (list) => list.map((m) => m.id);

// 1. halaman lama hasil paginasi dipertahankan (existing 0..149, jendela server 100..149)
let out = merge(range(0, 150), range(100, 150));
assert.equal(out.length, 150);
assert.deepEqual(ids(out), ids(range(0, 150)));
console.log('1. 150 pesan di memori + jendela server 50 terbaru : 150 tetap ada, urut');

// 2. versi server menang untuk pesan dalam jendela
out = merge([msg(5)], [msg(5, { status: 'read' })]);
assert.equal(out[0].status, 'read');
console.log('2. pesan dalam jendela                              : data server dipakai');

// 3. pesan dalam rentang jendela yang tidak dikirim server dibuang (mis. terhapus), yang lebih lama tetap
out = merge(range(0, 20), [...range(10, 12), ...range(13, 20)]);
assert.ok(!ids(out).includes('m0012'));
assert.equal(out.length, 19);
console.log('3. pesan di rentang jendela yang hilang di server   : dibuang; yang lebih lama dipertahankan');

// 4. pesan optimistic tetap ada, tanpa duplikat
const opt = msg(500, { status: 'sending', id: 'tmp1', request_id: 'tmp1' });
out = merge([...range(0, 5), opt], range(3, 5));
assert.deepEqual(ids(out), ['m0000', 'm0001', 'm0002', 'm0003', 'm0004', 'tmp1']);
console.log('4. pesan optimistic                                 : dipertahankan, tidak duplikat');

// 5. jendela server kosong: hanya optimistic (perilaku lama)
out = merge([...range(0, 5), opt], []);
assert.deepEqual(ids(out), ['tmp1']);
console.log('5. jendela server kosong                            : hanya pesan optimistic');

// 6. tanpa pesan lama: identik dengan jendela server
out = merge([], range(0, 3));
assert.deepEqual(ids(out), ids(range(0, 3)));
console.log('6. memori kosong                                    : jendela server apa adanya');
