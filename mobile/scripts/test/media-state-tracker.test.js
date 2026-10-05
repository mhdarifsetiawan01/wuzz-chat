'use strict';
// Status media panggilan: batas waktu 25 dtk, pemulihan terlambat, state 'new'/'closed' diabaikan, tanpa emisi ganda.
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { mediaStateTracker } = loadFresh(['services/webrtcService.ts', 'utils/mediaStateTracker.ts']);
const { MediaStateTracker, MEDIA_CONNECT_TIMEOUT_MS } = mediaStateTracker;

// Timer & jam palsu (maju manual)
function harness() {
  let t = 1000;
  const timers = new Map();
  let nextId = 1;
  const events = [];
  const tracker = new MediaStateTracker((s) => events.push(s.state + (s.connectedAt ? '@' + s.connectedAt : '')), {
    timeoutMs: 25000,
    now: () => t,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn, at: t + ms });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
  });
  const advance = (ms) => {
    t += ms;
    for (const [id, { fn, at }] of [...timers]) {
      if (at <= t) {
        timers.delete(id);
        fn();
      }
    }
  };
  return { tracker, events, advance, timers };
}

assert.strictEqual(MEDIA_CONNECT_TIMEOUT_MS, 25000);

// 1) Tidak tersambung sama sekali: connecting -> failed tepat setelah 25 dtk
{
  const { tracker, events, advance } = harness();
  tracker.arm();
  assert.deepStrictEqual(events, ['connecting']);
  advance(24999);
  assert.deepStrictEqual(events, ['connecting'], 'belum gagal sebelum 25 dtk');
  advance(1);
  assert.deepStrictEqual(events, ['connecting', 'failed'], 'gagal tepat 25 dtk');
}

// 2) Tersambung sebelum batas: timer dibatalkan, tidak pernah gagal
{
  const { tracker, events, advance, timers } = harness();
  tracker.arm();
  advance(3000);
  tracker.onPeerState('connecting');
  tracker.onPeerState('connected');
  assert.strictEqual(timers.size, 0, 'timer dibatalkan saat tersambung');
  advance(60000);
  assert.deepStrictEqual(events, ['connecting', 'connected@4000']);
  assert.strictEqual(tracker.msToConnect, 3000);
}

// 3) ICE gagal lebih cepat dari batas: langsung failed, timer dibatalkan
{
  const { tracker, events, advance, timers } = harness();
  tracker.arm();
  advance(10000);
  tracker.onPeerState('failed');
  assert.strictEqual(timers.size, 0);
  assert.deepStrictEqual(events, ['connecting', 'failed']);
  advance(60000);
  assert.deepStrictEqual(events, ['connecting', 'failed'], 'tidak ada emisi ganda');
}

// 4) Gagal karena batas waktu lalu media tersambung terlambat: pulih ke connected
{
  const { tracker, events, advance } = harness();
  tracker.arm();
  advance(25000);
  tracker.onPeerState('connected');
  assert.deepStrictEqual(events, ['connecting', 'failed', 'connected@26000']);
}

// 5) disconnected sebelum pernah tersambung: tampil disconnected, batas waktu tetap berjalan -> failed
{
  const { tracker, events, advance } = harness();
  tracker.arm();
  tracker.onPeerState('connecting');
  tracker.onPeerState('disconnected');
  assert.deepStrictEqual(events, ['connecting', 'disconnected']);
  advance(25000);
  assert.deepStrictEqual(events, ['connecting', 'disconnected', 'failed']);
}

// 6) Tersambung sebelum arm (callee): tetap connected, tidak ada timer yang menjatuhkannya
{
  const { tracker, events, advance, timers } = harness();
  tracker.onPeerState('connected');
  tracker.arm();
  assert.strictEqual(timers.size, 0);
  advance(60000);
  assert.deepStrictEqual(events, ['connected@1000']);
}

// 7) 'new', 'closed', dan nilai asing diabaikan; state sama tidak diemisikan ulang
{
  const { tracker, events } = harness();
  tracker.arm();
  tracker.onPeerState('new');
  tracker.onPeerState('closed');
  tracker.onPeerState('???');
  tracker.onPeerState('connecting');
  tracker.onPeerState('connecting');
  assert.deepStrictEqual(events, ['connecting']);
}

// 8) reset(): panggilan baru mulai bersih, timer lama tidak bocor
{
  const { tracker, events, advance, timers } = harness();
  tracker.arm();
  tracker.reset();
  assert.strictEqual(timers.size, 0);
  advance(60000);
  assert.deepStrictEqual(events, ['connecting'], 'timer lama dibatalkan oleh reset');
  // panggilan baru setelah reset: status 'connecting' diterbitkan lagi (UI panggilan baru harus mulai dari awal)
  tracker.arm();
  assert.deepStrictEqual(events, ['connecting', 'connecting']);
  advance(25000);
  assert.deepStrictEqual(events, ['connecting', 'connecting', 'failed'], 'batas waktu panggilan baru tetap berlaku');
}

console.log('media-state-tracker: batas 25 dtk, pembatalan, ICE failed, pemulihan terlambat, disconnected, sebelum-arm, abaikan new/closed, reset');
