// Debrief: the metacognitive reflection screen. Turns the ledger into evidence for the three rubric prompts, and shows the build (two Backgrounds)
// the founder played with. `debriefHTML` is pure (no DOM) so a Node test can build it for any game; `mountDebrief` wires it to the page.
import { ASSETS, BUYERS, EVENTS, SKILLS, PERKS, ZONES, ZONE_COUNT, TOTAL_DAYS, TOTAL_HOURS } from '../config.js';
import { fmtMoney as money, fmtPct as pct } from '../market.js';
import { $, esc, delegate, toast } from './common.js';
import { kv } from '../session.js';

const day = (h) => Math.floor(h / 24) + 1;
const num = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
export const ordinal = (n) => { const r = Math.round(n), t = r % 100, u = r % 10; return r + (t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th'); };
const nameOf = (id, table) => (own(table, id) ? table[id].name : String(id));
/** "Radio to Student" for a niche group key: `cls|seg`, or `txt|<the ledger's own words>` for a manager's cycle. */
const nicheName = (k) => { const [a, ...r] = k.split('|'), b = r.join('|'); return a === 'txt' ? b || 'a crowded niche' : `${nameOf(a, ASSETS)} to ${nameOf(b, BUYERS)}`; };
const seen = (v) => (Number.isFinite(v.last.vN) && Number.isFinite(v.last.vT) ? `last seen ${v.last.vN.toFixed(0)} of ${v.last.vT.toFixed(0)} cohort pitches (saturation ${pct(v.last.S || 0)})` : `saturation ${pct(v.last.S || 0)}`);

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
  const shocks = Object.values(EVENTS).map((e) => [(e.day - 1) * 24, e.name, e.day]);
  // the gates of the districts that open something: managers and the Bank (5), audits (9), enterprise (13), the world markets (16)
  const marks = [5, 9, 13, ZONE_COUNT].filter((z) => ZONES[z]).map((z) => [ZONES[z].gate, `D${z}`]).filter(([v]) => v > 0 && Math.log10(v) > lo && Math.log10(v) < hi);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-labelledby="ch-t ch-d" style="background:var(--bg2);border:var(--bw) solid var(--line)">
    <title id="ch-t">Net worth over ${TOTAL_DAYS} days on a log scale</title><desc id="ch-d">Starts at ${money(pts[0][1])}, ends at ${money(pts[pts.length - 1][1])}, peak ${money(Math.max(...pts.map((p) => p[1])))}. Vertical lines mark the macro shocks on days ${shocks.map((x2) => x2[2]).join(', ')}. Dashed lines mark the gates of districts 5, 9, 13 and 16.</desc>
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
  const bad = L.filter((e) => (e.type === 'pitch' || e.type === 'pipe') && e.cm && e.cm < 0.8);
  const groups = {};
  // a pitch names its asset class and buyer; a manager's cycle names them only in its text ("Asset Broker: Radio to Student")
  for (const e of bad) { const k = e.cls && e.seg ? e.cls + '|' + e.seg : 'txt|' + String(e.text || '').replace(/^[^:]*:\s*/, ''); (groups[k] ||= { n: 0, lost: 0, cm: 0, last: e }).n++; groups[k].lost += e.amt; groups[k].cm += e.cm; }
  const pitches = L.filter((e) => e.type === 'pitch' && e.cm);
  return { g, s, p2p, fed, fedActs, groups, herd: pitches.filter((e) => e.cm <= 0.55).length, pioneer: pitches.filter((e) => e.cm >= 2.4).length, pitches };
}

const reached = (s) => { const z = Math.max(1, ...(s.zones || [1])); return { z, name: ZONES[z]?.name || `District ${z}` }; };

export function reflectionMD(S, notes) {
  const { g, s, p2p, fed, fedActs, groups } = evidence(S);
  const lb = S.leaderboard(), me = lb.find((r) => r.me), st = standing(lb, me), d = reached(s), costs = buildCosts(s.ledger), sk = skillStats(s);
  const L = [`# Paperclip Capitalist: reflection workbook`, '', `Founder ID: ${s.pid} (${s.handle})  `, `Build: ${buildOf(s).map((p) => p.name).join(' + ') || 'none'}  `, `Final net worth: ${money(g.netWorth())}  `,
    `Economic Efficiency Index: ${num(g.eei())}${st.rank ? ` (rank ${st.rank} of ${st.n}${st.percentile != null ? `; ${ordinal(st.percentile)} percentile overall` : ''})` : ''}  `,
    `District reached: ${d.z} of ${ZONE_COUNT}, ${d.name}  `, `Level: ${g.level()}  `, `Creativity score: ${num(g.creativityScore(), 0)}/100, ${s.cm.n} niche transactions`, '',
    '## Evidence: your build'];
  for (const p of buildOf(s)) L.push(`- ${p.name} (${p.basis}) Strength: ${p.strength} Cost: ${p.cost}`);
  if (costs.family.n) L.push(`- Family obligations paid: ${money(costs.family.amt)} in ${costs.family.n} payment(s).`);
  if (costs.garnish.n) L.push(`- Student-loan garnishment: ${money(costs.garnish.amt)} in ${costs.garnish.n} instalment(s).`);
  if (costs.subscription.n) L.push(`- Tool subscriptions: ${money(costs.subscription.amt)} in ${costs.subscription.n} charge(s).`);
  if (costs.bailout.n) L.push('- The family bailout was used once.');
  if (sk.rows.length) { L.push('', '## Evidence: Deal Room play'); for (const r of sk.rows) L.push(`- ${r.name} (${r.stage}): played ${r.plays} time(s)${r.avg != null ? `, average score ${scoreText(r.avg)}` : ''}.`); }
  L.push('', '## Evidence: Prompt A (the asymmetric trade)');
  if (!p2p.length) L.push('No peer swaps completed.');
  for (const e of p2p) L.push(`- Day ${day(e.h)}: gave ${e.gave.map((c) => nameOf(c, ASSETS)).join(', ') || 'cash'}, got ${e.got.map((c) => nameOf(c, ASSETS)).join(', ') || 'cash'}. Baseline FMV ${money(e.va)} vs ${money(e.vb)} (variance ${pct(e.variance, 1)}). Counterparty skills: ${e.peerSkills ? Object.entries(e.peerSkills).map(([k, v]) => k + ' ' + v).join(', ') : 'n/a'}; yours: ${Object.entries(s.skills).map(([k, v]) => k + ' ' + v).join(', ')}.`);
  L.push('', '## Evidence: Prompt B (the Day 45 credit crunch)');
  if (!fed) L.push('The shock had not occurred in your run.');
  else { L.push(`- Capital structure when it hit: cash ${money(fed.cash)}, debt ${money(fed.debt)}, D/E ${isFinite(fed.de) ? fed.de.toFixed(2) : 'inf'}, inventory ${money(fed.inv)}, pipelines ${fed.pipes}, net worth ${money(fed.nw)}.`, `- Five days later: net worth ${fed.nwAfter != null ? money(fed.nwAfter) : 'n/a'} after ${fed.pivots ?? 0} pivot action(s).`); for (const e of fedActs) L.push(`- Day ${day(e.h)} ${e.type}: ${e.text} (${money(e.amt, { plus: true })})`); }
  L.push('', '## Evidence: Prompt C (the creativity penalty)');
  const gl = Object.entries(groups);
  if (!gl.length) L.push('You rarely landed in a crowded niche.');
  for (const [k, v] of gl) L.push(`- ${nicheName(k)}: ${v.n} transaction(s) at average Cm ${(v.cm / v.n).toFixed(2)}, ${seen(v)}.`);
  L.push('', '## My analysis', '', notes || '(write here)');
  return L.join('\n');
}

const stat = (k, v, cls = '', sub = '', hero = false) => `<div class="card sc-stat${hero ? ' sc-hero' : ''}"><div class="small mute sc-k">${k}</div><div class="mono sc-v ${cls}">${v}</div>${sub ? `<div class="tiny mute">${sub}</div>` : ''}</div>`;
const lineHTML = (kind, text) => `<p class="small" style="margin:0"><b class="${kind === '+' ? 'green' : 'red'}" aria-hidden="true">${kind}</b> <span class="sr">${kind === '+' ? 'Strength' : 'Cost'}: </span>${esc(text)}</p>`;

/** The whole debrief page as a string. `notes` is the founder's draft (kept in the textarea). */
export function debriefHTML(S, notes = '') {
  const E = evidence(S), { g, s } = E;
  const lb = S.leaderboard(), me = lb.find((r) => r.me), st = standing(lb, me), d = reached(s), costs = buildCosts(s.ledger), sk = skillStats(s), build = buildOf(s);
  const words = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);
  const p2pRows = E.p2p.map((e) => `<tr><td class="mono">${day(e.h)}</td><td>${e.gave.map((c) => esc(nameOf(c, ASSETS))).join(', ') || 'cash'}</td><td>${e.got.map((c) => esc(nameOf(c, ASSETS))).join(', ') || 'cash'}</td><td class="mono">${money(e.va)} / ${money(e.vb)}</td><td class="mono">${pct(e.variance, 1)}</td><td>${e.peerSkills && Object.keys(e.peerSkills).length ? esc(Object.entries(e.peerSkills).sort((a, b) => b[1] - a[1])[0][0]) : ''}</td></tr>`).join('');
  const f = E.fed;
  const gl = Object.entries(E.groups).map(([k, v]) => `<tr><td>${esc(nicheName(k))}</td><td class="mono">${v.n}</td><td class="mono red">${(v.cm / v.n).toFixed(2)}x</td><td class="mono">${pct(v.last.S || 0)}</td><td class="mono red">${money(v.lost, { plus: true })}</td></tr>`).join('');
  const shockRows = s.shockLog.map((x) => { const ch = x.nwAfter != null && x.nw > 0 ? x.nwAfter / x.nw - 1 : null; return `<tr><td>${esc(x.name || x.kind || 'Shock')}</td><td class="mono">${day(x.start)}</td><td class="mono">${money(x.nw)}</td><td class="mono">${x.nwAfter != null ? money(x.nwAfter) : 'n/a'}</td><td class="mono ${ch == null ? '' : ch < 0 ? 'red' : 'green'}">${ch == null ? 'n/a' : (ch >= 0 ? '+' : '') + pct(ch, 0)}</td><td class="mono">${isFinite(x.de) ? x.de.toFixed(2) : 'inf'}</td><td class="mono">${x.pivots ?? 0}</td></tr>`; }).join('');
  const costLines = [
    costs.family.n && `Family obligations paid: <b class="mono red">${money(costs.family.amt)}</b> in ${costs.family.n} payment${costs.family.n === 1 ? '' : 's'}.`,
    costs.garnish.n && `Student-loan garnishment: <b class="mono red">${money(costs.garnish.amt)}</b> of ${money(PERKS.grad.mods.garnish.cap)} repaid.`,
    costs.subscription.n && `Tool subscriptions: <b class="mono red">${money(costs.subscription.amt)}</b> over ${costs.subscription.n} charge${costs.subscription.n === 1 ? '' : 's'}.`,
    costs.bailout.n && 'The family bailout was used once, clearing part of your debt at a margin call.',
  ].filter(Boolean);
  const specialty = s.specialty && own(SKILLS, s.specialty) ? SKILLS[s.specialty].name : 'none (no specialty)';
  const skillsLine = Object.values(SKILLS).map((k) => `${esc(k.short)} ${s.skills?.[k.id] ?? 1}`).join(' &middot; ');
  const perHand = sk.quick != null && sk.played != null && sk.quick + sk.played > 0 ? `You played ${Math.round(sk.played)} deal${Math.round(sk.played) === 1 ? '' : 's'} by hand and auto-played ${Math.round(sk.quick)} with Quick.` : '';
  return `
    <header class="panel row no-print"><div class="grow"><h1 tabindex="-1" style="margin:0">Debrief</h1><span class="mute small">${esc(buildLine(s))} &middot; ${esc(s.handle)} &middot; Founder ID ${esc(s.pid)}</span></div><button class="btn ghost" data-act="back">Back to the game</button><button class="btn ghost" data-act="print">Print</button></header>
    <section class="panel gap"><h2>Your ${TOTAL_DAYS} days</h2>
      <div class="grid g3 sc-stats">${stat('Final net worth', money(g.netWorth()), 'gold', '', true)}${stat('Efficiency index', num(g.eei()), 'green')}${stat('Overall percentile', st.percentile != null ? ordinal(st.percentile) : 'n/a', '', st.n ? `of ${st.n} players` : '')}${stat('Rank', st.rank ? `${st.rank} of ${st.n}` : 'n/a')}${stat('District reached', `${d.z} of ${ZONE_COUNT}`, '', esc(d.name))}${stat('Level', g.level(), '', `${s.points ?? 0} skill point${s.points === 1 ? '' : 's'} unspent`)}${stat('Peak net worth', money(s.peak))}${stat('Creativity score', num(g.creativityScore(), 0) + ' / 100')}${stat('Herd-trap pitches', E.herd, E.herd ? 'red' : '')}${stat('Pioneer pitches', E.pioneer, E.pioneer ? 'green' : '')}${stat('Best deal streak', s.bestStreak ?? 0)}</div>
      <h3 class="gap">Net worth, log scale</h3>${chart(s)}
      <details class="gap"><summary class="small">Data table for the chart</summary><div class="scroll"><table class="tbl"><thead><tr><th scope="col">Day</th><th scope="col">Net worth</th></tr></thead><tbody>${(s.hist || []).filter((_, i) => i % 3 === 0).map((p) => `<tr><td>${day(p[0])}</td><td class="mono">${money(p[1])}</td></tr>`).join('')}</tbody></table></div></details></section>
    <section class="panel gap"><h2>Your build</h2>
      <p class="mute small">Everyone starts with one paperclip and $0, so the build is the only thing that differed at the start. Your specialty: ${esc(specialty)}. Skills at the end: ${skillsLine}.</p>
      ${build.length ? `<div class="sc-build">${build.map((p) => `<div class="card"><b><span class="sc-ic" aria-hidden="true">${p.icon}</span>${esc(p.name)}</b><em class="small mute">${esc(p.basis)}</em>${lineHTML('+', p.strength)}${lineHTML('-', p.cost)}</div>`).join('')}</div>` : '<p class="mute">This run has no recorded Backgrounds.</p>'}
      ${costLines.length ? `<h3 class="gap">What your build cost you, from the ledger</h3><ul class="small">${costLines.map((c) => `<li>${c}</li>`).join('')}</ul>` : '<p class="small mute gap">Your Backgrounds work through prices, speed and limits rather than ledger lines, so compare your run with a classmate who drafted differently.</p>'}
      <p class="small gap"><b>For your reflection:</b> which Background earned its cost, and which pair would you draft next time? Use the numbers above.</p></section>
    <section class="panel gap"><h2>Deal Room play</h2>
      ${sk.rows.length ? `<div class="scroll"><table class="tbl"><caption class="sr">Skill games played</caption><thead><tr><th scope="col">Game</th><th scope="col">Stage</th><th scope="col">Played</th><th scope="col">Average score</th></tr></thead><tbody>${sk.rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.stage)}</td><td class="mono">${r.plays}</td><td class="mono">${esc(scoreText(r.avg)) || 'n/a'}</td></tr>`).join('')}</tbody></table></div>${perHand ? `<p class="small mute">${perHand}</p>` : ''}`
        : '<p class="small mute">No Deal Room scores were recorded in this run. Playing a deal by hand (Read, Pitch, Close) instead of Quick adds them here.</p>'}</section>
    <section class="panel gap"><h2>How you met the shocks</h2>
      ${s.shockLog.length ? `<div class="scroll"><table class="tbl"><caption class="sr">Macro shocks and your net worth before and five days after</caption><thead><tr><th scope="col">Shock</th><th scope="col">Day</th><th scope="col">Net worth at the shock</th><th scope="col">Five days later</th><th scope="col">Change</th><th scope="col">D/E</th><th scope="col">Pivots</th></tr></thead><tbody>${shockRows}</tbody></table></div>` : '<p class="mute small">No macro shock had occurred in your run yet.</p>'}</section>
    <section class="panel gap"><h2>Prompt A: the asymmetric trade</h2>
      <p class="mute small">Review a swap with a classmate whose specialty differed from yours. How did it unlock value neither of you could reach alone? Use the margin data.</p>
      ${E.p2p.length ? `<div class="scroll"><table class="tbl"><thead><tr><th scope="col">Day</th><th scope="col">You gave</th><th scope="col">You got</th><th scope="col">Baseline FMV (you / them)</th><th scope="col">Variance</th><th scope="col">Their top skill</th></tr></thead><tbody>${p2pRows}</tbody></table></div>` : '<div class="callout warn">You completed no peer swaps. The Peer Market Engagement component (10%) rewards them, and the Practice Partner or a classmate would have given you data for this prompt.</div>'}</section>
    <section class="panel gap"><h2>Prompt B: the Day 45 credit crunch</h2>
      <p class="mute small">Detail your capital structure at the moment the shock went live. ${f && f.de > 1 ? 'You were leveraged: what stopped margin compression?' : 'You held mostly equity: how did you exploit asset price drops?'}</p>
      ${f ? `<dl class="kv"><dt>Cash</dt><dd>${money(f.cash)}</dd><dt>Debt</dt><dd>${money(f.debt)}</dd><dt>Debt-to-equity</dt><dd>${isFinite(f.de) ? f.de.toFixed(2) : 'inf'}</dd><dt>Inventory</dt><dd>${money(f.inv)}</dd><dt>Pipelines</dt><dd>${f.pipes} (${f.intl} international)</dd><dt>Net worth at the shock</dt><dd>${money(f.nw)}</dd><dt>Net worth 5 days later</dt><dd>${f.nwAfter != null ? money(f.nwAfter) : 'n/a'}</dd><dt>Pivot actions in the window</dt><dd>${f.pivots ?? 0}</dd></dl>
      ${E.fedActs.length ? `<h3>What you did around it</h3><ul class="small">${E.fedActs.map((e) => `<li>Day ${day(e.h)} ${esc(e.type)}: ${esc(e.text)} (${money(e.amt, { plus: true })})</li>`).join('')}</ul>` : '<p class="small mute">You took no financing or liquidation actions within a day before to five days after.</p>'}` : '<p class="mute">The Day 45 shock had not occurred in your run.</p>'}</section>
    <section class="panel gap"><h2>Prompt C: decoding the creativity penalty</h2>
      <p class="mute small">Choose a phase where margins were crushed by the Creativity Engine. Analyze how cohort volume drove it, and which niche you pivoted to.</p>
      ${gl ? `<div class="scroll"><table class="tbl"><thead><tr><th scope="col">Niche</th><th scope="col">Times</th><th scope="col">Avg Cm</th><th scope="col">Saturation</th><th scope="col">Value lost vs fair</th></tr></thead><tbody>${gl}</tbody></table></div>` : '<div class="callout good">You rarely fell into a crowded niche. Describe what you did to avoid the herd.</div>'}</section>
    <section class="panel gap"><h2>Your analysis</h2>
      <p class="small mute">1,000 to 1,500 words, using exact numbers from your ledger. Saved in this browser as you type.</p>
      <label for="notes">Reflection draft</label><textarea id="notes" rows="14" style="width:100%" data-input="notes">${esc(notes)}</textarea>
      <div class="row gap"><span id="wc" class="mono small" aria-live="polite">${wordCountHTML(words(notes))}</span><span class="grow"></span><button class="btn" data-act="md">Download workbook (.md)</button></div></section>`;
}
function wordCountHTML(n) { return `${n} words ${n < 1000 ? '<span class="mute">(target 1,000 to 1,500)</span>' : n <= 1500 ? '<span class="green">in range</span>' : '<span class="gold">over target</span>'}`; }

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
  root.querySelector('h1')?.focus();
  return { destroy() {} };
}
