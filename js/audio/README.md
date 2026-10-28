# js/audio: the sound layer

Everything is generated in the browser with the Web Audio API. There are no audio files, so the site stays a static folder with no build step. The contract is `docs/AUDIO.md`;
this file says how it is built and where the engine chose differently from the document.

| File | What |
|---|---|
| `palette.js` | the key (D major pentatonic), the shared noise, the layer renderer (`voice`), the instruments (marimba, glass, bell, coin, wood, thump, paper, swoosh, stamp, brass, horn, click, sparkle, the mid `body` of a refusal), `moneySize`, the master chain and its soft clip |
| `recipes.js` | the 90 ids and 188 variants as data (`RECIPES`), with class, player flag, rank and cooldown tables; trims come from `trims.js` |
| `trims.js` | calibrated trims in dB, written by `node scripts/audio-check.mjs --calibrate --pools`; never edited by hand |
| `ambient.js` | the 16 beds, 4 modifiers, 18 one-shots, and the controller (crossfade, night/rain/wealth, one timer chain, the rate rule) |
| `resolve.js` | the collector's resolver (two sentences per burst, the reward budget, merges), the clock gates, state sounds, the hold, catch-up. Pure |
| `engine.js` | `createAudio()`: the context, buses and chain, voices and stealing, rank-aware cooldowns, token buckets, ducking, the ambient bed, the dial tone, hidden-tab and idle handling |
| `settings.js` | `settings.audio`: defaults, migration, presets, the Sound section of the settings dialog |
| `wire.js` | `initAudio()` (page-wide), `wireGame(ctx)` (per game), `wireAudio(ctx)` (both), and the pure tables `eventCalls`, `noteCalls`, `uiCalls`, `dealCalls`, `controlFor` |
| `instance.js`, `index.js` | the one engine of the page; the public face and `legacySfx` |

Checks: `node --test tests/audio.test.mjs` (no browser; a recording fake context) and `npm run audio` (renders every sound offline in headless Chrome and holds the levels, peaks, DC, clipping,
lengths, brightness, the mid body, the ladders, the beds and the tier gaps through the master chain). `/dev/sounds.html` is the page to listen on.

## Where this differs from, or settles, the document

- Settings live in `settings.audio` (7.1). The flat keys `sound`, `vol`, `sfxUi`, `sfxGame` and `ambient` mirror it (`mirrorFlat`), and an old save with only those is migrated.
- `moneySize` uses the table's thresholds ($41, $1,780, $75,000), not the log formula in the prototype (they differ by under 1%; the table is what the tests quote).
- The legacy `sfx.*` names become no-ops only while a game is wired (`wireGame`), not as soon as `initAudio()` has run, so the title and the draft keep their sounds until the shell calls `wireGame`.
- Pool members are calibrated one by one (`id#variant@k` in `trims.js`): the pitch of a pool member changes how loud it reads.
- The body of the refusal and loss family uses a sine D4 (A3 is 220 Hz, under the 250 Hz line) and a knock at 440 Hz; every variant of the family measures at least 40% above 250 Hz.
- The queued moment is played by scheduling it after the current one (never later than 500 ms), not by a timer.
- Not wired here (other tracks): the shell's `wireGame` call, the HUD speaker button, the Deal Room's `ui:'deal'` emissions and Sound toggle, the engine's `kind`/`reason`/`delay`/`pid` fields, `world.rectOf`
  for pan, the six counterpart announcements of section 9. Each degrades to the text of the note or to a centered sound until it lands.
