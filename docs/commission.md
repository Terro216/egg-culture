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

- Pure-engine campaign traversal, every ending and dismissal, all violations,
  unsupported decisions, limits, deferrals, appeals, deterministic daily cases,
  exact replay, malformed saves and terminal-state guards.
- Store/API: session/owner isolation, origin/size/rate checks, CAS conflicts,
  replay validation, private progress, opt-in daily ranking and persistence.
- Browser: actual complete campaign and daily play, desktop/mobile RU/EN,
  keyboard, all tools, receipts, evidence, ending, reload, storage failures,
  two-device account resume, offline retry and account changes.
- Rendered screenshots examined at 1440, 390 and 320px. No page errors,
  clipped controls, mandatory drag, colour-only signals or unreadable fields.
- Full candidate check/build/tests, exact image identity, public direct routes,
  no discovery from existing pages/sitemap/robots/bundles, neighboring-game smoke.
- Existing tables/files/volumes preserved, SQLite integrity, actual health and
  restart count, unchanged neighboring containers. Record rollback and commit.

## Verification evidence (22 October 2026)

- Production-based candidate: the 284 existing source/public/script/document
  files were compared by SHA-256; none was changed or removed. The unrelated
  five-file editorial worktree remains outside the release.
- Astro production build and full TypeScript check passed. All 353 repository
  tests passed, including 21 Commission engine/storage tests. The tests traverse
  all four earned endings and dismissal, including replay validation.
- `scripts/verify-commission.mjs` drives actual browser controls through all
  twelve shifts, one deferred/returned case, a personal guarantee, appeals,
  all three dossier conclusions and the open-record ending. A separate English
  daily shift ends with eight correct decisions and 800 points.
- Browser account checks cover registration, explicit guest import, two-browser
  continuation, failed/offline writes, divergent histories and conflict choice,
  new-account isolation, refusal of stale-owner writes, daily opt-in/withdrawal,
  and blocked local storage. No personal production account was used.
- Examined screenshots at 1440, 390 and 320 CSS pixels in both locales. Five
  tools, reduced motion, actual keyboard rotation, save import/export and the
  downloadable service record were exercised. No page errors, failed server
  responses or horizontal document overflow in these runs.
- API checks: unsupported locale 404, malformed slot 400, missing origin 403,
  wrong content type 415, anonymous write 401, stale owner 409. Direct HTML
  carries private/no-store and noindex/nofollow/noarchive. Existing RU/EN home,
  games and profile pages, sitemap, robots.txt and Egg Road service worker have
  no reference to the new route or game bundle.

Browser checks only accept a loopback preview address and intercept all requests,
including account requests, so they cannot write to the production domain. Set
`PLAYWRIGHT_MODULE` to the installed module entry and `CHROMIUM_EXECUTABLE` to the
installed browser, then run with Node `--experimental-strip-types`.
`COMMISSION_CHECK=play`, `accounts` and `final` split the full acceptance run;
`accounts` and `final` reuse the transcripts recorded by `play`.

## Persistence and recovery

There is no new service, volume, credential or backup destination. The three
Commission tables share the existing `egg-road/records.sqlite`; the application's
SQLite Online Backup snapshot includes every table. The DE copy completed on
21 October at 04:22 UTC, listed Egg Culture as fresh, and reported successful
data and restore verification. No paused cloud job was enabled.

A pre-release snapshot was created and validated with the existing backup image
in `/tmp/egg-commission-recovery-20261022/pre-release` on big-one, separately from
the build context. It covers the existing accounts, game records, Book and images.
New tables are additive; the previous application image can run against the same
database without removing them.

## Deployment transport correction

Recreating web exposed an unavailable direct Telegram route. TLS probes to the
previous pinned address and the current DNS address timed out, while the existing
`cinemarr-tgbot-proxy:3128` tunnel returned Telegram's normal redirect. All previous
runtime settings were independently confirmed unchanged after normalizing Docker
array order; the failure was the direct network path.

The existing web Compose service now joins the existing `media_net` and uses
Node's environment proxy support through that tunnel. `NO_PROXY` preserves local
poller callbacks. No proxy service, credential or message was created. The obsolete
direct-address pin was removed. Recreating only web applies this correction; it
does not rebuild or restart the neighboring tunnel or media services. The original
application image remains tagged `egg-culture-web:rollback-before-commission-20261022`.

## Verified production outcome

The released image is
`sha256:6a76e69c7c4cf76f13a06a259aa78650281d8eff81d239d9dc143f2ba761528c`.
Both direct game routes returned 200 with noindex/no-store; public RU/EN browser
checks also covered Games and Untangle without page errors. Web is healthy with
zero restarts, fresh successful moderation polling and no blocked delivery.
All 79 neighboring container identities and the two existing data mounts stayed
unchanged. The 17 pre-existing tables retained identical contents, and the Book
and images retained identical hashes. Only the three empty Commission tables
were added during the release; test accounts and scores stayed in isolated previews.

## Mobile playtest revision (23 October 2026)

Player feedback identified automatic tool verdicts, unclear resources and dossier
purpose, an obscured shift counter, and a clipped specimen shadow. The revision
keeps the existing campaign, case seeds, accounts and saved action histories.

- Resource display uses rubles and minutes. One existing time unit is five
  minutes; old balances and purchases are unchanged. Preparing the desk adds
  twenty minutes, confirmed in the following shift's briefing. Reading and
  rotating have no real-time countdown.
- Selecting a tool opens its workbench. `prepare` pays once and survives reload;
  `examine` records the player's observation and raw measurement/reference.
  Old `tool` actions remain replayable without resetting completed checks.
- Inspection requires four visible sides, with explicit progress and keyboard,
  pointer and button controls. Cracks are seeded on one of the other three
  sides. Candling has asymmetric internal geometry and an adjustable measuring
  line; the player compares depth with the passport's fresh/aged range.
- The scale starts with an empty pan; from day five its zero can drift. The dish
  supplies observed traits and a four-style reference. Neither announces a
  conformity verdict before the player records an observation.
- The registry contains neighboring lots and older revisions. Compare lot,
  revision, seal, signature specimen, provenance and expiry with the passport.
  The fifth-shift exemption names Arkady's batch explicitly; Asya's expired
  certificate requires a separate decision. Wrong measurements/revisions are
  evaluated when the player signs, with actionable review feedback.
- The dossier explains its optional investigation role, shows collected
  documents, and asks the player to select two exhibits supporting a conclusion.
  `connect` validates ownership and independent corroboration. Legacy `file`
  actions remain valid. An acquired exhibit is signposted at the desk.
- The shift counter is prominent and stays visible while scrolling on phones.
  Required checks are available above the instruments, with an explicit next
  step after recording. The contact shadow has no light-frustum clipping edge;
  rotation controls occupy space outside the rendering canvas.

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

The protected, validated pre-release snapshot is at
`/tmp/egg-commission-recovery-20261023/pre-release` on big-one. A read-only
post-release database check returned `ok`; the existing saved campaign replayed
successfully (1 checked, 1 valid, 0 invalid), without printing account contents.
The previous image is tagged
`egg-culture-web:rollback-before-commission-revision-20261023`. Legacy actions
remain supported by the new version; the old binary cannot parse newly recorded
`prepare`/`examine`/`connect` actions. Preserve the volume and any new transcripts
when diagnosing a rollback; do not overwrite live progress with the snapshot.
Browser evidence is retained in `/tmp/egg-commission-browser-20261023` and build,
source-parity and release audits in `/tmp/egg-commission-revision-20261023`.
