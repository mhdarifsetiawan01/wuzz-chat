'use strict';
const assert = require('assert');
const { loadFresh } = require('./_harness');
const { playOrReplayAudio: play } = loadFresh(['services/audioPlayback.ts']).audioPlayback;
function player(time = 0, duration = 7) {
  const calls = [];
  return { currentTime: time, duration, calls,
    seekTo: async (position) => { calls.push(`seek:${position}`); },
    play: () => calls.push('play'),
  };
}
(async () => {
  const first = player();
  assert.equal(await play(first, false, () => true), true);
  assert.deepEqual(first.calls, ['play']);
  const paused = player(3);
  await play(paused, false, () => true);
  assert.deepEqual(paused.calls, ['play'], 'pause/resume must keep position');
  const ended = player(7);
  await play(ended, false, () => true);
  assert.deepEqual(ended.calls, ['seek:0', 'play'], 'native end position needs rewind');
  const eventEnded = player(0);
  await play(eventEnded, true, () => true);
  assert.deepEqual(eventEnded.calls, ['seek:0', 'play'], 'didJustFinish wins over lagging native time');
  const cancelled = player(7);
  assert.equal(await play(cancelled, true, () => false), false);
  assert.deepEqual(cancelled.calls, []);
  let release, current = true;
  const slow = player(7);
  slow.seekTo = () => { slow.calls.push('seek:0'); return new Promise((r) => { release = r; }); };
  const pending = play(slow, true, () => current);
  assert.deepEqual(slow.calls, ['seek:0'], 'play must wait until rewind finishes');
  current = false; release();
  assert.equal(await pending, false);
  assert.deepEqual(slow.calls, ['seek:0'], 'unmount/later tap during seek must not autoplay');
  const broken = player(7);
  broken.seekTo = async () => { throw new Error('seek failed'); };
  await assert.rejects(play(broken, true, () => true));
  assert.deepEqual(broken.calls, [], 'failed rewind must not pretend playback started');
  console.log('Audio play/replay: first play, pause resume, native end, finished event, stale intent, awaited seek, cancellation and seek failure: OK');
})().catch((e) => { console.error(e); process.exitCode = 1; });
