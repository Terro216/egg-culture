import { createTrackForSpec } from "./trackSpec.ts";
import type { RoadSample, RoadTrack } from "./track.ts";
import { joinRoadPart, partLevel, partSeed } from "./endless.ts";
import { unpackTrack } from "./trackTransfer.ts";
import type { PackedTrack } from "./trackTransfer.ts";
import type { RoadSpec } from "./seed.ts";
import workerAsset from "./track.worker.ts?worker&url";

/** A worker owns generation; simulation, colliders and rendering stay on the main thread. */
export class RoadTrackFactory {
  private worker: Worker | null = null;
  private serial = 0;
  private disposed = false;
  private readonly pending = new Map<number, { resolve: (track: RoadTrack) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private readonly preparing = new WeakSet<RoadTrack>();
  constructor() {
    try {
      // Public-page workers live within the same service-worker scope so their
      // own fetch works offline too. Embedded games use the ordinary asset URL.
      const asset = new URL(workerAsset, location.href);
      const url = import.meta.env.PROD && /^\/(ru|en)\/play\/$/.test(location.pathname)
        ? new URL(asset.pathname.split("/").at(-1)!, location.href) : asset;
      this.worker = new Worker(url, { type: "module" });
      this.worker.onmessage = (event: MessageEvent<{ id: number; value?: PackedTrack }>) => {
        const job = this.pending.get(event.data.id); if (!job) return;
        this.pending.delete(event.data.id); clearTimeout(job.timer);
        try { if (event.data.value) job.resolve(unpackTrack(event.data.value)); else job.reject(new Error("track")); }
        catch { job.reject(new Error("track transfer")); }
      };
      this.worker.onerror = () => this.stopWorker();
    } catch { /* Worker-blocking browsers retain the deterministic synchronous path. */ }
  }
  async create(spec: RoadSpec, tail?: RoadSample): Promise<RoadTrack> {
    if (this.disposed) throw new Error("disposed");
    if (this.worker) {
      try {
        return await new Promise<RoadTrack>((resolve, reject) => {
          const id = ++this.serial;
          const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("track timeout")); this.stopWorker(); }, 15000);
          this.pending.set(id, { resolve, reject, timer });
          try { this.worker!.postMessage({ id, spec, tail }); }
          catch (error) { this.pending.delete(id); clearTimeout(timer); reject(error); }
        });
      } catch { if (this.disposed) throw new Error("disposed"); }
    }
    // Yield once so loading feedback can paint before the compatibility path.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    if (this.disposed) throw new Error("disposed");
    const track = createTrackForSpec(spec, tail?.distance);
    return tail ? joinRoadPart(track, tail) : track;
  }
  prepare(track: RoadTrack) {
    if (!track.endless || track.endless.prepared || this.preparing.has(track) || this.disposed) return;
    const part = track.endless.nextPart;
    this.preparing.add(track);
    const last = track.samples.at(-1)!;
    const tail = { ...last, position: last.position.clone(), tangent: last.tangent.clone(), right: last.right.clone(), normal: last.normal.clone() };
    void this.create({ mode: "seed", level: partLevel(part), seed: partSeed(track.seed, part), version: track.version }, tail)
      .then(next => { if (!this.disposed && track.endless?.nextPart === part) track.endless.prepared = { part, track: next, fitted: true }; })
      .catch(() => { /* Streaming has a synchronous fallback if preparation failed. */ })
      .finally(() => this.preparing.delete(track));
  }
  private stopWorker() {
    this.worker?.terminate(); this.worker = null;
    for (const job of this.pending.values()) { clearTimeout(job.timer); job.reject(new Error("worker unavailable")); }
    this.pending.clear();
  }
  dispose() { this.disposed = true; this.stopWorker(); }
}
