import { parentPort } from 'node:worker_threads';
import { createTrackForSpec } from '../src/features/EggRoad/trackSpec.ts';

// The production image already retains src/ and dependencies. Running the exact
// generator here preserves every historic seed while keeping HTTP responsive.
parentPort.on('message', ({ id, spec }) => {
  try { parentPort.postMessage({ id, length: createTrackForSpec(spec).length }); }
  catch { parentPort.postMessage({ id, error: true }); }
});
