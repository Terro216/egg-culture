# Dynamic rhythm — 2026-09-30

EGG3 rhythm builds its speed bonus from the first genuine steering correction, without a fixed starter bonus: `charge * 8 * log2(1 + chain / 8)` m/s. Growth remains logarithmic and uncapped. The same bonus feeds the drive and HUD.

A qualifying stroke needs 0.12 seconds of steering, 0.04 metres of real lateral movement and forward speed above 3 m/s. Each alternating stroke adds 0.18 charge; incomplete taps and airborne input cannot earn boost. A release longer than 0.6 rolling seconds clears the pending stroke. After 0.65 rolling seconds without a qualifying stroke, charge falls continuously at 0.7 per second. Full charge therefore lasts at most about 2.1 rolling seconds after the last stroke. At zero charge the chain resets; resuming before discharge can recover the active series. Flight freezes rhythm; pause advances no physics. EGG1/EGG2 retain their previous rules.

With strokes every 0.25 seconds, measured bonuses at 2/4/8 seconds are approximately +26/+44/+66 km/h. At full charge, ×130 gives about +118 km/h. These are drive bonuses, not guaranteed actual velocities.

Validation: all 198 tests and the games TypeScript check passed. Coverage includes lighter corrections, early and sustained gains, rapid decay, recovery, legacy rules, growth beyond ×1000, full straight/loop/drop/slalom/bridge/plunge runs, records and achievements. Both isolated builds passed. Browser checks verified the rendered +52 km/h at ×20, complete straight and plunge runs, discharge to zero, recovery, pause and retry, with no page errors. Rolling peaks were 174.7 km/h on the straight and 349.7 km/h on the plunge; the plunge spent 38.6 rolling seconds above 150 km/h. Candidate-only physics batches do not measure real-time FPS.

Only `web` was updated to `egg-culture-web:release-road-dynamic-20260930`, image `sha256:f18ad2914898faa98c03f652ba229269ce5856463a1ea0198c9901eb2c47d3ee`. Configuration, volumes, all 14 database tables and Kladka files are unchanged; SQLite integrity is `ok`, and 64 neighbouring containers are unchanged. Rollback: `egg-culture-web:rollback-before-road-dynamic-20260930`. A private SQLite backup remains on big-one. Refresh existing game tabs to load the updated physics.

Candidate evidence: `/tmp/egg-road-dynamic-20260930/`. Release evidence: `/tmp/egg-road-dynamic-deploy-20260930/`.
