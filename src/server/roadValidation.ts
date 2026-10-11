import { Worker } from "node:worker_threads";
import { resolve } from "node:path";
import { parseRoadCode } from "../features/EggRoad/seed.ts";
import type { RoadSpec } from "../features/EggRoad/seed.ts";
import { FINISH_MARGIN } from "../features/EggRoad/rules.ts";
import type { PublishedRun } from "../features/EggRoad/leaderboard.ts";

export class RoadValidationBusyError extends Error {}
type Job = { id: string; spec: RoadSpec; resolve: (length: number) => void; reject: (error: Error) => void };

/** One worker, bounded admission and a shared cache; never construct colliders on HTTP's thread. */
export function createRoadValidator() {
  const lengths = new Map<string, number>(), pending = new Map<string, Promise<number>>();
  const queue: Job[] = [];
  let worker: Worker | null = null, active: Job | null = null, timer: ReturnType<typeof setTimeout> | undefined;
  const fail = (source: Worker) => {
    if (worker !== source) return;
    worker = null; clearTimeout(timer); timer = undefined;
    const jobs = [...(active ? [active] : []), ...queue.splice(0)]; active = null;
    for (const job of jobs) job.reject(new Error("Road validation unavailable"));
    void source.terminate();
  };
  function start() {
    if (active || !queue.length) return;
    if (!worker) {
      // scripts/ and src/ are included in the existing runtime image; explicit
      // strip-types also supports the minimum Node 22.13 version in package.json.
      const source = new Worker(resolve(process.cwd(), "scripts/road-validation-worker.mjs"), { execArgv: ["--experimental-strip-types"] });
      worker = source;
      source.on("error", () => fail(source));
      source.on("exit", () => { if (worker === source) fail(source); });
      source.on("message", (result: { id: string; length?: number; error?: boolean }) => {
        if (worker !== source || !active || result.id !== active.id) return;
        clearTimeout(timer); timer = undefined;
        const job = active; active = null;
        if (result.error || !Number.isFinite(result.length) || Number(result.length) <= 0) job.reject(new Error("Road validation unavailable"));
        else {
          if (lengths.size >= 128) lengths.delete(lengths.keys().next().value!);
          lengths.set(job.id, result.length!); job.resolve(result.length!);
        }
        source.unref(); start();
      });
    }
    active = queue.shift()!;
    const source = worker; source.ref();
    timer = setTimeout(() => fail(source), 10000);
    source.postMessage({ id: active.id, spec: active.spec });
  }
  async function plausible(run: PublishedRun) {
    const spec = parseRoadCode(run.code);
    if (!spec) return false;
    if (spec.mode === "endless") return !run.finished;
    let length = lengths.get(run.code);
    if (length === undefined) {
      let job = pending.get(run.code);
      if (!job) {
        if (pending.size >= 8) throw new RoadValidationBusyError("Road validation is busy");
        job = new Promise<number>((resolve, reject) => { queue.push({ id: run.code, spec, resolve, reject }); });
        pending.set(run.code, job);
        void job.finally(() => pending.delete(run.code)).catch(() => {});
        start();
      }
      length = await job;
    }
    return run.distance <= length + 4 && (!run.finished || run.distance >= length - FINISH_MARGIN - 2);
  }
  return { plausible, async close() {
    if (worker) {
      const source = worker; fail(source); await source.terminate();
    }
  } };
}

const validator = createRoadValidator();
/** Plausibility only. Browser-reported results are not authoritative replays. */
export const plausibleRoadRun = (run: PublishedRun) => validator.plausible(run);
