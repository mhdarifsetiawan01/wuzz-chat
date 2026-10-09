'use strict';
// Bubble chat wajib nyaman dibaca: teks >= 4.5:1 terhadap latar bubble (WCAG 2.1 AA), dan bubble tidak boleh jadi
// blok pekat di kanvas terang. Regresi yang dijaga: bubble lawan slate gelap #334155 dan bubble Anda #30AFFF + teks putih (2.4:1).
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { bubblePalette: bp, colors: colorsModule } = loadFresh(['theme/colors.ts', 'theme/bubblePalette.ts']);
const c = colorsModule.colors;
const P = bp.bubblePalette;

const lum = (hex) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const hex = /^#[0-9a-f]{6}$/i;
const atLeast = (fg, bg, min, label) => {
  assert.ok(hex.test(fg) && hex.test(bg), `${label}: harus hex opak (${fg} / ${bg})`);
  assert.ok(ratio(fg, bg) >= min, `${label}: ${ratio(fg, bg).toFixed(2)}:1 < ${min}:1 (${fg} di ${bg})`);
};

for (const side of ['self', 'other']) {
  const s = P[side];
  atLeast(s.text, s.background, 4.5, `${side} teks`);
  atLeast(s.textSecondary, s.background, 4.5, `${side} teks sekunder`);
  atLeast(s.link, s.background, 4.5, `${side} tautan`);
  atLeast(s.accent, s.background, 4.5, `${side} aksen`);
}
// Card/kutipan sisi lawan berlatar opak
atLeast(P.other.text, P.other.quoteBox, 4.5, 'lawan teks kutipan');
atLeast(P.other.accent, P.other.quoteBox, 4.5, 'lawan nama kutipan');
atLeast(P.other.text, P.other.card, 4.5, 'lawan teks card');
atLeast(P.other.textSecondary, P.other.card, 4.5, 'lawan teks sekunder card');
atLeast(P.other.link, P.other.card, 4.5, 'lawan CTA card');
// Bubble disorot
atLeast(P.self.text, P.highlight.self, 4.5, 'disorot Anda');
atLeast(P.other.text, P.highlight.other, 4.5, 'disorot lawan');
// Nama pengirim grup di atas bubble putih
for (const n of P.senderNames) atLeast(n, P.other.background, 4.5, `nama pengirim ${n}`);

// Tidak boleh kembali menjadi blok pekat di kanvas terang: bubble lawan nyaris sama terang dengan kanvas
assert.ok(ratio(P.other.background, c.bgBase) < 1.2, 'bubble lawan terlalu kontras terhadap kanvas');
assert.ok(ratio(P.self.background, c.bgBase) >= 3, 'bubble Anda harus terlihat jelas di kanvas');
// Referensi regresi lama
assert.ok(ratio('#ffffff', '#30AFFF') < 4.5, 'gaya lama (#30AFFF + putih) memang gagal AA');
assert.ok(ratio('#334155', c.bgBase) > 8, 'gaya lama (slate gelap) memang blok pekat');
console.log('bubble-palette-contrast: OK');
