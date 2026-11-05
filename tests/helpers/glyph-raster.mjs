// A small software rasteriser for the glyph kit's shape lists (js/art/glyph.js: circle, ellipse, rounded rectangle, polygon, M L Q C Z path with even-odd or non-zero fill), no canvas and no browser.
// What the style test measures with it is what a glyph really SHOWS: how much of the grid it covers, where its centre of mass is, how much of each shape is left uncovered by the shapes painted after it.
const SEG = { arc: 48, corner: 6, quad: 10, cubic: 12 };

/** A shape as polylines (lists of [x, y]) in glyph units. */
export function polys(s) {
  const k = s[0];
  if (k === 'c' || k === 'e') { const rx = s[4], ry = k === 'c' ? s[4] : s[5], out = []; for (let i = 0; i < SEG.arc; i++) { const a = (i / SEG.arc) * Math.PI * 2; out.push([s[2] + rx * Math.cos(a), s[3] + ry * Math.sin(a)]); } return [out]; }
  if (k === 'r') {
    const [, , x, y, w, h] = s, r = Math.min(s[6] || 0, w / 2, h / 2);
    if (!r) return [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]];
    const out = [], corner = (cx, cy, a0) => { for (let i = 0; i <= SEG.corner; i++) { const a = a0 + (i / SEG.corner) * Math.PI / 2; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
    corner(x + w - r, y + r, -Math.PI / 2); corner(x + w - r, y + h - r, 0); corner(x + r, y + h - r, Math.PI / 2); corner(x + r, y + r, Math.PI);
    return [out];
  }
  if (k === 'p') { const out = []; for (let i = 2; i < s.length; i += 2) out.push([s[i], s[i + 1]]); return [out]; }
  const t = s[2].match(/[MLQCZ]|-?\d*\.?\d+/g), subs = []; let i = 0, cur = null, start = null;
  const num = () => parseFloat(t[i++]);
  while (i < t.length) {
    const c = t[i++];
    if (c === 'M') { cur = [num(), num()]; start = cur; subs.push([cur]); }
    else if (c === 'L') { cur = [num(), num()]; subs.at(-1).push(cur); }
    else if (c === 'Q') { const a = [num(), num()], p = [num(), num()]; for (let j = 1; j <= SEG.quad; j++) { const u = j / SEG.quad, v = 1 - u; subs.at(-1).push([v * v * cur[0] + 2 * v * u * a[0] + u * u * p[0], v * v * cur[1] + 2 * v * u * a[1] + u * u * p[1]]); } cur = p; }
    else if (c === 'C') { const a = [num(), num()], b = [num(), num()], p = [num(), num()]; for (let j = 1; j <= SEG.cubic; j++) { const u = j / SEG.cubic, v = 1 - u; subs.at(-1).push([v ** 3 * cur[0] + 3 * v * v * u * a[0] + 3 * v * u * u * b[0] + u ** 3 * p[0], v ** 3 * cur[1] + 3 * v * v * u * a[1] + 3 * v * u * u * b[1] + u ** 3 * p[1]]); } cur = p; }
    else if (c === 'Z') cur = start;
  }
  return subs;
}
/** Is (x, y) inside the polylines under the even-odd or the non-zero rule? */
export function inside(pl, x, y, evenOdd) {
  let wind = 0, par = 0;
  for (const poly of pl) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a[1] <= y) !== (b[1] <= y)) { const xi = a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]); if (xi > x) { par ^= 1; wind += b[1] > a[1] ? 1 : -1; } }
  }
  return evenOdd ? par === 1 : wind !== 0;
}
/**
 * The share of what a glyph covers that is narrower than `d` units (a 1 px line at 16 px is 1.5): the part of the picture that an opening with a disc of diameter d takes away
 * (the sharp tip of a star or a triangle is thin by nature, so some of it is always found). Measured on a grid of 4 samples a unit.
 */
export function thinShare(shapes, d = 1.5) {
  const res = 4, n = 24 * res, r = rasterise(shapes, res), rad = (d / 2) * res, disc = [];
  for (let dy = -Math.ceil(rad); dy <= Math.ceil(rad); dy++) for (let dx = -Math.ceil(rad); dx <= Math.ceil(rad); dx++) if (dx * dx + dy * dy <= rad * rad + 0.01) disc.push([dx, dy]);
  const on = (m, x, y) => x >= 0 && y >= 0 && x < n && y < n && m[y * n + x], solid = new Uint8Array(n * n), eroded = new Uint8Array(n * n), opened = new Uint8Array(n * n);
  for (let i = 0; i < solid.length; i++) solid[i] = r.owner[i] >= 0 ? 1 : 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (solid[y * n + x] && disc.every(([dx, dy]) => on(solid, x + dx, y + dy))) eroded[y * n + x] = 1;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (eroded[y * n + x]) for (const [dx, dy] of disc) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < n && Y < n) opened[Y * n + X] = 1; }
  let all = 0, thin = 0; for (let i = 0; i < solid.length; i++) if (solid[i]) { all++; if (!opened[i]) thin++; }
  return all ? thin / all : 0;
}
/**
 * Paints a glyph's shapes in order onto a grid of `res` samples a unit and says which shape is on top at each sample.
 * Returns { res, owner (Int16Array of res * 24 squared: the index of the top shape at the sample, -1 for none), left (samples of each shape that nothing painted later covers), covered (samples painted), cx, cy (their centre of mass) }.
 */
export function rasterise(shapes, res = 2) {
  const n = 24 * res, pls = shapes.map(polys), eo = shapes.map((s) => s[0] === 'd' && !!s[3]), owner = new Int16Array(n * n).fill(-1), left = new Array(shapes.length).fill(0);
  const bb = pls.map((pl) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const poly of pl) for (const [x, y] of poly) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; });
  let covered = 0, sx = 0, sy = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / res, y = (j + 0.5) / res;
    for (let k = shapes.length - 1; k >= 0; k--) {
      const b = bb[k]; if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (inside(pls[k], x, y, eo[k])) { owner[j * n + i] = k; left[k]++; covered++; sx += x; sy += y; break; }
    }
  }
  return { res, owner, left, covered, cx: covered ? sx / covered : 12, cy: covered ? sy / covered : 12 };
}
