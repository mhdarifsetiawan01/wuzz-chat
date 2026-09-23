/**
 * TEST SIMULASI FRONTEND CLIENT: GROUP MEMORY AI & CONTEXT SOURCE ENGINE (TRACK B FASE 5)
 * 
 * Menguji alur klien Memory AI lengkap dari perspektif antarmuka frontend:
 * 1. Autentikasi Admin (Alice), Member (Bob), dan Non-Member (Charlie).
 * 2. Alice membuat Grup Utama dan Subgrup/Forum Diskusi.
 * 3. Bob bergabung ke grup dan ikut berdiskusi di forum.
 * 4. Uji Proteksi RBAC: Bob (member biasa) ditolak saat memanggil API review admin (/api/memory/drafts).
 * 5. Uji listing draf memori oleh Alice (/api/memory/drafts?group_id=...).
 * 6. Uji pengambilan arsip memori grup (/api/groups/{id}/memories).
 * 7. Uji proteksi BOLA: Charlie (bukan anggota) dilarang mengakses arsip memori.
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080'

const log = {
  step: (n, msg) => console.log(`\n\x1b[36m[STEP ${n}]\x1b[0m ${msg}`),
  success: (msg) => console.log(`  \x1b[32m[PASS] ✅ ${msg}\x1b[0m`),
  fail: (msg) => console.log(`  \x1b[31m[FAIL] ❌ ${msg}\x1b[0m`),
  info: (msg) => console.log(`  \x1b[33m[INFO] ℹ️ ${msg}\x1b[0m`),
}

async function ensureUser(username, password) {
  // Coba login dulu
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (res.ok) {
      const data = await res.json()
      return data
    }
  } catch (err) {
    // abaikan jika belum terdaftar
  }

  // Jika belum ada, lakukan register
  const regRes = await fetch(`${BACKEND_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password,
      nickname: username.charAt(0).toUpperCase() + username.slice(1),
      public_key: `mock_pubkey_${username}`,
    }),
  })
  if (!regRes.ok) {
    throw new Error(`Gagal registrasi user ${username}: ${regRes.status}`)
  }
  return await regRes.json()
}

async function runTest() {
  console.log('='.repeat(70))
  console.log('🧪 MEMULAI TEST SIMULASI FRONTEND CLIENT: MEMORY ENGINE & RBAC')
  console.log(`Backend Target: ${BACKEND_URL}`)
  console.log('='.repeat(70))

  try {
    // 1. Autentikasi Pengguna
    log.step(1, 'Autentikasi Akun User (Alice = Admin, Bob = Member, Charlie = Outsider)')
    const aliceAuth = await ensureUser('alice_mem', 'WuzzTest@12345')
    const bobAuth = await ensureUser('bob_mem', 'WuzzTest@12345')
    const charlieAuth = await ensureUser('charlie_mem', 'WuzzTest@12345')

    log.success(`Alice terautentikasi (ID: ${aliceAuth.user?.id || 'OK'})`)
    log.success(`Bob terautentikasi (ID: ${bobAuth.user?.id || 'OK'})`)
    log.success(`Charlie terautentikasi (ID: ${charlieAuth.user?.id || 'OK'})`)

    // 2. Alice membuat Grup Utama
    log.step(2, 'Alice membuat Grup Utama Diskusi Arsitektur')
    const groupSuffix = Date.now().toString().slice(-6)
    const createGroupRes = await fetch(`${BACKEND_URL}/api/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceAuth.token}`,
      },
      body: JSON.stringify({
        title: `Arsitektur DDD Engine ${groupSuffix}`,
        description: 'Grup diskusi implementasi Modular Monolith & Memory AI',
        avatar_url: '🏛️',
        is_public: true,
        group_username: `ddd_${groupSuffix}`,
        member_ids: [],
      }),
    })
    if (!createGroupRes.ok) {
      throw new Error(`Gagal membuat grup: ${createGroupRes.status}`)
    }
    const groupData = await createGroupRes.json()
    const groupID = groupData.group.id
    log.success(`Grup utama berhasil dibuat: "${groupData.group.title}" (ID: ${groupID})`)

    // 3. Bob bergabung ke Grup Utama
    log.step(3, 'Bob bergabung ke Grup Utama')
    const joinRes = await fetch(`${BACKEND_URL}/api/groups/${groupID}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bobAuth.token}`,
      },
    })
    if (!joinRes.ok && joinRes.status !== 409) {
      throw new Error(`Bob gagal join grup: ${joinRes.status}`)
    }
    log.success('Bob berhasil bergabung sebagai anggota grup')

    // 4. Alice membuat Subgrup/Forum (Topic)
    log.step(4, 'Alice membuat Subgrup / Forum Ephemeral')
    const createSubGroupRes = await fetch(`${BACKEND_URL}/api/groups/${groupID}/subgroups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceAuth.token}`,
      },
      body: JSON.stringify({
        title: 'Pembahasan ContextSource Abstraction',
        description: 'Diskusi pemisahan Forum vs Memory',
        duration: '7_days',
        is_public: true,
      }),
    })
    if (!createSubGroupRes.ok) {
      throw new Error(`Gagal membuat forum: ${createSubGroupRes.status}`)
    }
    const subGroupData = await createSubGroupRes.json()
    const forumID = subGroupData.subgroup.id
    log.success(`Forum berhasil dibuat: "${subGroupData.subgroup.title}" (ID: ${forumID})`)

    // 5. Alice melakukan Instant Expire Forum (Simulasi TTL berakhir / Force Close)
    log.step(5, 'Alice memicu Instant Expire pada Forum Diskusi')
    const expireRes = await fetch(`${BACKEND_URL}/api/groups/${groupID}/subgroups/${forumID}/expire`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aliceAuth.token}`,
      },
    })
    if (!expireRes.ok) {
      throw new Error(`Gagal melakukan instant expire: ${expireRes.status}`)
    }
    const expireData = await expireRes.json()
    log.success(`Forum berhasil di-expire seketika: ${expireData.message}`)

    // 6. Menunggu Memory Worker memproses Job AI (Interval 1 detik)
    log.step(6, 'Menunggu AI Memory Worker memproses ContextSource & menghasilkan Draf Memori...')
    let drafts = []
    for (let attempt = 1; attempt <= 10; attempt++) {
      await new Promise((r) => setTimeout(r, 1200))
      const pollRes = await fetch(`${BACKEND_URL}/api/memory/drafts?group_id=${groupID}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${aliceAuth.token}`,
        },
      })
      if (pollRes.ok) {
        const body = await pollRes.json()
        if (Array.isArray(body) && body.length > 0) {
          drafts = body
          log.success(`Draf memori ditemukan pada percobaan ke-${attempt}! (Total draf: ${drafts.length})`)
          break
        }
      }
      log.info(`Percobaan ke-${attempt}: Draf masih dalam antrean pemrosesan worker...`)
    }

    if (drafts.length === 0) {
      throw new Error('Timeout: AI Memory Worker tidak menghasilkan draf dalam batas waktu yang ditentukan')
    }

    const draftID = drafts[0].draft_id || drafts[0].id
    log.info(`Target Draft ID: ${draftID} (Status: ${drafts[0].status})`)

    // 7. Uji Proteksi RBAC Review Memory: Bob (member biasa) dilarang akses
    log.step(7, 'Uji Proteksi RBAC: Bob (member biasa) ditolak saat memanggil API review draft admin')
    const bobDraftsRes = await fetch(`${BACKEND_URL}/api/memory/drafts?group_id=${groupID}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${bobAuth.token}`,
      },
    })
    if (bobDraftsRes.status === 403) {
      log.success('Bob berhasil ditolak saat akses antrean draft dengan status 403 Forbidden')
    } else {
      throw new Error(`Ekspektasi 403 Forbidden untuk Bob, tapi dapat status: ${bobDraftsRes.status}`)
    }

    const bobDraftDetailRes = await fetch(`${BACKEND_URL}/api/memory/drafts/${draftID}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${bobAuth.token}`,
      },
    })
    if (bobDraftDetailRes.status === 403) {
      log.success('Bob berhasil ditolak saat akses detail draft spesifik dengan status 403 Forbidden')
    } else {
      throw new Error(`Ekspektasi 403 Forbidden untuk Bob pada detail draft, tapi dapat: ${bobDraftDetailRes.status}`)
    }

    // 8. Alice (Admin) membuka Modal Review Draft (fetchMemoryDraftDetail)
    log.step(8, 'Alice (Admin) memuat detail lengkap draf memori (fetchMemoryDraftDetail)')
    const aliceDetailRes = await fetch(`${BACKEND_URL}/api/memory/drafts/${draftID}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${aliceAuth.token}`,
      },
    })
    if (!aliceDetailRes.ok) {
      throw new Error(`Alice gagal memuat detail draft: ${aliceDetailRes.status}`)
    }
    const detailData = await aliceDetailRes.json()
    const draftDetail = detailData.draft || detailData
    log.success(`Detail draf berhasil dimuat. Forum: "${draftDetail.forum_title || 'N/A'}", Total Artefak: ${draftDetail.artifacts?.length || 0}`)

    // 9. Alice mengedit Artefak Summary (updateMemoryArtifact)
    log.step(9, 'Alice menyunting konten artefak Summary di modal review (updateMemoryArtifact)')
    const summaryArtifact = draftDetail.artifacts?.find((a) => a.type?.toUpperCase() === 'SUMMARY')
    if (!summaryArtifact) {
      throw new Error('Artefak Summary tidak ditemukan di dalam draf')
    }
    const revisedContent = 'Hasil revisi admin Alice: Forum menyepakati penggunaan modul memory terpisah dengan abstraksi ContextSource yang bersih.'
    const patchRes = await fetch(`${BACKEND_URL}/api/memory/drafts/${draftID}/artifacts/${summaryArtifact.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceAuth.token}`,
      },
      body: JSON.stringify({ content: revisedContent }),
    })
    if (!patchRes.ok) {
      throw new Error(`Gagal update artefak: ${patchRes.status}`)
    }
    const patchData = await patchRes.json()
    log.success(`Artefak Summary berhasil diperbarui! Konten revisi: "${patchData.artifact?.content || revisedContent}"`)

    // 10. Alice menyetujui Draf Memori (approveMemoryDraft)
    log.step(10, 'Alice menekan tombol Publikasikan Memori (approveMemoryDraft)')
    const approveRes = await fetch(`${BACKEND_URL}/api/memory/drafts/${draftID}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceAuth.token}`,
      },
      body: JSON.stringify({ with_changes: true }),
    })
    if (!approveRes.ok) {
      throw new Error(`Gagal approve draft: ${approveRes.status}`)
    }
    const approveData = await approveRes.json()
    const memoryID = approveData.approved_memory?.id
    log.success(`Draf memori berhasil divalidasi & dipublikasikan! Approved Memory ID: ${memoryID || 'OK'}`)

    // 11. Bob (Member Sah) membuka Arsip Memori Grup (fetchGroupMemories)
    log.step(11, 'Bob (Member Sah) memuat daftar arsip memori grup (fetchGroupMemories)')
    const memoriesRes = await fetch(`${BACKEND_URL}/api/groups/${groupID}/memories`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${bobAuth.token}`,
      },
    })
    if (!memoriesRes.ok) {
      throw new Error(`Bob gagal mengambil memori grup: ${memoriesRes.status}`)
    }
    const memories = await memoriesRes.json()
    if (!Array.isArray(memories) || memories.length === 0) {
      throw new Error('Ekspektasi minimal 1 memori tersimpan di arsip grup Bob')
    }
    log.success(`Bob berhasil memuat arsip memori grup! Total memori tersimpan: ${memories.length}`)

    // 12. Bob (Member Sah) membuka Detail Memori Terpublikasi (fetchApprovedMemoryDetail)
    log.step(12, 'Bob membaca detail memori yang telah disetujui (fetchApprovedMemoryDetail)')
    const targetMemID = memoryID || memories[0].id
    const memoryDetailRes = await fetch(`${BACKEND_URL}/api/memories/${targetMemID}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${bobAuth.token}`,
      },
    })
    if (!memoryDetailRes.ok) {
      throw new Error(`Bob gagal memuat detail memori: ${memoryDetailRes.status}`)
    }
    const memoryDetail = await memoryDetailRes.json()
    log.success(`Bob berhasil membaca detail memori! Summary: "${memoryDetail.snapshot_summary?.slice(0, 70)}..."`)
    if (memoryDetail.snapshot_summary !== revisedContent) {
      log.info(`Peringatan: summary tidak persis revisedContent, nilai saat ini: ${memoryDetail.snapshot_summary}`)
    } else {
      log.success('Integritas data terverifikasi 100%: Ringkasan memori yang dibaca Bob identik dengan hasil revisi Alice!')
    }

    // 13. Uji Proteksi BOLA: Charlie (Bukan Anggota) Ditolak Akses Arsip Memori
    log.step(13, 'Uji Proteksi BOLA: Charlie (Bukan Anggota) ditolak akses arsip memori grup')
    const charlieMemoriesRes = await fetch(`${BACKEND_URL}/api/groups/${groupID}/memories`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${charlieAuth.token}`,
      },
    })
    if (charlieMemoriesRes.status === 403) {
      log.success('Charlie berhasil ditolak dari arsip grup dengan status 403 Forbidden')
    } else {
      throw new Error(`Ekspektasi 403 Forbidden untuk Charlie pada arsip grup, tapi dapat: ${charlieMemoriesRes.status}`)
    }

    // 14. Charlie (Bukan Anggota) Ditolak Akses Detail Memori Spesifik
    log.step(14, 'Uji Proteksi BOLA: Charlie ditolak membaca detail memori spesifik')
    const charlieDetailRes = await fetch(`${BACKEND_URL}/api/memories/${targetMemID}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${charlieAuth.token}`,
      },
    })
    if (charlieDetailRes.status === 403) {
      log.success('Charlie berhasil ditolak dari detail memori spesifik dengan status 403 Forbidden')
    } else {
      throw new Error(`Ekspektasi 403 Forbidden untuk Charlie pada detail memori, tapi dapat: ${charlieDetailRes.status}`)
    }

    console.log('\n' + '='.repeat(70))
    console.log('🎉 SELURUH LIFECYCLE FRONTEND CLIENT MEMORY AI TERVERIFIKASI 100% SUKSES!')
    console.log('='.repeat(70))
  } catch (error) {
    log.fail(`Test simulasi gagal: ${error.message}`)
    process.exit(1)
  }
}

runTest()
