'use strict';
// Fondasi tema: palet terang/gelap harus selevel (kunci sama, format valid), teks utama terbaca di kedua palet,
// dan resolver mode (termasuk 'system') memilih skema dengan benar.
const assert = require('assert');
const { loadFresh } = require('./_harness');

const m = loadFresh(['theme/colors.ts', 'theme/darkColors.ts', 'theme/themeMode.ts']);
const light = m.colors.lightColors;
const dark = m.darkColors.darkColors;
const mode = m.themeMode;

assert.strictEqual(m.colors.colors, light, '`colors` statis harus tetap palet terang (kompatibilitas)');
assert.deepStrictEqual(Object.keys(dark).sort(), Object.keys(light).sort(), 'kunci palet gelap harus sama dengan terang');

const COLOR = /^(#[0-9a-f]{6}|rgba\(\s*\d+,\s*\d+,\s*\d+,\s*[\d.]+\s*\))$/i;
for (const [name, palette] of [['light', light], ['dark', dark]]) {
  for (const [k, v] of Object.entries(palette)) assert.ok(COLOR.test(v), `${name}.${k} bukan warna valid: ${v}`);
}

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
for (const bg of ['bgBase', 'bgSurface', 'bgElevated', 'bgInput']) {
  assert.ok(ratio(dark.textPrimary, dark[bg]) >= 7, `gelap: textPrimary di ${bg} < 7:1`);
  assert.ok(ratio(dark.textSecondary, dark[bg]) >= 4.5, `gelap: textSecondary di ${bg} < 4.5:1`);
}
assert.ok(ratio(dark.textMuted, dark.bgBase) >= 4.0, 'gelap: textMuted di bgBase terlalu redup');
assert.ok(ratio(dark.colorError, dark.bgSurface) >= 4.5, 'gelap: colorError di bgSurface < 4.5:1');

// Audit keseimbangan palet gelap: setiap pasangan teks/latar yang dipakai aplikasi harus terbaca.
const parse = (c) => {
  if (c.startsWith('#')) return [0, 2, 4].map((i) => parseInt(c.slice(1 + i, 3 + i), 16)).concat(1);
  const n = c.match(/[\d.]+/g).map(Number);
  return [n[0], n[1], n[2], n.length > 3 ? n[3] : 1];
};
const rgb = (c, under) => {
  const p = parse(c);
  return [0, 1, 2].map((i) => p[i] * p[3] + under[i] * (1 - p[3]));
};
const lumRgb = (r) => {
  const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r[0]) + 0.7152 * f(r[1]) + 0.0722 * f(r[2]);
};
const ratioRgb = (a, b) => {
  const [hi, lo] = [lumRgb(a), lumRgb(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const under = rgb(dark.bgSurface, [0, 0, 0]);
const onBg = (fg, bgKey, min, label) => {
  const bg = rgb(dark[bgKey], under);
  const r = ratioRgb(rgb(dark[fg], bg), bg);
  assert.ok(r >= min, `gelap: ${label || fg} di ${bgKey} ${r.toFixed(2)}:1 < ${min}:1`);
};
const surfaces = ['bgBase', 'bgSurface', 'bgElevated', 'bgInput', 'bgSurfaceHover'];
for (const bg of surfaces) {
  for (const fg of ['textPrimary', 'textSecondary', 'accentPrimary', 'accentHover', 'colorError', 'colorWarning', 'colorSuccess', 'colorOnline', 'colorPurple', 'colorInfoText', 'colorWarningText']) onBg(fg, bg, 4.5);
  onBg('textMuted', bg, 3);
}
// Isian bertulisan putih (tombol, FAB, chip terpilih, badge)
for (const fill of ['accentFill', 'dangerFill', 'successFill', 'warningFill', 'unreadBadgeBg']) {
  const bg = rgb(dark[fill], under);
  const r = ratioRgb(rgb(dark.textOnAccent, bg), bg);
  assert.ok(r >= 4.5, `gelap: teks putih di ${fill} ${r.toFixed(2)}:1 < 4.5:1`);
}
// Teks status di atas tint-nya sendiri
onBg('colorError', 'tintError10', 4.5); onBg('colorSuccess', 'tintSuccess10', 4.5);
onBg('colorWarningText', 'tintWarning10', 4.5); onBg('colorPurple', 'tintPurple10', 4.5);
onBg('colorInfoText', 'tintAccent10', 4.5); onBg('accentPrimary', 'tintAccent20', 4.5);
// Kartu harus terpisah dari kanvas, dan garis terlihat
assert.ok(ratioRgb(rgb(dark.bgSurface, [0, 0, 0]), rgb(dark.bgBase, [0, 0, 0])) >= 1.05, 'gelap: kartu menyatu dengan kanvas');
assert.ok(ratioRgb(rgb(dark.borderDefault, [0, 0, 0]), rgb(dark.bgSurface, [0, 0, 0])) >= 1.2, 'gelap: garis tepi tak terlihat');
// Mode terang tidak boleh berubah: isian sama dengan warna aslinya
assert.strictEqual(light.accentFill, light.accentPrimary);
assert.strictEqual(light.dangerFill, light.colorError);
assert.strictEqual(light.successFill, light.colorSuccess);
assert.strictEqual(light.warningFill, light.colorWarning);

// Resolver mode
assert.strictEqual(mode.resolveScheme('light', 'dark'), 'light');
assert.strictEqual(mode.resolveScheme('dark', 'light'), 'dark');
assert.strictEqual(mode.resolveScheme('system', 'dark'), 'dark');
assert.strictEqual(mode.resolveScheme('system', 'light'), 'light');
assert.strictEqual(mode.resolveScheme('system', null), 'light', 'OS tak melaporkan skema => terang');
assert.strictEqual(mode.resolveScheme('system', undefined), 'light');

// Pemulihan nilai tersimpan
assert.strictEqual(mode.parseThemeMode('dark'), 'dark');
assert.strictEqual(mode.parseThemeMode('system'), 'system');
assert.strictEqual(mode.parseThemeMode('rusak'), 'system');
assert.strictEqual(mode.parseThemeMode(null), mode.DEFAULT_THEME_MODE);
assert.ok(mode.THEME_MODES.includes('system'), 'model harus sudah mendukung system');
assert.ok(mode.SELECTABLE_THEME_MODES.includes('system'), 'opsi system harus tersedia di UI');
assert.strictEqual(mode.DEFAULT_THEME_MODE, 'system', 'default harus mengikuti sistem');
console.log('theme-palettes: OK');
