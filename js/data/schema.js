// The shared vocabulary and validator for v2 content (docs/V2_DESIGN.md sections 4 and 5).
// Every tier file exports { zones, assets, buyers }; validateData() returns a list of human-readable problems ([] = valid).
export const ZONE_COUNT = 16;
export const TAGS = ['tool', 'office', 'prestige', 'paper', 'retro', 'electronics', 'vehicle', 'consumer', 'trend', 'scrap', 'industrial', 'training', 'digital', 'b2b', 'franchise', 'infra',
  'food', 'farm', 'bulk', 'marine', 'collectible', 'luxury', 'fashion', 'ip', 'media', 'realty', 'finance', 'energy', 'medical', 'home', 'outdoor', 'gem'];
export const THEMES = ['scrap', 'market', 'campus', 'pawn', 'metro', 'estate', 'auto', 'harbor', 'industrial', 'tech', 'farm', 'creative', 'corporate', 'finance', 'realty', 'exchange'];
export const ANGLES = ['prestige', 'utility', 'scarcity', 'price', 'story'];
export const BUYER_STYLES = ['hard', 'friendly', 'impulsive', 'analytical'];
export const RULE_KEYS = ['haggle', 'auction', 'fakes', 'perish', 'season', 'customs', 'gray', 'repair', 'yield', 'bulk', 'fads', 'managers', 'bank', 'audits', 'enterprise', 'rent', 'arbitrage'];
export const BONUS_KEYS = ['freightMult', 'capMult', 'leadMult', 'spreadMult', 'storeBonus', 'lotSlots', 'feeMult', 'repairMult', 'rentMult', 'exitMult', 'creditLimitMult'];
export const tierOf = (id) => Math.ceil(id / 4);
export const KEEP_ASSETS = ['paperclip', 'pen', 'radio', 'bike', 'scrap', 'sneakers', 'textbooks', 'gadgets', 'electronics', 'domain', 'van', 'saas', 'fleet', 'franchise', 'datacenter'];
export const KEEP_BUYERS = ['student', 'barista', 'mechanic', 'collector', 'scrapper', 'cyclist', 'bookstore', 'trainer', 'boutique', 'smelog', 'etailer', 'recruiter', 'freelancer', 'entIT', 'holdco', 'vcstart', 'franchisor'];

/** fit between an asset's tags and a buyer's likes, 0..1 (identical to market.fitOf, kept here so data has no imports). */
export function fitTags(tags, like) {
  const ls = tags.map((t) => like[t] || 0).filter((x) => x > 0).sort((a, b) => b - a);
  return ls.length ? Math.min(1, ls[0] + 0.15 * (ls.length - 1)) : 0;
}
export const demandOf = (def, zone) => def.dem?.[zone] ?? 0;

const HEX = /^#[0-9a-f]{6}$/i, ID = /^[a-z][a-zA-Z0-9_]*$/;
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const int = (x) => Number.isInteger(x);

/**
 * @param {{zones:Object, assets:Object, buyers:Object}} d
 * @param {{partial?:boolean}} o partial = not every tier is present: skip completeness checks
 */
export function validateData(d, { partial = false } = {}) {
  const P = [], add = (m) => P.push(m);
  const { zones = {}, assets = {}, buyers = {} } = d;
  const zids = Object.keys(zones).map(Number).sort((a, b) => a - b);

  // ---------------------------------------------------------------- zones
  for (const id of zids) {
    const z = zones[id], w = `zone ${id}`;
    if (!int(id) || id < 1 || id > ZONE_COUNT) { add(`${w}: id out of range`); continue; }
    if (z.id !== id) add(`${w}: id field must equal its key`);
    for (const k of ['name', 'short', 'icon', 'blurb', 'teaches']) if (typeof z[k] !== 'string' || !z[k].trim()) add(`${w}: ${k} must be a non-empty string`);
    if (typeof z.blurb === 'string' && z.blurb.length > 160) add(`${w}: blurb over 160 characters`);
    if (z.theme !== THEMES[id - 1]) add(`${w}: theme must be "${THEMES[id - 1]}"`);
    if (z.tier !== tierOf(id)) add(`${w}: tier must be ${tierOf(id)}`);
    if (!num(z.gate) || z.gate < 0 || (id === 1 ? z.gate !== 0 : z.gate <= 0)) add(`${w}: gate must be 0 for zone 1 and > 0 after`);
    if (!num(z.scale) || z.scale <= 0) add(`${w}: scale must be > 0`);
    if (!num(z.tax) || z.tax < 0 || z.tax > 0.2) add(`${w}: tax must be 0..0.2`);
    if (!num(z.friction) || z.friction < 0.08 || z.friction > 0.2) add(`${w}: friction (pool haircut) must be 0.08..0.2`);
    if (!num(z.pool) || z.pool <= 0) add(`${w}: pool must be > 0`);
    if (!num(z.speed) || z.speed < 1 || z.speed > 6) add(`${w}: speed must be 1..6`);
    if (!int(z.store) || z.store < 8 || z.store > 40) add(`${w}: store must be an integer 8..40`);
    if (!int(z.leadEvery) || z.leadEvery < 2 || z.leadEvery > 6) add(`${w}: leadEvery must be an integer 2..6`);
    if (!int(z.lotEvery) || z.lotEvery < 3 || z.lotEvery > 8) add(`${w}: lotEvery must be an integer 3..8`);
    if (!num(z.urgent) || z.urgent < 0 || z.urgent > 0.5) add(`${w}: urgent must be 0..0.5`);
    if (typeof z.auto !== 'boolean' || z.auto !== (id >= 5)) add(`${w}: auto (managers) must be ${id >= 5}`);
    if (!int(z.plots) || (z.auto ? z.plots < 3 || z.plots > 4 : z.plots !== 0)) add(`${w}: plots must be 0 when manual and 3..4 when managers are allowed`);
    if (!Array.isArray(z.palette) || z.palette.length !== 2 || !z.palette.every((c) => HEX.test(c))) add(`${w}: palette must be two #rrggbb colors [ground, accent]`);
    for (const k of Object.keys(z.rules || {})) if (!RULE_KEYS.includes(k)) add(`${w}: unknown rule "${k}"`);
    for (const k of Object.keys(z.bonus || {})) if (!BONUS_KEYS.includes(k)) add(`${w}: unknown bonus "${k}"`);
    for (const [k, v] of Object.entries(z.bonus || {})) if (!num(v)) add(`${w}: bonus ${k} must be a number`);
    if (z.rules == null || z.bonus == null) add(`${w}: rules and bonus objects are required (may be empty)`);
  }
  for (let i = 1; i < zids.length; i++) {
    const a = zones[zids[i - 1]], b = zones[zids[i]];
    if (zids[i] === zids[i - 1] + 1 && a && b && num(a.gate) && num(b.gate)) {
      if (b.gate <= a.gate) add(`zone ${b.id}: gate must exceed zone ${a.id}'s`);
      if (b.scale <= a.scale) add(`zone ${b.id}: scale must exceed zone ${a.id}'s`);
    }
  }
  if (!partial) { for (let i = 1; i <= ZONE_COUNT; i++) if (!zones[i]) add(`zone ${i}: missing`); }

  // ---------------------------------------------------------------- assets
  for (const [id, a] of Object.entries(assets)) {
    const w = `asset ${id}`;
    if (!ID.test(id)) add(`${w}: id must be camelCase or snake_case ascii`);
    for (const k of ['name', 'icon']) if (typeof a[k] !== 'string' || !a[k].trim()) add(`${w}: ${k} must be a non-empty string`);
    if (!num(a.base) || a.base <= 0) add(`${w}: base must be > 0`);
    if (!int(a.sc) || a.sc < 1 || a.sc > 10) add(`${w}: sc (scarcity) must be an integer 1..10`);
    if (!int(a.dep) || a.dep < 1 || a.dep > 10) add(`${w}: dep (depreciation) must be an integer 1..10`);
    const zs = Object.keys(a.dem || {});
    if (!a.dem || typeof a.dem !== 'object' || Array.isArray(a.dem)) add(`${w}: dem must be a sparse object { zoneId: 1..10 }`);
    else {
      if (zs.length < 2) add(`${w}: must have demand in at least 2 districts`);
      for (const z of zs) if (!(int(+z) && +z >= 1 && +z <= ZONE_COUNT) || !int(a.dem[z]) || a.dem[z] < 1 || a.dem[z] > 10) add(`${w}: dem.${z} must map a zone 1..16 to an integer 1..10`);
    }
    if (!Array.isArray(a.tags) || a.tags.length < 1 || a.tags.length > 3 || new Set(a.tags).size !== a.tags.length || !a.tags.every((t) => TAGS.includes(t))) add(`${w}: tags must be 1-3 distinct entries of TAGS`);
    if (a.repair != null && !(num(a.repair) && a.repair > 0)) add(`${w}: repair must be a positive number`);
    if (a.perish != null && !(int(a.perish) && a.perish >= 2 && a.perish <= 60)) add(`${w}: perish must be an integer 2..60 (days)`);
    if (a.yield != null && !(num(a.yield) && a.yield > 0 && a.yield <= 0.01)) add(`${w}: yield must be 0..0.01 (daily fraction of value)`);
    if (a.fakeRisk != null && !(num(a.fakeRisk) && a.fakeRisk >= 0 && a.fakeRisk <= 1)) add(`${w}: fakeRisk must be 0..1`);
    // price ladder: a signature good somewhere
    if (a.dem && a.base > 0) {
      const sig = zs.some((z) => zones[z] && demandOf(a, +z) >= 6 && a.base >= zones[z].scale * 0.08 && a.base <= zones[z].scale * 3.5);
      const anyZonePresent = zs.some((z) => zones[z]);
      if (anyZonePresent && !sig && !partial) add(`${w}: not a signature good in any district (needs demand >= 6 and base within 0.08x..3.5x of a district's scale)`);
      if (anyZonePresent && !sig && partial && zs.every((z) => zones[z])) add(`${w}: not a signature good in any of its own districts`);
    }
  }

  // ---------------------------------------------------------------- buyers
  for (const [id, b] of Object.entries(buyers)) {
    const w = `buyer ${id}`;
    if (!ID.test(id)) add(`${w}: id must be camelCase ascii`);
    if (!(int(b.zone) && b.zone >= 1 && b.zone <= ZONE_COUNT)) add(`${w}: zone must be 1..16`);
    for (const k of ['name', 'icon', 'hello']) if (typeof b[k] !== 'string' || !b[k].trim()) add(`${w}: ${k} must be a non-empty string`);
    if (typeof b.hello === 'string' && b.hello.length > 90) add(`${w}: hello over 90 characters`);
    if (!num(b.pop) || b.pop < 0.05 || b.pop > 1) add(`${w}: pop must be 0.05..1`);
    const likes = Object.entries(b.like || {});
    if (likes.length < 2 || likes.length > 5 || !likes.every(([t, v]) => TAGS.includes(t) && num(v) && v >= 0.1 && v <= 1) || !likes.some(([, v]) => v >= 0.8)) add(`${w}: like needs 2-5 TAGS with weights 0.1..1 and at least one >= 0.8`);
    if (!Array.isArray(b.budget) || b.budget.length !== 2 || !(num(b.budget[0]) && num(b.budget[1]) && b.budget[0] > 0 && b.budget[0] < b.budget[1])) add(`${w}: budget must be [lo, hi] with 0 < lo < hi`);
    if (!BUYER_STYLES.includes(b.style)) add(`${w}: style must be one of ${BUYER_STYLES.join(', ')}`);
    if (!int(b.patience) || b.patience < 3 || b.patience > 7) add(`${w}: patience must be an integer 3..7`);
    if (!ANGLES.includes(b.bias)) add(`${w}: bias must be one of ${ANGLES.join(', ')}`);
    if (b.holds != null) {
      if (!(b.zone <= 4)) add(`${w}: holds (barter goods) only exist in districts 1-4`);
      for (const h of b.holds || []) if (!assets[h.cls] && !partial) add(`${w}: holds unknown asset ${h.cls}`);
    }
    if (zones[b.zone] && Array.isArray(b.budget)) {
      const s = zones[b.zone].scale;
      if (b.budget[1] < s * 0.2 || b.budget[0] > s * 4) add(`${w}: budget [${b.budget}] is far from its district's scale ${s}`);
    }
  }

  // ---------------------------------------------------------------- per-district coverage
  for (const id of zids) {
    const z = zones[id]; if (!z || !num(z.scale)) continue;
    const bs = Object.entries(buyers).filter(([, b]) => b.zone === id);
    const classes = Object.entries(assets).filter(([, a]) => demandOf(a, id) >= 4 && a.base >= z.scale * 0.05 && a.base <= z.scale * 4);
    if (bs.length < 5) add(`zone ${id}: needs at least 5 buyers (has ${bs.length})`);
    if (new Set(bs.map(([, b]) => b.style)).size < 3) add(`zone ${id}: buyers must use at least 3 different haggling styles`);
    if (classes.length < 4) add(`zone ${id}: needs at least 4 tradeable classes (demand >= 4, base 0.05x..4x of scale ${z.scale}); has ${classes.length}`);
    for (const [cid, a] of classes) {
      const fits = bs.filter(([, b]) => b.like && fitTags(a.tags, b.like) >= 0.5).length;
      if (fits < 2) add(`zone ${id}: ${cid} needs at least 2 buyers with fit >= 0.5 (has ${fits}) so a pioneer niche exists`);
    }
    if (bs.filter(([, b]) => Array.isArray(b.budget) && b.budget[1] >= z.scale * 0.3).length < 3) add(`zone ${id}: at least 3 buyers should be able to pay >= 0.3x of scale`);
  }

  if (!partial) {
    for (const k of KEEP_ASSETS) if (!assets[k]) add(`asset ${k}: required v1 id is missing`);
    for (const k of KEEP_BUYERS) if (!buyers[k]) add(`buyer ${k}: required v1 id is missing`);
    if (Object.keys(assets).length < 55) add(`assets: need at least 55 classes in total (have ${Object.keys(assets).length})`);
    if (Object.keys(buyers).length < 70) add(`buyers: need at least 70 in total (have ${Object.keys(buyers).length})`);
    const used = new Set(Object.values(assets).flatMap((a) => a.tags));
    for (const t of TAGS) if (!used.has(t)) add(`tag "${t}" is used by no asset`);
    const liked = new Set(Object.values(buyers).flatMap((b) => Object.keys(b.like || {})));
    for (const t of TAGS) if (!liked.has(t)) add(`tag "${t}" is liked by no buyer`);
  }
  return P;
}

// ---------------------------------------------------------------------------------------------------------------------
// Tier ownership (docs/V2_DESIGN.md section 13). Four authors write four tiers in parallel; these tables keep them from
// colliding and guarantee the merged set is complete.
export const TEACHES = ['utility-fit', 'negotiation', 'saturation-herd', 'information-asymmetry', 'working-capital', 'winners-curse', 'repair-roi', 'supply-chain',
  'scale-compliance', 'obsolescence', 'inventory-risk', 'recurring-revenue', 'enterprise-sales', 'leverage-risk', 'asset-cash-flow', 'arbitrage-at-scale'];
/** v1 asset ids each tier must define (and may rebalance), and v1 buyer ids likewise. */
export const TIER_ASSETS = { 1: ['paperclip', 'pen', 'radio', 'bike', 'scrap'], 2: ['sneakers', 'textbooks', 'gadgets', 'electronics', 'domain', 'van'], 3: ['saas', 'fleet'], 4: ['franchise', 'datacenter'] };
export const TIER_BUYERS = { 1: ['student', 'barista', 'mechanic', 'collector', 'scrapper', 'cyclist', 'bookstore'], 2: ['trainer', 'boutique', 'smelog', 'etailer', 'recruiter', 'freelancer'], 3: ['entIT', 'vcstart'], 4: ['holdco', 'franchisor'] };
/** Tags a tier must use on at least one of its assets AND have liked by at least one of its buyers. Together they cover all 32. */
export const TIER_TAGS = {
  1: ['tool', 'office', 'prestige', 'paper', 'retro', 'scrap', 'collectible', 'home', 'outdoor'],
  2: ['electronics', 'trend', 'fashion', 'vehicle', 'consumer', 'training', 'marine', 'bulk'],
  3: ['industrial', 'digital', 'energy', 'food', 'farm', 'medical', 'media', 'ip'],
  4: ['b2b', 'franchise', 'infra', 'realty', 'finance', 'luxury', 'gem'],
};
/** Numeric unlock bonuses, exactly (district -> bonus object). Districts not listed have `bonus: {}`. */
export const BONUS_EXPECT = { 6: { lotSlots: 1 }, 7: { repairMult: 0.9 }, 8: { freightMult: 0.7 }, 9: { capMult: 1.25 }, 10: { leadMult: 1.15 }, 11: { storeBonus: 4 }, 13: { creditLimitMult: 1.5 },
  14: { spreadMult: 0.8 }, 15: { rentMult: 1.25 }, 16: { exitMult: 1.1 } };
/** Rule keys each district's `rules` must contain (the signature rule). Feature-unlock keys (managers...arbitrage) appear in exactly the listed district. */
export const RULE_NEED = { 1: [], 2: ['haggle'], 3: ['season'], 4: ['fakes', 'auction'], 5: ['managers', 'bank'], 6: ['auction'], 7: ['repair'], 8: ['customs'], 9: ['audits', 'bulk'], 10: ['fads'],
  11: ['perish', 'season'], 12: ['yield'], 13: ['enterprise'], 14: [], 15: ['rent'], 16: ['arbitrage'] };
export const UNLOCK_RULES = { managers: 5, bank: 5, audits: 9, enterprise: 13, rent: 15, arbitrage: 16 };
