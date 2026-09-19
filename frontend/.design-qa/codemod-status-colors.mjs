#!/usr/bin/env node
// ================================================================
// codemod-status-colors.mjs — Batch Fix #2 dari Design Debt Review
// (plugin Qoder "Design Review", skill design-debt-review)
//
// Standarisasi warna status: mengganti hex merah/hijau kompetitif
// menjadi token semantik, SADAR PROPERTI (peran teks vs fill):
//
//   #ef4444  → color: var(--color-error)      (teks/ikon di latar gelap)
//              background/border: var(--color-danger)  (fill destruktif)
//   #fc8181, #fca5a5 → var(--color-error)     (teks)
//   #dc2626  → var(--color-danger-strong)     (hover/tekan)
//   #22c55e  → var(--color-success)           (teks sukses)
//   #10b981  → var(--color-success)           (fill afirmatif)
//
// Pengecualian sama seperti codemod batch #1 (:root, custom property,
// guard non-CSS, lib/avatarColor.ts). Tint rgba(...) TIDAK disentuh
// (cakupan batch #3).
//
// Pemakaian:
//   node .design-qa/codemod-status-colors.mjs            # dry run
//   node .design-qa/codemod-status-colors.mjs --write
// ================================================================
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/bms-del112/BMS/personal-project/wuzz-chat/frontend';
const WRITE = process.argv.includes('--write');

// Peta hex → token per peran. Nilai diverifikasi terhadap :root.
const MAP = {
  '#ef4444': { text: 'var(--color-error)', fill: 'var(--color-danger)' },
  '#fc8181': { text: 'var(--color-error)', fill: 'var(--color-error)' },
  '#fca5a5': { text: 'var(--color-error)', fill: 'var(--color-error)' },
  '#dc2626': { text: 'var(--color-danger-strong)', fill: 'var(--color-danger-strong)' },
  '#22c55e': { text: 'var(--color-success)', fill: 'var(--color-success)' },
  '#10b981': { text: 'var(--color-success)', fill: 'var(--color-success)' },
};

const HEX_RE = new RegExp(
  '#(' + Object.keys(MAP).map((h) => h.slice(1)).join('|') + ')(?![0-9a-fA-F])',
  'gi'
);

const NON_CSS_GUARD_RE =
  /fillStyle|strokeStyle|shadowColor|createLinearGradient|getContext|toDataURL|toBlob|QRCode|qrcode|themeColor/i;

// Properti CSS: peran teks vs fill (per baris, properti di awal baris)
const CSS_TEXT_PROP = /^\s*(?:color|caret-color|outline-color|text-decoration-color)\s*:/;
const CSS_FILL_PROP = /^\s*(?:background|background-color|border|border-color|border-top-color|border-right-color|border-bottom-color|border-left-color|box-shadow|outline|fill|stroke)\s*:/;

// Properti style JSX: fill dicek dulu agar backgroundColor tidak lolos sebagai teks
const TX_FILL_PROP = /(?:backgroundColor|background|borderBottom|borderTop|borderLeft|borderRight|borderColor|border|boxShadow)\s*:/;
const TX_TEXT_PROP = /(?<![a-zA-Z])color\s*:/;

const STRING_RE = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

// ---------- Validasi peta terhadap :root ----------
const globalsPath = path.join(ROOT, 'app', 'globals.css');
const globalsText = fs.readFileSync(globalsPath, 'utf8');
const rootBlock = globalsText.match(/:root\s*\{([\s\S]*?)\}/)?.[1] || '';
const rootDecl = {};
for (const m of rootBlock.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) rootDecl[m[1]] = m[2].trim();

const needed = new Set(
  Object.values(MAP).flatMap((roles) => Object.values(roles).map((v) => v.match(/var\((--[\w-]+)\)/)[1]))
);
for (const name of needed) {
  if (rootDecl[name] === undefined) {
    console.error(`[ABORT] token ${name} belum ada di :root globals.css — tambahkan dulu`);
    process.exit(1);
  }
}
console.log(`[OK] ${needed.size} token tervalidasi di :root: ${[...needed].join(', ')}`);

// ---------- Pengumpulan file ----------
function collect(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx|ts|css)$/.test(e.name)) out.push(p);
    }
  })(dir);
  return out;
}

const files = [...collect(path.join(ROOT, 'app')), ...collect(path.join(ROOT, 'lib'))].filter(
  (f) => !f.endsWith(path.join('lib', 'avatarColor.ts'))
);

// ---------- Proses per tipe file ----------
function processCss(text) {
  const lines = text.split('\n');
  let inRoot = false;
  let depth = 0;
  const hits = [];
  const out = lines.map((line, i) => {
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    let replaced = line;

    if (!inRoot) {
      if (/^\s*(\/\*|\*|\/\/)/.test(line) || /^\s*--[\w-]+\s*:/.test(line)) {
        // komentar murni / deklarasi custom property — biarkan
      } else {
        const role = CSS_TEXT_PROP.test(line) ? 'text' : CSS_FILL_PROP.test(line) ? 'fill' : null;
        if (role) {
          const cIdx = line.indexOf('/*');
          const target = cIdx === -1 ? line : line.slice(0, cIdx);
          const tail = cIdx === -1 ? '' : line.slice(cIdx);
          const matches = [...target.matchAll(HEX_RE)].map((m) => m[0]);
          if (matches.length) {
            const after = target.replace(HEX_RE, (m) => MAP[m.toLowerCase()][role]);
            replaced = after + tail;
            hits.push({ line: i + 1, role, values: matches });
          }
        }
      }
    }

    if (inRoot) {
      depth += opens - closes;
      if (depth <= 0) { inRoot = false; depth = 0; }
    } else if (/:root\s*\{/.test(line)) {
      inRoot = true;
      depth = opens - closes;
      if (depth <= 0) { inRoot = false; depth = 0; }
    }
    return replaced;
  });
  return { text: out.join('\n'), count: hits.reduce((a, h) => a + h.values.length, 0), hits };
}

function processCode(text) {
  const lines = text.split('\n');
  const hits = [];
  const out = lines.map((line, i) => {
    if (NON_CSS_GUARD_RE.test(line)) return line;
    if (!line.includes('#')) return line;
    const role = TX_FILL_PROP.test(line) ? 'fill' : TX_TEXT_PROP.test(line) ? 'text' : null;
    if (!role) return line;
    let n = 0;
    const replaced = line.replace(STRING_RE, (full, q, content) => {
      if (!content.includes('#')) return full;
      const inner = content.replace(HEX_RE, (m) => {
        n++;
        return MAP[m.toLowerCase()][role];
      });
      return q + inner + q;
    });
    if (n > 0) hits.push({ line: i + 1, role, count: n });
    return replaced;
  });
  return { text: out.join('\n'), count: hits.reduce((a, h) => a + h.count, 0), hits };
}

// ---------- Eksekusi ----------
const report = { mode: WRITE ? 'write' : 'dry', total: 0, files: [], leftovers: [] };

for (const filePath of files) {
  const rel = path.relative(ROOT, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const isCss = filePath.endsWith('.css');
  const { text, count, hits } = isCss ? processCss(content) : processCode(content);

  if (count > 0) {
    report.files.push({ file: rel, replacements: count, hits });
    report.total += count;
    if (WRITE) fs.writeFileSync(filePath, text, 'utf8');
  }

  const finalText = count > 0 ? text : content;
  finalText.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(HEX_RE)) {
      report.leftovers.push({ file: rel, line: i + 1, hex: m[0], snippet: line.trim().slice(0, 90) });
    }
  });
}

console.log(`\n== RINGKASAN (mode: ${report.mode}) ==`);
for (const f of report.files.sort((a, b) => b.replacements - a.replacements)) {
  console.log(`${String(f.replacements).padStart(4)}  ${f.file}`);
}
console.log(`TOTAL replacement: ${report.total} di ${report.files.length} file`);

console.log(`\n== LEFTOVER: ${report.leftovers.length} ==`);
for (const l of report.leftovers.slice(0, 30)) {
  console.log(`${l.file}:${l.line}  ${l.hex}  |  ${l.snippet}`);
}
if (report.leftovers.length > 30) console.log(`... dan ${report.leftovers.length - 30} lainnya`);

const reportPath = path.join(ROOT, '.design-qa', 'reports', 'codemod-batch2.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\nLaporan lengkap: ${reportPath}`);
if (!WRITE) console.log('Dry run — file TIDAK diubah. Jalankan dengan --write untuk menerapkan.');
