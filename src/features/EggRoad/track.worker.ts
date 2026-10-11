import { createTrackForSpec } from "./trackSpec.ts";
import { joinRoadPart } from "./endless.ts";
import { packTrack } from "./trackTransfer.ts";
import type { RoadSpec } from "./seed.ts";
import type { RoadSample } from "./track.ts";

self.onmessage = (event: MessageEvent<{ id: number; spec: RoadSpec; tail?: RoadSample }>) => {
  const { id, spec, tail } = event.data;
  try {
    const track = createTrackForSpec(spec, tail?.distance);
    const value = packTrack(tail ? joinRoadPart(track, tail) : track);
    self.postMessage({ id, value }, { transfer: [value.samples.buffer, ...value.chunks.flatMap(c => [c.vertices.buffer, c.indices.buffer])] });
  } catch { self.postMessage({ id, error: "track" }); }
};
