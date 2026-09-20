/**
 * Scenario 1: Direct Message — 100 Concurrent Users
 *
 * Strategi Anti-Rate-Limiter:
 *   - setup() melakukan pre-login semua user secara sequential (1 per 4.5 detik)
 *   - Token disimpan dan diteruskan ke VU
 *   - VU langsung buka WebSocket menggunakan token (bypass rate limiter)
 *
 * Durasi setup: ~100 user × 4.5 detik = ~7.5 menit
 * Durasi test:  ~3 menit
 *
 * Jalankan:
 *   k6 run scenario-1-dm-100users.js --out json=results/scenario-1.json 2>&1 | tee results/scenario-1.txt
 */
import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { TEST_USERS, API_LOGIN, WS_URL } from './config.js';

const msgSent       = new Counter('wuzz_messages_sent');
const msgReceived   = new Counter('wuzz_messages_received');
const wsConnectTime = new Trend('wuzz_ws_connect_ms', true);
const msgLatency    = new Trend('wuzz_msg_latency_ms', true);

export const options = {
  setupTimeout: '30m', // Beri waktu cukup untuk pre-login 100 user
  scenarios: {
    dm_users: {
      executor:          'ramping-vus',
      startVUs:          0,
      stages: [
        { duration: '30s', target: 100 }, // Ramp up ke 100 user dalam 30 detik
        { duration: '2m',  target: 100 }, // Tahan selama 2 menit
        { duration: '30s', target: 0   }, // Ramp down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed:        ['rate<0.10'],
    wuzz_ws_connect_ms:     ['p(95)<3000'],
    wuzz_msg_latency_ms:    ['p(95)<1500'],
    wuzz_messages_sent:     ['count>100'],
  },
};

// =====================================================
// SETUP: Pre-login semua 100 user, hormati rate limiter
// =====================================================
export function setup() {
  const NUM_USERS = 100;
  const DELAY_MS  = 4500; // 4.5 detik antar login = ~13 req/menit (aman di bawah 15/menit)

  console.log(`\n🔐 Setup: Pre-login ${NUM_USERS} user... (estimasi ${Math.ceil(NUM_USERS * DELAY_MS / 1000 / 60)} menit)`);

  const tokens = [];

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
        try {
          token = JSON.parse(res.body).token;
        } catch (_) {}
      } else if (res.status === 429) {
        console.warn(`[setup] User ${i}: Rate limited, tunggu 65 detik...`);
        sleep(65);
      } else {
        console.error(`[setup] User ${i} (${user.username}) login error ${res.status}: ${res.body}`);
      }
    } while (!token && attempts < 4);

    if (token) {
      tokens.push({ token, username: user.username, display_name: user.display_name, index: i });
      if ((i + 1) % 10 === 0) {
        console.log(`✅ Setup progress: ${i + 1}/${NUM_USERS} user logged in`);
      }
    } else {
      console.error(`❌ Gagal login user ${user.username} setelah ${attempts} percobaan`);
      tokens.push(null);
    }

    if (i < NUM_USERS - 1) sleep(DELAY_MS / 1000);
  }

  const successCount = tokens.filter(Boolean).length;
  console.log(`\n✅ Setup selesai: ${successCount}/${NUM_USERS} token berhasil\n`);
  return { tokens };
}

// =====================================================
// TEST: Setiap VU langsung buka WebSocket pakai token
// =====================================================
export default function (data) {
  const { tokens } = data;
  const userIdx    = (__VU - 1) % tokens.length;
  const userData   = tokens[userIdx];

  if (!userData) {
    console.warn(`[VU ${__VU}] Tidak ada token untuk index ${userIdx}, skip`);
    sleep(5);
    return;
  }

  const { token, display_name } = userData;
  const pairIdx  = Math.floor(userIdx / 2);
  const roomID   = `dm_lt_pair_${pairIdx}`;

  const startConnect = Date.now();
  const res = ws.connect(
    `${WS_URL}?token=${token}`,
    { headers: { 'Origin': 'https://wuzz-chat.vercel.app' } },
    function (socket) {
      wsConnectTime.add(Date.now() - startConnect);

      socket.send(JSON.stringify({
        type:     'join',
        room:     roomID,
        nickname: display_name,
      }));

      let msgCount   = 0;
      const pendingAck = {};

      socket.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'message') {
            msgReceived.add(1);
            const sentAt = pendingAck[msg.id];
            if (sentAt) {
              msgLatency.add(Date.now() - sentAt);
              delete pendingAck[msg.id];
            }
          }
        } catch (_) {}
      });

      socket.setInterval(() => {
        msgCount++;
        const msgID = `sc1_vu${__VU}_m${msgCount}`;
        pendingAck[msgID] = Date.now();

        socket.send(JSON.stringify({
          id:      msgID,
          type:    'message',
          room:    roomID,
          content: `[VU${__VU}] pesan #${msgCount}`,
        }));
        msgSent.add(1);
      }, 2000);

      socket.setTimeout(() => socket.close(), 150000);
      socket.on('error', (e) => console.error(`[VU ${__VU}] WS error: ${e}`));
    }
  );

  check(res, { 'ws 101': (r) => r && r.status === 101 });
  sleep(1);
}
