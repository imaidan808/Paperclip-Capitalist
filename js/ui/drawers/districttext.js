// A district's words, said once. The Travel and Market drawers both describe a district: its rule, what opening it gives, the lesson it teaches. Both read it from here, from the
// district's own data (js/data) and the Codex (js/meta/codex.js), so the two cannot disagree. They had three sets of titles for the sixteen lessons (four of them differed) and two
// restatements of every rule, and the district's blurb said it a third time. The blurb is prose for the news line that says a district has opened (engine _unlock); these drawers
// print the rule from the data, with its exact figures, and never the blurb (the Market banner used to print both).
//
// What is claimed here is checked against the engine by tests/copy2-drawers.test.mjs (the shares by playing the lot generator out, the bonuses by reading what the engine does with them).
// A rule key that only marks a district and does nothing in the engine has no phrase: `bulk`, `bank` (it opens with `managers`), `gray` (it only touches one Background's prices, see
// grayBreak below) and `arbitrage` (every good is priced by each district's demand, everywhere).
import { ZONES } from '../../config.js';
import { CODEX } from '../../meta/codex.js';

const ENTRY = new Map(CODEX.map((c) => [c.id, c]));
const pc = (x) => `${Math.round(x * 100)}%`;
const list = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const zoneOf = (z) => (typeof z === 'number' ? ZONES[z] : z && typeof z === 'object' ? z : null);

/** The lesson's title as the Codex prints it (the Codex is the source of truth); an id it does not know is made readable. */
export function lessonTitle(id) {
  const e = ENTRY.get(id);
  if (e) return e.title;
  const t = String(id || 'a new idea').replace(/-/g, ' ');
  return cap(t);
}
/** The lesson in the Codex's own summary: what the page opens on. */
export const lessonGist = (id) => ENTRY.get(id)?.summary ?? '';

/** One sentence per rule the engine acts on. Percentages are the district's data; the 12 hours and 2% are the customs inspection (engine _freight), 6 in 10 the Auto Row's broken share. */
const RULE = {
  haggle: () => 'Haggles run one round longer.', // (engine deal.js haggleParams: +1 patience in a district with the rule)
  season: (r) => `${cap(list(r.season.tags))} demand swings ${pc(r.season.amp)} either way on a ${r.season.period}-day wave.`, // (market.js seasonMult: 1 + amp x sine)
  fakes: (r) => `About ${pc(r.fakes)} of lots are counterfeit.`,
  auction: (r) => `${pc(r.auction)} of lots are auctions.`,
  repair: (r) => `Repairs cost ${pc(r.repair)} less, and about 6 in 10 lots are broken.`,
  customs: (r) => `${pc(r.customs)} of arriving shipments are inspected: a 12-hour delay and a 2% fee.`,
  fads: () => 'Digital goods lose value twice as fast.',
  perish: () => 'Perishable goods spoil every day.',
  yield: () => 'Some goods pay income every day you hold them.',
  rent: () => 'Property pays rent every day you hold it.',
  managers: () => 'Managers, clients, upgrades and the Bank open here.', // (engine _unlock, milestone 1; UPGRADES and the SMB account are zone 5)
  audits: () => 'Compliance audits begin here.',
  enterprise: () => 'Enterprise clients, trade sales and IPOs open here.',
};
/** The rule that a district's lesson is about leads, so a district is first described by the thing it teaches. */
const HEADLINE = { 'information-asymmetry': 'fakes', 'winners-curse': 'auction', 'repair-roi': 'repair', 'supply-chain': 'customs', 'scale-compliance': 'audits', obsolescence: 'fads',
  'inventory-risk': 'perish', 'recurring-revenue': 'yield', 'asset-cash-flow': 'rent', 'arbitrage-at-scale': 'customs', negotiation: 'haggle', 'saturation-herd': 'season', 'working-capital': 'managers', 'enterprise-sales': 'enterprise' };
const ORDER = ['haggle', 'season', 'fakes', 'auction', 'repair', 'customs', 'fads', 'perish', 'yield', 'rent', 'audits', 'managers', 'enterprise'];
/** The Scrap Yard has no rule in its data; what it is built on is two mechanics of the engine: an urgent buyer's budget comes from the fair value, never from what the crate cost (_spawnLead),
 *  and the first districts' buyers pay part in goods (quotePitch: a buyer's `holds`). */
const LESSON_RULE = { 'utility-fit': ['Urgent buyers pay for need, not for cost.', 'Buyers pay in goods as well as cash, so you can barter your way up.'] };

/** What is different about trading in a district, as plain sentences, the headline first. Never empty for a district; [] for one that does not exist. */
export function rulePhrases(zone) {
  const Z = zoneOf(zone);
  if (!Z) return [];
  const r = Z.rules || {}, lead = HEADLINE[Z.teaches];
  const out = [...(lead ? [lead] : []), ...ORDER.filter((k) => k !== lead)].filter((k) => r[k] && RULE[k]).map((k) => RULE[k](r));
  if (!out.length) out.push(...(LESSON_RULE[Z.teaches] || [String(Z.blurb || '').split(/(?<=[.!?])\s/)[0] || 'A new market with its own rules.']));
  return out;
}

const BONUS = {
  freightMult: (m) => `Freight costs ${pc(1 - m)} less everywhere.`,
  capMult: (m) => `Manager capacity is ${pc(m - 1)} higher.`,
  leadMult: (m) => `Buyers arrive ${pc(m - 1)} faster.`,
  spreadMult: (m) => `Loan spreads are ${pc(1 - m)} lower.`,
  storeBonus: (n) => `${n} more storage ${n === 1 ? 'space' : 'spaces'} in every district.`,
  lotSlots: (n) => `${n} more ${n === 1 ? 'lot' : 'lots'} on offer in every district.`,
  feeMult: (m) => `Fees are ${pc(1 - m)} lower.`,
  repairMult: (m) => `Repairs cost ${pc(1 - m)} less everywhere.`,
  rentMult: (m) => `Property rent income is ${pc(m - 1)} higher.`,
  exitMult: (m) => `Exit multiples are ${pc(m - 1)} higher.`,
  creditLimitMult: (m) => `Micro-Business and Enterprise credit limits are ${pc(m - 1)} higher.`,
};
/** What opening a district gives for good (its `bonus`), one sentence each. [] for a district that gives nothing but the lesson. */
export function rewardPhrases(zone) {
  const b = zoneOf(zone)?.bonus || {};
  return Object.keys(BONUS).filter((k) => Number.isFinite(b[k])).map((k) => BONUS[k](b[k]));
}

/** The Second-Chance Hustler's discount in a gray-market district, as a sentence (only that Background feels the `gray` rule); '' for everyone else and for any other district. */
export function grayBreak(zone, discount) {
  return zoneOf(zone)?.rules?.gray && discount > 0 ? `Gray market: lots cost ${pc(discount)} less for you.` : '';
}
