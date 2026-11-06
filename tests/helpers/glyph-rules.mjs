// The style rules of the glyph kit as plain functions of a drawing (a list of shapes, js/art/glyph.js): each returns the list of what is wrong with it, empty when the drawing is within the rules.
// tests/glyph-style.test.mjs runs them on every registered glyph (and on drawings made to break them); scripts/glyph-draw.mjs runs them on what a drawing script writes, so an artist hears at once.
// The palette's contrast against the dark surfaces is the test's: it reads the stylesheet. One rule is about pairs, not about a drawing: lookalikes() (no two pictures look alike).
import { GRID, PAL } from '../../js/art/glyph.js';
import { polys, rasterise, thinShare } from './glyph-raster.mjs';

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => { const v = parseInt(hex.slice(1), 16); return 0.2126 * lin(v >> 16) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255); };
/** The contrast ratio of two tones of the palette. */
export const toneRatio = (a, b) => { const [x, y] = [lum(PAL[a]), lum(PAL[b])].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const fix = (v) => Math.round(v * 100) / 100;
export const isMark = (shapes) => shapes.every((s) => s[1] === 'cc');
export const tonesOf = (shapes) => [...new Set(shapes.map((s) => s[1]))];
export const bboxOf = (s) => { const pts = polys(s).flat(), xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
export const unionBox = (shapes) => { const bs = shapes.map(bboxOf); return [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))]; };

const ARITY = { M: 2, L: 2, Q: 4, C: 6 };
/** Shape data: five kinds, numbers of at most two decimals, closed absolute paths, every point inside the grid with a half unit of margin, no round corner larger than half the shape. */
export function dataProblems(shapes) {
  const bad = [];
  shapes.forEach((s, i) => {
    const at = `shape ${i} (${s[0]})`, k = s[0], mine = (m) => bad.push(`${at}: ${m}`), before = bad.length;
    if (!['c', 'e', 'r', 'p', 'd'].includes(k)) return mine('an unknown kind (c, e, r, p or d)');
    if (typeof s[1] !== 'string') return mine('no tone');
    if (k !== 'd') for (const v of s.slice(2).filter((x) => x !== undefined)) { if (!Number.isFinite(v)) return mine(`${v} is not a number`); if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) mine(`${v} has more than two decimals`); }
    if (k === 'c' && !(s.length === 5 && s[4] > 0)) mine('c is [c, tone, cx, cy, r]');
    if (k === 'e' && !(s.length === 6 && s[4] > 0 && s[5] > 0)) mine('e is [e, tone, cx, cy, rx, ry]');
    if (k === 'r') { if (!(s.length === 6 || s.length === 7) || !(s[4] > 0 && s[5] > 0)) mine('r is [r, tone, x, y, w, h, rx]'); else if ((s[6] || 0) < 0 || (s[6] || 0) > Math.min(s[4], s[5]) / 2 + 1e-9) mine(`rx ${s[6]} is more than half of the shorter side (${Math.min(s[4], s[5]) / 2}): the SVG and the canvas would round it differently`); }
    if (k === 'p' && !(s.length >= 8 && s.length % 2 === 0)) mine('p is [p, tone, x1, y1, x2, y2, x3, y3, ...], three points or more');
    if (k === 'd') {
      const d = s[2];
      if (typeof d !== 'string' || !/^[MLQCZ0-9 .\-]+$/.test(d)) return mine('a path is absolute M L Q C Z, numbers and spaces only');
      if (d.length > 480) mine(`a path of ${d.length} characters (480 at most: split it, or simplify)`);
      if (s.length > 4 || (s[3] !== undefined && s[3] !== 'e')) mine("the fourth item of a path is 'e' (even-odd: holes) or nothing");
      const toks = d.match(/[MLQCZ]|-?\d*\.?\d+/g) || []; let j = 0, open = false, started = false;
      while (j < toks.length) {
        const c = toks[j++];
        if (!(c in ARITY) && c !== 'Z') { mine(`a number where a command should be (${c})`); break; }
        if (c === 'M') { if (open) mine('a sub-path is not closed with Z before the next M'); open = true; started = true; } else if (!started) { mine('a path starts with M'); break; }
        if (c === 'Z') { open = false; continue; }
        for (let a = 0; a < ARITY[c]; a++, j++) if (j >= toks.length || /^[MLQCZ]$/.test(toks[j])) { mine(`${c} takes ${ARITY[c]} numbers`); j = toks.length; break; }
      }
      if (open) mine('the path is not closed with Z');
      for (const t of toks) if (!/^[MLQCZ]$/.test(t) && !/^-?\d+(\.\d{1,2})?$/.test(t)) mine(`${t} has more than two decimals`);
    }
    if (bad.length > before) return;
    const [x0, y0, x1, y1] = bboxOf(s), m = 0.5 - 1e-9;
    if (x0 < m || y0 < m || x1 > GRID - m || y1 > GRID - m) mine(`reaches [${fix(x0)}, ${fix(y0)}, ${fix(x1)}, ${fix(y1)}]: keep a half unit of margin inside the grid`);
  });
  return bad;
}
/** Tones: only the palette; a mark is one tone and never mixed with colours; a picture has at most four. */
export function toneProblems(shapes) {
  const t = tonesOf(shapes), bad = t.filter((x) => !(x in PAL)).map((x) => `tone ${x} is not in the palette`);
  if (t.includes('cc') && t.length > 1) bad.push(`a mark is one tone (cc), this mixes cc with ${t.filter((x) => x !== 'cc').join(', ')}`);
  if (!t.includes('cc') && t.length > 4) bad.push(`${t.length} tones (${t.join(' ')}): a picture has at most four, three steps of value and one accent`);
  return bad;
}
/** Parts and size: at most 10 shapes (6 in a mark), nothing a speck or a hairline, nothing as big as a tile, a picture that fills 14 units of the grid (a mark 8). */
export function sizeProblems(shapes) {
  const mark = isMark(shapes), bad = [];
  if (shapes.length > (mark ? 6 : 10)) bad.push(`${shapes.length} shapes (${mark ? 'a mark has 6 at most' : 'a picture has 10 at most'}): a glyph is a silhouette first`);
  shapes.forEach((s, i) => {
    const [x0, y0, x1, y1] = bboxOf(s), w = x1 - x0, h = y1 - y0;
    if (s[0] === 'c' && s[4] < 0.8) bad.push(`shape ${i}: a circle of radius ${s[4]} is a speck at 16 px`);
    if ((s[0] === 'r' || s[0] === 'e') && Math.min(w, h) < 1.5 - 1e-9) bad.push(`shape ${i}: ${fix(Math.min(w, h))} units across is a hairline (1.5 is a pixel at 16 px)`);
    if (w >= 20 && h >= 20) bad.push(`shape ${i}: ${fix(w)} x ${fix(h)} is a plate, not a part of a picture`);
  });
  const [x0, y0, x1, y1] = unionBox(shapes), size = Math.max(x1 - x0, y1 - y0);
  if (size < (mark ? 8 : 14)) bad.push(`the drawing is ${fix(x1 - x0)} x ${fix(y1 - y0)}: too small to read at 24 px (${mark ? 8 : 14} units across at least)`);
  return bad;
}
/** What is shown, measured on a raster: a sensible part of the grid, near its centre, every shape visible, no lines thinner than a pixel at 16 px (5% of tips allowed). */
export function shownProblems(shapes) {
  const mark = isMark(shapes), r = rasterise(shapes, 2), unit = 1 / 4, cover = (r.covered * unit) / (GRID * GRID), bad = [];
  if (cover < (mark ? 0.04 : 0.12)) bad.push(`covers ${(cover * 100).toFixed(0)}% of the grid: a speck (${mark ? 4 : 12}% at least)`);
  if (cover > 0.65) bad.push(`covers ${(cover * 100).toFixed(0)}% of the grid: a tile (65% at most)`);
  if (Math.abs(r.cx - 12) > 4 || Math.abs(r.cy - 12) > 4) bad.push(`its centre of mass is (${r.cx.toFixed(1)}, ${r.cy.toFixed(1)}): it would sit off in a button (within 4 units of 12, 12)`);
  r.left.forEach((c, i) => { if (c * unit < 3) bad.push(`shape ${i} (${shapes[i][0]} ${shapes[i][1]}) shows ${(c * unit).toFixed(1)} units squared: it is covered by the shapes after it, or too small to see (3 at least)`); });
  const thin = thinShare(shapes);
  if (thin > 0.05) bad.push(`${(thin * 100).toFixed(1)}% of it is narrower than a pixel at 16 px (1.5 units): thicken the thin parts (5% is the allowance for tips)`);
  return bad;
}
/**
 * A detail on a body (the lens in its rim, a head on a card, a tie on a sack): a part that has at least 60% of its edge, and at least 4 units of it, on ONE other part must differ from that part by 1.15:1 in luminance, so it
 * shows in grey, in colour-vision deficiency and when it is blurred. The edge is counted on a raster of 4 samples a unit, between neighbouring samples that belong to different shapes. A mark (one tone) is exempt.
 */
export function detailProblems(shapes) {
  if (isMark(shapes)) return [];
  const res = 4, n = GRID * res, r = rasterise(shapes, res), own = r.owner, pair = new Map(), bad = [];
  const add = (a, b) => { if (a === b) return; const k = a < b ? `${a}|${b}` : `${b}|${a}`; pair.set(k, (pair.get(k) || 0) + 1 / res); };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const a = own[y * n + x]; if (x + 1 < n) add(a, own[y * n + x + 1]); if (y + 1 < n) add(a, own[(y + 1) * n + x]); }
  const nb = shapes.map(() => new Map()), tot = shapes.map(() => 0);
  for (const [k, len] of pair) { const [i, j] = k.split('|').map(Number); if (i >= 0) { nb[i].set(j, (nb[i].get(j) || 0) + len); tot[i] += len; } if (j >= 0) { nb[j].set(i, (nb[j].get(i) || 0) + len); tot[j] += len; } }
  shapes.forEach((s, i) => {
    let best = -1, edge = 0; for (const [j, l] of nb[i]) if (l > edge) { edge = l; best = j; }
    if (best < 0 || edge / tot[i] < 0.6 || edge < 4) return;
    const q = toneRatio(s[1], shapes[best][1]);
    if (q < 1.15) bad.push(`shape ${i} (${s[0]} ${s[1]}) lies on shape ${best} (${shapes[best][1]}) at ${q.toFixed(2)}:1, ${edge.toFixed(0)} units of its edge: a detail needs 1.15:1 against its body, or it shows by hue alone`);
  });
  return bad;
}
/** Everything the rules have against a drawing. */
export const problemsOf = (shapes) => [...dataProblems(shapes), ...toneProblems(shapes), ...sizeProblems(shapes), ...shownProblems(shapes), ...detailProblems(shapes)];

/**
 * The look of a picture on a tile, to tell two pictures apart: the drawing rasterised on the tile in its own tones (2 samples a unit, as the marks' silhouettes are), 24 x 24 units, three bytes a sample.
 */
export function lookOf(shapes, tile = '#1d2634') {
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)], t = hex(tile), r = rasterise(shapes, 2), px = new Uint8Array(r.owner.length * 3);
  for (let i = 0; i < r.owner.length; i++) { const c = r.owner[i] >= 0 ? hex(PAL[shapes[r.owner[i]][1]]) : t; px[i * 3] = c[0]; px[i * 3 + 1] = c[1]; px[i * 3 + 2] = c[2]; }
  return px;
}
/** How far apart two looks are: the mean, over the samples, of the largest difference of a colour channel (0 for the same picture, 255 for black against white). The median pair of the kit is about 80 apart. */
export function lookDistance(a, b) { let sum = 0; for (let i = 0; i < a.length; i += 3) sum += Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); return sum / (a.length / 3); }
/**
 * Pictures that look alike: every pair of the table { id: shapes } that is closer than `min` (a mark, one tone in the text colour, has its own rule: tests/glyph-style.test.mjs holds that no two share a silhouette). Returns [{ a, b, distance }],
 * nearest first. `pairs` lists the pairs ('a|b') a screen declares to share a look on purpose.
 */
export function lookalikes(table, min, tile = '#1d2634', pairs = []) {
  const ids = Object.keys(table).filter((id) => !isMark(table[id])), look = Object.fromEntries(ids.map((id) => [id, lookOf(table[id], tile)])), out = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    if (pairs.includes(`${ids[i]}|${ids[j]}`) || pairs.includes(`${ids[j]}|${ids[i]}`)) continue;
    const distance = lookDistance(look[ids[i]], look[ids[j]]); if (distance < min) out.push({ a: ids[i], b: ids[j], distance });
  }
  return out.sort((x, y) => x.distance - y.distance);
}
