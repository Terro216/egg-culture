import RAPIER from "@dimforge/rapier3d-compat";
import { Euler, MathUtils, Quaternion, Vector3 } from "three";
import { createEggHull } from "./geometry.ts";
import { GATE_SPACING, nearestRoadSample } from "./track.ts";
import type { RoadChunk, RoadTrack } from "./track.ts";
import { RollRhythm } from "./rhythm.ts";
import { streamEndless, shiftEndless } from "./endless.ts";
import { roadCode } from "./seed.ts";
import type { RoadMode } from "./seed.ts";
import { RoadScoring } from "./scoring.ts";
import type { ScoreBreakdown, ScoreNotice, BonusKind } from "./scoring.ts";

export const PHYSICS_STEP = 1 / 120;
export const FLIGHT_LIMIT = 4.2;
export const JUMP_SPEED = 6;
export type RoadPhase = "ready" | "overview" | "intro" | "running" | "paused" | "over" | "finished";
export type RoadResult = { score: number; skipped: number; bestSkip: number; seconds: number; finished: boolean; level: number; mode: RoadMode; code: string; distance: number; gates: number; breakdown: ScoreBreakdown };
export type RoadSnapshot = RoadResult & {
  phase: RoadPhase;
  speed: number;
  airborne: boolean;
  flightLeft: number;
  progress: number;
  lastSkip: number;
  boost: number;
  rhythm: number;
  jumpAvailable: boolean;
  rhythmCue: ReturnType<RollRhythm["cue"]>;
  code: string;
  distance: number;
  bonus: ScoreNotice | null;
  activeBonuses: BonusKind[];
};

let initialization: Promise<void> | undefined;
export const initializePhysics = () => initialization ??= RAPIER.init();

export class RoadSimulation {
  readonly world: RAPIER.World;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly track: RoadTrack;
  readonly mode: RoadMode;
  readonly originShift = new Vector3();
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
  jumpAvailable = true;
  private jumping = false;
  private jumpStarted = 0;
  readonly rhythm = new RollRhythm();
  seconds = 0;
  gates = 0;
  readonly scoring = new RoadScoring();
  get score() { return this.scoring.total; }
  private flightPeak = 0;
  skipped = 0;
  bestSkip = 0;
  lastSkip = 0;
  progress = 0;
  private takeoffGate = 0;
  private skipNoticeUntil = 0;
  private disposed = false;
  private resumePhase: "overview" | "intro" | "running" = "running";
  private readonly velocity = new Vector3();
  private readonly force = new Vector3();
  private readonly offset = new Vector3();
  private readonly localDirection = new Vector3();
  private readonly inverseRotation = new Quaternion();

  constructor(track: RoadTrack, mode: RoadMode = "levels") {
    this.track = track; this.mode = mode;
    this.world = new RAPIER.World({ x: 0, y: -20, z: 0 });
    this.world.timestep = PHYSICS_STEP;
    this.world.integrationParameters.maxCcdSubsteps = 8;
    this.world.integrationParameters.normalizedAllowedLinearError = 0.001;
    this.world.numSolverIterations = 6;
    this.syncRoadColliders();
    this.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setCcdEnabled(true).setCanSleep(false).setLinearDamping(0.06).setAngularDamping(0.09));
    this.hull = createEggHull();
    const shape = RAPIER.ColliderDesc.convexHull(this.hull);
    if (!shape) { this.world.free(); throw new Error("Could not construct the egg hull"); }
    this.collider = this.world.createCollider(shape.setMass(1.2).setFriction(0.95).setRestitution(0.04).setContactSkin(0.012), this.body);
    this.reset();
  }

  private syncRoadColliders() {
    for (const [handle, chunk] of this.roadColliders) {
      if (!this.track.chunks.includes(chunk)) {
        this.world.removeCollider(this.world.getCollider(handle), false);
        this.roadColliders.delete(handle);
      }
    }
    const present = new Set(this.roadColliders.values());
    for (const chunk of this.track.chunks) if (!present.has(chunk)) {
      const desc = RAPIER.ColliderDesc.trimesh(chunk.vertices, chunk.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(0.85).setRestitution(0.06);
      this.roadColliders.set(this.world.createCollider(desc).handle, chunk);
    }
  }

  reset() {
    this.phase = "ready";
    this.sampleIndex = 10;
    this.grounded = false;
    this.airTime = this.flightTime = this.seconds = this.gates = this.skipped = this.bestSkip = this.lastSkip = this.progress = 0;
    this.nearRoad = true;
    this.jumpAvailable = true;
    this.jumping = false;
    this.jumpStarted = 0;
    this.rhythm.reset();
    this.scoring.reset();
    this.originShift.set(0, 0, 0);
    this.takeoffGate = this.skipNoticeUntil = 0;
    const sample = this.track.samples[this.sampleIndex];
    this.rotation.setFromEuler(new Euler(0, 0.24, Math.PI / 2 - 0.16));
    let support = 0;
    for (let i = 0; i < this.hull.length; i += 3) {
      this.offset.fromArray(this.hull, i).applyQuaternion(this.rotation);
      support = Math.max(support, -this.offset.dot(sample.normal));
    }
    this.position.copy(sample.position).addScaledVector(sample.normal, support + 0.055);
    this.flightPeak = this.position.y;
    this.body.setTranslation(this.position, true);
    this.body.setRotation(this.rotation, true);
    this.body.setLinvel(sample.tangent.clone().multiplyScalar(12), true);
    this.body.setAngvel(sample.right.clone().multiplyScalar(-12 / 0.74), true);
    this.body.resetForces(true);
    this.body.resetTorques(true);
  }

  beginOverview() { if (this.phase === "ready") this.phase = "overview"; }
  beginIntro() { if (this.phase === "ready" || this.phase === "overview") this.phase = "intro"; }
  start() { if (this.phase === "ready" || this.phase === "intro") this.phase = "running"; }
  pause() { if (this.phase === "running" || this.phase === "intro" || this.phase === "overview") { this.resumePhase = this.phase; this.phase = "paused"; } }
  resume() { if (this.phase === "paused") this.phase = this.resumePhase; }

  jump() {
    if (this.phase !== "running" || !this.jumpAvailable || this.disposed) return false;
    const velocity = this.body.linvel();
    this.body.setLinvel({ x: velocity.x, y: Math.max(0, velocity.y) + JUMP_SPEED, z: velocity.z }, true);
    this.jumpAvailable = false;
    this.jumping = true;
    this.jumpStarted = this.seconds;
    if (this.grounded) this.takeoffGate = this.gates;
    this.grounded = this.nearRoad = false;
    // A last-second rescue gets time to work, without replenishing the jump.
    this.flightTime = Math.min(this.flightTime, FLIGHT_LIMIT - 1);
    return true;
  }

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
    if (this.track.endless) {
      const revision = this.track.endless.revision;
      this.sampleIndex -= streamEndless(this.track, this.track.samples[this.sampleIndex].distance);
      if (this.position.lengthSq() > 1200 * 1200) {
        const shift = this.position.clone().divideScalar(256).round().multiplyScalar(256);
        shiftEndless(this.track, shift);
        this.position.sub(shift); this.body.setTranslation(this.position, true);
        this.flightPeak -= shift.y; this.originShift.add(shift);
        for (const handle of this.roadColliders.keys()) this.world.removeCollider(this.world.getCollider(handle), false);
        this.roadColliders.clear();
      }
      if (revision !== this.track.endless.revision) this.syncRoadColliders();
    }
    const sample = this.track.samples[this.sampleIndex];
    this.scoring.tick(this.seconds);
    this.velocity.copy(this.body.linvel());
    const input = Number.isFinite(steering) ? MathUtils.clamp(steering, -1, 1) : 0;
    // The asymmetric shell makes tiny hops between contacts. They belong to the
    // same roll; only a real departure from the lane pauses the rhythm.
    const earned = this.rhythm.step(PHYSICS_STEP, input, this.velocity.dot(sample.right), this.velocity.dot(sample.tangent),
      !this.jumping && (this.nearRoad || (this.flightTime === 0 && this.airTime < 1.2)));
    const targetSpeed = 18.5 + Math.min(3, this.progress / 260) + Math.min(2, (this.track.level - 1) * 0.3) + this.rhythm.charge * 9;
    if (earned) {
      const kick = Math.min(2, Math.max(0, targetSpeed - this.velocity.dot(sample.tangent)));
      this.body.applyImpulse(sample.tangent.clone().multiplyScalar(kick * this.body.mass()), true);
      this.velocity.copy(this.body.linvel());
    }
    this.body.resetForces(true);
    this.force.copy(sample.right).multiplyScalar(input * (this.nearRoad ? 25 : 11));
    if (!this.jumping && (this.nearRoad || this.seconds < 0.15)) {
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
      if (this.jumping && this.seconds - this.jumpStarted < 0.1) return;
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
      const surface = this.track.samples[supportIndex];
      const relative = this.position.clone().sub(surface.position);
      const distance = Math.max(0, surface.distance + relative.dot(surface.tangent));
      const gate = Math.floor(distance / GATE_SPACING);
      let newlySkipped = 0;
      if (this.airTime > 0.3) {
        const skipped = Math.max(0, gate - Math.max(this.takeoffGate, this.gates) - 1);
        newlySkipped = skipped;
        if (skipped > 0) {
          this.skipped += skipped;
          this.bestSkip = Math.max(this.bestSkip, skipped);
          this.lastSkip = skipped;
          this.skipNoticeUntil = this.seconds + 2.6;
        }
      }
      this.sampleIndex = supportIndex;
      this.progress = Math.max(this.progress, distance);
      this.gates = Math.max(this.gates, gate);
      const side = Math.sign(relative.dot(surface.right)) || 1;
      const edgeRadius = this.supportRadius(surface.right.clone().multiplyScalar(-side));
      this.scoring.contact({ distance, gates: gate, speed: Math.max(0, this.velocity.dot(surface.tangent)),
        edgeGap: surface.width / 2 - Math.abs(relative.dot(surface.right)) - edgeRadius,
        chain: this.rhythm.chain, drop: this.airTime > 0.4 ? this.flightPeak - this.position.y : 0,
        skipped: newlySkipped, seconds: this.seconds });
      this.flightPeak = this.position.y;
      this.grounded = true;
      this.jumping = false;
      this.nearRoad = true;
      this.airTime = this.flightTime = 0;
      if (!this.track.endless && distance >= this.track.length - 12) this.phase = "finished";
    } else {
      if (this.grounded) this.takeoffGate = this.gates;
      this.flightPeak = Math.max(this.flightPeak, this.position.y);
      this.grounded = false;
      this.airTime += PHYSICS_STEP;
      const index = nearestRoadSample(this.track, this.position, Math.max(0, this.sampleIndex - 12), Math.min(this.track.samples.length - 1, this.sampleIndex + 64));
      const nearby = this.track.samples[index];
      this.offset.copy(this.position).sub(nearby.position);
      const gap = this.offset.dot(nearby.normal) - this.supportRadius(nearby.normal);
      const aboveSurface = gap >= -0.12 && Math.abs(this.offset.dot(nearby.right)) < nearby.width / 2 - 0.1;
      this.nearRoad = !this.jumping && aboveSurface && this.airTime < 0.7 && gap < 0.85;
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
      mode: this.mode, gates: this.gates, breakdown: this.scoring.breakdown(),
      code: roadCode({ mode: this.mode, level: this.track.level, seed: this.track.seed }),
      distance: this.progress, bonus: this.scoring.notice, activeBonuses: [...this.scoring.active], rhythmCue: this.rhythm.cue(!this.jumping && this.flightTime <= 0.35),
      level: this.track.level, boost: this.rhythm.charge, rhythm: this.rhythm.chain,
      jumpAvailable: this.jumpAvailable,
      seconds: this.seconds, finished: this.phase === "finished",
      // Show travel across the road, not the vertical speed of a fall or bounce.
      speed: Math.hypot(velocity.x, velocity.z),
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
