# Copy: how the game speaks

The voice is dignified and assured. It says what is true, in the fewest words, and leaves the rest to the player. Detail is there when asked for: a hover, a fold, a Codex page. It is never in front.

## Rules

1. **Say it once.** A fact in the panel is not repeated in a callout above it.
2. **Statements, not questions.** A scene or a description states. It does not ask "Can you...?" or "Who needs what you hold?".
3. **No filler, no cheer.** No "simply", "basically", "truly", "let's", "welcome", "great job", no exclamation marks in lessons, no slogans after a task ("Steady hands win.").
4. **One idea per line.** A coach line is one action. A result opens on one idea and folds the rest.
5. **Numbers are the engine's.** A figure in a lesson, a Codex page or a card is recomputed by a test from the engine. Where the text and the engine disagree, the text changes, or the code is flagged.
6. **The player's words.** Name a control as the screen does (Look it over, Done reading, Quick deal). The tests read the screens' sources for those labels.
7. **American spelling**, "district" never "zone", no em or en dashes, no emoji: the interface draws its icons or goes without. The drawings are in `js/art/g-*.js` (flat, one family at a time: docs/ART_DIRECTION.md 3.6 says how to add one) and the screens show them through `js/ui/glyphs.js`; a glyph is decorative (`aria-hidden`) and the words stay beside it, so no sentence leans on a picture.
8. **Never "free"** in public copy (README, llms.txt, index.html, 404.html): the game is sold to universities.
9. **A hover defines; the screen instructs.** Hover adds detail. What a choice turns on is printed, and a fact that changes what the reader does is also in a fold or a screen-reader span: a `title` is not shown on a keyboard or a touch screen.

## Where the words live

| What the player reads | Where |
|---|---|
| Title, Help, menu, end of run | `js/main.js`, `js/ui/shell.js` |
| The Draft: Backgrounds, specialty | `js/data/perks.js` (`gain` and `loss` are the card's headlines; `strength` and `cost` are the exact claims, shown on hover and focus), `js/config.js` (SKILLS), `js/ui/draft.js` |
| The Academy: scene, coach lines, hints, gist, why, math, question | `js/meta/academy.js` (the file's header lists what each field is for), `js/ui/academy.js` (cards), `css/ui-academy.css` |
| The Codex | `js/meta/codex.js`, `js/ui/drawers/codex.js` (a page opens on its summary; explanation, math and mistakes fold) |
| Drawers | `js/ui/drawers/*.js`. A district's rule, reward and lesson are written once, from the data and the Codex's own titles, in `js/ui/drawers/districttext.js`: Travel and Market print them and nothing restates them. |
| District rules, buyers' lines, the Backgrounds' exact claims, skills, upgrades, clients, loans | `js/data/*.js`, `js/config.js`. A district has no blurb: what makes it different is its rules, printed from the data. A buyer's line is the character's voice, short and in character. |
| The Deal Room: stages, result | `js/ui/deal.js`, `js/deal.js`, `js/play/*.js` (a buyer's lines are the character's, not the game's voice) |
| Quests and the Goal card | `js/meta/quests.js` |
| Debrief, instructor | `js/ui/debrief.js`, `js/ui/instructor.js`, `docs/FACULTY_KIT.md` |
| Engine notes, refusals and the ticker | `js/engine.js`, `js/session.js`, `js/config.js` (EVENTS, AUDIT_THEMES). A note a sound depends on carries a `kind` (and `amt`, `z`): reword it freely, never drop the tag. One message for one action: a result that carries the facts writes no second note |
| The Cash and Net worth windows, the settings dialog | `js/ui/shell.js` (`worthRows`), `js/ui/common.js`, `js/audio/settings.js`. What a row is for is its hover for a mouse and the same words in the fold under the section for a keyboard and a finger (a title reaches neither); the footnote folds |

## What holds it

- `tests/copy.test.mjs`: the claims against the engine (net worth, exit), the Backgrounds' headlines against their full claims, the banned phrases, the folded result.
- `tests/copy2-data.test.mjs`, `copy2-debrief.test.mjs` and `copy2-debrief-mount.test.mjs`, `copy2-deal.test.mjs`, `copy2-drawers.test.mjs`, `copy2-messages.test.mjs`: every claim the second pass corrected, recomputed from the engine or the config; each fails on the old text. The data, deal, Debrief and drawers files hold the figures in the words they print; the messages file: the sound of every note the engine writes is held by its kind, not its words; the figures in notes and refusals are recomputed from the engine and the config; the Breakdown adds up to the net worth.
- `tests/meta-academy.test.mjs`: every number a lesson quotes, and the limits (scene 80 to 190 characters, a coach line 30 to 200, a gist 60 to 160).
- `tests/meta-codex.test.mjs`: every figure a Codex page quotes.
- `tests/guard-emoji.test.mjs`: no emoji and no icon symbol in anything the site ships, as a character, an escape or an entity. A ratchet: the count only goes down as the icons are drawn (74 after part 3: the 72 goods and the two gavels on an auction lot's tag are left), and the last part of the icons work makes it zero. It also holds the classes that went without an icon (buyers, managers, clients, districts, Backgrounds, quests, badges, bounties, Codex pages, lessons) to none, and every dock tab, district and Background to a drawn glyph. `tests/ui-avatar.test.mjs`: the discs, their tones and the contrast of their initials. `tests/glyph-style.test.mjs`: the style of the drawings (the shapes, the tones and their contrast on every dark surface, what a drawing shows, the renderers, the marks CSS draws, forced colors). `tests/ui-glyphs.test.mjs`: every thing in the data has its drawing, the dock, every id a screen writes is drawn and every drawing is shown, and the markup is decorative or named.
- `tests/page-budget.test.mjs`: the first screen has a limit (`BUDGET.firstKB`, 320 KB gzipped since 2026-11-03). Words cost bytes: the fold styles are written once in `css/styles.css`.

A test that pins a sentence is a claim about the engine or a label on a screen. Change the sentence and the pin together, and say why in the commit.
