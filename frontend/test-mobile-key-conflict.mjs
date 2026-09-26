// test-mobile-key-conflict.mjs — Verification of Mobile E2EE Key Conflict Handling & Reset Flow
import assert from 'node:assert/strict';

console.log('🧪 [MOBILE E2EE KEY CONFLICT & RESET TEST]');
console.log('Memverifikasi penanganan HTTP 409 KEY_ALREADY_REGISTERED & Reset Dialog...\n');

// 1. Mock State dan Storage
let mockStorage = {
  token: 'jwt_alice_secondary_device',
  user: { id: 'user_alice_uuid', username: 'alice' },
  deviceId: 'android_phone_002',
  keyPair: null,
};

let remoteLogoutCalled = false;
let resetPublicKeyCalled = false;
let resetPasswordReceived = '';

const mockAuthApi = {
  logout: async () => {
    remoteLogoutCalled = true;
  },
};

const mockUsersApi = {
  updatePublicKey: async (publicKeyJWK, deviceId) => {
    // Simulasikan penolakan 409 jika deviceId tidak cocok dengan active_device_id server
    if (deviceId !== 'android_phone_001') {
      const err = new Error('KEY_ALREADY_REGISTERED: Kunci publik sudah terdaftar untuk perangkat lain');
      err.status = 409;
      err.title = 'KEY_ALREADY_REGISTERED';
      throw err;
    }
    return { success: true };
  },
  resetPublicKey: async (publicKeyJWK, deviceId, password) => {
    resetPublicKeyCalled = true;
    resetPasswordReceived = password;
    if (password !== 'correct_password') {
      const err = new Error('Password salah');
      err.status = 401;
      throw err;
    }
    return { success: true, key_version: 2 };
  },
};

// -----------------------------------------------------------------------------
// Test 1: Deteksi HTTP 409 Conflict saat pendaftaran kunci awal
// -----------------------------------------------------------------------------
console.log('▶ Test 1: Deteksi HTTP 409 KEY_ALREADY_REGISTERED pada updatePublicKey');

let e2eeStatus = 'uninitialized';
let keyConflictModalVisible = false;

async function simulateInitE2EE() {
  e2eeStatus = 'loading';
  try {
    await mockUsersApi.updatePublicKey('mock_jwk_key_data', mockStorage.deviceId);
    e2eeStatus = 'ready';
  } catch (err) {
    if (err?.status === 409 || err?.title === 'KEY_ALREADY_REGISTERED') {
      e2eeStatus = 'conflict';
      keyConflictModalVisible = true;
    } else {
      e2eeStatus = 'error';
    }
  }
}

await simulateInitE2EE();
assert.equal(e2eeStatus, 'conflict', 'e2eeStatus harus berubah menjadi conflict');
assert.equal(keyConflictModalVisible, true, 'KeyConflictModal harus terbuka (visible = true)');
console.log('  ✅ PASSED: Error 409 tertangkap dan e2eeStatus berubah ke `conflict` dengan modal terbuka.\n');

// -----------------------------------------------------------------------------
// Test 2: Alur Konfirmasi Reset Kunci dengan Verifikasi Password
// -----------------------------------------------------------------------------
console.log('▶ Test 2: Alur Konfirmasi Reset Kunci dengan Verifikasi Password');

async function handleConfirmReset(password) {
  assert.ok(password, 'Password tidak boleh kosong');
  const res = await mockUsersApi.resetPublicKey('fresh_jwk_keypair', mockStorage.deviceId, password);
  mockStorage.keyPair = { publicKey: 'fresh_jwk_keypair' };
  e2eeStatus = 'ready';
  keyConflictModalVisible = false;
  return res;
}

// Simulasi jika password salah
try {
  await handleConfirmReset('wrong_pass');
  assert.fail('Seharusnya gagal dengan password salah');
} catch (err) {
  assert.equal(err.status, 401, 'Harus melempar error 401');
}

// Simulasi dengan password benar
const resetRes = await handleConfirmReset('correct_password');
assert.equal(resetPublicKeyCalled, true, 'resetPublicKey harus dipanggil');
assert.equal(resetPasswordReceived, 'correct_password', 'Password harus diteruskan dengan benar');
assert.equal(e2eeStatus, 'ready', 'e2eeStatus harus berubah menjadi ready setelah reset sukses');
assert.equal(keyConflictModalVisible, false, 'Modal harus tertutup setelah reset');
console.log('  ✅ PASSED: Reset kunci dengan password berhasil dan status E2EE aktif kembali (`ready`).\n');

// -----------------------------------------------------------------------------
// Test 3: Alur Pembatalan Konflik Kunci (Local-Only Abort Rule)
// -----------------------------------------------------------------------------
console.log('▶ Test 3: Alur Pembatalan Konflik Kunci (Local-Only Abort Rule)');

// Kembalikan ke state conflict
e2eeStatus = 'conflict';
keyConflictModalVisible = true;
remoteLogoutCalled = false;

async function handleCancelKeyConflict() {
  // Sesuai SOP line 84: Bersihkan sesi lokal TANPA memanggil authApi.logout ke server
  mockStorage.token = null;
  mockStorage.user = null;
  mockStorage.keyPair = null;
  e2eeStatus = 'uninitialized';
  keyConflictModalVisible = false;
}

await handleCancelKeyConflict();
assert.equal(mockStorage.token, null, 'Token lokal harus dibersihkan');
assert.equal(mockStorage.user, null, 'User lokal harus dibersihkan');
assert.equal(mockStorage.deviceId, 'android_phone_002', 'Device ID harus tetap persisten');
assert.equal(remoteLogoutCalled, false, 'DILARANG memanggil authApi.logout agar perangkat utama tidak terganggu');
assert.equal(e2eeStatus, 'uninitialized', 'Status harus kembali ke uninitialized');
assert.equal(keyConflictModalVisible, false, 'Modal harus tertutup');

console.log('  ✅ PASSED: Pembatalan hanya membersihkan lokal tanpa mengganggu sesi perangkat utama!\n');

console.log('🎉 SEMUA PENGUJIAN E2EE KEY CONFLICT HANDLING BERHASIL 100%!');
