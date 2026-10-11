import { MathUtils, Vector3 } from "three";
import type { RoadTrack } from "./track.ts";

/** An oblique view keeps the loop legible without flipping the horizon at its top. */
export class LoopCamera {
  amount = 0;
  private readonly position = new Vector3();
  private readonly target = new Vector3();
  reset() { this.amount = 0; }
  apply(dt: number, track: RoadTrack, index: number, egg: Vector3, camera: Vector3, target: Vector3) {
    const loop = track.loop;
    if (!loop) { this.amount = 0; return; }
    const distance = track.samples[index].distance;
    const desired = MathUtils.smoothstep(distance, track.samples[loop.first].distance - 38, track.samples[loop.first].distance - 8)
      * (1 - MathUtils.smoothstep(distance, track.samples[loop.last].distance + 8, track.samples[loop.last].distance + 42));
    this.amount = MathUtils.lerp(this.amount, desired, 1 - Math.exp(-dt * 5));
    if (this.amount < .0001) return;
    const sample = track.samples[index];
    // Remain on the playable side of the ribbon, including below its ceiling.
    this.position.copy(egg).addScaledVector(sample.right, 24).addScaledVector(sample.normal, 9).addScaledVector(sample.tangent, -12);
    this.target.copy(egg).addScaledVector(sample.normal, .5);
    camera.lerp(this.position, this.amount); target.lerp(this.target, this.amount);
  }
}
