// The sound settings (docs/AUDIO.md section 7): the model, its migration, the presets and the Sound section of "Accessibility and sound". Pure but for `bindAudioSettings`, which
// touches the dialog it is given. The source of truth is `settings.audio`; the flat keys `sound`, `vol`, `sfxUi`, `sfxGame` and `ambient` mirror it for anything that reads them.

export const AUDIO_V = 1;
export function audioDefaults() {
  return {
    v: AUDIO_V,
    master: 70,        // 0 to 100, step 5. Gain = (master / 100) ** 2, so 70 is -6 dB
    mute: false,
    ui: true,          // interface sounds: clicks, panels, dialogs, toggles, sliders, toasts
    game: true,        // the game and the world: sales, coins, the Deal Room's moves, alerts, progress
    ambient: false,    // the bed. Off until the player turns it on (it is unsolicited)
    ambientLevel: 70,  // 0 to 100, gain = (v / 100) ** 2 on top of the ambient bus
    dial: false,       // the repair dial tone (4.5). Off until the player turns it on
    clockSounds: true, // buyers arriving, the new day, managers' coins, freight arriving, cash settling, a mentor's tip (3.4.5). Off in Classroom
    quiet: false,      // the Classroom rule (3.2): tiny game sounds off, medium and loud 10 dB lower, interface 6 dB lower, ambient, dial and clock sounds off
    touched: false,    // the player has changed a sound setting by hand (stops the automatic Classroom preset), or a saved "sound off" was migrated
    hinted: false,     // the one-time "sound is on" note has been shown
  };
}
const NUM = { master: [0, 100, 5], ambientLevel: [0, 100, 5] };
const BOOL = ['mute', 'ui', 'game', 'ambient', 'dial', 'clockSounds', 'quiet', 'touched', 'hinted'];
function num(v, lo, hi, step, d) { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n / step) * step)) : d; }
/** Clamp every field to its range and drop unknown keys: a saved value is never trusted (numbers to their range and step, booleans only when exactly true or false). */
export function sanitizeAudio(a) {
  const d = audioDefaults(), o = a && typeof a === 'object' ? a : {};
  for (const [k, [lo, hi, step]] of Object.entries(NUM)) d[k] = num(o[k], lo, hi, step, d[k]);
  for (const k of BOOL) if (o[k] === true || o[k] === false) d[k] = o[k];
  return d;
}
export const PRESETS = {
  full: { ui: true, game: true, ambient: false, dial: false, clockSounds: true, quiet: false },
  classroom: { ui: true, game: true, ambient: false, dial: false, clockSounds: false, quiet: true },
  interface: { ui: true, game: false, ambient: false, dial: false, clockSounds: true, quiet: false },
};
export const PRESET_NAMES = { full: 'Full', classroom: 'Classroom (quieter)', interface: 'Interface only', off: 'Off', custom: 'Custom' };
/** Which preset the fields amount to ("custom" when none): the select never stores a preset. The volume does not count: moving it is not leaving a preset. */
export function presetOf(a) {
  if (a.mute) return 'off';
  for (const [name, p] of Object.entries(PRESETS)) if (Object.keys(p).every((k) => a[k] === p[k])) return name;
  return 'custom';
}
/** A preset never unmutes: Full, Classroom and Interface only leave `mute` as it is; Off sets it. Returns a new object. */
export function applyPreset(a, name) {
  const next = { ...a, touched: true };
  if (name === 'off') next.mute = true;
  else if (PRESETS[name]) { Object.assign(next, PRESETS[name]); next.master = 70; }
  return next;
}
/** `?sound=off|quiet|full`, read before the first save and only while `touched` is false. An instructor can put it in the student link. */
function fromAddress(a, search) {
  if (a.touched || !search) return a;
  let v = null;
  try { v = new URLSearchParams(search).get('sound'); } catch { /* not a query string */ }
  if (!v) return a;
  v = v.toLowerCase();
  if (v === 'off') return { ...a, mute: true, touched: true };
  if (v === 'quiet' || v === 'classroom') return { ...applyPreset(a, 'classroom'), touched: true };
  if (v === 'full') return { ...a, touched: true };
  return a;
}
/**
 * Read the sound settings out of the saved `settings` object, whatever it holds (7.1). Pure.
 * 1. `settings.audio` with v === 1: every field clamped. 2. Otherwise the defaults, from the flat keys when they are there; an old `sound: false` becomes `mute` AND `touched`:
 * a player who turned sound off stays silent, and joining a room can never change that. 3. The address, while `touched` is false.
 */
export function migrateAudio(settings, search = '') {
  const s = settings && typeof settings === 'object' ? settings : {};
  let a;
  if (s.audio && typeof s.audio === 'object' && s.audio.v === AUDIO_V) a = sanitizeAudio(s.audio);
  else {
    a = audioDefaults();
    if (typeof s.vol === 'number') a.master = num(s.vol, 0, 100, 5, a.master);
    if (s.sfxUi === false) a.ui = false;
    if (s.sfxGame === false) a.game = false;
    if (s.ambient === true) a.ambient = true;
    if (s.sound === false) { a.mute = true; a.touched = true; }
  }
  return fromAddress(a, search);
}
/** Keep the flat keys in step so anything that reads `settings.sound` still sees the truth. */
export function mirrorFlat(settings) {
  const a = settings.audio;
  settings.sound = !a.mute; settings.vol = a.master; settings.sfxUi = a.ui; settings.sfxGame = a.game; settings.ambient = a.ambient;
  return settings;
}
/** Joining a classroom room: a student who has never touched a sound setting gets the Classroom rule, the earlier values are kept. Returns { next, before } or null. */
export function joinRoom(a) {
  if (a.touched || a.quiet) return null;
  return { before: { ...a }, next: { ...applyPreset(a, 'classroom'), touched: false } };
}
/** Leaving the room puts the earlier values back, unless a sound setting was changed meanwhile (the room's own preset is no longer exactly what is set). */
export function leaveRoom(a, before) {
  if (!before) return a;
  const room = { ...applyPreset(before, 'classroom'), touched: false };
  for (const k of [...Object.keys(NUM), ...BOOL]) if (k !== 'touched' && k !== 'hinted' && a[k] !== room[k]) return a;
  return { ...before, hinted: a.hinted };
}

// ---- the Sound section (7.2)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function statusText(a, state) {
  if (state === 'unsupported') return 'This browser cannot play sound; everything in the game still works.';
  if (a.mute) return 'Sound is off.';
  return state === 'running' ? 'Sound is on. Your browser started audio after your first click.' : 'Sound is on. Your browser starts audio after your first click.';
}
export function audioSettingsHTML(a, state = 'locked') {
  const off = state === 'unsupported' ? ' disabled' : '', q = a.quiet ? ' disabled' : '', chk = (v) => (v ? ' checked' : '');
  const preset = presetOf(a);
  const opt = (v) => `<option value="${v}"${preset === v ? ' selected' : ''}>${PRESET_NAMES[v]}</option>`;
  return `<fieldset class="snd gap"><legend class="h3">Sound</legend>
    <div class="grid g2">
      <div><label for="s-preset">Sound preset</label><select id="s-preset" data-snd="preset"${off}>${['full', 'classroom', 'interface', 'off'].map(opt).join('')}<option value="custom"${preset === 'custom' ? ' selected' : ''} disabled>Custom</option></select></div>
      <div><label for="s-vol">Volume</label><input id="s-vol" type="range" min="0" max="100" step="5" value="${a.master}" data-snd="master" aria-valuetext="${a.master} percent"${off}></div>
    </div>
    <p class="snd-row"><label><input type="checkbox" id="s-mute" data-snd="mute"${chk(a.mute)}${off}> Mute all sound</label></p>
    <p class="snd-row"><label><input type="checkbox" id="s-ui" data-snd="ui"${chk(a.ui)}${off}> Interface sounds (clicks, panels, dialogs)</label></p>
    <p class="snd-row"><label><input type="checkbox" id="s-game" data-snd="game"${chk(a.game)}${off}> Game sounds (sales, coins, alerts, the Deal Room)</label></p>
    <p class="snd-row"><label><input type="checkbox" id="s-clock" data-snd="clockSounds"${chk(a.clockSounds && !a.quiet)}${a.quiet ? ' disabled' : off}> Clock sounds (a buyer arriving, a new day, your managers' coins)</label>${a.quiet ? ' <span class="small mute">Off in Classroom</span>' : ''}</p>
    <p class="snd-row"><label><input type="checkbox" id="s-amb" data-snd="ambient"${chk(a.ambient && !a.quiet)}${a.quiet ? ' disabled' : off}> Background ambience</label> <span class="small mute">${a.quiet ? 'Off in Classroom' : 'Off by default. A quiet bed for each district.'}</span></p>
    <p class="snd-row"><label for="s-ambvol">Ambience level</label> <input id="s-ambvol" type="range" min="0" max="100" step="5" value="${a.ambientLevel}" data-snd="ambientLevel" aria-valuetext="${a.ambientLevel} percent"${a.ambient && !a.quiet ? off : ' disabled'}></p>
    <p class="snd-row"><label><input type="checkbox" id="s-dial" data-snd="dial"${chk(a.dial && !a.quiet)}${a.quiet ? ' disabled' : off}> Repair dial tone</label> <span class="small mute">${a.quiet ? 'Off in Classroom' : 'Hear where the marker is while you time a repair. Off by default.'}</span></p>
    <p><button type="button" class="btn ghost sm" id="s-sample" data-snd-act="sample"${off}>Play a test sound</button></p>
    <p id="s-status" role="status" class="small mute">${esc(statusText(a, state))}</p>
    <p class="small mute">Sound is made in your browser. Nothing is downloaded and nothing is recorded. If you hear nothing, check your device's volume and its silent switch: the browser can be on while the device is silent.</p>
  </fieldset>`;
}
/**
 * Wires the section inside `root`. deps: { audio (the engine), settings, save (applySettings), announce, redraw (re-render the section) }.
 * Every control is a native one with a visible label; every change is stored (`touched`), applied to the engine and said politely.
 */
export function bindAudioSettings(root, deps) {
  const { audio, settings, save, announce } = deps;
  const A = () => settings.audio;
  const set = (patch) => { settings.audio = { ...A(), ...patch, touched: true }; save?.(); };
  const redraw = () => { const sec = root.querySelector('fieldset.snd'); if (sec) { sec.outerHTML = audioSettingsHTML(A(), audio.state); bind(); } };
  function bind() {
    const q = (sel) => root.querySelector(sel);
    const vol = q('#s-vol'), amb = q('#s-ambvol');
    for (const el of root.querySelectorAll('[data-snd]')) {
      const k = el.dataset.snd;
      if (k === 'preset') el.onchange = () => { settings.audio = applyPreset(A(), el.value); save?.(); announce?.(`Sound preset: ${PRESET_NAMES[el.value]}.`); audio.play?.('ui.ok'); redraw(); };
      else if (k === 'master' || k === 'ambientLevel') {
        el.oninput = () => { set({ [k]: num(el.value, 0, 100, 5, 70) }); el.setAttribute('aria-valuetext', `${A()[k]} percent`); audio.play?.('ui.slider', { params: { v: Math.round(A()[k] / 10) } }); };
        el.onchange = () => { audio.play?.('ui.tick', { variant: 'full' }); };
      } else if (el.type === 'checkbox') {
        el.onchange = () => {
          set({ [k]: el.checked });
          if (k === 'mute') announce?.(el.checked ? 'Sound off.' : 'Sound on.');
          if (k === 'mute' && !el.checked) audio.play?.('ui.ok'); else if (k !== 'mute') audio.play?.('ui.toggle', { variant: el.checked ? 'on' : 'off' });
          redraw();
        };
      }
    }
    const btn = q('#s-sample');
    if (btn) btn.onclick = () => { // plays ui.tick, cash.in m and alert.advance 1 in turn, 600 ms apart
      audio.unlock?.();
      audio.play?.('ui.tick', { variant: 'full' });
      setTimeout(() => audio.play?.('cash.in', { size: 'm' }), 600);
      setTimeout(() => audio.play?.('alert.advance', { variant: 'l1' }), 1200);
      announce?.('Played a test sound.');
    };
    void vol; void amb;
  }
  bind();
  const off = audio.on?.((what) => { if (!root.isConnected) { off?.(); return; } if (what === 'state' || what === 'mute') { const st = root.querySelector('#s-status'); if (st) st.textContent = statusText(A(), audio.state); } });
  return { redraw };
}
