// Instructor Administration Dashboard: live cohort analytics, simulation intervention controls, gradebook export.
// `instructorParts` and `gradebookCSV` are pure (no DOM) so a Node test can build them for any session; `mountInstructor` wires them to the page.
import { ZONES, ZONE_IDS, ZONE_COUNT, ASSETS, BUYERS, PERKS, PERK_IDS, EVENTS, ALGO_EVENTS, SEC_PER_HOUR, TOTAL_DAYS, FMV_BAND, WARN_LEAD, EEI_FLOOR_DEFAULT } from '../config.js';
import { gini, fmtMoney as money, nicheKey, demandOf } from '../market.js';
import { median } from '../cohort.js';
import { $, esc, setHTML, delegate, dlg, toast, settingsDialog } from './common.js';
import { avatarHTML, marksOf } from '../avatar.js';
import { FOLLOW_NOTE, RECOVER_WAIT_SECONDS } from './room-notes.js';

export const PRESETS = [
  ['Demo: 1 virtual day = 30 s', 168 / 30],
  ['One class session: 90 days in 90 min', (2160 * SEC_PER_HOUR) / 5400],
  ['One week: 90 days in 7 days', (2160 * SEC_PER_HOUR) / (7 * 86400)],
  ['Four-week module: 90 days in 28 days', (2160 * SEC_PER_HOUR) / (28 * 86400)],
];
/**
 * The sound a student link asks for (sixth round, UX3; it was one checkbox, "Quiet sound link"): Normal adds nothing, Quiet adds `&sound=quiet`, Off adds `&sound=off`. Both are the ROOM's rule applied
 * early (js/audio/settings.js `fromAddress`): a student gets it while they are in the room and their own sound back on leaving, and a student who has chosen a sound setting of their own keeps it. The
 * `hint` is one line under the choice; `more` is the whole of what the choice does, on hover. Classroom is "less than half as loud, and still not silent" (12.6 dB under Full for a game sound at any volume, 10.6 for an interface sound).
 */
export const LINK_SOUNDS = [
  { id: 'normal', label: 'Normal', query: '', hint: 'Adds nothing. The room sets Classroom sound at Join.', more: 'The link carries only the room. A student who joins is put in Classroom sound by the room, and their own sound returns when they leave. A student with sound settings of their own keeps them.' },
  { id: 'quiet', label: 'Quiet', query: '&sound=quiet', hint: 'Adds &amp;sound=quiet. Classroom sound starts at the title screen, before Join.', more: 'Students who open the link are in Classroom sound at once, even on the title screen: less than half as loud and still not silent. Their own sound returns when they leave the room. A student with sound settings of their own keeps them.' },
  { id: 'off', label: 'Off', query: '&sound=off', hint: 'Adds &amp;sound=off. Students start muted; M turns sound on.', more: 'Students who open the link are muted at once, even on the title screen. M turns sound on in Classroom. Their own sound returns when they leave the room. A student with sound settings of their own keeps them.' },
];
/** What the toast says when the link is copied: it names what the link carries (the choice comes before the copy, and copying first left a link without it and nothing said so). */
export const LINK_COPIED = { normal: 'Student link copied.', quiet: 'Student link copied, with quiet sound.', off: 'Student link copied, with sound off.' };
const realPerDay = (speed) => { const s = 168 / speed; return s < 120 ? Math.round(s) + ' seconds' : s < 7200 ? Math.round(s / 60) + ' minutes' : (s / 3600).toFixed(1) + ' hours'; };
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const topZone = (st) => Math.min(ZONE_COUNT, Math.max(1, Math.round(st?.zones) || 1));
const perksOf = (st) => (Array.isArray(st?.perks) ? st.perks.filter((id) => own(PERKS, id)) : []);
/** How many days of daily checkpoints a student's game keeps, so how far a rewind can reach (js/engine.js `_checkpoint`; tests/copy2-debrief.test.mjs plays it). */
export const CHECKPOINT_DAYS = 10;
const warnTip = `Students with higher Capital Sourcing get earlier warnings: ${WARN_LEAD.novice} hours at first, ${WARN_LEAD.mid} hours at level 3, ${WARN_LEAD.adv / 24} days at level 5.`;
/** The Gini above which the dashboard raises its inequality alert (a teaching threshold of the dashboard's own, not an engine rule). */
export const GINI_ALERT = 0.65;
/** A founder past the first milestone with no sale and no manager cycle for more days than this is listed under Operational bottlenecks (js/engine.js `lastAuto`: a pitch, a manager's cycle). */
export const STALL_DAYS = 3;
/** The Rewind buttons' days. A rewind goes to the students who are online when it is sent (a live message: js/session.js `rewind`; the relay keeps only the last snapshots and the clock), so a student who is away is not rewound. */
const REWIND_DAYS = [1, 3, 7];
const rewindTip = (d) => `Sends every online student back ${d} day${d === 1 ? '' : 's'} to a daily checkpoint. A rewind reaches back ${CHECKPOINT_DAYS} days at most.`;
const REWIND_LIST = `Sends every online student back ${REWIND_DAYS.slice(0, -1).join(', ')} or ${REWIND_DAYS.at(-1)} days to a daily checkpoint. A rewind reaches back ${CHECKPOINT_DAYS} days at most.`;
/** What the sliders and boxes do. `ghosts` is the herd: it is not a roster row, but it sets every sale's price pressure and creativity multiplier (js/engine.js `crowd`, `cmFor`), so it moves the results the percentile ranks. */
const TIP = {
  friction: 'Scales taxes and fees.', audit: 'Scales how often audits come.',
  ghosts: 'Simulated sellers that crowd niches, so the creativity multiplier has something to punish in a small class. They are not roster rows and never enter the percentile, but they change what sales pay, and with it the results the percentile ranks. Keep the number the same in every section you compare.',
  demo: 'Made-up students for a demo. They count in everyone\'s percentile, so leave this at 0 when you grade.',
  floor: `The divisor floor of the efficiency index (default ${money(EEI_FLOOR_DEFAULT)}).`,
  algo: 'A viral mention, a supply glut or a regulatory scare, drawn from the room code and the day, so every student sees the same ones.',
};
/** The three scheduled shocks, named as the Credit Crunch button and the schedule line name them. */
const SHOCK_NAME = { tiktok: 'TikTok Surge', fed: 'Credit Crunch', tariff: 'Tariff Lock' };
const shockName = (kind) => SHOCK_NAME[kind] || (own(ALGO_EVENTS, kind) ? ALGO_EVENTS[kind].name : own(EVENTS, kind) ? EVENTS[kind].name : String(kind));
const dayOf = (hour) => Math.floor(hour / 24) + 1;
/** The points of 20 that a row's adaptability puts into its subtotal. A founder with no graded shock has `adapt` null and still counts a neutral score (js/session.js `gradebook`: `adapt ?? 50`), so what the subtotal used is read back from the row. */
const adaptUsed = (r) => (r.adapt == null ? r.auto - r.econ * 0.3 - r.engage * 0.1 : r.adapt * 0.2);
const adaptCell = (r) => (r.adapt == null ? `<span class="mute">${adaptUsed(r).toFixed(1)}*</span>` : adaptUsed(r).toFixed(1));

/**
 * Put `text` on the clipboard where the page can (fifth round, W2-1). The async clipboard exists only on a secure origin (https, localhost): on plain http at a LAN address, which is how a shared lab
 * runs `server/static.mjs` with HOST=0.0.0.0, `navigator.clipboard` is undefined and Copy student link did nothing at all. There the older command still works from a click: a read-only field
 * holds the text, is selected, copied and removed, and the cursor goes back to where it was. Resolves true when it was copied and false when nothing could; it never throws. `env` is for a test.
 */
export async function copyText(text, env = globalThis) {
  const nav = env && env.navigator, doc = env && env.document;
  try { if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') { await nav.clipboard.writeText(text); return true; } } catch { /* refused (a permission) or throws: the command below may still work */ }
  try {
    if (!doc || typeof doc.createElement !== 'function' || typeof doc.execCommand !== 'function' || !doc.body) return false;
    const t = doc.createElement('textarea'), was = doc.activeElement;
    t.value = text; t.setAttribute('readonly', ''); t.setAttribute('aria-hidden', 'true'); t.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
    doc.body.appendChild(t); t.select(); t.setSelectionRange?.(0, String(text).length);
    let ok = false; try { ok = !!doc.execCommand('copy'); } finally { t.remove(); was?.focus?.({ preventScroll: true }); }
    return ok;
  } catch { return false; }
}

/** Two small icons for a student's Backgrounds, each named for assistive technology. */
export const bgIcons = (st) => {
  const ids = perksOf(st);
  return ids.length ? `<span class="in-bgs" role="img" aria-label="${esc(ids.map((id) => PERKS[id].name).join(' and '))}" title="${esc(ids.map((id) => PERKS[id].name).join(' + '))}">${ids.map((id) => `<span aria-hidden="true">${PERKS[id].icon}</span>`).join('')}</span>` : '<span class="mute">none</span>';
};

// ---------------------------------------------------------------- keeping the room, and getting back into it
/** How long a student's browser listens to the instructor it already knows after that one has gone quiet, before it believes a different Founder ID that says it is the instructor (js/session.js `_isInstructor`:
 *  60 000 ms; tests/finish-ui.test.mjs plays it). The relay hands the seat to the owner's new connection at once, but the students do not follow at once: for this long they ignore the new ID's clock, shocks and rewinds. */
export const FOLLOW_SECONDS = 60;
/** Where the grading rubric is: docs/ is not published with the site, so the dashboard links to the file in the repository. */
export const KIT_URL = 'https://github.com/imaidan808/Paperclip-Capitalist/blob/main/docs/FACULTY_KIT.md';
export { FOLLOW_NOTE, RECOVER_WAIT_SECONDS }; // (room-notes.js: the title screen says them too, without loading this dashboard)

/** The panel that keeps the room: what runs only here, the recovery code (hidden until asked for, because the dashboard is often on a projector) and what to do with it. Pure; built from the session alone. */
export function recoveryHTML(S) {
  const code = S.roomInfo?.code || '', key = typeof S.recoveryCode === 'function' ? S.recoveryCode() : null;
  // a room with no relay is the tabs of one browser (js/net.js LocalTransport, a BroadcastChannel): no other laptop can take it over, with the recovery code or without it, so the paragraph read without opening the fold must not offer one
  const lead = S.room?.kind === 'relay'
    ? `<b>This live room runs only from this browser unless you save its recovery code.</b> The room code <b class="mono">${esc(code)}</b> and the recovery code are the only way back in from another laptop or after this browser forgets the room.`
    : `<b>This live room exists only in this browser's tabs.</b> Without a relay server, another laptop cannot take it over. If this browser forgets the room, resume it here with the room code <b class="mono">${esc(code)}</b> and the recovery code.`;
  if (!key) {
    return `<section class="panel in-keep" aria-labelledby="in-keep-h"><h2 id="in-keep-h">Keep this room</h2>
      <div class="callout warn"><b>No recovery code is saved for room <span class="mono">${esc(code)}</span>.</b> This browser could not keep one (its storage may be blocked, or this is a private window), so only this tab can run the room. If you close it, you cannot resume as instructor.</div></section>`;
  }
  return `<section class="panel in-keep" aria-labelledby="in-keep-h"><h2 id="in-keep-h">Keep this room</h2>
    <p class="small" style="margin-top:0">${lead}</p>
    <details class="in-code"><summary class="small">Show the recovery code</summary>
      <p class="mono in-key" id="in-key" tabindex="0">${esc(key)}</p>
      <div class="row"><button class="btn sm" data-act="copykey" data-fid="in-copykey">Copy the recovery code</button></div>
      <p class="tiny mute">Anyone with this code can run the room: keep it like a password and off the projector. To use it, open the title screen, choose <b>Instructor</b>, then <b>Resume as instructor</b>, and enter the room code and this code.</p>
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

/** A closed fold that stays as the instructor left it. The panels are drawn again as the numbers move, so the open state is kept in `U.open` (mountInstructor listens for `toggle`), and the summary keeps the keyboard's place (`data-fid`). */
const fold = (U, key, summary, body) => `<details class="gap" data-fold="${key}"${U?.open?.[key] ? ' open' : ''}><summary class="small" data-fid="fold-${key}">${summary}</summary>${body}</details>`;

// ---------------------------------------------------------------- the shocks still to come
/**
 * The scheduled shocks still to come and the ones this dashboard sent, as the students' games will have them. The algorithmic surprise events the room code draws (js/engine.js `_algoEvent`, one day ahead) are not in it: this dashboard does not draw them. Every game schedules the three of js/config.js EVENTS (js/engine.js `_new`). A shock sent from this dashboard begins at its hour, and one sent
 * with Replace first takes out the shocks of its kind that had not begun when it was sent (js/engine.js `injectEvent`). `sent` is what this dashboard sent, in order: { id, kind, at, from, replace }. A shock in
 * `S.injected` that `sent` does not hold (the dashboard was reloaded and the record was lost) is listed too, and the scheduled shock of its kind is marked: whether it was replaced is not known.
 */
export function shockSchedule(S, hour, sent = []) {
  let list = Object.values(EVENTS).map((e) => ({ kind: e.id, start: (e.day - 1) * 24, scheduled: true }));
  const told = new Set();
  for (const x of sent) {
    told.add(x.id);
    if (x.replace) list = list.filter((e) => !(e.kind === x.kind && e.start > x.from));
    list.push({ kind: x.kind, start: x.at });
  }
  for (const [id, start] of S.injected instanceof Map ? S.injected : []) {
    const kind = told.has(id) ? null : /^inj-([a-z]+)-\d+-\d+$/.exec(id)?.[1];
    if (!kind || !(own(EVENTS, kind) || own(ALGO_EVENTS, kind)) || !Number.isFinite(start)) continue;
    for (const e of list) if (e.scheduled && e.kind === kind) e.unsure = true;
    list.push({ kind, start });
  }
  return list.filter((e) => e.start > Math.floor(hour)).sort((a, b) => a.start - b.start || a.kind.localeCompare(b.kind));
}
const ALGO_NOTE = 'Algorithmic surprise events, drawn from the room code and the day, are not listed.';
const scheduleText = (list, algo) => (list.length ? 'Scheduled: ' + list.map((e) => `${shockName(e.kind)} day ${dayOf(e.start)}${e.unsure ? ' (if not replaced)' : ''}`).join(', ') + '.' : 'No shock is scheduled.') + (algo ? ' ' + ALGO_NOTE : '');
/** The shocks this dashboard sent, kept in this browser so that a reload of the dashboard still knows which of them replaced a scheduled one. */
const SENT_KEY = 'shocksent';
export function loadSent(S) {
  const r = S.kv?.get(SENT_KEY);
  if (!r || typeof r !== 'object' || r.code !== S.roomInfo?.code || !Array.isArray(r.list)) return [];
  return r.list.filter((x) => x && typeof x.id === 'string' && (own(EVENTS, x.kind) || own(ALGO_EVENTS, x.kind)) && Number.isFinite(x.at) && Number.isFinite(x.from)).slice(-50).map((x) => ({ id: x.id, kind: x.kind, at: x.at, from: x.from, replace: x.replace === true }));
}

/** Niche saturation for one district: 48-hour transaction counts by asset class and buyer (cohort ghosts, real peers and demo students). */
export function heatHTML(S, U, students, dist) {
  const hour = Math.floor(S.clock.now()), z = U.zone && ZONES[U.zone] ? U.zone : busiest(dist);
  const classes = Object.keys(ASSETS).filter((c) => demandOf(ASSETS[c], z) > 0), buyers = Object.keys(BUYERS).filter((b) => BUYERS[b].zone === z);
  const mk = marksOf(buyers.map((b) => BUYERS[b].name)); // the disc is all a column head shows: two letters where two buyers of a district share a first letter
  const agg = {};
  for (const c of classes) { const by = S.cohort.counts(hour, z, c).byBuyer || {}; for (const b of buyers) if (by[b]) agg[nicheKey(z, c, b)] = by[b]; }
  for (const st of students.filter((x) => x.synth)) for (const [k, n] of Object.entries(st.niches || {})) if (k.startsWith(z + '|')) agg[k] = (agg[k] || 0) + n;
  const total = (c) => buyers.reduce((a, b) => a + (agg[nicheKey(z, c, b)] || 0), 0);
  // a district trades dozens of classes at a trickle; show the tradeable ones and any that the class has actually piled into
  const shown = classes.filter((c) => demandOf(ASSETS[c], z) >= 4 || total(c) > 0).sort((a, b) => total(b) - total(a) || ASSETS[a].name.localeCompare(ASSETS[b].name)).slice(0, 14);
  const max = Math.max(1, ...Object.values(agg));
  const rows = shown.map((c) => `<tr><th scope="row">${esc(ASSETS[c].name)}</th>${buyers.map((b) => { const n = agg[nicheKey(z, c, b)] || 0, a = Math.min(0.6, n / max * 0.6); return `<td class="mono right" style="background:rgba(255,125,117,${a.toFixed(2)})">${n ? Math.round(n) || '&lt;1' : ''}</td>`; }).join('')}</tr>`).join('');
  return `<div class="row"><label for="hz">District</label><select id="hz" data-change="hzsel" data-fid="hz">${ZONE_IDS.map((n) => `<option value="${n}" ${n === z ? 'selected' : ''}>${n}. ${esc(ZONES[n].name)}${dist[n] ? ` (${dist[n]} here)` : ''}</option>`).join('')}</select></div>
    <div class="scroll gap"><table class="tbl"><caption class="sr">Niche saturation in ${esc(ZONES[z].name)}: 48-hour transaction counts by asset class and buyer</caption><thead><tr><th scope="col">Asset class</th>${buyers.map((b, i) => `<th scope="col" title="${esc(BUYERS[b].name)}">${avatarHTML(BUYERS[b].name, BUYERS[b].style, 'sm', mk[i])}<span class="sr">${esc(BUYERS[b].name)}</span></th>`).join('')}</tr></thead><tbody>${rows || `<tr><td class="mute" colspan="${buyers.length + 1}">Nobody has traded here yet.</td></tr>`}</tbody></table></div>
    <p class="tiny mute">Darker means more of the class sold to the same buyer in the last 48 virtual hours${classes.length > shown.length ? ` (${shown.length} busiest of ${classes.length} classes)` : ''}.</p>
    ${fold(U, 'buyers', 'Buyer key', `<p class="tiny mute">${buyers.map((b, i) => avatarHTML(BUYERS[b].name, BUYERS[b].style, 'sm', mk[i]) + ' ' + esc(BUYERS[b].name)).join(' &middot; ')}</p>`)}`;
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
  const stuck = students.filter((s) => s.online !== false && s.autoEligible && (hour - (s.lastAutoHour ?? hour)) / 24 > STALL_DAYS); // (one who is away is not stalled, they are not there)
  // A room taken back from another device does not know the class's hour until it has heard it (js/session.js `recovering`): its clock reads Day 1 and a rewind or a shock sent from here would be
  // measured against that made-up hour, so the controls that depend on the hour wait, and the page says so instead of showing a lobby.
  const recovering = S.recovering === true, off = recovering ? ' aria-disabled="true"' : '';
  const lobby = !recovering && S.clock.paused && hour < 1;
  const room = S.roomInfo || { code: '', relay: '' };
  // every hover of the controls is made by `hint`, so that the fold "What the controls do" says the same words once more where a keyboard, a finger and a screen reader can read them (a title is shown to a mouse and to nothing else).
  // A hover on a label is not tied to its control (a slider in focus says only its name), so a control that is given an `id` is also `aria-describedby` a hidden span with the same words (`about`; the spans end the panel).
  const notes = [], descs = [];
  const hint = (label, text, { listed = text, id = '' } = {}) => { if (!notes.some(([k]) => k === label)) notes.push([label, listed]); if (id) descs.push([id, text]); return ` title="${esc(text)}"`; };
  const about = (id) => ` aria-describedby="hd-${id}"`;
  const ls = LINK_SOUNDS.find((x) => x.id === U.linkSound) || LINK_SOUNDS[0];
  const link = `${typeof location !== 'undefined' ? location.origin + location.pathname : ''}?room=${room.code}${room.relay ? '&relay=' + encodeURIComponent(room.relay) : ''}${ls.query}`; // `sound=quiet` or `sound=off`: students who open it start in Classroom sound, or muted, while they are in the room (docs/AUDIO.md 7.1); never over a sound setting a student has chosen
  const dist = distribution(students), drafted = draftCounts(students), here = U.zone && ZONES[U.zone] ? U.zone : busiest(dist);

  const head = `<div class="grow"><h1 tabindex="-1" style="margin:0;font-size:1.3rem">Instructor dashboard</h1><span class="small mute">Room <b class="mono gold" style="font-size:1.2rem">${esc(room.code)}</b> &middot; ${S.room?.kind === 'relay' ? 'relay server (' + esc(S.room.state) + ')' : '<span title="Students join from other tabs of this browser with Copy student link.">this browser only</span> (other devices need a relay)'} &middot; <b>${onlineN}</b> student${onlineN === 1 ? '' : 's'} online${real.length > onlineN ? ' (' + (real.length - onlineN) + ' away)' : ''}${S.demo ? ' + ' + S.demo + ' demo' : ''}</span></div>
      <fieldset class="in-linksound" style="display:grid;gap:.15rem;max-width:15rem;margin:0;padding:0;border:0;min-width:0"><legend style="color:var(--ink);padding:0;font-size:.82rem">Sound in the student link</legend>
        <div class="row" style="gap:.15rem .35rem">${LINK_SOUNDS.map((x) => `<input type="radio" name="linksound" id="ls-${x.id}" value="${x.id}" data-change="linksound" data-fid="ls-${x.id}" aria-describedby="ls-h"${x.id === ls.id ? ' checked' : ''}><label for="ls-${x.id}" style="color:var(--ink);margin:0 .6rem 0 0">${x.label}</label>`).join('')}</div>
        <span class="tiny mute" id="ls-h" title="${esc(ls.more)}">${ls.hint}<span class="sr"> ${esc(ls.more)}</span></span></fieldset>
      <button class="btn sm ghost" data-fid="in-copylink" data-act="copylink" data-link="${esc(link)}"${ls.id === 'normal' ? '' : ` data-sound="${ls.id}"`}>Copy student link</button>
      <button class="btn sm ghost" data-fid="in-settings" data-act="settings">Display and sound</button><button class="btn sm danger" data-fid="in-close" data-act="close">Close room</button>`;

  const events = Object.values(EVENTS).map((e) => `<option value="${e.id}" ${U.ev === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('') + Object.entries(ALGO_EVENTS).map(([k, e]) => `<option value="${k}" ${U.ev === k ? 'selected' : ''}>${esc(e.name)} (algorithmic)</option>`).join('');
  const c1 = `
      <section class="panel"><h2>Global engine step controls</h2>
        ${recovering ? `<div class="callout warn" role="status"><b>Taking the room back.</b> This dashboard is waiting about ${RECOVER_WAIT_SECONDS} seconds to hear the class's clock. Until then the day below is not the class's, and the pace, rewind and shock controls are off.</div>` : ''}
        ${lobby ? `<div class="callout warn"><b>Lobby.</b> The clock is paused at Day 1 while students join. <button class="btn sm" data-act="start">Start simulation</button></div>` : ''}
        <div class="row"><div class="mono" style="font-size:1.6rem">Day ${day} <span class="mute" style="font-size:.9rem">/ ${TOTAL_DAYS}</span></div><span class="chip ${S.clock.paused ? 'warn' : 'good'}">${S.clock.paused ? 'Paused' : 'Running ' + (S.clock.speed < 0.1 ? S.clock.speed.toFixed(4) : S.clock.speed) + 'x'}</span><span class="small mute">1 virtual day = ${realPerDay(S.clock.speed)}</span></div>
        <div class="bar gap" role="progressbar" aria-label="Simulation progress" aria-valuemin="0" aria-valuemax="${TOTAL_DAYS}" aria-valuenow="${day}"><i style="width:${hour / 2160 * 100}%"></i></div>
        <div class="row gap"><button class="btn sm" data-act="pause" data-fid="in-pause"${off}>${S.clock.paused ? 'Resume' : 'Pause'}</button>
          ${[1, 4, 16, 64].map((v) => `<button class="btn sm ghost" data-act="speed" data-v="${v}" data-fid="in-speed-${v}" aria-pressed="${S.clock.speed === v}"${off}>${v}x</button>`).join('')}
          <span class="grow"></span>${REWIND_DAYS.map((d) => `<button class="btn sm ghost" data-fid="in-rewind-${d}" data-act="rewind" data-d="${d}"${hint('Rewind', rewindTip(d), { listed: REWIND_LIST })}${off}>${d === 1 ? 'Rewind 1 day' : d + ' days'}</button>`).join('')}</div>
        <p class="tiny mute">A rewind reaches only the students who are online when you send it.</p>
        <label for="pace" class="gap">Pace preset</label><select id="pace" data-change="pace" data-fid="pace"${recovering ? ' disabled' : ''}><option value="">Choose a pace...</option>${PRESETS.map(([l], i) => `<option value="${i}">${esc(l)}</option>`).join('')}</select></section>
      <section class="panel"><h2>Manual black swan trigger</h2>
        <div class="grid g2"><div><label for="ev">Scenario</label><select id="ev" data-change="evsel" data-fid="ev">${events}</select></div>
        <div><label for="evw">When</label><select id="evw" data-change="evwhen" data-fid="evw"><option value="0" ${U.when === '0' ? 'selected' : ''}>Right now (breaking, no warning)</option><option value="24" ${U.when === '24' ? 'selected' : ''}>In 24 virtual hours</option><option value="72" ${U.when === '72' ? 'selected' : ''}>In 72 virtual hours</option></select></div></div>
        <label class="row gap" style="color:var(--ink)"><input type="checkbox" data-change="evrep" data-fid="in-evrep" ${U.replace ? 'checked' : ''}> Replace the scheduled copy (pull it forward instead of stacking)</label>
        <button class="btn gap" data-act="deploy" data-fid="in-deploy"${off}>Deploy to cohort</button>
        <p class="tiny mute">A shock reaches only the students who are online when you deploy it.</p>
        <p class="tiny mute"${hint('Warnings', warnTip)}>${esc(scheduleText(shockSchedule(S, hour, Array.isArray(U.sent) ? U.sent : []), S.algo))}</p></section>
      <section class="panel"><h2>Asymmetric risk scaling</h2>
        <label for="fr"${hint('Transaction friction', TIP.friction, { id: 'fr' })}>Transaction friction: <b class="mono" id="frv">${S.difficulty.friction.toFixed(2)}x</b></label><input id="fr" type="range" min="0.5" max="3" step="0.05" value="${S.difficulty.friction}" data-input="fr"${about('fr')}>
        <label for="au" class="gap"${hint('Compliance audit frequency', TIP.audit, { id: 'au' })}>Compliance audit frequency: <b class="mono" id="auv">${S.difficulty.audit.toFixed(2)}x</b></label><input id="au" type="range" min="0.5" max="3" step="0.05" value="${S.difficulty.audit}" data-input="au"${about('au')}>
        <label for="gh" class="gap"${hint('Synthetic classmates filling the market', TIP.ghosts, { id: 'gh' })}>Synthetic classmates filling the market: <b class="mono" id="ghv">${S.ghosts}</b></label><input id="gh" type="range" min="0" max="80" step="2" value="${S.ghosts}" data-input="gh"${about('gh')}>
        <label for="dm" class="gap"${hint('Demo students on this dashboard', TIP.demo, { id: 'dm' })}>Demo students on this dashboard: <b class="mono" id="dmv">${S.demo}</b></label><input id="dm" type="range" min="0" max="24" step="1" value="${S.demo}" data-input="dm"${about('dm')}>
        <label for="fl" class="gap"${hint('EEI starting-capital floor', TIP.floor, { id: 'fl' })}>EEI starting-capital floor</label><input id="fl" inputmode="numeric" value="${S.difficulty.eeiFloor}" data-change="floor"${about('fl')}>
        <label class="row gap" style="color:var(--ink)"${hint('Algorithmic surprise events', TIP.algo, { id: 'al' })}><input type="checkbox" data-change="algo" data-fid="in-algo"${about('al')} ${S.algo ? 'checked' : ''}> Algorithmic surprise events</label>
        ${fold(U, 'controls', 'What the controls do', `<ul class="small">${notes.map(([k, v]) => `<li><b>${esc(k)}</b>: ${esc(v)}</li>`).join('')}</ul>`)}${descs.map(([id, t]) => `<span class="sr" id="hd-${id}">${esc(t)}</span>`).join('')}</section>`;

  const flags = S.flagsAll();
  const chips = PERK_IDS.filter((id) => drafted[id]).sort((a, b) => drafted[b] - drafted[a] || a.localeCompare(b));
  const c2 = `
      <section class="panel"><h2>Live cohort metrics</h2>
        <div class="grid g3"><div class="card" title="The alert starts above ${GINI_ALERT}."><div class="small mute">Wealth Gini</div><div class="mono ${gi > GINI_ALERT ? 'red' : 'green'}" style="font-size:1.5rem">${gi.toFixed(2)}</div></div><div class="card"><div class="small mute">Median net worth</div><div class="mono" style="font-size:1.2rem">${money(med)}</div></div><div class="card"><div class="small mute">Students</div><div class="mono" style="font-size:1.5rem">${students.length}</div></div></div>
        ${gi > GINI_ALERT ? `<div class="callout bad"><b>Inequality alert.</b> Gini is above ${GINI_ALERT}: a few founders are pulling away. <button class="btn sm" data-act="squeeze"${off}>Inject Credit Crunch now</button></div>` : ''}
        <h3 class="gap">Students by highest district reached</h3>${distributionHTML(dist, here)}
        <h3 class="gap">What the class drafted</h3>${chips.length ? `<ul class="in-chips">${chips.map((id) => `<li><span aria-hidden="true">${PERKS[id].icon}</span> ${esc(PERKS[id].name)} <b class="mono">${drafted[id]}</b></li>`).join('')}</ul>` : '<p class="small mute">No Backgrounds yet.</p>'}
        <h3 class="gap">Niche saturation heat map</h3>${heatHTML(S, U, students, dist)}</section>
      <section class="panel"><h2>Operational bottlenecks</h2>${stuck.length ? `<table class="tbl"><thead><tr><th scope="col">Founder</th><th scope="col" title="Days since a sale to a buyer or a manager cycle last finished. A founder is listed after ${STALL_DAYS} days, once past the first milestone.">Static for</th><th scope="col">Net worth</th></tr></thead><tbody>${stuck.map((s) => `<tr><td>${esc(s.handle)} <span class="tiny mute">${esc(s.pid)}</span></td><td class="mono">${((hour - s.lastAutoHour) / 24).toFixed(1)} days</td><td class="mono">${money(s.nw)}</td></tr>`).join('')}</tbody></table>` : '<p class="small mute">No founder is stalled.</p>'}</section>
      <section class="panel"><h2>Flagged peer trades <span class="tiny mute">(more than ${Math.round(FMV_BAND * 100)}% apart)</span></h2>${flags.length ? `<table class="tbl"><thead><tr><th scope="col">Day</th><th scope="col">From</th><th scope="col">To</th><th scope="col">Variance</th></tr></thead><tbody>${flags.slice(-8).reverse().map((f) => `<tr><td class="mono">${Math.floor((f.hour ?? f.h ?? 0) / 24) + 1}</td><td>${esc(f.from || f.pid)}</td><td>${esc(f.to || f.peer || '')}</td><td class="mono red">${(f.variance * 100).toFixed(0)}%</td></tr>`).join('')}</tbody></table>` : '<p class="small mute">None. Extreme offers are blocked and logged.</p>'}</section>`;

  const gb = S.gradebook().sort((a, b) => b.eei - a.eei);
  const bg = own(PERKS, U.bg) ? U.bg : 'all';
  const shown = gb.filter((r) => bg === 'all' || perksOf(r).includes(bg));
  const ungraded = shown.find((r) => r.adapt == null);
  const grade = `<div class="row"><h2 class="grow">Roster and gradebook</h2><label class="sr" for="pf">Background</label><select id="pf" data-change="bgf" data-fid="pf"><option value="all">All Backgrounds</option>${PERK_IDS.map((id) => `<option value="${id}" ${bg === id ? 'selected' : ''}>${esc(PERKS[id].name)}</option>`).join('')}</select><button class="btn sm" data-act="gradecsv" data-fid="in-csv">Export gradebook CSV</button></div>
      <div class="scroll" style="max-height:26rem"><table class="tbl"><caption class="sr">Roster with automated grade components</caption><thead><tr><th scope="col">Founder</th><th scope="col">Backgrounds</th><th scope="col">District</th><th scope="col">Net worth</th><th scope="col">EEI</th><th scope="col">Economic (30)</th><th scope="col">Adaptability (20)</th><th scope="col">Peer market (10)</th><th scope="col">Auto subtotal / 60</th><th scope="col">Status</th></tr></thead><tbody>
      ${shown.map((r) => `<tr><td>${esc(r.handle)} <span class="tiny mute">${esc(r.pid)}</span>${r.rewind && !r.rewind.ok ? ` <span class="chip warn" title="Their run could not go all the way back: it has no checkpoint that old">rewind stopped at day ${Math.floor(r.rewind.hour / 24) + 1} (asked for day ${Math.floor(r.rewind.wanted / 24) + 1})</span>` : ''}</td><td>${bgIcons(r)}</td><td class="mono" title="${esc(ZONES[topZone(r)].name)}">${topZone(r)}</td><td class="mono">${money(r.nw)}</td><td class="mono">${r.eei >= 100 ? r.eei.toFixed(0) : r.eei.toFixed(2)}</td><td class="mono">${(r.econ * 0.3).toFixed(1)}</td><td class="mono">${adaptCell(r)}</td><td class="mono">${(r.engage * 0.1).toFixed(1)}</td><td class="mono"><b>${r.auto.toFixed(1)}</b></td><td>${r.synth ? '<span class="chip">demo</span>' : r.online ? '<span class="chip good">online</span>' : '<span class="chip warn">away</span>'}${r.flags?.insolvent ? ' <span class="chip bad">insolvent</span>' : ''}${r.flagged ? ` <span class="chip bad">${r.flagged} flagged</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="10" class="mute">Waiting for students. Share the room code, or add demo students with the slider above.</td></tr>'}</tbody></table></div>
      ${ungraded ? `<p class="tiny mute">* No shock graded yet: counted as a neutral ${Math.round(adaptUsed(ungraded) / 0.2)} of 100, which is ${Math.round(adaptUsed(ungraded))} of the 20 points.</p>` : ''}
      ${fold(U, 'points', 'How the automated points are worked out', `<ul class="small mute">
        <li>Each component is scored from 0 to 100, then weighted to the points in its column heading.</li>
        <li><b>Economic (30):</b> percentile of the efficiency index among everyone on the roster, demo students included. Every founder starts with one paperclip and $0, so no start is compared separately.</li>
        <li><b>Adaptability (20):</b> how far net worth moved in the five days after each shock, compared with the class median, plus 10 for a pivot. With no graded shock a founder counts a neutral 50.</li>
        <li><b>Peer market (10):</b> 25 for each completed swap with a classmate, less 10 for each flagged attempt.</li>
        <li>The 40 points for reflection are yours to grade with the rubric in the <a href="${KIT_URL}" target="_blank" rel="noopener noreferrer">faculty kit</a> (docs/FACULTY_KIT.md in the repository).</li>
        <li>Grade passback (LTI 1.3) is not built: export the CSV and import it into your LMS gradebook.</li></ul>`)}`;
  return { head, keep: recoveryHTML(S), c1, c2, grade };
}

/** A cell that a spreadsheet will read as text, never as a formula (aliases are typed by students). */
const textCell = (v) => { const t = String(v ?? ''); return /^[=+\-@\t\r]/.test(t) ? "'" + t : t; };
export function gradebookCSV(S) {
  const rows = [['founder_id', 'alias', 'background_1', 'background_2', 'district_reached', 'level', 'net_worth', 'eei', 'economic_percentile', 'economic_points_of_30', 'adaptability_points_of_20', 'peer_market_points_of_10', 'auto_subtotal_of_60', 'reflection_points_of_40', 'p2p_swaps', 'flagged_trades', 'virtual_days_played', 'adaptability_graded'],
    ...S.gradebook().filter((r) => !r.synth).map((r) => { const ids = perksOf(r); return [textCell(r.pid), textCell(r.handle), ids[0] || '', ids[1] || '', topZone(r), r.level ?? '', r.nw.toFixed(2), r.eei.toFixed(3), r.econ.toFixed(1), (r.econ * 0.3).toFixed(1), adaptUsed(r).toFixed(1), (r.engage * 0.1).toFixed(1), r.auto.toFixed(1), '', r.p2p || 0, r.flagged, r.hoursPlayed, r.adapt == null ? 'no' : 'yes']; })];
  return rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
}

export function mountInstructor(root, S, hooks) {
  const U = { zone: null, bg: 'all', ev: 'fed', when: '0', replace: true, linkSound: 'normal', open: {}, sent: loadSent(S) };
  root.innerHTML = `<header class="panel row" id="ih"></header><div class="gap" id="ikeep"></div><div class="gap main"><div class="col" id="icol1"></div><div class="col" id="icol2"></div></div><section class="panel gap" id="igrade"></section>`;
  const el = { head: $('#ih'), keep: $('#ikeep'), c1: $('#icol1'), c2: $('#icol2'), grade: $('#igrade') };

  function render() {
    const p = instructorParts(S, U);
    setHTML(el.head, p.head); setHTML(el.keep, p.keep); setHTML(el.c1, p.c1); setHTML(el.c2, p.c2); setHTML(el.grade, p.grade);
  }
  // a fold the instructor opened stays open when its panel is drawn again (`toggle` does not bubble, so it is heard on the way down)
  const onToggle = (e) => { const k = e.target?.dataset?.fold; if (k) U.open[k] = !!e.target.open; };
  root.addEventListener('toggle', onToggle, true);
  /** Remembers a shock this dashboard sent and whether it replaced the scheduled one, so the schedule line can say what the students' games now hold. `when` is the delay it was sent with. */
  function noteSent(r, kind, replace, when) {
    if (!r || r.ok === false || typeof r.id !== 'string') return;
    U.sent = [...U.sent, { id: r.id, kind, at: r.atHour, from: r.atHour - when, replace }].slice(-50);
    S.kv?.set(SENT_KEY, { code: S.roomInfo?.code, list: U.sent });
    render();
  }

  const acts = {
    settings() { settingsDialog(); },
    close() { S.kv?.del(SENT_KEY); hooks.onClose(); }, // (closing the room forgets what it sent, as it forgets its roster: js/session.js `leaveRoom`)
    copykey() { copyRecovery(S, { write: (t) => navigator.clipboard.writeText(t), say: toast }); },
    linksound(b) { U.linkSound = LINK_SOUNDS.some((x) => x.id === b.value) ? b.value : 'normal'; render(); }, // the student link carries nothing, ?sound=quiet or ?sound=off
    copylink(b) { copyText(b.dataset.link).then((ok) => (ok ? toast(LINK_COPIED[b.dataset.sound] || LINK_COPIED.normal, 'good') : toast(`Could not copy it by itself. The student link is ${b.dataset.link}`, 'info', 9000))); }, // the box comes first and the toast says what the link carries: copying before ticking left a link without the flag, and nothing said so. With no way to copy the link is in the words, for nine seconds
    start() { S.clock.set({ hour: 0, paused: false }); S._sendClock(); render(); toast('Simulation started.', 'good'); },
    pause() { S.setPaused(!S.clock.paused); },
    speed(b) { S.setSpeed(+b.dataset.v); },
    pace(b) { if (b.value !== '') { S.setSpeed(PRESETS[+b.value][1]); toast(`1 virtual day is now ${realPerDay(S.clock.speed)}.`, 'info'); } },
    rewind(b) { const r = S.rewind(+b.dataset.d); toast(r && r.ok === false ? r.msg : 'Rewind sent to the students who are online.', 'warn'); }, // (a room still taking itself back refuses: Session._holdWhileRecovering)
    hzsel(b) { U.zone = +b.value; render(); },
    evsel(b) { U.ev = b.value; }, evwhen(b) { U.when = b.value; }, evrep(b) { U.replace = b.checked; },
    deploy() { const r = S.inject(U.ev, { when: +U.when, replace: U.replace && !!EVENTS[U.ev], cls: 'sneakers' }); noteSent(r, U.ev, U.replace && !!EVENTS[U.ev], +U.when); toast(r && r.ok === false ? r.msg : 'Event deployed to the students who are online.', 'warn'); },
    squeeze() { const r = S.inject('fed', { when: 0, replace: true }); noteSent(r, 'fed', true, 0); toast(r && r.ok === false ? r.msg : 'Credit Crunch injected.', 'warn'); },
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
  return { destroy() { off(); root.removeEventListener('toggle', onToggle, true); } };
}
