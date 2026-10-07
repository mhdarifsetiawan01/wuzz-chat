/**
 * Teks hitung mundur sisa masa aktif topik forum, mis. "23 jam lagi", "7 hari lagi", "Kedaluwarsa".
 * Modul murni (tanpa React/native) agar bisa diuji unit. Hari dibulatkan ke terdekat: topik 7 hari yang baru dibuat
 * (sisa 6 hari 23 jam) harus tampil "7 hari lagi", bukan "6 hari lagi" seperti saat dipotong ke bawah.
 */
export function formatTtlRemaining(expiresAt: string, now: number = Date.now()): string {
  const diff = new Date(expiresAt).getTime() - now;
  if (!(diff > 0)) return 'Kedaluwarsa'; // juga untuk tanggal tidak valid (NaN)

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} menit lagi`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours} jam lagi`;
  const days = Math.max(1, Math.round(diff / 86_400_000));
  return `${days} hari lagi`;
}
