// Entry point: routes between screens and runs the tick loop. Everything runs in the browser; nothing is sent anywhere
// unless the player joins a classroom room (and then only pseudonymous game numbers).
// Screens: title -> setup (the Background draft) -> academy (first run only) -> game -> debrief; instructor is its own branch.
import { Session, Clock, kv, cleanOwner, describeSave } from './session.js';
import { roomCode, cleanCode } from './net.js';
import { $, esc, delegate, applySettings, initDialog, settingsDialog, dlg, toast } from './ui/common.js';
import { mountDraft, replaceRunHTML } from './ui/draft.js';
import { FOLLOW_NOTE, RECOVER_WAIT_SECONDS } from './ui/room-notes.js';
import { pendingRoom } from './audio/index.js';

// What the title screen and the Draft need is imported above; the screens that need the game (the world and its art, the Academy's sandbox, the instructor's dashboard, the debrief) are loaded the first time
// they open, with import(): the page used to fetch all 135 modules (952 KB gzipped) before it could show a heading. `LOAD` names each by a literal path (scripts/preload.mjs reads them), and the staged page
// asks the browser to fetch the rest once it is idle (`prefetchRest`), so Begin does not wait for the network on a connection that has had a minute.
const LOAD = {
  academy: () => import('./ui/academy.js'),
  game: () => import('./ui/shell.js'),
  instructor: () => import('./ui/instructor.js'),
  debrief: () => import('./ui/debrief.js'),
};
const NEEDS = { academy: ['academy'], game: ['game'], instructor: ['instructor'], debrief: ['debrief'] };
const mods = {}; // the loaded modules, by LOAD's names
const load = (name) => (mods[name] ? Promise.resolve(mods[name]) : LOAD[name]().then((m) => (mods[name] = m)));

const S = new Session();
window.pc = { S }; // handy for classroom demos and debugging in the console
const root = $('#app');
const params = new URLSearchParams(location.search);
let cleanup = null, pending = null;

applySettings();
initDialog();

const TITLES = { title: 'Paperclip Capitalist', setup: 'Draft your build', academy: 'Academy', game: 'The world', instructor: 'Instructor dashboard', debrief: 'Debrief' };

let route = 0;
/**
 * Show a screen. The old one is put away at once; a screen whose modules are not loaded yet waits for them (a short "Loading" note stands in the meantime, read out by a screen reader), and a second `go`
 * while it waits wins (`route`). A screen that is already loaded opens in this call, as it always did.
 */
function go(screen, arg) {
  const mine = ++route;
  try { cleanup?.(); } catch { /* old screen already gone */ }
  cleanup = null;
  root._acts = {};
  dlg.close();
  window.scrollTo(0, 0);
  const need = (NEEDS[screen] || []).filter((n) => !mods[n]);
  if (!need.length) return show(screen, arg, mine);
  root.innerHTML = '<p class="loading mono mute" role="status">Loading&hellip;</p>';
  return Promise.all(need.map(load)).then(() => { if (mine === route) show(screen, arg, mine); }, (e) => {
    console.error(e);
    if (mine !== route) return;
    toast('That screen could not load. Check the connection and try again: you are back at the title, and your run is saved (use Resume).', 'bad', 7000);
    go('title');
  });
}
function show(screen, arg, mine) {
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
function openAcademy(after, only) { pending = { ...(after ? { after } : {}), ...(only ? { only } : {}), resume: freezeClock() }; go('academy'); }

const screens = {
  title() {
    const saved = kv.get('save'), instr = kv.get('instr'), instrKey = instr ? S.recoveryCodeFor(instr.code) : null;
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
          <section class="panel" data-room-panel><h2>Join a classroom</h2><label for="jc">Room code from your instructor</label><input id="jc" maxlength="8" autocomplete="off" style="text-transform:uppercase" value="${esc(room)}">
            <details class="gap"><summary class="small">Relay server (only if your instructor gave you one)</summary><label for="jr" class="gap">Relay URL</label><input id="jr" placeholder="wss://relay.example.edu" value="${esc(relay)}"></details>
            <button class="btn gap" data-act="join">Join</button></section>
          <section class="panel"><h2>Instructor</h2><p class="small mute">Create a room, set the pace, deploy shocks and export grades. With no relay, students join from other tabs of this browser (each tab is its own founder); students on other devices need a relay.</p>
            <label for="ir">Relay URL (optional)</label><input id="ir" placeholder="wss://relay.example.edu" value="${esc(relay)}">
            <div class="row gap"><button class="btn" data-act="instr">Create a room</button>${instr ? `<button class="btn ghost" data-act="instr-resume">Reopen room ${esc(instr.code)}</button>` : ''}</div>
            ${instrKey ? `<details class="gap"><summary class="small">Recovery code for room ${esc(instr.code)}</summary><p class="small mute">Keep it somewhere safe. With the room code it lets you run this room from another device, or after this browser has forgotten it.</p><p class="mono" id="ik-show" tabindex="0">${esc(instrKey)}</p></details>` : ''}
            <details class="gap" id="ires"><summary class="small">Resume as instructor: take back a room (another device, or this browser forgot it)</summary>
              <p class="small mute">A room runs from the browser that made it. To run it from here, enter its room code and the recovery code you saved. The Relay URL above must be the one your students joined with. This dashboard waits about ${RECOVER_WAIT_SECONDS} seconds to hear the class's clock, and starts paused if nobody answers.</p>
              <label for="ic" class="gap">Room code</label><input id="ic" maxlength="8" autocomplete="off" style="text-transform:uppercase" value="${esc(instr?.code || '')}">
              <label for="ik" class="gap">Recovery code</label><input id="ik" autocomplete="off" spellcheck="false" placeholder="xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx">
              <button class="btn ghost gap" data-act="instr-recover">Take the room back</button>
              <p class="tiny mute" id="ires-note">${esc(FOLLOW_NOTE)}</p></details></section>
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
      'instr-recover'() {
        const code = cleanCode($('#ic').value), owner = cleanOwner($('#ik').value);
        if (code.length < 3) { toast('Enter the room code.', 'warn'); return; }
        if (!owner) { toast('The recovery code is 32 letters and digits, in groups of four. Check it and try again.', 'warn'); return; }
        const rl = $('#ir').value.trim(); kv.set('relay', rl);
        startInstructor(code, rl, false, null, owner);
      },
      a11y() { settingsDialog(); },
    });
    $('h1', root).setAttribute('tabindex', '-1');
  },

  // The Background draft: two of twelve, a specialty, an alias. Begin starts the run, then the Academy on a first visit.
  setup() {
    pendingRoom(pending?.room); // a student with a room code is in the room for sound from the Draft on: Begin is pressed by the whole class at once (docs/AUDIO.md 7.1)
    const m = mountDraft(root, S, {
      room: pending?.room,
      handle: S.draftHandle(pending?.room), // (a student tab that is about to be a founder of its own does not start with the alias another founder of this browser last used)
      onBack: () => { pending = null; go('title'); },
      onBegin({ perks, specialty, handle }) {
        const room = pending?.room;
        // A student who joins a room between the tabs of this browser is a founder of their own: this tab takes its own Founder ID and its own saved run (js/identity.js), before the saved run is looked at (it is looked for
        // in this tab's own slot, so the browser's other tabs' runs are never offered for replacing) and before the room is joined (a room hears the ID the tab joins with).
        if (room) S.takeTabIdentity(room);
        const begin = () => {
          if (room) S.joinRoom({ ...room, role: 'student', handle: handle || undefined });
          S.startGame({ perks, specialty, handle });
          pending = null;
          // lessons played from the title screen wait until there is a run to pay (kv 'academyRewards', academy-sandbox.js KEYS.rewards): the Academy's module is loaded for that only when something is waiting
          const next = () => { if (kv.get('academyDone')) enter(); else openAcademy(() => go('game')); };
          if (!kv.get('academyRewards')) { next(); return; }
          load('academy').then((m) => { m.claimPendingRewards(S.game); next(); }, () => next());
        };
        // There is one save slot for a founder, so this writes over the run saved for it (a solo run, or a classroom's): say so first, and name it. Keeping it leaves the draft as it was.
        const old = describeSave(kv.get('save'));
        if (!old) { begin(); return; }
        askReplace(old, room, begin);
        return false; // (the draft's Begin works again; nothing has started)
      },
    });
    cleanup = () => { m.destroy(); if (S.roomInfo?.role !== 'student') pendingRoom(null); }; // leaving the Draft any way but joining (Back) puts the earlier sound settings back
  },

  // The Academy mounts its own sandbox; done or skipped, it is not shown again by itself.
  academy() {
    let live = true;
    const only = pending?.only; // a single lesson to replay (from the Codex), else the whole course
    const finish = () => {
      if (!live) return;
      live = false;
      kv.set('academyDone', true);
      setTimeout(afterAcademy, 0); // never from inside the mount: the router has not stored this screen's cleanup yet
    };
    const m = mods.academy.mountAcademy(root, S, { onDone: finish, onSkip: finish, only });
    cleanup = () => { live = false; if (typeof m === 'function') m(); else m?.destroy?.(); };
  },

  game() {
    if (!S.game) return go('title');
    const m = mods.game.mountGame(root, S, {
      onDebrief: () => go('debrief'),
      onAcademy: (id) => openAcademy(() => go('game'), typeof id === 'string' ? id : undefined),
      onJoin: (room) => { S.reset(); pending = { room }; go('setup'); },
      onReset: () => { S.reset(); pending = null; pendingRoom(null); go('title'); }, // Start over leaves the room for certain: the Classroom rule is given back now, not at the next Draft
    });
    cleanup = () => m.destroy();
  },

  instructor() {
    const m = mods.instructor.mountInstructor(root, S, { onClose: () => { S.leaveRoom(); kv.del('instr'); S.mode = 'solo'; go('title'); } });
    cleanup = () => m.destroy();
  },

  debrief() {
    if (!S.game) return go('title');
    const m = mods.debrief.mountDebrief(root, S, { onBack: () => go('game') });
    cleanup = () => m.destroy();
  },
};

function enter() { go('game'); }

/** Begin would replace the run saved in this browser (docs/ARCHITECTURE.md, "Open decisions"): a dialog that names it, with the safe answer under the cursor. */
function askReplace(old, room, begin) {
  const d = dlg.open(replaceRunHTML(old, room, kv.tab.isOwn() ? 'This tab' : 'This browser'), { label: 'Replace your saved run?' });
  d.querySelector('[data-close]').onclick = () => dlg.close();
  d.querySelector('[data-replace]').onclick = () => { dlg.close(); begin(); };
}

/** `owner`: a recovery code pasted to take a running room back (another device, or storage that was cleared). That room's clock is the class's, not ours, so the session waits to hear it (Session.recovering). */
function startInstructor(code, relay, fresh, saved, owner) {
  const solo = kv.get('save'); // a solo run saved in this browser is not the instructor's to throw away: S.reset() deletes it, so it is put back (Resume your run is still on the title screen after the room closes)
  S.reset();
  if (solo) kv.set('save', solo);
  S.mode = 'instructor';
  if (fresh) S.clock = new Clock({ hour: 0, paused: true, speed: 1 });
  else if (saved) { S.clock = new Clock(saved.clock); Object.assign(S.difficulty, saved.difficulty || {}); S.ghosts = saved.ghosts ?? 36; S.algo = saved.algo ?? true; }
  S.joinRoom({ code, relay, role: 'instructor', handle: 'Instructor', owner, recover: !!owner && !saved });
  kv.set('instr', { code, relay, clock: S.clock.toJSON(), difficulty: S.difficulty, ghosts: S.ghosts, algo: S.algo });
  go('instructor');
  if (fresh) keepRecoveryCode(code);
}
/** A new room: its recovery code is shown once, where it can be copied, because it is the only way back into the room from another device. (The title screen shows it again beside "Reopen room".) */
function keepRecoveryCode(code) {
  const key = S.recoveryCodeFor(code);
  if (!key) return;
  dlg.open(`<h2>Keep your recovery code</h2>
    <p>Room <b class="mono">${esc(code)}</b> belongs to this browser. If you lose this browser, or want to run the room from another device, you need the room code and this recovery code.</p>
    <p class="mono" id="rk" tabindex="0" style="font-size:1.05em;word-break:break-all">${esc(key)}</p>
    <div class="row gap"><button class="btn" data-copy autofocus>Copy it</button><button class="btn ghost" data-close>I have saved it</button></div>`, { label: 'Recovery code' });
  const d = dlg.el;
  d.querySelector('[data-copy]').onclick = () => { try { navigator.clipboard.writeText(key).then(() => toast('Copied.', 'good'), () => toast('Select the code and copy it.', 'warn')); } catch { toast('Select the code and copy it.', 'warn'); } };
  d.querySelector('[data-close]').onclick = () => dlg.close();
}

// ---- the heartbeat
setInterval(() => {
  S.tick();
  kv.tab.touch(); // (a tab that is a founder of its own keeps its claim on the slot fresh, so a copy of the tab is told from a refresh of it: js/identity.js)
  if (S.mode === 'instructor' && S.roomInfo && Date.now() % 5000 < 260) kv.set('instr', { code: S.roomInfo.code, relay: S.roomInfo.relay, clock: S.clock.toJSON(), difficulty: S.difficulty, ghosts: S.ghosts, algo: S.algo });
}, 250);
document.addEventListener('visibilitychange', () => { if (!document.hidden) S.tick(); else S.save(true); });
addEventListener('pagehide', () => { S.save(true); kv.tab.release(); });

// ---- the rest of the game, fetched while the browser is idle
// The staged page (scripts/stage.mjs) lists the modules that only a later screen needs in <script type="application/json" id="pc-lazy">, and does not preload them: the title screen is not held up by
// the world's art, the Academy or the dashboard. Once the page has loaded and the browser has a moment, they are asked for as low-priority module preloads, a few at a time, so by the time the Draft is done
// Begin finds them in the module map. Nothing is fetched on a connection that asks for less data, and the source page (npm start) has no list: there every screen is loaded when it opens.
function prefetchRest() {
  let list = [];
  try { list = JSON.parse(document.getElementById('pc-lazy')?.textContent || '[]'); } catch { list = []; }
  if (!Array.isArray(list) || !list.length || navigator.connection?.saveData) return;
  const idle = (f) => (window.requestIdleCallback ? window.requestIdleCallback(f, { timeout: 2000 }) : setTimeout(f, 300));
  const pump = () => {
    for (const href of list.splice(0, 8)) { const l = document.createElement('link'); l.rel = 'modulepreload'; l.href = href; l.setAttribute('fetchpriority', 'low'); document.head.append(l); }
    if (list.length) idle(pump);
  };
  idle(pump);
}
if (document.readyState === 'complete') prefetchRest(); else addEventListener('load', prefetchRest, { once: true });

// ---- boot
if (S.game == null && kv.get('save') && params.get('resume') === '1') { if (tryResume()) enter(); else go('title'); } else go('title');
