/**
 * Scenario 0: Setup — Register semua 250 test user ke production
 *
 * Jalankan SEKALI sebelum skenario lain:
 *   k6 run scenario-0-setup.js
 *
 * Menggunakan 1 VU + jeda 5 detik antar request untuk menghindari rate limiter
 * (rate limiter production: 15 req/menit per IP).
 * Estimasi durasi: ~250 * 5s = ~21 menit (atau lebih cepat jika user sudah ada).
 *
 * Tips: Jika mau lebih cepat, bisa jalankan dari 2 terminal dengan BATCH berbeda.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { TEST_USERS, API_REGISTER } from './config.js';

export const options = {
  vus: 1,           // 1 VU untuk menghormati rate limiter per IP
  iterations: 250,  // Total 250 user
  thresholds: {
    // Boleh gagal karena user sudah terdaftar (409 OK)
    http_req_failed: ['rate<0.5'],
  },
};

export default function () {
  const user = TEST_USERS[__ITER % TEST_USERS.length];

  let res;
  let attempts = 0;

  // Retry jika kena 429 rate limit
  do {
    attempts++;
    res = http.post(
      API_REGISTER,
      JSON.stringify({
        username:     user.username,
        password:     user.password,
        display_name: user.display_name,
      }),
      { headers: { 'Content-Type': 'application/json' }, timeout: '15s' }
    );

    if (res.status === 429) {
      console.warn(`[iter ${__ITER}] Rate limited (429), tunggu 65 detik lalu retry...`);
      sleep(65); // Tunggu window rate limiter reset (1 menit + buffer)
    }
  } while (res.status === 429 && attempts < 3);

  const ok = res.status === 201 || res.status === 409;
  if (res.status === 201) {
    console.log(`✅ [iter ${__ITER}] Registered: ${user.username}`);
  } else if (res.status === 409) {
    console.log(`⏭️  [iter ${__ITER}] Already exists: ${user.username}`);
  } else {
    console.error(`❌ [iter ${__ITER}] Error ${res.status}: ${user.username} — ${res.body}`);
  }

  check(res, {
    'registered or already exists': () => ok,
  });

  // Jeda 5 detik antar register = ~12 req/menit (aman di bawah limit 15/menit)
  sleep(5);
}
