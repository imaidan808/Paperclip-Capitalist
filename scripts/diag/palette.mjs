import { LAYOUT, DIST } from '../../js/world/layout.js';
import { GW, GH } from '../../js/world/island.js';
const hsl = (h) => { const n = parseInt(h.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; let H = 0, Sx = 0; if (d) { Sx = d / (1 - Math.abs(2 * l - 1)); H = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; H *= 60; } return [H, Sx, l]; };
const pal = Object.values(DIST).map((D) => ({ id: D.id, theme: D.theme, ground: D.cols.ground, hue: Math.round(hsl(D.cols.ground)[0]), sat: +hsl(D.cols.ground)[1].toFixed(2), l: +hsl(D.cols.ground)[2].toFixed(2) }));
console.table(pal);
// terrain tile luminance and saturation spread
let L = [], Sx = [], n = 0; const hueBins = new Array(12).fill(0);
for (let k = 0; k < GW * GH; k++) if (LAYOUT.land[k]) { const [h, s, l] = hsl(LAYOUT.tcol[k]); L.push(l); Sx.push(s); hueBins[Math.floor(h / 30) % 12]++; n++; }
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log({ tiles: n, meanL: +mean(L).toFixed(3), meanS: +mean(Sx).toFixed(3), hueBins30deg: hueBins.join(' ') });
// tile-to-tile colour step between 4-neighbours: mean abs luminance difference; share of neighbours differing > 8% in luminance
let steps = 0, big = 0, tot = 0, hueJump = 0; for (let j = 0; j < GH; j++) for (let i = 0; i < GW - 1; i++) { const a = j * GW + i, b = a + 1; if (!LAYOUT.land[a] || !LAYOUT.land[b]) continue; const A = hsl(LAYOUT.tcol[a]), B = hsl(LAYOUT.tcol[b]); const d = Math.abs(A[2] - B[2]); steps += d; tot++; if (d > 0.04) big++; const dh = Math.min(Math.abs(A[0] - B[0]), 360 - Math.abs(A[0] - B[0])); if (dh > 25 && A[1] > .12 && B[1] > .12) hueJump++; }
console.log({ pairs: tot, meanLumaStep: +(steps / tot).toFixed(4), shareStepOver4pct: +(big / tot).toFixed(3), hueJumpPairs: hueJump, hueJumpShare: +(hueJump / tot).toFixed(4) });
