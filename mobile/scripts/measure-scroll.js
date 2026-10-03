#!/usr/bin/env node

/**
 * WuzzChat Mobile Scroll Benchmark
 * Mengukur jank frame saat scroll di HP fisik via adb (dumpsys gfxinfo), diulang
 * beberapa kali lalu dilaporkan sebagai median/min/maks agar tidak tertipu noise.
 *
 * Prasyarat: HP tersambung via adb, aplikasi sudah terbuka di layar yang ingin diukur
 * (mis. ruang obrolan dengan riwayat panjang). Skrip hanya melakukan swipe (read-only).
 *
 * Penggunaan:
 *   node scripts/measure-scroll.js [--runs 10] [--swipes 8] [--warmup 1] [--label nama]
 *                                  [--package com.wuzzchat.mobile] [--serial <adb-serial>]
 *                                  [--screenshot <file.png>]
 *
 * Satu run = N swipe turun + N swipe naik. Run pemanasan (--warmup) dibuang dari statistik.
 * Tutup aplikasi lain di HP dulu; RAM sempit membuat hasil sangat berisik.
 * Skrip tidak tahu layar mana yang terbuka: pakai --screenshot untuk menyimpan layar awal
 * dan pastikan itu layar yang dimaksud (jumlah frame per run yang rendah = list tidak ikut bergulir).
 */

const { execFileSync } = require('child_process');

function parseArgs(argv) {
  const opts = { runs: 10, swipes: 8, warmup: 1, label: '', screenshot: '', pkg: 'com.wuzzchat.mobile', serial: '' };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split('=');
    const next = () => (inline !== undefined ? inline : argv[++i]);
    switch (flag) {
      case '--runs': opts.runs = parseInt(next(), 10); break;
      case '--swipes': opts.swipes = parseInt(next(), 10); break;
      case '--warmup': opts.warmup = parseInt(next(), 10); break;
      case '--label': opts.label = next(); break;
      case '--package': opts.pkg = next(); break;
      case '--serial': opts.serial = next(); break;
      case '--screenshot': opts.screenshot = next(); break;
      case '-h':
      case '--help':
        console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0]);
        process.exit(0);
      default:
        console.error(`Argumen tidak dikenal: ${argv[i]}`);
        process.exit(1);
    }
  }
  for (const k of ['runs', 'swipes', 'warmup']) {
    if (!Number.isInteger(opts[k]) || opts[k] < 0 || (k !== 'warmup' && opts[k] < 1)) {
      console.error(`Nilai --${k} tidak valid`);
      process.exit(1);
    }
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const adbBase = opts.serial ? ['-s', opts.serial] : [];

function adb(...args) {
  return execFileSync('adb', [...adbBase, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readGfx() {
  const out = adb('shell', 'dumpsys', 'gfxinfo', opts.pkg);
  const num = (re) => {
    const m = out.match(re);
    return m ? parseFloat(m[1]) : NaN;
  };
  return {
    frames: num(/Total frames rendered:\s*(\d+)/),
    jankPct: num(/Janky frames:\s*\d+\s*\(([\d.]+)%\)/),
    p50: num(/50th percentile:\s*(\d+)ms/),
    p90: num(/90th percentile:\s*(\d+)ms/),
    p99: num(/99th percentile:\s*(\d+)ms/),
  };
}

function oneRun(width, height) {
  const x = Math.round(width / 2);
  const top = Math.round(height * 0.31);
  const bottom = Math.round(height * 0.84);
  adb('shell', 'dumpsys', 'gfxinfo', opts.pkg, 'reset');
  for (let i = 0; i < opts.swipes; i++) adb('shell', 'input', 'swipe', x, top, x, bottom, '180');
  for (let i = 0; i < opts.swipes; i++) adb('shell', 'input', 'swipe', x, bottom, x, top, '180');
  sleep(1000);
  return readGfx();
}

function main() {
  // Pra-cek: perangkat, ukuran layar, aplikasi di foreground
  const devices = adb('devices').split('\n').slice(1).filter((l) => /\tdevice$/.test(l));
  if (devices.length === 0) {
    console.error('Tidak ada perangkat adb yang tersambung.');
    process.exit(1);
  }
  if (devices.length > 1 && !opts.serial) {
    console.error('Lebih dari satu perangkat; pilih dengan --serial <id>.');
    process.exit(1);
  }
  const size = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/);
  if (!size) {
    console.error('Gagal membaca ukuran layar.');
    process.exit(1);
  }
  const [width, height] = [parseInt(size[1], 10), parseInt(size[2], 10)];
  const focus = adb('shell', 'dumpsys', 'window');
  if (!new RegExp(`mCurrentFocus=.*${opts.pkg.replace(/\./g, '\\.')}`).test(focus)) {
    console.error(`Aplikasi ${opts.pkg} tidak sedang di foreground. Buka layar yang mau diukur dulu.`);
    process.exit(1);
  }

  const mem = adb('shell', 'cat', '/proc/meminfo');
  const memKb = (key) => parseInt((mem.match(new RegExp(`${key}:\\s*(\\d+)`)) || [])[1] || '0', 10);
  const availMb = Math.round(memKb('MemAvailable') / 1024);
  const swapUsedMb = Math.round((memKb('SwapTotal') - memKb('SwapFree')) / 1024);
  console.log(`Perangkat ${devices[0].split('\t')[0]} ${width}x${height} | RAM tersedia ${availMb} MB | swap terpakai ${swapUsedMb} MB`);
  if (opts.label) console.log(`Label: ${opts.label}`);
  if (opts.screenshot) {
    const png = execFileSync('adb', [...adbBase, 'exec-out', 'screencap', '-p'], { maxBuffer: 32 * 1024 * 1024 });
    require('fs').writeFileSync(opts.screenshot, png);
    console.log(`Screenshot layar awal: ${opts.screenshot}`);
  }
  console.log(`${opts.warmup} pemanasan + ${opts.runs} run x ${opts.swipes * 2} swipe\n`);

  for (let i = 0; i < opts.warmup; i++) {
    oneRun(width, height);
    console.log(`  pemanasan ${i + 1}/${opts.warmup} (dibuang)`);
  }

  const results = [];
  console.log('\nrun   frame   jank%    p50   p90   p99');
  for (let i = 1; i <= opts.runs; i++) {
    const r = oneRun(width, height);
    results.push(r);
    console.log(
      `${String(i).padStart(3)}  ${String(r.frames).padStart(6)}  ${r.jankPct.toFixed(2).padStart(6)}  ${String(r.p50).padStart(4)}  ${String(r.p90).padStart(4)}  ${String(r.p99).padStart(4)}`
    );
  }

  const valid = results.filter((r) => r.frames > 0 && !Number.isNaN(r.jankPct));
  if (valid.length === 0) {
    console.error('\nTidak ada data frame yang valid.');
    process.exit(1);
  }
  const col = (key) => valid.map((r) => r[key]);
  const row = (name, fn) =>
    console.log(
      `${name.padEnd(7)} ${fn(col('jankPct')).toFixed(2).padStart(6)}  ${String(fn(col('p50'))).padStart(4)}  ${String(fn(col('p90'))).padStart(4)}  ${String(fn(col('p99'))).padStart(4)}`
    );
  console.log('\n        jank%    p50   p90   p99  (ms)');
  row('median', median);
  row('min', (a) => Math.min(...a));
  row('maks', (a) => Math.max(...a));
  const noisy = Math.max(...col('jankPct')) - Math.min(...col('jankPct')) > 10;
  if (noisy) {
    console.log('\nPeringatan: sebaran jank% > 10 poin. HP kemungkinan sedang berisik (RAM sempit / proses latar). Tutup aplikasi lain dan ulangi.');
  }
  console.log('Catatan: bandingkan MEDIAN antar-build, bukan satu run.');
}

main();
