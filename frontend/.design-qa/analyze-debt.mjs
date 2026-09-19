// Skrip agregasi lanjutan untuk Design Debt Review (plugin Qoder "Design Review").
// Melengkapi laporan otomatis .design-qa/reports/design-debt.json dengan inventaris
// radius/typography, warna non-token, dan pola overlay duplikat.
import fs from 'node:fs';
import path from 'node:path';

const root = '/home/bms-del112/BMS/personal-project/wuzz-chat/frontend';
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|ts|css)$/.test(e.name)) files.push(p);
  }
})(path.join(root, 'app'));

const inv = { borderRadius: {}, fontSize: {}, fontWeight: {} };
const add = (map, k) => (map[k] = (map[k] || 0) + 1);
let inlineBoxShadow = 0;
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  for (const m of c.matchAll(/borderRadius:\s*['"]?[\d.]+(?:px|%)?/g)) add(inv.borderRadius, m[0].replace(/['"]/g, ''));
  for (const m of c.matchAll(/fontSize:\s*['"]?[\d.]+(?:\.\d+)?(?:px|rem|em)?/g)) add(inv.fontSize, m[0].replace(/['"]/g, ''));
  for (const m of c.matchAll(/fontWeight:\s*['"]?\d+/g)) add(inv.fontWeight, m[0].replace(/['"]/g, ''));
  inlineBoxShadow += (c.match(/boxShadow:\s*['"]/g) || []).length;
}

// Hex di globals.css DI LUAR blok :root (baris > 96) => drift dari token layer
const g = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8').split('\n');
const hexAfterRoot = {};
g.slice(96).forEach((line) => {
  if (/^\s*--/.test(line)) return;
  for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) add(hexAfterRoot, m[0].toLowerCase());
});

// Warna non-token yang dipakai di kode fitur (app/**) — kandidat semantic drift
const driftColors = ['#ef4444', '#38bdf8', '#22c55e', '#10b981', '#f59e0b', '#06b6d4', '#c084fc', '#4f46e5', '#6366f1', '#a78bfa', '#e879f9', '#ffffff'];
const driftFiles = {};
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8').toLowerCase();
  for (const col of driftColors) if (c.includes(col)) (driftFiles[col] = driftFiles[col] || []).push(path.relative(root, f));
}

// Pola overlay/modal: style inline position:fixed vs kelas CSS modal-overlay
const overlayInline = [];
for (const f of files) {
  if (!f.endsWith('.tsx')) continue;
  const c = fs.readFileSync(f, 'utf8');
  if (/position:\s*['"]?fixed/.test(c)) overlayInline.push(path.relative(root, f));
}
const modalCssClasses = (fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8').match(/^[.#][\w-]*(?:overlay|modal|backdrop)[\w-]*\s*[,{]/gmi) || []);

console.log('== borderRadius (inline, app/**/*.tsx) ==');
Object.entries(inv.borderRadius).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(String(n).padStart(4), k));
console.log('\n== fontSize (inline) ==');
Object.entries(inv.fontSize).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(String(n).padStart(4), k));
console.log('\n== fontWeight (inline) ==');
Object.entries(inv.fontWeight).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(String(n).padStart(4), k));
console.log('\n== inline boxShadow (jumlah) ==', inlineBoxShadow);
console.log('\n== hex di globals.css di luar :root (top 20) ==');
Object.entries(hexAfterRoot).sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, n]) => console.log(String(n).padStart(4), k));
console.log('\n== warna non-token di kode fitur ==');
Object.entries(driftFiles).forEach(([col, fl]) => console.log(col.padEnd(10), fl.length + ' file:', fl.slice(0, 6).join(', ')));
console.log('\n== file TSX dengan overlay position:fixed inline ==', overlayInline.length);
console.log(overlayInline.join('\n'));
console.log('\n== kelas CSS modal/overlay/backdrop di globals.css ==', modalCssClasses.length);
console.log([...new Set(modalCssClasses.map((s) => s.trim().replace(/\s*[,{]$/, '')))].join('\n'));
