/**
 * Scenario 2: Group Chat — 10 User dalam 1 Grup Aktif
 *
 * setup() pre-login 10 user, lalu semua join ke 1 room dan saling kirim pesan.
 *
 * Jalankan:
 *   k6 run scenario-2-group-10users.js --out json=results/scenario-2.json 2>&1 | tee results/scenario-2.txt
 */
import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { TEST_USERS, API_LOGIN, WS_URL } from './config.js';

const msgSent          = new Counter('wuzz_group_msgs_sent');
const msgReceived      = new Counter('wuzz_group_msgs_received');
const broadcastLatency = new Trend('wuzz_group_broadcast_ms', true);
const broadcastSuccess = new Rate('wuzz_group_broadcast_success');

export const options = {
  setupTimeout: '10m',
  scenarios: {
    group_chat: {
      executor: 'constant-vus',
      vus:      10,
      duration: '3m',
    },
  },
  thresholds: {
    wuzz_group_msgs_sent:        ['count>50'],
    wuzz_group_msgs_received:    ['count>200'],
    wuzz_group_broadcast_ms:     ['p(95)<2000'],
    wuzz_group_broadcast_success:['rate>0.90'],
  },
};

const GROUP_ROOM = 'grp_lt_group_alpha';

export function setup() {
  const NUM_USERS = 10;
  const tokens    = [];

  console.log(`\n🔐 Setup: Pre-login ${NUM_USERS} user untuk group test...`);

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
        console.warn(`[setup] Rate limited, tunggu 65 detik...`);
        sleep(65);
      } else {
        console.error(`[setup] Login error ${res.status}: ${res.body}`);
      }
    } while (!token && attempts < 4);

    tokens.push(token ? { token, display_name: user.display_name, index: i } : null);
    console.log(token ? `✅ ${user.username}` : `❌ ${user.username}`);

    if (i < NUM_USERS - 1) sleep(4.5);
  }

  console.log(`\n✅ Setup selesai: ${tokens.filter(Boolean).length}/${NUM_USERS} token siap\n`);
  return { tokens };
}

export default function (data) {
  const { tokens } = data;
  const userIdx    = (__VU - 1) % tokens.length;
  const userData   = tokens[userIdx];

  if (!userData) { sleep(5); return; }

  const { token, display_name } = userData;
  const sentMessages = {};

  const res = ws.connect(
    `${WS_URL}?token=${token}`,
    { headers: { 'Origin': 'https://wuzz-chat.vercel.app' } },
    function (socket) {

      socket.send(JSON.stringify({
        type:     'join',
        room:     GROUP_ROOM,
        nickname: display_name,
      }));

      socket.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'message') {
            msgReceived.add(1);
            const sentAt = sentMessages[msg.id];
            if (sentAt) {
              const latency = Date.now() - sentAt;
              broadcastLatency.add(latency);
              broadcastSuccess.add(latency < 2000);
              delete sentMessages[msg.id];
            }
          }
        } catch (_) {}
      });

      let msgCount = 0;
      // Jitter agar tidak semua kirim bersamaan
      const jitter = Math.max(1, (userIdx % 10) * 300);

      socket.setTimeout(() => {
        socket.setInterval(() => {
          msgCount++;
          const msgID = `grp_vu${__VU}_m${msgCount}`;
          sentMessages[msgID] = Date.now();

          socket.send(JSON.stringify({
            id:      msgID,
            type:    'message',
            room:    GROUP_ROOM,
            content: `[${display_name}] pesan ke-${msgCount} 💬`,
          }));
          msgSent.add(1);
        }, 3000);
      }, jitter);

      socket.setTimeout(() => socket.close(), 175000);
      socket.on('error', (e) => console.error(`[VU ${__VU}] WS error: ${e}`));
    }
  );

  check(res, { 'ws connected': (r) => r && r.status === 101 });
  sleep(1);
}
