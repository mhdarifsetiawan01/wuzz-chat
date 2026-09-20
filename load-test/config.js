// ============================================================
// Wuzz Chat — Load Test Shared Config
// ============================================================
export const BASE_URL     = 'https://wuzz-chat-backend.fly.dev';
export const WS_URL       = 'wss://wuzz-chat-backend.fly.dev/ws';
export const API_LOGIN    = `${BASE_URL}/api/auth/login`;
export const API_REGISTER = `${BASE_URL}/api/auth/register`;
export const API_HEALTH   = `${BASE_URL}/health`;

// Akun test yang sudah ada di production DB (ganti jika belum ada)
// Kalau belum ada, script scenario-0-setup.js akan register semua user ini dulu
export const TEST_USERS = Array.from({ length: 250 }, (_, i) => ({
  username: `loadtest_user_${String(i + 1).padStart(3, '0')}`,
  password: 'LoadTest@12345',
  display_name: `LoadBot ${i + 1}`,
}));

// Thresholds global yang berlaku untuk semua skenario
export const GLOBAL_THRESHOLDS = {
  http_req_failed:   ['rate<0.05'],   // Max 5% request gagal
  http_req_duration: ['p(95)<3000'],  // 95% request < 3 detik
};
