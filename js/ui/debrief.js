// Debrief: the metacognitive reflection screen. Turns the ledger into evidence for the three rubric prompts.
import { ASSETS, BUYERS, PROFILES, EVENTS, SKILLS, TOTAL_DAYS, MIL } from '../config.js';
import { fmtMoney as money, fmtPct as pct } from '../market.js';
import { $, esc, setHTML, delegate, toast, announce } from './common.js';
import { kv } from '../session.js';

const day = (h) => Math.floor(h / 24) + 1;

function chart(s) {
  const pts = (s.hist || []).filter((p) => p[1] > 0);
  if (pts.length < 2) return '<p class="mute">Not enough history yet. Play a few more days.</p>';
  const W = 800, H = 260, L = 56, R = 12, T = 12, B = 28;
  const lo = Math.log10(Math.max(0.05, Math.min(...pts.map((p) => p[1])) * 0.8)), hi = Math.log10(Math.max(...pts.map((p) => p[1])) * 1.25 + 1);
  const x = (h) => L + (h / 2160) * (W - L - R), y = (v) => T + (1 - (Math.log10(Math.max(v, 0.05)) - lo) / (hi - lo || 1)) * (H - T - B);
  const path = pts.map((p, i) => (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ');
  const shocks = Object.values(EVENTS).map((e) => [(e.day - 1) * 24, e.name]);
  const marks = [[MIL.m1, '$1k'], [MIL.m2, '$25k'], [MIL.m3, '$250k']].filter(([v]) => Math.log10(v) > lo && Math.log10(v) < hi);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-labelledby="ch-t ch-d" style="background:var(--bg2);border:var(--bw) solid var(--line)">
    <title id="ch-t">Net worth over 90 days on a log scale</title><desc id="ch-d">Starts at ${money(pts[0][1])}, ends at ${money(pts[pts.length - 1][1])}, peak ${money(Math.max(...pts.map((p) => p[1])))}. Vertical lines mark the three macro shocks on days 15, 45 and 75.</desc>
    ${marks.map(([v, l]) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#34445c" stroke-dasharray="4 4"/><text x="4" y="${y(v) + 4}" fill="#a3b3c9" font-size="12">${l}</text>`).join('')}
    ${shocks.map(([h, n]) => `<line x1="${x(h)}" x2="${x(h)}" y1="${T}" y2="${H - B}" stroke="#ff7d75" stroke-width="2"/><text x="${x(h) + 4}" y="${T + 12}" fill="#ff7d75" font-size="11">Day ${day(h)}</text>`).join('')}
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
  for (const e of bad) { const k = (e.cls || '') + '|' + (e.seg || ''); (groups[k] ||= { n: 0, lost: 0, cm: 0, last: e }).n++; groups[k].lost += e.amt; groups[k].cm += e.cm; }
  const pitches = L.filter((e) => e.type === 'pitch' && e.cm);
  return { g, s, p2p, fed, fedActs, groups, herd: pitches.filter((e) => e.cm <= 0.55).length, pioneer: pitches.filter((e) => e.cm >= 2.4).length, pitches };
}

export function reflectionMD(S, notes) {
  const { g, s, p2p, fed, fedActs, groups } = evidence(S);
  const lb = S.leaderboard(), me = lb.find((r) => r.me);
  const L = [`# Paperclip Capitalist: reflection workbook`, '', `Founder ID: ${s.pid} (${s.handle})  `, `Profile: ${PROFILES[s.profile].name}  `, `Final net worth: ${money(g.netWorth())}  `, `Economic Efficiency Index: ${g.eei().toFixed(2)}${me ? ` (rank ${me.rank} of ${lb.length}; ${me.profRank} of ${me.profN} in profile)` : ''}  `, `Creativity score: ${g.creativityScore().toFixed(0)}/100, ${s.cm.n} niche transactions`, '', '## Evidence: Prompt A (the asymmetric trade)'];
  if (!p2p.length) L.push('No peer swaps completed.');
  for (const e of p2p) L.push(`- Day ${day(e.h)}: gave ${e.gave.map((c) => ASSETS[c]?.name || c).join(', ') || 'cash'}, got ${e.got.map((c) => ASSETS[c]?.name || c).join(', ') || 'cash'}. Baseline FMV ${money(e.va)} vs ${money(e.vb)} (variance ${pct(e.variance, 1)}). Counterparty skills: ${e.peerSkills ? Object.entries(e.peerSkills).map(([k, v]) => k + ' ' + v).join(', ') : 'n/a'}; yours: ${Object.entries(s.skills).map(([k, v]) => k + ' ' + v).join(', ')}.`);
  L.push('', '## Evidence: Prompt B (the Day 45 credit crunch)');
  if (!fed) L.push('The shock had not occurred in your run.');
  else { L.push(`- Capital structure when it hit: cash ${money(fed.cash)}, debt ${money(fed.debt)}, D/E ${isFinite(fed.de) ? fed.de.toFixed(2) : 'inf'}, inventory ${money(fed.inv)}, pipelines ${fed.pipes}, net worth ${money(fed.nw)}.`, `- Five days later: net worth ${fed.nwAfter != null ? money(fed.nwAfter) : 'n/a'} after ${fed.pivots ?? 0} pivot action(s).`); for (const e of fedActs) L.push(`- Day ${day(e.h)} ${e.type}: ${e.text} (${money(e.amt, { plus: true })})`); }
  L.push('', '## Evidence: Prompt C (the creativity penalty)');
  const gl = Object.entries(groups);
  if (!gl.length) L.push('You rarely landed in a crowded niche.');
  for (const [k, v] of gl) { const [c, b] = k.split('|'); L.push(`- ${ASSETS[c]?.name || c} to ${BUYERS[b]?.name || b}: ${v.n} transaction(s) at average Cm ${(v.cm / v.n).toFixed(2)}, last seen ${v.last.vN?.toFixed?.(0)} of ${v.last.vT?.toFixed?.(0)} cohort pitches (saturation ${pct(v.last.S || 0)}).`); }
  L.push('', '## My analysis', '', notes || '(write here)');
  return L.join('\n');
}

export function mountDebrief(root, S, hooks) {
  const U = { notes: kv.get('reflection') || '' };
  const E = evidence(S), { g, s } = E;
  const lb = S.leaderboard(), me = lb.find((r) => r.me);
  const words = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);
  const stat = (k, v, cls = '') => `<div class="card"><div class="small mute">${k}</div><div class="mono ${cls}" style="font-size:1.3rem">${v}</div></div>`;
  const p2pRows = E.p2p.map((e) => `<tr><td class="mono">${day(e.h)}</td><td>${e.gave.map((c) => esc(ASSETS[c]?.name || c)).join(', ') || 'cash'}</td><td>${e.got.map((c) => esc(ASSETS[c]?.name || c)).join(', ') || 'cash'}</td><td class="mono">${money(e.va)} / ${money(e.vb)}</td><td class="mono">${pct(e.variance, 1)}</td><td>${e.peerSkills ? esc(Object.entries(e.peerSkills).sort((a, b) => b[1] - a[1])[0][0]) : ''}</td></tr>`).join('');
  const f = E.fed;
  const gl = Object.entries(E.groups).map(([k, v]) => { const [c, b] = k.split('|'); return `<tr><td>${esc(ASSETS[c]?.name || c)} to ${esc(BUYERS[b]?.name || b)}</td><td class="mono">${v.n}</td><td class="mono red">${(v.cm / v.n).toFixed(2)}x</td><td class="mono">${pct(v.last.S || 0)}</td><td class="mono red">${money(v.lost, { plus: true })}</td></tr>`; }).join('');
  root.innerHTML = `
    <header class="panel row no-print"><div class="grow"><h1 style="margin:0">Debrief</h1><span class="mute small">${esc(PROFILES[s.profile].name)} &middot; ${esc(s.handle)} &middot; Founder ID ${esc(s.pid)}</span></div><button class="btn ghost" data-act="back">Back to the game</button><button class="btn ghost" data-act="print">Print</button></header>
    <section class="panel gap"><h2>Your 90 days</h2>
      <div class="grid g3">${stat('Final net worth', money(g.netWorth()), 'gold')}${stat('Efficiency index', g.eei().toFixed(2), 'green')}${stat('Rank', me ? `${me.rank} of ${lb.length}` : 'n/a')}${stat('Rank in profile', me ? `${me.profRank} of ${me.profN}` : 'n/a')}${stat('Peak net worth', money(s.peak))}${stat('Creativity score', g.creativityScore().toFixed(0) + ' / 100')}${stat('Herd-trap pitches', E.herd, E.herd ? 'red' : '')}${stat('Pioneer pitches', E.pioneer, E.pioneer ? 'green' : '')}</div>
      <h3 class="gap">Net worth, log scale</h3>${chart(s)}
      <details class="gap"><summary class="small">Data table for the chart</summary><div class="scroll"><table class="tbl"><thead><tr><th scope="col">Day</th><th scope="col">Net worth</th></tr></thead><tbody>${(s.hist || []).filter((_, i) => i % 3 === 0).map((p) => `<tr><td>${day(p[0])}</td><td class="mono">${money(p[1])}</td></tr>`).join('')}</tbody></table></div></details></section>
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
      <label for="notes">Reflection draft</label><textarea id="notes" rows="14" style="width:100%" data-input="notes">${esc(U.notes)}</textarea>
      <div class="row gap"><span id="wc" class="mono small" aria-live="polite"></span><span class="grow"></span><button class="btn" data-act="md">Download workbook (.md)</button></div></section>`;
  const wc = () => { const n = words(U.notes), el = $('#wc'); if (el) el.innerHTML = `${n} words ${n < 1000 ? '<span class="mute">(target 1,000 to 1,500)</span>' : n <= 1500 ? '<span class="green">in range</span>' : '<span class="gold">over target</span>'}`; };
  wc();
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
