'use strict';
// Pesan optimistik + jawaban server: video harus memakai media_url jarak jauh (thumbnail diturunkan darinya),
// gambar tetap mempertahankan yang lokal (tidak berkedip).
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { mergeOptimisticWithServer: merge } = loadFresh(['utils/optimisticMerge.ts']).optimisticMerge;
const { getVideoThumbnailUrl } = loadFresh(['utils/videoMedia.ts']).videoMedia;

const REMOTE = 'https://media.wuzzhub.id/video/abc.mp4';
const LOCAL = 'file:///data/user/0/app/cache/ImagePicker/x.mp4';

// 1. video: media_url server menang, pratinjau lokal dipertahankan, thumbnail jarak jauh bisa diturunkan
let out = merge(
  { id: 'r1', media_type: 'video', media_url: LOCAL, local_thumb_uri: 'file:///t.jpg', status: 'sending' },
  { id: 'srv1', media_type: 'video', media_url: REMOTE, status: 'sent' }
);
assert.equal(out.id, 'srv1');
assert.equal(out.media_url, REMOTE);
assert.equal(out.local_thumb_uri, 'file:///t.jpg');
assert.equal(getVideoThumbnailUrl(out.media_url), 'https://media.wuzzhub.id/video/abc.thumb.jpg');
console.log('1. video                : media_url server dipakai, local_thumb_uri dipertahankan, thumbnail dapat diturunkan');

// 2. gambar: media_url lokal optimistik dipertahankan (perilaku lama)
out = merge(
  { id: 'r2', media_type: 'image', media_url: 'file:///photo.jpg' },
  { id: 'srv2', media_type: 'image', media_url: 'https://media.wuzzhub.id/abc.jpg' }
);
assert.equal(out.media_url, 'file:///photo.jpg');
assert.equal(out.local_thumb_uri, undefined);
console.log('2. gambar               : media_url lokal tetap (tidak berkedip)');

// 3. video tanpa media_url dari server: jatuh ke yang optimistik
out = merge({ id: 'r3', media_type: 'video', media_url: LOCAL }, { id: 'srv3', media_type: 'video' });
assert.equal(out.media_url, LOCAL);
console.log('3. video tanpa URL server: memakai yang optimistik');

// 4. id kosong dari server: pakai id optimistik; teks biasa tidak punya media
out = merge({ id: 'r4', content: 'halo' }, { id: '', content: 'halo' });
assert.equal(out.id, 'r4');
assert.equal(out.media_url, undefined);
console.log('4. tanpa media          : id optimistik dipakai, tidak ada media_url');
console.log('OK');
