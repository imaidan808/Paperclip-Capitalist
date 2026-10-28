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

## Data inventory (this build)
| Element | Where | Retention | Removal |
|---|---|---|---|
| Founder ID, alias | Browser; relay memory while connected | Until cleared | Start over, or clear site data; relay forgets on disconnect and restart |
| Game state and ledger | Browser | Until cleared | As above |
| Gradebook export | Instructor's download | Instructor's control | Delete the file |

## HECVAT crosswalk (for your IT office's first conversation)
Data governance, identity, in-transit security and accessibility are addressed by the design above. Hosting, at-rest encryption, DR and certifications are **deployment responsibilities** that this repository cannot satisfy by itself.
