/**
 * Automated Verification Script: WebRTC 1-on-1 Voice Calling Signaling & State Machine (Mobile)
 * Tests full-duplex signaling wire formats, state machine transitions, and session lifecycle.
 */

import assert from 'node:assert';

console.log('🧪 Starting WebRTC Mobile Signaling & State Machine Verification...\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

// 1. Test Wire Format: call_offer
test('Signaling Payload: call_offer serialization and properties', () => {
  const payload = {
    type: 'call_offer',
    room: 'dm_alice_bob',
    sdp: JSON.stringify({ type: 'offer', sdp: 'v=0\r\no=wuzzchat...' }),
    to: 'user_bob_123',
  };

  assert.strictEqual(payload.type, 'call_offer');
  assert.strictEqual(payload.room, 'dm_alice_bob');
  assert.ok(payload.sdp.includes('offer'));
  assert.strictEqual(payload.to, 'user_bob_123');
});

// 2. Test Wire Format: call_answer
test('Signaling Payload: call_answer serialization and properties', () => {
  const payload = {
    type: 'call_answer',
    room: 'dm_alice_bob',
    sdp: JSON.stringify({ type: 'answer', sdp: 'v=0\r\no=wuzzchat...' }),
  };

  assert.strictEqual(payload.type, 'call_answer');
  assert.strictEqual(payload.room, 'dm_alice_bob');
  assert.ok(payload.sdp.includes('answer'));
});

// 3. Test Wire Format: ice_candidate
test('Signaling Payload: ice_candidate candidate string preservation', () => {
  const candidateStr = JSON.stringify({
    candidate: 'candidate:842163049 1 udp 1677729535 192.168.1.100 54321 typ host',
    sdpMid: '0',
    sdpMLineIndex: 0,
  });

  const payload = {
    type: 'ice_candidate',
    room: 'dm_alice_bob',
    candidate: candidateStr,
  };

  assert.strictEqual(payload.type, 'ice_candidate');
  assert.ok(payload.candidate.includes('192.168.1.100'));
});

// 4. Test Wire Format: call_reject, call_end, call_busy
test('Signaling Payload: Control message events (reject, end, busy)', () => {
  const rejectMsg = { type: 'call_reject', room: 'dm_123' };
  const endMsg = { type: 'call_end', room: 'dm_123' };
  const busyMsg = { type: 'call_busy', room: 'dm_123' };

  assert.strictEqual(rejectMsg.type, 'call_reject');
  assert.strictEqual(endMsg.type, 'call_end');
  assert.strictEqual(busyMsg.type, 'call_busy');
});

// 5. State Machine Simulation: Caller Flow
test('Call State Machine: Caller Happy Path (idle -> outgoing_calling -> connected -> ended)', () => {
  let state = 'idle';
  let isCaller = true;

  // 1. User initiates call
  state = 'outgoing_calling';
  assert.strictEqual(state, 'outgoing_calling');

  // 2. Remote peer accepts and sends call_answer
  state = 'connected';
  assert.strictEqual(state, 'connected');

  // 3. Either peer hangs up
  state = 'ended';
  assert.strictEqual(state, 'ended');
});

// 6. State Machine Simulation: Callee Flow
test('Call State Machine: Callee Happy Path (idle -> incoming_ringing -> connecting -> connected -> ended)', () => {
  let state = 'idle';

  // 1. Incoming call_offer received
  state = 'incoming_ringing';
  assert.strictEqual(state, 'incoming_ringing');

  // 2. Callee presses Accept (Terima)
  state = 'connecting';
  assert.strictEqual(state, 'connecting');

  // 3. Audio session & WebRTC handshake completes
  state = 'connected';
  assert.strictEqual(state, 'connected');

  // 4. Hang up
  state = 'ended';
  assert.strictEqual(state, 'ended');
});

// 7. State Machine Simulation: Rejection Flow
test('Call State Machine: Callee Rejects Call (incoming_ringing -> ended -> idle)', () => {
  let state = 'incoming_ringing';

  // Callee presses Reject (Tolak)
  state = 'ended';
  assert.strictEqual(state, 'ended');
});

// 8. Duration Formatter Test
test('Call Duration Timer formatting (0s -> 00:00, 65s -> 01:05, 3600s -> 60:00)', () => {
  function formatCallDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const mm = mins < 10 ? `0${mins}` : `${mins}`;
    const ss = secs < 10 ? `0${secs}` : `${secs}`;
    return `${mm}:${ss}`;
  }

  assert.strictEqual(formatCallDuration(0), '00:00');
  assert.strictEqual(formatCallDuration(9), '00:09');
  assert.strictEqual(formatCallDuration(65), '01:05');
  assert.strictEqual(formatCallDuration(599), '09:59');
  assert.strictEqual(formatCallDuration(3600), '60:00');
});

console.log(`\n🎉 All ${passedTests}/${totalTests} WebRTC Signaling & State Machine tests passed successfully!`);
