// Helpers for DRAWING glyphs: a developer tool, never shipped. A drawing script imports these, builds a table { id: [shapes] } and calls write(), which rewrites a set module (js/art/g-*.js)
// in the format the kit reads: one glyph a line, one decimal a number. The shapes are the literal lists the game ships (js/art/glyph.js says what they mean, tests/glyph-style.test.mjs what they may do).
//   import { C, E, R, P, D, circ, ell, rrp, rpoly, ring, bar, star, turn, move, scale, flipX, write } from '../../scripts/glyph-draw.mjs';
//   write({ check: [P('cc', 3.4, 12.9, 6.2, 10.1, 9.8, 13.7, 17.8, 5.5, 20.6, 8.3, 9.8, 19.3)] }, 'js/art/g-ui.js', ['The interface glyphs ...']);
import { writeFileSync } from 'node:fs';
import { problemsOf } from '../tests/helpers/glyph-rules.mjs';

/** A number to one decimal (the format keeps the data small and every coordinate on a tenth of a unit). */
export const n = (v) => Math.round(v * 10) / 10;
const f = (v) => String(n(v)).replace(/^-0$/, '0');

// ----- shapes (t is a tone: a key of PAL in js/art/glyph.js; 'cc' is currentColor, a one-tone mark)
export const C = (t, cx, cy, r) => ['c', t, n(cx), n(cy), n(r)];                                          // circle
export const E = (t, cx, cy, rx, ry) => ['e', t, n(cx), n(cy), n(rx), n(ry)];                              // ellipse
export const R = (t, x, y, w, h, rx = 0) => (rx ? ['r', t, n(x), n(y), n(w), n(h), n(rx)] : ['r', t, n(x), n(y), n(w), n(h)]); // rounded rectangle (rx at most half the shorter side: a pill is rx = h / 2)
export const P = (t, ...pts) => ['p', t, ...pts.map(n)];                                                   // polygon: x1, y1, x2, y2, ...
export const D = (t, d, holes = false) => (holes ? ['d', t, d, 'e'] : ['d', t, d]);                        // path (absolute M L Q C Z); holes = even-odd, so a second outline cuts a hole

// ----- path pieces: strings to join into one D() path
const K = 0.5523; // the cubic that draws a quarter circle
/** An ellipse as four cubics. */
export const ell = (cx, cy, rx, ry) => `M${f(cx + rx)} ${f(cy)}C${f(cx + rx)} ${f(cy + K * ry)} ${f(cx + K * rx)} ${f(cy + ry)} ${f(cx)} ${f(cy + ry)}C${f(cx - K * rx)} ${f(cy + ry)} ${f(cx - rx)} ${f(cy + K * ry)} ${f(cx - rx)} ${f(cy)}C${f(cx - rx)} ${f(cy - K * ry)} ${f(cx - K * rx)} ${f(cy - ry)} ${f(cx)} ${f(cy - ry)}C${f(cx + K * rx)} ${f(cy - ry)} ${f(cx + rx)} ${f(cy - K * ry)} ${f(cx + rx)} ${f(cy)}Z`;
/** A circle as four cubics. */
export const circ = (cx, cy, r) => ell(cx, cy, r, r);
/** A rounded rectangle as a path (for a hole or a part of a bigger path). */
export const rrp = (x, y, w, h, r) => `M${f(x + r)} ${f(y)}L${f(x + w - r)} ${f(y)}Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)}L${f(x + w)} ${f(y + h - r)}Q${f(x + w)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)}L${f(x + r)} ${f(y + h)}Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)}L${f(x)} ${f(y + r)}Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}Z`;
/** A polygon as a path piece. */
export function polyD(...pts) { let d = ''; for (let i = 0; i < pts.length; i += 2) d += (i ? 'L' : 'M') + f(pts[i]) + ' ' + f(pts[i + 1]); return d + 'Z'; }
/** A polygon with its corners rounded: each corner is cut r along both edges and joined through the vertex by a Q. Two decimals (the format allows them), as a path piece. */
export function rpoly(r, ...pts) {
  const k = pts.length / 2, g = (v) => String(Math.round(v * 100) / 100), at = (i) => [pts[(((i % k) + k) % k) * 2], pts[(((i % k) + k) % k) * 2 + 1]];
  let d = '';
  for (let i = 0; i < k; i++) {
    const [px, py] = at(i - 1), [x, y] = at(i), [nx, ny] = at(i + 1), a = Math.hypot(px - x, py - y), b = Math.hypot(nx - x, ny - y), ra = Math.min(r, a / 2), rb = Math.min(r, b / 2);
    d += `${i ? 'L' : 'M'}${g(x + (px - x) * ra / a)} ${g(y + (py - y) * ra / a)}Q${g(x)} ${g(y)} ${g(x + (nx - x) * rb / b)} ${g(y + (ny - y) * rb / b)}`;
  }
  return d + 'Z';
}
/** A ring: a disc with a round hole. */
export const ring = (t, cx, cy, R0, r0) => D(t, circ(cx, cy, R0) + circ(cx, cy, r0), true);
/** A bar with round ends from (x1, y1) to (x2, y2), w wide, as a path (a pencil, a handle, a strap). */
export function barD(x1, y1, x2, y2, w) {
  const r = w / 2, L = Math.hypot(x2 - x1, y2 - y1), dx = (x2 - x1) / L, dy = (y2 - y1) / L, nx = -dy * r, ny = dx * r, h = (4 / 3) * r;
  return `M${f(x1 + nx)} ${f(y1 + ny)}L${f(x2 + nx)} ${f(y2 + ny)}C${f(x2 + nx + dx * h)} ${f(y2 + ny + dy * h)} ${f(x2 - nx + dx * h)} ${f(y2 - ny + dy * h)} ${f(x2 - nx)} ${f(y2 - ny)}L${f(x1 - nx)} ${f(y1 - ny)}C${f(x1 - nx - dx * h)} ${f(y1 - ny - dy * h)} ${f(x1 + nx - dx * h)} ${f(y1 + ny - dy * h)} ${f(x1 + nx)} ${f(y1 + ny)}Z`;
}
export const bar = (t, x1, y1, x2, y2, w) => D(t, barD(x1, y1, x2, y2, w));
/** The four points of a bar with square ends from (x1, y1) to (x2, y2), w wide, always wound the same way: several of them joined into one path with polyD() are one shape, their overlaps merge (a frame of tubes). */
export function barP(x1, y1, x2, y2, w) { const r = w / 2, L = Math.hypot(x2 - x1, y2 - y1), nx = (-(y2 - y1) / L) * r, ny = ((x2 - x1) / L) * r; return [x1 + nx, y1 + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, x1 - nx, y1 - ny]; }
/** The points of a star: k points, outer radius R, inner radius r, one point straight up. */
export function star(cx, cy, R0, r0, k = 5) { const out = []; for (let i = 0; i < k * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / k, rr = i % 2 ? r0 : R0; out.push(cx + rr * Math.cos(a), cy + rr * Math.sin(a)); } return out; }
/** Points (x1, y1, x2, y2, ...) turned by deg degrees about (cx, cy). */
export function turn(pts, cx, cy, deg) { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), out = []; for (let i = 0; i < pts.length; i += 2) { const x = pts[i] - cx, y = pts[i + 1] - cy; out.push(cx + x * c - y * s, cy + x * s + y * c); } return out; }

// ----- moving a drawing about (translate, scale, flip: nothing that would need a tilted rectangle)
const pathMap = (d, fn) => { let i = 0; return d.replace(/-?\d*\.?\d+/g, (m) => f(fn(parseFloat(m), i++ % 2))); };
/** Maps every x with fx and every y with fy; `w` maps a length along x, `h` along y (a rectangle's size and radius, a circle's radius uses the smaller). */
function xf(shapes, fx, fy, w, h) {
  return shapes.map((s) => {
    const [k, t] = s;
    if (k === 'c') return ['c', t, n(fx(s[2])), n(fy(s[3])), n(Math.min(w(s[4]), h(s[4])))];
    if (k === 'e') return ['e', t, n(fx(s[2])), n(fy(s[3])), n(w(s[4])), n(h(s[5]))];
    if (k === 'r') { const x0 = fx(s[2]), x1 = fx(s[2] + s[4]), y0 = fy(s[3]), y1 = fy(s[3] + s[5]), r = s[6] ? n(Math.min(w(s[6]), h(s[6]))) : 0; return R(t, Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0), r); }
    if (k === 'p') { const o = []; for (let i = 2; i < s.length; i += 2) o.push(fx(s[i]), fy(s[i + 1])); return P(t, ...o); }
    return D(t, pathMap(s[2], (v, i) => (i ? fy(v) : fx(v))), !!s[3]);
  });
}
export const move = (shapes, dx, dy) => xf(shapes, (x) => x + dx, (y) => y + dy, (l) => l, (l) => l);
/** Scales about (cx, cy), 12 12 by default. */
export const scale = (shapes, k, cx = 12, cy = 12) => xf(shapes, (x) => cx + (x - cx) * k, (y) => cy + (y - cy) * k, (l) => l * k, (l) => l * k);
/** Mirrors left to right about the middle of the grid (a polygon's winding turns: fine for fills). */
export const flipX = (shapes) => xf(shapes, (x) => 24 - x, (y) => y, (l) => l, (l) => l);

// ----- writing a set module
/** The source of a set module: `intro` lines are its comment, `table` is { id: shapes }. */
export function source(table, intro = []) {
  let src = intro.map((l) => `// ${l}\n`).join('') + "import { register } from './glyph.js';\nexport const GLYPHS = {\n";
  for (const [id, shapes] of Object.entries(table)) src += `  ${/^[a-z][A-Za-z0-9]*$/.test(id) ? id : `'${id}'`}: ${JSON.stringify(shapes).replace(/"/g, "'")},\n`;
  return src + '};\nregister(GLYPHS);\n';
}
/** Rewrites the set module at `file` (a path from the repository's root or an absolute one) and says what the style rules have against any glyph of it (the same rules as tests/glyph-style.test.mjs; the file is written either way). Returns the list. */
export function write(table, file, intro = []) {
  const bad = []; for (const [id, shapes] of Object.entries(table)) for (const m of problemsOf(shapes)) bad.push(`${id}: ${m}`);
  writeFileSync(file, source(table, intro));
  console.log(`wrote ${Object.keys(table).length} glyphs to ${file}`);
  if (bad.length) console.log(`${bad.length} against the rules (tests/glyph-style.test.mjs):\n  ${bad.join('\n  ')}`); else console.log('within the rules');
  return bad;
}
