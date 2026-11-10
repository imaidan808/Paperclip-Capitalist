// The student's roster: who is in the room with them, opened from the Room chip in the HUD (js/ui/hud.js). Lazy: the shell asks for this file the first time the chip is pressed (js/ui/shell.js, `roster`), so it is not
// part of the first screen. It shows what the instructor's switch allows (js/session.js `classmates`): with everything shown, the district each classmate is in; with `online`, only who is here or away; with `off`, nobody.
// A name is the alias the room gave in its hello and snapshot (Session.nameOf), never a word from a `here` frame, and it is escaped here whatever it holds. A district is named from this page's own table, from its
// number. There is no money in it and no number of the game: the roster is a list of people and where they are.
import { ZONES, ZONE_COUNT } from '../config.js';
import { esc, $, dlg as shared } from './common.js';

const EVERY = 1000; // ms: while the dialog is open its list is drawn again at most this often, so a screen reader going down it is not interrupted by every frame of a busy room
const MODES = ['full', 'online', 'off'];

/** What a classmate is doing, in words, as much of it as the switch lets the student see. */
function nowOf(c, full) {
  if (c.s === 'away') return 'Away';
  if (!full) return 'Here';
  if (c.s === 'academy') return 'In the Academy';
  if (c.s === 'debrief') return 'In the Debrief';
  if (c.s === 'play' && Number.isInteger(c.z) && c.z >= 1 && c.z <= ZONE_COUNT) return ZONES[c.z].name;
  return 'Here';
}
const nameOf = (c) => (typeof c.name === 'string' ? c.name : '');

/** The part of the dialog that changes while it is open: the count, the list and the note on what classmates see of the student. */
export function rosterBody(S) {
  const mode = MODES.includes(S.presenceMode) ? S.presenceMode : 'full', full = mode === 'full';
  const mine = esc(String(S.handle || '').trim() || S.nameOf?.(S.pid) || 'Founder');
  if (mode === 'off') return '<p>Your instructor has turned this off.</p>';
  const people = (S.classmates?.() || []).filter((c) => c && typeof c === 'object' && nameOf(c));
  people.sort((a, b) => (a.s === 'away') - (b.s === 'away') || nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' }) || (String(a.pid) < String(b.pid) ? -1 : String(a.pid) > String(b.pid) ? 1 : 0)); // here first, then away; by name, not case-sensitive
  const away = people.filter((c) => c.s === 'away').length, here = people.length - away;
  const rows = people.map((c) => `<tr${c.s === 'away' ? ' class="ro-away"' : ''}><th scope="row">${esc(nameOf(c))}</th><td>${esc(nowOf(c, full))}</td></tr>`).join('');
  const only = full ? '' : ' Your instructor shows who is here, not where.';
  const list = people.length
    ? `<p class="small"><b>${here} here${away ? `, ${away} away` : ''}</b>.${only}</p><table class="tbl ro-tbl"><caption class="sr">Classmates in this room</caption><thead><tr><th scope="col">Classmate</th><th scope="col">Now</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p class="small">No classmates are here yet.${only}</p>`;
  const sees = full ? 'your alias, the district you are in and whether you are here or away' : 'your alias and whether you are here or away';
  return `${list}<p class="small mute gap">You are <b>${mine}</b>. Classmates see ${sees}.</p>`;
}

/** The dialog's markup: a Close, the heading the cursor lands on, and the body. */
export function rosterHTML(S) {
  return `<button class="btn ghost sm x" data-close>Close</button><h2 tabindex="-1" autofocus>Who is here</h2><div id="ro-body">${rosterBody(S)}</div>`;
}

let stopLast = null; // the dialog on screen, if it is this one: asking again lets go of the first

/**
 * Opens the roster in the shared dialog and keeps it up to date while it is open: a burst of news from the room is one redraw, at most once a second. It listens to the session only while the dialog is its own: when
 * it closes, or another dialog has taken its place, it lets go.
 */
export function openRoster({ S, dlg = shared }) {
  stopLast?.();
  let off = null, timer = 0, last = Date.now(), shown = rosterBody(S), done = false;
  const stop = () => { done = true; clearTimeout(timer); timer = 0; off?.(); off = null; if (stopLast === stop) stopLast = null; };
  const draw = () => {
    timer = 0; last = Date.now();
    const box = done || !dlg.el.open ? null : $('#ro-body', dlg.el);
    if (!box) return stop(); // closed, or another dialog is on screen: nothing of ours to keep up
    const html = rosterBody(S);
    if (html !== shown) { box.innerHTML = html; shown = html; }
  };
  stopLast = stop;
  // When the student closes it, the cursor goes back to the Room chip that opened it: the dialog does that itself with the element it was opened from, and the HUD is drawn again often enough that this element may be a copy by then.
  const closed = () => { stop(); if (!dlg.el.open) { try { globalThis.document?.querySelector('[data-act="roster"]')?.focus({ preventScroll: true }); } catch { /* no page to focus in */ } } };
  dlg.open(rosterHTML(S), { label: 'Who is here', onClose: closed });
  off = S.on((type) => { if (!done && !timer && type === 'presence') timer = setTimeout(draw, Math.max(0, EVERY - (Date.now() - last))); });
}
