import RAPIER from "@dimforge/rapier3d-compat";
import { Euler, MathUtils, Quaternion, Vector3 } from "three";
import { createEggHull } from "./geometry.ts";
import { GATE_SPACING, nearestRoadSample } from "./track.ts";
import type { RoadChunk, RoadTrack } from "./track.ts";
import { RollRhythm } from "./rhythm.ts";

export const PHYSICS_STEP = 1 / 120;
export const FLIGHT_LIMIT = 4.2;
export type RoadPhase = "ready" | "intro" | "running" | "paused" | "over" | "finished";
export type RoadResult = { score: number; skipped: number; bestSkip: number; seconds: number; finished: boolean; level: number };
export type RoadSnapshot = RoadResult & {
  phase: RoadPhase;
  speed: number;
  airborne: boolean;
  flightLeft: number;
  progress: number;
  lastSkip: number;
  boost: number;
  rhythm: number;
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
  flightTime = 0;
  nearRoad = true;
  readonly rhythm = new RollRhythm();
  seconds = 0;
  score = 0;
  skipped = 0;
  bestSkip = 0;
  lastSkip = 0;
  progress = 0;
  private takeoffGate = 0;
  private skipNoticeUntil = 0;
  private disposed = false;
  private resumePhase: "intro" | "running" = "running";
  private readonly velocity = new Vector3();
  private readonly force = new Vector3();
  private readonly offset = new Vector3();
  private readonly localDirection = new Vector3();
  private readonly inverseRotation = new Quaternion();

  constructor(track: RoadTrack) {
    this.track = track;
    this.world = new RAPIER.World({ x: 0, y: -20, z: 0 });
    this.world.timestep = PHYSICS_STEP;
    this.world.integrationParameters.maxCcdSubsteps = 8;
    this.world.integrationParameters.normalizedAllowedLinearError = 0.001;
    this.world.numSolverIterations = 6;
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
    this.collider = this.world.createCollider(shape.setMass(1.2).setFriction(0.95).setRestitution(0.04).setContactSkin(0.012), this.body);
    this.reset();
  }

  reset() {
    this.phase = "ready";
    this.sampleIndex = 10;
    this.grounded = false;
    this.airTime = this.flightTime = this.seconds = this.score = this.skipped = this.bestSkip = this.lastSkip = this.progress = 0;
    this.nearRoad = true;
    this.rhythm.reset();
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
    this.body.setLinvel(sample.tangent.clone().multiplyScalar(12), true);
    this.body.setAngvel(sample.right.clone().multiplyScalar(-12 / 0.74), true);
    this.body.resetForces(true);
    this.body.resetTorques(true);
  }

  beginIntro() { if (this.phase === "ready") this.phase = "intro"; }
  start() { if (this.phase === "ready" || this.phase === "intro") this.phase = "running"; }
  pause() { if (this.phase === "running" || this.phase === "intro") { this.resumePhase = this.phase; this.phase = "paused"; } }
  resume() { if (this.phase === "paused") this.phase = this.resumePhase; }

  private supportRadius(direction: Vector3) {
    this.inverseRotation.copy(this.rotation).invert();
    this.localDirection.copy(direction).applyQuaternion(this.inverseRotation);
    let radius = 0;
    for (let i = 0; i < this.hull.length; i += 3) {
      radius = Math.max(radius, -(this.hull[i] * this.localDirection.x + this.hull[i+1] * this.localDirection.y + this.hull[i+2] * this.localDirection.z));
    }
    return radius;
  }

  step(steering: number) {
    if (this.phase !== "running" || this.disposed) return;
    const sample = this.track.samples[this.sampleIndex];
    this.velocity.copy(this.body.linvel());
    const input = Number.isFinite(steering) ? MathUtils.clamp(steering, -1, 1) : 0;
    const spin = this.body.angvel();
    const rollRate = spin.x * sample.tangent.x + spin.y * sample.tangent.y + spin.z * sample.tangent.z;
    this.rhythm.step(PHYSICS_STEP, input, this.velocity.dot(sample.right), rollRate, this.nearRoad);
    this.body.resetForces(true);
    this.force.copy(sample.right).multiplyScalar(input * (this.nearRoad ? 25 : 11));
    if (this.nearRoad || this.seconds < 0.15) {
      const targetSpeed = 18.5 + Math.min(3, this.progress / 260) + Math.min(2, (this.track.level - 1) * 0.3) + this.rhythm.charge * 9;
      const acceleration = MathUtils.clamp((targetSpeed - this.velocity.dot(sample.tangent)) * 2.5, -4, 17);
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
        // Vertical sides are solid too, but brushing them is not a landing.
        const normal = manifold.normal();
        if (Math.abs(normal.y) < 0.45) return;
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
      this.nearRoad = true;
      this.airTime = this.flightTime = 0;
      if (distance >= this.track.length - 12) this.phase = "finished";
    } else {
      if (this.grounded) this.takeoffGate = this.score;
      this.grounded = false;
      this.airTime += PHYSICS_STEP;
      const index = nearestRoadSample(this.track, this.position, Math.max(0, this.sampleIndex - 12), Math.min(this.track.samples.length - 1, this.sampleIndex + 64));
      const nearby = this.track.samples[index];
      this.offset.copy(this.position).sub(nearby.position);
      const gap = this.offset.dot(nearby.normal) - this.supportRadius(nearby.normal);
      const aboveSurface = gap >= -0.12 && Math.abs(this.offset.dot(nearby.right)) < nearby.width / 2 - 0.1;
      this.nearRoad = aboveSurface && this.airTime < 0.7 && gap < 0.85;
      // The egg's pointed end can launch it above the lane. This warning grace
      // neither awards gates nor changes the close-to-road drive check.
      const ordinaryHop = aboveSurface && this.airTime < 1.2 && gap < 3;
      this.flightTime = ordinaryHop ? 0 : this.flightTime + PHYSICS_STEP;
      if (this.flightTime >= FLIGHT_LIMIT || this.position.y < this.track.samples.at(-1)!.position.y - 30) this.phase = "over";
    }
    if (this.seconds > this.skipNoticeUntil) this.lastSkip = 0;
  }

  snapshot(): RoadSnapshot {
    const velocity = this.body.linvel();
    return {
      phase: this.phase, score: this.score, skipped: this.skipped, bestSkip: this.bestSkip,
      level: this.track.level, boost: this.rhythm.charge, rhythm: this.rhythm.chain,
      seconds: this.seconds, finished: this.phase === "finished",
      speed: Math.hypot(velocity.x, velocity.y, velocity.z),
      airborne: !this.nearRoad && this.flightTime > 0.35,
      flightLeft: Math.max(0, FLIGHT_LIMIT - this.flightTime),
      progress: this.progress / this.track.length, lastSkip: this.lastSkip,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.world.free();
  }
}
