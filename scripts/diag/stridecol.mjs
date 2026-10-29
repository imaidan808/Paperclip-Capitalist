import { LAYOUT } from '../../js/world/layout.js';
import { GW, GH } from '../../js/world/island.js';
import { rgb } from '../../js/world/iso.js';
const { land, tcol, lands, ZV, VW } = LAYOUT;
for (const st of [2, 4, 8]) {
  let cells = 0, err = 0, big = 0, partial = 0, zerr = 0, zn = 0; const errs = [];
  for (let j = 0; j < GH; j += st) for (let i = 0; i < GW; i += st) {
    // the shipped rule (world.coarseCol)
    let c = '#4b7a4e', best = 1e9, n = 0, sum = [0, 0, 0], cnt = 0;
    for (let b = 0; b < st; b++) for (let a = 0; a < st; a++) { const k = (j + b) * GW + i + a; if (i + a < GW && j + b < GH && land[k]) { cnt++; const r = rgb(tcol[k]); sum[0] += r[0]; sum[1] += r[1]; sum[2] += r[2]; const d = Math.abs(a - st / 2) + Math.abs(b - st / 2); if (d < best) { best = d; c = tcol[k]; } } }
    if (!cnt) continue; cells++; if (cnt < st * st) partial++;
    const m = sum.map((v) => v / cnt), r = rgb(c), e = Math.hypot(r[0] - m[0], r[1] - m[1], r[2] - m[2]); err += e; errs.push(e); if (e > 30) big++;
    // corner height sampled at the stride corner vs the mean height of the tiles inside
    let zs = 0; for (let b = 0; b <= st; b += st) for (let a = 0; a <= st; a += st) { zs += ZV[Math.min(j + b, GH) * VW + Math.min(i + a, GW)]; } zs /= 4; let zm = 0, zc = 0; for (let b = 0; b < st; b++) for (let a = 0; a < st; a++) { const k = (j + b) * GW + i + a; if (i + a < GW && j + b < GH) { zm += ZV[(j + b) * VW + i + a]; zc++; } } zerr += Math.abs(zs - zm / zc); zn++;
  }
  errs.sort((a, b) => a - b);
  console.log(`stride ${st}: cells ${cells}, coast-cells (partly water, drawn as full land) ${partial} (${(partial / cells * 100).toFixed(0)}%), colour error vs mean of its tiles: mean ${(err / cells).toFixed(1)}/441, p95 ${errs[Math.floor(errs.length * 0.95)].toFixed(1)}, cells off by >30: ${(big / cells * 100).toFixed(0)}%; corner-height error mean ${(zerr / zn).toFixed(1)}px`);
}
