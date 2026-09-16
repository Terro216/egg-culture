import RAPIER from "@dimforge/rapier3d-compat";
import { Euler, MathUtils, Quaternion, Vector3 } from "three";
import { createEggHull } from "./geometry.ts";
import { GATE_SPACING, nearestRoadSample } from "./track.ts";
import type { RoadChunk, RoadTrack } from "./track.ts";

export const PHYSICS_STEP = 1 / 120;
export const FLIGHT_LIMIT = 4.2;
export type RoadPhase = "ready" | "running" | "paused" | "over" | "finished";
export type RoadResult = { score: number; skipped: number; bestSkip: number; seconds: number; finished: boolean };
export type RoadSnapshot = RoadResult & {
  phase: RoadPhase;
  speed: number;
  airborne: boolean;
  flightLeft: number;
  progress: number;
  lastSkip: number;
};

let initialization: Promise<void> | undefined;
export const initializePhysics = () => initialization ??= RAPIER.init();

export class RoadSimulation {
  readonly world: RAPIER.World;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly track: RoadTrack;
  readonly hull: Float32Array;
  readonly roadColliders = new Map<number, RoadChunk>();
  readonly position = new Vector3();
  readonly rotation = new Quaternion();
  phase: RoadPhase = "ready";
  sampleIndex = 10;
  grounded = false;
  airTime = 0;
  seconds = 0;
  score = 0;
  skipped = 0;
  bestSkip = 0;
  lastSkip = 0;
  progress = 0;
  private takeoffGate = 0;
  private skipNoticeUntil = 0;
  private disposed = false;
  private readonly velocity = new Vector3();
  private readonly force = new Vector3();
  private readonly offset = new Vector3();

  constructor(track: RoadTrack) {
    this.track = track;
    this.world = new RAPIER.World({ x: 0, y: -20, z: 0 });
    this.world.timestep = PHYSICS_STEP;
    this.world.integrationParameters.maxCcdSubsteps = 4;
    for (const chunk of track.chunks) {
      const desc = RAPIER.ColliderDesc.trimesh(chunk.vertices, chunk.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
        .setFriction(0.85).setRestitution(0.06);
      const collider = this.world.createCollider(desc);
      this.roadColliders.set(collider.handle, chunk);
    }
    this.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setCcdEnabled(true).setCanSleep(false).setLinearDamping(0.06).setAngularDamping(0.09));
    this.hull = createEggHull();
    const shape = RAPIER.ColliderDesc.convexHull(this.hull);
    if (!shape) { this.world.free(); throw new Error("Could not construct the egg hull"); }
    this.collider = this.world.createCollider(shape.setMass(1.2).setFriction(0.95).setRestitution(0.08), this.body);
    this.reset();
  }

  reset() {
    this.phase = "ready";
    this.sampleIndex = 10;
    this.grounded = false;
    this.airTime = this.seconds = this.score = this.skipped = this.bestSkip = this.lastSkip = this.progress = 0;
    this.takeoffGate = this.skipNoticeUntil = 0;
    const sample = this.track.samples[this.sampleIndex];
    this.rotation.setFromEuler(new Euler(0, 0.24, Math.PI / 2 - 0.16));
    let support = 0;
    for (let i = 0; i < this.hull.length; i += 3) {
      this.offset.fromArray(this.hull, i).applyQuaternion(this.rotation);
      support = Math.max(support, -this.offset.dot(sample.normal));
    }
    this.position.copy(sample.position).addScaledVector(sample.normal, support + 0.055);
    this.body.setTranslation(this.position, true);
    this.body.setRotation(this.rotation, true);
    this.body.setLinvel(sample.tangent.clone().multiplyScalar(9), true);
    this.body.setAngvel(sample.right.clone().multiplyScalar(-9 / 0.74), true);
    this.body.resetForces(true);
    this.body.resetTorques(true);
  }

  start() { if (this.phase === "ready") this.phase = "running"; }
  pause() { if (this.phase === "running") this.phase = "paused"; }
  resume() { if (this.phase === "paused") this.phase = "running"; }

  step(steering: number) {
    if (this.phase !== "running" || this.disposed) return;
    const sample = this.track.samples[this.sampleIndex];
    this.velocity.copy(this.body.linvel());
    const input = Number.isFinite(steering) ? MathUtils.clamp(steering, -1, 1) : 0;
    this.body.resetForces(true);
    this.force.copy(sample.right).multiplyScalar(input * (this.grounded ? 19 : 9));
    if (this.grounded || this.seconds < 0.15) {
      const targetSpeed = 13.5 + Math.min(3.5, this.progress / 220);
      const acceleration = MathUtils.clamp((targetSpeed - this.velocity.dot(sample.tangent)) * 2.5, -5, 11);
      this.force.addScaledVector(sample.tangent, acceleration);
    }
    this.force.multiplyScalar(this.body.mass());
    this.body.addForce(this.force, true);
    this.world.step();
    this.seconds += PHYSICS_STEP;
    this.position.copy(this.body.translation());
    this.rotation.copy(this.body.rotation());

    let supportIndex = -1;
    let supportDistance = Infinity;
    this.world.contactPairsWith(this.collider, (other) => {
      const chunk = this.roadColliders.get(other.handle);
      if (!chunk) return;
      let touching = false;
      this.world.contactPair(this.collider, other, (manifold) => {
        // Rapier may clear the solver's transient points after a CCD substep.
        // Geometric contacts remain available; exclude merely nearby pairs.
        for (let i = 0; i < manifold.numContacts(); i++) {
          if (manifold.contactDist(i) <= 0.025) touching = true;
        }
      });
      if (!touching) return;
      const index = nearestRoadSample(this.track, this.position, chunk.first, chunk.last);
      const surface = this.track.samples[index];
      this.offset.copy(this.position).sub(surface.position);
      // An underside collision must not reset the free-fall allowance or award gates.
      if (this.offset.dot(surface.normal) < 0.15) return;
      const distance = this.offset.lengthSq();
      if (distance < supportDistance) { supportIndex = index; supportDistance = distance; }
    });

    if (supportIndex >= 0) {
      const distance = this.track.samples[supportIndex].distance;
      const gate = Math.floor(distance / GATE_SPACING);
      if (this.airTime > 0.3) {
        const skipped = Math.max(0, gate - Math.max(this.takeoffGate, this.score) - 1);
        if (skipped > 0) {
          this.skipped += skipped;
          this.bestSkip = Math.max(this.bestSkip, skipped);
          this.lastSkip = skipped;
          this.skipNoticeUntil = this.seconds + 2.6;
        }
      }
      this.sampleIndex = supportIndex;
      this.progress = Math.max(this.progress, distance);
      this.score = Math.max(this.score, gate);
      this.grounded = true;
      this.airTime = 0;
      if (distance >= this.track.length - 12) this.phase = "finished";
    } else {
      if (this.grounded) this.takeoffGate = this.score;
      this.grounded = false;
      this.airTime += PHYSICS_STEP;
      if (this.airTime >= FLIGHT_LIMIT || this.position.y < this.track.samples.at(-1)!.position.y - 30) this.phase = "over";
    }
    if (this.seconds > this.skipNoticeUntil) this.lastSkip = 0;
  }

  snapshot(): RoadSnapshot {
    const velocity = this.body.linvel();
    return {
      phase: this.phase, score: this.score, skipped: this.skipped, bestSkip: this.bestSkip,
      seconds: this.seconds, finished: this.phase === "finished",
      speed: Math.hypot(velocity.x, velocity.y, velocity.z),
      airborne: !this.grounded && this.airTime > 0.18,
      flightLeft: Math.max(0, FLIGHT_LIMIT - this.airTime),
      progress: this.progress / this.track.length, lastSkip: this.lastSkip,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.world.free();
  }
}
