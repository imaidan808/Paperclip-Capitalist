# Security, privacy and compliance: honest status

This repository is a **static web app plus an optional message relay**. It is built to make a compliant hosted service straightforward, but a static GitHub Pages deployment is **not** itself SOC 2, HECVAT, LTI or FERPA certified, and nothing in this repo should be presented to a procurement office as if it were.

## What this build does today
| Area | Status | Detail |
|---|---|---|
| No student PII collected | Implemented | The only identifiers are a random Founder ID (`PC-XXXX`) and a self-chosen alias. No names, emails, accounts or analytics scripts. No third-party requests. |
| Data location | Implemented | Game state lives in the browser's `localStorage` only (`pc.*` keys). Rooms exchange gameplay numbers, never identity. |
| Relay server | Implemented, minimal | Forwards messages and keeps the **latest snapshot per founder in memory** for late joiners. Nothing is written to disk and payloads are never logged. Rooms are capped at 400. |
| Encryption in transit | Deploy-time | Use `wss://` behind TLS (any host that terminates TLS 1.2+ works). The code does not weaken it. |
| Accessibility | Implemented, self-assessed | WCAG 2.2 AA targeted: contrast ratios are checked in `tests/a11y.test.mjs` for both themes, keyboard operable, native dialogs, live-region announcements, reduced motion, text sizing, 24px minimum targets. A formal audit and a VPAT still need to be done by a human. |
| Student deletion | Implemented | "Start over" in the menu deletes local data; clearing site data does too. |

## What is NOT implemented (and what would be needed)
| Requirement in the brief | Status | Needed |
|---|---|---|
| LTI 1.3 Advantage, grade passback | Not implemented | A hosted backend with a registered tool and JWKS endpoint (for example `ltijs`), then map the gradebook export to Assignment and Grade Services. For now: **export CSV and import it into the LMS gradebook.** |
| SAML 2.0 / OIDC SSO | Not implemented | Delegate to the LMS launch (LTI) or an identity proxy; never store credentials. |
| SOC 2 Type II, ISO 27001 hosting | Not applicable to this repo | An organizational attestation for whoever operates the hosted service, plus a cloud account with the matching reports. |
| AES-256 at rest, HSM key management | Not applicable yet | No server-side database exists. A hosted version should use managed disk encryption and a KMS. |
| 15-minute snapshots, RPO 15 min, RTO 2 h | Not applicable yet | Needs a database. A Postgres host with point-in-time recovery meets this. |
| Retention schedule (30/90 days, 24 h breach notification) | Process, not code | Write into the contract and the ops runbook. The server-side data model in `docs/ARCHITECTURE.md` is designed so each element can be purged on that schedule. |
| Authoritative server for tamper resistance | Not implemented | Today clients are trusted (fine for a class, not for an exam). The planned server runs the same `engine.js` and validates trades. |

## Sound (WCAG 2.2: 1.4.2 Audio Control, 2.1.4, never the only cue)
The sound layer (`docs/AUDIO.md`) is generated in the browser: no audio files, nothing recorded, settings stored only in the student's browser. Status, self-assessed:

| Requirement | Status | Detail |
|---|---|---|
| Nothing plays by itself | Implemented | The title is silent and no audio context exists until the first press; a browser that blocks audio, or has none, leaves the game fully playable. |
| 1.4.2: audio that runs longer than 3 s has a control | Implemented | The only sounds that can run longer than 3 s without a press are the ambient bed and the repair dial tone. Both are opt-in (off until the student switches them on) and off in the Classroom preset. Mute, key **M** and the speaker button stop them in every window; the Deal Room, where the tone runs, has a Sound toggle and a Dial tone switch of its own. |
| 2.1.4: a single-key shortcut | Implemented | Key M can be switched off under Display and sound; the speaker button stays. |
| Classroom (a room is not thirty laptops playing coins) | Implemented | A student who joins a room gets the quieter Classroom preset from the Join press, with one note, restored on leaving; a student's own sound settings are never overridden. The instructor's **Quiet sound link** can add `?sound=quiet` to the student link. |
| Sound is never the only cue | Implemented, self-assessed | Every sound has a visual or written counterpart (`docs/AUDIO.md` section 9). The one skill game that depends on timing, the repair dial, has **Careful: pay more, no timing**, a slider under reduced motion and an optional tone for players who cannot see it. |
| Announcements while a dialog is open | Implemented, checked in Chrome's accessibility tree | A live region outside a modal dialog is not in the tree, so what is said while the Deal Room or the settings are open is said inside them. Not yet run with NVDA, JAWS or VoiceOver: a human audit is still needed. |
| Listening on laptop speakers, Safari and Firefox | Not verified | Levels are measured by program; the ear is a person's job (`docs/AUDIO.md` 10.5). |

## Data inventory (this build)
| Element | Where | Retention | Removal |
|---|---|---|---|
| Founder ID, alias | Browser; relay memory while connected | Until cleared | Start over, or clear site data; relay forgets on disconnect and restart |
| Game state and ledger | Browser | Until cleared | As above |
| Gradebook export | Instructor's download | Instructor's control | Delete the file |

## HECVAT crosswalk (for your IT office's first conversation)
Data governance, identity, in-transit security and accessibility are addressed by the design above. Hosting, at-rest encryption, DR and certifications are **deployment responsibilities** that this repository cannot satisfy by itself.
