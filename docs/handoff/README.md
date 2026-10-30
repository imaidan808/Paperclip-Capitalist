# docs/handoff: what is in this folder

Written at the end of the cloud session of 2026-10-29 and 2026-10-30 (branch `v2/cloud-audit`). Read `docs/CLOUD_HANDOFF.md` first (what is done, what is open, what is next, what needs the author), then this file for the data behind it. To start the next session, paste `docs/handoff/NEXT_SESSION_PROMPT.md`.

| File | What it is | Status |
|---|---|---|
| `audit-round1-findings.json` | The 40 findings the audit's finders reported before the run was stopped (the engine, the Deal Room, the relay and the static server): for each the scenario, the repro they ran and what it printed, a fix sketch, a test sketch, whether it needs the author (`authorDecision`), and `status`: `repaired` (with the test that holds it) or `open`. | Data. Each finding was reproduced by its author; **no skeptic pass was run**. Lenses that never reported: session, content, docs, privacy, balance, ui, a11y, perf. |
| `art-judge-round1.json` | The six independent judges that reported (whole island from far; coast, sea and bridges at working zoom; three lenses each): scores for change, quality and edges per shot, and every issue with its region, severity, track and fix. | Data, for the pictures as they stood before the three repairs in `docs/RENDER_PLAN.md` section 14. Six of twelve judges ran; the districts, buildings, props and characters were not judged. |
| `workflows/audit-round.js` | The Claude Code `Workflow` script that produced the audit file: lenses `engine, deal, session, security, content, docs, privacy, balance, ui, a11y, perf`, two angles each (static reading, dynamic running), a duplicate pass, then skeptics who try to refute each finding. Arguments are described at the top (`worktree`, `round`, `lenses`, `known`, `note`). | Reusable. It needs a git worktree of the tree under audit with `server/node_modules` linked in. |
| `workflows/art-judge.js` | The script that produced the judge file: judges per area and lens with before/after PNGs from `scripts/world-shots.mjs` and `scripts/world-ab.mjs`, then a collation into a repair list by track. Arguments: `before`, `after`, `ab`, `round`, `areas`, `prior`. | Reusable. |
| `audio-open-items-r2.json`, `repair-open-items.json` | The open-item lists the cloud session started from. | The sound items are all done and merged; the other list was not used. Kept for the record. |
| `audio-r3e.patch`, `audio-r3x.patch`, `repair2-card.patch` | Half-written work of interrupted tracks. | **Superseded: finished and merged** (the sound branch; the card commits `d00f6b6` and `af6db6f`). Do not apply them. |

## What the repository does not hold

- **The two conversations** (the session that wrote the first handoff and the cloud session): not in the repository. What they decided is in `docs/CLOUD_HANDOFF.md`, `docs/RENDER_PLAN.md` section 14, `docs/ARCHITECTURE.md` and the commit messages.
- **Rendered pictures** (the 27-shot sets, the `adcd991` baseline, the A/B sheets) and **sweep output**: regenerate them (below); the rig is deterministic, so the same build gives the same pixels on one machine.
- **The finders' working notes and the judges' crops**: only their reports are kept (the two JSON files).

## How to regenerate what is not here

```bash
# the baseline, from the commit the art is judged against (a second worktree and server; the rig needs its own Chrome port per run)
git fetch origin && git worktree add /tmp/pc-base adcd991
(cd /tmp/pc-base && PORT=8503 node server/static.mjs &)       # the baseline
PORT=8504 node server/static.mjs &                              # the tree under judgement
node scripts/world-shots.mjs --base http://localhost:8503 --out /tmp/shots-adcd991 --dsf 2
node scripts/world-shots.mjs --base http://localhost:8504 --out /tmp/shots-now --dsf 2
node scripts/world-ab.mjs /tmp/shots-adcd991 /tmp/shots-now /tmp/ab-now            # side-by-side sheets for the judges
# hit testing against the baseline (the presentation-only guard): tests/world-hits.test.mjs does this in one command;
# by hand: shoot both with --hits 24 (the new one also with --exact-hits) and compare with node scripts/world-hits.mjs A_DIR B_DIR
# the Academy card's matrix sweep (about 20 minutes on 4 cores at std; --level full is the whole product)
node scripts/academy-sweep.mjs --level std --sizes 844x390,640x360,360x640,768x1024 --jobs 2 --json /tmp/sweep.json
# the sound gate
node scripts/audio-check.mjs --calibrate --pools
```

## Lessons about working on this machine

- **Agents are the expensive part.** The credit limit was reached with about ten Workflow agents running for two hours; solo work and waiting for tests costs a few dollars an hour. Read what a workflow has reported (`journal.jsonl` in its transcript folder) before starting another, and stop the ones you are not going to act on.
- **Four shared cores.** Browser tests fail by timeout when the machine is loaded; run one alone before treating it as a fault (`node --test --test-name-pattern="..." tests/FILE.test.mjs`). The ones known to flake are in `docs/CLOUD_HANDOFF.md`.
- **Kill Chrome and servers by PID.** `pkill -f pattern` kills the shell that carries the pattern; leftover headless Chrome from a killed test keeps eating CPU.
- **Never a bare `git stash`** (the stack is shared with other worktrees); use a temporary commit or copy the file aside. When a test fails "without the fix", restore the fixed file straight after (`git diff --stat` shows it).
- **Define shell variables inside the same command** (`S=...` in each call): an unset `$S` in `--out $S/dir` writes to `/dir`, and the safety check will rightly refuse to clean it up.
