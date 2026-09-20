/**
 * Scenario 1b: Direct Message — 14 Confirmed Users (Small Scale)
 *
 * Menggunakan 14 user yang sudah dikonfirmasi terdaftar di production.
 * 7 pasang DM aktif secara bersamaan, saling kirim pesan.
 *
 * Jalankan:
 *   k6 run scenario-1b-dm-14users.js --out json=results/scenario-1b.json 2>&1 | tee results/scenario-1b.txt
 */
import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { API_LOGIN, WS_URL } from './config.js';

const msgSent       = new Counter('wuzz_messages_sent');
const msgReceived   = new Counter('wuzz_messages_received');
const wsConnectTime = new Trend('wuzz_ws_connect_ms', true);

// 14 user yang sudah dikonfirmasi terdaftar
const CONFIRMED_USERS = [
  { username: 'loadtest_user_001', password: 'LoadTest@12345', display_name: 'LoadBot 1' },
  { username: 'loadtest_user_002', password: 'LoadTest@12345', display_name: 'LoadBot 2' },
  { username: 'loadtest_user_003', password: 'LoadTest@12345', display_name: 'LoadBot 3' },
  { username: 'loadtest_user_004', password: 'LoadTest@12345', display_name: 'LoadBot 4' },
  { username: 'loadtest_user_005', password: 'LoadTest@12345', display_name: 'LoadBot 5' },
  { username: 'loadtest_user_006', password: 'LoadTest@12345', display_name: 'LoadBot 6' },
  { username: 'loadtest_user_007', password: 'LoadTest@12345', display_name: 'LoadBot 7' },
  { username: 'loadtest_user_008', password: 'LoadTest@12345', display_name: 'LoadBot 8' },
  { username: 'loadtest_user_009', password: 'LoadTest@12345', display_name: 'LoadBot 9' },
  { username: 'loadtest_user_010', password: 'LoadTest@12345', display_name: 'LoadBot 10' },
  { username: 'loadtest_user_012', password: 'LoadTest@12345', display_name: 'LoadBot 12' },
  { username: 'loadtest_user_014', password: 'LoadTest@12345', display_name: 'LoadBot 14' },
  { username: 'loadtest_user_017', password: 'LoadTest@12345', display_name: 'LoadBot 17' },
  { username: 'loadtest_user_018', password: 'LoadTest@12345', display_name: 'LoadBot 18' },
];

export const options = {
  setupTimeout: '15m', // Beri waktu cukup untuk pre-login dengan rate limiter
  scenarios: {
    dm_14users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 14 }, // Ramp up ke 14 VU
        { duration: '2m',  target: 14 }, // Tahan 2 menit
        { duration: '15s', target: 0  }, // Ramp down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    wuzz_ws_connect_ms:  ['p(95)<2000'],
    wuzz_messages_sent:  ['count>100'],
  },
};

export function setup() {
  console.log('\n🔐 Setup: Pre-login 14 confirmed users...');
  const tokens = [];

  for (let i = 0; i < CONFIRMED_USERS.length; i++) {
    const user = CONFIRMED_USERS[i];
    let token = null;
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
        console.warn(`[setup] Rate limited, tunggu 65 detik...`);
        sleep(65);
      } else {
        console.error(`[setup] ${user.username} error ${res.status}`);
      }
    } while (!token && attempts < 3);

    tokens.push(token ? { token, display_name: user.display_name, index: i } : null);
    console.log(token ? `✅ ${user.username}` : `❌ ${user.username}`);

    if (i < CONFIRMED_USERS.length - 1) sleep(4.5);
  }

  const ok = tokens.filter(Boolean).length;
  console.log(`\n✅ Setup: ${ok}/14 token siap\n`);
  return { tokens };
}

export default function (data) {
  const { tokens } = data;
  const userIdx    = (__VU - 1) % tokens.length;
  const userData   = tokens[userIdx];

  if (!userData) { sleep(3); return; }

  const { token, display_name } = userData;

  // 7 pasang DM: user 0↔1, 2↔3, 4↔5, 6↔7, 8↔9, 10↔11, 12↔13
  const pairIdx = Math.floor(userIdx / 2);
  const roomID  = `dm_lt14_pair_${pairIdx}`;

  const startConnect = Date.now();
  const res = ws.connect(
    `${WS_URL}?token=${token}`,
    { headers: { 'Origin': 'https://wuzz-chat.vercel.app' } },
    function (socket) {
      wsConnectTime.add(Date.now() - startConnect);
      console.log(`[VU ${__VU}] ✅ Connected → ${roomID}`);

      socket.send(JSON.stringify({
        type:     'join',
        room:     roomID,
        nickname: display_name,
      }));

      let msgCount = 0;

      socket.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'message') msgReceived.add(1);
        } catch (_) {}
      });

      socket.setInterval(() => {
        msgCount++;
        socket.send(JSON.stringify({
          id:      `sc1b_vu${__VU}_m${msgCount}`,
          type:    'message',
          room:    roomID,
          content: `[${display_name}] pesan #${msgCount} — ${new Date().toISOString()}`,
        }));
        msgSent.add(1);
      }, 2000);

      socket.setTimeout(() => socket.close(), 130000); // 2m10s
      socket.on('error', (e) => console.error(`[VU ${__VU}] WS error: ${e}`));
    }
  );

  check(res, {
    'ws 101 connected': (r) => r && r.status === 101,
  });
  sleep(1);
}
