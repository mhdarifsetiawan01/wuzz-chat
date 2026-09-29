# Decision Log

### DEC-001: Quoted Reply Sender Resolution
- **Problem**: `ChatInputBar.tsx` menampilkan raw UUID karena `replyTo.from` diletakkan pertama kali pada fallback chain.
- **Decision**: Sediakan prop `replySenderName` yang dihitung secara deterministik oleh `ChatScreen.tsx` dengan urutan prioritas:
  1. Jika pesan milik sendiri (`isSelf`) -> "Anda"
  2. Jika chat 1-on-1 direct (`isDirect`) -> nama lawan bicara (`title` / `conversation.peer_nickname`)
  3. Jika grup -> `msg.nickname` (jika bukan UUID valid)
  4. Fallback -> "Pengguna"
- **Rationale**: Mencegah kebocoran internal ID/UUID ke UI dan memberikan pengalaman WhatsApp/Telegram yang natural.
