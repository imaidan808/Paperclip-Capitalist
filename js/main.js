// Entry point: routes between screens and runs the tick loop. Everything runs in the browser; nothing is sent anywhere
// unless the player joins a classroom room (and then only pseudonymous game numbers).
import { Session, Clock, kv } from './session.js';
import { roomCode, cleanCode } from './net.js';
import { PROFILES, SKILLS } from './config.js';
import { $, esc, delegate, applySettings, initDialog, settingsDialog, dlg, toast, settings } from './ui/common.js';
import { mountTutorial } from './ui/tutorial.js';
import { mountGame } from './ui/game.js';
import { mountInstructor } from './ui/instructor.js';
import { mountDebrief } from './ui/debrief.js';

const S = new Session();
window.pc = { S }; // handy for classroom demos and debugging in the console
const root = $('#app');
const params = new URLSearchParams(location.search);
let cleanup = null, pending = null;

applySettings();
initDialog();

function go(screen, arg) {
  try { cleanup?.(); } catch { /* old screen already gone */ }
  cleanup = null;
  root._acts = {};
  dlg.close();
  window.scrollTo(0, 0);
  screens[screen](arg);
  root.focus({ preventScroll: true });
  document.title = ({ title: 'Paperclip Capitalist', setup: 'Choose your founder', tutorial: 'Level 0', game: 'Dashboard', instructor: 'Instructor dashboard', debrief: 'Debrief' })[screen] + (screen === 'title' ? '' : ' | Paperclip Capitalist');
}

const screens = {
  title() {
    const saved = kv.get('save'), instr = kv.get('instr');
    const relay = params.get('relay') || kv.get('relay') || '';
    const room = cleanCode(params.get('room'));
    root.innerHTML = `
      <div class="hero">
        <p class="mono mute small" style="margin:0">A 90-day entrepreneurship simulation for higher education</p>
        <h1>PAPERCLIP<br>CAPITALIST</h1>
        <p class="sub">You have one paperclip and a dream. Trade up, hire staff, survive the shocks, and out-think a class full of founders chasing the same obvious deal.</p>
        <div class="row" style="justify-content:center">
          ${saved ? `<button class="btn big" data-act="resume">Resume your run</button>` : ''}
          <button class="btn ${saved ? 'ghost' : ''} big" data-act="solo">${saved ? 'New solo run' : 'Play solo'}</button>
          <button class="btn ghost big" data-act="tut">Try Level 0 (90 seconds)</button>
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
      resume() { if (S.restore()) enter(); else toast('That save could not be read.', 'bad'); },
      solo() { pending = { solo: true }; go('setup'); },
      tut() { pending = { tutorialOnly: true }; go('tutorial'); },
      join() { const code = cleanCode($('#jc').value); if (code.length < 3) { toast('Enter the room code from your instructor.', 'warn'); return; } const rl = $('#jr').value.trim(); kv.set('relay', rl); pending = { room: { code, relay: rl } }; go('setup'); },
      instr() { const rl = $('#ir').value.trim(); kv.set('relay', rl); startInstructor(roomCode(), rl, true); },
      'instr-resume'() { startInstructor(instr.code, instr.relay, false, instr); },
      a11y() { settingsDialog(); },
    });
    $('h1', root).setAttribute('tabindex', '-1');
  },

  setup() {
    const first = !kv.get('tutDone');
    const profiles = Object.values(PROFILES);
    root.innerHTML = `
      <form class="panel" id="sf" style="max-width:62rem;margin:1rem auto" novalidate>
        <h1 tabindex="-1">Choose your founder</h1>
        ${pending?.room ? `<div class="callout">Joining room <b class="mono">${esc(pending.room.code)}</b>. Your run starts on the instructor's clock.</div>` : ''}
        <label for="handle">Alias <span class="mute">(a nickname, never your real name; your instructor sees only this and a random Founder ID)</span></label>
        <input id="handle" maxlength="20" autocomplete="off" value="${esc(S.handle)}" placeholder="e.g. PennyPincher" style="width:min(24rem,100%)">
        <fieldset class="gap" style="border:0;padding:0"><legend class="h2 mono" style="text-transform:uppercase;letter-spacing:.08em;font-size:1.05rem;margin-bottom:.5rem">Starting profile</legend>
          <div class="choices" style="margin:0">${profiles.map((p, i) => `<label class="card pick"><input type="radio" name="prof" value="${p.id}" ${i === 0 ? 'checked' : ''}> <span class="ic" aria-hidden="true">${p.icon}</span> <b>${esc(p.name)}</b><br><span class="small mono gold">${esc(p.start)}</span><p class="small"><span class="green">+</span> ${esc(p.perk)}</p><p class="small"><span class="red">-</span> ${esc(p.flaw)}</p></label>`).join('')}</div></fieldset>
        <fieldset class="gap" style="border:0;padding:0"><legend class="h2 mono" style="text-transform:uppercase;letter-spacing:.08em;font-size:1.05rem;margin-bottom:.5rem">Specialty (starts at level 3)</legend>
          <div class="choices" style="margin:0">${Object.values(SKILLS).map((k, i) => `<label class="card pick"><input type="radio" name="spec" value="${k.id}" ${i === 0 ? 'checked' : ''}> <b>${esc(k.name)}</b><p class="small mute">${esc(k.blurb)}</p></label>`).join('')}</div></fieldset>
        <label class="row gap" style="color:var(--ink)"><input type="checkbox" id="tut" ${first ? 'checked' : ''}> Play Level 0, the Zero-Dollar Hustle, first (about 90 seconds, ungraded)</label>
        <div class="row gap"><button class="btn big" type="submit">Begin</button><button class="btn ghost" type="button" data-act="back">Back</button></div>
      </form>`;
    delegate(root, { back() { go('title'); } });
    $('#sf').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const choice = { profile: f.get('prof'), specialty: f.get('spec'), handle: ($('#handle').value || '').trim().slice(0, 20) };
      const room = pending?.room;
      const begin = () => {
        if (room) S.joinRoom({ ...room, role: 'student', handle: choice.handle || undefined });
        S.startGame(choice);
        enter();
      };
      if ($('#tut').checked) { pending = { ...pending, after: begin }; go('tutorial'); } else begin();
    });
  },

  tutorial() {
    const finish = () => {
      kv.set('tutDone', true);
      if (pending?.after) { const f = pending.after; pending = null; f(); }
      else if (S.game) go('game');
      else go('title');
    };
    cleanup = mountTutorial(root, { onDone: finish, onSkip: finish });
  },

  game() {
    if (!S.game) return go('title');
    const m = mountGame(root, S, {
      onDebrief: () => go('debrief'),
      onTutorial: () => { pending = { after: () => go('game') }; go('tutorial'); },
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
if (S.game == null && kv.get('save') && params.get('resume') === '1') { if (S.restore()) enter(); else go('title'); } else go('title');
