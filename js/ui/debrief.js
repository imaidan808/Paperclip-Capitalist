// Debrief: the metacognitive reflection screen. Turns the ledger into evidence for the three rubric prompts, and shows the build (two Backgrounds)
// the founder played with. `debriefHTML` is pure (no DOM) so a Node test can build it for any game; `mountDebrief` wires it to the page.
// What a reader needs once is folded (a <details>), and what defines a figure is on hover and, once more, in a fold (a title is shown to a mouse and to nothing else): the page opens on the numbers and the three prompts (docs/COPY.md).
import { ASSETS, BUYERS, EVENTS, SKILLS, PERKS, ZONES, ZONE_COUNT, TOTAL_DAYS, TOTAL_HOURS, CM, FMV_BAND, EEI_FLOOR_DEFAULT, BASE_RATE, FEES } from '../config.js';
import { fmtMoney as money, fmtPct as pct, creativityBand } from '../market.js';
import { $, esc, delegate, toast } from './common.js';
import { kv } from '../session.js';

const day = (h) => Math.floor(h / 24) + 1;
const num = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
export const ordinal = (n) => { const r = Math.round(n), t = r % 100, u = r % 10; return r + (t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th'); };
const nameOf = (id, table) => (own(table, id) ? table[id].name : String(id));
/** "Radio to Student" for a niche group key: `cls|seg`, or `txt|<the ledger's own words>` for a manager's cycle. */
const nicheName = (k) => { const [a, ...r] = k.split('|'), b = r.join('|'); return a === 'txt' ? b || 'a crowded niche' : `${nameOf(a, ASSETS)} to ${nameOf(b, BUYERS)}`; };
/** The crowd at a niche's latest crowded sale (its row is the latest one under CROWDED): the saturation S and the two volumes it is the ratio of. They are the engine's modeled 48-hour volumes (the class's expected pitches, the real peers' and your own: js/cohort.js `ghostCounts`, js/engine.js `cmFor`), fractions of a pitch, so they are printed as decimals under the formula's names and never as counts of pitches. */
const seen = (v) => (Number.isFinite(v.last.vN) && Number.isFinite(v.last.vT) ? `saturation ${pct(v.last.S || 0)} at its latest crowded sale (V_niche ${v.last.vN.toFixed(4)}, V_total ${v.last.vT.toFixed(4)})` : Number.isFinite(v.last.S) ? `saturation ${pct(v.last.S)} at its latest crowded sale` : 'saturation not recorded for manager cycles');
/** A sale or a manager cycle below this creativity multiplier is a crowded niche for the Prompt C table (the engine's "crowded" band ends at 0.9, its herd trap at 0.55: js/market.js `creativityBand`). */
export const CROWDED = 0.8;
/** The most niches the Prompt C table shows; the rest are one fold away. */
const TOP_NICHES = 5;

/** The two Backgrounds this founder drafted, as definitions (unknown ids are dropped, never thrown on). */
export const buildOf = (s) => (Array.isArray(s?.perks) ? s.perks.filter((id) => own(PERKS, id)).map((id) => PERKS[id]) : []);
const buildLine = (s) => buildOf(s).map((p) => `${p.icon} ${p.name}`).join(' + ') || 'No Background';

/** Where this founder stands among everyone the room knows about (overall: everybody started with one paperclip and $0, so there is no group to compare within). */
export function standing(lb, me) {
  if (!me || !lb.length) return { rank: null, n: lb.length, percentile: null };
  const below = lb.filter((r) => r.eei < me.eei).length;
  return { rank: me.rank, n: lb.length, percentile: lb.length > 1 ? (below / (lb.length - 1)) * 100 : null };
}

/** Deal Room play, from `game.s.meta` when the engine keeps it. The shape is read tolerantly: per game `{ n|count|plays, avg|mean|score }` or a bare count. Missing: []. */
const GAMES = [['inspect', 'Inspect', 'Read'], ['pitch', 'Pitch', 'Pitch'], ['haggle', 'Haggle', 'Close'], ['repair', 'Repair', 'Fix'], ['auction', 'Auction', 'Bid']];
export function skillStats(s) {
  const m = s && typeof s.meta === 'object' && s.meta ? s.meta : null;
  if (!m) return { rows: [], quick: null, played: null };
  const first = (o, keys) => { for (const k of keys) if (o && Number.isFinite(o[k])) return o[k]; return null; };
  const rows = [];
  for (const [id, name, stage] of GAMES) {
    const v = m[id] ?? m.games?.[id];
    if (v == null) continue;
    const plays = typeof v === 'number' ? v : first(v, ['n', 'count', 'plays', 'played', 'games']);
    if (!(plays > 0)) continue;
    let avg = typeof v === 'object' ? first(v, ['avg', 'mean', 'average', 'score']) : null;
    if (avg == null && typeof v === 'object' && Number.isFinite(v.sum)) avg = v.sum / plays;
    rows.push({ id, name, stage, plays: Math.round(plays), avg });
  }
  return { rows, quick: first(m, ['quick', 'quickDeals']), played: first(m, ['played', 'playedDeals', 'hand']) };
}
const scoreText = (a) => (a == null ? '' : a <= 1 ? pct(a) : num(a, 1));

/** What the build's costs took out of the ledger (family, garnishment, subscriptions) and whether the heir's bailout was used. */
export function buildCosts(L) {
  const sum = (type) => { const rows = L.filter((e) => e.type === type); return { n: rows.length, amt: rows.reduce((a, e) => a + Math.abs(Number.isFinite(e.amt) ? e.amt : 0), 0) }; };
  return { family: sum('family'), garnish: sum('garnish'), subscription: sum('subscription'), bailout: sum('bailout') };
}

function chart(s) {
  const pts = (s.hist || []).filter((p) => p[1] > 0);
  if (pts.length < 2) return '<p class="mute">Not enough history yet. Play a few more days.</p>';
  const W = 800, H = 260, L = 56, R = 12, T = 12, B = 28;
  const lo = Math.log10(Math.max(0.05, Math.min(...pts.map((p) => p[1])) * 0.8)), hi = Math.log10(Math.max(...pts.map((p) => p[1])) * 1.25 + 1);
  const x = (h) => L + (h / TOTAL_HOURS) * (W - L - R), y = (v) => T + (1 - (Math.log10(Math.max(v, 0.05)) - lo) / (hi - lo || 1)) * (H - T - B);
  const path = pts.map((p, i) => (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ');
  // the macro shocks that hit this run, on the days they hit it (an instructor can deploy one on any day, or put it in place of the scheduled one)
  const shocks = (s.shockLog || []).filter((e) => own(EVENTS, e.kind) && Number.isFinite(e.start)).map((e) => [e.start, e.name, day(e.start)]);
  // the gates of the districts that open something: managers and the Bank (5), audits (9), enterprise (13), the world markets (16)
  const marks = [5, 9, 13, ZONE_COUNT].filter((z) => ZONES[z]).map((z) => [ZONES[z].gate, `D${z}`]).filter(([v]) => v > 0 && Math.log10(v) > lo && Math.log10(v) < hi);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-labelledby="ch-t ch-d" style="background:var(--bg2);border:var(--bw) solid var(--line)">
    <title id="ch-t">Net worth over ${TOTAL_DAYS} days on a log scale</title><desc id="ch-d">Starts at ${money(pts[0][1])}, ends at ${money(pts[pts.length - 1][1])}, peak ${money(Math.max(...pts.map((p) => p[1])))}.${shocks.length ? ` Vertical lines mark the macro shocks on days ${shocks.map((x2) => x2[2]).join(', ')}.` : ''}${marks.length ? ` Dashed lines mark the gates of districts ${marks.map((m) => m[1].slice(1)).join(', ')}.` : ''}</desc>
    ${marks.map(([v, l]) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#34445c" stroke-dasharray="4 4"/><text x="4" y="${y(v) + 4}" fill="#a3b3c9" font-size="12">${l}</text>`).join('')}
    ${shocks.map(([h]) => `<line x1="${x(h)}" x2="${x(h)}" y1="${T}" y2="${H - B}" stroke="#ff7d75" stroke-width="2"/><text x="${x(h) + 4}" y="${T + 12}" fill="#ff7d75" font-size="11">Day ${day(h)}</text>`).join('')}
    <path d="${path}" fill="none" stroke="#ffc247" stroke-width="3"/>
    ${[0, 30, 60, 90].map((d) => `<text x="${x(d * 24)}" y="${H - 8}" fill="#a3b3c9" font-size="12" text-anchor="${d === 90 ? 'end' : d === 0 ? 'start' : 'middle'}">Day ${d || 1}</text>`).join('')}</svg>`;
}

export function evidence(S) {
  const g = S.game, s = g.s, L = s.ledger;
  const p2p = L.filter((e) => e.type === 'p2p' && e.gave);
  const fed = s.shockLog.find((x) => x.kind === 'fed');
  const win = (a, b) => L.filter((e) => e.h >= a && e.h < b);
  const fedActs = fed ? win(fed.start - 24, fed.start + 120).filter((e) => ['loan', 'repay', 'pool', 'hire', 'client', 'freight', 'margin'].includes(e.type)) : [];
  const bad = L.filter((e) => (e.type === 'pitch' || e.type === 'pipe') && e.cm && e.cm < CROWDED);
  const groups = {};
  // a pitch names its asset class and buyer; a manager's cycle names them only in its text ("Asset Broker: Radio to Student"). `net` adds up the ledger's own amounts: for a pitch what came in less its fair value
  // (js/engine.js `pitch`: received - fmv, a gain when it is above), for a manager's cycle the cycle's profit (`_cycleDone`: the forecast's net). `last` is the niche's latest row.
  for (const e of bad) {
    const k = e.cls && e.seg ? e.cls + '|' + e.seg : 'txt|' + String(e.text || '').replace(/^[^:]*:\s*/, '');
    const grp = (groups[k] ||= { n: 0, net: 0, cm: 0, cycles: e.type === 'pipe', last: e });
    grp.n++; grp.net += e.amt; grp.cm += e.cm; grp.last = e;
  }
  // the most crowded first: the lowest average multiplier, then the niche met most often
  const niches = Object.entries(groups).sort((a, b) => a[1].cm / a[1].n - b[1].cm / b[1].n || b[1].n - a[1].n);
  const pitches = L.filter((e) => e.type === 'pitch' && e.cm);
  const inBand = (id) => pitches.filter((e) => creativityBand(e.cm).id === id).length;
  return { g, s, p2p, fed, fedActs, groups, niches, herd: inBand('herd'), pioneer: inBand('pioneer'), pitches };
}

const reached = (s) => { const z = Math.max(1, ...(s.zones || [1])); return { z, name: ZONES[z]?.name || `District ${z}` }; };
/** "Final net worth" once the run is closed (the bell, or an exit), "Net worth now" while it is still on (js/engine.js `closedNetWorth`). */
const worthLabel = (s) => (s.exit || s.final ? 'Final net worth' : 'Net worth now');

/** A swap's two sides at fair value as [gave, got], or null when the row holds no values. The ledger's `va` is what the proposer gave and `vb` what they asked for (js/engine.js `createOffer`, `acceptOffer`, `finalizeOffer`), so the founder
 *  who accepted gave `vb` and got `va`; only that row keeps the proposer's skills (`peerSkills`, an object even when empty). The gain (`amt`) is counted when the swap settles, so it is not read off this pair. */
const swapWorth = (e) => (Number.isFinite(e.va) && Number.isFinite(e.vb) ? (e.peerSkills ? [e.vb, e.va] : [e.va, e.vb]) : null);

export function reflectionMD(S, notes) {
  const { g, s, p2p, fed, fedActs, niches } = evidence(S);
  const lb = S.leaderboard(), me = lb.find((r) => r.me), st = standing(lb, me), d = reached(s), costs = buildCosts(s.ledger), sk = skillStats(s);
  const L = [`# Paperclip Capitalist: reflection workbook`, '', `Founder ID: ${s.pid} (${s.handle})  `, `Build: ${buildOf(s).map((p) => p.name).join(' + ') || 'none'}  `, `${worthLabel(s)}: ${money(g.closedNetWorth())}  `,
    `Economic Efficiency Index: ${num(g.eei())}${st.rank ? ` (rank ${st.rank} of ${st.n}${st.percentile != null ? `; ${ordinal(st.percentile)} percentile overall` : ''})` : ''}  `,
    `District reached: ${d.z} of ${ZONE_COUNT}, ${d.name}  `, `Level: ${g.level()}  `, `Creativity score: ${num(g.creativityScore(), 0)}/100, ${s.cm.n} niche transactions`, '',
    '## Evidence: your build'];
  for (const p of buildOf(s)) L.push(`- ${p.name} (${p.basis}) Strength: ${p.strength} Cost: ${p.cost}`);
  if (costs.family.n) L.push(`- Family obligations paid: ${money(costs.family.amt)} in ${costs.family.n} payment(s).`);
  if (costs.garnish.n) L.push(`- Student-loan garnishment: ${money(costs.garnish.amt)} in ${costs.garnish.n} installment(s).`);
  if (costs.subscription.n) L.push(`- Tool subscriptions: ${money(costs.subscription.amt)} in ${costs.subscription.n} charge(s).`);
  if (costs.bailout.n) L.push('- The family bailout was used once.');
  if (sk.rows.length) { L.push('', '## Evidence: Deal Room play'); for (const r of sk.rows) L.push(`- ${r.name} (${r.stage}): played ${r.plays} time(s)${r.avg != null ? `, average score ${scoreText(r.avg)}` : ''}.`); }
  L.push('', '## Evidence: Prompt A (the asymmetric trade)');
  if (!p2p.length) L.push('No peer swaps completed.');
  for (const e of p2p) L.push(`- Day ${day(e.h)}: gave ${e.gave.map((c) => nameOf(c, ASSETS)).join(', ') || 'cash'}, got ${e.got.map((c) => nameOf(c, ASSETS)).join(', ') || 'cash'}.${swapWorth(e) ? ` Worth at fair value: gave ${money(swapWorth(e)[0])}, got ${money(swapWorth(e)[1])}.` : ''} Gain at fair value ${money(e.amt, { plus: true })}${Number.isFinite(e.variance) ? ` (variance ${pct(e.variance, 1)})` : ''}. Counterparty skills: ${e.peerSkills && Object.keys(e.peerSkills).length ? Object.entries(e.peerSkills).map(([k, v]) => k + ' ' + v).join(', ') : 'n/a'}; yours: ${Object.entries(s.skills).map(([k, v]) => k + ' ' + v).join(', ')}.`);
  L.push('', `## Evidence: Prompt B (the credit crunch${fed ? `, day ${day(fed.start)}` : ''})`);
  if (!fed) L.push('No credit crunch has occurred in your run.');
  else { L.push(`- Capital structure when it hit: cash ${money(fed.cash)}, debt ${money(fed.debt)}, D/E ${Number.isFinite(fed.de) ? fed.de.toFixed(2) : 'inf'}, inventory ${money(fed.inv)}, managers ${fed.pipes}, net worth ${money(fed.nw)}.`, fed.nwAfter != null ? `- Five days later: net worth ${money(fed.nwAfter)} after ${fed.pivots ?? 0} pivot action(s).` : '- Five days later: n/a, fewer than five days had passed since the shock.'); for (const e of fedActs) L.push(`- Day ${day(e.h)} ${e.type}: ${e.text} (${money(e.amt, { plus: true })})`); }
  L.push('', '## Evidence: Prompt C (the creativity penalty)');
  if (!niches.length) L.push(`No sale or manager cycle fell below a creativity multiplier of ${CROWDED}.`);
  for (const [k, v] of niches) L.push(`- ${nicheName(k)}: ${v.n} transaction(s) at average Cm ${(v.cm / v.n).toFixed(2)}; ${seen(v)}; ${v.cycles ? 'cycle profit' : 'against fair value'} ${money(v.net, { plus: true })}.`);
  L.push('', '## My analysis', '', notes || '(write here)');
  return L.join('\n');
}

const stat = (k, v, cls = '', sub = '', hero = false, hover = '') => `<div class="card sc-stat${hero ? ' sc-hero' : ''}"${hover}><div class="small mute sc-k">${k}</div><div class="mono sc-v ${cls}">${v}</div>${sub ? `<div class="tiny mute">${sub}</div>` : ''}</div>`;
const lineHTML = (kind, text) => `<p class="small" style="margin:0"><b class="${kind === '+' ? 'green' : 'red'}" aria-hidden="true">${kind}</b> <span class="sr">${kind === '+' ? 'Strength' : 'Cost'}: </span>${esc(text)}</p>`;
/** A column head; `hover` is the ` title="..."` that `debriefHTML`'s hover helper makes, or nothing. */
const th = (label, hover = '') => `<th scope="col"${hover}>${label}</th>`;
/** A fold: what a reader opens once stays shut until then. A printed debrief carries it all (`data-print`: mountDebrief opens these for the print). */
const fold = (summary, body) => `<details class="gap" data-print><summary class="small">${summary}</summary>${body}</details>`;
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/**
 * What a figure is, on hover. Every number is the engine's, read from it where it can be (js/config.js CM, FMV_BAND; js/market.js `creativityBand`, `eei`; js/engine.js `creativityScore`, `pitch`, `_cycleDone`, `_swapDone`)
 * and held by tests/copy2-debrief.test.mjs, which recomputes the thresholds from the engine.
 */
const TIPS = {
  herd: 'Pitches sold at a creativity multiplier of 0.55 or less.',
  pioneer: 'Pitches sold at a creativity multiplier of 2.4 or more.',
  percentile: 'The share of the other players whose efficiency index is lower than yours.',
  score: `Your average creativity multiplier over all niche sales and manager cycles, scaled so ${CM.min.toFixed(2)} scores 0 and ${CM.max} scores 100.`,
  de: 'Debt divided by net worth when the shock began.',
  pivots: 'Pool sales, loan repayments, manager lane changes, pauses and releases, and counted swaps in the five days after.',
  worth: 'What you gave and what you got were each worth at fair value when the swap was priced, cash and royalties included. A swap you proposed is priced when you offered it, and its gain counted when it settled.',
  gain: 'What you got less what you gave, both at fair value.',
  variance: `The gap between the two sides' fair values as a share of the lower side. A swap more than ${Math.round(FMV_BAND * 100)}% apart is flagged and blocked.`,
  skill: 'The highest skill of the classmate who proposed the swap. Recorded only for swaps you accepted.',
  cm: 'Creativity multiplier.',
  saturation: 'The niche\'s share of the recent pitches of that asset in that district, at its latest crowded sale. Not recorded for manager cycles.',
  result: 'A sale: what you received less its fair value. A manager cycle: the cycle\'s profit. Added up.',
};

/** The Cm formula as the Codex gives it (js/meta/codex.js, "Creativity Multiplier"); the numbers are js/config.js CM. */
const CM_FORMULA = `Cm = [${CM.beta.toFixed(2)} + ln((V_total + 2) / (V_niche + 1))] x (1 - S), kept between ${CM.min.toFixed(2)} and ${CM.max}, with S = V_niche / V_total`;

/** The whole debrief page as a string. `notes` is the founder's draft (kept in the textarea). */
export function debriefHTML(S, notes = '') {
  const E = evidence(S), { g, s } = E;
  const lb = S.leaderboard(), me = lb.find((r) => r.me), st = standing(lb, me), d = reached(s), costs = buildCosts(s.ledger), sk = skillStats(s), build = buildOf(s);
  const words = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);
  // A hover is made here and nowhere else, so that the fold "What the figures mean" says the same words once more, in the page's order, where a keyboard, a finger, a screen reader and the paper can read them.
  const meaning = [];
  const hover = (label, text) => { if (!meaning.some(([, t]) => t === text)) meaning.push([label, text]); return ` title="${esc(text)}"`; };
  const floor = S.difficulty?.eeiFloor ?? EEI_FLOOR_DEFAULT, simulated = (S.synth || []).length;
  const eeiTip = `Net worth divided by the ${money(floor)} starting-capital floor, times 1 plus the share of the ${TOTAL_DAYS} days left.`;
  const f = E.fed;
  const grid = [stat(worthLabel(s), money(g.closedNetWorth()), 'gold', '', true), stat('Efficiency index', num(g.eei()), 'green', '', false, hover('Efficiency index', eeiTip)),
    stat('Overall percentile', st.percentile != null ? ordinal(st.percentile) : 'n/a', '', st.n ? `of ${plural(st.n, 'player')}${simulated ? `, ${simulated} simulated` : ''}` : '', false, hover('Overall percentile', TIPS.percentile)),
    stat('Rank', st.rank ? `${st.rank} of ${st.n}` : 'n/a'), stat('District reached', `${d.z} of ${ZONE_COUNT}`, '', esc(d.name)), stat('Level', g.level(), '', `${s.points ?? 0} skill point${s.points === 1 ? '' : 's'} unspent`),
    stat('Peak net worth', money(s.peak)), stat('Creativity score', num(g.creativityScore(), 0) + ' / 100', '', '', false, hover('Creativity score', TIPS.score)),
    stat('Herd-trap pitches', E.herd, E.herd ? 'red' : '', '', false, hover('Herd-trap pitches', TIPS.herd)), stat('Pioneer pitches', E.pioneer, E.pioneer ? 'green' : '', '', false, hover('Pioneer pitches', TIPS.pioneer)),
    stat('Best deal streak', s.bestStreak ?? 0)].join('');
  const costLines = [
    costs.family.n && `Family obligations paid: <b class="mono red">${money(costs.family.amt)}</b> in ${plural(costs.family.n, 'payment')}.`,
    costs.garnish.n && `Student-loan garnishment: <b class="mono red">${money(costs.garnish.amt)}</b> of ${money(PERKS.grad.mods.garnish.cap)} repaid.`,
    costs.subscription.n && `Tool subscriptions: <b class="mono red">${money(costs.subscription.amt)}</b> over ${plural(costs.subscription.n, 'charge')}.`,
    costs.bailout.n && 'The family bailout was used once, clearing part of your debt at a margin call.',
  ].filter(Boolean);
  const specialty = s.specialty && own(SKILLS, s.specialty) ? SKILLS[s.specialty].name : 'none';
  const skillsLine = Object.values(SKILLS).map((k) => `${esc(k.short)} ${s.skills?.[k.id] ?? 1}`).join(' &middot; ');
  const perHand = sk.quick != null && sk.played != null && sk.quick + sk.played > 0 ? `You played ${Math.round(sk.played)} deal${Math.round(sk.played) === 1 ? '' : 's'} by hand and auto-played ${Math.round(sk.quick)} with Quick.` : '';
  const shockRows = s.shockLog.map((x) => { const ch = x.nwAfter != null && x.nw > 0 ? x.nwAfter / x.nw - 1 : null; return `<tr><td>${esc(x.name || x.kind || 'Shock')}</td><td class="mono">${day(x.start)}</td><td class="mono">${money(x.nw)}</td><td class="mono">${x.nwAfter != null ? money(x.nwAfter) : 'n/a'}</td><td class="mono ${ch == null ? '' : ch < 0 ? 'red' : 'green'}">${ch == null ? 'n/a' : (ch >= 0 ? '+' : '') + pct(ch, 0)}</td><td class="mono">${Number.isFinite(x.de) ? x.de.toFixed(2) : 'inf'}</td><td class="mono">${x.pivots ?? 'n/a'}</td></tr>`; }).join('');
  const shocks = s.shockLog.length ? `<div class="scroll"><table class="tbl"><caption class="sr">Macro shocks and your net worth before and five days after</caption><thead><tr>${th('Shock')}${th('Day')}${th('Net worth at the shock')}${th('Five days later')}${th('Change')}${th('D/E', hover('D/E', TIPS.de))}${th('Pivots', hover('Pivots', TIPS.pivots))}</tr></thead><tbody>${shockRows}</tbody></table></div>` : '<p class="mute small">No macro shock has occurred in your run yet.</p>';
  const skillOf = (e) => { const top = e.peerSkills && Object.entries(e.peerSkills).sort((a, b) => b[1] - a[1])[0]; return top ? esc(own(SKILLS, top[0]) ? SKILLS[top[0]].short : top[0]) : 'n/a'; };
  const p2pRows = E.p2p.map((e) => { const w = swapWorth(e); return `<tr><td class="mono">${day(e.h)}</td><td>${e.gave.map((c) => esc(nameOf(c, ASSETS))).join(', ') || 'cash'}</td><td>${e.got.map((c) => esc(nameOf(c, ASSETS))).join(', ') || 'cash'}</td><td class="mono">${w ? `${money(w[0])} for ${money(w[1])}` : 'n/a'}</td><td class="mono ${e.amt > 0 ? 'green' : e.amt < 0 ? 'red' : ''}">${money(e.amt, { plus: true })}</td><td class="mono">${Number.isFinite(e.variance) ? pct(e.variance, 1) : 'n/a'}</td><td>${skillOf(e)}</td></tr>`; }).join('');
  const swaps = E.p2p.length ? `<div class="scroll"><table class="tbl"><thead><tr>${th('Day')}${th('You gave')}${th('You got')}${th('Fair value, gave for got', hover('Fair value, gave for got', TIPS.worth))}${th('Gain at fair value', hover('Gain at fair value', TIPS.gain))}${th('Variance', hover('Variance', TIPS.variance))}${th('Their top skill', hover('Their top skill', TIPS.skill))}</tr></thead><tbody>${p2pRows}</tbody></table></div>` : '<p class="small mute">No peer swaps completed. A swap with a classmate or the Practice Partner supplies the data for this prompt, but only a classmate\'s counts toward Peer Market Engagement (10% of the grade).</p>';
  const freeze = EVENTS.fed.phases.find((p) => p.eff.freeze), rises = EVENTS.fed.phases.find((p) => p.eff.rateBps)?.eff, soften = g.P.shockSoften || 0;
  // the Veteran's shocks land softer (js/engine.js `mods`): the three rises the alert announces are smaller for that founder, the loan freeze is not
  const softer = soften > 0 && rises ? `<li>Your ${esc(build.filter((p) => p.mods?.shockSoften).map((p) => p.name).join(' and '))} Background softens the three rises by ${Math.round(soften * 100)}%: for you the base monthly rate rises to ${pct(BASE_RATE + rises.rateBps * (1 - soften) / 1e4, 1)}, the base fee on sales to ${pct(FEES.base + rises.fee * (1 - soften), 1)} and manager overhead by ${pct((rises.overhead - 1) * (1 - soften), 0)}. The loan freeze is not softened.</li>` : '';
  const crunch = f ? `<p class="mute small">${f.de > 1 ? 'Debt exceeded your net worth when it hit: explain what stopped margin compression.' : 'Debt was at most your net worth when it hit: explain how you used that position while credit was tight.'}</p>
      <dl class="kv"><dt>Cash</dt><dd>${money(f.cash)}</dd><dt>Debt</dt><dd>${money(f.debt)}</dd><dt${hover('Debt-to-equity', TIPS.de)}>Debt-to-equity</dt><dd>${Number.isFinite(f.de) ? f.de.toFixed(2) : 'inf'}</dd><dt>Inventory</dt><dd>${money(f.inv)}</dd><dt>Managers</dt><dd>${f.pipes} (${f.intl} international)</dd><dt>Net worth at the shock</dt><dd>${money(f.nw)}</dd><dt>Net worth five days later</dt><dd>${f.nwAfter != null ? money(f.nwAfter) : 'n/a'}</dd><dt${hover('Pivots in the five days after', TIPS.pivots)}>Pivots in the five days after</dt><dd>${f.pivots ?? 'n/a'}</dd></dl>
      ${E.fedActs.length ? fold(`Your actions from a day before to five days after (${E.fedActs.length})`, `<ul class="small">${E.fedActs.map((e) => `<li>Day ${day(e.h)} ${esc(e.type)}: ${esc(e.text)} (${money(e.amt, { plus: true })})</li>`).join('')}</ul>`) : '<p class="small mute">No financing, liquidation, hiring, client or freight activity from a day before to five days after.</p>'}
      ${fold('What the credit crunch changed', `<ul class="small">${EVENTS.fed.alert.vars.map((v) => `<li>${esc(v)}</li>`).join('')}${freeze ? `<li>No new bank loans for ${(freeze.to - freeze.from) / 24} days.</li>` : ''}${softer}</ul>`)}` : '<p class="mute">No credit crunch has occurred in your run.</p>';
  const nicheRow = ([k, v]) => `<tr><td>${esc(nicheName(k))}</td><td class="mono">${v.n}</td><td class="mono red">${(v.cm / v.n).toFixed(2)}x</td><td class="mono">${Number.isFinite(v.last.S) ? pct(v.last.S) : 'n/a'}</td><td class="mono ${v.net < 0 ? 'red' : 'green'}">${money(v.net, { plus: true })} <span class="tiny mute">${v.cycles ? 'profit' : 'vs fair'}</span></td></tr>`;
  const nicheTable = (rows) => `<div class="scroll"><table class="tbl"><thead><tr>${th('Niche')}${th('Times')}${th('Avg Cm', hover('Avg Cm', TIPS.cm))}${th('Saturation', hover('Saturation', TIPS.saturation))}${th('Result', hover('Result', TIPS.result))}</tr></thead><tbody>${rows.map(nicheRow).join('')}</tbody></table></div>`;
  const topNiches = E.niches.slice(0, TOP_NICHES), otherNiches = E.niches.slice(TOP_NICHES);
  const niches = topNiches.length ? `<p class="tiny mute">Sales and manager cycles below a creativity multiplier of ${CROWDED}, lowest first.</p>${nicheTable(topNiches)}${otherNiches.length ? fold(`The other ${plural(otherNiches.length, 'niche')}`, nicheTable(otherNiches)) : ''}` : `<div class="callout good">No sale or manager cycle fell below a creativity multiplier of ${CROWDED}. Describe what you did to avoid the herd.</div>`;
  return `
    <header class="panel row no-print"><div class="grow"><h1 tabindex="-1" style="margin:0">Debrief</h1><span class="mute small">${esc(buildLine(s))} &middot; ${esc(s.handle)} &middot; Founder ID ${esc(s.pid)}</span></div><button class="btn ghost" data-act="back">Back to the game</button><button class="btn ghost" data-act="print">Print</button></header>
    <section class="panel gap"><h2>Your ${TOTAL_DAYS} days</h2>
      <div class="grid g3 sc-stats">${grid}</div>
      ${meaning.length ? fold('What the figures mean', `<ul class="small">${meaning.map(([k, v]) => `<li><b>${esc(k)}</b>: ${esc(v)}</li>`).join('')}</ul>`) : ''}
      <h3 class="gap">Net worth, log scale</h3>${chart(s)}
      <details class="gap"><summary class="small">Data table for the chart</summary><div class="scroll"><table class="tbl"><thead><tr><th scope="col">Day</th><th scope="col">Net worth</th></tr></thead><tbody>${(s.hist || []).filter((_, i) => i % 3 === 0).map((p) => `<tr><td>${day(p[0])}</td><td class="mono">${money(p[1])}</td></tr>`).join('')}</tbody></table></div></details></section>
    <section class="panel gap"><h2>Your build</h2>
      <p class="mute small">Specialty: ${esc(specialty)}. Skills at the end: ${skillsLine}.</p>
      ${costLines.length ? `<h3>Build costs in the ledger</h3><ul class="small">${costLines.map((c) => `<li>${c}</li>`).join('')}</ul>` : '<p class="small mute">Your Backgrounds work through prices, speed and limits rather than ledger lines. Compare with a classmate who drafted differently.</p>'}
      ${build.length ? fold('Strength and cost of each Background', `<div class="sc-build">${build.map((p) => `<div class="card"><b><span class="sc-ic" aria-hidden="true">${p.icon}</span>${esc(p.name)}</b><em class="small mute">${esc(p.basis)}</em>${lineHTML('+', p.strength)}${lineHTML('-', p.cost)}</div>`).join('')}</div>`) : '<p class="mute">This run has no recorded Backgrounds.</p>'}
      <p class="small gap">Judge which Background earned its cost, and which pair you would draft next time.</p></section>
    <section class="panel gap"><h2>Deal Room play</h2>
      ${sk.rows.length ? `<div class="scroll"><table class="tbl"><caption class="sr">Skill games played</caption><thead><tr><th scope="col">Game</th><th scope="col">Stage</th><th scope="col">Played</th><th scope="col">Average score</th></tr></thead><tbody>${sk.rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.stage)}</td><td class="mono">${r.plays}</td><td class="mono">${esc(scoreText(r.avg)) || 'n/a'}</td></tr>`).join('')}</tbody></table></div>${perHand ? `<p class="small mute">${perHand}</p>` : ''}`
        : '<p class="small mute">No Deal Room scores were recorded. Playing a deal by hand (Read, Pitch, Close) instead of Quick adds them.</p>'}</section>
    <section class="panel gap"><h2>How you met the shocks</h2>
      ${shocks}</section>
    <section class="panel gap"><h2>Prompt A: the asymmetric trade</h2>
      <p class="mute small">Explain how a swap with a classmate of a different specialty created value neither of you could reach alone.</p>
      ${swaps}</section>
    <section class="panel gap"><h2>Prompt B: the credit crunch${f ? `, day ${day(f.start)}` : ''}</h2>
      ${crunch}</section>
    <section class="panel gap"><h2>Prompt C: decoding the creativity penalty</h2>
      <p class="mute small">Explain how cohort volume lowered your creativity multiplier in one crowded niche, and which niche you pivoted to.</p>
      ${niches}
      ${fold('The formula', `<p class="small mono">${CM_FORMULA}</p><p class="small mute">V_total is the pitches of that asset in that district over the last 48 virtual hours, V_niche the ones to the same buyer (the class's expected pitches plus yours, so not whole numbers).</p>`)}</section>
    <section class="panel gap"><h2>Your analysis</h2>
      <p class="small mute">1,000 to 1,500 words, using exact numbers from your ledger. Saved in this browser as you type.</p>
      <label for="notes">Reflection draft</label><textarea id="notes" rows="14" style="width:100%" data-input="notes">${esc(notes)}</textarea>
      <div class="row gap"><span id="wc" class="mono small" aria-live="polite">${wordCountHTML(words(notes))}</span><span class="grow"></span><button class="btn" data-act="md">Download workbook (.md)</button></div></section>`;
}
function wordCountHTML(n) { return `${n} words${n < 1000 ? '' : n <= 1500 ? ' <span class="green">in range</span>' : ' <span class="gold">over target</span>'}`; }

export function mountDebrief(root, S, hooks) {
  const U = { notes: kv.get('reflection') || '' };
  const s = S.game.s;
  root.innerHTML = debriefHTML(S, U.notes);
  const words = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);
  const wc = () => { const el = $('#wc'); if (el) el.innerHTML = wordCountHTML(words(U.notes)); };
  const acts = {
    back() { hooks.onBack(); },
    print() { window.print(); },
    notes(b) { U.notes = b.value; kv.set('reflection', U.notes); wc(); },
    md() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([reflectionMD(S, U.notes)], { type: 'text/markdown' })); a.download = `reflection-${s.pid}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast('Workbook downloaded.', 'good'); },
  };
  delegate(root, acts);
  // what the folds hold is on the paper: they are opened for the print (the Print button, or the browser's own) and shut again after it
  const opened = [];
  const openForPrint = () => { for (const d of root.querySelectorAll('details[data-print]:not([open])')) { d.open = true; opened.push(d); } };
  const shutAfterPrint = () => { for (const d of opened.splice(0)) d.open = false; };
  addEventListener('beforeprint', openForPrint); addEventListener('afterprint', shutAfterPrint);
  root.querySelector('h1')?.focus();
  return { destroy() { removeEventListener('beforeprint', openForPrint); removeEventListener('afterprint', shutAfterPrint); } };
}
