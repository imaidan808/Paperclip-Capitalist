# Security, privacy and compliance: honest status

This repository is a **static web app plus an optional message relay**. It is built to make a compliant hosted service straightforward, but a static GitHub Pages deployment is **not** itself SOC 2, HECVAT, LTI or FERPA certified, and nothing in this repo should be presented to a procurement office as if it were.

## What this build does today
| Area | Status | Detail |
|---|---|---|
| No student PII collected | Implemented | The only identifiers are a random Founder ID (`PC-XXXX`) and a self-chosen alias. No names, emails, accounts or analytics scripts. No third-party requests. |
| Data location | Implemented | Game state lives in the browser's `localStorage` only (`pc.*` keys). Rooms exchange gameplay numbers, the random Founder ID and the alias the student chose, never a name or an account. |
| Relay server | Implemented, minimal | Forwards messages and keeps the **latest snapshot per founder in memory** for late joiners. Nothing is written to disk and payloads are never logged. A room holds 400 connections and a relay 200 rooms (`MAX_ROOM`, `MAX_ROOMS`). A connection brings a secret key its browser keeps beside its Founder ID, and an instructor's also the room's owner token; the relay keeps only a hash of each, to refuse another connection that claims the same ID or the instructor's seat (`docs/ARCHITECTURE.md`, who is who). |
| Encryption in transit | Deploy-time | Use `wss://` behind TLS (any host that terminates TLS 1.2+ works). The code does not weaken it. |
| Accessibility | Implemented, self-assessed | WCAG 2.2 AA targeted: contrast ratios are checked in `tests/a11y.test.mjs` for both themes, keyboard operable, native dialogs, live-region announcements, reduced motion, text sizing, 24px minimum targets. A formal audit and a VPAT still need to be done by a human. |
| Student deletion | Implemented | "Start over" in the menu deletes the current run (the save and its daily checkpoints). The Founder ID, alias, identity key, settings, Academy progress and debrief notes stay until the site's data is cleared in the browser, which deletes everything the game kept. |
| No cookies, no third parties | Implemented, checked | The game stores in `localStorage` (keys that start with `pc.`) and, for a student tab in a room between the tabs of one browser, one entry in that tab's `sessionStorage` (`pc.tab`, the name of the tab's own slot, gone when the tab closes). No cookies, no analytics, no fonts, scripts or images from another host: the staged page and its stylesheets are checked to ask for nothing outside the site (`scripts/stage.mjs`, `tests/finish-site.test.mjs`). The only network connection the code can open is a WebSocket to a relay address a person types in. |
| What a crawler and a link preview see | Implemented | The page has a description, a canonical address, Open Graph and Twitter cards, a schema.org description, a `noscript` message, a 404 page, `robots.txt`, `sitemap.xml` and `llms.txt`; none of them contains student data (there is none on the site). `robots.txt` and `sitemap.xml` are written for the address https://imaidan808.github.io/Paperclip-Capitalist/ (case-sensitive: the lower-case path is a 404 on the real host, and the staging check and `tests/site-address.test.mjs` refuse it). Crawlers read `robots.txt` only at the root of a host, so on a GitHub project site it takes effect with a custom domain or a user site, and the sitemap can be given to a search engine's console directly. |
| Custom domain | Not set up | None is configured. With one, the address in `scripts/stage.mjs`, `index.html`, `404.html`, `robots.txt`, `sitemap.xml` and `llms.txt` changes (the launch test lists every place), and a `CNAME` file would be added to what is staged. |

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

## Data inventory (this build)
| Element | Where | Retention | Removal |
|---|---|---|---|
| Founder ID, alias | Browser; relay memory while connected | Until cleared | Clear site data (Start over keeps them); relay forgets on disconnect and restart |
| Identity key (every student) and owner token (an instructor's, shown as the recovery code) | Browser; a hash of each in relay memory | Until cleared; the relay forgets a room 10 minutes after it empties | Clear site data (Start over keeps them). Anyone who has an owner token can run that room, so the instructor keeps it like a password |
| Game state and ledger | Browser | Until cleared | Start over, or clear site data |
| Gradebook export | Instructor's download | Instructor's control | Delete the file |

## HECVAT crosswalk (for your IT office's first conversation)
Data governance, identity, in-transit security and accessibility are addressed by the design above. Hosting, at-rest encryption, DR and certifications are **deployment responsibilities** that this repository cannot satisfy by itself.
