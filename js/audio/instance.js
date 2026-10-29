// The one engine of the page (docs/AUDIO.md 7.5: there is one AudioContext for the page's life, however many times a game is mounted). `settings.audio` is read live through `bindSettings`.
import { createAudio } from './engine.js';
import { audioDefaults } from './settings.js';

let ref = null;
const fallback = audioDefaults();
/** common.js hands over its `settings` object once; the engine reads `settings.audio` from it whenever it plays. */
export function bindSettings(settings) { ref = settings; }
export const audio = createAudio({ get: () => (ref && ref.audio) || fallback });
