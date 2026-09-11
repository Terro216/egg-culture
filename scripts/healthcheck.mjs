import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { HEALTH_FILE } from "./kladka-poller.mjs";

export function pollerHealthy(state, now = Date.now()) {
  if (state?.enabled === false) return true;
  const fresh = (value) => Number.isFinite(value) && value > 0 && now - value >= 0 && now - value < 300_000;
  return state?.enabled === true && fresh(state.lastPollSuccess) &&
    (state.deliveryBlockedSince === null || fresh(state.deliveryBlockedSince));
}

async function main() {
  const state = JSON.parse(await fs.readFile(HEALTH_FILE, "utf8"));
  if (!pollerHealthy(state)) throw new Error("poller stale or delivery blocked");
  const response = await fetch(`http://127.0.0.1:${process.env.PORT ?? 4321}/ru/`, {
    signal: AbortSignal.timeout(5_000),
  });
  await response.arrayBuffer();
  if (!response.ok) throw new Error("HTTP unavailable");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error("Egg Culture healthcheck failed: HTTP or poller freshness");
    process.exitCode = 1;
  });
}
