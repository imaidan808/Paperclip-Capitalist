// TEMPORARY development content (replaced by tier1..4.js when the content branches are merged). Generated from the contract tables so the engine can run
// against sixteen districts. Not shipped: js/data/index.js stops importing this file at the merge.
import { THEMES, TAGS, TEACHES, BONUS_EXPECT, RULE_NEED } from './schema.js';

const ROWS = [
  [1, 'The Scrap Yard', 'Scrap Yard', '🔩', 0, 1], [2, 'Flea Market Row', 'Flea Market', '🧺', 20, 6], [3, 'Campus Quad', 'Campus', '🎓', 80, 25], [4, 'Pawn District', 'Pawn', '💍', 250, 90],
  [5, 'Metro Hub', 'Metro Hub', '🏙️', 1000, 400], [6, 'Estate Sales', 'Estates', '🏺', 2500, 900], [7, 'Auto Row', 'Auto Row', '🚗', 6000, 2500], [8, 'Harbor Docks', 'Harbor', '⚓', 12000, 5000],
  [9, 'Industrial Park', 'Industrial', '🏭', 25000, 9000], [10, 'Tech Corridor', 'Tech', '💾', 50000, 18000], [11, 'Farmland Co-op', 'Farmland', '🌾', 90000, 30000], [12, 'Creative Quarter', 'Creative', '🎬', 150000, 50000],
  [13, 'Corporate Valley', 'Corporate', '🏢', 250000, 90000], [14, 'Financial District', 'Finance', '🏦', 500000, 180000], [15, 'Real Estate Row', 'Real Estate', '🏘️', 1000000, 400000], [16, 'Global Exchange', 'Exchange', '🌐', 2500000, 1000000],
];
const PAL = [['#4a4a2a', '#c9a227'], ['#7a4a1c', '#ff9d3c'], ['#7a2e24', '#5fbf7a'], ['#1f5656', '#e0b84a'], ['#38485c', '#4aa3ff'], ['#4a2d54', '#f0e6c8'], ['#2b2d31', '#e5483d'], ['#16284a', '#ff8a3d'],
  ['#4b5560', '#f2c230'], ['#0b0f14', '#35e0ff'], ['#2f5a2a', '#e8c547'], ['#6b1d5c', '#9b6dff'], ['#27506e', '#8fd3ff'], ['#1f4d34', '#d9e4d0'], ['#8a4b32', '#f1c9a5'], ['#2a2410', '#f5d36a']];
const RULES = {
  2: { haggle: true }, 3: { season: { period: 28, amp: 0.35, tags: ['paper', 'training', 'electronics'] } }, 4: { fakes: 0.22, auction: 0.3, gray: true }, 5: { managers: true, bank: true },
  6: { auction: 0.55 }, 7: { repair: 0.25 }, 8: { customs: 0.25 }, 9: { audits: true, bulk: true }, 10: { fads: true }, 11: { perish: true, season: { period: 90, amp: 0.3, tags: ['food', 'farm'] } },
  12: { yield: true }, 13: { enterprise: true }, 15: { rent: true }, 16: { arbitrage: true },
};
export const zones = {};
for (const [id, name, short, icon, gate, scale] of ROWS) {
  zones[id] = {
    id, name, short, icon, blurb: `${name}: a stand-in district for development.`, teaches: TEACHES[id - 1], theme: THEMES[id - 1], tier: Math.ceil(id / 4), gate, scale,
    tax: id <= 4 ? [0, 0.01, 0.02, 0.03][id - 1] : 0.05 + (id - 5) * 0.0095, friction: 0.10 + (id - 1) * 0.004, pool: Math.max(5000, Math.round(gate * 10 / 1000) * 1000), speed: 1 + (id - 1) * 0.3,
    store: Math.round(10 + (id - 1) * 1.7), leadEvery: id === 10 ? 2 : id === 11 ? 4 : 3, lotEvery: [6, 4].includes(id) ? 5 : 4, urgent: id <= 4 ? [0.45, 0.3, 0.25, 0.2][id - 1] : Math.max(0.06, 0.12 - (id - 5) * 0.006),
    auto: id >= 5, plots: id >= 5 ? 4 : 0, palette: PAL[id - 1], rules: RULES[id] || {}, bonus: BONUS_EXPECT[id] || {},
  };
  void RULE_NEED;
}
const FIT = [[1.0, 0.7], [0.9, 0.6], [1.0, 0.5], [0.85, 0.55]];
export const assets = {}, buyers = {};
const STY = ['hard', 'friendly', 'impulsive', 'analytical'], BIAS = ['prestige', 'utility', 'scarcity', 'price', 'story'];
for (const z of Object.values(zones)) {
  const t = (n) => TAGS[(z.id * 3 + n) % TAGS.length];
  for (let k = 0; k < 4; k++) {
    const id = `g${z.id}${'abcd'[k]}`;
    assets[id] = {
      name: `${z.short} lot ${'ABCD'[k]}`, icon: ['📦', '🧰', '🎁', '🗃️'][k], base: z.scale * [0.3, 0.6, 1.2, 2.4][k], sc: 4 + k, dep: 1 + k, tags: [t(2 * k), t(2 * k + 1)],
      dem: { [z.id]: 8 - (k === 3 ? 1 : 0), ...(z.id < 16 ? { [z.id + 1]: 3 } : { 15: 3 }) }, ...(k === 1 ? { repair: z.scale * 0.2 } : {}),
    };
  }
  for (let j = 0; j < 5; j++) {
    const a = assets[`g${z.id}${'abcd'[j % 4]}`], b = assets[`g${z.id}${'abcd'[(j + 1) % 4]}`];
    buyers[`b${z.id}${j}`] = {
      zone: z.id, name: `${z.short} buyer ${j + 1}`, icon: ['🧑‍💼', '👵', '🧔', '👩‍🔧', '🧑‍🎓'][j], hello: 'What have you got for me?', pop: 0.4 + 0.12 * j, like: { [a.tags[0]]: FIT[j % 4][0], [a.tags[1]]: FIT[j % 4][1], [b.tags[0]]: 0.55 },
      budget: [z.scale * 0.05, z.scale * (2 + j)], style: STY[j % 4], patience: 3 + (j % 5), bias: BIAS[j % 5],
      ...(z.id <= 4 && j < 3 ? { holds: [{ cls: `g${z.id}a` }, { cls: `g${z.id}b` }] } : {}),
    };
  }
}
// the starting paperclip, and a few barter stepping stones so the first minutes of district 1 play
assets.paperclip = { name: 'Rusty Paperclip', icon: '📎', base: 0.05, sc: 2, dep: 1, tags: ['tool', 'office'], dem: { 1: 7, 2: 2 } };
assets.pen = { name: 'Vintage Fountain Pen', icon: '🖋️', base: 0.9, sc: 9, dep: 1, tags: ['prestige', 'office'], dem: { 1: 8, 2: 6 } };
buyers.student = { zone: 1, name: 'Stressed Student', icon: '🎒', hello: 'I need a paperclip right now.', pop: 0.9, like: { tool: 1, office: 0.7, prestige: 0.55 }, budget: [0.5, 8], style: 'friendly', patience: 4, bias: 'utility', holds: [{ cls: 'paperclip' }, { cls: 'pen' }] };
buyers.collector = { zone: 1, name: 'Flea-Market Collector', icon: '🧐', hello: 'Anything old and pretty?', pop: 0.5, like: { prestige: 1, tool: 0.3 }, budget: [0.5, 12], style: 'hard', patience: 5, bias: 'story', holds: [{ cls: 'pen' }, { cls: 'g1a' }] };
export default { zones, assets, buyers };
