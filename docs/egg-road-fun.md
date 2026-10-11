# Fun roads — 2026-09-24

This describes the initial five-road release. The follow-up adds a sixth road, an occlusion silhouette and a completion achievement: [speed plunge and progression](egg-road-velocity.md).

A collapsed “Прикольные трассы” / “Fun roads” section sits at the bottom of the game panel, below settings. Five small diagram cards use the existing road selector and share/code/record flow:

- `EGG3-S-8-0`: the unchanged 5km straight.
- `EGG3-T-8-1`: a 220m run-up and an open drop onto three coloured decks at different heights. The decks form a descending switchback; lower landings earn ordinary shortcut points. Flight time and rescue-jump rules remain normal.
- `EGG3-T-8-2`: a 20m-high vertical loop, with entry and exit offset sideways by 18m so the road does not intersect itself. The approach flattens before the loop. The egg has real collision contact while inverted.
- `EGG3-T-8-3`: about 940m of slalom with growing lateral amplitude.
- `EGG3-T-8-4`: four short 4.8m-wide bridges on an 800m downhill straight, with gradual approaches.

T codes are restricted to these four maps under version 3 and level 8. Existing R/E/S codes are preserved. The common track dispatcher serves worker generation, its synchronous fallback, direct simulation and server finish validation. T records use independent per-map leaderboards and the finite filter, never the endless best.

The loop deliberately has local arcade traction: beside its deck it compensates longitudinal gravity and applies a bounded spring/damping force toward the surface. This handles the asymmetric egg’s natural shell hops without replacing the collision body or setting its position/velocity each tick. Jumping or a real departure releases the assistance. Contact uses the road’s local normal on this map, so a wall or ceiling can be a genuine top-surface contact; underside contact still cannot grant progress. Loop jumps launch away from the local surface. The speed display and recharge check include vertical travel on this map.

The camera blends into an oblique view around the loop, remaining on the playable side of the ribbon and retaining the world horizon. No camera roll is introduced. Loop metadata and deck colours survive worker transfer. Coloured materials are owned and disposed per road chunk.

Validation: all 185 tests passed, including original geometry and gameplay regressions. New tests cover strict codes, deterministic geometry, worker transfer, three reachable landing decks, a full loop with inverted collision contact with/without rhythm, jump release at the top, complete slalom/bridges, camera continuity, finite filtering and server plausibility. Games typecheck and isolated Astro builds passed. Candidate browser evidence is under `/tmp/egg-road-fun/`; release evidence under `/tmp/egg-road-fun-deploy-20260924/`.

Browser validation: RU/EN, 320px mobile, keyboard disclosure and all five selections passed; generation works both in a worker and with Worker blocked. A rendered complete loop reached the finish with inverted contacts and rhythm 43, then restarted successfully. The top-of-loop screenshot confirms the egg remains visible inside the ribbon. Selecting a card restores the start button and keyboard focus. Final camera adjustment passed the seven focused mechanics tests and the isolated build.

Published only `web` as `egg-culture-web:release-road-fun-20260924`, image `sha256:055f55294ef15ef91121194938153af662a546a2403cfc4e2ef01f7476d7145d`. Runtime healthy, zero restarts. Public RU/EN passed: closed disclosure, keyboard opening, all five cards/codes/boards, start/jump/pause and switching to the daily map, with zero page errors or failed requests. All 18 served asset hashes match the image. Configuration, volumes, all database table rows, Kladka files and 64 neighbouring containers remained unchanged; SQLite integrity `ok`. The poller recovered from two startup connect timeouts (fresh successful poll, no blocked delivery). Rollback tag: `egg-culture-web:rollback-before-road-fun-20260924`; private SQLite snapshot retained on big-one in the release evidence directory.
