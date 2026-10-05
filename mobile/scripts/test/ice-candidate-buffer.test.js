'use strict';
// Kandidat ICE penelepon ditahan sampai panggilan dijawab, lalu dikirim berurutan (server hanya meneruskan ke anggota room;
// penjawab baru masuk room saat menekan angkat).
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { iceCandidateBuffer } = loadFresh(['utils/iceCandidateBuffer.ts']);
const { OutgoingIceBuffer } = iceCandidateBuffer;

const sent = [];
const send = (c) => sent.push(c);

const buf = new OutgoingIceBuffer();
buf.submit('c1', send);
buf.submit('c2', send);
assert.deepStrictEqual(sent, [], 'sebelum dijawab tidak ada yang dikirim');
assert.strictEqual(buf.pendingCount, 2);

buf.release(send);
assert.deepStrictEqual(sent, ['c1', 'c2'], 'saat dijawab, antrean dikirim sesuai urutan');
assert.strictEqual(buf.pendingCount, 0);

buf.submit('c3', send);
assert.deepStrictEqual(sent, ['c1', 'c2', 'c3'], 'setelah dibuka, kandidat dikirim langsung');

buf.release(send);
assert.deepStrictEqual(sent, ['c1', 'c2', 'c3'], 'release kedua tidak mengirim ulang');

// panggilan baru: buffer menutup lagi dan antrean lama dibuang
buf.reset();
buf.submit('d1', send);
assert.deepStrictEqual(sent, ['c1', 'c2', 'c3'], 'setelah reset, kandidat kembali ditahan');
buf.reset();
buf.release(send);
assert.deepStrictEqual(sent, ['c1', 'c2', 'c3'], 'antrean panggilan sebelumnya tidak bocor ke panggilan berikutnya');

console.log('ice-candidate-buffer: tahan sebelum dijawab, kirim berurutan saat dijawab, langsung sesudahnya, reset membersihkan');
