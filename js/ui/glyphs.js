// The glyphs a screen draws for the game's own things (docs/ART_DIRECTION.md 3.6): flat icons from js/art/g-*.js, looked up by the id the data already has. The data carries no icon (tests/guard-emoji.test.mjs),
// so a table here says which drawing stands for a Codex category, a badge or a daily bounty; a probe, an angle, a manager, a client, a loan, a rarity and a dock tab are named by their own id (probe-look, mgr-student,
// loan-circle, rarity-epic, dock-stock); a district is zone-<its theme> (zone-scrap, zone-harbor), a Background bg-<its id> (bg-grad, bg-pro) and a good good-<its id> (good-paperclip, good-cncCenter). A new picture is a line in a g-*.js set; a new kind of thing is a line here.
// Which of them exist, and that every id in the data has one, is held by tests/ui-glyphs.test.mjs.
// This module imports the five sets for their effect: a screen that imports it can draw any id. It is lazy, like the screens (tests/page-budget.test.mjs, LATER); the Draft, which is not, loads it when it opens (js/ui/draft.js).
import { svg, has } from '../art/glyph.js';
import { ZONES, ASSETS } from '../config.js';
import '../art/g-ui.js';
import '../art/g-codex.js';
import '../art/g-deal.js';
import '../art/g-places.js';
import '../art/g-goods.js';

export { svg, has };

/** The Codex's seven categories (js/ui/drawers/codex.js CATEGORIES) and their drawings. */
export const CATEGORY = { Value: 'cat-value', Markets: 'cat-markets', Operations: 'cat-operations', Finance: 'cat-finance', Risk: 'cat-risk', People: 'cat-people', Strategy: 'cat-strategy' };

const invert = (families) => Object.fromEntries(Object.entries(families).flatMap(([glyph, ids]) => ids.split(' ').map((id) => [id, glyph])));
/** The badges (js/meta/quests.js ACHIEVEMENTS, without the "a-") by the family that draws them: twelve drawings for the 78. A badge still secret is drawn as ach-secret instead (badgeGlyph). */
export const BADGE = invert({
  'ach-haggle': 'haggle-first haggle-ten silver-tongue bargain-hunter bg-pro poker-face',
  'ach-inspect': 'good-eye appraiser fake-buster counterfeit-cop',
  'ach-repair': 'fixer-upper hands-on steady-hands perfectionist',
  'ach-auction': 'paddle-up going-once no-curse auction-shark winners-curse',
  'ach-sales': 'closer rainmaker perfect-match jackpot clip bg-grad bg-creator bg-roots fire-sale',
  'ach-niche': 'pioneer trailblazer off-the-charts herd-mentality',
  'ach-streak': 'hot-hand on-fire unstoppable',
  'ach-risk': 'called-not-cooked rock-bottom credit-crunch tariff-tango demand-surge bg-veteran clean-books audit-proof lucky-bypass',
  'ach-money': 'rev-1k rev-100k rev-5m cycle-income draw-first debt-slayer exit ipo bg-heir',
  'ach-people': 'first-hire org-chart raise-the-bar bg-gigger bg-native bg-connected whale-pod handshake network-effects fair-dealer',
  'ach-travel': 'uptown smokestack glass-tower world-stage cartographer grand-tour bg-immigrant',
  'ach-rank': 'level-5 level-10 level-15 first-point specialist grandmaster day-30 day-90',
});
/** The daily bounties (js/meta/quests.js DAILIES, without the "d-"): each shows the drawing of what it asks for. */
export const DAILY = invert({
  'ach-sales': 'three-deals above-fair right-buyer', 'dock-market': 'restock', 'ach-haggle': 'haggle-day buy-low', 'ach-inspect': 'look-first sharp-eyes', 'ach-repair': 'fix-and-flip dial-it-in', 'ach-niche': 'beaten-path', 'ach-streak': 'four-in-a-row',
});
/** The Goal card shows the drawing of what the current quest asks for (its goal's event); a quest of any other event gets the Quests tab's. */
export const QUEST_EVENT = { pitch: 'ach-sales', buy: 'dock-market', inspect: 'ach-inspect', hire: 'ach-people', auction: 'ach-auction', repair: 'ach-repair', ship: 'ach-travel', audit: 'ach-risk', cycle: 'ach-people', client: 'ach-people', repay: 'ach-money' };

/** The drawing of a badge: the family's, or the secret's while it is still hidden. */
export const badgeGlyph = (id, hidden) => (hidden ? 'ach-secret' : BADGE[String(id).replace(/^a-/, '')] || '');
export const dailyGlyph = (id) => DAILY[String(id).replace(/^d-/, '')] || '';
export const questGlyph = (event) => QUEST_EVENT[event] || 'dock-quests';
export const categoryGlyph = (category) => CATEGORY[category] || '';
/** The drawing of a district (zone-<theme>, js/art/g-places.js) by its id in the data; '' for an id nobody drew (a name from a save or a classmate is never a way into the registry: it is looked up in the data first). */
export const zoneGlyph = (id) => { const t = Object.prototype.hasOwnProperty.call(ZONES, id) ? ZONES[id].theme : ''; return t && has('zone-' + t) ? 'zone-' + t : ''; };
/** The drawing of a Background (bg-<id>) by its id in the data; '' for an id nobody drew. */
export const bgGlyph = (id) => (typeof id === 'string' && /^[a-z][a-z0-9]*$/.test(id) && has('bg-' + id) ? 'bg-' + id : '');

/** The drawing of a good (good-<id>, js/art/g-goods.js) by its class in the data; '' for a class nobody drew (a name from a save or a classmate is looked up in the data first, so it is never a way into the registry). */
export const goodGlyph = (cls) => (typeof cls === 'string' && Object.prototype.hasOwnProperty.call(ASSETS, cls) && has('good-' + cls) ? 'good-' + cls : '');

/** A glyph's markup at the stylesheet's size for its place: '' (24 px), 'gl-sm' (16 px) or 'gl-lg' (40 px), or any class a sheet sizes. */
export const gl = (id, cls) => svg(id, cls ? { cls } : undefined);
/** The markup of a district's drawing at the size of class `cls` ('' if nobody drew it: the screens then print no tile). */
export const zoneGl = (id, cls) => gl(zoneGlyph(id), cls);
/** The markup of a Background's drawing at the size of class `cls`. */
export const bgGl = (id, cls) => gl(bgGlyph(id), cls);
/** The markup of a good's drawing at the size of class `cls` ('' if nobody drew it: the screens then print no tile). */
export const goodGl = (cls, c) => gl(goodGlyph(cls), c);
/** A glyph on the tile of a card (css .gl-tile: 2.4 rem, the dark surface the drawings are made for). `cls` is for the tile. */
export const tile = (id, cls = '') => { const s = svg(id); return s ? `<span class="gl-tile${cls ? ' ' + cls : ''}">${s}</span>` : ''; };
