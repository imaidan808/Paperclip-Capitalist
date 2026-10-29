// What each district's buildings are dressed in: the walls, trims, roofs, accents and lettering of the sixteen themes, as data. Pure: nothing here draws.
// Owner: T3 BUILDINGS (docs/RENDER_PLAN.md). Colours are tokens of palette.js (docs/ART_DIRECTION.md 2.2 and 2.4); a prop's own options (col, trim, roofCol, acc...) win over its theme's row, so a kit can still
// give one building its own look, and a prop with no zone (a test's) takes the generic row.
import { PLASTER, TILE, BRICK, METAL, WOOD, DISTRICT_DAY, TOY, PAVE } from './palette.js';

/** The generic row: cream plaster, a terracotta gable, cream trim. */
export const BASE = Object.freeze({ wall: PLASTER.cream, trim: '#fff4de', roof: TILE.terracotta, acc: TOY.orange, acc2: '#fff4de', shutter: null, curtain: '#f6b9c8', ink: '#3a2f5e', plank: WOOD.mid, door: WOOD.shade });

/** Per theme: what a house, shop or hall of that district wears unless the prop says otherwise. `boxes` puts flower boxes under the close windows, `shutter` colours the shutters, `plank` the sign plank, `neon` the sign tube colours. */
export const THEMES = Object.freeze({
  scrap: { wall: '#e8c590', trim: '#fff0d4', roof: METAL.rust, acc: DISTRICT_DAY.scrap.accent, acc2: DISTRICT_DAY.scrap.accent2, plank: WOOD.mid, door: '#9c6238' },
  market: { wall: PLASTER.butter, trim: '#fff4de', roof: TILE.terracotta, acc: DISTRICT_DAY.market.accent, acc2: DISTRICT_DAY.market.accent2, shutter: DISTRICT_DAY.market.accent2, boxes: true, plank: '#e8503a', door: '#2fa6a0' },
  campus: { wall: BRICK.mid, trim: '#fff0d2', roof: TILE.slate, acc: DISTRICT_DAY.campus.accent, acc2: DISTRICT_DAY.campus.accent2, shutter: null, boxes: true, plank: '#2f8f56', door: '#2f8f56' },
  pawn: { wall: '#34b0a8', trim: '#fff4de', roof: '#f2c14a', acc: DISTRICT_DAY.pawn.accent, acc2: DISTRICT_DAY.pawn.accent2, plank: '#2b8f86', door: '#3a3a6a', ink: '#ffe9a8', neon: ['#ff6fae', '#5fe0ff', '#f2c14a'] },
  metro: { wall: '#5f9fe0', trim: '#f2f8ff', roof: '#8fa8d0', acc: DISTRICT_DAY.metro.accent, acc2: DISTRICT_DAY.metro.accent2, plank: '#3b7fd0', door: '#4a6fb8' },
  estate: { wall: PLASTER.cream, trim: '#fff8e6', roof: TILE.plum, acc: DISTRICT_DAY.estate.accent2, acc2: DISTRICT_DAY.estate.accent, shutter: '#c9a6ff', boxes: true, plank: '#744c9e', door: '#744c9e' },
  auto: { wall: '#f4f6fb', trim: '#ffffff', roof: '#e8eef8', acc: DISTRICT_DAY.auto.accent, acc2: '#f4f6fb', plank: '#e63b2e', door: '#9aa8c8' },
  harbor: { wall: '#d8e6f6', trim: '#ffffff', roof: '#3d6cb8', acc: DISTRICT_DAY.harbor.accent, acc2: DISTRICT_DAY.harbor.accent2, plank: '#2f5fa8', door: '#2f5fa8' },
  industrial: { wall: '#dfe6f4', trim: '#fff6d0', roof: '#8aa0c0', acc: DISTRICT_DAY.industrial.accent, acc2: DISTRICT_DAY.industrial.accent2, plank: '#3b4f6a', door: '#8aa0b8' },
  tech: { wall: '#aab4f0', trim: '#eef2ff', roof: '#8f98e0', acc: DISTRICT_DAY.tech.accent, acc2: DISTRICT_DAY.tech.accent2, plank: '#4a52b0', door: '#4a52b0', ink: '#eaffff', neon: ['#22d9ee', '#9a6bff'] },
  farm: { wall: '#e86a52', trim: '#fff6e8', roof: '#b04a3a', acc: DISTRICT_DAY.farm.accent, acc2: DISTRICT_DAY.farm.accent2, plank: '#9c6238', door: '#fff6e8' },
  creative: { wall: '#c8a6f6', trim: '#fff4de', roof: '#ff8fcf', acc: DISTRICT_DAY.creative.accent, acc2: DISTRICT_DAY.creative.accent2, plank: '#ff4fa3', door: '#ff4fa3', neon: ['#ff4fa3', '#9a6bff'] },
  corporate: { wall: '#cde6f8', trim: '#ffffff', roof: '#9fcbea', acc: DISTRICT_DAY.corporate.accent2, acc2: DISTRICT_DAY.corporate.accent, plank: '#3f8fe0', door: '#3f8fe0' },
  finance: { wall: '#eef6ea', trim: '#fffaf0', roof: '#4f9a78', acc: DISTRICT_DAY.finance.accent2, acc2: DISTRICT_DAY.finance.accent, plank: '#25b97a', door: '#2f6a4a', ink: '#1c3a38' },
  realty: { wall: PLASTER.cream, trim: '#fff4de', roof: TILE.terracotta, acc: DISTRICT_DAY.realty.accent2, acc2: DISTRICT_DAY.realty.accent, shutter: '#cdeedc', boxes: true, plank: '#e8795a', door: '#98413f' },
  exchange: { wall: '#fffaf0', trim: '#fffaf0', roof: '#7a5a30', acc: DISTRICT_DAY.exchange.accent, acc2: '#2b2417', plank: '#b8891e', door: '#7a5a1e', ink: '#2b2417' },
});

/** The row for a theme (the generic one for a theme that is not one of the sixteen). */
export const themeRow = (th) => (th && Object.hasOwn(THEMES, th) ? { ...BASE, ...THEMES[th] } : BASE);

/** Four plaster pastels for rows of houses and shops (peach, mint, butter, rose and sky), by hash. */
export const HOUSE_PASTELS = Object.freeze([PLASTER.peach, PLASTER.mint, PLASTER.butter, PLASTER.rose, PLASTER.sky, PLASTER.lilac]);
export const PAVER = PAVE.cream;
export { TILE, PLASTER, BRICK, TOY };
