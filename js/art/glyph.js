// Glyph kit core (static, tiny): flat shapes on a 24 grid, painted in order, [kind, tone, ...numbers]: c e r p d. Sets: g-*.js. Rules: tests/glyph-style.test.mjs. Canvas, data URI: paint.js.
export const GRID = 24;
// Tones: matte, 3:1 or better on the dark tile and on black. cc is currentColor: a mark.
export const PAL = {
  W: '#fffaf0', s: '#bdc7df', sd: '#8d9bbb', k: '#757ea5', n: '#d4985c', nd: '#b1754b', sk: '#f8c696', skd: '#e2a577',
  r: '#ff6f61', rd: '#db5457', o: '#ffa453', od: '#e7813b', y: '#ffdd6d', yd: '#eab734', g: '#56d682', gd: '#32ad70', t: '#3fdae2', td: '#2bb0bf',
  b: '#62a9fe', bd: '#5185e1', v: '#ae8fff', vd: '#8e6de8', p: '#fe94bf', pd: '#e1699f', cc: 'currentColor',
};
const REG = new Map(), T = { c: ['circle', 'cx cy r'], e: ['ellipse', 'cx cy rx ry'], r: ['rect', 'x y width height rx'] };
export function register(set) { for (const id in set) { if (REG.has(id)) throw new Error('glyph defined twice: ' + id); REG.set(id, set[id]); } }
export const has = (id) => REG.has(id), idsOf = () => [...REG.keys()], shapesOf = (id) => REG.get(id) || null;
export const body = (id, cc = 'currentColor') => shapesOf(id).map((s) => {
  const f = ` fill="${s[1] === 'cc' ? cc : PAL[s[1]]}"/>`, k = s[0], [tag, at] = T[k] || [];
  return k === 'p' ? `<polygon points="${s.slice(2)}"${f}` : k === 'd' ? `<path d="${s[2]}"${s[3] ? ' fill-rule="evenodd"' : ''}${f}` : `<${tag}${at.split(' ').map((a, i) => (s[i + 2] ? ` ${a}="${s[i + 2]}"` : '')).join('')}${f}`;
}).join('');
/** Inline SVG ('' if undrawn), aria-hidden unless `label`; sized by CSS (.gl .gl-sm .gl-lg) unless `size` px. */
export const svg = (id, { size, label, cls } = {}) => has(id)
  ? `<svg class="gl${shapesOf(id).some((s) => s[1] !== 'cc') ? ' gl-c' : ''}${cls ? ' ' + cls : ''}" viewBox="0 0 24 24"${size ? ` width="${size}" height="${size}"` : ''} ${label ? `role="img" aria-label="${label.replace(/[&"]/g, (c) => '&#' + c.charCodeAt(0) + ';')}"` : 'aria-hidden="true"'}>${body(id)}</svg>` : '';
