/**
 * Scenario 4: Spike Test — Login Burst (Auth Rate Limiter Test)
 *
 * Simulasi: 50 user login bersamaan dalam 5 detik.
 * Menguji:
 *   - Ketahanan endpoint /api/auth/login terhadap lonjakan tiba-tiba
 *   - Apakah rate limiter (15 req/menit/IP) berfungsi
 *   - Apakah Supabase DB pool bisa menangani spike koneksi
 *
 * Jalankan:
 *   k6 run scenario-4-spike-login.js --out json=results/scenario-4.json
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { TEST_USERS, API_LOGIN, API_REGISTER } from './config.js';

const loginSuccess   = new Rate('wuzz_spike_login_success');
const loginDuration  = new Trend('wuzz_spike_login_duration_ms', true);
const rateLimited    = new Counter('wuzz_spike_rate_limited_429');
const serverErrors   = new Counter('wuzz_spike_server_errors_5xx');

export const options = {
  scenarios: {
    // Phase 1: Baseline — 5 user normal
    baseline: {
      executor:  'constant-vus',
      vus:       5,
      duration:  '30s',
      startTime: '0s',
    },
    // Phase 2: Spike — 50 user sekaligus
    spike: {
      executor:  'ramping-arrival-rate',
      startRate: 5,
      timeUnit:  '1s',
      preAllocatedVUs: 60,
      stages: [
        { duration: '5s',  target: 50 }, // Naik tiba-tiba ke 50 req/detik
        { duration: '20s', target: 50 }, // Tahan spike
        { duration: '5s',  target: 5  }, // Kembali normal
      ],
      startTime: '30s',
    },
    // Phase 3: Pemulihan — apakah server recover?
    recovery: {
      executor:  'constant-vus',
      vus:       5,
      duration:  '30s',
      startTime: '60s',
    },
  },
  thresholds: {
    http_req_failed:            ['rate<0.30'],   // Toleransi lebih tinggi karena rate limiter
    wuzz_spike_login_success:   ['rate>0.60'],   // 60% login berhasil saat spike
    wuzz_spike_login_duration_ms: ['p(95)<5000'], // Login < 5 detik di spike
  },
};

export default function () {
  const userIdx = __VU % TEST_USERS.length;
  const user    = TEST_USERS[userIdx];

  const start = Date.now();
  const res = http.post(
    API_LOGIN,
    JSON.stringify({ username: user.username, password: user.password }),
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: '15s',
    }
  );

  const duration = Date.now() - start;
  loginDuration.add(duration);

  if (res.status === 429) {
    rateLimited.add(1);
    console.log(`[VU ${__VU}] ⚠️ Rate limited (429) setelah ${duration}ms`);
  } else if (res.status >= 500) {
    serverErrors.add(1);
    console.error(`[VU ${__VU}] ❌ Server error ${res.status} setelah ${duration}ms`);
  }

  const ok = res.status === 200;
  loginSuccess.add(ok);

  check(res, {
    'login 200 atau rate-limited 429': (r) => r.status === 200 || r.status === 429,
    'bukan 500': (r) => r.status < 500,
  });

  sleep(0.5);
}
