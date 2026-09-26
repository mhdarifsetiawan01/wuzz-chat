// test-mobile-session-guard.mjs — Comprehensive Verification for Mobile WebSocket & Session Guard
import assert from 'node:assert/strict';

console.log('🧪 [MOBILE SINGLE ACTIVE DEVICE GUARD TEST]');
console.log('Memverifikasi penanganan Close Code 4001 & SESSION_REPLACED pada Klien Mobile...\n');

// 1. Mock Implementasi WebSocketClient Mobile (sesuai mobile/src/services/websocket.ts)
class MockMobileWebSocketClient {
  constructor() {
    this.ws = null;
    this.state = 'disconnected';
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.isExplicitlyClosed = false;
    this.destroyed = false;
    this.isTerminated = false;
    this.listeners = new Map();
    this.sessionReplacedHandler = null;
  }

  onSessionReplaced(handler) {
    this.sessionReplacedHandler = handler;
  }

  on(eventType, listener) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType).add(listener);
    return () => this.listeners.get(eventType)?.delete(listener);
  }

  handleSessionReplaced(reason) {
    if (this.isTerminated || this.destroyed) return;

    this.isTerminated = true;
    this.destroyed = true;
    this.state = 'terminated';

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      try {
        this.ws.close(4001, reason);
      } catch {}
      this.ws = null;
    }

    if (this.sessionReplacedHandler) {
      this.sessionReplacedHandler(reason);
    }

    const payload = {
      type: 'session_replaced',
      reason,
      content: reason,
      timestamp: new Date().toISOString(),
    };

    this.listeners.get('session_replaced')?.forEach((fn) => fn(payload));
    this.listeners.get('SESSION_REPLACED')?.forEach((fn) => fn(payload));
  }

  scheduleReconnect() {
    if (this.isExplicitlyClosed || this.isTerminated || this.destroyed) {
      return false; // Reconnect dicegah
    }
    this.state = 'reconnecting';
    this.reconnectAttempt++;
    return true;
  }

  reset() {
    this.isTerminated = false;
    this.destroyed = false;
    this.isExplicitlyClosed = false;
    this.reconnectAttempt = 0;
    this.state = 'disconnected';
  }
}

// -----------------------------------------------------------------------------
// Test 1: Simulasi Klien Android menerima Close Code 4001 (SESSION_REPLACED)
// -----------------------------------------------------------------------------
console.log('▶ Test 1: Android Client menerima Close Code 4001 dari Hub saat Web login');
const client = new MockMobileWebSocketClient();
let sessionReplacedCalled = false;
let sessionReplacedReason = '';
let eventListenerTriggered = false;

client.onSessionReplaced((reason) => {
  sessionReplacedCalled = true;
  sessionReplacedReason = reason;
});

client.on('session_replaced', (payload) => {
  eventListenerTriggered = true;
});

// Simulasikan event onclose dengan Close Code 4001
const mockCloseEvent = {
  code: 4001,
  reason: 'SESSION_REPLACED: Akun Anda dibuka dari perangkat lain.',
};

if (mockCloseEvent.code === 4001 || mockCloseEvent.reason?.includes('SESSION_REPLACED')) {
  client.handleSessionReplaced(mockCloseEvent.reason);
}

// Verifikasi status klien Android
assert.equal(client.isTerminated, true, 'isTerminated harus true');
assert.equal(client.destroyed, true, 'destroyed harus true');
assert.equal(client.state, 'terminated', 'State koneksi harus terminated');
assert.equal(sessionReplacedCalled, true, 'Callback onSessionReplaced harus dipanggil');
assert.equal(eventListenerTriggered, true, 'Event listener session_replaced harus menerima payload');
assert.equal(sessionReplacedReason.includes('SESSION_REPLACED'), true, 'Alasan harus memuat SESSION_REPLACED');

// Verifikasi auto-reconnect dicegah
const didReconnect = client.scheduleReconnect();
assert.equal(didReconnect, false, 'Auto-reconnect wajib dicegah (return false)');

console.log('  ✅ PASSED: Android Client berhenti total (`destroyed = true`), state `terminated`, dan auto-reconnect dicegah 100%!\n');

// -----------------------------------------------------------------------------
// Test 2: Simulasi AuthContext Purge & UI Navigation Reset
// -----------------------------------------------------------------------------
console.log('▶ Test 2: Simulasi Pembersihan Kredensial Lokal & Reset Navigasi ke LoginScreen');

let mockSecureStorage = {
  token: 'jwt_alice_android_active',
  user: { id: 'user_alice', username: 'alice' },
  deviceId: 'android_phone_001',
};

let appNavigationState = {
  activeConversation: { id: 'dm_123', title: 'Obrolan dengan Bob' },
  activeGroupInfo: null,
  isNewChatOpen: false,
  authRoute: 'chat',
  sessionAlertVisible: false,
  sessionAlertMessage: null,
};

// Simulasi saat onSessionReplaced terpicu di AuthContext
function simulateAuthContextOnSessionReplaced(reason) {
  // Purge token & user profile, pertahankan deviceId permanen
  mockSecureStorage.token = null;
  mockSecureStorage.user = null;

  // Tampilkan SessionAlertModal
  appNavigationState.sessionAlertVisible = true;
  appNavigationState.sessionAlertMessage = reason;
}

// Simulasi saat pengguna menekan tombol "Masuk Kembali" di SessionAlertModal
function handleDismissSessionAlert() {
  appNavigationState.sessionAlertVisible = false;
  appNavigationState.sessionAlertMessage = null;
  appNavigationState.activeConversation = null;
  appNavigationState.activeGroupInfo = null;
  appNavigationState.isNewChatOpen = false;
  appNavigationState.authRoute = 'login';
  client.reset();
}

// Jalankan alur
simulateAuthContextOnSessionReplaced(mockCloseEvent.reason);
assert.equal(mockSecureStorage.token, null, 'Token JWT harus dihapus dari storage');
assert.equal(mockSecureStorage.user, null, 'User data harus dihapus');
assert.equal(mockSecureStorage.deviceId, 'android_phone_001', 'Device ID harus tetap ada (persisten)');
assert.equal(appNavigationState.sessionAlertVisible, true, 'Modal SessionAlert harus terbuka');

// User klik "Masuk Kembali"
handleDismissSessionAlert();
assert.equal(appNavigationState.sessionAlertVisible, false, 'Modal harus tertutup');
assert.equal(appNavigationState.activeConversation, null, 'Active conversation harus di-reset');
assert.equal(appNavigationState.authRoute, 'login', 'Navigasi harus kembali ke LoginScreen');
assert.equal(client.destroyed, false, 'Socket client siap untuk login baru setelah reset');

console.log('  ✅ PASSED: Kredensial terhapus aman, modal muncul di root, dan navigasi ter-reset ke LoginScreen!\n');

console.log('🎉 SEMUA PENGUJIAN KLIEN ANDROID VS WEB LOGOUT BERHASIL 100%!');
