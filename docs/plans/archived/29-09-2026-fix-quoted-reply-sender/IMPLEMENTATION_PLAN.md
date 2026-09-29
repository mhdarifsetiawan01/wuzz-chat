# Implementation Plan: Perbaikan Nama Pengirim pada Fitur Quoted Reply Mobile

## 🎯 1. Objective
Memperbaiki bug tampilan quoted reply preview di mobile di mana User ID / UUID pengirim (`sender_id` / `from`) ditampilkan alih-alih nama pengirim asli, serta memastikan bahwa:
1. Membalas pesan sendiri menampilkan **"Membalas ke Anda"**.
2. Membalas pesan lawan bicara (1-on-1 direct message) menampilkan nama kontak / judul obrolan (misal: **"Membalas ke Dwi Rahayu Kartikasari"**).
3. Membalas pesan grup menampilkan nama panggilan anggota yang valid (`replyTo.nickname`) dan tidak pernah menampilkan string mentah UUID.
4. Quoted reply card di pesan (`MessageBubble.tsx`) terlindungi dari tampilan UUID mentah jika ada data riwayat lama.

## 📁 2. Target Modified Files
1. `mobile/src/components/ChatInputBar.tsx`:
   - Tambahkan prop `replySenderName?: string` ke `ChatInputBarProps`.
   - Update baris 349 untuk menggunakan `replySenderName || (replyTo.nickname && !isUUID(replyTo.nickname) ? replyTo.nickname : 'Pengguna')` (hapus `replyTo.from`).
2. `mobile/src/screens/ChatScreen.tsx`:
   - Buat helper `getMessageSenderName(msg: Message | null): string` yang menangani `isSelf` ("Anda"), `isDirect` (`title`), dan `msg.nickname` (non-UUID).
   - Oper `replySenderName={getMessageSenderName(replyingTo)}` ke `ChatInputBar`.
   - Perbarui pembuatan `replyPayload` (pada pesan teks & media) agar `nickname` yang dikirim ke server/database selalu nama manusia yang rapi (`senderName || 'Pengguna'`), bukan UUID.
3. `mobile/src/components/MessageBubble.tsx`:
   - Tambahkan guard anti-UUID pada tampilan nama quoted message card (`message.reply_to.nickname`).
4. `frontend/app/chat/MessageInput.tsx`:
   - Sesuaikan tampilan banner agar menampilkan "Anda" jika membalas pesan sendiri (`isSelfReply`).

## 🧪 3. Verification Strategy
1. Automated type check di mobile: `cd mobile && npx tsc --noEmit`.
2. Automated build di frontend: `cd frontend && npm run build`.
3. Automated test di backend: `cd backend && go test -v ./...`.
