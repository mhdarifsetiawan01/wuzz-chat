'use strict';
// Pelacak "sedang mengetik": kedaluwarsa otomatis, perpanjangan tanpa render ulang, hapus saat pesan masuk, label header.
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { typingTracker } = loadFresh(['utils/typingTracker.ts']);
const { TypingTracker, describeTypers, shouldSendTyping, typerKey, TYPING_MAX_GROUP_MEMBERS } = typingTracker;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const calls = [];
  const tracker = new TypingTracker(40, (names) => calls.push(names));

  tracker.mark('u1', 'Alice');
  assert.deepStrictEqual(calls, [['Alice']]);

  // event berulang dari orang yang sama memperpanjang waktu, tanpa onChange baru
  await wait(25);
  tracker.mark('u1', 'Alice');
  await wait(25); // 50 ms sejak mark pertama, tapi baru 25 ms sejak perpanjangan
  assert.strictEqual(calls.length, 1, 'perpanjangan tidak boleh memicu render ulang');
  await wait(40);
  assert.deepStrictEqual(calls[calls.length - 1], [], 'kedaluwarsa setelah ttl tanpa event baru');

  // dua pengetik, lalu satu mengirim pesan
  calls.length = 0;
  tracker.mark('u1', 'Alice');
  tracker.mark('u2', 'Bob');
  assert.deepStrictEqual(calls[calls.length - 1], ['Alice', 'Bob']);
  tracker.remove('u1');
  assert.deepStrictEqual(calls[calls.length - 1], ['Bob']);
  const before = calls.length;
  tracker.remove('tidak-ada');
  assert.strictEqual(calls.length, before, 'menghapus kunci yang tidak ada tidak memicu onChange');

  // dispose menghentikan timer: tidak ada onChange setelahnya
  tracker.dispose();
  const afterDispose = calls.length;
  await wait(70);
  assert.strictEqual(calls.length, afterDispose, 'dispose tidak boleh meninggalkan timer yang memanggil onChange');

  // label header
  assert.strictEqual(describeTypers([], true), '');
  assert.strictEqual(describeTypers(['Alice'], true), 'sedang mengetik');
  assert.strictEqual(describeTypers(['Alice'], false), 'Alice sedang mengetik');
  assert.strictEqual(describeTypers(['Alice', 'Bob'], false), 'Alice dan Bob sedang mengetik');
  assert.strictEqual(describeTypers(['A', 'B', 'C'], false), '3 orang sedang mengetik');
  assert.strictEqual(describeTypers([''], false), 'Seseorang sedang mengetik');

  // batas pengiriman: DM selalu, grup <= 30 dan diketahui
  assert.strictEqual(TYPING_MAX_GROUP_MEMBERS, 30);
  assert.strictEqual(shouldSendTyping(true, 0), true, 'DM selalu mengirim, walau jumlah anggota 0');
  assert.strictEqual(shouldSendTyping(true, 2), true);
  assert.strictEqual(shouldSendTyping(false, 0), false, 'grup dengan jumlah anggota belum diketahui tidak mengirim');
  assert.strictEqual(shouldSendTyping(false, 2), true);
  assert.strictEqual(shouldSendTyping(false, 30), true, 'tepat di batas masih boleh');
  assert.strictEqual(shouldSendTyping(false, 31), false, 'melewati batas tidak mengirim');
  assert.strictEqual(shouldSendTyping(false, 1000), false);
  assert.strictEqual(shouldSendTyping(false, -1), false, 'nilai tak valid dianggap tidak diketahui');

  // kunci pengetik: `from` (ID), event milik sendiri disaring
  assert.strictEqual(typerKey({ from: 'u-bob', nickname: 'Bob' }, 'u-alice'), 'u-bob');
  assert.strictEqual(typerKey({ from: 'u-alice', nickname: 'Alice' }, 'u-alice'), null, 'event dari perangkat lain milik sendiri harus disaring');
  assert.strictEqual(typerKey({ sender_id: 'u-bob' }, 'u-alice'), 'u-bob', 'cadangan sender_id bila from kosong');
  assert.strictEqual(typerKey({ from: 'u-alice' }, ''), 'u-alice', 'ID sendiri belum diketahui: tidak menyaring');
  assert.strictEqual(typerKey({ nickname: 'Bob' }, 'u-alice'), null, 'tanpa from/sender_id tidak ada kunci (nickname tidak dipakai)');
  assert.strictEqual(typerKey(null, 'u-alice'), null);
  assert.strictEqual(typerKey(undefined, 'u-alice'), null);
  // dua pengguna ber-nickname sama tidak lagi menyatu karena kuncinya ID
  const dup = [];
  const t2 = new TypingTracker(1000, (names) => dup.push(names));
  t2.mark(typerKey({ from: 'u-1', nickname: 'Andi' }, 'u-9'), 'Andi');
  t2.mark(typerKey({ from: 'u-2', nickname: 'Andi' }, 'u-9'), 'Andi');
  assert.deepStrictEqual(dup[dup.length - 1], ['Andi', 'Andi'], 'dua pengguna ber-nickname sama harus tetap dua pengetik');
  t2.dispose();

  console.log('typing-tracker: kedaluwarsa, perpanjangan, hapus saat pesan masuk, dispose, label header, batas kirim, kunci pengetik');
})().catch((e) => { console.error(e); process.exit(1); });
