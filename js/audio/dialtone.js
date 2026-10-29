// The repair dial tone, seen from the Deal Room (docs/AUDIO.md 4.5, third round): the words, the switch and the rule that tell a player the tone exists. The engine's own `dial` (engine.js) is the
// sound; this file is what the room says about it. Pure (no DOM, no engine), so a Node test builds every line for every state.
//
// Why the room says it itself and does not use a toast: a toast is drawn in `#toasts`, outside the Deal Room's modal sheet, and the sheet and its backdrop are painted over it (measured in
// Chrome: a toast raised while the room is open is a dim ghost half under the sheet), and a polite live region outside a modal dialog is not in the accessibility tree at all (Chrome's reason is
// `activeModalDialog`). So the room carries a line under the dial, a switch beside its Sound toggle and a description on Stop; `announce()` (common.js) speaks inside the open dialog.
import { audible } from './settings.js';

export const DIAL_NAME = 'Repair dial tone';
const CAREFUL = 'Prefer not to time it? Choose Careful: pay more, no timing.';

/**
 * What the room needs to know about the tone, from `settings.audio`: `setting` (the box is ticked), `quiet` (Classroom holds it off), `on` (it will run), `heard` (it will run and be heard) and, when
 * it will run but not be heard, `why` in words with the way out. Never throws, whatever it is given.
 */
export function dialInfo(a) {
  const o = a && typeof a === 'object' ? a : {};
  const setting = o.dial === true, quiet = o.quiet === true, on = setting && !quiet;
  const master = Number.isFinite(+o.master) ? +o.master : 70;
  const why = o.mute === true ? 'sound is off (press Sound)' : !(master > 0) ? 'the volume is at 0' : o.game === false ? 'game sounds are off (see Display and sound)' : '';
  return { setting, quiet, on, heard: on && !why, why };
}

/** The line under the dial in the animated Fix stage: what the tone is and where it is switched on, or what it does now, and always the way that needs no timing. */
export function dialEarText(i) {
  const info = i || dialInfo({});
  if (info.quiet) return `Repair dial tone is off in Classroom. ${CAREFUL}`;
  if (info.on && info.heard) return `Repair dial tone is on: low on the left, high on the right, and brighter inside the green zone. ${CAREFUL}`;
  if (info.on) return `Repair dial tone is on, but you will not hear it because ${info.why}. ${CAREFUL}`;
  return `Prefer to listen? Turn on Repair dial tone with the Dial tone button at the top of this window, or in Display and sound. ${CAREFUL}`;
}

/**
 * The short line: the state of the tone and the way that needs no timing, in a dozen words. Stop is described by it every time the cursor lands on it (Stop takes the cursor at each of the three steps of
 * every repair), and it is the line under the dial after the first repair of a run: the long line (`dialEarText`) is for the first one (fourth round, U9).
 */
export function dialShortText(i) {
  const info = i || dialInfo({});
  const tone = info.quiet ? 'Dial tone is off in Classroom.' : info.on && info.heard ? 'Dial tone is on.' : info.on ? 'Dial tone is on, but you will not hear it.' : 'Dial tone is off.';
  return `${tone} Careful needs no timing.`;
}

/** What is said, politely, when the room opens on its Fix stage with the animated dial: the dial's track is a picture (aria-hidden), so this is how a player who cannot see it learns what to do. */
export function dialAnnounceText(i) {
  const info = i || dialInfo({});
  const tail = info.quiet ? '' : info.on && info.heard ? ' Repair dial tone is on: follow the marker by ear.' : info.on ? '' : ' Or turn on Repair dial tone, with the Dial tone button, to follow it by ear.';
  return `Fix. A marker moves across a bar by itself: press Stop when it is in the green zone. If you cannot see it, choose Careful: pay more, no timing.${tail}`;
}

/**
 * A toggle of the room's header (Sound, Dial tone): the NAME is the words the button shows ("Sound", "Dial tone"), so a player who says them to a voice-control program, or reads them out to a screen
 * reader, finds the same thing (WCAG 2.5.3); the state is `aria-pressed` and a badge ("on", "off") that the name leaves out, and the pressed button looks different (filled edge and a tick) so the two
 * states are not two commands in one style (fourth round, U10). Pure.
 */
export function toggleHTML({ act, fid, name, on, title = '' }) {
  return `<button class="btn ghost sm deal-tog" data-deal="${act}" data-snd data-fid="${fid}" aria-pressed="${!!on}"${title ? ` title="${title}"` : ''}><span class="tn">${name}</span> <span class="tb" aria-hidden="true">${on ? 'on' : 'off'}</span></button>`;
}

/**
 * The room's switch for the tone, beside its Sound toggle (the pattern of that toggle). Only a repair room has a dial, and only until its result is shown. `m.dialInfo` is `dialInfo(settings.audio)` as the
 * session knows it; a model that does not know has the tone off.
 */
export function dialSwitchHTML(m) {
  if (!m || m.kind !== 'repair' || m.stage === 'result') return '';
  const i = m.dialInfo || dialInfo({});
  return toggleHTML({ act: 'dialtone', fid: 'deal-dial', name: 'Dial tone', on: i.on, title: DIAL_NAME });
}

/**
 * The switch's one rule, like `toggleMute`: what the settings, the words and the "ok" are after a press. In Classroom nothing changes and the words say why; otherwise the box flips (and the player
 * has made a sound choice by hand: `touched`). Turning it on while nothing can be heard is said as it is, never as a tone that plays. Returns { next, said, hears, changed }: `hears` is whether the
 * click's own "ok" can be heard.
 */
export function toggleDial(a) {
  const o = a && typeof a === 'object' ? a : {};
  if (o.quiet === true) return { next: o, changed: false, hears: false, said: 'Repair dial tone is off in Classroom. To use it, choose the Full preset under Display and sound.' };
  const dial = o.dial !== true, next = { ...o, dial, touched: true }, i = dialInfo(next);
  const said = !dial ? 'Repair dial tone off.' : i.heard ? 'Repair dial tone on. Low is left, high is right, and the tone brightens in the green zone.' : `Repair dial tone on, but you will not hear it because ${i.why}.`;
  return { next, changed: true, hears: audible({ master: 70, ui: true, game: true, ...next }), said };
}

// ---- once per run: the long announcement (the first Fix stage of a run), remembered for the page's life and, through `kv`, across a reload
const told = { run: null };
/** True the first time it is asked for a run, false after: the first Fix stage says it all, a later repair in the same run does not say it again. `kv` is optional (a private window has none). */
export function tellOnce(kv, run) {
  const key = String(run ?? 'solo');
  if (told.run === key) return false;
  told.run = key;
  let was = null;
  try { was = kv && typeof kv.get === 'function' ? kv.get('dialTold') : null; } catch { was = null; }
  if (was === key) return false;
  try { if (kv && typeof kv.set === 'function') kv.set('dialTold', key); } catch { /* no storage: it will be said once per page load */ }
  return true;
}
/** A test hook. */
export const _resetTold = () => { told.run = null; };
