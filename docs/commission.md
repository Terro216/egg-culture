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

