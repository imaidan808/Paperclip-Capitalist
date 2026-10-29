// The public face of the sound layer (docs/AUDIO.md 8.1): `audio` (the one engine of the page), `initAudio` (once, from initDialog), `wireGame` (per mounted game), the settings helpers and
// `legacySfx`, the five names the game has always called (`sfx.kaching()`...). The legacy names are thin aliases: while the wiring is installed they are no-ops for every known call site, so a
// call that has not been migrated yet cannot double an event's sound or contradict it; they play only when no wiring is installed (the Node tests, a page without audio).
import { audio, bindSettings } from './instance.js';
import { initAudio, wireGame, wireAudio, wired, pendingRoom } from './wire.js';

export { audio, bindSettings, initAudio, wireGame, wireAudio, wired, pendingRoom };
export { migrateAudio, mirrorFlat, audioDefaults, audioSettingsHTML, bindAudioSettings, presetOf, applyPreset, joinRoom, leaveRoom, sanitizeAudio, PRESETS, PRESET_NAMES, statusText, audible, whyQuiet, whyDropped, toggleMute, speakerState, syncAudioSettings } from './settings.js';
export { moneySize } from './palette.js';
export { RECIPES, IDS } from './recipes.js';

const alias = (id, opts) => () => { if (wired()) return null; if (audio.state === 'locked') audio.unlock(); return audio.play(id, opts); };
export const legacySfx = {
  kaching: alias('cash.in', { size: 'm' }),
  buzz: alias('ui.refuse'),
  level: alias('quest.complete'),
  blip: alias('ui.ok'),
  alarm: alias('alert.advance', { variant: 'l2' }),
  /** The new way in: any sound by id (`sfx.play('cash.in', { size: 'l' })`). Plays whether or not the wiring is installed. */
  play(id, opts) { if (audio.state === 'locked') audio.unlock(); return audio.play(id, opts); },
};
