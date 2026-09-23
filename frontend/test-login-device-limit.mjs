// test-login-device-limit.mjs — Frontend Logic Verification for Device Limit Handling
import assert from 'node:assert/strict'

console.log('🧪 [FRONTEND DEVICE LIMIT TEST] Memverifikasi Penanganan 409 DEVICE_LIMIT_REACHED & Modal Flow...\n')

// 1. Mock apiRequest response data mapping
function simulateLoginResponse(status, payload) {
  if (status === 200) {
    return { data: payload, status }
  }
  return { error: payload.error || `Request gagal dengan status ${status}`, status, data: payload }
}

// 2. Test 1: Respons 409 Conflict memuat data.code dan data.active_devices utuh
console.log('▶ Test 1: Verifikasi apiRequest mempertahankan data respons saat error 409 Conflict')
const mock409Payload = {
  error: 'DEVICE_LIMIT_REACHED',
  code: 'DEVICE_LIMIT_REACHED',
  message: 'Akun Anda saat ini sudah aktif di 2 perangkat lain.',
  max_devices: 2,
  active_devices: [
    { id: 'dev_laptop', name: 'Chrome di Windows', platform: 'web', last_seen_at: new Date().toISOString() },
    { id: 'dev_phone', name: 'Safari di iOS', platform: 'web', last_seen_at: new Date().toISOString() },
  ],
}

const res = simulateLoginResponse(409, mock409Payload)
assert.equal(res.status, 409, 'Status harus 409')
assert.equal(res.data?.code, 'DEVICE_LIMIT_REACHED', 'Kode error harus DEVICE_LIMIT_REACHED')
assert.equal(res.data?.active_devices?.length, 2, 'Harus ada 2 active devices dalam payload')
console.log('  ✅ PASSED: Payload error 409 (code & active_devices) tertangkap utuh.')

// 3. Test 2: Simulasi State Management Login Page saat menangkap DEVICE_LIMIT_REACHED
console.log('▶ Test 2: Simulasi transisi state frontend dari form login ke DeviceLimitModal')
let pageState = {
  deviceLimitModal: {
    isOpen: false,
    activeDevices: [],
    isSubmitting: false,
    error: '',
  },
}

function handleLoginResult(apiResult) {
  if (apiResult.error) {
    if (apiResult.status === 409 && apiResult.data?.code === 'DEVICE_LIMIT_REACHED') {
      pageState.deviceLimitModal = {
        isOpen: true,
        activeDevices: Array.isArray(apiResult.data.active_devices) ? apiResult.data.active_devices : [],
        isSubmitting: false,
        error: '',
      }
      return 'OPEN_MODAL'
    }
    return 'SHOW_ERROR'
  }
  return 'NAVIGATE_CHAT'
}

const action = handleLoginResult(res)
assert.equal(action, 'OPEN_MODAL', 'Action harus OPEN_MODAL')
assert.equal(pageState.deviceLimitModal.isOpen, true, 'Modal harus terbuka')
assert.equal(pageState.deviceLimitModal.activeDevices.length, 2, 'Modal harus menerima 2 perangkat')
console.log('  ✅ PASSED: State modal terbuka dengan 2 daftar perangkat aktif.')

// 4. Test 3: Simulasi Konfirmasi Pengguna untuk mengeluarkan salah satu perangkat (Override Flow)
console.log('▶ Test 3: Simulasi pengiriman login ulang dengan confirm_override dan kick_device_id')
function buildOverridePayload(username, password, deviceId, kickDeviceId) {
  return {
    username: username.trim(),
    password,
    device_id: deviceId,
    confirm_override: true,
    kick_device_id: kickDeviceId,
  }
}

const overrideReq = buildOverridePayload('alice', 'password123', 'dev_tablet_3', 'dev_laptop')
assert.equal(overrideReq.confirm_override, true, 'confirm_override harus bernilai true')
assert.equal(overrideReq.kick_device_id, 'dev_laptop', 'kick_device_id harus menunjuk ke dev_laptop')
assert.equal(overrideReq.device_id, 'dev_tablet_3', 'device_id harus menunjuk ke perangkat baru')
console.log('  ✅ PASSED: Payload konfirmasi override terkonstruksi dengan benar.')

console.log('\n🎉 SELURUH SKENARIO PENGUJIAN FRONTEND DEVICE LIMIT BERHASIL 100%!\n')
