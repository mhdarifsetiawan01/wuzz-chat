'use strict';
// Gerbang usia 13+: pembuatan akun hanya boleh lanjut bila pernyataan usia dicentang.
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { ageGate } = loadFresh(['utils/ageGate.ts']);

assert.strictEqual(ageGate.MIN_AGE_YEARS, 13, 'batas usia harus 13 (sama dengan Syarat Layanan/Kebijakan Privasi)');
assert.strictEqual(ageGate.validateAgeConfirmed(true), null, 'dicentang = boleh lanjut');

const err = ageGate.validateAgeConfirmed(false);
assert.ok(typeof err === 'string' && err.length > 0, 'belum dicentang = ada pesan galat');
assert.ok(err.includes('13'), 'pesan menyebut batas usia');
assert.strictEqual(err, ageGate.AGE_GATE_ERROR);

// Nilai non-boolean yang falsy tidak boleh meloloskan gerbang.
assert.ok(ageGate.validateAgeConfirmed(undefined), 'undefined harus ditolak');
assert.ok(ageGate.validateAgeConfirmed(null), 'null harus ditolak');
assert.ok(ageGate.validateAgeConfirmed(0), '0 harus ditolak');
console.log('age-gate OK');
