#!/usr/bin/env node
'use strict';
/**
 * Menjalankan semua uji unit `*.test.js` di folder ini satu per satu (proses terpisah agar cache modul bersih).
 * Penggunaan: `npm run test:unit` di `mobile/`.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const tests = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith('.test.js'))
  .sort();

let failed = 0;
for (const file of tests) {
  console.log(`\n=== ${file}`);
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' });
  if (result.status !== 0) {
    failed++;
    console.error(`--- GAGAL: ${file} (exit ${result.status})`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} berkas uji lulus`);
process.exit(failed === 0 ? 0 : 1);
