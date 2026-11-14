'use strict';
/**
 * Alur pembelian Star lewat Google Play (services/starBilling.ts) dengan expo-iap dan API server tiruan:
 * kapan transaksi diselesaikan, kapan TIDAK (agar Google mengembalikan dana), pemulihan, dan pembelian tertunda.
 */
const assert = require('assert/strict');
const Module = require('module');
const { loadFresh } = require('./_harness');

const iap = {
  updated: null,
  errorFn: null,
  inits: 0,
  finished: [],
  requests: [],
  available: [],
  products: [{ id: 'star_50', displayPrice: 'Rp 5.000' }, { id: 'star_100', displayPrice: 'Rp 10.000' }],
};
const server = { packagesStatus: 200, submit: null, submitted: [] };

const original = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'expo-iap') {
    return {
      initConnection: async () => {
        iap.inits++;
        return true;
      },
      fetchProducts: async ({ skus }) => iap.products.filter((p) => skus.includes(p.id)),
      requestPurchase: async (args) => {
        iap.requests.push(args);
        return null;
      },
      finishTransaction: async ({ purchase, isConsumable }) => {
        iap.finished.push({ token: purchase.purchaseToken, isConsumable });
      },
      getAvailablePurchases: async () => iap.available,
      purchaseUpdatedListener: (fn) => {
        iap.updated = fn;
        return { remove() {} };
      },
      purchaseErrorListener: (fn) => {
        iap.errorFn = fn;
        return { remove() {} };
      },
      isUserCancelledError: (e) => e && e.code === 'user-cancelled',
    };
  }
  if (request === '../api/stars') {
    return {
      isStarsUnavailable: (e) => e && e.status === 404,
      starsApi: {
        getPackages: async () => {
          if (server.packagesStatus !== 200) throw { status: server.packagesStatus };
          return { packages: [{ product_id: 'star_50', stars: 50 }], account_id: 'acct-hash' };
        },
        submitPlayPurchase: async (productId, token) => {
          server.submitted.push({ productId, token });
          return server.submit(productId, token);
        },
      },
    };
  }
  return original.call(this, request, ...rest);
};

const billing = loadFresh(['services/starBilling.ts']).starBilling;
const tick = () => new Promise((r) => setTimeout(r, 0));
const purchase = (token, state = 'purchased', productId = 'star_50') => ({ productId, purchaseToken: token, purchaseState: state });

(async () => {
  const events = [];
  billing.subscribeStarBilling((e) => events.push(e));

  // Harga dari Play; koneksi dibuka sekali.
  const prices = await billing.loadStarPrices(['star_50', 'star_500']);
  assert.deepEqual(prices, { star_50: 'Rp 5.000' });
  await billing.loadStarPrices(['star_100']);
  assert.equal(iap.inits, 1, 'initConnection hanya sekali');

  // Beli: obfuscatedAccountId dipasang, tipe in-app.
  await billing.buyStars('star_50', 'acct-hash');
  assert.deepEqual(iap.requests[0], { request: { google: { skus: ['star_50'], obfuscatedAccountId: 'acct-hash' } }, type: 'in-app' });
  await assert.rejects(() => billing.buyStars('star_50', ''), 'tanpa account_id ditolak');

  // Sukses: server mengkreditkan → transaksi diselesaikan sebagai consumable.
  server.submit = async () => ({ state: 'credited', stars_added: 50, balance: 50, debt: 0 });
  iap.updated(purchase('t-ok'));
  await tick();
  assert.deepEqual(iap.finished, [{ token: 't-ok', isConsumable: true }]);
  assert.deepEqual(events.pop(), { type: 'credited', starsAdded: 50, balance: 50, debt: 0 });

  // Pembayaran tertunda di Google: tidak dikirim ke server, tidak diselesaikan.
  const before = server.submitted.length;
  iap.updated(purchase('t-pend', 'pending'));
  await tick();
  assert.equal(server.submitted.length, before);
  assert.deepEqual(events.pop(), { type: 'pending' });

  // Server: pending (202) → tidak diselesaikan.
  server.submit = async () => ({ state: 'pending', stars_added: 0, balance: 0, debt: 0 });
  iap.updated(purchase('t-202'));
  await tick();
  assert.ok(!iap.finished.some((f) => f.token === 't-202'));
  assert.equal(events.pop().type, 'pending');

  // Akun lain: TIDAK diselesaikan (Google mengembalikan dana bila tidak diklaim).
  server.submit = async () => {
    throw { status: 403, code: 'purchase_account_mismatch' };
  };
  iap.updated(purchase('t-other'));
  await tick();
  assert.ok(!iap.finished.some((f) => f.token === 't-other'));
  let e = events.pop();
  assert.equal(e.type, 'failed');
  assert.equal(e.retryable, false);

  // Jaringan putus: tidak diselesaikan, bisa dicoba ulang.
  server.submit = async () => {
    throw { status: 0, detail: 'offline' };
  };
  iap.updated(purchase('t-net'));
  await tick();
  assert.ok(!iap.finished.some((f) => f.token === 't-net'));
  e = events.pop();
  assert.equal(e.type, 'failed');
  assert.equal(e.retryable, true);

  // Produk bukan Star diabaikan.
  const n = server.submitted.length;
  iap.updated(purchase('t-x', 'purchased', 'premium'));
  await tick();
  assert.equal(server.submitted.length, n);

  // Token sama dikirim dua kali bersamaan: satu permintaan ke server.
  let resolve;
  server.submit = () => new Promise((r) => (resolve = r));
  const m = server.submitted.length;
  iap.updated(purchase('t-dup'));
  iap.updated(purchase('t-dup'));
  await tick();
  assert.equal(server.submitted.length, m + 1, 'token sama sedang diproses: tidak dikirim dua kali');
  resolve({ state: 'credited', stars_added: 50, balance: 100, debt: 0 });
  await tick();

  // Pemulihan: pembelian yang belum selesai dikirim ulang.
  server.submit = async () => ({ state: 'credited', stars_added: 50, balance: 150, debt: 0 });
  iap.available = [purchase('t-net')];
  await billing.recoverStarPurchases();
  assert.ok(iap.finished.some((f) => f.token === 't-net'), 'pembelian tertinggal dipulihkan');

  // Fitur mati di server (404): tidak ada pengiriman.
  server.packagesStatus = 404;
  const k = server.submitted.length;
  iap.available = [purchase('t-late')];
  await billing.recoverStarPurchases();
  assert.equal(server.submitted.length, k);

  // Dibatalkan pengguna.
  iap.errorFn({ code: 'user-cancelled' });
  assert.deepEqual(events.pop(), { type: 'cancelled' });

  console.log('star-billing: PASS (finish only after credit, no finish on mismatch/pending/network, dedupe, recovery, 404 off)');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
