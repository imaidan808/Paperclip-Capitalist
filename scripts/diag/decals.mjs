import { LAYOUT, DIST } from '../../js/world/layout.js';
const c = {}; let total = 0; for (const D of Object.values(DIST)) for (const d of D.decals) { c[d.k] = (c[d.k] || 0) + 1; total++; }
console.log('decals by kind', JSON.stringify(c), 'total', total);
console.log('districts with a water decal:', Object.values(DIST).filter((D) => D.decals.some((d) => d.k === 'water')).map((D) => D.id + ':' + D.theme).join(' '));
let props = 0, types = {}; for (const p of LAYOUT.props) { props++; types[p.t] = (types[p.t] || 0) + 1; } console.log('props', props, 'types', Object.keys(types).length);
console.log('cliff quads', LAYOUT.cliffs.length, 'bridges', LAYOUT.bridges.length, 'road edges', LAYOUT.edges.length);
