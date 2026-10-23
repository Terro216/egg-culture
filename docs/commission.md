# Комиссия по форме / The Form Commission

Implementation contract for the unlisted game requested on 22 October 2026.

## Release boundaries

- Routes: `/ru/commission/` and `/en/commission/`. No incoming link from any
  existing page, catalogue, sitemap, robots.txt, public profile or service worker.
- Both HTML and API responses carry `X-Robots-Tag: noindex, nofollow, noarchive`.
  The game document also has a robots meta tag. This is an unlisted release,
  not password protection: anyone given the URL can play.
- All new code is in Commission-specific files. Do not edit the simultaneously
  changing EggUntangle or roadRecords implementation.
- Reuse the existing account session. Keep new progress/achievements private
  inside the game while it is unlisted. An explicit daily-score publication
  can appear only in the game's own daily standings.
- Dedicated commit containing only this game's files. Production image must
  derive from the then-current running image, not an unreviewed working tree.
  Recheck base image immediately before recreating only `web`.

## Required game

- Twelve authored shifts, six recurring characters, five tools, 24 authored
  cases and coherent seeded ordinary cases; RU/EN parity.
- Work budget charged for actions, not reading. Tool observations are stable.
  Physical truth, evidence, regulations and deliberate decisions remain distinct.
- Inspection, weighing, candling, destructive sample examination and registry.
  Touch/mouse/keyboard inspection, readable measurements and comparisons.
- Accept, reasoned reject, two bounded deferrals, one accountable guarantee per
  shift after introduction. Consequences and receipt after every decision.
- Per-shift report, budget, penalties, justified appeals, purchases, relationship
  changes and authored evening choices. Warnings and actual dismissal.
- Nine discoverable exhibits, three provable case threads and four earned
  endings with character epilogues; campaign restart and shift retry.
- Deterministic daily shift, stable Moscow date, equal equipment, server-derived
  result and opt-in standings. No campaign morality leaderboard.
- Autosave each meaningful action. Guest/local play, same-account cloud resume,
  explicit guest import, account isolation, revision conflicts and retry.
- Private achievements, completed-case review, regulations, help, sound settings,
  reduced motion, responsive portrait/mobile layout and recoverable errors.

## Surface brief

Mode: Experience. Preserve the established cream/ink/brass Egg Culture world.
The visitor operates an actual inspection desk. An asymmetric work surface has
an instrument and rotating egg in the main area, the passport/comparison on the
right, and a physical decision strip below. The first viewport proves the
inspection mechanism. Intro/brief/report are distinct paper documents, not a
marketing page. Mobile switches between large specimens and documents while
retaining pinned measurements. Typography uses the project's self-hosted Lora
and Playfair Display, with tabular sans-serif instrument readings. Use Three.js
for the specimen, precise vector geometry for instruments, actual HTML for text.
Movement and sound communicate instrument state and the finality of stamping.

## Verification before completion

## Persistence and recovery

## Mobile playtest revision (23 October 2026)

Player feedback identified automatic tool verdicts, unclear resources and dossier
purpose, an obscured shift counter, and a clipped specimen shadow. The revision
keeps the existing campaign, case seeds, accounts and saved action histories.

Verification: 365 tests passed on the production-based candidate, including
12 new workbench tests (full campaign, legacy fifth-shift resume, bad readings,
wrong archive revisions, deferral preservation, dossier pairing and input
bounds). Final and rebased candidates also passed TypeScript, the production build and all 33 Commission tests.


The revised campaign was completed through the browser at 390px, including
hold/return, the fifth-shift guarantee and exemption, political appeals, all
three conclusions and the open ending. English daily duty finished at 800
points. Desktop, 390px and 320px checks, keyboard/pointer rotation, a hidden
crack, visibly rotating candling, incorrect measurement/revision feedback,
prepared-tool reload and a legacy fifth-shift import passed. Registration,
explicit guest import, two-device resume, offline/conflict handling, account
isolation and opt-in daily publication/withdrawal passed on the rebased image.
No page errors or HTTP 5xx were observed.

A parallel site release changed production during verification. The final game
image was rebuilt from `sha256:f1fc167bcf46e379cd2db9c1bfaa783db4d34972e83293fdbe8e4044f0eeaafc`;
345 source/public/script/document/test files were preserved exactly, and the
changed/added paths were limited to this game's 14 files. Only `web` was
recreated. Release image:
`sha256:43e8c46155e38fc9604d4207bc780b9460814223b7661a78d2e0deb0ab7ff81e`,
tag `egg-culture-web:commission-revision-20261023`.

Public RU/EN mobile checks passed with GET/HEAD-only browser transport. Both
unlisted routes retain noindex/no-store and remain absent from navigation,
game catalogues, sitemap and robots. Health is healthy, restart count zero;
environment, mounts and networks are unchanged. The poller reported a recent
successful poll and no blocked delivery. All 79 other continuing containers
retained their IDs; the separate `tick-laugh-browser-check` temporary container
was no longer running at the second inventory and was not touched by this work.
