'use strict';
/**
 * Uji layanan Google Sign-In dengan kode ASLI dan modul native tiruan: tombol hanya tersedia bila client ID diisi DAN
 * modul native ada; pembatalan bukan galat; galat library diterjemahkan; konfigurasi sekali; modul native yang hilang
 * (build lama) tidak membuat aplikasi crash.
 */
const assert = require('assert');
const { state, loadFresh } = require('./_harness');

const originalWarn = console.warn;
console.warn = (...a) => {
  if (typeof a[0] === 'string' && a[0].startsWith('[googleAuth]')) return;
  originalWarn(...a);
};

/** Tiruan modul native: perilaku diatur lewat `script`, panggilan dicatat di `calls`. */
function fakeNative(script) {
  const calls = { configure: [], present: 0, signOut: 0 };
  return {
    calls,
    GoogleOneTapSignIn: {
      configure: (p) => calls.configure.push(p),
      presentExplicitSignIn: async () => {
        calls.present++;
        return script();
      },
      signOut: async () => {
        calls.signOut++;
        if (state.googleSignOutThrows) throw new Error('boom');
      },
    },
    isCancelledResponse: (r) => r.type === 'cancelled',
    isSuccessResponse: (r) => r.type === 'success' && r.data != null,
  };
}

function load(clientId) {
  const m = loadFresh(['api/config.ts', 'services/googleAuth.ts']);
  m.config.GOOGLE_AUTH_CONFIG.WEB_CLIENT_ID = clientId; // objek biasa pada runtime; di app diisi lewat berkas konfigurasi
  return m.googleAuth;
}

(async () => {
  const OK = { type: 'success', data: { idToken: 'id-token-1', user: { email: 'a@example.com', name: 'Alice' } } };

  // 1. Client ID kosong: tidak tersedia walau modul native ada, dan signIn menolak tanpa menyentuh native.
  {
    const native = (state.googleNative = fakeNative(() => OK));
    const g = load('');
    assert.strictEqual(g.isGoogleSignInAvailable(), false);
    await assert.rejects(g.signInWithGoogle(), (e) => e.name === 'GoogleAuthError' && e.code === 'NOT_CONFIGURED');
    assert.strictEqual(native.calls.present, 0, 'native tak boleh dipanggil tanpa client ID');
  }

  // 2. Modul native hilang (build lama): tidak crash, hanya tidak tersedia.
  {
    state.googleNative = null;
    const g = load('web-client.apps.googleusercontent.com');
    assert.strictEqual(g.isGoogleSignInAvailable(), false);
    await assert.rejects(g.signInWithGoogle(), (e) => e.code === 'NOT_CONFIGURED');
    await g.signOutGoogleLocal(); // tidak melempar
  }

  // 3. Sukses: identitas dikembalikan, configure hanya sekali dengan client ID yang benar, tiap panggilan memunculkan pemilih akun.
  {
    const native = (state.googleNative = fakeNative(() => OK));
    const g = load('web-client.apps.googleusercontent.com');
    assert.strictEqual(g.isGoogleSignInAvailable(), true);
    const id = await g.signInWithGoogle();
    assert.deepStrictEqual(id, { idToken: 'id-token-1', email: 'a@example.com', name: 'Alice' });
    await g.signInWithGoogle();
    assert.strictEqual(native.calls.present, 2);
    assert.strictEqual(native.calls.configure.length, 1, 'configure cukup sekali');
    assert.deepStrictEqual(native.calls.configure[0], { webClientId: 'web-client.apps.googleusercontent.com' });

    // signOut hanya setelah configure, dan galat signOut tidak pernah naik ke pemanggil.
    await g.signOutGoogleLocal();
    assert.strictEqual(native.calls.signOut, 1);
    state.googleSignOutThrows = true;
    await g.signOutGoogleLocal();
    state.googleSignOutThrows = false;
  }

  // 4. signOut sebelum pernah login tidak memanggil native.
  {
    const native = (state.googleNative = fakeNative(() => OK));
    const g = load('web-client.apps.googleusercontent.com');
    await g.signOutGoogleLocal();
    assert.strictEqual(native.calls.signOut, 0);
  }

  // 5. Pembatalan: respons cancelled dan pengecualian SIGN_IN_CANCELLED sama-sama menghasilkan null (bukan galat).
  {
    state.googleNative = fakeNative(() => ({ type: 'cancelled', data: null }));
    assert.strictEqual(await load('c').signInWithGoogle(), null);
    state.googleNative = fakeNative(() => {
      throw Object.assign(new Error('dibatalkan'), { code: 'SIGN_IN_CANCELLED' });
    });
    assert.strictEqual(await load('c').signInWithGoogle(), null);
  }

  // 6. Galat nyata diterjemahkan ke GoogleAuthError berpesan Indonesia.
  const cases = [
    ['PLAY_SERVICES_NOT_AVAILABLE', 'PLAY_SERVICES', /Play Services/],
    ['DEVELOPER_ERROR', 'DEVELOPER_ERROR', /belum dikonfigurasi/],
    ['IN_PROGRESS', 'IN_PROGRESS', /sedang berjalan/],
    ['ONE_TAP_START_FAILED', 'FAILED', /gagal/i],
    ['KODE_ASING', 'FAILED', /gagal/i],
  ];
  for (const [code, expected, re] of cases) {
    state.googleNative = fakeNative(() => {
      throw Object.assign(new Error('x'), { code });
    });
    await assert.rejects(load('c').signInWithGoogle(), (e) => e.name === 'GoogleAuthError' && e.code === expected && re.test(e.message), `kode ${code}`);
  }
  // Galat tanpa kode (mis. jaringan) juga menjadi FAILED, bukan melempar mentah.
  state.googleNative = fakeNative(() => {
    throw new Error('network');
  });
  await assert.rejects(load('c').signInWithGoogle(), (e) => e.code === 'FAILED');

  // 7. Respons sukses tanpa idToken atau "tidak ada kredensial" dianggap kegagalan, bukan pembatalan.
  for (const resp of [{ type: 'success', data: { idToken: '', user: {} } }, { type: 'noSavedCredentialFound', data: null }]) {
    state.googleNative = fakeNative(() => resp);
    await assert.rejects(load('c').signInWithGoogle(), (e) => e.code === 'FAILED');
  }

  state.googleNative = null;
  console.log('google-auth: ketersediaan, sukses, pembatalan, 5 galat terjemahan, modul hilang, signOut aman');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
