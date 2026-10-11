# Straight test road — 2026-09-24

Open `/ru/play/?road=EGG3-S-8-0` or enter `EGG3-S-8-0` in the existing seed field. No additional mode-menu button.

The dedicated `S` code selects a fixed 5,000 m road, 10.6 m wide, with a constant 12.5% downward grade and no turns, bridges, banking or other variations. It uses normal version-3 physics, rhythm, jump recharge, scoring and finish geometry. Level 8 reaches the existing level-based speed allowance cap; progress and rhythm must still be earned normally. Existing R/E codes retain their geometry. This is a named test layout, not a lucky random seed.

`trackSpec.ts` shares selection between worker generation, the fallback, direct simulation and server finish validation. The code round-trips through sharing, retries, saved maps and result records. Records have their own per-code leaderboard and appear in the finite-road filter; they do not count toward the endless best or advance level progress.

Validation: 178 tests passed, including a full 5km physical drive with ordinary steering and rhythm, strict code parsing, worker serialization, finish plausibility and separate records. Games typecheck and isolated Astro build passed. Browser checks passed for RU/EN, 320px mobile, worker and unavailable-worker fallback, shared link, typed code, steering and jump; mode menu still has four buttons.

Artifacts: `/tmp/egg-road-straight/`; deployment evidence: `/tmp/egg-road-straight-deploy-20260924/`.

Published only `web` as `egg-culture-web:release-road-straight-20260924`, image `sha256:2d2257a5651c5855b0fb88d29e648f2f0168aef9e8fc45d132f6b003dd3d3686`. Runtime healthy with zero restarts. Public RU/EN direct link, code input, start/jump/pause, daily-map switch and settings passed without page errors or failed requests; 18 served asset hashes matched the image. Configuration, volumes, all database table rows, Kladka files and 64 neighbouring containers were unchanged. SQLite integrity: `ok`. Rollback image: `egg-culture-web:rollback-before-road-straight-20260924`; private database snapshot retained on big-one in the deployment evidence directory.
