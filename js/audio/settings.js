// The sound settings (docs/AUDIO.md section 7): the model, its migration, the presets and the Sound section of "Accessibility and sound". Pure but for `bindAudioSettings`, which
// touches the dialog it is given. The source of truth is `settings.audio`; the flat keys `sound`, `vol`, `sfxUi`, `sfxGame` and `ambient` mirror it for anything that reads them.

export const AUDIO_V = 1;
// ---- the volume taper and the headroom (docs/AUDIO.md 3.2 and Appendix F, A2)
/** The default volume, in percent of the slider. */
export const DEFAULT_MASTER = 70;
/** The taper of the volume slider and of the ambience slider: gain = (v / 100) ** 1.5. The square it replaced put 5% at -52 dB and 20% at -28 dB (a dead bottom third, below which a tick was inaudible); the power of 1.5 puts them at -39 and -21. */
export const VOLUME_CURVE = 1.5;
export const volumeGain = (v) => (Math.max(0, Math.min(100, Number.isFinite(+v) ? +v : 0)) / 100) ** VOLUME_CURVE;
/**
 * The headroom: a fixed gain between the volume slider and the glue compressor, so that the slider's DEFAULT puts the loud tier exactly at its -3 dBFS ceiling (the level the old chain reached only at
 * 100%) and the slider above the default drives the compressor and the soft clip, which keep the output under -3 dBFS whatever is played. +4.64 dB at the default of 70. The Classroom rule has none:
 * a room is not made louder by it.
 */
export const HEADROOM = 1 / volumeGain(DEFAULT_MASTER);
export const HEADROOM_DB = 20 * Math.log10(HEADROOM);
/** The master gain for the settings: the taper, the headroom (not in Classroom), 0 when muted. */
export const masterGain = (a) => (a.mute ? 0 : volumeGain(a.master) * (a.quiet ? 1 : HEADROOM));
/** The one-time note of the first minute (7.4): in the game, where the speaker button is, and on the title and in the Draft, where there is none yet. */
export const HINT_TEXT = 'Sound effects are on. Press M or the speaker button to mute them.';
export const HINT_PAGE_TEXT = 'Sound effects are on. Press M to mute them, or change them under Display and sound.';
export function audioDefaults() {
  return {
    v: AUDIO_V,
    master: DEFAULT_MASTER, // 0 to 100, step 5. Gain = (master / 100) ** 1.5 times the headroom (+4.6 dB), so 70 is unity and 100 is +4.6 dB (the soft clip keeps it under -3 dBFS)
    mute: false,
    ui: true,          // interface sounds: clicks, panels, dialogs, toggles, sliders, toasts
    game: true,        // the game and the world: sales, coins, the Deal Room's moves, alerts, progress
    ambient: false,    // the bed. Off until the player turns it on (it is unsolicited)
    ambientLevel: 70,  // 0 to 100, gain = (v / 100) ** 1.5 on top of the ambient bus
    dial: false,       // the repair dial tone (4.5). Off until the player turns it on
    clockSounds: true, // buyers arriving, the new day, managers' coins, freight arriving, cash settling, a mentor's tip (3.4.5). Off in Classroom
    quiet: false,      // the Classroom rule (3.2): tiny game sounds off, medium and loud 10 dB lower, interface 6 dB lower, ambient, dial and clock sounds off
    worldTicks: true,  // the world's hover ticks and footsteps (the most frequent game sounds; Calm and Classroom drop them anyway). Off silences those two and nothing else
    mKey: true,        // key M mutes and unmutes (a single-key shortcut needs a way out, WCAG 2.1.4); the speaker button stays
    touched: false,    // the player has changed a sound setting by hand (stops the automatic Classroom preset), or a saved "sound off" was migrated
    hinted: false,     // the one-time "sound is on" note has been shown
  };
}
const NUM = { master: [0, 100, 5], ambientLevel: [0, 100, 5] };
const BOOL = ['mute', 'ui', 'game', 'ambient', 'dial', 'clockSounds', 'quiet', 'worldTicks', 'mKey', 'touched', 'hinted'];
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
/**
 * Off mutes. Every other preset is a request to hear something, so it unmutes: a menu that left Mute on and snapped back to "Off" after the player chose Full was a trap (the only way out was a
 * different control). The volume is the player's own and stays where they put it (a player who turned it down to 30 and chose "Classroom (quieter)" must not get a louder game); only a volume of
 * 0, which would make "Full" silent, goes to 70. Returns a new object.
 */
export function applyPreset(a, name) {
  const next = { ...a, touched: true };
  if (name === 'off') next.mute = true;
  else if (PRESETS[name]) { Object.assign(next, PRESETS[name]); next.mute = false; if (!(next.master > 0)) next.master = 70; }
  return next;
}
/** Can anything be heard at all? Not muted, not at volume 0, and at least one of the two buses on. */
export const audible = (a) => !a.mute && a.master > 0 && (a.ui || a.game);
/**
 * The one switch of the speaker button, key M and the Deal Room's toggle: what the settings, the words and the "ok" are after a press. Pure. It is truthful about what the press does:
 * sound that can be heard is muted; sound that is muted is unmuted, and at volume 0 that is brought back to 70 (the rule of a preset; an "on" that nobody can hear is a broken speaker to the player)
 * and said ("Sound on at 70 percent."); with Interface and Game both off there is nothing to mute and nothing a speaker can turn on, so nothing changes and the words say why.
 * Returns { next, said, hears, changed }: `hears` is whether the "ok" of unmuting can be heard.
 */
export function toggleMute(a) {
  const mute = a.mute === true, master = Number.isFinite(+a.master) ? +a.master : 70, ui = a.ui !== false, game = a.game !== false; // a missing field is the default
  if (!mute && master > 0) {
    if (!ui && !game) return { next: a, said: 'Interface sounds and game sounds are both off. Turn one on under Display and sound.', hears: false, changed: false };
    return { next: { ...a, mute: true, touched: true }, said: 'Sound off.', hears: false, changed: true };
  }
  const raised = !(master > 0), next = { ...a, mute: false, touched: true, master: raised ? 70 : master };
  const said = raised ? 'Sound on at 70 percent.' : !ui && !game ? 'Sound on, but interface sounds and game sounds are both off.' : 'Sound on.';
  return { next, said, hears: ui || game, changed: true };
}
/** The speaker button's state in words: pressed only when something can be heard, and a title that says what a press does (7.3). */
export function speakerState(a) {
  const master = Number.isFinite(+a.master) ? +a.master : 70;
  if (a.mute === true) return { on: false, title: 'Sound is off. Press to turn on (M)' };
  if (!(master > 0)) return { on: false, title: 'Volume is at 0. Press to turn it up (M)' };
  if (a.ui === false && a.game === false) return { on: false, title: 'Interface sounds and game sounds are both off (Display and sound)' };
  return { on: true, title: 'Sound is on. Press to mute (M)' };
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
/** Below this volume (percent) the status line says so: the taper puts 20% at -21 dB, which a laptop at a typical system volume does not play as more than a whisper. */
export const VERY_QUIET = 25;
/** What is true about the sound right now, in words: it never says "on" for a state in which nothing can be heard. */
export function statusText(a, state) {
  if (state === 'unsupported') return 'This browser cannot play sound; everything in the game still works.';
  if (a.mute) return 'Sound is off.';
  if (a.master <= 0) return 'Volume is at 0: you will hear nothing.';
  if (!a.ui && !a.game) return 'Interface sounds and game sounds are both off: you will hear nothing.';
  const quiet = a.master < VERY_QUIET ? ` The volume is very quiet (${a.master} percent): raise it if you hear little.` : '';
  const on = (state === 'running' ? 'Sound is on. Your browser started audio after your first click.' : 'Sound is on. Your browser starts audio after your first click.') + quiet;
  return a.game ? (a.ui ? on : on + ' Interface sounds are off.') : on + ' Game sounds are off: coins and alerts are silent.';
}
/** The helper line beside a row: why it is off, or what it does. */
function note(key, a) {
  const muted = a.mute ? 'Muted.' : '';
  if (key === 'ui' || key === 'game' || key === 'world') return muted + (key === 'world' && a.quiet ? ' Off in Classroom.' : '');
  if (a.quiet) return 'Off in Classroom.';
  if (a.mute) return 'Muted.';
  return { clock: '', amb: 'Off by default. A quiet bed for each district.', dial: 'Hear where the marker is while you time a repair. Off by default.' }[key] ?? '';
}
/** Every control's state, in one place, so the markup and the in-place update below can never disagree. */
function controls(a, state) {
  const off = state === 'unsupported', q = !!a.quiet;
  return {
    's-preset': { value: presetOf(a), disabled: off },
    's-vol': { value: String(a.master), disabled: off },
    's-mute': { checked: !!a.mute, disabled: off },
    's-ui': { checked: !!a.ui, disabled: off },
    's-game': { checked: !!a.game, disabled: off },
    's-world': { checked: !!a.worldTicks && !q, disabled: off || q || !a.game },
    's-clock': { checked: !!a.clockSounds && !q, disabled: off || q },
    's-amb': { checked: !!a.ambient && !q, disabled: off || q },
    's-ambvol': { value: String(a.ambientLevel), disabled: off || !(a.ambient && !q) },
    's-dial': { checked: !!a.dial && !q, disabled: off || q || !a.game },
    's-mkey': { checked: a.mKey !== false, disabled: off },
    's-sample': { disabled: off },
  };
}
const NOTE_FOR = { 's-ui': 'ui', 's-game': 'game', 's-world': 'world', 's-clock': 'clock', 's-amb': 'amb', 's-dial': 'dial' };
const noteOf = (id, a) => (NOTE_FOR[id] ? note(NOTE_FOR[id], a) : '');
export function audioSettingsHTML(a, state = 'locked') {
  const C = controls(a, state), dis = (id) => (C[id].disabled ? ' disabled' : ''), chk = (id) => (C[id].checked ? ' checked' : '');
  const preset = C['s-preset'].value;
  const opt = (v) => `<option value="${v}"${preset === v ? ' selected' : ''}>${PRESET_NAMES[v]}</option>`;
  const hint = (id) => `<span class="small mute" id="${id}-h" data-h="${id}">${esc(noteOf(id, a))}</span>`;
  const row = (id, key, label) => `<p class="snd-row"><label><input type="checkbox" id="${id}" data-snd="${key}"${chk(id)}${dis(id)} aria-describedby="${id}-h"> ${label}</label> ${hint(id)}</p>`;
  return `<fieldset class="snd gap"><legend class="h3">Sound</legend>
    <div class="grid g2">
      <div><label for="s-preset">Sound preset</label><select id="s-preset" data-snd="preset"${dis('s-preset')}>${['full', 'classroom', 'interface', 'off'].map(opt).join('')}${preset === 'custom' ? '<option value="custom" selected>Custom (your own mix)</option>' : ''}</select></div>
      <div><label for="s-vol">Volume</label><input id="s-vol" type="range" min="0" max="100" step="5" value="${a.master}" data-snd="master" aria-valuetext="${a.master} percent"${dis('s-vol')}></div>
    </div>
    <p class="snd-row"><label><input type="checkbox" id="s-mute" data-snd="mute"${chk('s-mute')}${dis('s-mute')}> Mute all sound</label></p>
    ${row('s-ui', 'ui', 'Interface sounds (clicks, panels, dialogs)')}
    ${row('s-game', 'game', 'Game sounds (sales, coins, alerts, the Deal Room)')}
    ${row('s-world', 'worldTicks', 'World sounds (hover ticks and footsteps)')}
    ${row('s-clock', 'clockSounds', "Clock sounds (a buyer arriving, a new day, your managers' coins)")}
    ${row('s-amb', 'ambient', 'Background ambience')}
    <p class="snd-row"><label for="s-ambvol">Ambience level</label> <input id="s-ambvol" type="range" min="0" max="100" step="5" value="${a.ambientLevel}" data-snd="ambientLevel" aria-valuetext="${a.ambientLevel} percent"${dis('s-ambvol')}></p>
    ${row('s-dial', 'dial', 'Repair dial tone')}
    <p class="snd-row"><label><input type="checkbox" id="s-mkey" data-snd="mKey"${chk('s-mkey')}${dis('s-mkey')}> Keyboard shortcut: M mutes and unmutes</label></p>
    <p><button type="button" class="btn ghost sm" id="s-sample" data-snd-act="sample"${dis('s-sample')}>Play a test sound</button></p>
    <p id="s-status" role="status" class="small mute">${esc(statusText(a, state))}</p>
    <p class="small mute">Sound is made in your browser. Nothing is downloaded and nothing is recorded. If you hear nothing, check your device's volume and its silent switch: the browser can be on while the device is silent.</p>
  </fieldset>`;
}
/** Bring the controls already on the page to the settings, without replacing a single element: the control with the cursor keeps it (replacing the section dropped the cursor to the page). */
export function syncAudioSettings(root, a, state = 'locked') {
  const sec = root.querySelector('fieldset.snd'); if (!sec) return;
  const C = controls(a, state);
  for (const [id, c] of Object.entries(C)) {
    const el = sec.querySelector('#' + id); if (!el) continue;
    if ('checked' in c && el.checked !== c.checked) el.checked = c.checked;
    if ('value' in c && el.value !== c.value && id !== 's-preset') el.value = c.value;
    if (el.disabled !== c.disabled) el.disabled = c.disabled;
    if (id === 's-vol' || id === 's-ambvol') el.setAttribute('aria-valuetext', `${c.value} percent`);
  }
  const pre = sec.querySelector('#s-preset');
  if (pre) { // the Custom entry exists only while the mix is custom
    const custom = C['s-preset'].value === 'custom', has = pre.querySelector('option[value="custom"]');
    if (custom && !has) { const o = pre.ownerDocument.createElement('option'); o.value = 'custom'; o.textContent = 'Custom (your own mix)'; pre.appendChild(o); }
    else if (!custom && has) has.remove();
    pre.value = C['s-preset'].value;
  }
  for (const h of sec.querySelectorAll('[data-h]')) { const t = noteOf(h.dataset.h, a); if (h.textContent !== t) h.textContent = t; }
  const st = sec.querySelector('#s-status'); if (st) { const t = statusText(a, state); if (st.textContent !== t) st.textContent = t; }
}
/** What the test button says when it cannot make a sound. */
export function whyQuiet(a) {
  if (a.mute) return 'Sound is muted: turn it on to hear the test.';
  if (a.master <= 0) return 'Volume is at 0: raise it to hear the test.';
  if (!a.ui && !a.game) return 'Interface sounds and game sounds are both off: switch one on to hear the test.';
  return '';
}
/**
 * Why a press on the audition page, or any play, was not heard: the engine's drop reason (`audio.stats().dropped`) in words, from the settings that caused it. Used by dev/sounds.js; a person
 * who presses a card and hears nothing is told which rule held it back, and never has to guess that the button or the sound is broken.
 */
export function whyDropped(reason, a, info = {}) {
  const bus = info.bus === 'ui' ? 'Interface' : 'Game';
  switch (reason) {
    case 'mute': return a.mute ? 'Mute is on.' : 'Volume is at 0.';
    case 'bus': return (info.id === 'world.hover' || info.id === 'world.step') && a.worldTicks === false ? 'World ticks are off.' : `${bus} sounds are off.`;
    case 'quiet': return 'The Classroom rule leaves out tiny game sounds.';
    case 'locked': return 'The audio engine is not running yet (press anywhere once), or the tab is hidden.';
    case 'bucket': return 'Too many sounds in the last moment; wait a second.';
    case 'cooldown': return 'The same sound just played (its cooldown, or a refusal repeated within 2 seconds).';
    case 'cap': return 'Twelve sounds are already playing.';
    case 'osc': return 'Too many oscillators are alive at once.';
    default: return reason ? `The engine held it back (${reason}).` : 'The engine returned nothing.';
  }
}
/** The test sound: a click, then the warning, then coins, so the last thing heard is the good one. */
export const TEST_STEPS = [[0, 'ui.tick', { variant: 'full' }], [600, 'alert.advance', { variant: 'l1' }], [1300, 'cash.in', { size: 'm' }]];
export const TEST_MS = 1300 + 900;
/**
 * Wires the section inside `root`. deps: { audio (the engine), settings, save (applySettings), announce }.
 * Every control is a native one with a visible label; every change is stored (`touched`), applied to the engine and said politely. A change updates the controls in place, a slider changes the
 * engine's gain while the thumb moves and is stored (and the page redrawn) once, when it is let go.
 */
export function bindAudioSettings(root, deps) {
  const { audio, settings, save, announce } = deps;
  const A = () => settings.audio;
  const set = (patch, store = true) => { settings.audio = { ...A(), ...patch, touched: true }; if (store) save?.(); else audio.sync?.(); };
  const refresh = () => syncAudioSettings(root, A(), audio.state);
  let testing = false;
  for (const el of root.querySelectorAll('[data-snd]')) {
    const k = el.dataset.snd;
    if (k === 'preset') el.onchange = () => {
      if (el.value === 'custom') return; // naming the current mix is not a change
      settings.audio = applyPreset(A(), el.value); save?.();
      const p = presetOf(A());
      announce?.(`Sound preset: ${PRESET_NAMES[p]}.${p === 'off' ? '' : ' Sound is on.'}`);
      audio.play?.('ui.ok'); refresh();
    };
    else if (k === 'master' || k === 'ambientLevel') {
      el.oninput = () => { set({ [k]: num(el.value, 0, 100, 5, 70) }, false); el.setAttribute('aria-valuetext', `${A()[k]} percent`); refresh(); audio.play?.('ui.slider', { params: { v: Math.round(A()[k] / 10) } }); };
      el.onchange = () => { save?.(); audio.play?.('ui.tick', { variant: 'full' }); refresh(); };
    } else if (el.type === 'checkbox') {
      el.onchange = () => {
        set({ [k]: el.checked });
        if (k === 'mute') announce?.(el.checked ? 'Sound off.' : 'Sound on.');
        if (k === 'mute' && !el.checked) audio.play?.('ui.ok'); else if (k !== 'mute') audio.play?.('ui.toggle', { variant: el.checked ? 'on' : 'off' });
        refresh();
      };
    }
  }
  const btn = root.querySelector('#s-sample');
  if (btn) btn.onclick = () => {
    if (testing) return; // a second press while the first is playing would stack the three sounds on each other
    audio.unlock?.();
    const a = A(), why = whyQuiet(a);
    if (why) { announce?.(why); return; }
    testing = true;
    announce?.(a.game ? 'Playing a test: a click, a warning, then coins.' : 'Playing a test click. Game sounds are off, so the warning and the coins are silent.');
    for (const [ms, id, o] of TEST_STEPS) setTimeout(() => audio.play?.(id, o), ms);
    setTimeout(() => { testing = false; }, TEST_MS);
  };
  // Key M, the speaker button and the Deal Room's switch change the settings while the section is open: every control follows, not only the status line (a Mute box that stayed unchecked under
  // "Sound is off." made the next click on it do the opposite of what it said)
  const off = audio.on?.((what) => { if (!root.isConnected) { off?.(); return; } if (what === 'state' || what === 'mute' || what === 'settings') refresh(); });
  return { redraw: refresh };
}
