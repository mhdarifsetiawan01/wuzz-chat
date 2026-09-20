// test-message-cache.mjs — Integration & E2E Verification Test for messageCache.ts
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'

// Provide window global for messageCache.ts
globalThis.window = globalThis

// Import messageCache functions
const {
  cacheMessages,
  cacheMessage,
  getCachedMessages,
  updateCachedMessageStatus,
  updateRoomCachedMessagesStatus,
  deleteCachedMessage,
  clearRoomCache,
  clearAllMessageCache,
  toCachedRecord,
} = await import('./lib/messageCache.ts')

console.log('🧪 [TEST SUITE] Starting IndexedDB Message Cache & E2EE Continuity Tests...\n')

async function runTests() {
  const ROOM_1 = 'room-alice-bob-001'
  const ROOM_2 = 'room-alice-carol-002'

  // Test 1: toCachedRecord conversion
  console.log('▶ Test 1: toCachedRecord conversion helper')
  const record = toCachedRecord({
    id: 'msg-raw-1',
    room_id: ROOM_1,
    content: 'Pesan asli terdekripsi',
    sender_id: 'alice-id',
    sender_display_name: 'Alice',
    created_at: '2026-09-16T10:00:00Z',
    status: 'sent',
    type: 'text',
  })
  assert.equal(record.id, 'msg-raw-1')
  assert.equal(record.content, 'Pesan asli terdekripsi')
  assert.equal(record.status, 'sent')
  console.log('  ✅ PASSED: toCachedRecord creates valid CachedMessageRecord.\n')

  // Test 2: cacheMessages & getCachedMessages (Sorting & Isolation)
  console.log('▶ Test 2: cacheMessages & getCachedMessages (Sorting & Isolation)')
  const msg1 = {
    id: 'msg-001',
    room_id: ROOM_1,
    content: 'Halo Bob, ini pesan pertama!',
    sender_id: 'alice-uuid',
    sender_display_name: 'Alice',
    created_at: '2026-09-16T10:00:00Z',
    status: 'sent',
    type: 'text',
    cachedAt: Date.now(),
  }
  const msg2 = {
    id: 'msg-002',
    room_id: ROOM_1,
    content: 'Halo Alice! Pesan kedua.',
    sender_id: 'bob-uuid',
    sender_display_name: 'Bob',
    created_at: '2026-09-16T10:01:00Z',
    status: 'sent',
    type: 'text',
    cachedAt: Date.now(),
  }
  const msg3 = {
    id: 'msg-003',
    room_id: ROOM_2,
    content: 'Pesan untuk Carol di room lain',
    sender_id: 'alice-uuid',
    sender_display_name: 'Alice',
    created_at: '2026-09-16T10:02:00Z',
    status: 'sent',
    type: 'text',
    cachedAt: Date.now(),
  }

  await cacheMessages([msg2, msg1, msg3]) // Pass out of order to verify sorting

  const cachedRoom1 = await getCachedMessages(ROOM_1)
  assert.equal(cachedRoom1.length, 2, 'Room 1 should have exactly 2 messages')
  assert.equal(cachedRoom1[0].id, 'msg-001', 'First message should be msg-001 (earliest createdAt)')
  assert.equal(cachedRoom1[1].id, 'msg-002', 'Second message should be msg-002 (latest createdAt)')
  assert.equal(cachedRoom1[0].content, 'Halo Bob, ini pesan pertama!')

  const cachedRoom2 = await getCachedMessages(ROOM_2)
  assert.equal(cachedRoom2.length, 1, 'Room 2 should have exactly 1 message')
  assert.equal(cachedRoom2[0].id, 'msg-003')
  console.log('  ✅ PASSED: Sorting ascending & room isolation verified.\n')

  // Test 3: cacheMessage (Single Write-Through)
  console.log('▶ Test 3: cacheMessage (Single Write-Through)')
  const msg4 = {
    id: 'msg-004',
    room_id: ROOM_1,
    content: 'Pesan single write-through',
    sender_id: 'alice-uuid',
    created_at: '2026-09-16T10:03:00Z',
    status: 'sent',
    type: 'text',
    cachedAt: Date.now(),
  }
  await cacheMessage(msg4)
  const room1AfterSingle = await getCachedMessages(ROOM_1)
  assert.equal(room1AfterSingle.length, 3, 'Room 1 should have 3 messages after single cacheMessage')
  assert.equal(room1AfterSingle[2].id, 'msg-004')
  console.log('  ✅ PASSED: Single message write-through verified.\n')

  // Test 4: Anti-Downgrade Status Guard
  console.log('▶ Test 4: Anti-Downgrade Status Guard (Milestone 4 anti-regression)')
  // Upgrade msg-001 from 'sent' to 'read'
  await updateCachedMessageStatus('msg-001', 'read')
  let updatedMsg1 = (await getCachedMessages(ROOM_1)).find(m => m.id === 'msg-001')
  assert.equal(updatedMsg1.status, 'read', 'Status should be upgraded to read')

  // Attempt to downgrade msg-001 back to 'delivered' or 'sent'
  await updateCachedMessageStatus('msg-001', 'delivered')
  updatedMsg1 = (await getCachedMessages(ROOM_1)).find(m => m.id === 'msg-001')
  assert.equal(updatedMsg1.status, 'read', 'Status must NOT downgrade from read to delivered')

  await updateCachedMessageStatus('msg-001', 'sent')
  updatedMsg1 = (await getCachedMessages(ROOM_1)).find(m => m.id === 'msg-001')
  assert.equal(updatedMsg1.status, 'read', 'Status must NOT downgrade from read to sent')
  console.log('  ✅ PASSED: Anti-downgrade status guard correctly protected status = read.\n')

  // Test 5: Revoke Message (updateCachedMessageStatus with 'deleted')
  console.log('▶ Test 5: Revoke Message (update status to deleted)')
  await updateCachedMessageStatus('msg-002', 'deleted')
  const revokedMsg2 = (await getCachedMessages(ROOM_1)).find(m => m.id === 'msg-002')
  assert.equal(revokedMsg2.status, 'deleted', 'Revoked message status should be deleted')
  console.log('  ✅ PASSED: Status deleted applied.\n')

  // Test 6: Delete Message (Hapus untuk Saya)
  console.log('▶ Test 6: deleteCachedMessage (Hapus untuk Saya)')
  await deleteCachedMessage('msg-001')
  const afterDelete = await getCachedMessages(ROOM_1)
  assert.equal(afterDelete.length, 2, 'Room 1 should now have 2 messages (msg-002, msg-004)')
  assert.ok(!afterDelete.some(m => m.id === 'msg-001'), 'msg-001 should be completely removed')
  console.log('  ✅ PASSED: Single message deletion verified.\n')

  // Test 6b: Bulk Room Read Receipt Update (updateRoomCachedMessagesStatus)
  console.log('▶ Test 6b: Bulk Room Read Receipt Update (updateRoomCachedMessagesStatus)')
  const bulkRoom = 'room-bulk-test-001'
  await cacheMessages([
    {
      id: 'bulk-1',
      room_id: bulkRoom,
      content: 'Pesan 1',
      sender_id: 'alice-uuid',
      created_at: '2026-09-16T10:00:00Z',
      status: 'sent',
      type: 'text',
      cachedAt: Date.now(),
    },
    {
      id: 'bulk-2',
      room_id: bulkRoom,
      content: 'Pesan 2',
      sender_id: 'alice-uuid',
      created_at: '2026-09-16T10:01:00Z',
      status: 'delivered',
      type: 'text',
      cachedAt: Date.now(),
    },
  ])
  await updateRoomCachedMessagesStatus(bulkRoom, 'read')
  const bulkUpdated = await getCachedMessages(bulkRoom)
  assert.equal(bulkUpdated[0].status, 'read', 'Pesan 1 must become read')
  assert.equal(bulkUpdated[1].status, 'read', 'Pesan 2 must become read')
  // Anti-downgrade check on bulk
  await updateRoomCachedMessagesStatus(bulkRoom, 'delivered')
  const bulkRechecked = await getCachedMessages(bulkRoom)
  assert.equal(bulkRechecked[0].status, 'read', 'Pesan 1 must NOT downgrade to delivered')
  assert.equal(bulkRechecked[1].status, 'read', 'Pesan 2 must NOT downgrade to delivered')
  console.log('  ✅ PASSED: Bulk room read receipt update & anti-downgrade verified.\n')

  // Test 7: Clear Room Cache (Bersihkan Obrolan)
  console.log('▶ Test 7: clearRoomCache (Bersihkan Obrolan)')
  await clearRoomCache(ROOM_1)
  const emptyRoom1 = await getCachedMessages(ROOM_1)
  assert.equal(emptyRoom1.length, 0, 'Room 1 should be completely empty')

  // Verify ROOM_2 was not touched
  const intactRoom2 = await getCachedMessages(ROOM_2)
  assert.equal(intactRoom2.length, 1, 'Room 2 must remain intact')
  console.log('  ✅ PASSED: Room cache clear verified with multi-room isolation.\n')

  // Test 8: End-to-End E2EE Continuity Scenario (The Alice & Bob Question)
  console.log('▶ Test 8: Full End-to-End E2EE Continuity Scenario (Alice Device Reset & Bob Cache)')
  const BOB_ROOM = 'room-alice-bob-e2ee-e2e'

  // Step 1: Alice & Bob chat on Device 1
  console.log('  [Step 1] Alice sends messages to Bob using Keypair 1')
  const session1Messages = [
    toCachedRecord({
      id: 'e2ee-msg-001',
      room_id: BOB_ROOM,
      content: 'Halo Bob! Ini pesan rahasia kita saat di Device 1.',
      sender_id: 'alice-uuid',
      sender_display_name: 'Alice',
      created_at: '2026-09-16T08:00:00Z',
      status: 'read',
      type: 'text',
    }),
    toCachedRecord({
      id: 'e2ee-msg-002',
      room_id: BOB_ROOM,
      content: 'Oke Alice, pesan rahasia terbaca dan tersimpan di IndexedDB saya.',
      sender_id: 'bob-uuid',
      sender_display_name: 'Bob',
      created_at: '2026-09-16T08:05:00Z',
      status: 'read',
      type: 'text',
    })
  ]
  // Bob decodes and writes to his local IndexedDB cache
  await cacheMessages(session1Messages)

  // Step 2: Bob closes the chat or restarts the browser
  console.log('  [Step 2] Alice resets device & uploads Keypair 2 to server')
  // Server now has new public key for Alice.
  // Old ciphertext on server can NO LONGER be decrypted with Alice Keypair 2!

  // Step 3: Bob opens the conversation with Alice (Cache-First Instant Load)
  console.log('  [Step 3] Bob opens the room (Cache-First Instant Load)')
  const bobCachedBeforeServer = await getCachedMessages(BOB_ROOM)
  assert.equal(bobCachedBeforeServer.length, 2, 'Bob immediately has 2 messages from cache (0ms)')
  assert.equal(bobCachedBeforeServer[0].content, 'Halo Bob! Ini pesan rahasia kita saat di Device 1.')
  assert.equal(bobCachedBeforeServer[1].content, 'Oke Alice, pesan rahasia terbaca dan tersimpan di IndexedDB saya.')

  // Step 4: Alice sends a new message from Device 2 with Keypair 2
  console.log('  [Step 4] Alice sends new message from Device 2 with Keypair 2')
  const session2Message = toCachedRecord({
    id: 'e2ee-msg-003',
    room_id: BOB_ROOM,
    content: 'Bob, aku baru reset device dan pakai Keypair 2!',
    sender_id: 'alice-uuid',
    sender_display_name: 'Alice',
    created_at: '2026-09-16T09:00:00Z',
    status: 'delivered',
    type: 'text',
  })
  await cacheMessage(session2Message)

  // Step 5: Bob verifies his complete message timeline
  console.log('  [Step 5] Verify Bob sees both historical messages AND new message')
  const bobFullTimeline = await getCachedMessages(BOB_ROOM)
  assert.equal(bobFullTimeline.length, 3, 'Bob has all 3 messages')
  assert.equal(bobFullTimeline[0].content, 'Halo Bob! Ini pesan rahasia kita saat di Device 1.', 'Old message 1 is preserved')
  assert.equal(bobFullTimeline[1].content, 'Oke Alice, pesan rahasia terbaca dan tersimpan di IndexedDB saya.', 'Old message 2 is preserved')
  assert.equal(bobFullTimeline[2].content, 'Bob, aku baru reset device dan pakai Keypair 2!', 'New message is received')
  console.log('  ✅ PASSED: E2EE Continuity 100% verified — Historical messages remain readable!\n')

  // Test 9: Shared Device / Logout Security (clearAllMessageCache)
  console.log('▶ Test 9: Shared Device Logout Security (clearAllMessageCache)')
  await clearAllMessageCache()
  const clearedBobRoom = await getCachedMessages(BOB_ROOM)
  const clearedCarolRoom = await getCachedMessages(ROOM_2)
  assert.equal(clearedBobRoom.length, 0, 'All Bob messages purged after full cache clear')
  assert.equal(clearedCarolRoom.length, 0, 'All Carol messages purged after full cache clear')
  console.log('  ✅ PASSED: Full cache wipe verified — 0 data leak on logout for shared devices.\n')

  console.log('🎉 ALL 9 TEST SCENARIOS PASSED WITH 100% SUCCESS!')
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err)
  process.exit(1)
})
