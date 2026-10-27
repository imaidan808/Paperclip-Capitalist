// Entry point: routes between screens and runs the tick loop. Everything runs in the browser; nothing is sent anywhere
// unless the player joins a classroom room (and then only pseudonymous game numbers).
// Screens: title -> setup (the Background draft) -> academy (first run only) -> game -> debrief; instructor is its own branch.
import { Session, Clock, kv } from './session.js';
import { roomCode, cleanCode } from './net.js';
import { $, esc, delegate, applySettings, initDialog, settingsDialog, dlg, toast } from './ui/common.js';
import { mountDraft } from './ui/draft.js';
import { mountAcademy } from './ui/academy.js';
import { mountGame } from './ui/shell.js';
import { mountInstructor } from './ui/instructor.js';
import { mountDebrief } from './ui/debrief.js';

const S = new Session();
window.pc = { S }; // handy for classroom demos and debugging in the console
const root = $('#app');
const params = new URLSearchParams(location.search);
let cleanup = null, pending = null;

applySettings();
initDialog();

const TITLES = { title: 'Paperclip Capitalist', setup: 'Draft your build', academy: 'Academy', game: 'The world', instructor: 'Instructor dashboard', debrief: 'Debrief' };

let route = 0;
function go(screen, arg) {
  const mine = ++route;
  try { cleanup?.(); } catch { /* old screen already gone */ }
  cleanup = null;
  root._acts = {};
  dlg.close();
  window.scrollTo(0, 0);
  try { screens[screen](arg); } catch (e) {
    console.error(e);
    if (screen === 'title') throw e;
    toast('That screen could not open, so you are back at the title. Your run is saved: use Resume.', 'bad', 7000);
    return go('title');
  }
  if (mine !== route) return; // the screen sent the player somewhere else (a game with no run goes back to the title)
  root.focus({ preventScroll: true });
  document.title = TITLES[screen] + (screen === 'title' ? '' : ' | Paperclip Capitalist');
}

/** A saved run, if it can be played: a save from the first version of the game has a different shape and is cleared with a note. */
function tryResume() {
  let ok = false;
  try { ok = S.restore(); } catch { ok = false; }
  if (ok && S.game?.s?.v !== 2) { S.reset(); toast('That save is from an older version of the game and cannot be resumed. Start a new run.', 'warn', 7000); return false; }
  if (!ok) toast('That save could not be read.', 'bad');
  return ok;
}

/** The Academy is a sandbox of its own, so a solo run's clock waits while it plays. Returns true when it paused the clock (and so must resume it). */
function freezeClock() {
  if (S.game && S.mode === 'solo' && !S.clock.paused) { S.setPaused(true); return true; }
  return false;
}
function afterAcademy() {
  const p = pending;
  pending = null;
  if (p?.resume && S.game && S.mode === 'solo') S.setPaused(false);
  if (p?.after) p.after(); else if (S.game) go('game'); else go('title');
}
function openAcademy(after) { pending = { ...(after ? { after } : {}), resume: freezeClock() }; go('academy'); }

const screens = {
  title() {
    const saved = kv.get('save'), instr = kv.get('instr');
    const relay = params.get('relay') || kv.get('relay') || '';
    const room = cleanCode(params.get('room'));
    const academyDone = !!kv.get('academyDone');
    root.innerHTML = `
      <div class="hero">
        <p class="mono mute small" style="margin:0">A 90-day entrepreneurship simulation for higher education</p>
        <h1>PAPERCLIP<br>CAPITALIST</h1>
        <p class="sub">Everyone starts with one paperclip and $0. Draft two of twelve Backgrounds, trade your way up through sixteen districts, play the deals yourself in the skill games, survive the shocks, and out-think a class full of founders chasing the same obvious deal.</p>
        <ul class="sc-facts" aria-label="What is in the game"><li><b>1</b> paperclip, <b>$0</b></li><li><b>12</b> Backgrounds</li><li><b>16</b> districts</li><li><b>5</b> skill games</li><li><b>10</b> Academy missions</li></ul>
        <div class="row" style="justify-content:center">
          ${saved ? `<button class="btn big" data-act="resume">Resume your run</button>` : ''}
          <button class="btn ${saved ? 'ghost' : ''} big" data-act="solo">${saved ? 'New solo run' : 'Play solo'}</button>
          <button class="btn ghost big" data-act="academy">${academyDone ? 'Replay the Academy' : 'Try the Academy (10 short missions)'}</button>
        </div>
        <div class="choices">
          <section class="panel"><h2>Join a classroom</h2><label for="jc">Room code from your instructor</label><input id="jc" maxlength="8" autocomplete="off" style="text-transform:uppercase" value="${esc(room)}">
            <details class="gap"><summary class="small">Relay server (only if your instructor gave you one)</summary><label for="jr" class="gap">Relay URL</label><input id="jr" placeholder="wss://relay.example.edu" value="${esc(relay)}"></details>
            <button class="btn gap" data-act="join">Join</button></section>
          <section class="panel"><h2>Instructor</h2><p class="small mute">Create a room, set the pace, deploy shocks and export grades. Students on the same browser can join as extra tabs; add a relay for real classes.</p>
            <label for="ir">Relay URL (optional)</label><input id="ir" placeholder="wss://relay.example.edu" value="${esc(relay)}">
            <div class="row gap"><button class="btn" data-act="instr">Create a room</button>${instr ? `<button class="btn ghost" data-act="instr-resume">Reopen room ${esc(instr.code)}</button>` : ''}</div></section>
          <section class="panel"><h2>Accessible by design</h2><p class="small mute">Keyboard-only play, screen-reader announcements, high contrast, reduced motion and adjustable text. No account, no tracking, no personal data.</p><button class="btn ghost" data-act="a11y">Display and sound settings</button></section>
        </div>
      </div>`;
    delegate(root, {
      resume() { if (tryResume()) enter(); else go('title'); },
      solo() { pending = { solo: true }; go('setup'); },
      academy() { openAcademy(() => go('title')); },
      join() { const code = cleanCode($('#jc').value); if (code.length < 3) { toast('Enter the room code from your instructor.', 'warn'); return; } const rl = $('#jr').value.trim(); kv.set('relay', rl); pending = { room: { code, relay: rl } }; go('setup'); },
      instr() { const rl = $('#ir').value.trim(); kv.set('relay', rl); startInstructor(roomCode(), rl, true); },
      'instr-resume'() { startInstructor(instr.code, instr.relay, false, instr); },
      a11y() { settingsDialog(); },
    });
    $('h1', root).setAttribute('tabindex', '-1');
  },

  // The Background draft: two of twelve, a specialty, an alias. Begin starts the run, then the Academy on a first visit.
  setup() {
    const m = mountDraft(root, S, {
      room: pending?.room,
      onBack: () => { pending = null; go('title'); },
      onBegin({ perks, specialty, handle }) {
        const room = pending?.room;
        if (room) S.joinRoom({ ...room, role: 'student', handle: handle || undefined });
        S.startGame({ perks, specialty, handle });
        pending = null;
        if (kv.get('academyDone')) enter(); else openAcademy(() => go('game'));
      },
    });
    cleanup = () => m.destroy();
  },

  // The Academy mounts its own sandbox; done or skipped, it is not shown again by itself.
  academy() {
    let live = true;
    const finish = () => {
      if (!live) return;
      live = false;
      kv.set('academyDone', true);
      setTimeout(afterAcademy, 0); // never from inside the mount: the router has not stored this screen's cleanup yet
    };
    const m = mountAcademy(root, S, { onDone: finish, onSkip: finish });
    cleanup = () => { live = false; if (typeof m === 'function') m(); else m?.destroy?.(); };
  },

  game() {
    if (!S.game) return go('title');
    const m = mountGame(root, S, {
      onDebrief: () => go('debrief'),
      onAcademy: () => openAcademy(() => go('game')),
      onJoin: (room) => { S.reset(); pending = { room }; go('setup'); },
      onReset: () => { S.reset(); pending = null; go('title'); },
    });
    cleanup = () => m.destroy();
  },

  instructor() {
    const m = mountInstructor(root, S, { onClose: () => { S.leaveRoom(); kv.del('instr'); S.mode = 'solo'; go('title'); } });
    cleanup = () => m.destroy();
  },

  debrief() {
    if (!S.game) return go('title');
    const m = mountDebrief(root, S, { onBack: () => go('game') });
    cleanup = () => m.destroy();
  },
};

function enter() { go('game'); }

function startInstructor(code, relay, fresh, saved) {
  S.reset();
  S.mode = 'instructor';
  if (fresh) S.clock = new Clock({ hour: 0, paused: true, speed: 1 });
  else if (saved) { S.clock = new Clock(saved.clock); Object.assign(S.difficulty, saved.difficulty || {}); S.ghosts = saved.ghosts ?? 36; S.algo = saved.algo ?? true; }
  S.joinRoom({ code, relay, role: 'instructor', handle: 'Instructor' });
  kv.set('instr', { code, relay, clock: S.clock.toJSON(), difficulty: S.difficulty, ghosts: S.ghosts, algo: S.algo });
  go('instructor');
}

// ---- the heartbeat
setInterval(() => {
  S.tick();
  if (S.mode === 'instructor' && S.roomInfo && Date.now() % 5000 < 260) kv.set('instr', { code: S.roomInfo.code, relay: S.roomInfo.relay, clock: S.clock.toJSON(), difficulty: S.difficulty, ghosts: S.ghosts, algo: S.algo });
}, 250);
document.addEventListener('visibilitychange', () => { if (!document.hidden) S.tick(); else S.save(true); });
addEventListener('pagehide', () => S.save(true));

// ---- boot
if (S.game == null && kv.get('save') && params.get('resume') === '1') { if (tryResume()) enter(); else go('title'); } else go('title');
