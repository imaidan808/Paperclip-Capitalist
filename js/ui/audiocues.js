// The shell's side of the sound layer (docs/AUDIO.md 4.2, 7.4 and 9). js/audio/wire.js turns events and controls into sounds; this file says to it what only the shell can see, and gives the
// sounds that have no picture of their own a picture or a line for the screen reader ("sound is never the only cue"):
//   render()     the district changed -> { ui: 'zone' }; a buyer is new in the district you are in -> { ui: 'lead', urgent }. Both only after a baseline exists: the first render of a mount, a
//                district change, a rewind, a tab coming back and a clock that is catching up only set the baseline, so no door bell rings for every buyer already there.
//   note(n)      freight arriving and cash settling are read out (a burst of settlements as one line); the mentor's tip becomes an info toast.
//   event(ev)    `insolvent` is a bare event today: it gets the toast (and so the assertive line) the sound would otherwise stand alone for.
//   session()    an offer is read out; a rewind sets the baseline again.
//   hint()       the one-time "sound is on" note of 7.4.
// Announcements go through one queue that speaks at most one line per 700 ms and keeps only the latest of a kind (announce() clears the region and sets it 30 ms later, so two in one tick lose the first).
// Nothing here reads a buyer's `scam`, a lot's truth or anything else the player has not been shown. No timer exists unless a line is waiting to be spoken.
import { noteKind } from '../audio/wire.js';
import { ASSETS } from '../config.js';

export const SPEAK_GAP = 700, URGENT_GAP = 60000, SETTLE_WAIT = 80, STALE_HOURS = 3;
export const HINT_TEXT = 'Sound effects are on. Press M or the speaker button to mute them.';
export const INSOLVENT_TEXT = 'Your net worth has fallen to zero or below.';

/**
 * ctx: the drawer context ({ S, U, g, emit }). deps: { settings, save(), announce(msg), toast(msg, level), supported() (Web Audio exists), now() }. Returns the cue object.
 */
export function createCues(ctx, deps) {
  const { S, U } = ctx, g = () => ctx.g?.();
  const now = deps.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const toast = (m, l) => deps.toast?.(m, l), announce = (m, assertive) => deps.announce?.(m, assertive);
  const queue = [];
  let speakT = null, lastSpoke = -Infinity, dead = false;
  let zone = null, seen = new Set(), lastUrgent = -Infinity;
  let settleN = 0, settleText = '', settleT = null, insolventNoteAt = -Infinity;

  // ---- the polite queue
  function pump() {
    if (dead || speakT != null || !queue.length) return;
    speakT = setTimeout(() => {
      speakT = null;
      const x = queue.shift();
      if (x && !dead) { lastSpoke = now(); announce(x.text, false); }
      pump();
    }, Math.max(0, lastSpoke + SPEAK_GAP - now()));
  }
  /** Say a line politely. A line with the same key that is still waiting is replaced, not repeated. */
  function say(text, key) {
    const i = queue.findIndex((x) => x.key === key);
    if (i >= 0) queue[i].text = text; else queue.push({ text, key });
    pump();
  }

  // ---- the district and the buyers
  const leadList = () => g()?.s?.leads?.[U.zone] || [];
  function baseline() { zone = U.zone; seen = new Set(leadList().map((l) => l.id)); }
  /** Is the engine well behind the clock (a tab coming back, a rewind, a very fast clock)? Then what arrived is not news. */
  function stale() {
    try { const game = g(), clock = S?.clock; return !!(game && clock && !clock.paused && clock.now() - game.s.hour > STALE_HOURS); } catch { return false; }
  }
  /** Can one of the player's sound crates in this district serve the need of this buyer? Only what the player is shown: the buyer's need, a crate's class and whether it is broken. */
  function serves(l) {
    const s = g()?.s; if (!l.need || !s) return false;
    return s.assets.some((a) => a.zone === l.zone && a.cond !== 'broken' && ASSETS[a.cls]?.tags?.includes(l.need));
  }
  function render() {
    if (dead || !g()) return;
    if (zone == null || stale() || (typeof document !== 'undefined' && document.hidden)) { baseline(); return; }
    if (U.zone !== zone) { const id = U.zone; baseline(); ctx.emit({ type: 'ui', ui: 'zone', id }); return; }
    const list = leadList(), fresh = list.filter((l) => !seen.has(l.id));
    seen = new Set(list.map((l) => l.id));
    if (!fresh.length) return;
    const urgent = fresh.find((l) => l.need && serves(l));
    ctx.emit({ type: 'ui', ui: 'lead', zone: U.zone, ids: fresh.map((l) => l.id), urgent: !!urgent });
    if (urgent && now() - lastUrgent >= URGENT_GAP) { lastUrgent = now(); say(`A buyer needs ${/^[aeiou]/.test(urgent.need) ? 'an' : 'a'} ${urgent.need} now.`, 'urgent'); }
  }

  // ---- notes
  function flushSettle() {
    settleT = null;
    if (dead || !settleN) return;
    say(settleN === 1 ? settleText : `${settleN} payments settled.`, 'settle');
    settleN = 0;
  }
  function note(n) {
    if (dead || !n) return;
    const k = noteKind(n);
    if (k === 'insolvent') insolventNoteAt = now();
    else if (k === 'freight-arrive') say(String(n.text), 'freight');
    else if (k === 'settle') { settleN++; settleText = String(n.text); if (settleT == null) settleT = setTimeout(flushSettle, SETTLE_WAIT); }
    else if (k === 'mentor') toast(String(n.text), 'info'); // an info note is only in the ticker, which a more important note hides: the tip gets a toast (and so its own line for the screen reader)
  }
  function event(ev) {
    if (dead || !ev || ev.type !== 'insolvent') return;
    const at = now();
    Promise.resolve().then(() => { if (!dead && Math.abs(insolventNoteAt - at) > 100) toast(INSOLVENT_TEXT, 'bad'); }); // the engine may write the note beside the event, before it or after it in the same step; if it does, that note is the toast
  }
  function session(type, data) {
    if (dead) return;
    if (type === 'rewound') baseline();
    else if (type === 'offer') say(`${(data && data.fromHandle) || 'A classmate'} sent you a swap offer.`, 'offer');
  }

  // ---- the first minute (7.4)
  function hint() {
    const a = deps.settings?.audio;
    if (dead || !a || a.mute || a.hinted || a.quiet || (deps.supported && !deps.supported())) return false;
    if (g()?.sandbox || S?.roomInfo) return false;
    deps.settings.audio = { ...a, hinted: true };
    deps.save?.();
    toast(HINT_TEXT, 'info');
    return true;
  }

  const wake = () => { if (typeof document !== 'undefined' && !document.hidden) baseline(); };
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', wake);
  baseline();
  return {
    render, note, event, session, hint, baseline, say,
    destroy() {
      dead = true;
      if (speakT != null) clearTimeout(speakT);
      if (settleT != null) clearTimeout(settleT);
      speakT = settleT = null; queue.length = 0;
      if (typeof document !== 'undefined' && document.removeEventListener) document.removeEventListener('visibilitychange', wake);
    },
  };
}
