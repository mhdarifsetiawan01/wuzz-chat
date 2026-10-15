'use strict';
// Unduhan video ke cache persisten (mediaCache.downloadToCache): hanya berkas lengkap berstatus 200 yang tersimpan,
// dan unduhan bersamaan untuk pesan yang sama berbagi satu pekerjaan (tidak ada unduhan ganda).
const assert = require('assert');
const { state, loadFresh } = require('./_harness');

const { mediaCache, MediaDownloadError } = loadFresh(['services/mediaCache.ts']).mediaCache;
const URL = 'https://media.contoh.id/video/abc.mp4';
const fs = state.fs;
const reset = () => {
  fs.files.clear();
  fs.downloads = 0;
  fs.download = null;
  mediaCache.memoryCache.clear();
};
const parts = () => [...fs.files.keys()].filter((k) => k.endsWith('.part'));
const rejectsWith = async (promise, code) => {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof MediaDownloadError, 'harus MediaDownloadError, dapat: ' + err);
    assert.equal(err.code, code);
    return;
  }
  assert.fail('seharusnya melempar MediaDownloadError(' + code + ')');
};

(async () => {
  // 1. sukses: tersimpan di nama akhir, .part hilang, progres berakhir di 1, panggilan kedua memakai cache
  reset();
  const seen = [];
  fs.download = async (_u, _d, cb) => {
    cb({ totalBytesWritten: 500, totalBytesExpectedToWrite: 1000 });
    return { status: 200, size: 1000 };
  };
  const uri = await mediaCache.downloadToCache(URL, 'msg-1', 'klip.mp4', { expectedSize: 1000, onProgress: (p) => seen.push(p) });
  assert.ok(uri.endsWith('media_msg-1.mp4'), uri);
  assert.ok(fs.files.has(uri) && parts().length === 0);
  assert.deepEqual(seen, [0.5, 1]);
  assert.equal(await mediaCache.downloadToCache(URL, 'msg-1', 'klip.mp4', { expectedSize: 1000 }), uri);
  assert.equal(fs.downloads, 1);
  console.log('1. berkas lengkap 200              : tersimpan sekali, progres 0.5 lalu 1, panggilan ke-2 dari cache');

  // 2. 404 (berkas kedaluwarsa di server): TIDAK tersimpan sebagai media rusak
  reset();
  fs.download = async () => ({ status: 404, size: 220 });
  await rejectsWith(mediaCache.downloadToCache(URL, 'msg-2', 'klip.mp4'), 'expired');
  assert.equal(fs.files.size, 0);
  console.log('2. status 404                      : galat expired, tidak ada berkas tersisa');

  // 3. ukuran tidak cocok (unduhan terpotong)
  reset();
  fs.download = async () => ({ status: 200, size: 700 });
  await rejectsWith(mediaCache.downloadToCache(URL, 'msg-3', 'klip.mp4', { expectedSize: 1000 }), 'incomplete');
  assert.equal(fs.files.size, 0);
  console.log('3. ukuran 700 dari 1000            : galat incomplete, berkas dibuang');

  // 4. berkas kosong
  reset();
  fs.download = async () => ({ status: 200, size: 0 });
  await rejectsWith(mediaCache.downloadToCache(URL, 'msg-4', 'klip.mp4'), 'incomplete');
  assert.equal(fs.files.size, 0);
  console.log('4. status 200 tapi 0 byte          : galat incomplete');

  // 5. jaringan putus (pengecualian)
  reset();
  fs.download = async () => {
    throw new Error('Network request failed');
  };
  await rejectsWith(mediaCache.downloadToCache(URL, 'msg-5', 'klip.mp4'), 'failed');
  assert.equal(fs.files.size, 0);
  console.log('5. jaringan putus                  : galat failed, tidak ada berkas .part tersisa');

  // 6. dua ketukan bersamaan = satu unduhan
  reset();
  let release;
  const gate = new Promise((r) => (release = r));
  fs.download = async () => {
    await gate;
    return { status: 200, size: 1000 };
  };
  const a = mediaCache.downloadToCache(URL, 'msg-6', 'klip.mp4', { expectedSize: 1000 });
  const b = mediaCache.downloadToCache(URL, 'msg-6', 'klip.mp4', { expectedSize: 1000 });
  release();
  const [ua, ub] = await Promise.all([a, b]);
  assert.equal(ua, ub);
  assert.equal(fs.downloads, 1);
  console.log('6. dua ketukan bersamaan           : satu unduhan, hasil sama');

  // 7. setelah gagal, percobaan ulang bisa berhasil (tidak macet di pekerjaan lama)
  reset();
  fs.download = async () => ({ status: 500, size: 10 });
  await rejectsWith(mediaCache.downloadToCache(URL, 'msg-7', 'klip.mp4'), 'failed');
  fs.download = async () => ({ status: 200, size: 1000 });
  const ok = await mediaCache.downloadToCache(URL, 'msg-7', 'klip.mp4', { expectedSize: 1000 });
  assert.ok(fs.files.has(ok));
  console.log('7. gagal lalu coba lagi            : berhasil');
  console.log('OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
