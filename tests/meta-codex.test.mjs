// Codex content tests (docs/V2_DESIGN.md section 12). Run: node --test tests/meta-codex.test.mjs
// Structure, limits and cross-references are checked against the shared vocabulary (js/meta/ids.js, js/data/schema.js, js/meta/match.js).
// The "worked numbers" test recomputes the figures quoted in the examples from the game's formulas, written out again here (they mirror
// js/market.js and js/config.js at the v2 contract) so an engine refactor can never break this file, and a typo in the prose cannot hide.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CODEX } from '../js/meta/codex.js';
import { REQUIRED_CODEX, EVENT_TYPES, EVENT_PAYLOAD } from '../js/meta/ids.js';
import { TEACHES } from '../js/data/schema.js';
import { matchEvent } from '../js/meta/match.js';

const CATEGORIES = ['Value', 'Markets', 'Operations', 'Finance', 'Risk', 'People', 'Strategy'];
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const EM_DASH = new RegExp(String.fromCharCode(0x2014));
const EN_DASH = new RegExp(String.fromCharCode(0x2013));
const INVISIBLE = new RegExp('[' + String.fromCharCode(0x200b, 0x200c, 0x200d, 0xfe0f, 0xfeff) + ']');
const PICTO = /\p{Extended_Pictographic}/u;
const OPS = ['gte', 'lte', 'gt', 'lt', 'eq', 'in'];
const byId = new Map(CODEX.map((e) => [e.id, e]));
const isStr = (x) => typeof x === 'string' && x.trim().length > 0;

/** Every string in an entry except the icon, with a path for messages. */
function* strings(entry) {
  const walk = function* (v, path) {
    if (typeof v === 'string') yield [path, v];
    else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* walk(v[i], `${path}[${i}]`);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) yield* walk(x, `${path}.${k}`);
  };
  for (const [k, v] of Object.entries(entry)) if (k !== 'icon') yield* walk(v, `${entry.id}.${k}`);
}
const firstSentence = (s) => s.split(/(?<=[.!?])\s/)[0].trim().toLowerCase();

test('every required id is defined exactly once, and extras are few and kebab-case', () => {
  assert.ok(Array.isArray(CODEX));
  const ids = CODEX.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate ids: ' + ids.filter((x, i) => ids.indexOf(x) !== i));
  assert.equal(REQUIRED_CODEX.length, 52);
  for (const id of REQUIRED_CODEX) assert.equal(ids.filter((x) => x === id).length, 1, `missing or repeated required id ${id}`);
  const extras = ids.filter((id) => !REQUIRED_CODEX.includes(id));
  assert.ok(extras.length <= 8, `too many extra entries: ${extras}`);
  for (const id of ids) assert.match(id, KEBAB, `${id} must be lowercase kebab-case`);
});

test('field types, counts and length limits', () => {
  for (const e of CODEX) {
    const w = e.id;
    const allowed = ['id', 'title', 'icon', 'category', 'zone', 'summary', 'body', 'formula', 'example', 'mistakes', 'tryIt', 'related', 'unlock'];
    for (const k of Object.keys(e)) assert.ok(allowed.includes(k), `${w}: unexpected field ${k}`);
    assert.ok(isStr(e.title) && e.title.length <= 40, `${w}: title`);
    assert.ok(CATEGORIES.includes(e.category), `${w}: category ${e.category}`);
    assert.ok(isStr(e.summary) && e.summary.length <= 140, `${w}: summary is ${e.summary?.length} chars (max 140)`);
    assert.ok(Array.isArray(e.body) && e.body.length >= 2 && e.body.length <= 4, `${w}: body needs 2 to 4 paragraphs`);
    for (const [i, p] of e.body.entries()) assert.ok(isStr(p) && p.length <= 420, `${w}: paragraph ${i} is ${p?.length} chars (max 420)`);
    if (e.formula !== undefined) assert.ok(isStr(e.formula) && e.formula.length <= 230, `${w}: formula`);
    assert.ok(e.example && isStr(e.example.setup) && isStr(e.example.result), `${w}: example needs setup and result`);
    assert.ok(Array.isArray(e.example.steps) && e.example.steps.length >= 2 && e.example.steps.length <= 5 && e.example.steps.every(isStr), `${w}: example needs 2 to 5 steps`);
    assert.ok(e.example.setup.length <= 380 && e.example.result.length <= 380, `${w}: example setup/result too long`);
    for (const s of e.example.steps) assert.ok(s.length <= 300, `${w}: a step is ${s.length} chars`);
    assert.ok(Array.isArray(e.mistakes) && e.mistakes.length >= 1 && e.mistakes.length <= 3 && e.mistakes.every(isStr), `${w}: 1 to 3 mistakes`);
    for (const m of e.mistakes) assert.ok(m.length <= 120, `${w}: mistake too long (${m.length})`);
    assert.ok(isStr(e.tryIt) && e.tryIt.length <= 260, `${w}: tryIt`);
    assert.ok(Array.isArray(e.related) && e.related.length >= 2 && e.related.length <= 6, `${w}: 2 to 6 related ids`);
    assert.equal(new Set(e.related).size, e.related.length, `${w}: repeated related id`);
  }
});

test('icons are a single emoji and not repeated', () => {
  const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
  const seen = new Map();
  for (const e of CODEX) {
    assert.ok(isStr(e.icon), `${e.id}: icon`);
    assert.equal([...seg.segment(e.icon)].length, 1, `${e.id}: icon must be one emoji`);
    assert.match(e.icon, PICTO, `${e.id}: icon must be an emoji`);
    assert.ok(!seen.has(e.icon), `${e.id} repeats the icon of ${seen.get(e.icon)}`);
    seen.set(e.icon, e.id);
  }
});

test('related ids resolve, never point at themselves, and are symmetrical', () => {
  for (const e of CODEX) {
    for (const r of e.related) {
      assert.ok(byId.has(r), `${e.id}: related id ${r} does not exist`);
      assert.notEqual(r, e.id, `${e.id} lists itself`);
      assert.ok(byId.get(r).related.includes(e.id), `${e.id} lists ${r}, but ${r} does not list ${e.id}`);
    }
  }
});

test('zone appears only on the sixteen district concepts and follows the TEACHES order', () => {
  assert.equal(TEACHES.length, 16);
  TEACHES.forEach((id, i) => assert.equal(byId.get(id).zone, i + 1, `${id} should be taught in district ${i + 1}`));
  for (const e of CODEX) if (!TEACHES.includes(e.id)) assert.equal(e.zone, undefined, `${e.id} is not a district concept and must not carry a zone`);
  // The district concepts open in district order at the front of the file.
  assert.deepEqual(CODEX.slice(0, 16).map((e) => e.id), TEACHES);
});

test('unlock is "start" or an event the player causes, with a match the payload can carry', () => {
  let starts = 0;
  for (const e of CODEX) {
    const u = e.unlock;
    if (u === 'start') { starts++; continue; }
    assert.ok(u && typeof u === 'object', `${e.id}: unlock must be "start" or { event, match? }`);
    assert.deepEqual(Object.keys(u).filter((k) => !['event', 'match'].includes(k)), [], `${e.id}: unlock has unknown keys`);
    assert.ok(EVENT_TYPES.includes(u.event), `${e.id}: unknown event ${u.event}`);
    if (u.match === undefined) continue;
    assert.ok(u.match && typeof u.match === 'object' && !Array.isArray(u.match), `${e.id}: match must be an object`);
    const evt = { type: u.event, day: 1 };
    for (const [k, want] of Object.entries(u.match)) {
      assert.ok(EVENT_PAYLOAD[u.event].includes(k), `${e.id}: ${u.event} events carry no field "${k}"`);
      if (want !== null && typeof want === 'object') {
        for (const [op, v] of Object.entries(want)) {
          assert.ok(OPS.includes(op), `${e.id}: unknown operator ${op}`);
          if (op === 'in') assert.ok(Array.isArray(v) && v.length > 0, `${e.id}: "in" needs a list`);
          else if (op !== 'eq') assert.ok(Number.isFinite(v), `${e.id}: ${op} needs a number`);
        }
        const [[op, v]] = Object.entries(want);
        evt[k] = op === 'in' ? v[0] : op === 'gt' ? v + 1 : op === 'lt' ? v - 1 : v;
      } else evt[k] = want;
    }
    assert.ok(matchEvent(u.match, evt), `${e.id}: no event can satisfy ${JSON.stringify(u.match)}`);
  }
  assert.ok(starts >= 12, `only ${starts} entries unlock at start (need at least 12)`);
  for (const id of ['fair-market-value', 'asset-utility-score', 'urgency-premium', 'margin', 'depreciation', 'opportunity-cost', 'cash-flow-velocity', 'persona-fit', 'anchoring']) {
    assert.equal(byId.get(id).unlock, 'start', `${id} is foundational and should unlock at start`);
  }
  assert.deepEqual(byId.get('information-asymmetry').unlock, { event: 'zone', match: { id: 4 } });
  assert.deepEqual(byId.get('margin-call').unlock, { event: 'margin-call' });
});

test('every category is used, and every district opens its own concept', () => {
  for (const c of CATEGORIES) assert.ok(CODEX.some((e) => e.category === c), `no entry in ${c}`);
  for (const [i, id] of TEACHES.entries()) {
    const u = byId.get(id).unlock;
    if (i === 0) assert.equal(u, 'start', 'district 1 concept starts unlocked');
    else assert.deepEqual(u, { event: 'zone', match: { id: i + 1 } }, `${id} should open on arriving in district ${i + 1}`);
  }
});

test('no two entries open with the same sentence, and titles and summaries differ', () => {
  const seen = new Map();
  for (const e of CODEX) {
    for (const [what, s] of [['body', firstSentence(e.body[0])], ['summary', firstSentence(e.summary)]]) {
      const key = what + ':' + s;
      assert.ok(!seen.has(key), `${e.id} and ${seen.get(key)} share a first ${what} sentence: "${s}"`);
      seen.set(key, e.id);
    }
  }
  assert.equal(new Set(CODEX.map((e) => e.title.toLowerCase())).size, CODEX.length, 'titles must be unique');
  // A paragraph is never repeated word for word anywhere.
  const paras = CODEX.flatMap((e) => e.body.map((p) => [e.id, p]));
  assert.equal(new Set(paras.map(([, p]) => p)).size, paras.length, 'a paragraph is repeated');
});

test('text is clean: no em or en dashes, no emoji outside icons, no stray spacing, sentences finished', () => {
  for (const e of CODEX) {
    for (const [path, s] of strings(e)) {
      assert.ok(!EM_DASH.test(s), `${path} contains an em dash`);
      assert.ok(!EN_DASH.test(s), `${path} contains an en dash (write "to" or a hyphen)`);
      assert.ok(!PICTO.test(s), `${path} contains an emoji`);
      assert.ok(!INVISIBLE.test(s), `${path} contains an invisible character`);
      assert.equal(s, s.trim(), `${path} has leading or trailing space`);
      assert.ok(!/ {2}/.test(s), `${path} has a double space`);
      assert.ok(!/\b(TODO|FIXME|lorem)\b/i.test(s), `${path} looks unfinished`);
    }
    for (const p of [...e.body, e.summary]) assert.match(p, /[.?)]$/, `${e.id}: "${p.slice(-30)}" should end a sentence`);
  }
});

test('the voice stays direct: no academic filler', () => {
  const banned = /\b(in conclusion|it is important to note|as we can see|in today's world|needless to say|simply put)\b/i;
  for (const e of CODEX) for (const [path, s] of strings(e)) assert.ok(!banned.test(s), `${path} uses filler`);
});

// ---------------------------------------------------------------------------------------------------------------------
// Worked numbers. Each figure the prose quotes is recomputed here from the formulas it states.
const idx = (u) => 0.5 + Math.min(200, Math.max(0, u)) / 100;
const fitMult = (f) => 0.4 + 0.95 * f;
const cm = (vn, vt) => Math.min(3.14, Math.max(0.4, (0.4 + Math.log((vt + 2) / (vn + 1))) * (1 - Math.min(1, vn / (vt + 1e-9)))));
const n0 = (x) => Math.round(x).toLocaleString('en-US');
const n2 = (x) => x.toFixed(2);
const usd = (x, d = 2) => '$' + (Math.round((Math.abs(x) + 1e-9) * 10 ** d) / 10 ** d).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
const choose = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
/** P(profit < 0) after n mystery boxes: price 20, contents 10/25/60 with chances .5/.35/.15 (exact, by convolution). */
function boxLossChance(n) {
  let dist = new Map([[0, 1]]);
  for (let i = 0; i < n; i++) {
    const nd = new Map();
    for (const [s, p] of dist) for (const [v, q] of [[10, 0.5], [25, 0.35], [60, 0.15]]) nd.set(s + v - 20, (nd.get(s + v - 20) || 0) + p * q);
    dist = nd;
  }
  let neg = 0; for (const [s, p] of dist) if (s < 0) neg += p;
  return neg;
}
const penFmv = 9 * idx(9 * 10 - 1);
const penPitch = penFmv * fitMult(0.85) * 0.6;
const bikeFmv = 240 * idx(5 * 8 - 3);
const vanWork = 5000 * idx(5 * 8 - 3); // the Fleet Van example: working value $4,350 in a district where its utility is 37
const vanAsIs = vanWork * 0.3;
const repairCost = (ops) => 1200 * 0.42 ** (ops - 1);
const restore = (ops) => 0.5 + 0.5 * Math.min(1, (ops - 1) / 4);
const nonDis = (hard, cash, debt, avg, mult, fails = 0) => { const prem = avg * mult * Math.max(0.3, 1 - 0.15 * fails); return cash + hard + prem - 0.12 * (hard + prem) - debt; };
const survive3 = 1 - (0.95 ** 20 + 20 * 0.05 * 0.95 ** 19 + choose(20, 2) * 0.05 ** 2 * 0.95 ** 18);

const FACTS = {
  'utility-fit': [fitMult(1).toFixed(2) + 'x', fitMult(0.5).toFixed(3) + 'x', fitMult(0.2).toFixed(2) + 'x'],
  'negotiation': [(65 / 60).toFixed(2) + 'x', (50 / 60).toFixed(2) + 'x', (78 / 60).toFixed(2) + 'x'],
  'saturation-herd': [idx(4 * 11.2 - 2).toFixed(3), idx(4 * 4.8 - 2).toFixed(3), (idx(4 * 11.2 - 2) / idx(4 * 4.8 - 2)).toFixed(2), String(cm(45, 60))],
  'information-asymmetry': [usd(0.78 * 120 + 0.22 * 15), usd(110 - (0.78 * 120 + 0.22 * 15))],
  'working-capital': [usd(1000 * 0.03, 0), usd((1000 * 0.12 / 30) * 3, 0), usd(1000 * 0.03 + (1000 * 0.12 / 30) * 3, 0), usd(300 - 42, 0)],
  'winners-curse': [pct(0.2 * 4 / 6), usd(1000 * (1 + 0.2 * 4 / 6), 0), usd(1000 * 0.2 * 4 / 6, 0)],
  'repair-roi': [usd(repairCost(4)), usd(vanWork * restore(4), 0), usd(vanWork * restore(1) - vanAsIs - repairCost(1), 0), usd(repairCost(4) * 0.75)],
  'supply-chain': [usd(2000 * 0.045, 0), usd(0.15 * 0.2 * 2000, 0), usd(0.3 * 0.02 * 2000, 0), pct((90 + 60 + 12) / 2000), pct((63 + 60 + 12) / 2000, 2)],
  'scale-compliance': [pct(80 / 750), pct(80 / 7500), usd(5000 * 1.5, 0), usd(5000 * 1.5 ** 2, 0)],
  'obsolescence': [usd(10000 * 0.96 ** 5, 0), usd(10000 * 0.96 ** 10, 0), Math.round(Math.log(0.5) / Math.log(0.96)) + ' days', usd(10000 - 10000 * 0.96 ** 10, 0)],
  'inventory-risk': [usd(2000 * 0.94, 0), usd(2000 * 0.94 ** 4, 0), usd(2000 * 0.94 ** 8, 0), Math.round(0.94 ** 8 * 100) + '%'],
  'recurring-revenue': [pct(350 / 50000), Math.round(50000 / 350) + ' days', usd(350 * 90, 0)],
  'enterprise-sales': [usd(3200 * (1 - 0.126), 0), usd(3200 * (1 - 0.126) * 60, 0), (40000 / (3200 * (1 - 0.126))).toFixed(1) + ' days', pct(2797 / 3797)],
  'leverage-risk': [pct(0.06 * 3 - 0.012 * 2), pct(-0.15 * 3 - 0.012 * 2), usd(10000 * (1 - 0.15 * 3 - 0.012 * 2), 0), usd(20000 / 4.5, 0), pct((10000 - 20000 / 4.5) / 30000)],
  'asset-cash-flow': [pct(320 * 30 / 400000), usd(400 * 30, 0), usd(0.08 * 400000, 0), usd(0.08 * 400000 - 12000, 0)],
  'arbitrage-at-scale': [usd(67200 - 60000 - 2700 - 0.025 * 67200, 0), usd(67200 - 60000 - 1890 - 0.025 * 67200, 0), pct(2820 / 60000), pct(3630 / 60000, 2), pct(1.045 / 0.975 - 1), pct(1.0315 / 0.975 - 1)],
  'fair-market-value': [usd(bikeFmv), usd(bikeFmv * 0.9 * 0.95), usd(bikeFmv * 0.3)],
  'asset-utility-score': [usd(penFmv), usd(150 * idx(26)), usd(150 * idx(53)), pct(idx(53) / idx(26) - 1)],
  'creativity-multiplier': [usd(penPitch), usd(penPitch * 3.14), usd(penPitch * cm(10, 100)), usd(penPitch * 0.4), cm(10, 100).toFixed(2), (0.4 + Math.log(42)).toFixed(2)],
  'market-saturation': [cm(4, 20).toFixed(2), cm(8, 24).toFixed(2), pct(1 - cm(8, 24) / cm(4, 20), 0)],
  'persona-fit': [fitMult(0.9).toFixed(3), fitMult(0.5).toFixed(3), (fitMult(0.9) / fitMult(0.5)).toFixed(2)],
  'urgency-premium': [usd(12 * 0.6 * cm(0, 0)), usd(12 * 0.775 * 0.6 * cm(0, 0)), Math.round(12 * 0.6 * cm(0, 0) / 0.05) + 'x'],
  'margin': [pct(3 / 9), pct(3 / 12), pct(2.7 / 12)],
  'depreciation': [(0.988 ** 30).toFixed(3), usd(900 * 0.988 ** 30, 0), (0.996 ** 30).toFixed(3), (0.998 ** 30).toFixed(3), usd(900 - 900 * 0.988 ** 30, 0)],
  'opportunity-cost': [(72 / 22).toFixed(2), usd(40 * 72 / 22, 0), '-' + usd(40 * 72 / 22 - 120, 0)],
  'cash-flow-velocity': [(6.8 * 24 / 22).toFixed(2) + '%', (5.5 * 24 / 17).toFixed(2) + '%', (1.068 ** (240 / 22)).toFixed(2) + 'x', (1.055 ** (240 / 17)).toFixed(2) + 'x'],
  'compounding': [usd(50 * 1.06 ** 12), usd(50 * 1.06 ** 24), usd(50 * 1.03 ** 24), usd(24 * 3, 0)],
  'interest-and-compounding': [usd(2000 * 0.12 / 30), usd(2000 * (1 + 0.12 / 30) ** 30, 0), usd(2000 * 1.12 ** 3, 0), usd(2000 * (1 + 0.12 / 30) ** 90, 0), usd(2000 * 1.12 ** 3 - 2000, 0), usd(2000 * (1 + 0.12 / 30) ** 90 - 2000, 0)],
  'debt-to-equity': [(1530 / 1870).toFixed(2), usd(3 * 1870 - 1530, 0), (1530 / (1870 - 380)).toFixed(2)],
  'margin-call': [usd(3000 * (1 + 1 / 4.5), 0), pct(1 - 3000 * (1 + 1 / 4.5) / 4000), usd(1800 * 0.65, 0), usd(1800 * 0.35, 0), '-' + usd(1800 - (3000 - 0.65 * 1800), 0)],
  'collateral': [usd(3000 / 0.65, 0), Math.round((1 - 3000 / 0.65 / 6000) * 100) + '%'],
  'cac-vs-ltv': [usd(52.25 * 30), (52.25 * 30 / 450).toFixed(1), (450 / 52.25).toFixed(1) + ' days', usd(450 * 0.84, 0), (52.25 * 30 / (450 * 0.84)).toFixed(1), (450 * 0.84 / 52.25).toFixed(1) + ' days', (52.25 * 30 / 1200).toFixed(1)],
  'sla': [usd(2 * 380, 0), usd(2 * 2 * 380, 0), usd(32 * 361, 0)],
  'audit-compliance': [usd(0.85 * 5000, 0), usd(0.85 * 5000 - 1200, 0), pct(0.15 ** 3)],
  'tariffs': [usd(1230 - 1000 - 45 - 30.75), usd(1230 - 1000 - 45 - 30.75 - 100), pct(154.25 / 1000), pct(54.25 / 1000)],
  'credit-crunch': [usd(2000 * 0.07 / 30), usd(2000 * 0.13 / 30), usd((2000 * 0.13 / 30 - 2000 * 0.07 / 30) * 15, 0), Math.round((0.13 / 0.07 - 1) * 100) + '%'],
  'demand-shock': [usd(900 * idx(6 * 6 - 6), 0), usd(900 * idx(6 * 30 - 6), 0), usd(900 * idx(6 * 6 - 6) * 0.5, 0), usd(900 * idx(174) - 720, 0), usd(900 * idx(174) - 360, 0)],
  'diversification': [pct(0.3 / Math.sqrt(4), 0), usd(0.3 * 4000, 0), usd(0.15 * 4000, 0)],
  'hedging': [usd(0.15 * 1500, 0), usd(0.5 * 1500, 0), pct(225 / 750, 0), usd(3000 * 0.5 - 525, 0), usd(525, 0)],
  'anchoring': [usd((560 + 320) / 2, 0), (440 / 400).toFixed(2) + 'x', (400 / 400).toFixed(2) + 'x', usd(1.25 * 480, 0)],
  'batna-zopa': [usd(240 * 0.875, 0), usd((245 + 270) / 2), usd(245 - 210, 0), usd(257.5 - 240)],
  'adverse-selection': [pct(11 / (11 + 7.8))],
  'due-diligence': ['-' + usd(0.78 * 10 - 0.22 * 80), '+' + usd(0.78 * 10 - 0.044 * 80), usd(0.78 * 10 - 0.044 * 80 + (0.22 * 80 - 0.78 * 10))],
  'comparative-advantage': [String(10 + 2), String(5 + 4), String(18)],
  'specialization': [usd(repairCost(5)), usd(vanWork - vanAsIs - repairCost(5), 0), usd(repairCost(3)), usd(vanWork * restore(3) - vanAsIs - repairCost(3), 0), usd((vanWork - vanAsIs - repairCost(5)) - (vanWork * restore(3) - vanAsIs - repairCost(3)), 0)],
  'economies-of-scale': [usd(6 + 0.002 * 100), usd(0.068 * 500 - 7, 0), usd(0.068 * 1000 - 8, 0), pct((0.068 * 5000 - (6 + 0.002 * 5000)) / 5000)],
  'network-effects': [String(5 * 4 / 2), String(10 * 9 / 2), String(20 * 19 / 2)],
  'risk-of-ruin': [Math.round(0.95 ** 10 * 100) + '%', Math.round(0.95 ** 20 * 100) + '%', Math.round(0.95 ** 40 * 100) + '%', pct(survive3, 1), Math.round(0.75 ** 3 * 100) + '%'],
  'expected-value': [usd(0.5 * 10 + 0.35 * 25 + 0.15 * 60), usd(22.75 - 20), Math.round(boxLossChance(20) * 100) + '%', Math.round(boxLossChance(100) * 100) + '%'],
  'eei-score': [(36 * (1 + 28 / 90)).toFixed(1), (40).toFixed(1), Math.round(((36 * (1 + 28 / 90)) / 40 - 1) * 100) + '%'],
  'reputation': [usd(5 * 60, 0), pct(40 / 300, 0)],
  'exit-valuation': [usd(nonDis(90000, 20000, 30000, 4000, 6), 0), usd(nonDis(90000, 20000, 30000, 4000, 10), 0), usd(nonDis(90000, 20000, 30000, 4000, 6, 2), 0),
    usd(nonDis(90000, 20000, 30000, 4000, 10) - nonDis(90000, 20000, 30000, 4000, 6), 0), usd(nonDis(90000, 20000, 30000, 4000, 6) - nonDis(90000, 20000, 30000, 4000, 6, 2), 0)],
  'supply-and-demand': [usd(9 * idx(9 * 9 - 1)), usd(9 * idx(9 * 8 - 1)), usd(9 * idx(9 * 6 - 1)), pct(1 - idx(71) / idx(89), 0), pct(1 - idx(53) / idx(89), 0)],
  'net-worth': [usd(300 + 58.2 + 600 - 500), usd(100 + 0.875 * 58.2 + 600 - 300), usd(58.2 * 0.125), usd(0.875 * 58.2)],
  'liquidity': [usd(3000 * 0.875, 0), usd(5000 * 0.35 / 24), (250 / (5000 * 0.35 / 24)).toFixed(1) + ' hours', usd(3000 * 0.125, 0)],
  'sunk-cost': [usd(620 * 0.988 ** 10, 0), usd(600 * 1.01 ** 10, 0), usd(600 * 1.01 ** 10 - 620 * 0.988 ** 10, 0)],
};

test('worked numbers in the examples match the formulas they state', () => {
  const missing = [];
  for (const [id, facts] of Object.entries(FACTS)) {
    const e = byId.get(id);
    assert.ok(e, `FACTS names an unknown entry ${id}`);
    const text = JSON.stringify([e.formula, e.example, e.body, e.summary]);
    for (const f of facts) if (!text.includes(f)) missing.push(`${id}: expected "${f}"`);
  }
  assert.deepEqual(missing, [], 'numbers quoted in the prose do not match the recomputed values:\n' + missing.join('\n'));
  // Every entry that states a formula and a numeric example is covered by at least one check.
  const uncovered = CODEX.filter((e) => /\d/.test(e.example.setup + e.example.steps.join('')) && !FACTS[e.id]).map((e) => e.id);
  assert.deepEqual(uncovered, [], 'numeric examples without a recomputed check: ' + uncovered);
});

test('the foundational formulas are the game\'s own', () => {
  // Pinned so a change to the numbers is a decision, not an accident.
  assert.equal(cm(10, 100).toFixed(2), '2.36');
  assert.equal(cm(0, 40), 3.14);
  assert.equal(cm(60, 100), 0.4);
  assert.equal(penFmv.toFixed(2), '12.51');
  assert.equal((0.4 + 0.95 * 1).toFixed(2), '1.35');
  assert.equal((4350 * 0.3).toFixed(0), '1305');
  assert.equal(repairCost(6).toFixed(2), '15.68');
  assert.equal(boxLossChance(1), 0.5);
});
