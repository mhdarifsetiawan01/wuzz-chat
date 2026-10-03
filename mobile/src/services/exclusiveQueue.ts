/**
 * WuzzChat Mobile - exclusiveQueue
 * Antrean FIFO yang menjalankan task async satu per satu.
 *
 * Dipakai sqliteStorage untuk menyerialkan seluruh operasi TULIS pada koneksi SQLite tunggal.
 * expo-sqlite tidak mengisolasi withTransactionAsync pada koneksi yang sama: dua transaksi
 * bersamaan menghasilkan "cannot start a transaction within a transaction" / "cannot rollback -
 * no transaction is active", dan satu pernyataan dari konteks lain bisa menyusup ke transaksi
 * yang sedang terbuka (ikut ter-rollback).
 *
 * Aturan: TIDAK reentrant. Task yang sedang berjalan tidak boleh `await` task lain dari antrean
 * yang sama (deadlock); pecah logikanya menjadi helper internal tanpa kunci.
 */

export type ExclusiveRunner = <T>(task: () => Promise<T>) => Promise<T>;

export function createExclusiveQueue(): ExclusiveRunner {
  let tail: Promise<void> = Promise.resolve();

  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task);
    // Kegagalan satu task tidak boleh memblokir task berikutnya; error tetap sampai ke pemanggilnya lewat `run`
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}
