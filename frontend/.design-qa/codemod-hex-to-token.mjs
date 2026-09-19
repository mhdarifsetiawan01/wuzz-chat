#!/usr/bin/env node
// ================================================================
// codemod-hex-to-token.mjs — Batch Fix #1 dari Design Debt Review
// (plugin Qoder "Design Review", skill design-debt-review)
//
// Mengganti warna hex yang nilainya PERSIS sama dengan token :root
// di app/globals.css menjadi var(--token).
//
// Yang dikecualikan demi keamanan:
//  - Blok :root di globals.css (layer token — raw value memang sah di sana)
//  - Baris deklarasi custom property (--x: ...)
//  - Konteks non-CSS yang tidak mengerti var(): API canvas (fillStyle dll.),
//    opsi library QR (dark/light), themeColor meta viewport
//  - Atribut SVG (fill="#..", stopColor="#..") — bentuk atribut, bukan properti CSS
//  - lib/avatarColor.ts (modul palet, setara file token)
//
// Pemakaian:
//   node .design-qa/codemod-hex-to-token.mjs            # dry run (default)
//   node .design-qa/codemod-hex-to-token.mjs --write    # tulis file
// ================================================================
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/bms-del112/BMS/personal-project/wuzz-chat/frontend';
const WRITE = process.argv.includes('--write');

// Peta hex -> token. Hanya nilai yang identik dengan :root globals.css.
const HEX_TO_TOKEN = {
  '#3b82f6': 'var(--accent-500)',
  '#60a5fa': 'var(--accent-400)',
  '#93c5fd': 'var(--accent-300)',
  '#2563eb': 'var(--accent-600)',
  '#818cf8': 'var(--accent-secondary)',
  '#a5b4fc': 'var(--accent-secondary-soft)',
  '#f472b6': 'var(--accent-tertiary)',
  '#fb7185': 'var(--accent-tertiary-hover)',
  '#f87171': 'var(--color-error)',
  '#fbbf24': 'var(--color-warning)',
  '#34d399': 'var(--color-online)',
  '#f8fafc': 'var(--text-primary)',
  '#94a3b8': 'var(--text-secondary)',
  '#64748b': 'var(--text-muted)',
  '#090d16': 'var(--bg-base)',
};

const HEX_RE = new RegExp(
  '#(' + Object.keys(HEX_TO_TOKEN).map((h) => h.slice(1)).join('|') + ')(?![0-9a-fA-F])',
  'gi'
);

// Konteks properti CSS pada objek style JSX (case-sensitive, camelCase React).
// "themeColor:" sengaja TIDAK cocok (huruf C besar) — itu meta viewport, bukan CSS.
const STYLE_PROP_RE =
  /(?:--[\w-]+|backgroundColor|backgroundImage|background|borderBottomColor|borderTopColor|borderLeftColor|borderRightColor|borderColor|borderBottom|borderTop|borderLeft|borderRight|border|outlineColor|outline|boxShadow|textShadow|textDecorationColor|caretColor|accentColor|stopColor|fill|stroke|color)\s*:/;

// Konteks yang TIDAK boleh diganti (API non-CSS yang tidak mengerti var())
const NON_CSS_GUARD_RE =
  /fillStyle|strokeStyle|shadowColor|createLinearGradient|createRadialGradient|getContext|toDataURL|toBlob|QRCode|qrcode|themeColor/i;

// String literal JS: '...', "...", `...`
const STRING_RE = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

// ---------- Validasi peta terhadap :root yang sebenarnya ----------
const globalsPath = path.join(ROOT, 'app', 'globals.css');
const globalsText = fs.readFileSync(globalsPath, 'utf8');
const rootBlock = globalsText.match(/:root\s*\{([\s\S]*?)\}/)?.[1] || '';
const rootDecl = {};
for (const m of rootBlock.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) rootDecl[m[1]] = m[2].trim();

for (const [hex, token] of Object.entries(HEX_TO_TOKEN)) {
  const name = token.match(/var\((--[\w-]+)\)/)[1];
  const val = rootDecl[name];
  if (val === undefined) {
    console.error(`[ABORT] token ${name} tidak ditemukan di :root globals.css`);
    process.exit(1);
  }
  if (val.toLowerCase() !== hex) {
    console.error(`[ABORT] nilai ${name} = "${val}" tidak sama dengan ${hex} — peta perlu diperbarui`);
    process.exit(1);
  }
}
console.log(`[OK] Peta ${Object.keys(HEX_TO_TOKEN).length} hex tervalidasi terhadap :root globals.css`);

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
        // baris komentar murni / deklarasi custom property — biarkan
      } else {
        // jangan sentuh bagian komentar trailing (/* ... */)
        const cIdx = line.indexOf('/*');
        const target = cIdx === -1 ? line : line.slice(0, cIdx);
        const tail = cIdx === -1 ? '' : line.slice(cIdx);
        const matches = [...target.matchAll(HEX_RE)].map((m) => m[0]);
        if (matches.length) {
          const after = target.replace(HEX_RE, (m) => HEX_TO_TOKEN[m.toLowerCase()]);
          replaced = after + tail;
          hits.push({ line: i + 1, values: matches });
        }
      }
    }

    if (inRoot) {
      depth += opens - closes;
      if (depth <= 0) {
        inRoot = false;
        depth = 0;
      }
    } else if (/:root\s*\{/.test(line)) {
      inRoot = true;
      depth = opens - closes;
      if (depth <= 0) {
        inRoot = false;
        depth = 0;
      }
    }
    return replaced;
  });
  return { text: out.join('\n'), count: hits.reduce((a, h) => a + h.values.length, 0), hits };
}

function processCode(text) {
  const lines = text.split('\n');
  const hits = [];
  const out = lines.map((line, i) => {
    if (!STYLE_PROP_RE.test(line) || NON_CSS_GUARD_RE.test(line)) return line;
    if (!line.includes('#')) return line;
    let n = 0;
    const replaced = line.replace(STRING_RE, (full, q, content) => {
      if (!content.includes('#')) return full;
      const inner = content.replace(HEX_RE, (m) => {
        n++;
        return HEX_TO_TOKEN[m.toLowerCase()];
      });
      return q + inner + q;
    });
    if (n > 0) hits.push({ line: i + 1, values: [], count: n });
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

  // leftover: hex peta yang masih tersisa di hasil (akar masalahnya :root,
  // guard canvas/QR, atribut SVG, komentar, atau style multi-baris)
  const finalText = WRITE ? (count > 0 ? text : content) : text;
  const finalLines = finalText.split('\n');
  finalLines.forEach((line, i) => {
    for (const m of line.matchAll(HEX_RE)) {
      report.leftovers.push({ file: rel, line: i + 1, hex: m[0], snippet: line.trim().slice(0, 90) });
    }
  });
}

// ---------- Output ----------
console.log(`\n== RINGKASAN (mode: ${report.mode}) ==`);
for (const f of report.files.sort((a, b) => b.replacements - a.replacements)) {
  console.log(`${String(f.replacements).padStart(4)}  ${f.file}`);
}
console.log(`TOTAL replacement: ${report.total} di ${report.files.length} file`);

console.log(`\n== LEFTOVER hex peta-token yang sengaja dibiarkan: ${report.leftovers.length} ==`);
for (const l of report.leftovers.slice(0, 40)) {
  console.log(`${l.file}:${l.line}  ${l.hex}  |  ${l.snippet}`);
}
if (report.leftovers.length > 40) console.log(`... dan ${report.leftovers.length - 40} lainnya`);

const reportPath = path.join(ROOT, '.design-qa', 'reports', 'codemod-batch1.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\nLaporan lengkap: ${reportPath}`);
if (!WRITE) console.log('Dry run — file TIDAK diubah. Jalankan dengan --write untuk menerapkan.');
