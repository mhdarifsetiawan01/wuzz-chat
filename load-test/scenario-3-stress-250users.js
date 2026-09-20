/**
 * Scenario 3: Stress Test — Ramp Up ke 250 Concurrent Users
 *
 * Pre-login 250 user via setup(), lalu ramp up VUs secara bertahap.
 * Setiap VU pakai token yang sudah disiapkan.
 *
 * Durasi setup: ~250 × 4.5s = ~19 menit
 * Durasi test:  ~5.5 menit
 *
 * Jalankan:
 *   k6 run scenario-3-stress-250users.js --out json=results/scenario-3.json 2>&1 | tee results/scenario-3.txt
 */
import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { TEST_USERS, API_LOGIN, WS_URL, API_HEALTH } from './config.js';

const wsConnectTime = new Trend('wuzz_stress_ws_connect_ms', true);
const msgSent       = new Counter('wuzz_stress_msgs_sent');
const connFailed    = new Counter('wuzz_stress_conn_failed');
const connSuccess   = new Rate('wuzz_stress_conn_success_rate');

export const options = {
  setupTimeout: '60m', // 250 user × 4.5s = ~19 menit, plus buffer rate limit
  scenarios: {
    stress_ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m',  target: 50  }, // Normal
        { duration: '1m',  target: 100 }, // Medium
        { duration: '1m',  target: 150 }, // High
        { duration: '1m',  target: 200 }, // Very high
        { duration: '1m',  target: 250 }, // Extreme
        { duration: '30s', target: 0   }, // Ramp down
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    wuzz_stress_conn_success_rate: ['rate>0.60'],
    wuzz_stress_ws_connect_ms:     ['p(95)<8000'],
  },
};

export function setup() {
  const NUM_USERS = 250;
  const tokens    = [];

  console.log(`\n🔐 Setup: Pre-login ${NUM_USERS} user... (estimasi ~${Math.ceil(NUM_USERS * 4.5 / 60)} menit)`);

  for (let i = 0; i < NUM_USERS; i++) {
    const user = TEST_USERS[i];
    let token  = null;
    let attempts = 0;

    do {
      attempts++;
      const res = http.post(
        API_LOGIN,
        JSON.stringify({ username: user.username, password: user.password }),
        { headers: { 'Content-Type': 'application/json' }, timeout: '15s' }
      );

      if (res.status === 200) {
        try { token = JSON.parse(res.body).token; } catch (_) {}
      } else if (res.status === 429) {
        console.warn(`[setup] User ${i}: Rate limited, tunggu 65 detik...`);
        sleep(65);
      } else {
        console.warn(`[setup] User ${i} error ${res.status}`);
      }
    } while (!token && attempts < 4);

    tokens.push(token ? { token, display_name: user.display_name, index: i } : null);

    if ((i + 1) % 25 === 0) {
      const ok = tokens.filter(Boolean).length;
      console.log(`📊 Setup ${i + 1}/${NUM_USERS} — ${ok} token OK`);
    }

    if (i < NUM_USERS - 1) sleep(4.5);
  }

  const successCount = tokens.filter(Boolean).length;
  console.log(`\n✅ Setup done: ${successCount}/${NUM_USERS} tokens ready\n`);
  return { tokens };
}

export default function (data) {
  const { tokens } = data;
  const userIdx    = (__VU - 1) % tokens.length;
  const userData   = tokens[userIdx];

  if (!userData) {
    connFailed.add(1);
    connSuccess.add(false);
    sleep(2);
    return;
  }

  const { token, display_name } = userData;

  // Batch setiap 50 VU masuk room berbeda
  const roomBatch = Math.floor(userIdx / 50);
  const roomID    = `stress_batch_${roomBatch}`;

  const startConnect = Date.now();
  const res = ws.connect(
    `${WS_URL}?token=${token}`,
    { headers: { 'Origin': 'https://wuzz-chat.vercel.app' }, timeout: '10s' },
    function (socket) {
      wsConnectTime.add(Date.now() - startConnect);
      connSuccess.add(true);

      socket.send(JSON.stringify({
        type:     'join',
        room:     roomID,
        nickname: display_name,
      }));

      let msgCount = 0;
      socket.setInterval(() => {
        msgCount++;
        socket.send(JSON.stringify({
          id:      `stress_vu${__VU}_m${msgCount}`,
          type:    'message',
          room:    roomID,
          content: `stress ${msgCount}`,
        }));
        msgSent.add(1);
      }, 5000);

      if (__VU % 50 === 0) {
        console.log(`🔥 VU ${__VU} → ${roomID}`);
      }

      socket.setTimeout(() => socket.close(), 55000);
      socket.on('error', () => {
        connFailed.add(1);
        connSuccess.add(false);
      });
    }
  );

  const connected = res && res.status === 101;
  if (!connected) {
    connFailed.add(1);
    connSuccess.add(false);
    console.warn(`[VU ${__VU}] WS gagal: ${res ? res.status : 'timeout'}`);
  }
  sleep(1);
}
