#!/usr/bin/env node
/**
 * Benchmark jank saat MENGETIK di kolom input ruang obrolan (HP fisik via adb, dumpsys gfxinfo), pasangan dari
 * measure-scroll.js. Prasyarat: ruang obrolan terbuka dan kolom input kosong. Skrip mengetuk kolom input (400,1545;
 * layar 720x1600), mengetik N huruf lalu menghapusnya satu per satu; tidak pernah mengirim pesan.
 * Penggunaan: node scripts/measure-typing.js [huruf=30] [run=8]   (satu run pemanasan dibuang)
 */
const adb = (...a) => execFileSync('adb', a, { encoding: 'utf8' });
const pkg = 'com.wuzzchat.mobile';
const chars = parseInt(process.argv[2] || '30', 10), runs = parseInt(process.argv[3] || '8', 10);
const med = (v) => { const s = [...v].sort((a,b)=>a-b); const m = s.length>>1; return s.length%2?s[m]:(s[m-1]+s[m])/2; };
function gfx() { const o = adb('shell','dumpsys','gfxinfo',pkg); const n=(re)=>{const m=o.match(re);return m?parseFloat(m[1]):NaN};
  return { frames:n(/Total frames rendered:\s*(\d+)/), jank:n(/Janky frames:\s*\d+\s*\(([\d.]+)%\)/), p50:n(/50th percentile:\s*(\d+)ms/), p90:n(/90th percentile:\s*(\d+)ms/), p99:n(/99th percentile:\s*(\d+)ms/) }; }
adb('shell','input','tap','400','1545');
execFileSync('sleep',['1.5']);
const res = [];
for (let r = -1; r < runs; r++) {
  adb('shell','dumpsys','gfxinfo',pkg,'reset');
  for (let i = 0; i < chars; i++) adb('shell','input','text', 'abcdefghij'[i%10]);
  for (let i = 0; i < chars; i++) adb('shell','input','keyevent','KEYCODE_DEL');
  execFileSync('sleep',['1']);
  const g = gfx();
  if (r >= 0) { res.push(g); console.log(`run ${r+1}: frames=${g.frames} jank=${g.jank}% p50=${g.p50} p90=${g.p90} p99=${g.p99}`); }
}
console.log(`MEDIAN: frames=${med(res.map(x=>x.frames))} jank=${med(res.map(x=>x.jank)).toFixed(1)}% p50=${med(res.map(x=>x.p50))} p90=${med(res.map(x=>x.p90))} p99=${med(res.map(x=>x.p99))}`);
