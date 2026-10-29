// Every colour of the toy island, as data: the ramps and tables of docs/ART_DIRECTION.md section 2, the face model, the veil over a locked district, the depth ramp of the sea and the
// grade of the hour. Pure: nothing here draws, and nothing here reads the game.
// Owner: T2 ATMOSPHERE (colour and light), docs/RENDER_PLAN.md. Other tracks import from it and add nothing to it: a track-local colour is a `mix`/`shade` of these in the track's own module
// (the palette audit allows exactly that). The values are held to the machine-checked block of the art direction by tests/world-palette.test.mjs.
//
// The old palette (olive terrain, slate asphalt, `#121826` fog, ink `rgb(8,10,20)`) is retired in full; a world module that still uses it is a legacy drawer waiting for its V2.
import { mix, shade, gray, luma, rgb, hex, clamp, setVeil } from './iso.js';
import { FOG_DIM } from './common.js';

/** A five-stop ramp: hi (sun-struck), light, mid (the body colour), shade (shifted towards violet-blue), deep. */
const ramp = (hi, light, mid, shd, deep, extra) => Object.freeze({ hi, light, mid, shade: shd, deep, ...extra });

// ---------------------------------------------------------------- 2.2 named ramps
export const SKY = Object.freeze({ zenith: '#6fb7ee', mid: '#9fd6f6', horizon: '#fdf3dc', sun: '#fff2bd' });
/** Water. The depth stops (distance from the nearest shore in tiles) are SEA_STOPS; the rest are accents. */
export const SEA = Object.freeze({ foam: '#fbfffe', shoal: '#c4f4e6', shallow: '#7be0cf', lagoon: '#43c8d0', sea: '#2fa6d6', deep: '#2b80cf', abyss: '#2358b0', crest: '#e2faff', trough: '#2a6fc0', caustic: '#c8fff0', sparkle: '#ffffff', ring: '#eaffff' });
export const SEA_STOPS = Object.freeze([
  { id: 'foam', tiles: 0, hex: SEA.foam }, { id: 'shoal', tiles: 0.8, hex: SEA.shoal }, { id: 'shallow', tiles: 2.5, hex: SEA.shallow }, { id: 'lagoon', tiles: 6, hex: SEA.lagoon },
  { id: 'sea', tiles: 14, hex: SEA.sea }, { id: 'deep', tiles: 28, hex: SEA.deep }, { id: 'abyss', tiles: 48, hex: SEA.abyss },
].map(Object.freeze));
export const SAND = ramp('#fff4d2', '#f9e1a6', '#f0c985', '#d9a869', '#a67c6e', { wet: '#c99a68', wetSheen: '#e8d2b0' });
export const GRASS = ramp('#c9ee7a', '#a4dc66', '#7cc65a', '#4fa956', '#2c7358', { coolShade: '#3a8f62', dry: '#d5e07a', lawn: '#8fd68a', lawnShade: '#6cc178' });
export const BLOOM = Object.freeze({ white: '#fffbe8', butter: '#ffd84d', pink: '#ff9cc2', lilac: '#c9a6ff', poppy: '#ff6a55' });
export const SOIL = ramp('#e7b27d', '#d29a64', '#b87b4e', '#8f5a3f', '#5d3a2e', { rowLight: '#b77a4c', rowDark: '#8d5b3a' });
export const ROCK = ramp('#f2d6aa', '#e0b98a', '#c79b78', '#9a766f', '#6e5470', { strata: '#8f6a66' });
export const ROCKHI = ramp('#e2d9ea', '#c6bad6', '#a597bd', '#7c6e9c', '#574b7a');
export const ROAD = ramp('#8c91b2', '#7d82a3', '#6b7092', '#585d7e', '#474b69', { kerb: '#efe6d2', dash: '#ffe27a', laneEdge: '#fff8e2', zebra: '#fffaf0', manhole: '#5a5f80' });
export const PAVE = Object.freeze({ cream: '#f4e8cf', joint: '#e0cfae', plaza: '#efdcc5', redPaver: '#e8a58f', cobble: '#dcc4a4', cobbleJoint: '#c8ae8c' });
export const WOOD = ramp('#f7d9a4', '#e8b872', '#cc8f50', '#9c6238', '#6a4128');
export const BRICK = ramp('#f0a285', '#e0795a', '#c85f47', '#98413f', mix('#98413f', '#2c2a56', 0.35), { mortar: '#f6dcc4' });
export const PLASTER = Object.freeze({ cream: '#fff0d4', peach: '#ffd8b6', mint: '#cdeedc', sky: '#cfe6f7', lilac: '#e1d4f3', butter: '#ffe8a0', rose: '#ffc8d0' });
export const TILE = Object.freeze({ terracotta: '#e2704c', terracottaShade: '#b84a3a', teal: '#3fb9b2', tealShade: '#278c94', plum: '#a272c8', plumShade: '#744c9e', mustard: '#f4bb3e', mustardShade: '#cb9022', slate: '#7396d6', slateShade: '#4d6cb4', thatch: '#e6c070' });
export const METAL = Object.freeze({ steelHi: '#dfe6f4', steelLight: '#b2bed8', steelMid: '#8392b4', steelShade: '#5b6890', brass: '#f6c94f', brassShade: '#d9a52c', copper: '#e89a6a', rust: '#c9693d', corrugated: '#f3f6fc' });
export const GLASS = Object.freeze({ top: '#b8e8fb', mid: '#78bdec', low: '#4d8fd6', reflection: '#ffffff', unlit: '#4a6fb8', lit: '#ffe08a', litDeep: '#ffc65c', curtain: '#f6b9c8' });
export const TOY = Object.freeze({ red: '#ff5f4e', orange: '#ff9a3a', yellow: '#ffd84d', green: '#52cf7c', cyan: '#3ad4e6', blue: '#4a8ff0', violet: '#9a6bff', pink: '#ff7fb8' });
export const INK = Object.freeze({ darkest: '#2c2a56', text: '#3a2f5e', contour: '#5a4a8c' });
/** Light and shade (2.3). The shadow colour is never black: a veil over the world is violet-blue or warm. */
export const LIGHT = Object.freeze({ key: '#fff1c9', fill: '#bcd8ff', shadow: '#4a3f88', ao: '#5c4c96', contact: '#3b3374', rim: '#fffbe6', bounce: '#ffd7a0', white: '#fffaf0', black: INK.darkest });
export const CLOUD = Object.freeze({ body: '#f7f9ff', belly: '#c3d1f2', top: '#ffffff', rim: '#e9f0ff', base: '#aebfe8', back: '#e3ebfb', veil: '#d8defa', shadow: '#5a5fa0' });
export const GRADE = Object.freeze({ day: '#ffffff', dusk: '#ffd0a0', night: '#8c98de', rain: '#c4d0e8', horizon: '#fdf3dc', nightMeanLumaMin: 0.34 });

// ---------------------------------------------------------------- 2.4 districts: the daylight palette of all sixteen, keyed by the theme in js/data
export const DISTRICT_DAY = Object.freeze({
  scrap: { ground: '#d4c070', walk: '#eddfbb', accent: '#f08a3c', accent2: '#5b8bd0' }, market: { ground: '#f5b98a', walk: '#f3dec0', accent: '#ffc93c', accent2: '#36b5a8' },
  campus: { ground: '#eab5a4', walk: '#f1ddc5', accent: '#38c06f', accent2: '#fff0d2' }, pawn: { ground: '#8fdcd0', walk: '#e1e4cd', accent: '#f2c14a', accent2: '#ff6fae' },
  metro: { ground: '#a9bfdc', walk: '#e6dfcf', accent: '#4aa6ff', accent2: '#e8f2ff' }, estate: { ground: '#dcb0d2', walk: '#efdccd', accent: '#f6e8c8', accent2: '#e8c56a' },
  auto: { ground: '#b0b8d6', walk: '#e7dece', accent: '#ff5a47', accent2: '#f4f6fb' }, harbor: { ground: '#a3bbd9', walk: '#e5dece', accent: '#ff9a2e', accent2: '#2f5fa8' },
  industrial: { ground: '#adc0d8', walk: '#e6dfce', accent: '#ffd02e', accent2: '#8aa0b8' }, tech: { ground: '#c4d4f0', walk: '#ebe3d2', accent: '#22d9ee', accent2: '#9a6bff' },
  farm: { ground: '#9bdc7e', walk: '#e3e4be', accent: '#f1c243', accent2: '#d9553f' }, creative: { ground: '#f0b6dc', walk: '#f2ddcf', accent: '#9a6bff', accent2: '#ff4fa3' },
  corporate: { ground: '#a8cdf0', walk: '#e6e2d2', accent: '#dff2ff', accent2: '#3f8fe0' }, finance: { ground: '#a8e0c4', walk: '#e6e5cb', accent: '#25b97a', accent2: '#e2b441' },
  realty: { ground: '#f1b59a', walk: '#f3ddc3', accent: '#f6dcb5', accent2: '#e8795a' }, exchange: { ground: '#f3dc8e', walk: '#f3e4c1', accent: '#f7c948', accent2: '#2b2417' },
});
/** A district's whole daylight set: its table row plus the four colours the rules derive from the ground (hi, alt, pad, road). Undefined for a theme that is not one of the sixteen. */
export function groundSet(theme) {
  const row = Object.hasOwn(DISTRICT_DAY, theme) ? DISTRICT_DAY[theme] : null; if (!row) return undefined;
  const g = row.ground;
  return { ...row, hi: mix(g, LIGHT.white, 0.28), alt: mix(g, '#6a5a9c', 0.12), pad: mix(g, '#7a6aa8', 0.18), road: mix(ROAD.mid, g, 0.10) };
}

// ---------------------------------------------------------------- 2.5 crates by tag, 2.6 people
export const CRATE_TAGS = Object.freeze({
  tool: '#b5c0d6', office: '#f4eed8', prestige: '#a98be0', paper: '#fff0cf', retro: '#e8a15a', electronics: '#6bc4e8', vehicle: '#ff7a63', consumer: '#ff8fb3', trend: '#ff5fb8', scrap: '#b79a78', industrial: '#c9ad7a',
  training: '#5fd08c', digital: '#8ae8ff', b2b: '#7e93e6', franchise: '#ffd96a', infra: '#9a8ce0', food: '#ffb066', farm: '#b4dc6a', bulk: '#d2bf93', marine: '#5cb9e8', collectible: '#f2c94c', luxury: '#c9a0f2',
  fashion: '#ff8fc0', ip: '#a98cff', media: '#f06cc0', realty: '#ee9a7a', finance: '#5fd69e', energy: '#ffe05a', medical: '#f2f8ff', home: '#d8b48c', outdoor: '#7cd07a', gem: '#78eed8',
});
/** The colour of a crate of a given first tag; an unknown tag gets a warm neutral that is still light. */
export const crateColor = (tag) => (Object.hasOwn(CRATE_TAGS, tag) ? CRATE_TAGS[tag] : '#e0c9a0');
export const PEOPLE = Object.freeze({
  shirts: Object.freeze(['#ff6a55', '#ff9a3a', '#ffd84d', '#7bd36a', '#3ad4b6', '#4aa0f0', '#7f7bf0', '#b383f0', '#ff7fb8', '#f2f0e6', '#e85a8a', '#8fe0e8']),
  hair: Object.freeze(['#3a2a22', '#6b3f24', '#b9772c', '#e8c36a', '#8a8fa8', '#2e2a4a']), skin: Object.freeze(['#ffdcb8', '#f3c08f', '#dca070', '#b97a4e', '#8e5836', '#6b3f2a']),
  pants: Object.freeze(['#4a5a9a', '#6b5a8f', '#3e6b73', '#8a6a4a', '#d8cdb8']), cheeks: '#ff9aa8', eyes: INK.darkest, player: Object.freeze({ jacket: TOY.red, scarf: '#fffaf0' }),
});
/** One look from one hash number (the same person for the same id, every time): { shirt, hair, skin, pants }. The bit fields are separate so no two parts move together. */
export const personLook = (h) => ({ shirt: PEOPLE.shirts[h % PEOPLE.shirts.length], hair: PEOPLE.hair[(h >>> 4) % PEOPLE.hair.length], skin: PEOPLE.skin[(h >>> 8) % PEOPLE.skin.length], pants: PEOPLE.pants[(h >>> 12) % PEOPLE.pants.length] });

// ---------------------------------------------------------------- 2.1 the face model, and the veil
const faceMemo = new Map();
/**
 * A prism's three face colours from its body colour `c` (replaces iso.tone): the top lifted towards warm cream, the sun-side left face darker and a touch warmer, the shade-side right face darker again
 * and pulled towards violet-blue. { t, l, r } like tone(), and as shared and frozen: never change it. The steps are what makes a pastel box read as a solid at a glance: the luma falls by at least 15% from the
 * top to the left face and by at least 15% from the left face to the right one for every plaster, tile, brick, metal, wood and toy colour (tests/world-palette.test.mjs; the first version stepped only 8 to
 * 14% from top to left, so a cream wall and its roof read as one plane).
 */
export function faceTone(c) {
  let v = faceMemo.get(c);
  if (v === undefined) { v = Object.freeze({ t: mix(c, '#fff7dc', 0.18), l: mix(shade(c, 0.84), '#ffd9a8', 0.04), r: mix(shade(c, 0.68), '#5a52a8', 0.18) }); if (faceMemo.size > 3000) faceMemo.clear(); faceMemo.set(c, v); }
  return v;
}
const veilMemo = new Map();
/**
 * The colour of something under cloud (replaces iso.fogged): desaturated by 0.45 k, then 22% k towards lilac-white, so it is never darker than its source by more than a twentieth.
 * k is 1 while a district is locked and falls to 0 as it opens. A district keeps what it is and what colour it is; it is veiled, not buried.
 */
export function veiled(c, k) {
  if (!(k > 0.01)) return c;
  const kk = Math.round(clamp(k, 0, 1) * 50) / 50; let m = veilMemo.get(c); if (!m) { if (veilMemo.size > 2000) veilMemo.clear(); m = new Map(); veilMemo.set(c, m); }
  let v = m.get(kk);
  if (v === undefined) { v = mix(mix(c, gray(c), 0.45 * kk), CLOUD.veil, 0.22 * kk); if (m.size > 48) m.clear(); m.set(kk, v); }
  return v;
}

/** The legacy callers of iso.fogged pass fxOf's `dim` (0 to FOG_DIM); while the clouds are V2 they get the veil (setVeil): k = dim / FOG_DIM. */
setVeil((c, dim) => veiled(c, dim / FOG_DIM));

// ---------------------------------------------------------------- 5.1 the sea's depth ramp
const smooth = (x) => { const t = x < 0 ? 0 : x > 1 ? 1 : x; return t * t * (3 - 2 * t); };
/**
 * The colour of the sea `d` tiles from the nearest shore: foam at the line, a pale shoal, turquoise shallows, aqua, open blue, then cobalt and the far deep, mixed with a smoothstep between
 * the stops (SEA_STOPS). d is in tiles, hypot(dx, 2 dy) / 45.25 for world-pixel offsets on the water plane.
 */
export function seaRamp(d) {
  const S = SEA_STOPS; if (!(d > 0)) return S[0].hex;
  for (let i = 1; i < S.length; i++) if (d < S[i].tiles) return mix(S[i - 1].hex, S[i].hex, smooth((d - S[i - 1].tiles) / (S[i].tiles - S[i - 1].tiles)));
  return S[S.length - 1].hex;
}

// ---------------------------------------------------------------- 2.7 the grade of the hour
/** The sun's hour (0 to 24) for a virtual game hour: the same shift lighting.js uses, so the run starts at 08:00 with the sun well up. */
export const sunHourOf = (gameHour) => ((gameHour ?? 0) + 8) % 24;
/** The phase names of the day: day 07:00 to 16:59, evening 17:00 to 19:59, night 20:00 to 03:59, dawn 04:00 to 06:59 (sun hours). */
export function phaseOf(h) { return h >= 7 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'evening' : h >= 4 && h < 7 ? 'dawn' : 'night'; }
/** `night` (0 bright day, 1 deep night) and `dusk` (0..1, the golden hour on either side of the sun) for a sun hour. The same curves as lighting.js dayTargets (a test holds them equal). */
export function skyOf(h, out = { night: 0, dusk: 0 }) {
  const bump = (c, w) => Math.max(0, 1 - ((h - c) / w) ** 2);
  out.night = h >= 7 && h < 17 ? 0 : h >= 17 && h < 20 ? (h - 17) / 3 : h >= 4 && h < 7 ? 1 - (h - 4) / 3 : 1;
  out.dusk = Math.max(bump(17.8, 1.7), bump(6.1, 1.2));
  return out;
}
const ROSE_RGB = [236, 150, 196], GOLD_RGB = rgb(GRADE.dusk), NIGHT_RGB = rgb(GRADE.night), RAIN_RGB = rgb(GRADE.rain);
let tKey = -1, tStr = '';
/**
 * The multiply colour of the grade (replaces lighting.tintOf): white by day (answered as ''), warm gold at dawn and dusk, periwinkle at night (#8c98de at full night: luma 0.61, never murky),
 * and a cool grey-blue multiply in a credit crunch. The same string object until the colour changes.
 */
export function tintFor(night, dusk, crunch) {
  let r = 255, g = 255, b = 255;
  if (dusk > 0.01) { const k = dusk * (1 - night * 0.4) * 0.92; r += (GOLD_RGB[0] - r) * k; g += (GOLD_RGB[1] - g) * k; b += (GOLD_RGB[2] - b) * k; }
  if (dusk > 0.01 && night > 0.3 && night < 0.8) { const k = dusk * (1 - ((night - 0.55) / 0.25) ** 2) * 0.9; if (k > 0) { r += (ROSE_RGB[0] - r) * k; g += (ROSE_RGB[1] - g) * k; b += (ROSE_RGB[2] - b) * k; } } // the blue hour: gold and periwinkle mixed straight are grey, so the middle of the evening is pulled through a rose-violet
  if (night > 0) { r += (NIGHT_RGB[0] - r) * night; g += (NIGHT_RGB[1] - g) * night; b += (NIGHT_RGB[2] - b) * night; }
  if (crunch) { r *= RAIN_RGB[0] / 255; g *= RAIN_RGB[1] / 255; b *= RAIN_RGB[2] / 255; }
  r = Math.round(r); g = Math.round(g); b = Math.round(b);
  if (r > 252 && g > 252 && b > 252) return '';
  const key = (r << 16) | (g << 8) | b;
  if (key !== tKey) { tKey = key; tStr = `rgb(${r},${g},${b})`; }
  return tStr;
}
/** Everything the air needs for a sun hour in one record: { phase, night, dusk, tint, shadowLength }. `shadowLength` is the cast shadow's length as a share of the height (0.75 by day, 1.2 in the golden hours, 0.5 by moon). */
export function gradeFor(h, crunch = false, out = {}) {
  skyOf(h, out); out.phase = phaseOf(h); out.tint = tintFor(out.night, out.dusk, crunch);
  const base = 0.75 + (0.5 - 0.75) * out.night; out.shadowLength = base + (1.2 - base) * Math.min(1, out.dusk * 1.25);
  return out;
}

/** A colour's luma 0..1 (re-exported: the palette audit and the night-brightness rule read it). */
export { luma, hex };
