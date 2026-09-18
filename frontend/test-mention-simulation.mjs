/**
 * TEST SIMULASI FRONTEND CLIENT: MENTION ENGINE & IMMUTABLE DATA VERIFICATION (MILESTONE 8.5)
 * 
 * Menguji seluruh aturan logika mention multi-user:
 * 1. Resolusi @username ke UUID immutable (DEC-013).
 * 2. Multi-mention dalam 1 pesan.
 * 3. Filter autocomplete tidak menampilkan self-user (m.user_id !== currentUserId).
 * 4. Isolasi lingkup: mention pengguna di luar anggota grup/subgrup diabaikan.
 * 5. Tag rendering: hanya tag milik user sendiri yang menerima class highlight self-mention.
 */

const log = {
  step: (n, msg) => console.log(`\n\x1b[36m[STEP ${n}]\x1b[0m ${msg}`),
  success: (msg) => console.log(`  \x1b[32m[PASS] ✅ ${msg}\x1b[0m`),
  fail: (msg) => console.log(`  \x1b[31m[FAIL] ❌ ${msg}\x1b[0m`),
  info: (msg) => console.log(`  \x1b[33m[INFO] ℹ️ ${msg}\x1b[0m`),
}

function runTests() {
  console.log('='.repeat(70))
  console.log('🧪 MEMULAI TEST UNIT & SIMULASI FRONTEND MENTION ENGINE (8.5)')
  console.log('='.repeat(70))

  let passed = 0
  let failed = 0

  const assert = (condition, msg) => {
    if (condition) {
      log.success(msg)
      passed++
    } else {
      log.fail(msg)
      failed++
    }
  }

  // Mock data pengguna dengan UUID immutable
  const userAlice = { user_id: 'uuid-alice-001', username: 'alice_wuzz', display_name: 'Alice Wonder' }
  const userBob = { user_id: 'uuid-bob-002', username: 'bob_the_builder', display_name: 'Bob Builder' }
  const userCharlie = { user_id: 'uuid-charlie-003', username: 'charlie_brown', display_name: 'Charlie Brown' }
  const userOutsider = { user_id: 'uuid-outsider-999', username: 'hacker_dave', display_name: 'Dave Outsider' }

  // Grup room beranggotakan Alice & Bob
  const groupMembers = [userAlice, userBob]

  // Subgrup room beranggotakan hanya Bob & Charlie
  const subgroupMembers = [userBob, userCharlie]

  // =========================================================================
  // TEST 1: Autocomplete filtering & Self Exclusion
  // =========================================================================
  log.step(1, 'Filter Autocomplete & Self-Exclusion Berbasis UUID Immutable')
  {
    const currentUserId = userAlice.user_id
    const eligible = groupMembers.filter(m => m.user_id !== currentUserId)
    
    assert(eligible.length === 1, 'Hanya 1 anggota yang eligible untuk di-mention oleh Alice')
    assert(eligible[0].user_id === userBob.user_id, 'Anggota eligible adalah Bob (UUID cocok)')
    assert(!eligible.some(m => m.user_id === userAlice.user_id), 'Alice tidak muncul di list autocomplete dirinya sendiri')
  }

  // =========================================================================
  // TEST 2: Deteksi Trigger @ dan Pencarian Teks
  // =========================================================================
  log.step(2, 'Deteksi Trigger @ dan Filter Query Autocomplete')
  {
    const testCases = [
      { text: 'Halo @bob', query: 'bob', shouldTrigger: true },
      { text: 'Halo @', query: '', shouldTrigger: true },
      { text: 'email@domain.com', query: null, shouldTrigger: false },
      { text: 'Cek ini @b', query: 'b', shouldTrigger: true },
    ]

    for (const tc of testCases) {
      const match = tc.text.match(/(?:^|\s)@([a-zA-Z0-9_.-]*)$/)
      if (tc.shouldTrigger) {
        assert(match !== null && match[1] === tc.query, `Trigger aktif untuk "${tc.text}" dengan query "${tc.query}"`)
      } else {
        assert(match === null, `Trigger tidak aktif untuk "${tc.text}" (bukan format mention)`)
      }
    }
  }

  // =========================================================================
  // TEST 3: Multi-Mention Extraction & UUID Resolution (DEC-013)
  // =========================================================================
  log.step(3, 'Multi-Mention Extraction & Resolusi ke UUID Immutable')
  {
    const messageText = 'Halo @bob_the_builder dan @alice_wuzz tolong cek @hacker_dave'
    const members = [userAlice, userBob] // hacker_dave bukan anggota
    const currentUserId = userAlice.user_id

    const mentionMatches = messageText.match(/@([a-zA-Z0-9_.-]+)/g) || []
    const finalMentions = []
    const seen = new Set()

    for (const match of mentionMatches) {
      const uname = match.slice(1).toLowerCase()
      let uid = null
      const found = members.find(m => m.username.toLowerCase() === uname)
      if (found && found.user_id !== currentUserId) {
        uid = found.user_id
      }
      if (uid && !seen.has(uid)) {
        seen.add(uid)
        finalMentions.push(uid)
      }
    }

    assert(finalMentions.length === 1, 'Hanya Bob yang berhasil di-mention')
    assert(finalMentions[0] === userBob.user_id, 'Mention berisi UUID Bob (bukan username/display_name)')
    assert(!finalMentions.includes(userAlice.user_id), 'Self user (Alice) tidak masuk ke daftar mentions')
    assert(!finalMentions.includes(userOutsider.user_id), 'Outsider (hacker_dave) tidak masuk ke daftar mentions')
  }

  // =========================================================================
  // TEST 4: Isolasi Subgrup (Forum Topic) vs Grup Utama
  // =========================================================================
  log.step(4, 'Isolasi Lingkup Subgrup vs Grup Induk')
  {
    // Di Subgrup hanya Bob & Charlie yang bergabung. Alice di grup induk tapi belum join subgrup.
    const messageText = 'Halo @alice_wuzz dan @charlie_brown'
    const currentUserId = userBob.user_id

    const mentionMatches = messageText.match(/@([a-zA-Z0-9_.-]+)/g) || []
    const finalMentions = []

    for (const match of mentionMatches) {
      const uname = match.slice(1).toLowerCase()
      const found = subgroupMembers.find(m => m.username.toLowerCase() === uname)
      if (found && found.user_id !== currentUserId) {
        finalMentions.push(found.user_id)
      }
    }

    assert(finalMentions.length === 1, 'Hanya Charlie yang berhasil di-mention di subgrup')
    assert(finalMentions[0] === userCharlie.user_id, 'Mention subgrup berisi UUID Charlie')
    assert(!finalMentions.includes(userAlice.user_id), 'Alice (bukan member subgrup) tidak dapat di-mention')
  }

  // =========================================================================
  // TEST 5: Render Tag & Self-Mention Highlight Precision
  // =========================================================================
  log.step(5, 'Presisi Highlight Linimasa & Self-Mention Tag (.mention-tag-self)')
  {
    // Skenario: Pesan menyebut @bob_the_builder dan @charlie_brown
    const content = 'Meeting dengan @bob_the_builder dan @charlie_brown jam 2'
    const mentions = [userBob.user_id, userCharlie.user_id]
    const members = [userAlice, userBob, userCharlie]

    // Jika Bob yang melihat pesan:
    const bobSelfId = userBob.user_id
    const isBubbleMentionedForBob = Boolean(bobSelfId && mentions.includes(bobSelfId))
    assert(isBubbleMentionedForBob === true, 'Bob mendeteksi bubble memiliki highlight cyan message-bubble-mentioned')

    const parts = content.split(/(@[a-zA-Z0-9_.-]+)/g)
    const renderedSpans = parts.filter(p => p.startsWith('@')).map(part => {
      const tagUname = part.slice(1).toLowerCase()
      const member = members.find(m => m.username.toLowerCase() === tagUname)
      const isSelfTag = Boolean(bobSelfId && member && member.user_id === bobSelfId)
      return { part, isSelfTag }
    })

    const bobTag = renderedSpans.find(s => s.part === '@bob_the_builder')
    const charlieTag = renderedSpans.find(s => s.part === '@charlie_brown')

    assert(bobTag.isSelfTag === true, 'Tag @bob_the_builder di-highlight sebagai self-mention untuk Bob')
    assert(charlieTag.isSelfTag === false, 'Tag @charlie_brown TIDAK di-highlight sebagai self-mention untuk Bob')
  }

  console.log('\n' + '='.repeat(70))
  console.log(`🏁 HASIL TEST FRONTEND MENTION SIMULATION: ${passed} PASS, ${failed} FAIL`)
  console.log('='.repeat(70))

  if (failed > 0) {
    process.exit(1)
  }
}

runTests()
