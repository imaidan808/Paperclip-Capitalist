# Copy: how the game speaks

The voice is dignified and assured. It says what is true, in the fewest words, and leaves the rest to the player. Detail is there when asked for: a hover, a fold, a Codex page. It is never in front.

## Rules

1. **Say it once.** A fact in the panel is not repeated in a callout above it.
2. **Statements, not questions.** A scene or a description states. It does not ask "Can you...?" or "Who needs what you hold?".
3. **No filler, no cheer.** No "simply", "basically", "truly", "let's", "welcome", "great job", no exclamation marks in lessons, no slogans after a task ("Steady hands win.").
4. **One idea per line.** A coach line is one action. A result opens on one idea and folds the rest.
5. **Numbers are the engine's.** A figure in a lesson, a Codex page or a card is recomputed by a test from the engine. Where the text and the engine disagree, the text changes, or the code is flagged.
6. **The player's words.** Name a control as the screen does (Look it over, Done reading, Quick deal). The tests read the screens' sources for those labels.
7. **American spelling**, "district" never "zone", no em or en dashes, no emoji in prose.
8. **Never "free"** in public copy (README, llms.txt, index.html, 404.html): the game is sold to universities.

## Where the words live

| What the player reads | Where |
|---|---|
| Title, Help, menu, end of run | `js/main.js`, `js/ui/shell.js` |
| The Draft: Backgrounds, specialty | `js/data/perks.js` (`gain` and `loss` are the card's headlines; `strength` and `cost` are the exact claims, shown on hover and focus), `js/config.js` (SKILLS), `js/ui/draft.js` |
| The Academy: scene, coach lines, hints, gist, why, math, question | `js/meta/academy.js` (the file's header lists what each field is for), `js/ui/academy.js` (cards), `css/ui-academy.css` |
| The Codex | `js/meta/codex.js`, `js/ui/drawers/codex.js` (a page opens on its summary; explanation, math and mistakes fold) |
| Drawers | `js/ui/drawers/*.js` |
| The Deal Room: stages, result | `js/ui/deal.js`, `js/deal.js`, `js/play/*.js` (a buyer's lines are the character's, not the game's voice) |
| Quests and the Goal card | `js/meta/quests.js` |
| Debrief, instructor | `js/ui/debrief.js`, `js/ui/instructor.js`, `docs/FACULTY_KIT.md` |
| Engine notes, refusals and the ticker | `js/engine.js`, `js/session.js`, `js/config.js` (EVENTS, AUDIT_THEMES). A note a sound depends on carries a `kind` (and `amt`, `z`): reword it freely, never drop the tag. One message for one action: a result that carries the facts writes no second note |
| The Cash and Net worth windows, the settings dialog | `js/ui/shell.js` (`worthRows`), `js/ui/common.js`, `js/audio/settings.js`. What a row is for is its hover; the footnote folds |

## What holds it

- `tests/copy.test.mjs`: the claims against the engine (net worth, exit), the Backgrounds' headlines against their full claims, the banned phrases, the folded result.
- `tests/copy2-messages.test.mjs`: the sound of every note the engine writes is held by its kind, not its words; the figures in notes and refusals are recomputed from the engine and the config; the Breakdown adds up to the net worth.
- `tests/meta-academy.test.mjs`: every number a lesson quotes, and the limits (scene 80 to 190 characters, a coach line 30 to 200, a gist 60 to 160).
- `tests/meta-codex.test.mjs`: every figure a Codex page quotes.
- `tests/page-budget.test.mjs`: the first screen is 300 KB gzipped. Words cost bytes: the fold styles are written once in `css/styles.css`.

A test that pins a sentence is a claim about the engine or a label on a screen. Change the sentence and the pin together, and say why in the commit.
