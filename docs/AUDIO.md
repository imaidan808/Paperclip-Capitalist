# Paperclip Capitalist: audio design

The contract for the sound layer: what plays, when, how loud, in what key, with what controls, and how to prove it. It is written against `main` at 52340f0 (branch `v2/audio-design`). Nothing in `js/` or `css/` has changed yet; this document and the prototype under `dev/audio-proto/` are the whole change.

**Everything is generated in the browser** with the Web Audio API (oscillators, shared noise buffers, biquad filters, gains). There are no audio files to ship, so the site stays a static GitHub Pages folder with no build step.

Contents: 0 what is verified; 1 principles; 2 the palette and the scale; 3 the mixer; 4 the sound map, with every event and every control; 5 what is silent; 6 the ambient bed; 7 settings and controls; 8 the engine API; 9 never the only cue; 10 the test plan; 11 hand-off; Appendix A levels and trims; Appendix B the prototype.

## 0. What is verified and what is not

The recipes in this document are not prose only. `dev/audio-proto/` holds every one of them as data (`sounds.js`, `ambient.js`) and a small synth (`synth.js`). `node dev/audio-proto/run.mjs` renders all of them offline in headless Chrome and `node dev/audio-proto/audit.mjs` checks the data. Every number below that looks measured was measured that way, on this machine, at 48 kHz.

| Checked by program (and held by the test plan, section 10) | |
|---|---|
| Level | every sound is trimmed to its tier's level (K-weighted active level, section 3.2); all 189 variants land on target except 8 loud ones held up to 1.6 dB under it by the peak ceiling |
| Peak | no single sound peaks above -5 dBFS before the buses; the worst pile-up measured (the 12 loudest sounds at once) peaks at -4.1 dBFS after the master chain, and the chain can never pass -3 dBFS |
| Key | every fundamental and every glide end is a note of D major pentatonic; no raw frequencies in a recipe |
| Direction | 50 sounds were checked to rise (28) or fall (22) by at least 1.5 semitones as intended, and in each of 14 gain and loss pairs the gain is brighter (higher spectral centroid) than its twin |
| Size ladders | small to extra large cash, warning level 1 to 3, common to epic achievement, district tier 1 to 4: each step is longer than the one before |
| Clean edges | no sound is still audible (above -50 dBFS) at its declared end, none has a step larger than 0.25 of full scale, no DC offset above 0.002, no NaN |
| Gentle tops | the brightest sound has a spectral centroid of 5695 Hz; nothing has a partial above 6 kHz |
| Cost | the median sound is 8 oscillators; the largest (`run.end` done) is 113 for about three seconds |
| Distinct | no two sounds of different ids have a spectral fingerprint closer than 2.8 dB RMS (the closest pair, a crate tick and the haggle "hold" tap, differ by a thump). While this was being drawn the check found two identical sounds and a pair at 0.7 dB; they were redrawn |
| Audition page | `dev/audio-proto/audition.html` plays all 255 buttons (189 variants, 18 ambient one-shots, 48 bed and weather cases) with no console error |

| NOT verified: needs a person with headphones and with laptop speakers | |
|---|---|
| Taste | whether a recipe sounds like the thing it is named for (a coin, a gavel, a door bell). The layer balance of each sound was checked by program (no tone or bank layer sits more than 18 dB under its mix; 42 noise-texture layers sit 26 to 36 dB under theirs by RMS, which is normal for a click, and are listed in section 10), not by ear |
| Fatigue | whether the frequent sounds stay pleasant over a 90-minute class; whether the ambient bed is welcome at 20 minutes |
| Other engines | Safari and Firefox render the compressor and biquads slightly differently from Chrome. The soft clip at the end of the master chain makes the peak ceiling engine-independent; loudness may differ by a dB or two |
| Speakers | laptop speakers cannot reproduce anything under about 150 Hz. The low thumps are felt on good speakers and merely absent on small ones; no sound depends on them to be understood |

Use the audition page for the first listen: `npm start`, then open `/dev/audio-proto/audition.html`.

## 1. Principles, and where each one is built

| Principle | Built as |
|---|---|
| 1. Meaning before style | A grammar (2.2): gains rise and brighten, losses fall and darken, neutral is one soft tick, warnings are two-tone and escalate, money is coins sized on a log scale, a refusal is a short low "no" |
| 2. One family | One key (D major pentatonic) and one palette of materials: marimba, glass, bell, coin, wood, paper, stamp, brass, horn (2.1 to 2.3) |
| 3. Hierarchy | Three tiers (tiny, medium, loud), 6 dB apart in level and several times apart in length and richness; per-sound cooldowns, global token buckets, a voice cap, jitter and pools, speed gating, a serial queue for the big moments (3.3 to 3.5) |
| 4. Never the only cue | Every sound has a visual or screen-reader counterpart, named per sound in the map (column "Visual counterpart") and audited in section 9, with the 5 small gaps to close |
| 5. Control | Master volume, mute, separate Interface, Game and Ambient switches (ambient off by default), a Classroom preset, all saved, labelled and keyboard accessible (section 7). The audio context starts on the first gesture, suspends in a hidden tab, and a missing Web Audio is a silent no-op |
| 6. Mix hygiene | Buses, glue compressor, makeup, a 4x oversampled soft clip at -3 dBFS; attack ramps of at least 0.4 ms and exponential releases on every voice; tier levels measured (3.7) |
| 7. Cheap | At most 12 voices, shared noise buffers made once, nothing allocated per frame, no timer and no frame callback while idle, ambient is 3 to 6 looped layers and one timer for sparse one-shots (6.4) |
| A rule of the game | **Sound never carries hidden information.** The engine knows things the player does not: `buy.fake`, whether an unverified buyer is a fraud, a lot's true quality, a rival's limit, an auction's `surplus` before the reveal, a haggle's reserve. No sound reads those fields (section 5 lists them). A counterfeit is announced only after the player has been told (`inspect` with `caught`, the "spotted a counterfeit" note, the result card) |

## 2. The palette and the scale

### 2.1 The key

One key for everything: **D major pentatonic, the notes D E F# A B** (the same five pitches as B minor pentatonic, so a falling figure reads sad and a rising one reads bright without leaving the set). With no semitone in the scale, any two voices that overlap are consonant or at worst a major second, so overlapping sounds never clash.

| Octave | D | E | F# | A | B |
|---|---|---|---|---|---|
| 2 | 73.4 | 82.4 | 92.5 | 110.0 | 123.5 |
| 3 | 146.8 | 164.8 | 185.0 | 220.0 | 246.9 |
| 4 | 293.7 | 329.6 | 370.0 | 440.0 | 493.9 |
| 5 | 587.3 | 659.3 | 740.0 | 880.0 | 987.8 |
| 6 | 1174.7 | 1318.5 | 1480.0 | 1760.0 | 1975.5 |
| 7 | 2349.3 | 2637.0 | | | |

Rules, all checked by `audit.mjs`:

- Every fundamental, and both ends of every pitch glide, is a note name from this table. A recipe may not contain a raw frequency.
- A bank (marimba, glass, bell, coin) generates a partial only if it lands on a note of the key (within 30 cents) **or** is quieter than -26 dB under the fundamental (the strike of a marimba bar). Partials are octaves, fifths and thirds of the root, stretched by at most 25 cents (glass 2.01, 3.02 and 4.05 beat gently, by design). The synth prunes the rest (273 of 1,884 partials in the set: those above 6 kHz and those out of key), so a glass note on F# has no C# in it. Nothing above 6 kHz is ever generated, so there is no harshness and no aliasing.
- Nothing below D2 (73 Hz). The low thumps glide between D3 and D2 and are exempt from pitch rules because they are felt, not heard as notes.
- Noise is unpitched: it is filtered into a band (paper, air, hiss, crowd) and never used for a note. The cricket and the chirp are the only places a narrow band sits above 4 kHz, and they are ambient.

### 2.2 The grammar: what each kind of change sounds like

| Meaning | Pitch | Timbre and dynamics | Examples |
|---|---|---|---|
| Gain, success, open, on | Rises: the last note is at least 1.5 semitones above the first | Brighter than its loss twin (higher spectral centroid); glass, marimba, coin; ends open | `cash.in`, `sale.win`, `ui.toggle` on, `clock` resume, `cam` zoom in, `pitch.fit` up, `audit.result` pass, `perk.bailout`, `zone.open` |
| Loss, failure, close, off | Falls | Darker: triangle waves, lowpass at 0.8 to 2.2 kHz, muted coins; shorter; never louder than the gain it mirrors; never a buzzer and never an out-of-key note | `cash.out`, `sale.reject`, `sale.scam`, `ui.toggle` off, `clock` pause, `cam` zoom out, `pitch.fit` down, `audit.result` fail, `alert.insolvent` |
| Neutral, "I heard you" | None | One soft wood or marimba tick | `ui.tick`, `ui.select`, `haggle.move` hold |
| Warning | A falling minor third, A4 to F#4, on glass | Two-tone; severity adds repetition, then a drone, then a horn and a knock (`alert.advance` 1, 2, 3) | `alert.advance`, `audit.notice`, `deal.verify` bad, `ship.trouble` |
| Refusal | Two low taps D3 then A2 | Triangle behind a 900 Hz lowpass over a dull knock; short; a "no", not a punishment | `ui.refuse`, `sale.reject`, `acad.teach` wrong |
| Magnitude | More notes, higher notes | Log scale: each size step is about 100 times the money; more coins, more partials, a longer tail (2.4) | `cash.in` s, m, l, xl; `zone.open` tier 1 to 4 |
| Rarity | Wider range | Common is two glass notes, rare three and a shimmer, epic a full arpeggio with brass and a shower | `achievement`, `milestone` |
| Progress | One scale step up per item | Pitch counts: the nth crate, tab, step, raise or speed is the nth note | `ui.crate`, `ui.select`, `acad.step`, `bid.raise`, `clock` speed |
| Closeness | The interval narrows, the tone opens | Far is a wide dull dyad, near is a unison that beats slowly | `haggle.tell` |

### 2.3 The voices (the palette's instruments)

These are the building blocks the recipes are written with. Their names are the exports of `dev/audio-proto/sounds.js`, so a recipe reads like its description.

| Voice | Made of | Used for |
|---|---|---|
| `mar` marimba | sine at f plus partials at 4x (25% of the decay time) and 10x (30 ms) | choices, small successes, counting steps, arpeggios |
| `gls` glass | sine at f with partials 2.01, 3.02, 4.05 and decays 0.6, 0.4, 0.25 of the main | information, achievement, warnings, chimes |
| `bellL` bell | partials 1, 2, 3, 4.01, 5.02 with long decays | door bells, the register, the gavel's chime, tolls |
| `coin` | bank at f, 1.5f, 2f (a fifth and an octave) with a 5 kHz noise tick | all money; muted by a lowpass at 2.2 kHz for spending |
| `wood` | sine at f for 50 ms plus a 2.4 kHz noise tick | your hands: crates, taps, buttons, hover |
| `thump` | sine gliding D3 to D2 in about 60 ms | impacts: crates, drawers, stamps, doors |
| `paper` | pink noise in a band sweeping 1.8 to 5.2 kHz, with a 29 Hz crinkle | documents, panels, text, bills |
| `swoosh` | pink noise band sweeping up (rising) or down (falling) | movement: camera, drawers, trucks, chutes |
| `stamp` | thump plus a 900 Hz noise slap plus a short paper tail | official decisions: results, audits, contracts |
| `brass` | three detuned sawtooths, lowpass opening 500 to 2600 Hz over 80 ms | authority, stakes, fanfares |
| `horn` | two detuned sawtooths lowpassed at 420 Hz plus a sine an octave down | freight, harbor, alarms |
| `click` | white noise in a band at 2 to 3.4 kHz for 8 to 40 ms | typewriters, relays, ticks |
| `sparkle` | n glass notes climbing the scale 35 ms apart | rare delights |

### 2.4 Sizing money

Coins carry the size of the sum, on a log scale, so a student learns the ladder: each size is about a hundred times the one before.

```js
// js/audio/palette.js (prototype of the rule)
export function moneySize(amount, netWorth) {
  const base = Math.floor(Math.min(0.999, Math.max(0, Math.log10(Math.abs(amount) + 1) / 6.5)) * 4); // 0 s, 1 m, 2 l, 3 xl
  const big = netWorth > 0 && Math.abs(amount) >= 0.2 * netWorth ? 1 : 0;   // a deal worth a fifth of everything you have feels bigger
  return ['s', 'm', 'l', 'xl'][Math.min(3, base + big)];
}
```

| Size | Amount (before the bump) | Sound |
|---|---|---|
| s | under $41 | one coin |
| m | $41 to $1,780 | three coins |
| l | $1,780 to $75,000 | six coins and a register ding |
| xl | $75,000 and up | ten coins, a bell chord, a soft brass stab and a glass shower |

The bump means the very first sales (a pen for $3 when you own $3) already sound like a deal. Money out uses the same function with `xl` folded into `l`, and is never louder than the matching gain (at size m it is a whole tier quieter). Sales use `price` (what came in); a pool sale uses `total`; a loan, a repayment or a fee uses its own amount.

### 2.5 Variation, so nothing repeats exactly

- Every play gets a new seed: pitch jitter of up to 7 cents for the whole voice, gain jitter of up to 0.7 dB, and a random start inside the shared noise buffer. Intervals inside a sound never change (the jitter moves the whole voice).
- The frequent sounds also carry a **pool** of three equivalent timbres or pitches, rotated so the same one never plays twice in a row: `ui.tick` (wood at D6, E6, F#6), `world.hover` (each kind has two notes), `world.step` (a, b, c), `manager.cycle` (coin at D7, A6, D6), `cash.in` s (A6, D7, E6), `bid.raise`, `haggle.move`.
- A sound that is asked for again inside its cooldown is dropped, not stacked (3.4).

## 3. The mixer

### 3.1 The graph

```
voice (at most 12 live) -> voice gain (tier trim, jitter, ducking) -> [lowpass if far] -> stereo panner -> bus
      bus ui   -3 dB  \
      bus game  0 dB   > duck gains -> master gain (volume^2, mute) -> glue compressor -> makeup (divides by 1.729) -> 4x oversampled soft clip at -3 dBFS -> speakers
      bus amb  -6 dB  /                (ambient level slider, the bed's own trim)
```

### 3.2 Levels, in decibels

Loudness is measured as the **K-weighted active level**: each sound is rendered mono at 48 kHz, filtered with the BS.1770 K-weighting, cut into 20 ms frames, and the mean square of the frames within 24 dB of the loudest frame is taken. It is a short-sound cousin of LUFS. Peak is the largest sample before the buses.

| Tier | Variants | Active level (dB) | Peak before the buses (dBFS) | Length ms (min / median / max) | Held under target by the peak ceiling |
|---|---|---|---|---|---|
| tiny | 100 | -30.0 to -30.0 | -20.8 to -14.1 | 30 / 170 / 870 | 0 |
| medium | 67 | -24.0 to -24.0 | -14.9 to -6.3 | 120 / 480 / 1270 | 0 |
| loud | 22 | -20.6 to -19.0 | -6.9 to -5.0 | 770 / 1290 / 2740 | 8 |
| ambient one-shot | 18 | -32.0 to -32.0 | -22.0 to -12.0 | 80 / 340 / 1450 | 0 |

- Tiers are 6 dB apart in level, and the hierarchy is carried as much by **length and richness** (a loud sound is 0.8 to 2.7 s and layers brass, bells and arpeggios) as by level.
- The peak ceiling is -6 dBFS for tiny and medium and -5 dBFS for loud. The loud sounds held under their -19 dB target by it are `cash.in#xl` -19.1, `alert.insolvent#i` -19.5, `perk.bailout#bailout` -20.5, `achievement#epic` -19.8, `level.up#big` -20.3, `acad.graduate#g` -19.2, `run.end#horizon` -20.1, `run.end#done` -20.6. All stay within 2 dB of target, inside the 4 dB band.
- Bus trims: interface -3 dB, game 0 dB, ambient -6 dB (plus the ambient level slider, default 70%, which is -6 dB). Ambient beds are trimmed to -28 dB, one-shots to -32 dB, so at default settings a bed sits about 40 dB under full scale, 7 dB under the quietest interface tick and 16 dB under a medium game sound.
- At the default master volume of 70% (gain 0.49, -6 dB) a tiny interface tick is about -39 dBFS, a medium game sound -30 and a loud fanfare -25. It is a quiet game by default; the slider goes up to 0 dB.
- The per-sound trims are in Appendix A. They are all negative (the recipes were written with headroom), applied as a single gain on each voice, and they are the only thing calibration changes.

### 3.3 Voices, priority and stealing

- **12 live voices** (a voice is one play of one sound). The 13th request steals the oldest voice of the lowest tier that is not higher than the request; a tiny request that finds all 12 voices medium or loud is dropped. Loud sounds are never dropped for a voice; they steal.
- A stolen voice is faded in 12 ms, never cut.
- An **oscillator budget of 160** guards the worst case: a request that would pass it plays without its flagged optional layers (the sparkle and shower layers carry `opt`), and a tiny request is dropped. The median sound is 8 oscillators, the heaviest is 113 (`run.end` done, 3 s), so the budget is reached only by several fanfares at once, which the moment queue forbids.
- Priority: tiny 1, medium 2, loud 3.

### 3.4 Cooldowns and rate limits

1. **Per-sound cooldown** (the column in the map): a second request for the same id inside the window is dropped. Variants of one id share it.
2. **Global token buckets**, refilled continuously: tiny 8 a second (burst 4), medium 3 a second (burst 3), loud one per 1.2 s. A request that finds its bucket empty is dropped. Player-caused sounds (a press the player just made) draw from a separate bucket of 6 a second so a busy game never swallows a click.
3. **Speed gating.** The engine runs one virtual hour every 7 s at 1x. Clock-driven sounds are thinned as the clock speeds up, and never sound at the tick rate:

| Clock speed | `day.turn` | `buyer.arrive` | `manager.cycle` | ambient one-shots | everything the player caused, and all medium and loud events |
|---|---|---|---|---|---|
| 0.25x, 1x | yes | yes (one per 6 s) | yes (merged, one per 400 ms) | yes | yes |
| 4x | yes (one per 2.5 s) | one per 12 s | one per 1.2 s | one per 40 s | yes |
| 16x, 64x | no | no | one `cash.in` s per 2 s, standing for the sum | no | yes |
| paused | no | no | no | no | yes |

4. **Merging.** Several `cycle` events inside 250 ms become one sound; the number of managers (1, 2, 3 or more) is the number of coin notes in a short arpeggio. Several `pitch` events in one tick (a bot or a class clock catching up after a hidden tab) play only the last.
5. **Catching up.** When a tab was hidden or a class clock jumped, the engine replays hours in a loop. Events arriving while `S.tick` is catching up (more than 3 hours in one step) are not played at all; their toasts and news stay.
6. **Causal groups (no doubling).** One cause makes one sound.
   - *Money group*: `sale.*`, `cash.*`, `buy.lot`, `pool.sell`, `bank.*`. If two arrive within 250 ms, the second plays without its coin layer (the accent only).
   - *Result card*: `deal.result` is skipped when a `sale.*`, `buy.lot` or fanfare played in the last 900 ms. The sale already told the story; the card's stamp is a visual.
   - *Toast fallback*: a toast with no sound of its own plays `ui.ok` (good), `ui.nudge` (warn) or `ui.refuse` (bad), but only if no sound of tier medium or above played in the last 400 ms. Info toasts are silent.
   - *Legacy aliases* (`sfx.kaching` and its four siblings, 8.4) go through the same groups, so a call site that has not been migrated yet cannot double an event's sound.
7. **The moment queue.** The big moments are serial: `level.up`, `quest.complete`, `achievement`, `milestone`, `zone.open`, `acad.win`, `acad.graduate`, `draft.begin`, `run.end`, `alert.margin-call`, `alert.insolvent`, `perk.bailout`, `cash.in` xl. At most one plays at a time. A second that arrives within the first's length waits, up to two in the queue, ordered by this priority: `run.end` and the two alerts, `milestone`, `zone.open`, `level.up`, `achievement` (epic, rare, common), `quest.complete`, the rest. A queued moment older than 3 s is dropped; its toast and dialog stay.

Per-sound cooldowns, collected (the map's column, shortest first):

| Cooldown | Ids |
|---|---|
| 30 ms | `ui.tick` |
| 40 ms | `ui.select`, `ui.crate` |
| 60 ms | `ui.toggle`, `pitch.angle`, `draft.pick` |
| 80 ms | `ui.slider` |
| 100 ms | `clock` |
| 120 ms | `ui.drawer-open`, `ui.drawer-close`, `cash.in`, `cash.out`, `read.probe`, `bid.raise` |
| 140 ms | `world.hover` |
| 150 ms | `ui.dialog-open`, `ui.dialog-close`, `ui.ok`, `cam`, `repair.stop` |
| 200 ms | `haggle.anchor`, `haggle.move`, `bid.rival` |
| 250 ms | `ui.refuse` |
| 280 ms | `world.step` |
| 300 ms | `ui.ask`, `sale.win`, `sale.pioneer`, `sale.herd`, `sale.flat`, `sale.reject`, `buy.lot`, `haggle.tell`, `bid.drop` |
| 400 ms | `ui.nudge`, `world.locked`, `streak`, `manager.cycle` |
| 500 ms | `deal.open` |
| 600 ms | `ui.count-up`, `sale.scam`, `pool.sell`, `deal.stage-done`, `deal.quick`, `deal.verify`, `haggle.leverage`, `haggle.close`, `skill.up`, `acad.step`, `acad.teach` |
| 800 ms | `deal.result`, `read.caught`, `pitch.fit`, `bid.hammer`, `repair.done`, `hire.manager`, `crew.build`, `crew.client`, `bank.draw`, `bank.repay` |
| 1000 ms | `ship.depart` |
| 1500 ms | `zone.enter`, `ship.arrive`, `ship.trouble`, `quest.complete`, `achievement`, `codex.unlock`, `swap.done` |
| 2000 ms | `audit.notice`, `audit.result`, `level.up`, `acad.win`, `inst.cue` |
| 2500 ms | `day.turn` |
| 3000 ms | `buyer.urgent`, `alert.advance`, `alert.shock`, `mentor.tip`, `swap.offer-in` |
| 4000 ms | `zone.open` |
| 5000 ms | `alert.margin-call`, `alert.insolvent`, `perk.bailout`, `milestone`, `acad.graduate`, `draft.begin` |
| 6000 ms | `buyer.arrive` |
| 8000 ms | `run.end` |

### 3.5 Ducking

A loud sound ducks the other buses so it stands clear, by automating the bus duck gains (cheap: two setTargetAtTime calls).

| When | Ambient | Game and interface tiny sounds | Attack / release |
|---|---|---|---|
| a loud sound starts | -9 dB for 1.2 s | -4 dB for 0.7 s | 40 ms / 600 ms |
| a medium sound starts | -4 dB for 0.6 s | none | 40 ms / 400 ms |
| a dialog or the Deal Room is open | -6 dB while open | none | 300 ms / 500 ms |
| the clock is paused | -3 dB | none | 300 ms / 300 ms |

### 3.6 Pan and distance

- Interface sounds are centred.
- World events pan from their place on screen: `pan = clamp((x - width / 2) / (width / 2), -1, 1) * 0.6` (never fully hard-panned, so one earbud is never the only one that hears it). The place comes from the object (`world.rectOf(kind, id)`): a buyer, a lot, a building, the player; or the centre of a district for an event that has only a zone (`DIST[z]`).
- **Distance.** An event in the district you are in plays at full level. An event in another district is 8 dB quieter behind a 2.5 kHz lowpass ("elsewhere"). An object off screen is 4 dB quieter behind 3.5 kHz at the screen's edge. Your own actions are never attenuated.
- The auction's rivals alternate left and right at 0.5 so that two rivals are two places.
- Pan is off in the "Mono" case (a setting could mirror this to the OS's mono audio; see section 11).

### 3.7 The master chain, measured

- **Glue compressor** (threshold -22 dB, knee 18, ratio 3, attack 5 ms, release 250 ms): evens out a pile-up by about 2 to 3 dB. The compressor node adds its own automatic makeup gain (measured at 1.729 for a quiet signal, 4.8 dB); the **makeup stage multiplies by its inverse** so a lone sound passes unchanged. The engine measures this constant once on first unlock with a 100 ms offline render (fallback 1 / 1.729), because Safari and Firefox differ.
- **Soft clip**: a 4x oversampled waveshaper that is linear to half scale and settles at 0.708 (-3 dBFS), so the ceiling is a fact of the chain and not of any one sound.
- **Measured (master volume 1.0 unless stated)**: the 12 loudest sounds started at once peak at -4.1 dBFS (-3.9 before the clip); two loud fanfares together -6.7; the margin call with the insolvency toll -7.9; an ordinary busy moment (a level-up, a sale, coins, a click, a cycle, a result, a quest and a streak at once) -8.1. At the default volume of 70% (0.49): the pile-up peaks at -6.5 and the busy moment at -12.0.

## 4. The sound map

**88 sound ids**, 189 rendered variants, and one continuous voice (the repair dial tone, 4.5): **89 sounds**. Around them are the ambient assets of section 6: 16 beds, 4 modifiers and 18 one-shots. A variant is the same id in a different size, kind or direction (a coin of size m, a warning of level 2, a probe called "serial"); each variant has its own measured trim (Appendix A). Where a variant changes only pitch (the nth tab, the nth crate) the row says so and one variant stands for the family in the measurements.

How to read a row. **Trigger** is the exact event or interaction. **Recipe** is written in the palette's terms (2.3) with its pitches. **Tier; bus; length** gives the tier (or the range of tiers across variants), the bus (`ui` for the chrome the player operates, `game` for what the game or the world says and for moves inside the Deal Room) and the measured length of the variants. **Pan** says where it comes from; "centre" is the default. **Cooldown** is the per-id window of 3.4. **Visual counterpart** is what a deaf or hard-of-hearing player gets instead; section 9 audits it.

### Interface

| # | id and variants | Trigger | Meaning | Recipe | Tier; bus; length | Pan | Cooldown | Visual counterpart |
|---|---|---|---|---|---|---|---|---|
| 1 | `ui.tick`<br>light, full | Any press of a button, tab or icon that has no sound of its own (capture-phase click on `.btn`, `.ibtn`, `[data-act]`). Variant `light` for ghost, small and icon buttons; `full` for primary and `.big` ones | Neutral: "I heard you" | light: wood D6 sine 28 ms + 3.2 kHz noise tick; full: marimba D5 120 ms + the tick | tiny; ui; 30 to 70 ms | centre | 30 ms | Pressed state, focus ring, the action's own result |
| 2 | `ui.toggle`<br>on, off | A checkbox, switch or `aria-pressed` button changes: Assist, Interface/Game/Ambient switches, the "Show me" button, Ledger and badge-list disclosures | On rises, off falls | on: wood A4 then D5 (45 ms apart); off: D5 then A4, 20% softer | tiny; ui; 80 ms | centre | 60 ms | The control's checked or pressed state |
| 3 | `ui.select`<br>i0, i5 | A tab, segmented control or option is chosen: dock-drawer tabs, Market sections, Crew tabs, Travel and Codex tabs, quest and badge filters, specialty cards | You moved to the nth item | marimba, one pentatonic step per index: D5 E5 F#5 A5 B5 D6 (90 ms) | tiny; ui; 60 ms | centre | 40 ms | The pressed tab and the new panel |
| 4 | `ui.crate`<br>pick1, pick8, clear | A crate is ticked or unticked (Stock list, "Tick all", Clear, a crate clicked in the world); `n` is how many are ticked now | Stacking: each pick climbs a step, clearing steps down | pick: wood knock on the nth note of D4 E4 F#4 A4 B4 D5 E5 F#5; clear: two soft falling knocks A4 D4 | tiny; ui; 40 to 110 ms | centre | 40 ms | Checkbox, the "N crates ticked" bar, the crate's highlight in the world |
| 5 | `ui.drawer-open`<br>stock, market, crew, bank, travel, codex, quests | A drawer opens: a dock button, keys 1 to 7, a building or board clicked in the world (`ctx.emit({type:"ui", ui:"open-drawer", id})`). Seven motifs, one per drawer | A panel slides out; each motif says which | paper slide (pink noise 900 to 2600 Hz, 160 ms) + motif. stock: wood knock D4; market: coin A6; crew: bell A5; bank: vault tone D3 + glass F#5; travel: glass E5 to A5; codex: page flip + glass D5; quests: brass-lite A4 | tiny; ui; 110 to 400 ms | centre | 120 ms | The drawer itself, the pressed dock icon |
| 6 | `ui.drawer-close` | A drawer closes: its Close button, Escape, a phone sheet dragged shut, a dock button pressed again | The panel slides back; the mirror of open | paper slide 2600 to 900 Hz (120 ms) + soft falling tone A4 to D4 | tiny; ui; 90 ms | centre | 120 ms | The drawer leaves, focus returns to its dock button |
| 7 | `ui.dialog-open` | The shared `<dialog>` opens with no sound of its own (Help, Menu, breakdowns, settings, confirm sheets). Seen by a MutationObserver on `#dlg[open]` | A page is put in front of you | paper rustle (hp 1.5 kHz, 120 ms) + marimba A4 soft | tiny; ui; 160 ms | centre | 150 ms | The dialog and its focus |
| 8 | `ui.dialog-close` | The dialog closes without a result sound (Close, Cancel, Escape, a click on the backdrop) | The page is put away | short falling paper rustle + marimba D4 soft | tiny; ui; 120 ms | centre | 150 ms | The dialog leaves, focus returns |
| 9 | `ui.ask`<br>normal, danger | A confirm sheet opens (`confirmBox`): normal for Sell to the pool, Release, Exit; `danger` for Delete and restart, Leave the Academy | A question that is yours to answer | normal: marimba A4 then D5, the last one held open; danger: glass F#4 then D4 (falling minor third) over a low knock | tiny; ui; 350 to 400 ms | centre | 300 ms | The sheet and its two buttons |
| 10 | `ui.refuse` | The engine refuses an action (`say(r)` with `r.ok === false`: not enough cash, storage full, locked, blocked proposal, "That lot is gone") | A short low "no", never a buzzer | two soft low taps: triangle D3 then A2 (110 ms apart) over a dull wood knock | medium; ui; 230 ms | centre | 250 ms | A bad toast with the reason in words |
| 11 | `ui.nudge` | A warn toast that is advice and not a failure ("Tick a crate first", "Pick one of your crates first", "Slide to an amount first"), an Academy hint, an Academy lesson that cannot be finished | Gentle "not yet": look again | glass E4 with a third partial, 180 ms, over a wood tick | tiny; ui; 100 ms | centre | 400 ms | The toast, or the hint card |
| 12 | `ui.ok` | A small success with no richer sound: a good toast on its own ("Copied", "Now putting $x to work", proposal sent, pause or release confirmed), a save | Done, small | marimba A4 then D5 (70 ms apart) + a glass shimmer D6 at 10% | tiny; ui; 230 ms | centre | 150 ms | The good toast |
| 13 | `ui.slider`<br>mid, top, zero | A range input (Bank amount, quick-pick percentages, Crew allocation, Deal Room dial slider, master volume) crosses a detent: every 10% of its travel, at most 12 a second, and the last one when the thumb is let go | Pitch follows value: low is less, high is more | wood tick on the nth of D4 E4 F#4 A4 B4 D5 E5 F#5 A5 B5 D6; at 0% a low thump D3, at 100% a glass ping D6 + A6 | tiny; ui; 30 to 190 ms | centre | 80 ms | The slider thumb, the value text |
| 14 | `ui.count-up` | A number counts up (`countUp` in js/ui/polish.js: the Deal Room result's XP, the lesson reward): one sound for the whole count, 700 ms | Numbers are adding up | 12 ticks accelerating, each a marimba note climbing D5 to D6, ending on a glass D6 | tiny; ui; 870 ms | centre | 600 ms | The number ticking to its final value |

### Clock, camera and world

| # | id and variants | Trigger | Meaning | Recipe | Tier; bus; length | Pan | Cooldown | Visual counterpart |
|---|---|---|---|---|---|---|---|---|
| 15 | `clock`<br>pause, resume, speed4 | HUD clock: the play and pause button, the speed select (`#spd`, 0.25x to 64x) | Time stops, time runs, time gets faster | pause: marimba F#4 over a falling tone A3 to D3 (180 ms); resume: rising A3 to F#4; speed: n+1 ticks for the nth speed, quicker each step, on rising notes | tiny; ui; 120 to 240 ms | centre | 100 ms | The button's icon and `aria-pressed`, the speed value |
| 16 | `cam`<br>in, out, fit, home | Camera buttons (+, -, show the whole island, back to my district) and a wheel or pinch zoom (once per 150 ms, never per frame) | In rises, out falls; fit opens wide; home comes back | in: air sweep 600 to 1800 Hz + sine D5 to A5; out: reverse; fit: sweep up then down; home: wood knock + glass A5 to D5 | tiny; ui; 90 to 300 ms | centre | 150 ms | The camera itself |
| 17 | `world.hover`<br>buyer, lot, crate, building, locked | The pointer moves onto a different thing in the world (not from the keyboard list): buyer, lot, crate, building, district, locked thing. Once per new target, 140 ms apart, and not while dragging the camera | What kind of thing is it? A tiny pitch says so | buyer: marimba A5; lot: triangle D5 + a click; crate: wood F#4; building: stone knock E3 + tick; district: air puff; locked: dull sine D3 behind a lowpass at 400 Hz | tiny; game; 30 to 50 ms | object x | 140 ms | The tooltip (also read out by the list view) |
| 18 | `world.locked` | A locked gate, plot, board or district is clicked ("... opens at $x net worth", "Not open yet", "Resolve your audit") | Shut. Not yet | chain rattle (4 noise bursts at 3.5 kHz, 35 ms apart) + two dull knocks D3 and A2 + a faint metal ting A5 | medium; game; 230 ms | object x | 400 ms | Warn toast with the gate's price in words |
| 19 | `world.step`<br>a, b | Your character takes a step while walking between districts or to a ground click: one step every 0.3 s; never for NPCs | You are moving | soft step: a thump gliding from A3 or D3 down to D2 + gravel noise lowpassed at 1.2 kHz; two timbres in rotation | tiny; game; 50 ms | player x | 280 ms | The character walking, dust puffs |
| 20 | `zone.enter`<br>t1, t4 | Your district changes (`U.zone`): travel, a quest link, the map. The note pair depends on the district's tier (1 to 4) | You have arrived somewhere | air glide 400 to 1600 Hz (300 ms) + a two-note marimba tag: tier 1 D4 A4, tier 2 E4 B4, tier 3 F#4 D5, tier 4 A4 E5 | tiny; game; 420 to 430 ms | centre | 1500 ms | The camera moves, the district name tag |
| 21 | `buyer.arrive` | A new buyer appears in the district you are in (diff of `s.leads[U.zone]` ids at each render), at most one per 6 s and only at speed 4x or slower | The shop door bell: someone came in | two door-bell dings D6 then A5 (glass partials, 350 ms) | tiny; game; 340 ms | buyer x | 6000 ms | The buyer walking in with a bubble, the Market badge |
| 22 | `buyer.urgent` | A new buyer with an urgent `need` that one of your sound crates can serve arrives in your district | Someone needs what you have, now | three rising door-bell dings A5 D6 F#6 over a wood tap | medium; game; 550 ms | buyer x | 3000 ms | The buyer's "urgent: needs" bubble, the Market badge count |
| 23 | `day.turn` | The `day` event, only at speed 4x or slower and not while a dialog is open | A new day: bounties, royalties and rent have just landed | soft tower-clock chime: glass D4 + A4 (600 ms) + a paper flip | tiny; game; 460 ms | centre | 2500 ms | The HUD day counter |

### Money and trade

| # | id and variants | Trigger | Meaning | Recipe | Tier; bus; length | Pan | Cooldown | Visual counterpart |
|---|---|---|---|---|---|---|---|---|
| 24 | `cash.in`<br>s, m, l, xl, settle | Money arrives (see "Sizing money"): pool and manager proceeds, loan drawn, royalties, a released manager, exits. Size s, m, l, xl by `moneySize(amount, netWorth)`; `settle` is the quiet version for cash that lands after a delay | Coins: bigger sums are brighter and longer | s: one coin A6; m: three coins A6 E7 D7; l: six coins + register ding D6; xl: ten coins + bell chord D6 A6 + soft brass stab D3 + glass shower; settle: four soft coins, lowpassed | tiny to medium to loud; game; 70 to 790 ms | source x, else centre | 120 ms | Cash in the HUD flashes green (`.rs.up`), a "+$" pop in the world |
| 25 | `cash.out`<br>s, m, l | Money leaves: a lot bought, repair, hire, upgrade, freight, client acquisition, loan repaid, fines, SLA penalties. Sizes s, m, l | Muted coins that fall: spending is quieter and darker than earning | the coin cascade through a 2.2 kHz lowpass, each coin a step lower (D6 B5 A5 E5 D5), with a pouch thud; l ends on a vault latch D2 + click | tiny to medium; game; 70 to 400 ms | source x, else centre | 120 ms | Cash in the HUD flashes red (`.rs.down`) |
| 26 | `sale.win` | `pitch` event with `outcome: "win"` (sold above fair value). Played together with `cash.in` sized by `price` | The cash register: a good sale | drawer thump A3 to D3 + register bell A5 with four partials (700 ms) + a short "ching" D7 | medium; game; 440 ms | buyer x | 300 ms | Coins thrown in the world, a good toast, the Deal Room result |
| 27 | `sale.pioneer` | `pitch` event with `outcome: "pioneer"` (a win in a niche nobody else is selling into) | You found something new: the register plus a rising sparkle | sale.win + a glass arpeggio D6 A6 D7 E7 rising in 70 ms steps + a low brass swell D3 | medium; game; 640 ms | buyer x | 300 ms | Coins and sparks, "Pioneer sale" title, the Creativity Multiplier in the result |
| 28 | `sale.herd` | `pitch` event with `outcome: "herd"` (sold into a crowded niche, whatever it paid) | Money, but a hollow one: the herd is crowded | drawer thump + a dull bell A4 (lowpass 2 kHz) then a soft falling pair B3 to A3 (triangle) over a low shuffle | medium; game; 590 ms | buyer x | 300 ms | "Sold into the herd" title and the saturation lesson |
| 29 | `sale.flat` | `pitch` event with `outcome: "flat"` (sold at or below fair value) | A sale, no more: plain, no shine | drawer thump + a single bell D5, short (300 ms), no overtones above the third | medium; game; 220 ms | buyer x | 300 ms | "Sold, no gain" or "Sold below market" |
| 30 | `sale.reject`<br>nofit, fake | `pitch` with `outcome: "rejected"` and no scam: the buyer had no use for it (`nofit`), or spotted a counterfeit (`fake`) | The buyer said no. A counterfeit is a coin that clunks and does not ring | nofit: paper shake + the refuse pair D3 A2; fake: a dull metal clunk (a thump + two short, non-ringing partials) with a rattle and a falling B3 to D3 | medium; game; 270 ms | buyer x | 300 ms | Buyer walks off, "No sale" or "Counterfeit spotted" title, bad toast |
| 31 | `sale.scam` | `pitch` with `outcome: "rejected"` while a `scam` note has just been sent (or `reason: "scam"`): an unverified fraudster took the crate and paid nothing | You were swindled: coins drain away, a door slams | muted coins falling in pitch, a comic slide D4 to D3 (450 ms), a door thump and a low horn blip | medium; game; 780 ms | buyer x | 600 ms | "Scammed" title, bad toast, the crate vanishes |
| 32 | `buy.lot`<br>ok, broken | `buy` event. Never reads `fake` or the condition truth (that would give the lot away); `cond: "broken"` is public and adds a rattle. Played with `cash.out` sized by `price` | A crate lands on your shelf and the purse gets lighter | crate thump A2 to D2 + wood knock + pallet slide (noise 900 Hz); broken adds three metal rattles and a glass clink | medium; game; 120 to 210 ms | lot x | 300 ms | The pallet drops in the world, a toast, cash falls |
| 33 | `pool.sell` | `sell-pool` event. Played with `cash.in` sized by `total` (the cash lands after a delay: `cash.in settle` plays then) | Crates go down the chute for a lump sum | chute slide (noise sweeping 1800 to 600 Hz, 500 ms) + three thumps + a soft register ding D5 | medium; game; 750 ms | centre | 600 ms | Crates leave the shelf, a good toast |
| 34 | `streak`<br>n2, n6 | `streak` event (a second win in a row or more), layered on the sale sound; `n` is the length (capped at 6 notes) | On a roll: each win climbs a step | n glass notes rising through the pentatonic from D6 in 35 ms steps, the last one held | tiny; game; 290 to 410 ms | centre | 400 ms | The "deal streak n" line in the result card |
| 35 | `manager.cycle`<br>gain, loss | `cycle` event (a manager finished a run). Gains: a coin; losses: a muted tink. Many at once are merged into one sound; none above 16x speed except one a second | Your people earned (or lost) money while you were away | gain: one high coin D7 over a faint building thud (the pool rotates D7, A6, D6); loss: one muted tink D5, lowpassed at 1.8 kHz | tiny; game; 60 ms | building x | 400 ms | The "+$x" pop above the building |

### The Deal Room

| # | id and variants | Trigger | Meaning | Recipe | Tier; bus; length | Pan | Cooldown | Visual counterpart |
|---|---|---|---|---|---|---|---|---|
| 36 | `deal.open`<br>sell, buy, fix | The Deal Room sheet opens (`#dlg.deal`). `sell` for a buyer, `buy` for a lot, `fix` for a crate on the bench | You sat down at the table | sell: shop-door bell A5 + paper + marimba D5; buy: stall slide (noise 500 to 1500 Hz) + three purse ticks + marimba A4; fix: anvil ting A5 + two bench knocks | medium; game; 280 to 410 ms | centre | 500 ms | The sheet slides up, the buyer or lot appears with a line of dialogue |
| 37 | `deal.stage-done` | A stage finishes and its Continue or See the result button appears (Read, Pitch, Close, Bid, Fix) | This part is done | glass E5 then A5, soft (350 ms) | tiny; game; 250 ms | centre | 600 ms | The stepper shows a tick, "Continue" appears |
| 38 | `deal.quick` | Quick (auto-play the stage) or Quick deal is pressed | The rest is played for you, fast | eight ticks accelerating on rising notes, paper rustle, ending on glass D6 | tiny; game; 650 ms | centre | 600 ms | The stage is filled in, "Quick" note in the card |
| 39 | `deal.verify`<br>ok, bad | Verify this buyer is pressed (a cost of 1% of their budget). `ok` for a clean buyer, `bad` for a fraudster found | A check mark, or a warning | ok: marimba D5 then A5; bad: two-tone glass A4 then F#4 with a low knock (medium level) | tiny to medium; game; 250 to 330 ms | centre | 600 ms | The callout ("verified" or "this buyer is a scam") |
| 40 | `deal.result`<br>good, warn, bad, info | The result card is drawn (`result()` in the Deal Room). Skipped if a `sale.*`, `buy.lot` or fanfare sound played in the last 900 ms. tone good, warn, bad, info | How the whole deal went | good: glass arpeggio D5 F#5 A5 + soft stamp + sparkle; warn: glass A4 F#4 + stamp; bad: low D3 A2 + dull stamp; info: a stamp and a paper rustle only | tiny to medium; game; 90 to 560 ms | centre | 800 ms | The result card's coloured title and stamp |
| 41 | `read.probe`<br>look, serial, power, papers, expert | A probe is bought in the Read stage (`[data-deal="probe"]`): look, serial, power, papers, expert | Each way of checking sounds like what it is | look: soft glance (paper hiss 3 kHz) + glass E6; serial: six typewriter ticks + a beep A6; power: relay click + sine D4 to D5 zap + a hum burst; papers: two paper rustles; expert: bell A5 + wood tap D4 | tiny; game; 90 to 290 ms | centre | 120 ms | The probe card is marked used, evidence appears |
| 42 | `read.caught` | `inspect` event with `caught: true` (a counterfeit found). A fake that was not caught is silent: the sound never says what you missed | Gotcha: the fake is exposed | glass A5 then D6 (a magnifier ding), a low confirming knock F#3, and a sparkle | medium; game; 470 ms | centre | 800 ms | The Read stage's "chance it is a counterfeit" meter jumps, the evidence line |
| 43 | `pitch.angle`<br>prestige, utility, scarcity, price, story, drop | A pitch angle is chosen or dropped (`[data-deal="angle"]`, read before the toggle). The angle sets the timbre: prestige glass, utility wood, scarcity ticking, price coin, story page. A pick rises, a drop falls | Each angle has its own voice | prestige: glass F#6; utility: two wood taps A3 D4 + a thump; scarcity: two clock ticks + glass A5; price: coin D6; story: page flip + marimba E5. Drop = the same, a step lower and softer | tiny; game; 70 to 240 ms | centre | 60 ms | The angle card lights with a number 1 or 2 |
| 44 | `pitch.fit`<br>up, down | The Pitch stage reports its fit change (`+0.12 fit` callout): up when fitDelta >= 0.05, down when <= -0.03, silent between | Your angles matched the buyer, or missed | up: glass A4 to D5 rising with a sparkle; down: triangle B3 to F#3 falling over a soft thud | tiny; game; 160 to 390 ms | centre | 800 ms | The callout turns green or amber with the number |
| 45 | `haggle.anchor`<br>high, fair, low | Your first number: Aim high (or Generous), Fair, Quick sale (or Lowball) (`[data-deal="anchor"]`) | The bolder the number, the bolder the note | high: brass-lite A4 (lowpass opening) + tap; fair: marimba D4 + tap; low: soft triangle F#3 | tiny; game; 140 to 170 ms | centre | 200 ms | Your marker appears on the price track |
| 46 | `haggle.move`<br>hold, small, large, split | A move after the anchor: Hold; Raise your offer or Come down (small, medium, large); Split the difference | Hold is a still tap; concessions step down; a split brings two notes together | hold: one wood tap D4; concede: 1, 2 or 3 soft falling taps (D4 B3 A3) by size; split: two notes A3 and D4 converging to a glass unison D4 | tiny; game; 40 to 370 ms | centre | 200 ms | The track marker moves, the rounds counter drops |
| 47 | `haggle.leverage` | Mention your other option is pressed (once per haggle) | You played your ace | card snap (noise, 40 ms) + a bright glass sting A5 D6 F#6 (60 ms apart) | medium; game; 460 ms | centre | 600 ms | The button is spent; their stance shifts |
| 48 | `haggle.close`<br>accept, walk | Accept their offer or price is pressed (handshake); Walk away is pressed (tiny) | A deal is shaken on, or you left the table | accept: two soft thumps (the clasp) + a coin D6 + a stamp; walk: chair slide (noise sweep down) + a door thump and latch tick | tiny to medium; game; 290 to 310 ms | centre | 600 ms | "Agreed at $x" callout, or "no deal" |
| 49 | `haggle.tell`<br>far, reach, near | After each counter, their stance changes ("far apart", "getting closer", "very close") | Warmer or colder: the interval shrinks and the tone opens as you close in | a two-note chord that narrows: far D3 + F#5 behind a 700 Hz lowpass; closer D4 + A4 behind 2 kHz; very close A4 + A4 (+7 cents, a slow beat) wide open | tiny; game; 180 to 190 ms | centre | 300 ms | The words "They are very close" |
| 50 | `bid.raise`<br>r1, r5 | Bid (or Open the bidding) is pressed in an auction. `n` is the number of raises so far | Your paddle goes up; the climb rises with the price | paddle clack (noise 1.5 kHz + wood) then a marimba note one step higher each raise (D5 up to B5) | tiny; game; 140 ms | centre | 120 ms | The price on the ladder, "You bid $x" |
| 51 | `bid.rival`<br>in, out | A rival bids (in) or drops out (out) in the auction log, each on its own side of the stereo field | Someone else is in the room: a lower bell for a bid, a falling note for a dropout | in: soft bell A3 (lowpass 2.5 kHz) + paddle tick; out: triangle E3 falling to D3 + a paper shuffle | tiny; game; 150 to 190 ms | rival, alternating left and right | 200 ms | The rival list ("in", "out at $x") and the event log |
| 52 | `bid.drop` | Drop out is pressed | You stepped back (and kept your cash) | soft falling air sweep + a wood tap D4 | tiny; game; 210 ms | centre | 300 ms | "You dropped out" callout |
| 53 | `bid.hammer`<br>won, lost | The auction ends (`sold` or `nosale` in the log). `won` if you hold the winning bid | Sold. The gavel falls; a chime rises if it is yours, a low note if it is not | gavel: hard wood hit (noise 800 Hz + thump D4 to A3 + knock); won: glass A5 D6 rising; lost: triangle D3 | medium; game; 340 to 540 ms | centre | 800 ms | The callout "You won at $x" or "You are out" |
| 54 | `repair.stop`<br>perfect, good, ok, miss | Stop is pressed on the repair dial (or Space, or Stop here on the slider). By precision: perfect >= 90%, good >= 65%, ok > 0, miss | The better the stop, the cleaner the ring | perfect: anvil bell D6 A6 + hammer thud + sparkle; good: anvil ting A5 + thud; ok: wood thunk + dull tink; miss: clunk + three rattles and a falling B3 to D3 | tiny to medium; game; 50 to 460 ms | centre | 150 ms | The step turns green, amber or red with its precision |
| 55 | `repair.done`<br>great, ok, rough | `repair` event: great when precision >= 0.8, ok >= 0.4, rough below. Careful (pay more, guaranteed) plays ok | The work is finished, and how well | great: three anvil hits rising A5 D6 F#6 + glass chime D6 A6 + stamp; ok: three wrench clicks + wood + a soft glass A4; rough: dull clank + a short falling triangle | medium; game; 240 to 830 ms | centre | 800 ms | "Repaired, and it pays" or "Repaired" title; quality shown as a percentage |

### Crew, freight, bank and audits

| # | id and variants | Trigger | Meaning | Recipe | Tier; bus; length | Pan | Cooldown | Visual counterpart |
|---|---|---|---|---|---|---|---|---|
| 56 | `hire.manager`<br>student, broker, logistics | `hire` event (Hire in the Crew drawer). Flavour by kind: student, broker, logistics | Someone joins your team | door bell A5 + paper + two handshake thumps + a small brass swell D4 A4; student: marimba flourish; broker: coin plink; logistics: horn blip | medium; game; 640 to 740 ms | building x | 800 ms | A building rises on the plot, the Crew drawer lists them |
| 57 | `crew.build`<br>level, upgrade | `pipe-level` event (a manager levelled up) or `upgrade` event (a company upgrade bought) | Your business got stronger | level: three hammer hits rising D4 A4 D5 on marimba + a brass-lite note; upgrade: a relay click, a rising machine whirr (noise 300 to 1500 Hz) and a glass ping A5 | medium; game; 580 to 780 ms | building x | 800 ms | The building grows a floor / the upgrade is marked bought, a good toast |
| 58 | `crew.client`<br>smb, ent | `client` event (a contract signed): smb, corp, ent | A contract is signed | pen scribble (noise at 4.5 kHz with fast tremolo, 250 ms) + stamp + bell D6; corp adds a glass fifth; ent adds a brass chord D3 A3 | medium; game; 640 to 690 ms | centre | 800 ms | The client appears in the Crew drawer |
| 59 | `ship.depart` | `ship` event (crates sent to another district) | A truck pulls out | engine rumble (brown noise lowpassed at 240 Hz and closing to 120) + a short air horn, D3 over D2 | medium; game; 680 ms | origin district x | 1000 ms | A truck drives along the road, a "Shipped" toast |
| 60 | `ship.arrive` | Note kind `freight-arrive` ("Freight arrived in ...") | The truck is here | air-brake hiss (a noise band falling from 3 to 1.8 kHz, 300 ms) + a door-bell ding D6 + a crate knock | tiny; game; 490 ms | destination district x | 1500 ms | The truck vanishes, the crates appear; the news ticker (and a polite screen-reader line) |
| 61 | `ship.trouble`<br>customs, damage | Note kind `customs` (inspected: a delay and a fee) or `damage` (crates damaged in transit) | Something went wrong on the road | customs: a stop whistle (two sine A5 pulses) + clipboard stamp; damage: crate crunch (noise bursts) + a glass shatter-lite + a falling sting | medium; game; 300 to 480 ms | destination district x | 1500 ms | A warn or bad toast with the cost |
| 62 | `bank.draw` | `draw` event (a loan taken) | Cash in, but it is owed: coins that end on a low note | vault door (low sine D2 + a sweeping noise 400 Hz) + bills counted (six paper flutters) + a stamp, ending on a held triangle D3 | medium; game; 1130 ms | centre | 800 ms | Cash rises, Debt appears in the gauge, a "Liability added" toast |
| 63 | `bank.repay`<br>half, full, free | `repay` event: half or full of one loan; `free` when the last loan is cleared (Debt-free) | Debt goes down: a stamp, coins out, relief rising | stamp + three muted coins + glass A4 (half) or F#5 to A5 (full); free: vault latch closing + a rising glass arpeggio D5 F#5 A5 D6 + a shower | medium to loud; game; 620 to 1040 ms | centre | 800 ms | The loan row shrinks, a toast; "Debt-free" toast for the last one |
| 64 | `audit.notice` | Note with `audit: true` (an audit event with 72 virtual hours to answer) | An official letter has arrived | five typewriter ticks + a carriage bell A5 + the warning pair glass A4 F#4 | medium; game; 800 ms | centre | 2000 ms | Warn toast, the Bank drawer's audit panel, the Bank badge |
| 65 | `audit.result`<br>pass, fail | `audit` event (you answered): `ok` true is a pass, false a fail | Approved, or fined | pass: stamp + glass D5 F#5 A5 rising; fail: stamp + a falling triangle A3 to D3 + a muted coin | medium; game; 410 to 670 ms | centre | 2000 ms | Toast and the audit panel clears (a fine appears in the ledger) |

### Alerts and shocks

| # | id and variants | Trigger | Meaning | Recipe | Tier; bus; length | Pan | Cooldown | Visual counterpart |
|---|---|---|---|---|---|---|---|---|
| 66 | `alert.advance`<br>l1, l2, l3 | A macro warning note (`alert` with `level` 1 to 3, "effective in N days"); also the alert dialog | Severity escalates: one pair, two pairs with a drone, three pairs with a horn | 1: the warning pair glass A4 F#4; 2: the pair twice (350 ms apart) over a saw drone D2; 3: the pair three times over a horn (D3 over D2) and a vault knock | medium to loud; game; 370 to 1170 ms | centre | 3000 ms | The alert dialog with its code and readout; the ticker |
| 67 | `alert.shock`<br>tiktok, fed, tariff, viral, glut, scare | `shock` event (it is live now). By kind: tiktok, fed, tariff (scheduled), viral, glut, scare (surprise events, quieter) | tiktok: exciting; fed: ominous; tariff: heavy; viral: bright; glut: sinking; scare: nervous | tiktok: five-note bright arpeggio D5 to F#6 + confetti noise swell; fed: low brass A2 to D2 glide + rain-onset noise + rumble; tariff: gate slam + metal clang + horn A2; viral: glass D6 A6 D7; glut: marimba D5 A4 D4 falling; scare: the pair + a paper shake | medium to loud; game; 360 to 1420 ms | centre | 3000 ms | Breaking-news toast and dialog, rain or confetti in the world |
| 68 | `alert.margin-call` | `margin-call` event (debt-to-equity passed 4.5: the bank liquidates) | The most serious sound in the game | siren pair A3 D4 three times (saw, lowpassed 1.4 kHz) + a vault slam thump + a low horn blast, D3 over D2 | loud; game; 1320 ms | centre | 5000 ms | The "Margin Liquidation Protocol" dialog, bad toast, assets sold off |
| 69 | `alert.insolvent` | `insolvent` event (net worth fell to zero or below) | You are broke: a toll and a slow fall | two deep bell tolls D3 (1.5 s each) over a falling slide D4 to D2 | loud; game; 1970 ms | centre | 5000 ms | Bad toast; net worth turns red |
| 70 | `perk.bailout`<br>bailout, waived | `perk` event: `bailout` (the Legacy Heir's family clears your debt) or `fine-waived` (the family lawyer, medium) | Rescue: relief that rises after a hard moment | bailout: rising brass swell A3 D4 A4 + a glass chord D5 F#5 A5 + an approved stamp + a long falling sigh (noise lowpassed); fine-waived: stamp + a glass tink | medium to loud; game; 550 to 1290 ms | centre | 5000 ms | Good toast ("The family stepped in") |

### Progress and the class

| # | id and variants | Trigger | Meaning | Recipe | Tier; bus; length | Pan | Cooldown | Visual counterpart |
|---|---|---|---|---|---|---|---|---|
| 71 | `quest.complete`<br>quest, daily | Progress `onComplete("quest")` or `("daily")` | A goal reached: a short rising run, with a coin for the reward | marimba arpeggio D5 F#5 A5 D6 (60 ms) + a glass sparkle + a coin A6; daily adds a stamp | medium; game; 520 ms | centre | 1500 ms | "Quest complete: ..." toast, confetti burst, XP |
| 72 | `achievement`<br>common, rare, epic | Progress `onComplete("achievement")`, by `def.rarity`: common, rare, epic | Rarity is loudness and length | common: glass A5 D6 + sparkle; rare: three notes + a shimmer and a brass-lite swell; epic: full arpeggio D5 to D7 + brass D3 A3 + a shower of glass (1.6 s) | medium to loud; game; 470 to 1240 ms | centre | 1500 ms | Achievement toast, confetti (more for epic) |
| 73 | `codex.unlock` | Progress `onCodex` (a new Codex page unlocked) | A new idea: a lightbulb on a page | page flip + glass E6 then A6, soft (450 ms) | tiny; game; 410 ms | centre | 1500 ms | "Codex unlocked: ..." toast, the Codex badge |
| 74 | `mentor.tip` | Note kind `mentor` (the Seasoned Pro's weekly tip) | A hint from someone who has seen it before | glass A5, F#5, B5 (a gentle question) + a wood tap | tiny; game; 540 ms | centre | 3000 ms | The news ticker and a polite screen-reader line |
| 75 | `level.up`<br>l, big | `level` event. `big` on every 5th level | The biggest everyday moment: brass, marimba and glass together | brass stab D3 A3 + marimba run D5 A5 D6 F#6 A6 (80 ms) + glass shimmer D7 + a low boom; big adds an octave doubling | loud; game; 870 to 1180 ms | centre | 2000 ms | Level toast, the HUD ring, confetti |
| 76 | `skill.up` | A skill point is spent (Quests drawer: Spend) | Power-up: three notes climbing | marimba A4 D5 F#5 + a metallic click-in | medium; game; 430 ms | centre | 600 ms | The skill level bar fills, a toast |
| 77 | `milestone`<br>m1, m2, m3 | `milestone` event, `n` 1 to 3 (1: managers and the bank open; 2: audits begin; 3: enterprise opens) | A door opens; milestone 2 carries a warning | 1: brass fanfare D3 A3 D4 + marimba run + a door-open swell; 2: the same but the last chord turns to the warning pair A4 F#4; 3: longer, adds a bell chord D6 A6 and a second brass voice | loud; game; 1310 to 1580 ms | centre | 5000 ms | Milestone toast, confetti, new dock icons |
| 78 | `zone.open`<br>t1, t4 | `zone` event (a district opens as net worth passes its gate), `t` the tier 1 to 4; with `world.startReveal` | The fog lifts: a place opens to you | n+3 glass notes rising (n = tier) + a low pad swell D2 A2 + a rising air sweep and sparkle; tier 4 adds brass and a bell chord | medium to loud; game; 1270 to 1320 ms | district x | 4000 ms | Rings and sparks over the district, its fog lifts, a "... is open" toast |
| 79 | `swap.offer-in` | Session event `offer` (a classmate or the Practice Partner proposes a swap) | A letter has been slipped under the door | soft door bell E5 B5 + an envelope flip (paper) | medium; game; 430 ms | centre | 3000 ms | The Market badge and the Invitations list (and a polite screen-reader line) |
| 80 | `swap.done` | `p2p` event (a swap is finished) | Hands shaken: crates changed owners | two thumps (the clasp) + two coins swapping sides (pan sweep) + glass A6 | medium; game; 640 ms | centre | 1500 ms | The ledger row, a good toast |

### Academy, draft and the run

| # | id and variants | Trigger | Meaning | Recipe | Tier; bus; length | Pan | Cooldown | Visual counterpart |
|---|---|---|---|---|---|---|---|---|
| 81 | `acad.step`<br>s0, s5 | The coach card moves to the next step (a step was done). `i` is the step number, so the note climbs along the lesson | Progress through the lesson | glass note one pentatonic step higher than the last (D5 E5 F#5 A5 B5 D6), 300 ms | tiny; ui; 160 to 170 ms | centre | 600 ms | "Step n of m" on the card |
| 82 | `acad.teach`<br>right, wrong, reveal | Teach-back: an option is picked (right or wrong), or the answer is revealed | Right is bright; wrong is a soft "mm", never a punishment | right: marimba A5 D6 + a coin D7 + a glass F#6 (medium); wrong: two soft low taps F#3 D3 behind a lowpass; reveal: page flip + glass E5 | tiny to medium; ui; 240 to 440 ms | centre | 600 ms | The option shows its reason in words |
| 83 | `acad.win`<br>goal, reward | A lesson's goal is reached (`win()`); `reward` when the lesson-complete sheet opens | Lesson done; the reward sheet is a bigger fanfare | goal: marimba D5 A5 D6 + a brass blip; reward: the goal fanfare + glass F#6 A6 shimmer and a coin | medium to loud; game; 400 to 1010 ms | centre | 2000 ms | "Lesson goal reached", the sheet, confetti |
| 84 | `acad.graduate` | The last lesson's reward sheet ("Finish the Academy") | Graduation: the longest fanfare in the game | three bell strikes D5 A5 D6, a brass chord D3 A3 D4 F#4, a marimba run up two octaves and a shower of glass (2.6 s) | loud; game; 2250 ms | centre | 5000 ms | Reward sheet, confetti |
| 85 | `draft.pick`<br>slot1, slot2, complete, drop | A Background card is picked or dropped (Background draft); the second pick completes the build | A card is slid into a slot: first slot D5, second A5; complete is a chord | card flip snap + marimba D5 (slot 1) or A5 (slot 2); drop: the reverse a step lower; complete: glass chord D5 F#5 A5 + stamp | tiny to medium; ui; 100 to 440 ms | centre | 60 ms | The tray fills, the count "2 of 2" |
| 86 | `draft.begin` | Begin is pressed with two Backgrounds chosen | The run starts | stamp + rising brass stab D3 A3 + a marimba run D5 to D6 + a door-opening sweep | loud; game; 770 ms | centre | 5000 ms | The screen changes to the Academy or the world |
| 87 | `run.end`<br>horizon, start, done | Day 90 closes the run (`final` note); an exit launches (`exit` event: IPO or trade sale) and settles (note `final` with an exit) | The end of something big | horizon: three slow bell tolls D3; exit start: a trading-floor bell (eight fast strikes A5 decaying) + brass; exit done: the grand fanfare, brass D3 A3 D4 F#4 + bells + a glass shower (2.8 s) | loud; game; 880 to 2740 ms | centre | 8000 ms | The "simulation is complete" dialog with the EEI |
| 88 | `inst.cue`<br>deploy, start, rewind | Instructor dashboard only: Deploy to cohort (deploy), Start simulation (start), Rewind (rewind). Off by default in a room | A ceremony for the teacher | deploy: warning pair x2 + a horn D3; start: horns D3 and A3 over D2 and A2 + bell D6; rewind: tape whir (noise sweeping down 3 kHz to 300 Hz) with ticks | tiny to medium; game; 440 to 930 ms | centre | 2000 ms | The dashboard's own toast |

### 4.1 Every engine event, and what it plays

`EVENT_TYPES` in `js/meta/ids.js` has 28 types; each one is either given a sound below or explicitly silent. The wiring (8.3) is a table-driven switch over this list, and a test (10.2) fails if a type is missing from it or a payload variant here has no row.

| Event | Payload variants | Plays | Gate and notes |
|---|---|---|---|
| `pitch` | `outcome: win` | `sale.win` + `cash.in` sized by `price` | money group; pan from the buyer who is leaving |
| | `outcome: pioneer` | `sale.pioneer` + `cash.in` sized by `price` | |
| | `outcome: herd` | `sale.herd` + `cash.in` one size down | the herd's coins are thinner |
| | `outcome: flat` | `sale.flat` + `cash.in` sized by `price` | |
| | `outcome: rejected`, `reason: nofit` | `sale.reject` (nofit) | |
| | `outcome: rejected` after a counterfeit note | `sale.reject` (fake) | the note `kind: counterfeit` arrives first, then the event |
| | `outcome: rejected`, `gain: -1`, or after a `scam` note | `sale.scam` | an unverified fraud; announced by the note at the same moment |
| `streak` | `n >= 2` | `streak` (n capped at 6 notes) | layered on the sale; `n: 1` is silent |
| `buy` | `cond: ok` or `broken`; `fake` is never read | `buy.lot` + `cash.out` sized by `price` | pan from the lot |
| `sell-pool` | `total`, `count` | `pool.sell` + `cash.in` sized by `total` | the cash lands later: note `kind: settle` plays `cash.in` settle |
| `repair` | `precision`, `quality`, `cost` | `repair.done`: great at precision >= 0.8, ok at >= 0.4, else rough; Careful (0.5) is ok | plus `cash.out` sized by `cost` |
| `ship` | `from`, `to`, `count` | `ship.depart` | pan from the origin district |
| `hire` | `kind` student, broker, logistics | `hire.manager` (the kind's flourish) + `cash.out` | pan from the new building |
| `upgrade` | `id` | `crew.build` (upgrade) + `cash.out` | |
| `pipe-level` | `id`, `level` | `crew.build` (level) + `cash.out` | |
| `cycle` | `zone`, `net` | `manager.cycle` gain or loss | merged in 250 ms; speed gating (3.4); pan from the building; other districts are "elsewhere" |
| `draw` | `prod`, `amount` | `bank.draw` | the recipe already counts the bills; no extra coins |
| `repay` | `amount` | `bank.repay`: half when about half of the loan, full otherwise, `free` when no loan is left | |
| `client` | `tier` smb, corp, ent | `crew.client`: smb; corp and ent use the ent variant | plus `cash.out` for the acquisition cost |
| `audit` | `choice`, `ok` | `audit.result` pass when `ok`, else fail | |
| `zone` | `id` | `zone.open`, tier from `ZONES[id].tier` | moment queue; pan from the district; with the world's own reveal |
| `milestone` | `n` 1 to 3 | `milestone` n | moment queue; the loudest of the progress sounds |
| `shock` | `kind` tiktok, fed, tariff | `alert.shock` (that kind) | the advance warning is the note, below |
| | `kind` viral, glut, scare (algorithmic) | `alert.shock` (that kind, medium) | |
| `p2p` | `peer`, `variance`; `npc: true` for the Practice Partner | `swap.done`; with `npc` `ui.ok` | |
| `skill` | `skill`, `level` | `skill.up` | the only place the point being spent is heard |
| `level` | `level` | `level.up`, the big variant when `level % 5 === 0` | moment queue |
| `inspect` | `caught: true` | `read.caught` | |
| | `fake` without `caught`, `repeat`, any `score` | silent | the sound never says what you missed or how well you read |
| `haggle` | `role`, `mult`, `score`, `deal` | silent | the sale or purchase event carries the result |
| `auction` | `won`, `price`, `surplus` | silent | the bid stage's `bid.hammer` has played; `surplus` is never read before the reveal |
| `day` | `day` | `day.turn` | speed gating; silent in a dialog and while catching up |
| `margin-call` | | `alert.margin-call` | moment queue |
| `insolvent` | | `alert.insolvent` | moment queue |
| `exit` | `kind` ipo, sale | `run.end` (start) | moment queue |
| `perk` | `effect: bailout` | `perk.bailout` | moment queue |
| | `effect: fine-waived` | `perk.bailout` (waived) | |

### 4.2 Notes, session events, progress and the shell

The engine's `note(level, text, extra)` reaches the shell as the session event `note`. Today a note carries `level`, `text` and a few flags (`milestone`, `zone`, `level`, `alert`, `audit`, `final`). Sounds that depend on **what a note is about** need one more field, `kind` (8.5, a one-word additive change to eleven call sites in `js/engine.js`). The wiring falls back on matching the text when `kind` is missing, and a test pins the texts so a copy edit cannot silently mute a sound.

| Source | Condition | Plays | Notes |
|---|---|---|---|
| note | `kind: scam` or `counterfeit` | handled with the `pitch` event that follows | not played twice |
| note | `kind: settle` ("$x settled into cash") | `cash.in` settle | polite announcement added (section 9) |
| note | `kind: freight-arrive` | `ship.arrive` | pan from the destination; polite announcement added |
| note | `kind: customs` or `damage` | `ship.trouble` (that kind) | |
| note | `kind: mentor` | `mentor.tip` | polite announcement added |
| note | `kind: sla` ("SLA breach ... penalty") | `cash.out` m | |
| note | `kind: overdraft` | `cash.out` s | at most once a day |
| note | `kind: fatigue` ("Market fatigue") | `alert.shock` (glut) | |
| note | `kind: burnout` | `ui.nudge` | |
| note | `audit: true` | `audit.notice` | |
| note | `alert` with `level` 1 to 3 and `start` in the future | `alert.advance` at that level | the dialog opens with it; the queue's own `sound: 'alarm'` is suppressed |
| note | `level: bad` with no `kind` and no other sound within 400 ms | `ui.refuse` | the toast fallback (3.4) |
| note | `final: true` without an exit | `run.end` (horizon) | with "The simulation is complete" |
| note | `final: true` with an exit | `run.end` (done) | |
| session | `offer` (a swap proposed to you) | `swap.offer-in` | polite announcement added |
| session | `rewound` | `ui.nudge` | |
| session | `tick`, `change`, `refresh`, `room` | silent | |
| shell | `{type:'ui', ui:'open-drawer'}` | `ui.drawer-open` with the drawer's motif | |
| shell | `{type:'ui', ui:'close-drawer'}` (added, 8.5) | `ui.drawer-close` | |
| Progress | `onComplete('quest')` or `('daily')` | `quest.complete` (daily adds a stamp) | moment queue |
| Progress | `onComplete('achievement')` | `achievement`, by `def.rarity` | moment queue |
| Progress | `onCodex` | `codex.unlock` | |
| dialog | `#dlg` opens or closes (a MutationObserver on `open`) | `ui.dialog-open` / `ui.dialog-close`; the Deal Room (`.deal`) plays `deal.open` instead; the confirm sheet plays `ui.ask` | the observer reads the class, so nothing in `common.js` changes |
| toast | a toast is added to `#toasts` | the fallback above | |

### 4.3 Every control, and what it plays

Each `data-act`, `data-change` and `data-deal` in the app maps to an existing sound. The wiring installs one capture-phase listener on `document` that looks the control up in this table before the action runs (so it reads `aria-pressed` and the checkbox state as they were); the sound the action itself makes (a sale, a hire) comes later from the event.

| Area | Controls | Sound |
|---|---|---|
| Shell | `dock`, keys 1 to 7 | `ui.drawer-open` (motif of that drawer) or, when the drawer is open, `ui.drawer-close` |
| | `drawer-close`, Escape, a phone sheet pulled shut | `ui.drawer-close` |
| | `pause`; `speed` (change) | `clock` pause or resume; `clock` speed (index) |
| | `help`, `menu`, `settings`, `breakdown`, `alert` | `ui.dialog-open` (alert: `alert.advance`) |
| | the Display and sound dialog: contrast, motion and text size (`#s-contrast`, `#s-motion`, `#s-size`) | `ui.select`; the sound controls are 7.2 |
| | `confirm-go` | the confirmed action's own sound |
| | `savefile`, `leave` | `ui.ok`, `ui.dialog-close` |
| | `reset` | `ui.ask` (danger) |
| | `debrief`, `academy`, `joinroom` | `ui.press` |
| HUD | cash, net worth, day buttons | `ui.dialog-open` |
| | the speaker button (added, 7.4) | `ui.toggle` |
| | the news ticker, the player card, the goal tracker | `ui.tick` (they open a drawer or dialog, whose sound follows) |
| Camera | `zin`, `zout`, `fit`, `me` | `cam` in, out, fit, home |
| | the district list (`wvlist`) open, and its buttons | `ui.toggle`; each button as the same click in the world |
| Stock | `stock-pick`, `stock-pickzone`, `stock-clear` | `ui.crate` (count of ticked) |
| | `stock-sellpool`, `stock-route` | `ui.ask`; then `pool.sell` + `cash.in` |
| | `stock-repair` | `deal.open` (fix) |
| | `stock-ship`, `stock-offer`, `stock-gomarket` | `ui.drawer-open` |
| Market | `market-tab`, `market-zone`, `market-xto` | `ui.select` (a district change adds `zone.enter`) |
| | `market-use` | `ui.crate` |
| | `market-sell`, `market-look` | `deal.open` (sell, buy) |
| | `market-buy` (Quick buy) | `deal.open`, then `deal.quick` |
| | `market-verify` | `deal.verify` ok or bad |
| | `market-want` | `ui.toggle` |
| | `market-send` | `ui.ok`; blocked: `ui.refuse` |
| | `market-accept` | the swap's own `swap.done` |
| | `market-decline`, `market-withdraw` | `ui.dialog-close` |
| | `market-xfield`, `market-gostock` | silent (typing); `ui.drawer-open` |
| Crew | `crew-tab`, `crew-hkind`, `crew-hlane`, `crew-hchan` | `ui.select` |
| | `crew-hire`, `crew-edit` | `ui.dialog-open` |
| | `crew-hamt` | `ui.slider` |
| | `crew-hmax`, `crew-hafford`, `crew-hmore`, `crew-fill` | `ui.tick` (fill: `ui.ok`) |
| | `crew-hgo` | the `hire` event's `hire.manager`; refused: `ui.refuse` |
| | `crew-up`, `crew-upg` | `crew.build` (from the event) |
| | `crew-client` | `crew.client` |
| | `crew-pause` | `ui.toggle` |
| | `crew-rel` | `ui.ask` (danger), then `cash.in` s |
| Bank | `bank-pct`, `bank-amt` | `ui.slider` |
| | `bank-draw`, `bank-repay` | `bank.draw`, `bank.repay` (from the events) |
| | `bank-apipe`, `bank-logf` | `ui.select` |
| | `bank-audit` | `audit.result` (from the event) |
| | `bank-exit` | `ui.ask`; then `run.end` (start) |
| | `bank-ledger` | `ui.toggle` |
| | `bank-csv` | `ui.ok` |
| Travel | `travel-tab`, `travel-pick` | `ui.select` |
| | `travel-go` | `zone.enter` |
| | `travel-ship` | `ship.depart` (from the event) |
| | `travel-clear` | `ui.crate` (clear) |
| | `travel-codex`, `travel-stock` | `ui.drawer-open` |
| Codex | `codex-tab`, `codex-cat` | `ui.select` |
| | `codex-open`, `codex-back` | `ui.tick` |
| | `codex-replay` | `ui.press` |
| | `codex-search` | silent (typing) |
| Quests | `quests-spend` | `skill.up` (from the event) |
| | `quests-go` | `zone.enter` |
| | `quests-done`, `quests-ach-all` | `ui.toggle` |
| | `quests-ach`, `quests-jump` | `ui.select` |
| Deal Room | `quick-stage`, `quick-all` | `deal.quick` |
| | `next`, `finish`, `pitch-go`, `read-done`, `careful`, `Continue` | `ui.press`; a finished stage plays `deal.stage-done` |
| | `pass`, `walk` (before the first round), Leave, Close | `ui.dialog-close` |
| | `probe` | `read.probe` (look, serial, power, papers, expert) |
| | `angle` | `pitch.angle` (that angle; a pick rises, a drop falls) |
| | `verify` | `deal.verify` |
| | `anchor` | `haggle.anchor` (high, fair, low) |
| | `hold`, `concede`, `split` | `haggle.move` |
| | `leverage` | `haggle.leverage` |
| | `accept`, `walk` (in a round) | `haggle.close` |
| | `bid`, `drop` | `bid.raise`, `bid.drop` |
| | `stop` (and Space, Enter) | `repair.stop` by precision |
| | the Assist checkbox | `ui.toggle` |
| | the dial slider | `ui.slider` (and the dial tone, 4.5) |
| | a new "stance" line (far, closer, close) | `haggle.tell` |
| | the stage's result | `deal.result` (skipped after a sale) |
| Academy | `ac-start`, `ac-continue`, `ac-why-next`, `ac-teach-next`, `ac-reward-next` | `ui.press` |
| | the coach card moves on | `acad.step` (step index) |
| | `ac-pick` | `acad.teach` right or wrong (`result.correct`) |
| | `ac-reveal` | `acad.teach` reveal |
| | `ac-showme`, `ac-skip`, `ac-skip-no` | `ui.toggle`, `ui.ask`, `ui.tick` |
| | `ac-skip-yes`, `ac-leave` | `ui.ask` (danger) |
| | `ac-restart` | `ui.tick` |
| | the goal reached; the reward sheet; the last lesson | `acad.win` goal; `acad.win` reward; `acad.graduate` |
| | the coach's hint after 20 s; a lesson that cannot be finished | `ui.nudge`; `ui.refuse` |
| Draft | a Background card, `drop`, `clear` | `draft.pick` (slot 1, slot 2, drop; the second pick plays `complete`) |
| | `spec` (specialty) | `ui.select` |
| | `reroll` | `ui.tick` three times in a row, 50 ms apart (a rattle) |
| | `back` | `ui.dialog-close` |
| | Begin | `draft.begin`; with fewer than two Backgrounds: `ui.refuse` |
| Title | Play solo, Resume, Academy, Join, Create a room, Reopen | `ui.press` (the title is otherwise silent) |
| | Display and sound, the recovery-code disclosure | `ui.dialog-open`, `ui.toggle` |
| Instructor | Start simulation, Deploy, Inject Credit Crunch, Rewind | `inst.cue` start, deploy, deploy, rewind |
| | pause, speeds, the pace preset | `clock` |
| | sliders (friction, audit, herd, demo) | `ui.slider` |
| | checkboxes (algorithmic events, replace) | `ui.toggle` |
| | Copy student link, gradebook CSV | `ui.ok` |
| | the district select, the Background filter | `ui.select` |
| Debrief | download workbook | `ui.ok` |
| | the reflection textarea | silent (typing) |
| World | the pointer moves onto a thing | `world.hover` (that kind) |
| | click a buyer or a lot | `deal.open` |
| | click one of your crates | `ui.crate` |
| | click a pipeline building, a board, the bank, the depot, the exchange | `ui.drawer-open` (crew, market, bank, travel) |
| | click a locked gate, plot, board or district | `world.locked` |
| | click a district you can enter | `zone.enter` |
| | click the ground (the player walks) | `world.step`, every 0.3 s while walking |
| | click a truck | `ui.tick` (the toast says it is on its way) |

### 4.4 Walking, arriving and the world's own moments

- The player's footsteps (`world.step`) play only while `player.moving` and the player is on screen, at 3 a second, and stop the moment the path ends.
- Buyers walking in and out, cars on the roads, crates and buildings landing, the dust and the coins thrown up by a sale: all visual. Their sounds are the events that caused them (a sale, a hire, a cycle) and the ambient bed. Nothing walks with a footstep except you.
- `world.startReveal(z)` (a district's fog lifting) has the same cause as the `zone` event and plays no sound of its own.
- Night falling, rain and a surge change the ambient (section 6) and play no one-shot.

### 4.5 The one continuous voice: the repair dial tone

`repair.dial` is the only sound that is not a recipe; it follows a value, and it makes the timing game playable by ear.

- **When**: the Fix stage is on screen with its dial (or its slider in reduced motion) and the setting "Repair dial tone" is on (default on). One `requestAnimationFrame` loop runs only then: it reads the marker's inline `left` and the zone's inline `left` and `width` from the DOM (no layout read), and stops with the stage.
- **Pitch**: the marker's position 0 to 1 is quantized to the 11 notes D4 E4 F#4 A4 B4 D5 E5 F#5 A5 B5 D6, with a glide of 35 ms between them. Left is low, right is high.
- **In the green zone** the tone gains an octave partial and a glass shimmer (A5) and rises 3 dB, so "now" is audible. Outside it is a plain sine.
- **Level**: 6 dB under a tiny sound (-36 dB active level). **Stop**: a 15 ms release when Stop is pressed, and then `repair.stop` plays by precision.
- The slider variant (reduced motion) uses the same tone, so a keyboard player hears where the slider is before pressing Stop.

## 5. What is deliberately silent, and why

| Silent | Why |
|---|---|
| Typing in any field: the alias, the search box, the reflection, the Exchange amounts | The player is writing; a key click is noise and tells a screen reader nothing |
| Hovering the dock, the HUD, drawer cards and any button | Hover is not intent. Only the world's hover (a tooltip with real information) has a tick |
| Keyboard focus moving | The screen reader speaks it |
| Scrolling a drawer, the Codex, the ledger | Nothing happened |
| The hour passing, the progress bars growing, the clock ticking | A tick every 7 s would make a metronome of the game |
| Lots appearing and leaving, buyers leaving, and buyers arriving at 16x and 64x (at slow speeds an arrival is one door bell at most every 6 s) | Frequent, low in value, and visible as a bubble and a badge |
| Info-level news, ledger rows, the Codex being read | The ticker carries them |
| Buyers' and cars' footsteps, crates landing, dust | They are the ambient's job |
| `haggle` and `auction` events | The sale or purchase they led to speaks |
| `inspect` with `fake` and no `caught`; any `score` | It would tell the player what they missed |
| `buy.fake`, an unverified buyer's `scam` flag, a lot's `truth`, rival limits, haggle reserve, `surplus` before the reveal | Hidden information (principle 6, section 1) |
| A `streak` of 1 | One win is not a streak |
| Every `announce()` | It is for the screen reader. Sound adds to the announcement and never replaces it |
| `day`, `cycle`, `buyer.arrive` and ambient one-shots at 16x and 64x | They would play at the tick rate |
| The title screen before the first gesture, and any screen until the player has clicked | Autoplay rules, and it is polite |
| The instructor dashboard's game sounds | A lecture hall with a projector; the instructor's ceremonies (`inst.cue`) are the only game sounds and can be switched off |

## 6. The ambient bed

### 6.1 What it is for

A bed makes each of the sixteen districts a place: a junkyard in wind, a market of voices, a harbor swelling, an exchange hall. It is **off by default** (it is unsolicited), at the very bottom of the mix (about -40 dBFS at default settings), and it carries no information that is not also visible. It exists only while the game screen is up and the player has turned it on.

### 6.2 The sixteen beds

Each bed is 3 to 6 layers: looped noise (the three shared buffers: white, pink, brown) through a lowpass, highpass or bandpass, with a slow level swell (`swell`) or a faster pulse (`pulse`), plus quiet sine drones that are notes of the key. Levels are linear gains before the bed's trim. Every bed is trimmed to -28 dB active level, so no district is louder than another.

| # | theme | Layers (noise colour, filter, level, movement; drones are sines in key) | Character | Trim dB | Centroid Hz |
|---|---|---|---|---|---|
| 1 | `scrap` | brown lp450 0.6 swell 0.06 Hz; pink bp1800 Q2 0.1 swell 0.21 Hz; white hp2500 0.04 pulse 11 Hz; drone D2 0.05 | wind over metal, a fire-barrel crackle | -7.1 | 2627 |
| 2 | `market` | pink bp600 0.5 swell 0.4 Hz; pink bp1400 0.3 swell 0.7 Hz; pink bp2800 0.14 swell 1.1 Hz; white hp6000 0.02 swell 0.3 Hz | a crowd: three babble bands, cloth rustle | -0.1 | 4085 |
| 3 | `campus` | pink lp900 0.35 swell 0.09 Hz; pink bp1000 0.15 swell 0.5 Hz; white hp5000 0.012 swell 0.2 Hz | a breeze and distant chatter; birds come as one-shots | 0.6 | 2393 |
| 4 | `pawn` | pink lp700 0.25 swell 0.08 Hz; drone D2 0.1; drone A2 0.06; white hp5000 0.012 pulse 6 Hz | a neon hum | -5.4 | 2458 |
| 5 | `metro` | brown lp300 0.7 swell 0.05 Hz; pink bp900 0.3 swell 0.17 Hz; pink bp3000 0.08 swell 0.31 Hz; drone A2 0.04 | traffic rumble, a city wash, cars passing | -9.0 | 1859 |
| 6 | `estate` | pink lp500 0.18 swell 0.04 Hz; pink bp2500 0.02 swell 0.1 Hz; drone D3 0.03 | room tone; a chime now and then | 2.6 | 845 |
| 7 | `auto` | brown lp200 0.6 pulse 22 Hz; pink bp1200 0.15 swell 0.3 Hz; white hp6000 0.04 pulse 7 Hz | an engine at idle, compressor hiss | -5.1 | 3654 |
| 8 | `harbor` | pink lp700 0.5 swell 0.11 Hz; white bp2600 0.07 swell 0.11 Hz; brown lp150 0.3; drone A2 0.03 | waves that swell every 9 s; gulls, a buoy, a ship horn | -3.9 | 1633 |
| 9 | `industrial` | brown lp180 0.55; drone D2 0.12; drone A2 0.06; pink bp600 0.2 swell 2 Hz; white hp4500 0.03 swell 0.15 Hz | machine hum, a conveyor at 2 Hz, steam | -9.8 | 3117 |
| 10 | `tech` | white bp9000 0.02; drone D2 0.08; pink lp600 0.12 swell 0.07 Hz | server air; blips as one-shots | -1.5 | 3942 |
| 11 | `farm` | pink lp800 0.3 swell 0.08 Hz; white bp5000 Q3 0.03 pulse 28 Hz; brown lp120 0.2 pulse 6 Hz | wind in grass, insects, a far tractor; wind chimes | 0.9 | 888 |
| 12 | `creative` | pink lp1200 0.15 swell 0.1 Hz; drone D3 0.03; drone A3 0.03; drone E4 0.025; drone F#4 0.025; pink bp2000 0.05 swell 0.3 Hz | a soft D add9 pad, a studio hum | -0.2 | 1286 |
| 13 | `corporate` | pink lp1200 0.3 swell 0.05 Hz; white hp7000 0.02; drone A2 0.04 | air conditioning; an elevator ding | -2.2 | 4211 |
| 14 | `finance` | pink bp1000 0.35 swell 0.6 Hz; white bp3200 0.05 pulse 14 Hz; drone D2 0.04 | a trading floor, ticker chatter, a phone | 2.6 | 3530 |
| 15 | `realty` | pink lp700 0.25 swell 0.07 Hz; pink bp2500 0.06 pulse 4 Hz; brown lp200 0.15 | wind, a sprinkler, a hammer far away | -1.0 | 719 |
| 16 | `exchange` | pink bp800 0.5 swell 0.2 Hz; pink bp2000 0.2 swell 0.35 Hz; white hp5000 0.03 pulse 3 Hz; drone D2 0.06; drone A2 0.05; drone F#3 0.03 | a vast hall, a departures board | -5.0 | 3361 |

### 6.3 Time, weather and wealth

These are added to the current bed as extra layers, faded in over 4 s, and do not re-normalise it (so they add a little level, shown below, measured on the named bed).

| Condition | Layers added | Level added | Centroid |
|---|---|---|---|
| night | night | +0.0 dB | 1636 Hz |
| rain | rain | +0.5 dB | 3332 Hz |
| tariff | tariff | +0.6 dB | 2575 Hz |
| wealth tier 3 and 4 | wealth3 | +0.5 dB | 3286 Hz |
| night and rain together | night + rain | +2.6 dB | 4156 Hz |

- **Night** (`world.night` from 0 to 1, read at most once a second, in four steps): the whole bed passes a lowpass whose cutoff falls from 9 kHz to 3.5 kHz; the texture layers fall 2 dB; the drones rise 2 dB; crickets (a 4.3 kHz band pulsing at 30 Hz) come in with `night`. The world already rate-limits its own night so it never strobes; the ambient follows it and never leads it.
- **Rain** is the credit crunch (`env.crunch`: a credit freeze or a rate rise), the same condition that draws the rain: a band of white noise 1.5 to 9 kHz and a low rumble, added at a level that raises the bed by about 0.6 dB, the bed's own cutoff lowered by a quarter, and a thunder one-shot every 40 to 90 s.
- **Surge** (`env.surge`, the TikTok window): the texture layers rise 1.5 dB and the lowpass opens 20%. No new sound.
- **Tariff** (`env.tariff`): a low A2 and E3 drone and a narrow 400 Hz band, quietly uneasy.
- **Wealth** is the tier (1 to 4) of the highest district you have opened. From tier 3 a soft D add9 pad (D3 A3 E4 F#4) is added; at tier 4 the pad is spread left and right and a very quiet feedback delay (two combs at 61 and 83 ms, feedback 0.3, lowpassed at 3 kHz, wet at -30 dB) gives the bed a hall. A richer place sounds richer.
- **Paused** or a **dialog** open: the bed ducks (3.5) and the one-shots stop. **Game over**: it fades out over 4 s. **Hidden tab**: the whole context suspends.

### 6.4 The one-shots and the engine

Sparse sounds on top of the bed (birds, a buoy, a ship horn, a phone, a departures board), each in the key, each at -32 dB active level on the ambient bus.

| id | where | every (s) | Recipe | Length ms | Centroid Hz |
|---|---|---|---|---|---|
| `amb.clank` | scrap, industrial | 14 to 40 | distant metal tap: bank D4 with partials 3 and 5, lowpass 3 kHz | 210 | 395 |
| `amb.bike-bell` | market, campus | 20 to 60 | two bright dings A6 | 380 | 3021 |
| `amb.chirp` | campus, realty, farm (day) | 8 to 25 | three short bird chirps gliding D6 to A6 to F#6 with a fast vibrato | 220 | 1509 |
| `amb.door-bell` | pawn, realty, estate | 25 to 80 | the shop bell D6 then A5, far and soft (lowpass 3 kHz) | 330 | 1709 |
| `amb.gull` | harbor (day) | 12 to 40 | a gull cry: A5 up to D6 and back over 400 ms with 6 Hz vibrato | 180 | 1627 |
| `amb.buoy` | harbor | 15 to 45 | a slow buoy bell A3, long decay | 870 | 389 |
| `amb.horn` | harbor | 60 to 140 | a far ship horn D2 and D3, 1.6 s, lowpassed | 1340 | 265 |
| `amb.steam` | industrial, auto | 10 to 35 | a steam burst: noise above 2.5 kHz, 450 ms | 240 | 4279 |
| `amb.blip` | tech | 10 to 30 | three quick sine blips D6 A6 F#6 | 180 | 1517 |
| `amb.windchime` | farm, estate, creative | 12 to 40 | three or four glass notes from D6 E6 F#6 A6 B6, irregularly spaced, 1.2 s tails | 1450 | 1918 |
| `amb.shutter` | creative | 20 to 60 | a camera shutter: two ticks 60 ms apart | 80 | 6075 |
| `amb.phone` | corporate, finance | 25 to 70 | a distant two-tone ring A5 F#5 x4, lowpass 2.5 kHz | 390 | 818 |
| `amb.flap` | exchange, finance | 12 to 35 | a departures board: fourteen ticks 25 ms apart, fading | 340 | 5878 |
| `amb.hammer` | realty, auto | 15 to 50 | three far knocks, 400 ms apart | 840 | 648 |
| `amb.cricket` | any, at night | 6 to 18 | a burst of cricket chirps: 4.3 kHz noise band pulsing at 30 Hz, three bursts | 330 | 5721 |
| `amb.thunder` | any, in a credit crunch | 40 to 90 | a rumble: brown noise below 160 Hz swelling over 400 ms and fading over 2 s | 1340 | 172 |
| `amb.chime` | estate, campus | 30 to 90 | a far tower chime: glass D4 A4 | 1090 | 419 |
| `amb.pluck` | creative | 20 to 60 | a soft guitar-like pluck on a pentatonic note, fast decay | 270 | 351 |

- **Scheduling.** One `setTimeout` chain, never an interval: the next one-shot is chosen from those allowed for the district, the time of day and the weather, at a random delay inside its "every" window (stretched by the speed gating of 3.4), at a random pan within 0.5, with a minimum of 4 s between any two. Idle and ambient-off cost nothing: no timer exists.
- **Crossfade.** When the district changes, the new bed fades in over 3 s while the old one fades out over 2 s and then stops its sources. At most two beds exist at once; a bed with every modifier is at most 10 layers (3 to 6 looped noise sources, the rest sine drones), each with one biquad and one LFO oscillator at most.
- **State.** The wiring calls `audio.ambient(state)` with `{ zone, theme, tier, night, rain, surge, tariff, paused, speed, dialog, over }` from the existing render path at most once a second, and only when something in it changed (a signature string). The call is a no-op while ambient is off or the context is not running.
- **Cost.** To be measured on a 2019 laptop in Chrome's Task Manager (test plan 10.5): the target is under 2% of one core with a bed and the one-shot chain running, and exactly zero timers and zero frame callbacks with the bed off.

## 7. Settings and controls

### 7.1 The model

Sound settings live in the existing `settings` object (`pc.settings.<slot>` in `localStorage`, `js/ui/common.js`), under one new key. The old boolean `settings.sound` stays, mirrored, so anything that reads it keeps working.

```js
settings.audio = {
  v: 1,
  master: 70,        // 0 to 100, step 5. Gain = (master / 100) ** 2, so 70 is -6 dB
  mute: false,
  ui: true,          // interface sounds: clicks, panels, dialogs, toggles, sliders, toasts
  game: true,        // the game and the world: sales, coins, the Deal Room's moves, alerts, progress
  ambient: false,    // the bed. Off until the player turns it on (it is unsolicited)
  ambientLevel: 70,  // 0 to 100, gain = (v / 100) ** 2 on top of the ambient bus
  dial: true,        // the repair dial tone (4.5)
  quiet: false,      // the Classroom preset: game sounds 6 dB lower, ambient forced off
  touched: false,    // the player has changed a sound setting by hand (stops the automatic Classroom preset)
  hinted: false,     // the one-time "sound is on" note has been shown
};
```

| Key | Default | Range | Read by |
|---|---|---|---|
| `master` | 70 | 0 to 100 | master gain |
| `mute` | false | boolean | master gain, the HUD speaker button, key M |
| `ui`, `game` | true | boolean | `audio.play` drops a request whose bus is off |
| `ambient` | false | boolean | the ambient controller (nothing is created while it is false) |
| `ambientLevel` | 70 | 0 to 100 | the ambient bus |
| `dial` | true | boolean | the dial tone loop |

**Migration** (`migrateAudio(settings, search)`, pure, tested):
1. `settings.audio` is an object with `v === 1`: every field is clamped (numbers to their range and step, booleans only when `=== true`), unknown keys are dropped.
2. Otherwise start from the defaults. If the old `settings.sound === false`, set `mute: true` (a player who turned sound off stays silent).
3. With no saved `audio` and a `?sound=` in the address: `off` mutes, `quiet` applies the Classroom preset, `full` keeps the defaults. An instructor can put it in the student link.
4. `applySettings()` writes `settings.sound = !settings.audio.mute` so old readers see the right thing, then saves and calls `audio.sync(settings.audio)`.

**Presets** (derived, never stored; the select shows "Custom" when nothing matches):

| Preset | master | ui | game | ambient | quiet |
|---|---|---|---|---|---|
| Full | 70 | on | on | off | off |
| Classroom | 40 | on | on, 6 dB lower | off | on |
| Interface only | 70 | on | off | off | off |
| Off | 70 | n/a | n/a | off | `mute` on |

**Joining a room.** A student who joins a classroom and has never touched a sound setting (`touched` is false) gets the Classroom preset, with one toast: "Sound is set to Classroom (quieter) in this room. You can change it in Display and sound." Thirty laptops each saying "cha-ching" is not a lesson. The instructor dashboard plays only its own `inst.cue` sounds.

### 7.2 The Sound section of "Display and sound"

The existing dialog (`settingsDialog`, titled "Accessibility and sound") keeps its four selects and gains a **Sound** section; the old "Sound effects On/Off" select becomes the Mute checkbox. Everything is a native control with a visible label, reachable by Tab, operable by keyboard, and read out.

| Control | Element | Label | Behaviour |
|---|---|---|---|
| Preset | `select` | Sound preset | Full, Classroom, Interface only, Off, Custom; choosing one sets the fields below and plays `ui.ok` |
| Volume | `input[type=range]` 0 to 100 step 5 | Volume | `aria-valuetext="70 percent"`; plays a `ui.tick` (full) on release so you hear the level; `ui.slider` ticks while dragging |
| Mute | checkbox | Mute all sound | the HUD speaker button and key M stay in step |
| Interface | checkbox | Interface sounds (clicks, panels, dialogs) | |
| Game | checkbox | Game sounds (sales, coins, alerts, the Deal Room) | |
| Ambient | checkbox | Background ambience | hint under it: "Off by default. A quiet bed for each district." |
| Ambient level | range | Ambience level | disabled while ambient is off |
| Dial | checkbox | Repair dial tone | hint: "Hear where the marker is while you time a repair." |
| Sample | button | Play a sample | plays `ui.tick`, `cash.in` m and `alert.advance` 1 in turn, 600 ms apart |
| Status | text, `role="status"` | | "Sound is on. Your browser started audio after your first click." / "Sound is off." / "This browser cannot play sound; everything in the game still works." (and all controls disabled) |

Under the section: "Sound is made in your browser. Nothing is downloaded and nothing is recorded." The wording is plain and warm like the rest of the dialog; every setting is stored only in this browser, like the others.

### 7.3 The speaker button and the M key

- A new `ibtn` in the HUD's `.ctl` group (`js/ui/hud.js`), before Help: a speaker glyph (`aria-hidden`), `aria-pressed` for "muted", accessible name "Mute sound" / "Unmute sound". It toggles `mute`. It is hidden if Web Audio is unsupported.
- Key **M** toggles mute whenever focus is not in a field and no modifier is held (next to the 1 to 7 shortcuts in `shell.js`'s keydown). The Help dialog gets one more line: "Press M to mute or unmute sound."
- A mute is never silent about itself: muting plays nothing (it is muted), unmuting plays `ui.ok`; the button's state change is announced by its name.

### 7.4 The first minute

- The title screen is silent and creates no audio context (browsers forbid it and some log a warning).
- The first `pointerdown`, `keydown` or `touchend` anywhere creates or resumes the context (7.5); that same press plays its tick, which is why a first click can sound a few milliseconds late.
- When the first game screen mounts with sound on and `hinted` false, one info toast: "Sound effects are on. Press M or the speaker button to mute them." (read out by the live region), then `hinted: true`. It is not shown in an Academy lesson's sandbox or in a room.

### 7.5 Lifecycle, autoplay and failure

- **Create on a gesture.** `audio.unlock()` is called by a capture listener on `document` for `pointerdown`, `keydown` and `touchend`; it creates the `AudioContext` the first time (with `latencyHint: 'interactive'`; `webkitAudioContext` as a fallback) and calls `resume()` otherwise. No context exists before that, so there is nothing to warn about. A play request before it is dropped, not queued.
- **Never log.** Every `resume()`, `suspend()` and `start()` is inside a try/catch that swallows rejections silently. A context in `interrupted` (iOS) or `suspended` state is "locked" until the next gesture.
- **Hidden tab.** `visibilitychange`: hidden suspends the context and stops the ambient timer; visible resumes it (the resume is allowed to fail quietly until the next gesture). No sound is played for events replayed while catching up.
- **Idle.** After 60 s with no voice and no ambient, the context is suspended (the audio hardware sleeps); the next play resumes it (a few ms).
- **Missing Web Audio, or a failure anywhere.** `audio.state` is `'unsupported'`; every method returns at once; nothing throws; the settings section says so. A thrown error inside any recipe is caught per play and the voice is dropped.
- **Cleanup.** `destroy()` stops every voice and disconnects the buses; the shell calls it with the rest of `mountGame`'s teardown. No listener survives the screen.

### 7.6 Accessibility notes

- WCAG 2.2 1.4.2 (Audio Control): nothing plays automatically. The only audio that can run longer than 3 seconds without a press is the ambient bed, which is opt-in, has its own switch and volume, and is stopped by Mute or M.
- 2.3.1 and 2.2.2 are unaffected: no sound is tied to a flash, and nothing blinks to the beat.
- The system's "reduce motion" does not mute sound (it is a different need); it does keep the repair dial as a slider, whose tone still plays.
- A player who cannot hear loses nothing: section 9.

## 8. The engine API

### 8.1 Files

All new, under `js/audio/`, imported by the shell; none is imported by `js/engine.js`, `js/deal.js` or `js/play/` (the engine stays DOM-free).

| File | What |
|---|---|
| `js/audio/palette.js` | The key (`hz`, `inKey`), the shared noise buffers, the layer renderer and voice builders (`mar`, `gls`, `bellL`, `coin`, `wood`, `thump`, `paper`, `swoosh`, `stamp`, `brass`, `horn`, `click`, `sparkle`), `moneySize`, the soft-clip curve: lifted from `dev/audio-proto/synth.js` and `sounds.js` |
| `js/audio/recipes.js` | The sound map as data: `RECIPES[id] = { bus, tier, cd, variants, build }`, with the calibrated trims baked in (Appendix A) |
| `js/audio/ambient.js` | `BEDS`, `MODS`, `ONE_SHOTS` and the `Ambient` controller |
| `js/audio/engine.js` | `createAudio()`: context lifecycle, buses, master chain, voice manager, limiter and queue, settings sync |
| `js/audio/wire.js` | `wireAudio(ctx)`: the event table (4.1, 4.2) and the control table (4.3) |
| `js/audio/settings.js` | `audioDefaults`, `migrateAudio`, `presetOf`, `audioSettingsHTML`, `bindAudioSettings` |
| `js/audio/index.js` | `export const audio = createAudio(...)`, `export { wireAudio }`, `export const legacySfx` |

### 8.2 The engine

```js
const audio = createAudio({ get: () => settings.audio, now: () => performance.now() });

audio.play(id, opts?)       // -> a voice handle, or null when dropped. opts:
                            //   variant   'm', 'win', ... (default: the id's first)
                            //   params    {n: 3, i: 2, ...} for the families that take a number (ui.crate n, ui.select i, streak n, clock i, bid.raise n, acad.step i, ui.slider v)
                            //   size      's'|'m'|'l'|'xl' shortcut for cash.in and cash.out
                            //   pan       -1..1 (already scaled to 0.6 by the caller's helper)
                            //   where     'here' (default) | 'elsewhere' (8 dB down, 2.5 kHz lowpass) | 'offscreen' (4 dB down, 3.5 kHz)
                            //   gainDb    extra trim (the accent under a coin layer plays -4)
                            //   cause     'money' | 'result' | 'toast' | 'alias' | none: the causal group of 3.4
                            //   delay     seconds from now
audio.playMix([['sale.win', {...}], ['cash.in', {size:'m', gainDb:-4}]])   // sound and coins as one cause, counted once against the buckets
audio.stop(handle); audio.stopAll()

audio.unlock()              // from a gesture
audio.state                 // 'unsupported' | 'locked' | 'running' | 'suspended'
audio.sync(settings.audio)  // apply master, mute, bus switches, ambient, dial, quiet
audio.setMaster(v); audio.setMute(b); audio.setBus('ui'|'game', on); audio.setAmbient(on); audio.setAmbientLevel(v); audio.setDial(on); audio.applyPreset(name)
audio.ambient(state)        // 6.4; cheap and idempotent
audio.dial                  // { start(), update(pos, lo, hi), stop() } the repair tone (4.5)
audio.on(fn)                // 'state' | 'settings' | 'mute' changes, for the HUD button and the dialog
audio.stats()               // { active, dropped: {cooldown, bucket, cap, bus, locked}, played: {id: n} } for tests and the console
audio.ids(); audio.variants(id)
audio.render(id, variant, offlineCtx, opts)   // the same voice into an OfflineAudioContext: the test plan's hook
audio.destroy()
```

`audio.play` does, in order: bus switch then locked check then per-id cooldown then bucket then causal group then moment queue (for the serial list) then voice cap and stealing then build, schedule, connect then ducking then stats. Each stage is a pure function over a small state object so a fake clock can test it.

### 8.3 `wireAudio(ctx)`

The one entry point, called from `mountGame` right after `attachGame()`:

```js
// js/ui/shell.js, in mountGame
ctx.audio = audio;
const unwire = wireAudio(ctx);        // returns a function that removes everything it installed
// ... and in destroy(): unwire();
```

What it installs, and nothing else:

1. `ctx.on(fn)` for engine events (4.1) and shell `ui` events.
2. `S.on(fn)` for session events: `note`, `offer`, `rewound`, `tick` (for ambient state at most once a second and the catch-up detection).
3. Progress hooks: the shell's `onComplete` and `onCodex` already toast; they call `audio.play` through two lines.
4. One capture-phase `click` listener, one `change` and one `input` listener on `document`, looking the control up in the 4.3 table by `data-act`, `data-deal`, `data-wv`, `data-change`, with the element's state as it was before the action.
5. A `MutationObserver` on `#dlg` (`open`, `class`), `#toasts` (children) and `#drawer` (`hidden`).
6. World hooks (8.5): `hover` and `activate` get the sound before they act.
7. The dial loop (4.5), started and stopped by the dialog observer.
8. Wiring is **inside `try`**: a handler that throws logs once and is disabled; the game never breaks for sound.

### 8.4 The legacy names

`common.js` exports `sfx = { kaching, buzz, level, blip, alarm }` and tests substitute `ctx.sfx`. Both stay. The five become thin aliases through the causal groups (so a call site not yet migrated cannot double an event's sound):

| Legacy call | Becomes | Cause |
|---|---|---|
| `sfx.kaching()` | `cash.in` m | `alias` (dropped if a money sound played in the last 700 ms) |
| `sfx.buzz()` | `ui.refuse` | `alias` |
| `sfx.level()` | `quest.complete` | `alias` (dropped if a moment played in the last 1.5 s) |
| `sfx.blip()` | `ui.ok` | `alias` |
| `sfx.alarm()` | `alert.advance` level 2 | `alias` (dropped inside its cooldown) |

The 20 call sites that `grep -rn "sfx\." js` finds outside `common.js` are then removed one by one in later changes (each is replaced by the event it already follows, so they are redundant). `ctx.sfx` and `ctx.audio` are both on the drawer context. Code and tests that go through `ctx.audio` always write `ctx.audio?.play?.(...)`, and `tests/helpers/ctx.mjs` gets `audio: new Proxy({}, { get: () => () => {} })` beside its `sfx` stand-in.

### 8.5 Where the existing code is touched

Small, local and additive. Each line is a call into `ctx.audio` or a constant; none changes behaviour when audio is unsupported.

| File | Change | Lines |
|---|---|---|
| `js/ui/common.js` | the sound block (`tone`, `sfx`) becomes the aliases of 8.4; `settings` gains `audio` through `migrateAudio`; `applySettings` mirrors `sound` and calls `audio.sync`; `settingsDialog` gets the Sound section of 7.2 and its Mute select goes. The focus code in `dlg` and `initDialog` is not touched | about 40 |
| `js/ui/shell.js` | `ctx.audio`; `wireAudio` and `unwire`; `closeDrawer` emits `{type:'ui', ui:'close-drawer', id}`; key M; the legacy `sound:` of the alert queue and the 5 `sfx.*` calls stay until the clean-up | about 12 |
| `js/ui/hud.js` | the speaker button | 3 |
| `js/ui/worldview.js` | `hover` calls `ctx.audio?.world?.hover(h)`, `activate` calls `ctx.audio?.world?.pick(h, ground)`. If a change here must be avoided, `wireAudio` wraps `world.api.hover` and `world.api.activate` instead | 2 |
| `js/engine.js` | optional, additive: a `kind` string in the extras of eleven `note` calls (`scam`, `counterfeit`, `settle`, `freight-arrive`, `customs`, `damage`, `mentor`, `sla`, `overdraft`, `fatigue`, `burnout`), and `reason: 'scam' \| 'counterfeit' \| 'nofit'` on the `pitch` event's rejected cases. Without it the wiring matches the note text and uses `gain: -1` for a scam; a test pins the texts | about 14 |
| `js/meta/ids.js` | `EVENT_PAYLOAD.pitch` gains `reason` (documentation of the payload) | 1 |
| `js/ui/academy.js` | `stepChanged`, `win`, `showReward`, `ac-pick`, `ac-reveal` call `audio.play` for `acad.*` (the existing `sfx.level()` in `win` and `showReward` become these) | 6 |
| `index.html` | none | 0 |

**Deliberately not touched**: `js/ui/deal.js` (the Deal Room is read from `[data-deal]` clicks, the dialog's class and the dial's inline styles, so the finishing branch can edit it freely), `js/ui/draft.js`, `js/ui/instructor.js`, `js/ui/drawers/*` (their `ctx.sfx` calls are aliased), `js/main.js`, `css/`, and every test except the one stand-in line. The Deal Room's result card calls `ctx.sfx.kaching/buzz/blip` today; through the aliases and the causal group those become nothing after a sale and `deal.result`-like cues otherwise, until the clean-up moves them.

## 9. Sound is never the only cue

For every sound, the counterpart is in its row of the map. The audit found **five places** where the sound would be the first or only signal and the visual is weak. Each is closed with a small addition made with the sound (not a dependency of it):

| Sound | What exists | Gap | Close it with |
|---|---|---|---|
| `buyer.urgent` | A bubble over the buyer; a count on the Market dock button (`aria-label` "N waiting", not live) | Not announced | polite `announce("A buyer needs a <need> now.")`, at most once a minute |
| `ship.arrive` | The truck disappears; an info note shows only in the ticker (info notes are not toasted) | Not announced | polite `announce(note.text)` |
| `cash.in` settle | An info note in the ticker | Not announced | polite `announce(note.text)` |
| `mentor.tip` | An info note in the ticker, which can be hidden behind a more important note | Easy to miss | an info toast for notes of `kind: mentor` |
| `swap.offer-in` | A badge on the Market dock and the Invitations list | Not announced | polite `announce("<name> sent you a swap offer.")` |

Everything else already has a toast (a note of level good, warn or bad is toasted and read), a dialog, a result card, a changed number or a moved object. The ones worth naming:

- Money: the HUD cash flashes (`.rs.up`, `.rs.down`), the world pops "+$x" over a building, a sale throws coins, and the ledger has the row.
- Haggle and auction: every move says what happened in words ("They are very close", "Rival bid $x", "You are out"), with the event log.
- Repair: the dial and its green zone are visual; `aria-valuetext` on the slider says where it is. The tone is an addition.
- Alerts: a dialog with the code and readout; the toast; the ticker.
- `world.hover`: the tooltip, and the keyboard list of everything in view.
- Clock: the button's icon, `aria-pressed`, the speed value.
- Ambient: nothing in it is information that is not also drawn (rain, night, the district's colour).

The same rule is a test: for each sound id in `RECIPES`, the map names a counterpart, and the five additions above are in the test list (10.2).

## 10. Test plan

### 10.1 Offline render, in headless Chrome (exists today: `dev/audio-proto/`)

`node dev/audio-proto/run.mjs` serves the folder, opens `audition.html` with `scripts/cdp.mjs`, renders every variant twice through an `OfflineAudioContext` (mono, 48 kHz, no master chain, jitter off), computes the numbers below, and calibrates the trims. `node dev/audio-proto/audit.mjs` then audits the data. Thresholds become assertions in `tests/audio-render.test.mjs` when the engine lands (it skips without Chrome, like the other browser tests).

| Check | Threshold | Today |
|---|---|---|
| Active level per tier (K-weighted) | tiny -30, medium -24, loud -19, ambient one-shot -32; within 2 dB (loud) | exact after trim; 8 loud held 0 to 1.6 dB under |
| Single-sound peak before the buses | at most -6 dBFS (loud -5) | tiny -14.1 at the most, medium -6.3, loud -5.0 |
| Length | at most 3.0 s | 2.74 s at the most (`run.end` horizon) |
| Tail at the declared length | below -50 dBFS (no cut-off click) | 0 failures of 207 |
| Largest sample-to-sample step | at most 0.25 of full scale (no pops) | 0 failures |
| DC offset | at most 0.002 | 0.0010 at the most |
| Not finite | none | none |
| Spectral centroid | at most 6,000 Hz | 5695 Hz at the most |
| Every pitch in key; no raw frequency; no out-of-key partial louder than -26 dB | exact | 0 problems |
| Direction | 28 sounds rise and 22 fall by at least 1.5 semitones (list in `audit.mjs`) | 0 problems |
| Brightness | gain brighter than loss in 14 pairs | 0 problems |
| Size ladders longer step by step | 8 ladders | 0 problems |
| Distinct | no two ids closer than 1.0 dB RMS in the spectral fingerprint; pairs under 6 dB are allow-listed as families | closest 2.8 dB (`ui.crate#pick1` and `haggle.move#hold`) |
| Layer balance | no tone or bank layer more than 18 dB under its mix; a noise layer under 26 dB must carry `ghost: true` | 0 tone or bank layers; 42 noise layers to flag (clicks inside coins and showers, the paper in results) |
| Worst case through the chain | at most -3.0 dBFS at master 1.0 | 12 loudest at once: -4.1 dBFS |
| Beds | -28.0 dB active level, peak under -11 dBFS, centroid under 5 kHz | all 16 on target; centroids 719 to 4,211 Hz |

### 10.2 Node tests (no browser, a fake clock and a fake context)

- **Settings.** `migrateAudio`: no saved audio; `sound: false` becomes `mute`; a saved `audio` with junk, strings, out-of-range numbers and unknown keys is clamped; `?sound=` variants; presets round-trip through `presetOf`; `applySettings` keeps `settings.sound` in step.
- **`moneySize`.** The thresholds of 2.4 at $40.99, $41, $1,779, $1,780, $74,999, $75,000; the 20% bump; negative and zero amounts; non-finite input.
- **Wiring coverage (table-driven from 4.1 and 4.2).** Feed one event for every type in `EVENT_TYPES` and every payload variant in 4.1 into `wireAudio` with a recording `audio` stub; assert the ids and params. A new event type with no row fails the test.
- **Hidden information (a property test).** Two `buy` events that differ only in `fake` produce identical calls; so do two `inspect` events that differ in `fake` or `score` with `caught: false`; two `auction` events that differ in `surplus`; a `pitch` rejected with and without a scam flag when no `scam` note preceded it.
- **Gating.** 1,000 requests in one second: no more than 12 voices, per-id cooldowns held, tiny dropped before medium, loud steals instead of being dropped; each speed row of 3.4; merging of `cycle`; the moment queue order and its 3 s expiry; the causal groups (a sale then a result card; a note then a toast; each legacy alias after its event).
- **Failure.** `AudioContext` missing: every method returns without throwing and `state` is `'unsupported'`. A recipe that throws is dropped and logged once. Malformed events (missing fields, non-numbers, a string for `amount`) never throw.
- **Counterparts.** Each of the five additions of section 9 appears in `wireAudio`'s output as an `announce` or toast call.
- **Aliases.** `sfx.kaching`, `buzz`, `level`, `blip`, `alarm` exist and call `audio.play`; `tests/ui-*.test.mjs` pass unchanged with their `ctx.sfx` stand-ins.

### 10.3 Headless Chrome, the real page

- **Autoplay.** Load the app: no console message containing "AudioContext" before the first gesture; after `Input.dispatchMouseEvent` `audio.state === 'running'`; after `visibilitychange` hidden, `'suspended'`; after visible and a press, `'running'`.
- **A driven session.** Start a bot game (`tests/bot.mjs` through `scripts/boot.mjs`), play three virtual days at 1x and 64x, record every `audio.play`. Assert: tiny sounds never exceed 8 in any one second; no `day.turn`, `buyer.arrive` or ambient one-shot at 64x; every recorded id exists; no console error. Compare the recorded id sequence to a stored transcript for the same seed (reviewed when the engine changes).
- **Controls.** Press every dock button, open and close every drawer, open the Deal Room in each of its stages (Quick), toggle the settings: the recorded sound for each matches 4.3.
- **No timers when idle.** With sound on and ambient off, spy on `setInterval`, `setTimeout` and `requestAnimationFrame` from the audio modules: none while the game is idle. With ambient on: one `setTimeout` chain, no frame callbacks.

### 10.4 Load

Chrome's `AudioRenderCapacity` (`context.renderCapacity`, Chrome 126 and later) reports the audio thread's load. Assert an average load under 0.05 with a bed running, under 0.25 and no underrun while the 12 loudest sounds play at once. In browsers without it, the test skips and the figure is read by hand from Chrome's Task Manager.

### 10.5 Listening (a person, with headphones and then laptop speakers)

The audition page lists every sound. A checklist for the first review:

1. Play each family in order. Does each sound like what it is named for? Anything harsh, thin or fatiguing?
2. **Gain and loss, blind.** Give five listeners 20 unlabelled sounds (ten gains and losses, five warnings, five neutral). Target: at least 90% right on gain against loss.
3. Play a busy minute: ten sales, a level-up and a quest at once. Does the loud moment stand clear, and does the queue make it one moment?
4. Loudest sound at full volume: comfortable? Quietest sound at the default volume: audible on laptop speakers?
5. **Mono**: fold the output to mono; do any two sounds cancel or get confused?
6. The bed for each district for 20 minutes: welcome or tiring? Does night and rain read?
7. Safari and Firefox: any sound that renders very differently (the soft clip guarantees the ceiling, not the taste).
8. Classroom: ten laptops in a room on the Classroom preset: bearable?

## 11. Hand-off

### 11.1 Build order

Each step merges on its own and leaves the game working and, until step 4, silent or as it is today.

1. **Palette and engine.** `js/audio/palette.js`, `recipes.js` (from `dev/audio-proto/`, trims baked in), `engine.js`; the offline render test.
2. **Settings.** `settings.js`, the Sound section, the HUD button, key M, migration, the Node tests.
3. **Interface sounds.** `wireAudio` with the 4.3 table, dialogs, toasts, drawers; the aliases in `common.js`.
4. **Game sounds.** The event table 4.1 and 4.2; the engine `kind` and `reason` additions; the five counterpart additions of section 9.
5. **The Deal Room and the world.** Stage sounds, the dial tone, world hover and pick.
6. **Ambient.** `ambient.js`, the state call, the beds, the load test.
7. **Clean-up.** Remove the 20 legacy `sfx` calls the events replace; keep the aliases.

### 11.2 Merge notes

The finishing branch (`v2/finish`) is editing `js/ui/deal.js`, `academy.js`, `css/ui-deal.css`, `common.js`' focus code, `stock.js`, `instructor.js`, `draft.js`, `main.js`, docs and `index.html`. This design touches `common.js` only in the sound block and `settingsDialog`, `academy.js` in six lines, `stock.js` and `deal.js` not at all, and adds only new files besides. Expect one trivial conflict at most (the Academy lines).

### 11.3 For the author to decide

1. **Default.** Interface and game sound on at 70%, ambient off. Should the first run start muted instead, with only the toast offering sound? (It would be the safest in a lecture hall; it would also make most students never hear the game.)
2. **Classroom.** The automatic Classroom preset on joining a room: right default? A further step would be an instructor switch in the room protocol (a `sound` field on the `clock` message) that forces Classroom on every student; not designed here.
3. **Repair dial tone** on by default: it helps everyone time the marker, but it is a continuous tone.
4. **Instructor ceremonies.** `inst.cue` on by default on the dashboard, or off with the rest of the game sounds?
5. **A visual "sound caption"** for projectors and demos (a small label at the screen's foot naming the last loud sound): not designed; the counterparts already carry the information.
6. **Mono and pan.** Pan is limited to 0.6 so one earbud is never alone; an explicit "Mono" setting is not designed.
7. **Safari and Firefox** need a listening pass before shipping (10.5, item 7).

---

## Appendix A. Measured levels and trims

The measurements of 10.1, by tier (variants; active level in dB; peak in dBFS before the buses; length in ms):

| Tier | Variants | Active level | Peak | Length (min / median / max) | Held by the peak ceiling |
|---|---|---|---|---|---|
| tiny | 100 | -30.0 to -30.0 | -20.8 to -14.1 | 30 / 170 / 870 | 0 |
| medium | 67 | -24.0 to -24.0 | -14.9 to -6.3 | 120 / 480 / 1270 | 0 |
| loud | 22 | -20.6 to -19.0 | -6.9 to -5.0 | 770 / 1290 / 2740 | 8 |
| ambient one-shot | 18 | -32.0 to -32.0 | -22.0 to -12.0 | 80 / 340 / 1450 | 0 |

Trims in dB, one per variant (`id#variant`), applied as a single gain on each voice; they are the only thing the calibration changes (`dev/audio-proto/trims.json` is the file, `makeup` is the compressor constant of 3.7):

```json
{"ui.tick#light":-12.6,"ui.tick#full":-13.2,"ui.toggle#on":-10.8,"ui.toggle#off":-8.5,"ui.select#i0":-12,"ui.select#i5":-13,"ui.crate#pick1":-11.9,"ui.crate#pick8":-12.4,"ui.crate#clear":-6.5,"ui.drawer-open#stock":-11.2,"ui.drawer-open#market":-10.7,"ui.drawer-open#crew":-10.9,"ui.drawer-open#bank":-10.7,"ui.drawer-open#travel":-10.5,"ui.drawer-open#codex":-8.2,"ui.drawer-open#quests":-11.1,"ui.drawer-close#d":-6.4,"ui.dialog-open#d":-8.1,"ui.dialog-close#d":-7.1,"ui.ask#normal":-12.4,"ui.ask#danger":-12.2,"ui.refuse#r":-7.1,"ui.nudge#n":-13.6,"ui.ok#o":-12.5,"ui.slider#mid":-9.4,"ui.slider#top":-14.7,"ui.slider#zero":-11.5,"ui.count-up#c":-7.6,"clock#pause":-14.3,"clock#resume":-11.5,"clock#speed4":-9.1,"cam#in":-4.9,"cam#out":-5.2,"cam#fit":-0.5,"cam#home":-8.7,"world.hover#buyer":-8.9,"world.hover#lot":-10.2,"world.hover#crate":-8.9,"world.hover#building":-8.1,"world.hover#locked":-10.9,"world.locked#l":-3.6,"world.step#a":-11.7,"world.step#b":-12,"zone.enter#t1":-11.2,"zone.enter#t4":-11.4,"buyer.arrive#b":-12.7,"buyer.urgent#u":-8.3,"day.turn#d":-13.2,"cash.in#s":-12.5,"cash.in#m":-7,"cash.in#l":-7.2,"cash.in#xl":-5.3,"cash.in#settle":-6.7,"cash.out#s":-8.3,"cash.out#m":-9.6,"cash.out#l":-5,"sale.win#w":-9.4,"sale.pioneer#p":-9.2,"sale.herd#h":-5.8,"sale.flat#f":-7.4,"sale.reject#nofit":-5.1,"sale.reject#fake":-6.2,"sale.scam#s":-6,"buy.lot#ok":-10,"buy.lot#broken":-8.9,"pool.sell#p":-3.8,"streak#n2":-10.9,"streak#n6":-13.1,"manager.cycle#gain":-14.7,"manager.cycle#loss":-9.8,"deal.open#sell":-7.1,"deal.open#buy":-3.1,"deal.open#fix":-6,"deal.stage-done#s":-13.2,"deal.quick#q":-8.2,"deal.verify#ok":-12.5,"deal.verify#bad":-8.2,"deal.result#good":-7.1,"deal.result#warn":-7.3,"deal.result#bad":-7.2,"deal.result#info":-11.9,"read.probe#look":-4.5,"read.probe#serial":-1.8,"read.probe#power":-7.1,"read.probe#papers":0,"read.probe#expert":-10.6,"read.caught#c":-7.8,"pitch.angle#prestige":-11.6,"pitch.angle#utility":-12.5,"pitch.angle#scarcity":-5.9,"pitch.angle#price":-13.3,"pitch.angle#story":-8.7,"pitch.angle#drop":-9.3,"pitch.fit#up":-12.4,"pitch.fit#down":-12.5,"haggle.anchor#high":-13.4,"haggle.anchor#fair":-14.1,"haggle.anchor#low":-11.3,"haggle.move#hold":-13,"haggle.move#small":-10.6,"haggle.move#large":-9.7,"haggle.move#split":-11.8,"haggle.leverage#l":-8.1,"haggle.close#accept":-5.5,"haggle.close#walk":-8,"haggle.tell#far":-11,"haggle.tell#reach":-12.4,"haggle.tell#near":-16,"bid.raise#r1":-10.5,"bid.raise#r5":-11,"bid.rival#in":-10.1,"bid.rival#out":-9.2,"bid.drop#d":-5.4,"bid.hammer#won":-9.2,"bid.hammer#lost":-9.3,"repair.stop#perfect":-9.9,"repair.stop#good":-14.3,"repair.stop#ok":-12.7,"repair.stop#miss":-10.1,"repair.done#great":-8.5,"repair.done#ok":-3.2,"repair.done#rough":-6.2,"hire.manager#student":-6.2,"hire.manager#broker":-6.4,"hire.manager#logistics":-6,"crew.build#level":-6.3,"crew.build#upgrade":-4.3,"crew.client#smb":-7.2,"crew.client#ent":-10.2,"ship.depart#s":-6.2,"ship.arrive#a":-10.6,"ship.trouble#customs":-9.3,"ship.trouble#damage":-4.7,"bank.draw#b":-3.3,"bank.repay#half":-5,"bank.repay#full":-6.2,"bank.repay#free":-4.9,"audit.notice#a":-5.5,"audit.result#pass":-8,"audit.result#fail":-6.2,"alert.advance#l1":-6,"alert.advance#l2":-7.6,"alert.advance#l3":-5.1,"alert.shock#tiktok":-1.6,"alert.shock#fed":-3.7,"alert.shock#tariff":-5,"alert.shock#viral":-10.3,"alert.shock#glut":-6.4,"alert.shock#scare":-5.3,"alert.margin-call#m":-7.8,"alert.insolvent#i":-4.5,"perk.bailout#bailout":-4.2,"perk.bailout#waived":-7,"quest.complete#quest":-8.9,"quest.complete#daily":-9.1,"achievement#common":-8.2,"achievement#rare":-9.3,"achievement#epic":-7.1,"codex.unlock#c":-12.2,"mentor.tip#t":-12,"level.up#l":-6.9,"level.up#big":-8.4,"skill.up#s":-7.7,"milestone#m1":-5.3,"milestone#m2":-5,"milestone#m3":-6.2,"zone.open#t1":-10.9,"zone.open#t4":-7.6,"swap.offer-in#o":-5.8,"swap.done#d":-5.3,"acad.step#s0":-12.2,"acad.step#s5":-13.4,"acad.teach#right":-9.3,"acad.teach#wrong":-10.9,"acad.teach#reveal":-9.2,"acad.win#goal":-10.5,"acad.win#reward":-4.6,"acad.graduate#g":-5.6,"draft.pick#slot1":-11.7,"draft.pick#slot2":-12.1,"draft.pick#complete":-9.2,"draft.pick#drop":-8.2,"draft.begin#b":-5.6,"run.end#horizon":-3.9,"run.end#start":-2.6,"run.end#done":-8.5,"inst.cue#deploy":-9.2,"inst.cue#start":-12,"inst.cue#rewind":-3.9}
```

## Appendix B. The prototype

| File | What |
|---|---|
| `dev/audio-proto/synth.js` | the key, the shared noise, the layer renderer, `voice()`, the master chain and the soft clip |
| `dev/audio-proto/sounds.js` | the 88 ids with their meta and builders |
| `dev/audio-proto/ambient.js` | the 16 beds, 4 modifiers and 18 one-shots |
| `dev/audio-proto/measure.js` | the offline measurements (level, peak, length, centroid, tail, step, layer balance, fingerprints, worst case) |
| `dev/audio-proto/run.mjs` | drives headless Chrome, calibrates, writes `trims.json` and the full result |
| `dev/audio-proto/audit.mjs` | the Node audits of 10.1 |
| `dev/audio-proto/audition.html` | every sound on a button, through the real master chain (`npm start`, then `/dev/audio-proto/audition.html`) |
| `dev/audio-proto/trims.json` | the calibrated trims |
