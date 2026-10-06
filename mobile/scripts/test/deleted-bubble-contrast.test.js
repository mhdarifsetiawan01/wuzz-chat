'use strict';
// Bubble "Pesan ini telah dihapus" wajib terbaca: teks dan jam >= 4.5:1 terhadap latarnya (WCAG 2.1 AA).
// Regresi yang dijaga: latar slate gelap 45% di atas kanvas terang + teks textMuted = 1.1:1 (nyaris tak terbaca).
const assert = require('assert');
const { loadFresh } = require('./_harness');

const { deletedBubble: d, colors: colorsModule } = loadFresh(['theme/colors.ts', 'theme/deletedBubble.ts']);
const c = colorsModule.colors;

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

const p = d.deletedBubblePalette;
for (const color of [p.background, p.border, p.text, p.time]) {
  assert.ok(/^#[0-9a-f]{6}$/i.test(color), `palet harus hex opak agar kontras terukur: ${color}`);
}
assert.ok(ratio(p.text, p.background) >= 4.5, `teks ${ratio(p.text, p.background).toFixed(2)}:1 < 4.5:1`);
assert.ok(ratio(p.time, p.background) >= 4.5, `jam ${ratio(p.time, p.background).toFixed(2)}:1 < 4.5:1`);

// Pengukuran referensi supaya perhitungan kontras sendiri tidak diam-diam salah.
assert.ok(Math.abs(ratio('#000000', '#ffffff') - 21) < 0.01);
assert.ok(ratio(c.textMuted, '#949aa5') < 1.2, 'gaya lama memang tidak terbaca (referensi regresi)');
console.log('deleted-bubble-contrast: OK');
