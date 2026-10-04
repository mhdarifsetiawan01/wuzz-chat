/**
 * Pelacak indikator "sedang mengetik". Server hanya meneruskan event `typing` (tanpa event berhenti),
 * jadi tiap pengetik kedaluwarsa sendiri setelah `ttlMs` kecuali event berikutnya datang; juga dihapus
 * seketika saat pesannya masuk. Logika murni (tanpa React) agar bisa diuji unit.
 */

export class TypingTracker {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly names = new Map<string, string>();

  constructor(
    private readonly ttlMs: number,
    private readonly onChange: (names: string[]) => void
  ) {}

  /** Tandai `key` sedang mengetik; event berulang hanya memperpanjang waktu tanpa memicu render. */
  mark(key: string, name: string): void {
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    const changed = this.names.get(key) !== name;
    this.names.set(key, name);
    this.timers.set(key, setTimeout(() => this.remove(key), this.ttlMs));
    if (changed) this.emit();
  }

  remove(key: string): void {
    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
    if (this.names.delete(key)) this.emit();
  }

  /** Hentikan semua timer tanpa memicu onChange (dipanggil saat unmount / ganti room). */
  dispose(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.names.clear();
  }

  private emit(): void {
    this.onChange(Array.from(this.names.values()));
  }
}

/** Teks status untuk header: DM tanpa nama, grup menyebut nama (1-2 orang) atau jumlahnya. */
export function describeTypers(names: string[], isDirect: boolean): string {
  if (names.length === 0) return '';
  if (isDirect) return 'sedang mengetik';
  const shown = names.map((n) => n || 'Seseorang');
  if (shown.length === 1) return `${shown[0]} sedang mengetik`;
  if (shown.length === 2) return `${shown[0]} dan ${shown[1]} sedang mengetik`;
  return `${shown.length} orang sedang mengetik`;
}

/**
 * Batas anggota grup agar klien mengirim event `typing`. Tiap event diteruskan server ke N-1 anggota
 * (plus satu Publish Redis bila cluster aktif), dan satu pengetik mengirim ±3-5 event per pesan, jadi
 * indikator melipatgandakan beban penyiaran di grup besar. Disetujui: 30 anggota.
 */
export const TYPING_MAX_GROUP_MEMBERS = 30;

/** DM selalu mengirim. Grup hanya bila jumlah anggota DIKETAHUI (> 0) dan <= batas. */
export function shouldSendTyping(isDirect: boolean, memberCount: number): boolean {
  if (isDirect) return true;
  return memberCount > 0 && memberCount <= TYPING_MAX_GROUP_MEMBERS;
}

/**
 * Kunci identitas pengetik dari event `typing` / `message` server: `from` (ID pengguna; nickname tidak
 * dijamin unik). Mengembalikan null bila event tanpa pengirim atau milik pengguna sendiri: server juga
 * meneruskan event typing ke perangkat LAIN milik pengirim yang sama, sehingga tanpa penyaringan ini
 * perangkat kedua menampilkan "sedang mengetik" untuk dirinya sendiri.
 */
export function typerKey(event: { from?: unknown; sender_id?: unknown } | null | undefined, selfId: string): string | null {
  const id = String(event?.from || event?.sender_id || '');
  if (!id) return null;
  if (selfId && id === selfId) return null;
  return id;
}
