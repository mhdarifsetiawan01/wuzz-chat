'use strict';
/**
 * WuzzChat Mobile - harness uji unit tanpa perangkat/emulator.
 *
 * Mentranspile modul TypeScript ASLI di `src/` ke CommonJS lalu menjalankannya di Node dengan modul native
 * (expo-sqlite, expo-secure-store, expo-crypto, react-native) diganti tiruan dalam memori. Dengan begitu logika
 * penyimpanan, antrean, dan kunci diuji pada kode yang sama dengan yang dikirim ke HP.
 *
 * Hasil transpile ditulis ke `node_modules/.cache/wuzz-unit-tests` (diabaikan git; juga membuat `@noble/*`
 * ditemukan lewat resolusi Node biasa tanpa NODE_PATH).
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const nodeCrypto = require('crypto');
const ts = require('typescript');

const SRC_ROOT = path.resolve(__dirname, '../../src');
const OUT_ROOT = path.resolve(__dirname, '../../node_modules/.cache/wuzz-unit-tests');

/** Keadaan tiruan yang dibagi antar-"cold start": SecureStore tetap ada walau modul dimuat ulang. */
const state = { secureStore: new Map(), sqliteDb: null, googleNative: null };

let stubsInstalled = false;
function installNativeStubs() {
  if (stubsInstalled) return;
  stubsInstalled = true;
  const original = Module._load;
  Module._load = function (request, ...rest) {
    switch (request) {
      case 'expo-crypto':
        return {
          getRandomBytes: (n) => new Uint8Array(nodeCrypto.randomBytes(n)),
          getRandomValues: (arr) => nodeCrypto.getRandomValues(arr),
        };
      case 'expo-secure-store':
        return {
          AFTER_FIRST_UNLOCK: 'afu',
          isAvailableAsync: async () => true,
          // SecureStore asli hanya menerima [A-Za-z0-9._-] pada nama kunci
          setItemAsync: async (k, v) => {
            if (!/^[A-Za-z0-9._-]+$/.test(k)) throw new Error('nama kunci SecureStore tidak valid: ' + k);
            state.secureStore.set(k, v);
          },
          getItemAsync: async (k) => (state.secureStore.has(k) ? state.secureStore.get(k) : null),
          deleteItemAsync: async (k) => {
            state.secureStore.delete(k);
          },
        };
      case 'react-native':
        return { Platform: { OS: 'android' } };
      case 'react-native-nitro-google-signin':
        // null = modul native tidak ada pada build ini (require gagal seperti di build lama)
        if (!state.googleNative) throw Object.assign(new Error("Cannot find module 'react-native-nitro-google-signin'"), { code: 'MODULE_NOT_FOUND' });
        return state.googleNative;
      case 'expo-sqlite':
        return { openDatabaseAsync: async () => state.sqliteDb };
      default:
        return original.call(this, request, ...rest);
    }
  };
}

/**
 * Transpile satu berkas `src/<file>` ke OUT_ROOT. Opsi `tapEcdh` menyisipkan panggilan `global.__ecdhTap()` pada
 * setiap ECDH P-256 sungguhan (objek `p256` milik noble beku sehingga tidak bisa di-patch saat runtime).
 */
function compile(file, { tapEcdh = false } = {}) {
  let js = ts.transpileModule(fs.readFileSync(path.join(SRC_ROOT, file), 'utf8'), {
    compilerOptions: { module: 'commonjs', target: 'es2020', esModuleInterop: true },
  }).outputText;
  if (tapEcdh) {
    const before = js;
    js = js.replace(
      /(\w+)\.p256\.getSharedSecret\(/g,
      (_m, ns) => `(global.__ecdhTap && global.__ecdhTap(), ${ns}.p256.getSharedSecret.bind(${ns}.p256))(`
    );
    if (before === js) throw new Error('penanda ECDH gagal disisipkan di ' + file);
  }
  const out = path.join(OUT_ROOT, file.replace(/\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, js);
  return out;
}

/**
 * Muat modul dalam keadaan "baru dibuka" (cache modul dibuang), meniru cold start aplikasi.
 * `files` adalah daftar berkas TS relatif terhadap `src/`; hasilnya dipetakan menurut nama dasar (tanpa ekstensi).
 */
function loadFresh(files, options = {}) {
  installNativeStubs();
  const result = {};
  const outs = files.map((f) => compile(f, options[f] || {}));
  for (const out of outs) delete require.cache[out];
  files.forEach((f, i) => {
    result[path.basename(f, '.ts')] = require(outs[i]);
  });
  return result;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { state, loadFresh, sleep, SRC_ROOT };
