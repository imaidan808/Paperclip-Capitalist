// Instructor Administration Dashboard: live cohort analytics, simulation intervention controls, gradebook export.
// `instructorParts` and `gradebookCSV` are pure (no DOM) so a Node test can build them for any session; `mountInstructor` wires them to the page.
import { ZONES, ZONE_IDS, ZONE_COUNT, ASSETS, BUYERS, PERKS, PERK_IDS, EVENTS, ALGO_EVENTS, SEC_PER_HOUR, TOTAL_DAYS } from '../config.js';
import { gini, fmtMoney as money, nicheKey, demandOf } from '../market.js';
import { median } from '../cohort.js';
import { $, esc, setHTML, delegate, dlg, toast, settingsDialog } from './common.js';

export const PRESETS = [
  ['Demo: 1 virtual day = 30 s', 168 / 30],
  ['One class session: 90 days in 90 min', (2160 * SEC_PER_HOUR) / 5400],
  ['One week: 90 days in 7 days', (2160 * SEC_PER_HOUR) / (7 * 86400)],
  ['Four-week module: 90 days in 28 days', (2160 * SEC_PER_HOUR) / (28 * 86400)],
];
const realPerDay = (speed) => { const s = 168 / speed; return s < 120 ? Math.round(s) + ' seconds' : s < 7200 ? Math.round(s / 60) + ' minutes' : (s / 3600).toFixed(1) + ' hours'; };
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const topZone = (st) => Math.min(ZONE_COUNT, Math.max(1, Math.round(st?.zones) || 1));
const perksOf = (st) => (Array.isArray(st?.perks) ? st.perks.filter((id) => own(PERKS, id)) : []);

/** Two small icons for a student's Backgrounds, each named for assistive technology. */
export const bgIcons = (st) => {
  const ids = perksOf(st);
  return ids.length ? `<span class="in-bgs" role="img" aria-label="${esc(ids.map((id) => PERKS[id].name).join(' and '))}" title="${esc(ids.map((id) => PERKS[id].name).join(' + '))}">${ids.map((id) => `<span aria-hidden="true">${PERKS[id].icon}</span>`).join('')}</span>` : '<span class="mute">none</span>';
};

// ---------------------------------------------------------------- keeping the room, and getting back into it
/** How long a student's browser listens to the instructor it already knows after that one has gone quiet, before it believes a different Founder ID that says it is the instructor (js/session.js `_isInstructor`:
 *  60 000 ms; tests/finish-ui.test.mjs plays it). The relay hands the seat to the owner's new connection at once, but the students do not follow at once: for this long they ignore the new ID's clock, shocks and rewinds. */
export const FOLLOW_SECONDS = 60;
/** How long a room taken back waits to hear the class's clock before it starts paused (js/session.js `RECOVER_WAIT_MS`, 15 000 ms; tests/finish-repair.test.mjs holds the two together). */
export const RECOVER_WAIT_SECONDS = 15;
/** Where the grading rubric is: docs/ is not published with the site, so the dashboard links to the file in the repository. */
export const KIT_URL = 'https://github.com/imaidan808/Paperclip-Capitalist/blob/main/docs/FACULTY_KIT.md';
/** The one sentence the dashboard and the title screen both say about that wait. */
export const FOLLOW_NOTE = `Students follow your new Founder ID once the old one has been silent for about a minute, not at once. Wait that long before you change the pace, deploy a shock or rewind, because until then they ignore it.`;

/** The panel that keeps the room: what runs only here, the recovery code (hidden until asked for, because the dashboard is often on a projector) and what to do with it. Pure; built from the session alone. */
export function recoveryHTML(S) {
  const code = S.roomInfo?.code || '', key = typeof S.recoveryCode === 'function' ? S.recoveryCode() : null;
  const where = S.room?.kind === 'relay' ? '' : ' With no relay server it also exists only in this browser\'s tabs.';
  if (!key) {
    return `<section class="panel in-keep" aria-labelledby="in-keep-h"><h2 id="in-keep-h">Keep this room</h2>
      <div class="callout warn"><b>No recovery code is saved for room <span class="mono">${esc(code)}</span>.</b> This browser could not keep one (its storage may be blocked, or in a private window), so the room can be run only from this tab. If you close it, you cannot resume as instructor.</div></section>`;
  }
  return `<section class="panel in-keep" aria-labelledby="in-keep-h"><h2 id="in-keep-h">Keep this room</h2>
    <p class="small" style="margin-top:0"><b>This live room runs only from this browser unless you save its recovery code.</b> If this browser forgets the room (cleared storage, a lab machine that signs you out) or you want to run it from another laptop, the room code <b class="mono">${esc(code)}</b> and the recovery code are the only way back in.${where}</p>
    <details class="in-code"><summary class="small">Show the recovery code</summary>
      <p class="mono in-key" id="in-key" tabindex="0">${esc(key)}</p>
      <div class="row"><button class="btn sm" data-act="copykey" data-fid="in-copykey">Copy the recovery code</button></div>
      <p class="tiny mute">Anyone who has it can run this room, so keep it like a password and off the projector. To use it, open the title screen, choose <b>Instructor</b>, then <b>Resume as instructor</b>, and enter the room code and this code.</p>
      <p class="tiny mute">${esc(FOLLOW_NOTE)}</p>
    </details></section>`;
}

/** Copies the recovery code. `write(text)` is the clipboard (a promise), `say(message, level)` the toast; both are handed in so a test can fake them. Never throws, and always tells the instructor what happened. */
export async function copyRecovery(S, { write, say }) {
  const key = typeof S.recoveryCode === 'function' ? S.recoveryCode() : null;
  if (!key) { say('There is no recovery code saved for this room in this browser.', 'warn'); return false; }
  try { await write(key); say('Recovery code copied. Keep it somewhere safe.', 'good'); return true; } catch { say('Your browser would not copy it. Open "Show the recovery code" and select it by hand.', 'warn'); return false; }
}

/** Students per highest district reached: index 1..16. */
export function distribution(students) {
  const out = Array(ZONE_COUNT + 1).fill(0);
  for (const st of students) out[topZone(st)]++;
  return out;
}
/** How many students drafted each Background. */
export function draftCounts(students) {
  const out = {};
  for (const st of students) for (const id of perksOf(st)) out[id] = (out[id] || 0) + 1;
  return out;
}
/** The district with the most students (the default for the heat map). */
export const busiest = (dist) => { let best = 1; for (const z of ZONE_IDS) if (dist[z] > dist[best]) best = z; return best; };

/** Niche saturation for one district: 48-hour transaction counts by asset class and buyer (cohort ghosts, real peers and demo students). */
export function heatHTML(S, U, students, dist) {
  const hour = Math.floor(S.clock.now()), z = U.zone && ZONES[U.zone] ? U.zone : busiest(dist);
  const classes = Object.keys(ASSETS).filter((c) => demandOf(ASSETS[c], z) > 0), buyers = Object.keys(BUYERS).filter((b) => BUYERS[b].zone === z);
  const agg = {};
  for (const c of classes) { const by = S.cohort.counts(hour, z, c).byBuyer || {}; for (const b of buyers) if (by[b]) agg[nicheKey(z, c, b)] = by[b]; }
  for (const st of students.filter((x) => x.synth)) for (const [k, n] of Object.entries(st.niches || {})) if (k.startsWith(z + '|')) agg[k] = (agg[k] || 0) + n;
  const total = (c) => buyers.reduce((a, b) => a + (agg[nicheKey(z, c, b)] || 0), 0);
  // a district trades dozens of classes at a trickle; show the tradeable ones and any that the class has actually piled into
  const shown = classes.filter((c) => demandOf(ASSETS[c], z) >= 4 || total(c) > 0).sort((a, b) => total(b) - total(a) || ASSETS[a].name.localeCompare(ASSETS[b].name)).slice(0, 14);
  const max = Math.max(1, ...Object.values(agg));
  const rows = shown.map((c) => `<tr><th scope="row">${esc(ASSETS[c].name)}</th>${buyers.map((b) => { const n = agg[nicheKey(z, c, b)] || 0, a = Math.min(0.6, n / max * 0.6); return `<td class="mono right" style="background:rgba(255,125,117,${a.toFixed(2)})">${n ? Math.round(n) || '&lt;1' : ''}</td>`; }).join('')}</tr>`).join('');
  return `<div class="row"><label for="hz">District</label><select id="hz" data-change="hzsel" data-fid="hz">${ZONE_IDS.map((n) => `<option value="${n}" ${n === z ? 'selected' : ''}>${n}. ${esc(ZONES[n].name)}${dist[n] ? ` (${dist[n]} here)` : ''}</option>`).join('')}</select></div>
    <div class="scroll gap"><table class="tbl"><caption class="sr">Niche saturation in ${esc(ZONES[z].name)}: 48-hour transaction counts by asset class and buyer</caption><thead><tr><th scope="col">Asset class</th>${buyers.map((b) => `<th scope="col" title="${esc(BUYERS[b].name)}">${BUYERS[b].icon}<span class="sr">${esc(BUYERS[b].name)}</span></th>`).join('')}</tr></thead><tbody>${rows || `<tr><td class="mute" colspan="${buyers.length + 1}">Nobody has traded here yet.</td></tr>`}</tbody></table></div>
    <p class="tiny mute">Darker = more of the class piling into the same buyer (counts are 48 virtual hours${classes.length > shown.length ? `; the ${shown.length} busiest of ${classes.length} classes` : ''}). Hover the column icons for buyer names. ${buyers.map((b) => BUYERS[b].icon + ' ' + esc(BUYERS[b].name)).join(' &middot; ')}</p>`;
}

/** Where the class is: students by the highest district they have opened, as a column chart with a text equivalent. */
export function distributionHTML(dist, here) {
  const max = Math.max(1, ...dist.slice(1));
  return `<ol class="in-dist" aria-label="Students by highest district reached">${ZONE_IDS.map((z) => `<li data-n="${dist[z]}" data-here="${z === here ? 1 : 0}" aria-label="District ${z}, ${esc(ZONES[z].name)}: ${dist[z]} student${dist[z] === 1 ? '' : 's'}" title="${z}. ${esc(ZONES[z].name)}: ${dist[z]}"><span class="n" aria-hidden="true">${dist[z] || ''}</span><i class="bx" aria-hidden="true" style="height:${(dist[z] / max * 100).toFixed(0)}%"></i><span class="z" aria-hidden="true">${z}</span></li>`).join('')}</ol>`;
}

/** Every panel of the dashboard as a string: { head, c1, c2, grade }. `U` is the dashboard's own UI state ({ zone, bg, ev, when, replace }). */
export function instructorParts(S, U) {
  const hour = S.clock.now(), day = Math.min(TOTAL_DAYS, Math.floor(hour / 24) + 1);
  const students = S.students(), real = students.filter((s) => !s.synth), onlineN = real.filter((s) => s.online).length; // (a student whose tab closed is away, kept in the roster with their last snapshot, and is not online)
  const gi = gini(students.map((s) => s.nw)), med = median(students.map((s) => s.nw));
  const stuck = students.filter((s) => s.online !== false && s.autoEligible && (hour - (s.lastAutoHour ?? hour)) / 24 > 3); // (one who is away is not stalled, they are not there)
  // A room taken back from another device does not know the class's hour until it has heard it (js/session.js `recovering`): its clock reads Day 1 and a rewind or a shock sent from here would be
  // measured against that made-up hour, so the controls that depend on the hour wait, and the page says so instead of showing a lobby.
  const recovering = S.recovering === true, off = recovering ? ' aria-disabled="true"' : '';
  const lobby = !recovering && S.clock.paused && hour < 1;
  const room = S.roomInfo || { code: '', relay: '' };
  const link = `${typeof location !== 'undefined' ? location.origin + location.pathname : ''}?room=${room.code}${room.relay ? '&relay=' + encodeURIComponent(room.relay) : ''}`;
  const dist = distribution(students), drafted = draftCounts(students), here = U.zone && ZONES[U.zone] ? U.zone : busiest(dist);

  const head = `<div class="grow"><h1 tabindex="-1" style="margin:0;font-size:1.3rem">Instructor dashboard</h1><span class="small mute">Room <b class="mono gold" style="font-size:1.2rem">${esc(room.code)}</b> &middot; ${S.room?.kind === 'relay' ? 'relay server (' + esc(S.room.state) + ')' : 'this browser only (open other tabs with ?room=' + esc(room.code) + ')'} &middot; <b>${onlineN}</b> student${onlineN === 1 ? '' : 's'} online${real.length > onlineN ? ' (' + (real.length - onlineN) + ' away)' : ''}${S.demo ? ' + ' + S.demo + ' demo' : ''}</span></div>
      <button class="btn sm ghost" data-act="copylink" data-link="${esc(link)}">Copy student link</button><button class="btn sm ghost" data-act="settings">Access</button><button class="btn sm danger" data-act="close">Close room</button>`;

  const events = Object.values(EVENTS).map((e) => `<option value="${e.id}" ${U.ev === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('') + Object.entries(ALGO_EVENTS).map(([k, e]) => `<option value="${k}" ${U.ev === k ? 'selected' : ''}>${esc(e.name)} (algorithmic)</option>`).join('');
  const c1 = `
      <section class="panel"><h2>Global engine step controls</h2>
        ${recovering ? `<div class="callout warn" role="status"><b>Taking the room back.</b> This dashboard is waiting about ${RECOVER_WAIT_SECONDS} seconds to hear the class's clock, so the day below is not the class's yet. The pace, rewind and shock controls switch on once it has.</div>` : ''}
        ${lobby ? `<div class="callout warn"><b>Lobby.</b> The clock is paused at Day 1 while students join. <button class="btn sm" data-act="start">Start simulation</button></div>` : ''}
        <div class="row"><div class="mono" style="font-size:1.6rem">Day ${day} <span class="mute" style="font-size:.9rem">/ ${TOTAL_DAYS}</span></div><span class="chip ${S.clock.paused ? 'warn' : 'good'}">${S.clock.paused ? 'Paused' : 'Running ' + (S.clock.speed < 0.1 ? S.clock.speed.toFixed(4) : S.clock.speed) + 'x'}</span><span class="small mute">1 virtual day = ${realPerDay(S.clock.speed)}</span></div>
        <div class="bar gap" role="progressbar" aria-label="Simulation progress" aria-valuemin="0" aria-valuemax="${TOTAL_DAYS}" aria-valuenow="${day}"><i style="width:${hour / 2160 * 100}%"></i></div>
        <div class="row gap"><button class="btn sm" data-act="pause"${off}>${S.clock.paused ? 'Resume' : 'Pause'}</button>
          ${[1, 4, 16, 64].map((v) => `<button class="btn sm ghost" data-act="speed" data-v="${v}" aria-pressed="${S.clock.speed === v}"${off}>${v}x</button>`).join('')}
          <span class="grow"></span><button class="btn sm ghost" data-act="rewind" data-d="1"${off}>Rewind 1 day</button><button class="btn sm ghost" data-act="rewind" data-d="3"${off}>3 days</button><button class="btn sm ghost" data-act="rewind" data-d="7"${off}>7 days</button></div>
        <label for="pace" class="gap">Pace preset</label><select id="pace" data-change="pace" data-fid="pace"${recovering ? ' disabled' : ''}><option value="">Choose a pace...</option>${PRESETS.map(([l], i) => `<option value="${i}">${esc(l)}</option>`).join('')}</select>
        <p class="tiny mute">Rewind restores each student's most recent daily checkpoint (up to 10 days back). Students who are offline catch up deterministically when they return.</p></section>
      <section class="panel"><h2>Manual black swan trigger</h2>
        <div class="grid g2"><div><label for="ev">Scenario</label><select id="ev" data-change="evsel" data-fid="ev">${events}</select></div>
        <div><label for="evw">When</label><select id="evw" data-change="evwhen" data-fid="evw"><option value="0" ${U.when === '0' ? 'selected' : ''}>Right now (breaking, no warning)</option><option value="24" ${U.when === '24' ? 'selected' : ''}>In 24 virtual hours</option><option value="72" ${U.when === '72' ? 'selected' : ''}>In 72 virtual hours</option></select></div></div>
        <label class="row gap" style="color:var(--ink)"><input type="checkbox" data-change="evrep" ${U.replace ? 'checked' : ''}> Replace the scheduled copy (pull it forward instead of stacking)</label>
        <button class="btn gap" data-act="deploy"${off}>Deploy to cohort</button>
        <p class="tiny mute">Scheduled: TikTok Surge day 15, Credit Crunch day 45, Tariff Lock day 75. Students with higher Capital Sourcing get earlier warnings.</p></section>
      <section class="panel"><h2>Asymmetric risk scaling</h2>
        <label for="fr">Transaction friction (taxes and fees): <b class="mono" id="frv">${S.difficulty.friction.toFixed(2)}x</b></label><input id="fr" type="range" min="0.5" max="3" step="0.05" value="${S.difficulty.friction}" data-input="fr">
        <label for="au" class="gap">Compliance audit frequency: <b class="mono" id="auv">${S.difficulty.audit.toFixed(2)}x</b></label><input id="au" type="range" min="0.5" max="3" step="0.05" value="${S.difficulty.audit}" data-input="au">
        <label for="gh" class="gap">Synthetic classmates filling the market: <b class="mono" id="ghv">${S.ghosts}</b></label><input id="gh" type="range" min="0" max="80" step="2" value="${S.ghosts}" data-input="gh">
        <label for="dm" class="gap">Demo students on this dashboard: <b class="mono" id="dmv">${S.demo}</b></label><input id="dm" type="range" min="0" max="24" step="1" value="${S.demo}" data-input="dm">
        <label for="fl" class="gap">EEI starting-capital floor</label><input id="fl" inputmode="numeric" value="${S.difficulty.eeiFloor}" data-change="floor">
        <label class="row gap" style="color:var(--ink)"><input type="checkbox" data-change="algo" ${S.algo ? 'checked' : ''}> Algorithmic surprise events (viral mentions, gluts, scares)</label></section>`;

  const flags = S.flagsAll();
  const chips = PERK_IDS.filter((id) => drafted[id]).sort((a, b) => drafted[b] - drafted[a] || a.localeCompare(b));
  const c2 = `
      <section class="panel"><h2>Live cohort metrics</h2>
        <div class="grid g3"><div class="card"><div class="small mute">Wealth Gini</div><div class="mono ${gi > 0.65 ? 'red' : 'green'}" style="font-size:1.5rem">${gi.toFixed(2)}</div></div><div class="card"><div class="small mute">Median net worth</div><div class="mono" style="font-size:1.2rem">${money(med)}</div></div><div class="card"><div class="small mute">Students</div><div class="mono" style="font-size:1.5rem">${students.length}</div></div></div>
        ${gi > 0.65 ? `<div class="callout bad"><b>Inequality alert (Gini &gt; 0.65).</b> A few founders are pulling away. Consider a credit squeeze: <button class="btn sm" data-act="squeeze"${off}>Inject Credit Crunch now</button></div>` : '<p class="small mute">Gini is below the 0.65 alert line.</p>'}
        <h3 class="gap">Where the class is</h3><p class="tiny mute" style="margin-top:0">Students by the highest of the ${ZONE_COUNT} districts they have opened.</p>${distributionHTML(dist, here)}
        <h3 class="gap">What the class drafted</h3>${chips.length ? `<ul class="in-chips">${chips.map((id) => `<li><span aria-hidden="true">${PERKS[id].icon}</span> ${esc(PERKS[id].name)} <b class="mono">${drafted[id]}</b></li>`).join('')}</ul>` : '<p class="small mute">No Backgrounds yet.</p>'}
        <h3 class="gap">Niche saturation heat map</h3>${heatHTML(S, U, students, dist)}</section>
      <section class="panel"><h2>Operational bottlenecks</h2>${stuck.length ? `<table class="tbl"><thead><tr><th scope="col">Founder</th><th scope="col">Static for</th><th scope="col">Net worth</th></tr></thead><tbody>${stuck.map((s) => `<tr><td>${esc(s.handle)} <span class="tiny mute">${esc(s.pid)}</span></td><td class="mono">${((hour - s.lastAutoHour) / 24).toFixed(1)} days</td><td class="mono">${money(s.nw)}</td></tr>`).join('')}</tbody></table><p class="tiny mute">No automated asset velocity for more than 3 virtual days: a pipeline-management breakdown.</p>` : '<p class="small mute">No founder is stalled.</p>'}</section>
      <section class="panel"><h2>Flagged peer trades <span class="tiny mute">(outside +/-40% of fair value)</span></h2>${flags.length ? `<table class="tbl"><thead><tr><th scope="col">Day</th><th scope="col">From</th><th scope="col">To</th><th scope="col">Variance</th></tr></thead><tbody>${flags.slice(-8).reverse().map((f) => `<tr><td class="mono">${Math.floor((f.hour ?? f.h ?? 0) / 24) + 1}</td><td>${esc(f.from || f.pid)}</td><td>${esc(f.to || f.peer || '')}</td><td class="mono red">${(f.variance * 100).toFixed(0)}%</td></tr>`).join('')}</tbody></table>` : '<p class="small mute">None. The guardrail blocks and logs extreme premiums automatically.</p>'}</section>`;

  const gb = S.gradebook().sort((a, b) => b.eei - a.eei);
  const bg = own(PERKS, U.bg) ? U.bg : 'all';
  const shown = gb.filter((r) => bg === 'all' || perksOf(r).includes(bg));
  const grade = `<div class="row"><h2 class="grow">Roster and gradebook</h2><label class="sr" for="pf">Background</label><select id="pf" data-change="bgf" data-fid="pf"><option value="all">All Backgrounds</option>${PERK_IDS.map((id) => `<option value="${id}" ${bg === id ? 'selected' : ''}>${esc(PERKS[id].name)}</option>`).join('')}</select><button class="btn sm" data-act="gradecsv">Export gradebook CSV</button></div>
      <div class="scroll" style="max-height:26rem"><table class="tbl"><caption class="sr">Roster with automated grade components</caption><thead><tr><th scope="col">Founder</th><th scope="col">Backgrounds</th><th scope="col">District</th><th scope="col">Net worth</th><th scope="col">EEI</th><th scope="col">Economic (30)</th><th scope="col">Adaptability (20)</th><th scope="col">Peer market (10)</th><th scope="col">Auto subtotal / 60</th><th scope="col">Status</th></tr></thead><tbody>
      ${shown.map((r) => `<tr><td>${esc(r.handle)} <span class="tiny mute">${esc(r.pid)}</span>${r.rewind && !r.rewind.ok ? ` <span class="chip warn" title="Their run could not go all the way back: it has no checkpoint that old">rewind stopped at day ${Math.floor(r.rewind.hour / 24) + 1} (asked for day ${Math.floor(r.rewind.wanted / 24) + 1})</span>` : ''}</td><td>${bgIcons(r)}</td><td class="mono" title="${esc(ZONES[topZone(r)].name)}">${topZone(r)}</td><td class="mono">${money(r.nw)}</td><td class="mono">${r.eei >= 100 ? r.eei.toFixed(0) : r.eei.toFixed(2)}</td><td class="mono">${(r.econ * 0.3).toFixed(1)}</td><td class="mono">${r.adapt == null ? '<span class="mute">n/a</span>' : (r.adapt * 0.2).toFixed(1)}</td><td class="mono">${(r.engage * 0.1).toFixed(1)}</td><td class="mono"><b>${r.auto.toFixed(1)}</b></td><td>${r.synth ? '<span class="chip">demo</span>' : r.online ? '<span class="chip good">online</span>' : '<span class="chip warn">away</span>'}${r.flags?.insolvent ? ' <span class="chip bad">insolvent</span>' : ''}${r.flagged ? ` <span class="chip bad">${r.flagged} flagged</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="10" class="mute">Waiting for students. Share the room code, or add demo students with the slider above.</td></tr>'}</tbody></table></div>
      <p class="small mute gap">Economic = percentile of EEI <b>among everyone in the room</b>. Every founder starts with one paperclip and $0, so no start is compared separately. Adaptability compares each founder's net-worth change over the 5 days after each shock with the cohort median, plus a bonus for pivoting. Peer market = completed fair swaps. The 40% reflection component is yours to grade with the rubric in the <a href="${KIT_URL}" target="_blank" rel="noopener noreferrer">faculty kit</a> (docs/FACULTY_KIT.md in the repository). LTI 1.3 grade passback needs the hosted service; for now export the CSV and import it into your LMS gradebook.</p>`;
  return { head, keep: recoveryHTML(S), c1, c2, grade };
}

/** A cell that a spreadsheet will read as text, never as a formula (aliases are typed by students). */
const textCell = (v) => { const t = String(v ?? ''); return /^[=+\-@\t\r]/.test(t) ? "'" + t : t; };
export function gradebookCSV(S) {
  const rows = [['founder_id', 'alias', 'background_1', 'background_2', 'district_reached', 'level', 'net_worth', 'eei', 'economic_percentile', 'economic_points_of_30', 'adaptability_points_of_20', 'peer_market_points_of_10', 'auto_subtotal_of_60', 'reflection_points_of_40', 'p2p_swaps', 'flagged_trades', 'virtual_days_played'],
    ...S.gradebook().filter((r) => !r.synth).map((r) => { const ids = perksOf(r); return [textCell(r.pid), textCell(r.handle), ids[0] || '', ids[1] || '', topZone(r), r.level ?? '', r.nw.toFixed(2), r.eei.toFixed(3), r.econ.toFixed(1), (r.econ * 0.3).toFixed(1), r.adapt == null ? '' : (r.adapt * 0.2).toFixed(1), (r.engage * 0.1).toFixed(1), r.auto.toFixed(1), '', r.p2p || 0, r.flagged, r.hoursPlayed]; })];
  return rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
}

export function mountInstructor(root, S, hooks) {
  const U = { zone: null, bg: 'all', ev: 'fed', when: '0', replace: true };
  root.innerHTML = `<header class="panel row" id="ih"></header><div class="gap" id="ikeep"></div><div class="gap main"><div class="col" id="icol1"></div><div class="col" id="icol2"></div></div><section class="panel gap" id="igrade"></section>`;
  const el = { head: $('#ih'), keep: $('#ikeep'), c1: $('#icol1'), c2: $('#icol2'), grade: $('#igrade') };

  function render() {
    const p = instructorParts(S, U);
    setHTML(el.head, p.head); setHTML(el.keep, p.keep); setHTML(el.c1, p.c1); setHTML(el.c2, p.c2); setHTML(el.grade, p.grade);
  }

  const acts = {
    settings() { settingsDialog(); },
    close() { hooks.onClose(); },
    copykey() { copyRecovery(S, { write: (t) => navigator.clipboard.writeText(t), say: toast }); },
    copylink(b) { navigator.clipboard?.writeText(b.dataset.link).then(() => toast('Student link copied.', 'good'), () => toast(b.dataset.link, 'info', 9000)); },
    start() { S.clock.set({ hour: 0, paused: false }); S._sendClock(); render(); toast('Simulation started.', 'good'); },
    pause() { S.setPaused(!S.clock.paused); },
    speed(b) { S.setSpeed(+b.dataset.v); },
    pace(b) { if (b.value !== '') { S.setSpeed(PRESETS[+b.value][1]); toast(`1 virtual day is now ${realPerDay(S.clock.speed)}.`, 'info'); } },
    rewind(b) { S.rewind(+b.dataset.d); toast('Rewind sent to all students.', 'warn'); },
    hzsel(b) { U.zone = +b.value; render(); },
    evsel(b) { U.ev = b.value; }, evwhen(b) { U.when = b.value; }, evrep(b) { U.replace = b.checked; },
    deploy() { S.inject(U.ev, { when: +U.when, replace: U.replace && !!EVENTS[U.ev], cls: 'sneakers' }); toast('Event deployed to the cohort.', 'warn'); },
    squeeze() { S.inject('fed', { when: 0, replace: true }); toast('Credit Crunch injected.', 'warn'); },
    fr(b) { S.setDifficulty({ friction: +b.value }); $('#frv').textContent = (+b.value).toFixed(2) + 'x'; },
    au(b) { S.setDifficulty({ audit: +b.value }); $('#auv').textContent = (+b.value).toFixed(2) + 'x'; },
    gh(b) { S.setGhosts(+b.value); $('#ghv').textContent = b.value; },
    dm(b) { S.setDemo(+b.value); $('#dmv').textContent = b.value; },
    floor(b) { const v = Math.max(0.01, +b.value || 1000); S.setDifficulty({ eeiFloor: v }); },
    algo(b) { S.setAlgo(b.checked); },
    bgf(b) { U.bg = b.value; render(); },
    gradecsv() {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([gradebookCSV(S)], { type: 'text/csv' })); a.download = `gradebook-${S.roomInfo.code}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('Gradebook exported. Pseudonymous IDs only.', 'good');
    },
  };
  delegate(root, acts);
  dlg.el._acts = acts;
  let last = 0;
  const off = S.on((t) => { if (t === 'tick') { if (performance.now() - last < 900) return; last = performance.now(); } render(); });
  render();
  return { destroy: off };
}
