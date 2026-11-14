'use strict';
/** Klien API Star (V2 Tahap 2a): jalur, header Idempotency-Key, normalisasi jawaban, dan format angka. */
const assert = require('assert/strict');
const Module = require('module');
const { loadFresh } = require('./_harness');
const original = Module._load;
const calls = [];
let nextResponse = null;
Module._load = function (request, ...rest) {
  if (request === './client') {
    return {
      apiClient: async (path, options) => {
        calls.push({ path, ...options });
        return nextResponse;
      },
    };
  }
  return original.call(this, request, ...rest);
};
const stars = loadFresh(['api/stars.ts']).stars;

(async () => {
  const controller = new AbortController();

  // Bayar akses: token di-encode, harga yang diharapkan dikirim, kunci idempoten di header.
  nextResponse = { group_id: 'grp_1', status: 'member', stars_paid: 100, balance: 50 };
  const res = await stars.starsApi.purchase('tok/en?', 100, 'key-1', controller.signal);
  assert.equal(res.balance, 50);
  assert.equal(calls[0].path, '/api/invites/tok%2Fen%3F/purchase');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers['Idempotency-Key'], 'key-1');
  assert.deepEqual(JSON.parse(calls[0].body), { expected_price: 100 });
  assert.equal(calls[0].signal, controller.signal);

  // Dompet: jawaban tanpa history tetap aman dirender.
  nextResponse = { balance: 7 };
  assert.deepEqual(await stars.starsApi.getWallet(), { balance: 7, debt: 0, history: [] });
  assert.equal(calls[1].path, '/api/me/stars');

  nextResponse = {};
  assert.deepEqual(await stars.starsApi.getReceived(), { is_creator: false, groups: [] });

  // Tahap 2b: paket dan pembelian Play.
  nextResponse = { packages: [{ product_id: 'star_50', stars: 50 }], account_id: 'abc' };
  assert.deepEqual(await stars.starsApi.getPackages(), { packages: [{ product_id: 'star_50', stars: 50 }], account_id: 'abc' });
  assert.equal(calls[calls.length - 1].path, '/api/me/stars/packages');
  nextResponse = {};
  assert.deepEqual(await stars.starsApi.getPackages(), { packages: [], account_id: '' });
  nextResponse = { state: 'credited', stars_added: 50, balance: 50, debt: 0 };
  await stars.starsApi.submitPlayPurchase('star_50', 'tok/1');
  const last = calls[calls.length - 1];
  assert.equal(last.path, '/api/me/stars/purchases');
  assert.equal(last.method, 'POST');
  assert.deepEqual(JSON.parse(last.body), { product_id: 'star_50', purchase_token: 'tok/1' });
  assert.ok(last.timeoutMs >= 30000, 'verifikasi ke Google butuh batas waktu lebih panjang');

  // Pengaturan harga grup.
  nextResponse = { paid: { group_id: 'grp_1', creator_id: 'u1', price_stars: 25, enabled: true } };
  const paid = await stars.starsApi.setGroupPaid('grp_1', 25, true);
  assert.equal(paid.price_stars, 25);
  const put = calls[calls.length - 1];
  assert.equal(put.path, '/api/groups/grp_1/paid');
  assert.equal(put.method, 'PUT');
  assert.deepEqual(JSON.parse(put.body), { price_stars: 25, enabled: true });

  // Sakelar mati = 404 = sembunyikan UI; galat lain tidak.
  assert.equal(stars.isStarsUnavailable({ status: 404 }), true);
  assert.equal(stars.isStarsUnavailable({ status: 0 }), false);
  assert.equal(stars.isStarsUnavailable(undefined), false);

  // Kunci idempoten unik per niat bayar.
  assert.notEqual(stars.newIdempotencyKey(), stars.newIdempotencyKey());

  // Format angka tanpa Intl.
  assert.equal(stars.formatThousands(0), '0');
  assert.equal(stars.formatThousands(999), '999');
  assert.equal(stars.formatThousands(1250), '1.250');
  assert.equal(stars.formatThousands(-1234567), '-1.234.567');
  assert.equal(stars.formatStars(5000), '5.000 Star');

  // Label riwayat netral (tanpa "pendapatan/tarik/cairkan").
  for (const kind of ['spend', 'refund', 'test_grant', 'adjustment', 'purchase', 'reversal', 'debt_repay', 'lain']) {
    const label = stars.starKindLabel(kind);
    assert.ok(label.length > 0);
    assert.doesNotMatch(label, /pendapatan|tarik|cair/i);
  }

  console.log('stars-api: PASS (purchase idempotency header, wallet normalisation, paid settings, 404 hiding, formatting)');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
