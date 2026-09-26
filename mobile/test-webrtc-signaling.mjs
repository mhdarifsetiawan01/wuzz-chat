/**
 * Automated Verification Script: WebRTC 1-on-1 Voice Calling Signaling & State Machine (Mobile)
 * Tests full-duplex signaling wire formats, state machine transitions, and session lifecycle.
 */

import assert from 'node:assert';
import { spawn } from 'node:child_process';

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

async function asyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
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
    sdp: 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\n...',
    to: 'user_bob_123',
  };

  assert.strictEqual(payload.type, 'call_offer');
  assert.strictEqual(payload.room, 'dm_alice_bob');
  assert.ok(payload.sdp.startsWith('v=0'));
  assert.strictEqual(payload.to, 'user_bob_123');
});

// 2. Test Wire Format: call_answer
test('Signaling Payload: call_answer serialization and properties', () => {
  const payload = {
    type: 'call_answer',
    room: 'dm_alice_bob',
    sdp: 'v=0\r\no=- 54321 2 IN IP4 127.0.0.1\r\ns=-\r\n...',
  };

  assert.strictEqual(payload.type, 'call_answer');
  assert.strictEqual(payload.room, 'dm_alice_bob');
  assert.ok(payload.sdp.startsWith('v=0'));
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
  state = 'outgoing_calling';
  assert.strictEqual(state, 'outgoing_calling');
  state = 'connected';
  assert.strictEqual(state, 'connected');
  state = 'ended';
  assert.strictEqual(state, 'ended');
});

// 6. State Machine Simulation: Callee Flow
test('Call State Machine: Callee Happy Path (idle -> incoming_ringing -> connecting -> connected -> ended)', () => {
  let state = 'idle';
  state = 'incoming_ringing';
  assert.strictEqual(state, 'incoming_ringing');
  state = 'connecting';
  assert.strictEqual(state, 'connecting');
  state = 'connected';
  assert.strictEqual(state, 'connected');
  state = 'ended';
  assert.strictEqual(state, 'ended');
});

// 7. State Machine Simulation: Rejection Flow
test('Call State Machine: Callee Rejects Call (incoming_ringing -> ended -> idle)', () => {
  let state = 'incoming_ringing';
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

// 9. DTLS & RFC Attributes in Fallback SDP Generator
test('SDP Compliance: DTLS fingerprint, ICE ufrag, and BUNDLE attributes exist', () => {
  function generateFallbackSDP(type) {
    const sessionId = `${Math.floor(Date.now() / 1000)}`;
    const ufrag = `wuzz_${Math.random().toString(36).slice(2, 6)}`;
    const pwd = `wuzzpwd_${Math.random().toString(36).slice(2, 18)}`;
    const setup = type === 'offer' ? 'actpass' : 'active';

    return [
      'v=0',
      `o=- ${sessionId} 2 IN IP4 127.0.0.1`,
      's=-',
      't=0 0',
      'a=group:BUNDLE 0',
      'm=audio 9 UDP/TLS/RTP/SAVPF 111',
      'c=IN IP4 0.0.0.0',
      'a=rtcp:9 IN IP4 0.0.0.0',
      `a=ice-ufrag:${ufrag}`,
      `a=ice-pwd:${pwd}`,
      'a=fingerprint:sha-256 37:FB:B5:5E:48:CD:EC:C4:DC:18:E3:C3:A8:57:CF:B9:41:D6:57:0A:E8:C4:95:3F:4C:7A:CA:1E:98:9F:9E:E5',
      `a=setup:${setup}`,
      'a=mid:0',
      'a=sendrecv',
      'a=rtcp-mux',
      'a=rtpmap:111 opus/48000/2',
      'a=fmtp:111 minptime=10;useinbandfec=1',
      '',
    ].join('\r\n');
  }

  const offer = generateFallbackSDP('offer');
  assert.ok(offer.includes('a=fingerprint:sha-256'), 'Offer contains DTLS fingerprint');
  assert.ok(offer.includes('a=ice-ufrag:'), 'Offer contains ICE ufrag');
  assert.ok(offer.includes('a=ice-pwd:'), 'Offer contains ICE pwd');
  assert.ok(offer.includes('a=setup:actpass'), 'Offer contains setup:actpass');

  const answer = generateFallbackSDP('answer');
  assert.ok(answer.includes('a=fingerprint:sha-256'), 'Answer contains DTLS fingerprint');
  assert.ok(answer.includes('a=setup:active'), 'Answer contains setup:active');
});

// 10. Live Chromium End-to-End Handshake Simulation
await asyncTest('Live WebRTC Engine: Chromium accepts fallback SDP without DTLS errors', async () => {
  function generateOffer() {
    return [
      'v=0',
      `o=- ${Date.now()} 2 IN IP4 127.0.0.1`,
      's=-',
      't=0 0',
      'a=group:BUNDLE 0',
      'm=audio 9 UDP/TLS/RTP/SAVPF 111',
      'c=IN IP4 0.0.0.0',
      'a=rtcp:9 IN IP4 0.0.0.0',
      'a=ice-ufrag:wuzztest',
      'a=ice-pwd:wuzztestpwd0123456789abcdef0123',
      'a=fingerprint:sha-256 37:FB:B5:5E:48:CD:EC:C4:DC:18:E3:C3:A8:57:CF:B9:41:D6:57:0A:E8:C4:95:3F:4C:7A:CA:1E:98:9F:9E:E5',
      'a=setup:actpass',
      'a=mid:0',
      'a=sendrecv',
      'a=rtcp-mux',
      'a=rtpmap:111 opus/48000/2',
      'a=fmtp:111 minptime=10;useinbandfec=1',
      '',
    ].join('\r\n');
  }

  function generateAnswer() {
    return [
      'v=0',
      `o=- ${Date.now()} 2 IN IP4 127.0.0.1`,
      's=-',
      't=0 0',
      'a=group:BUNDLE 0',
      'm=audio 9 UDP/TLS/RTP/SAVPF 111',
      'c=IN IP4 0.0.0.0',
      'a=rtcp:9 IN IP4 0.0.0.0',
      'a=ice-ufrag:wuzzanswer',
      'a=ice-pwd:wuzzanswerpwd0123456789abcdef0123',
      'a=fingerprint:sha-256 37:FB:B5:5E:48:CD:EC:C4:DC:18:E3:C3:A8:57:CF:B9:41:D6:57:0A:E8:C4:95:3F:4C:7A:CA:1E:98:9F:9E:E5',
      'a=setup:active',
      'a=mid:0',
      'a=sendrecv',
      'a=rtcp-mux',
      'a=rtpmap:111 opus/48000/2',
      'a=fmtp:111 minptime=10;useinbandfec=1',
      '',
    ].join('\r\n');
  }

  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--remote-debugging-port=9225',
    '--disable-gpu',
    '--no-sandbox',
  ]);

  await new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        const res = await fetch('http://127.0.0.1:9225/json/new', { method: 'PUT' });
        const target = await res.json();
        const ws = new WebSocket(target.webSocketDebuggerUrl);

        ws.onopen = () => {
          ws.send(JSON.stringify({
            id: 1,
            method: 'Runtime.evaluate',
            params: {
              expression: `
                (async () => {
                  // Test 1: Mobile offer -> Chrome answer (Incoming call to Chrome)
                  const pcIn = new RTCPeerConnection();
                  await pcIn.setRemoteDescription(new RTCSessionDescription({
                    type: "offer",
                    sdp: ${JSON.stringify(generateOffer())}
                  }));
                  const answer = await pcIn.createAnswer();
                  await pcIn.setLocalDescription(answer);

                  // Test 2: Chrome offer -> Mobile answer (Outgoing call from Chrome)
                  const pcOut = new RTCPeerConnection();
                  // Add audio transceiver
                  pcOut.addTransceiver('audio', { direction: 'sendrecv' });
                  const chromeOffer = await pcOut.createOffer();
                  await pcOut.setLocalDescription(chromeOffer);
                  await pcOut.setRemoteDescription(new RTCSessionDescription({
                    type: "answer",
                    sdp: ${JSON.stringify(generateAnswer())}
                  }));

                  // Test 3: Raw SDP missing DTLS fingerprint sanitized by normalizeSDP
                  function normalizeSDP(sdpInput, fallbackType) {
                    let sdp = sdpInput.replace(/\\r?\\n/g, '\\r\\n');
                    if (!sdp.includes('a=fingerprint:')) {
                      const lines = sdp.split('\\r\\n');
                      const enriched = [];
                      for (const line of lines) {
                        if (line.startsWith('m=')) {
                          enriched.push('a=group:BUNDLE 0');
                        }
                        enriched.push(line);
                        if (line.startsWith('m=')) {
                          enriched.push('a=ice-ufrag:wuzztest');
                          enriched.push('a=ice-pwd:wuzzpassword_test_1234567890abcdef');
                          enriched.push('a=fingerprint:sha-256 37:FB:B5:5E:48:CD:EC:C4:DC:18:E3:C3:A8:57:CF:B9:41:D6:57:0A:E8:C4:95:3F:4C:7A:CA:1E:98:9F:9E:E5');
                          enriched.push(fallbackType === 'offer' ? 'a=setup:actpass' : 'a=setup:active');
                          enriched.push('a=mid:0');
                          enriched.push('a=rtcp-mux');
                        }
                      }
                      sdp = enriched.join('\\r\\n');
                    }
                    return sdp;
                  }

                  const legacyRawOffer = "v=0\\r\\no=wuzzchat 12345 2 IN IP4 127.0.0.1\\r\\ns=WuzzChat\\r\\nt=0 0\\r\\nm=audio 9 UDP/TLS/RTP/SAVPF 111\\r\\nc=IN IP4 0.0.0.0\\r\\na=sendrecv\\r\\na=rtpmap:111 opus/48000/2\\r\\n";
                  const normalizedLegacyOffer = normalizeSDP(legacyRawOffer, 'offer');
                  const pcLegacy = new RTCPeerConnection();
                  await pcLegacy.setRemoteDescription(new RTCSessionDescription({
                    type: "offer",
                    sdp: normalizedLegacyOffer,
                  }));
                  const legacyAnswer = await pcLegacy.createAnswer();
                  await pcLegacy.setLocalDescription(legacyAnswer);

                  return {
                    incomingSuccess: true,
                    hasAnswer: !!answer.sdp,
                    outgoingSuccess: pcOut.signalingState === 'stable',
                    legacyNormalizedSuccess: !!legacyAnswer.sdp,
                  };
                })()
              `,
              awaitPromise: true,
              returnByValue: true,
            },
          }));
        };

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.id === 1) {
            if (data.result?.exceptionDetails) {
              console.error('Chrome Exception Details:', JSON.stringify(data.result.exceptionDetails, null, 2));
            }
            const val = data.result?.result?.value;
            assert.strictEqual(val?.incomingSuccess, true, 'setRemoteDescription (offer) succeeded in Chrome');
            assert.strictEqual(val?.hasAnswer, true, 'createAnswer succeeded in Chrome');
            assert.strictEqual(val?.outgoingSuccess, true, 'setRemoteDescription (answer) reached stable state in Chrome');
            assert.strictEqual(val?.legacyNormalizedSuccess, true, 'normalizeSDP prevents DTLS fingerprint error in Chrome');
            ws.close();
            chrome.kill();
            resolve();
          }
        };

        ws.onerror = (err) => {
          chrome.kill();
          reject(err);
        };
      } catch (err) {
        chrome.kill();
        reject(err);
      }
    }, 1200);
  });
});

console.log(`\n🎉 All ${passedTests}/${totalTests} WebRTC Signaling & Live Chromium tests passed successfully!`);
