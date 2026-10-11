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
import { classifyRoadAir } from "./contact.ts";
import { roadFinish } from "./finish.ts";
import { CONTACT, FINISH_MARGIN, PHYSICS_STEP, FLIGHT_LIMIT, JUMP_SPEED, JUMP_RECHARGE_SECONDS } from "./rules.ts";
export { PHYSICS_STEP, FLIGHT_LIMIT, JUMP_SPEED, JUMP_RECHARGE_SECONDS } from "./rules.ts";

const JUMP_SPEED_RETAINED = 0.75;
export type RoadPhase = "ready" | "overview" | "intro" | "running" | "paused" | "over" | "finished";
export type RoadEndReason = "flight" | "below" | null;
export type RoadResult = { score: number; skipped: number; bestSkip: number; seconds: number; finished: boolean; level: number; mode: RoadMode; code: string; distance: number; gates: number; breakdown: ScoreBreakdown; endReason?: RoadEndReason; maxSpeed?: number; bestRhythm?: number; jumps?: number; hardLandings?: number };
export type RoadSnapshot = RoadResult & {
  phase: RoadPhase;
  speed: number;
  airborne: boolean;
  flightLeft: number;
  progress: number;
  lastSkip: number;
  boost: number;
  rhythmSpeedBonus: number;
  rhythm: number;
  jumpAvailable: boolean;
  jumpCooldown: number;
  jumpRecharging: boolean;
  rhythmCue: ReturnType<RollRhythm["cue"]>;
  code: string;
  distance: number;
  bonus: ScoreNotice | null;
  activeBonuses: BonusKind[];
};

let initialization: Promise<void> | undefined;
export const initializePhysics = () => initialization ??= RAPIER.init().then(warmPhysics).catch(error => { initialization = undefined; throw error; });

/** Exercise the cold WASM contact/CCD paths while the loading screen is up.
 * A disposable world leaves the actual run and its deterministic start intact. */
async function warmPhysics() {
  const world = new RAPIER.World({ x: 0, y: -20, z: 0 });
  try {
    world.timestep = PHYSICS_STEP;
    world.integrationParameters.maxCcdSubsteps = 8;
    world.createCollider(RAPIER.ColliderDesc.trimesh(
      new Float32Array([-32, 0, -64, 32, 0, -64, -32, 0, 32, 32, 0, 32]), new Uint32Array([0, 2, 1, 1, 2, 3])));
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 2, 0).setCcdEnabled(true).setCanSleep(false));
    const shape = RAPIER.ColliderDesc.convexHull(createEggHull());
    if (!shape) throw new Error("Could not warm the egg collider");
    world.createCollider(shape.setMass(1.2).setFriction(.95), body);
    body.setLinvel({ x: 0, y: -5, z: -12 }, true); body.setAngvel({ x: 18, y: 0, z: 0 }, true);
    for (let i = 0; i < 120; i++) {
      if (i === 60) body.setLinvel({ x: 0, y: 6, z: -12 }, true);
      world.step();
      if (i % 30 === 29) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  } finally { world.free(); }
}

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
  readonly steeringRight = new Vector3(1, 0, 0);
  endReason: RoadEndReason = null;
  maxSpeed = 0;
  bestRhythm = 0;
  jumps = 0;
  phase: RoadPhase = "ready";
  sampleIndex = 10;
  grounded = false;
  airTime = 0;
  flightTime = 0;
  hardLandings = 0;
  nearRoad = true;
  jumpCooldown = 0;
  get jumpAvailable() { return this.jumpCooldown === 0; }
  get rollingOnRoad() { return !this.jumping && (this.nearRoad || (this.flightTime === 0 && this.airTime < CONTACT.hopSeconds)); }
  get jumpRecharging() {
    if (this.disposed || this.phase !== "running" || this.jumpAvailable || !this.rollingOnRoad) return false;
    const velocity = this.body.linvel();
    return Math.hypot(velocity.x, (this.track.loop || this.track.speedRun) ? velocity.y : 0, velocity.z) > 3;
  }
  private jumping = false;
  private jumpStarted = 0;
  readonly rhythm: RollRhythm;
  get rhythmSpeedBonus() { return this.rhythm.speedBonus; }
  seconds = 0;
  gates = 0;
  readonly scoring: RoadScoring;
  get score() { return this.scoring.total; }
  private flightPeak = 0;
  get dropHeight() { return Math.max(0, this.flightPeak - this.position.y); }
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
  private readonly speedRunFloor: number | null;

  constructor(track: RoadTrack, mode: RoadMode = "levels") {
    this.track = track; this.mode = mode;
    this.rhythm = new RollRhythm(track.version ?? 1);
    // The braking climb ends above the valley; use its lowest point for falling.
    this.speedRunFloor = track.speedRun ? track.samples.reduce((y, sample) => Math.min(y, sample.position.y), Infinity) - 30 : null;
    this.scoring = new RoadScoring(track.version);
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
    const finish = roadFinish(this.track);
    const chunks = finish ? [...this.track.chunks, finish.chunk] : this.track.chunks;
    for (const [handle, chunk] of this.roadColliders) {
      if (!chunks.includes(chunk)) {
        this.world.removeCollider(this.world.getCollider(handle), false);
        this.roadColliders.delete(handle);
      } else this.world.getCollider(handle).setTranslation(chunk.origin);
    }
    const present = new Set(this.roadColliders.values());
    for (const chunk of chunks) if (!present.has(chunk)) {
      const desc = RAPIER.ColliderDesc.trimesh(chunk.vertices, chunk.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setTranslation(chunk.origin.x, chunk.origin.y, chunk.origin.z).setFriction(0.85).setRestitution(0.06);
      // A smoother surface makes the speed course fast while still on the road,
      // instead of obtaining its top speed only in an uncontrolled fall.
      if (this.track.speedRun) desc.setFriction(.25).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);
      this.roadColliders.set(this.world.createCollider(desc).handle, chunk);
    }
  }

  reset() {
    this.phase = "ready";
    this.sampleIndex = 10;
    this.grounded = false;
    this.airTime = this.flightTime = this.seconds = this.gates = this.skipped = this.bestSkip = this.lastSkip = this.progress = 0;
    this.nearRoad = true;
    this.hardLandings = 0;
    this.endReason = null; this.maxSpeed = this.bestRhythm = this.jumps = 0;
    this.jumpCooldown = 0;
    this.jumping = false;
    this.jumpStarted = 0;
    this.rhythm.reset();
    this.scoring.reset();
    this.originShift.set(0, 0, 0);
    this.takeoffGate = this.skipNoticeUntil = 0;
    const sample = this.track.samples[this.sampleIndex];
    this.steeringRight.copy(sample.right);
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
    const loop = this.track.loop;
    const normal = loop && this.rollingOnRoad && this.sampleIndex >= loop.first && this.sampleIndex <= loop.last ? this.track.samples[this.sampleIndex].normal : null;
    // Brake along the actual horizontal motion, independent of the camera or
    // the last road's heading. Keep its direction and the egg's natural spin.
    this.body.setLinvel(normal ? new Vector3().copy(velocity).multiplyScalar(JUMP_SPEED_RETAINED)
      .addScaledVector(normal, JUMP_SPEED + Math.max(0, normal.dot(velocity)) - normal.dot(velocity) * JUMP_SPEED_RETAINED) : {
      x: velocity.x * JUMP_SPEED_RETAINED,
      y: Math.max(0, velocity.y) + JUMP_SPEED,
      z: velocity.z * JUMP_SPEED_RETAINED,
    }, true);
    this.jumpCooldown = JUMP_RECHARGE_SECONDS;
    this.jumps++;
    this.jumping = true;
    this.jumpStarted = this.seconds;
    if (this.grounded) this.takeoffGate = this.gates;
    this.grounded = this.nearRoad = false;
    // Every successful rescue starts a full return window, without changing
    // the drop's height, scoring history or the spent jump charge.
    this.flightTime = 0;
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
      }
      if (revision !== this.track.endless.revision) this.syncRoadColliders();
    }
    const sample = this.track.samples[this.sampleIndex];
    this.scoring.tick(this.seconds);
    this.velocity.copy(this.body.linvel());
    const input = Number.isFinite(steering) ? MathUtils.clamp(steering, -1, 1) : 0;
    // The asymmetric shell makes tiny hops between contacts. They belong to the
    // same roll; only a real departure from the lane pauses the rhythm.
    const earned = this.rhythm.step(PHYSICS_STEP, input, this.velocity.dot(sample.right), this.velocity.dot(sample.tangent), this.rollingOnRoad);
    const targetSpeed = 18.5 + Math.min(3, this.progress / 260) + Math.min(2, (this.track.level - 1) * 0.3) + this.rhythmSpeedBonus;
    if (earned) {
      const kick = Math.min(2 + Math.max(0, this.rhythmSpeedBonus - this.rhythm.charge * 9) * .25, Math.max(0, targetSpeed - this.velocity.dot(sample.tangent)));
      this.body.applyImpulse(sample.tangent.clone().multiplyScalar(kick * this.body.mass()), true);
      this.velocity.copy(this.body.linvel());
    }
    this.body.resetForces(true);
    // Ordinary shell hops keep the same steering authority as rolling; losing
    // a close contact must not halve a correction the player is already making.
    this.steeringRight.copy(sample.right);
    if (this.track.version >= 2 && !this.rollingOnRoad && Math.hypot(this.velocity.x, this.velocity.z) > 2) {
      this.steeringRight.set(-this.velocity.z, 0, this.velocity.x).normalize();
    }
    this.force.copy(this.steeringRight).multiplyScalar(input * (this.rollingOnRoad ? 25 : 11));
    if (!this.jumping && (this.nearRoad || this.seconds < 0.15)) {
      // The speed plunge must keep the momentum earned from its steep descent.
      const acceleration = MathUtils.clamp((targetSpeed - this.velocity.dot(sample.tangent)) * 2.5, this.track.speedRun ? 0 : -4, 17);
      this.force.addScaledVector(sample.tangent, acceleration);
    }
    if (this.track.loop && this.rollingOnRoad && this.sampleIndex >= this.track.loop.first && this.sampleIndex <= this.track.loop.last) {
      // The loop's traction also covers the egg's small shell hops. A real
      // departure or rescue jump releases it; this never changes scoring/contact.
      const gap = this.offset.copy(this.position).sub(sample.position).dot(sample.normal) - this.supportRadius(sample.normal);
      this.force.addScaledVector(sample.tangent, -this.world.gravity.y * sample.tangent.y);
      this.force.addScaledVector(sample.normal, -MathUtils.clamp(25 + gap * 50 + this.velocity.dot(sample.normal) * 6, 0, 120));
    }
    if (this.track.speedRun && this.rollingOnRoad && !this.jumping) {
      // Dampen shell hops beside the speed lane, keeping downhill speed usable.
      // This releases on a jump or a real departure and awards no progress.
      const gap = this.offset.copy(this.position).sub(sample.position).dot(sample.normal) - this.supportRadius(sample.normal);
      this.force.addScaledVector(sample.normal, -MathUtils.clamp(gap * 25 + this.velocity.dot(sample.normal) * 4, 0, 60));
    }
    this.force.multiplyScalar(this.body.mass());
    this.body.addForce(this.force, true);
    this.world.step();
    this.seconds += PHYSICS_STEP;
    this.maxSpeed = Math.max(this.maxSpeed, Math.hypot(this.body.linvel().x, (this.track.loop || this.track.speedRun) ? this.body.linvel().y : 0, this.body.linvel().z));
    this.bestRhythm = Math.max(this.bestRhythm, this.rhythm.chain);
    this.position.copy(this.body.translation());
    this.rotation.copy(this.body.rotation());

    let supportIndex = -1;
    let supportDistance = Infinity;
    this.world.contactPairsWith(this.collider, (other) => {
      if (this.jumping && this.seconds - this.jumpStarted < 0.1) return;
      const chunk = this.roadColliders.get(other.handle);
      if (!chunk) return;
      const loopIndex = this.track.loop ? nearestRoadSample(this.track, this.position, chunk.first, chunk.last) : -1;
      let touching = false;
      this.world.contactPair(this.collider, other, (manifold) => {
        // Vertical sides are solid too, but brushing them is not a landing.
        const normal = manifold.normal();
        const alignment = loopIndex >= 0 ? this.track.samples[loopIndex].normal.dot(normal) : normal.y;
        if (Math.abs(alignment) < 0.45) return;
        // Rapier may clear the solver's transient points after a CCD substep.
        // Geometric contacts remain available; exclude merely nearby pairs.
        for (let i = 0; i < manifold.numContacts(); i++) {
          if (manifold.contactDist(i) <= CONTACT.skin) touching = true;
        }
      });
      if (!touching) return;
      const index = loopIndex >= 0 ? loopIndex : nearestRoadSample(this.track, this.position, chunk.first, chunk.last);
      const surface = this.track.samples[index];
      this.offset.copy(this.position).sub(surface.position);
      // An underside collision must not reset the free-fall allowance or award gates.
      if (this.offset.dot(surface.normal) < CONTACT.top) return;
      const distance = this.offset.lengthSq();
      if (distance < supportDistance) { supportIndex = index; supportDistance = distance; }
    });

    if (supportIndex >= 0) {
      const surface = this.track.samples[supportIndex];
      if (this.airTime > CONTACT.hardLandingAir && -this.velocity.dot(surface.normal) > 12) this.hardLandings++;
      const relative = this.position.clone().sub(surface.position);
      const distance = Math.min(this.track.endless ? Infinity : this.track.length,
        Math.max(0, surface.distance + relative.dot(surface.tangent)));
      const gate = Math.floor(distance / GATE_SPACING);
      let newlySkipped = 0;
      if (this.airTime > CONTACT.shortcutAir) {
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
        chain: this.rhythm.chain, drop: this.airTime > CONTACT.dropAir ? this.flightPeak - this.position.y : 0,
        skipped: newlySkipped, seconds: this.seconds });
      this.flightPeak = this.position.y;
      this.grounded = true;
      this.jumping = false;
      this.nearRoad = true;
      this.airTime = this.flightTime = 0;
      if (!this.track.endless && distance >= this.track.length - FINISH_MARGIN) this.phase = "finished";
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
      const classification = classifyRoadAir(aboveSurface, gap, this.airTime, this.jumping);
      this.nearRoad = classification.nearRoad;
      if ((this.track.loop || this.track.speedRun) && classification.ordinaryHop && !this.jumping) this.sampleIndex = index;
      // The egg's pointed end can launch it above the lane. This warning grace
      // neither awards gates nor changes the close-to-road drive check.
      const ordinaryHop = classification.ordinaryHop;
      this.flightTime = ordinaryHop ? 0 : this.flightTime + PHYSICS_STEP;
      if (this.flightTime >= FLIGHT_LIMIT) { this.phase = "over"; this.endReason = "flight"; }
      else if (this.position.y < (this.speedRunFloor ?? this.track.samples.at(-1)!.position.y - 30)) { this.phase = "over"; this.endReason = "below"; }
    }
    if (this.seconds > this.skipNoticeUntil) this.lastSkip = 0;
    // Natural shell hops close to the lane still belong to rolling. A rescue
    // jump, real drop, stopped egg or pause must never refill the charge.
    if (this.jumpRecharging) {
      this.jumpCooldown = Math.max(0, this.jumpCooldown - PHYSICS_STEP);
      if (this.jumpCooldown < 1e-8) this.jumpCooldown = 0;
    }
  }

  snapshot(): RoadSnapshot {
    const velocity = this.body.linvel();
    return {
      phase: this.phase, score: this.score, skipped: this.skipped, bestSkip: this.bestSkip,
      mode: this.mode, gates: this.gates, breakdown: this.scoring.breakdown(),
      code: roadCode({ mode: this.mode, level: this.track.level, seed: this.track.seed, version: this.track.version }),
      endReason: this.endReason, maxSpeed: this.maxSpeed, bestRhythm: this.bestRhythm, jumps: this.jumps, hardLandings: this.hardLandings,
      distance: this.progress, bonus: this.scoring.notice, activeBonuses: [...this.scoring.active], rhythmCue: this.rhythm.cue(!this.jumping && this.flightTime <= 0.35),
      level: this.track.level, boost: this.rhythm.charge, rhythmSpeedBonus: this.rhythmSpeedBonus, rhythm: this.rhythm.chain,
      jumpAvailable: this.jumpAvailable,
      jumpCooldown: this.jumpCooldown, jumpRecharging: this.jumpRecharging,
      seconds: this.seconds, finished: this.phase === "finished",
      // Steep test roads include their vertical travel in the speed display.
      speed: Math.hypot(velocity.x, (this.track.loop || this.track.speedRun) ? velocity.y : 0, velocity.z),
      airborne: !this.nearRoad && this.flightTime > CONTACT.flightWarning,
      flightLeft: Math.max(0, FLIGHT_LIMIT - this.flightTime),
      progress: Math.min(1, this.progress / (this.track.length - FINISH_MARGIN)), lastSkip: this.lastSkip,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.world.free();
  }
}
