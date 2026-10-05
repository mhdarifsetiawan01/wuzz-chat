/**
 * Buffer kandidat ICE keluar milik PENELEPON.
 *
 * Server hanya meneruskan sinyal (ice_candidate) ke anggota room yang sedang terhubung. Penjawab baru masuk room saat
 * menekan "angkat", sehingga kandidat yang dikirim penelepon selama telepon berdering HILANG di server. Kandidat relay
 * (TURN) yang hilang membuat panggilan gagal tersambung pada jaringan yang tidak bisa P2P (mis. WiFi dengan client isolation).
 *
 * Solusi: tahan kandidat sampai `call_answer` diterima (penjawab pasti sudah di room), lalu kirim semuanya berurutan;
 * kandidat berikutnya langsung dikirim.
 */
export class OutgoingIceBuffer {
  private isOpen = false;
  private queue: string[] = [];

  /** Kirim langsung bila sudah dibuka, selain itu antre. */
  submit(candidate: string, send: (candidate: string) => void): void {
    if (this.isOpen) {
      send(candidate);
    } else {
      this.queue.push(candidate);
    }
  }

  /** Dipanggil saat panggilan dijawab: buka buffer dan kirim semua antrean sesuai urutan. */
  release(send: (candidate: string) => void): void {
    this.isOpen = true;
    const pending = this.queue;
    this.queue = [];
    for (const candidate of pending) send(candidate);
  }

  /** Dipanggil saat panggilan baru dimulai/berakhir. */
  reset(): void {
    this.isOpen = false;
    this.queue = [];
  }

  get pendingCount(): number {
    return this.queue.length;
  }
}
