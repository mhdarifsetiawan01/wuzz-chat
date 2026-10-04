/**
 * Pesan sistem (anggota bergabung/keluar, perubahan role, dsb.) dikirim server dengan pengirim
 * `server` dan nama "Sistem" (backend/internal/ws/hub.go). Klien merendernya sebagai pil di tengah,
 * bukan bubble percakapan.
 */

interface SystemMessageSource {
  type?: string | null;
  from?: string | null;
  sender_id?: string | null;
}

export function isSystemMessage(message: SystemMessageSource): boolean {
  return message.type === 'system' || message.from === 'server' || message.sender_id === 'server';
}
