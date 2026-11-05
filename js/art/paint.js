// The glyph kit's other renderers, lazy (the world's marks and labels draw on a canvas, a stylesheet reads a data URI): the same drawing as the DOM's svg() in glyph.js, fills only.
import { GRID, PAL, body, shapesOf } from './glyph.js';

const STEPS = new Map(), OPS = { M: 'moveTo', L: 'lineTo', Q: 'quadraticCurveTo', C: 'bezierCurveTo' };
/** A path's M L Q C Z as [letter, ...numbers] steps, read once (no Path2D: the same calls work in a worker, an OffscreenCanvas and a recording context). */
function steps(d) {
  let s = STEPS.get(d);
  if (!s) { s = [...d.matchAll(/([MLQCZ])([^MLQCZ]*)/g)].map((m) => [m[1], ...(m[2].match(/-?\d*\.?\d+/g) || []).map(Number)]); STEPS.set(d, s); }
  return s;
}
/** Draws glyph `id` with its top-left corner at (x, y), `size` px square, on a 2D context. `tint` is the colour of a mark (cc). Returns false for an id nobody drew. */
export function paint(g, id, x, y, size, tint = '#ffffff') {
  const sh = shapesOf(id); if (!sh) return false;
  g.save(); g.translate(x, y); g.scale(size / GRID, size / GRID);
  for (const s of sh) {
    const k = s[0];
    g.fillStyle = s[1] === 'cc' ? tint : PAL[s[1]]; g.beginPath();
    if (k === 'c') g.arc(s[2], s[3], s[4], 0, 2 * Math.PI);
    else if (k === 'e') g.ellipse(s[2], s[3], s[4], s[5], 0, 0, 2 * Math.PI);
    else if (k === 'r') {
      const [, , x0, y0, w, h] = s, r = Math.min(s[6] || 0, w / 2, h / 2);
      if (r) { g.moveTo(x0 + r, y0); g.arcTo(x0 + w, y0, x0 + w, y0 + h, r); g.arcTo(x0 + w, y0 + h, x0, y0 + h, r); g.arcTo(x0, y0 + h, x0, y0, r); g.arcTo(x0, y0, x0 + w, y0, r); g.closePath(); } else g.rect(x0, y0, w, h);
    } else if (k === 'p') { g.moveTo(s[2], s[3]); for (let i = 4; i < s.length; i += 2) g.lineTo(s[i], s[i + 1]); g.closePath(); }
    else for (const [c, ...v] of steps(s[2])) { if (c === 'Z') g.closePath(); else g[OPS[c]](...v); }
    if (k === 'd' && s[3]) g.fill('evenodd'); else g.fill();
  }
  g.restore(); return true;
}
/** The drawing as a data: URI for a CSS mask-image (a mark: the mask reads the shape, the colour is the element's background) or a background-image. `tint` replaces currentColor. '' for an id nobody drew. */
export const uri = (id, tint = '#000') => (shapesOf(id) ? 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body(id, tint)}</svg>`) : '');
