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
- Wired by `v2/audio-wire` (the shell's side): `shell.js` calls `wireAudio(ctx)` once per mounted game and takes it down in `destroy`; it emits the `ui` events `close-drawer`, `zone` and `lead`
  (`js/ui/audiocues.js`: a baseline first, so a new district or a returning tab rings nothing), reports the Progress rewards as requests, and has the speaker button's act. `js/ui/worldsound.js`
  turns the World's hover, activation, footsteps and camera into `ui` events and plays (`rectOf` gives the stereo pan; `night` the ambient). The HUD has the speaker button and the Draft plays
  `draft.pick`, `ui.refuse` and `draft.begin` itself. The control table in `wire.js` gained the Deal Room's moves, the title's presses, the instructor's ceremonies, the sounds a control
  has of its own (`OWN`) or always gets from its outcome (`QUIET`), the crate box, the disclosure sound and `data-close`; the toast fallback waits 40 ms so the collector's sound is heard first.
- Wired by `v2/audio-deal`: the Deal Room (`js/ui/deal.js`) chooses every move's sound from what the screen shows, says the cause sounds over the page's event bus as `{type:'ui', ui:'deal', what}` (`dealCalls`),
  has its own Sound switch, and marks the buttons that play their own sound `data-snd` (the control table's `dealControl` rows are therefore the fallback for an unmarked deal button, not a second voice); the
  Academy plays `academySounds` (`js/ui/academy-sandbox.js`) at the moments of a lesson.
- One path per trigger, settled at the merge. The room opens with its own `deal.open` (it knows the kind and plays none for a Quick deal), so the dialog observer says nothing for `#dlg.deal`. A buyer clicked with no crate
  ticked is a tick and the toast's nudge: the stock drawer it opens is quiet. A few triggers still make two calls for one sound on purpose, and the engine's same-id cooldown (rank-aware, 120 to 150 ms) admits the first:
  the dock and the drawer's close button (the click, then the shell's `open-drawer`/`close-drawer` event), and a dialog opened or closed by a press (the click, then the dialog observer). Counted in headless Chrome
  against `audio.stats().played`: each of those admits exactly one voice.
- Still not wired: the engine's `kind`/`reason`/`delay`/`pid` fields (the wiring matches the note text and treats a pool sale as immediate until they land); `repair.stop` by precision needs the room's own answer.
