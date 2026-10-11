import RAPIER from "@dimforge/rapier3d-compat";
import { createEggGeometry } from "../EggRoad/geometry.ts";
import { CARTON_HALF_DEPTH, CARTON_HALF_WIDTH, CARTON_Z, cartonPoint, flockPoint, flockSize, FRAGMENT_LIMIT, PAN_LIMIT, panFill, panMarkSize, panSpread, slotWeight, STEP } from "./rules.ts";
import { hazardFootprint, roadIntervals } from "./track.ts";
import type { HazardRow } from "./track.ts";
import type { FryTrail } from "./trail.ts";

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
export const EGG_SCALE = 0.24;
let initialization: Promise<void> | undefined;
export function initializeFryPhysics(): Promise<void> { return initialization ??= RAPIER.init(); }

export type PhysicalEgg = { body: RAPIER.RigidBody; collider: RAPIER.Collider; id: number; weight: bigint; slot: number; layout: number; offsetX: number; offsetZ: number };
type FlockContext = { seed: number; distance: number; carton: boolean };
export type Fragment = { body: RAPIER.RigidBody; collider: RAPIER.Collider; life: number; pan: boolean; index: number };
export type FriedMark = { x: number; z: number; angle: number; size: number; born: number };

/** Stable shells carry exact integer weights. A struck shell is removed, never silently re-created. */
export class FryPhysics {
  readonly world = new RAPIER.World({ x: 0, y: -18, z: 0 });
  readonly flock: PhysicalEgg[] = [];
  readonly fragments: Fragment[] = [];
  readonly fried: FriedMark[] = [];
  readonly hull: Float32Array;
  private disposed = false;
  private serial = 0;
  private pan = false;
  private panFloor: RAPIER.Collider | null = null;
  private panCount = 0n;
  private represented = -1n;
  private targetSize = 0;
  private growth = 0;
  panRadius = 5.7;
  time = 0;
  carton = false;
  private cartonX = 0;

  constructor() {
    this.world.timestep = STEP;
    this.world.numSolverIterations = 4;
    const geometry = createEggGeometry(10, 8);
    this.hull = Float32Array.from(geometry.getAttribute("position").array, n => n * EGG_SCALE);
    geometry.dispose();
  }

  get count() { return this.flock.reduce((sum, egg) => sum + egg.weight, 0n); }

  private growthPoint(slot: number, x: number, trail?: FryTrail, context?: FlockContext) {
    const point = flockPoint(slot, this.targetSize), anchor = trail?.at(point.z + 3.2) ?? x;
    const lane = roadIntervals(context?.seed ?? 0, (context?.distance ?? 0) - point.z).find(([a, b]) => anchor >= a && anchor <= b);
    // Fit newly collected eggs behind the leader. Existing offsets are not
    // widened or moved by a pickup, so growth itself cannot create edge damage.
    const half = Math.min(1.95, lane ? (lane[1] - lane[0] - 0.56) / 2 : 1.95);
    const center = slot === 0 || !lane ? anchor : Math.max(lane[0] + half + 0.28, Math.min(lane[1] - half - 0.28, anchor));
    return { x: center + point.x * half / 1.95, z: point.z, offsetX: center - anchor + point.x * half / 1.95 };
  }

  positionFlock(count: bigint, x: number, seconds: number, trail?: FryTrail, context?: FlockContext) {
    const first = this.represented < 0n;
    const released = this.carton && !context?.carton;
    this.carton = !!context?.carton; this.cartonX = x;
    if (this.represented !== count) {
      this.represented = count;
      this.targetSize = flockSize(count);
      while (this.flock.length > this.targetSize) this.world.removeRigidBody(this.flock.pop()!.body);
      this.growth = first ? this.targetSize : Math.max(1, this.growth);
      this.reweight(count);
    }
    if (released) for (const egg of this.flock) {
      const point = this.growthPoint(egg.slot, x, trail, context);
      egg.offsetX = point.offsetX; egg.offsetZ = point.z;
    }
    this.growth = Math.min(4, this.growth + STEP * 100);
    const requested = first ? this.targetSize : Math.min(this.targetSize, this.flock.length + Math.floor(this.growth));
    let added = false;
    while (this.flock.length < requested) {
      const used = new Set(this.flock.map(egg => egg.slot));
      let slot = 0; while (used.has(slot)) slot++;
      const point = this.growthPoint(slot, x, trail, context);
      const packed = this.carton ? cartonPoint(this.flock.length) : null;
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        packed ? x + packed.x : point.x, packed?.y ?? 0.3, packed?.z ?? point.z));
      const description = RAPIER.ColliderDesc.convexHull(this.hull);
      if (!description) throw new Error("Could not construct fry shell");
      const collider = this.world.createCollider(description.setSensor(true).setCollisionGroups(0), body);
      this.flock.push({ body, collider, id: this.serial++, weight: 0n, slot, layout: this.targetSize, offsetX: point.offsetX, offsetZ: point.z });
      this.growth = Math.max(0, this.growth - 1); added = true;
    }
    if (added) this.reweight(count);
    for (let index = 0; index < this.flock.length; index++) {
      const egg = this.flock[index], previous = egg.body.translation(), packed = this.carton ? cartonPoint(index) : null;
      const lean = Math.sin(seconds * 5 + egg.id * 1.7) * 0.11, ease = first ? 1 : 1 - Math.exp(-STEP * 14);
      const targetX = packed ? x + packed.x : (trail?.at(egg.offsetZ + 3.2) ?? x) + egg.offsetX;
      egg.body.setNextKinematicTranslation({ x: previous.x + (targetX - previous.x) * ease,
        y: previous.y + ((packed?.y ?? 0.29) + Math.abs(Math.sin(seconds * 6 + egg.id)) * 0.045 - previous.y) * ease,
        z: previous.z + ((packed?.z ?? egg.offsetZ) - previous.z) * ease });
      egg.body.setNextKinematicRotation({ x: Math.sin(lean / 2), y: 0, z: 0, w: Math.cos(lean / 2) });
    }
  }

  private reweight(count: bigint) { this.flock.forEach((egg, i) => { egg.weight = slotWeight(count, this.flock.length, i); }); }

  /** Query the moving footprint against the actual visible shell shapes. */
  hitSlots(row: HazardRow, ahead = 0, seconds = 0): number[] {
    if (this.carton) return this.hitsCarton(row, ahead, seconds, this.cartonX) ? this.flock.map((_, i) => i) : [];
    const footprint = hazardFootprint(row, ahead, seconds);
    const shape = new RAPIER.Cuboid(footprint.halfWidth, 0.85, footprint.halfDepth);
    const position = { x: footprint.x, y: 0.4, z: -ahead };
    const indices: number[] = [];
    for (let i = 0; i < this.flock.length; i++) {
      if (this.flock[i].collider.intersectsShape(shape, position, IDENTITY)) indices.push(i);
    }
    return indices;
  }

  hitsCarton(row: HazardRow, ahead: number, seconds: number, x: number) {
    const footprint = hazardFootprint(row, ahead, seconds);
    return Math.abs(footprint.x - x) < footprint.halfWidth + CARTON_HALF_WIDTH
      && Math.abs(-ahead - CARTON_Z) < footprint.halfDepth + CARTON_HALF_DEPTH;
  }

  unsupportedSlots(seed: number, distance: number): number[] {
    if (this.carton) return [];
    return this.flock.flatMap((egg, i) => {
      const p = egg.body.translation();
      // The centre of the visible shell must remain supported, including at the split road.
      return roadIntervals(seed, distance - p.z).some(([a, b]) => p.x >= a + 0.06 && p.x <= b - 0.06) ? [] : [i];
    });
  }

  touchesPickup(x: number, ahead = 0): boolean {
    if (this.carton) {
      const dx = Math.max(0, Math.abs(x - this.cartonX) - CARTON_HALF_WIDTH), dz = Math.max(0, Math.abs(-ahead - CARTON_Z) - CARTON_HALF_DEPTH);
      return dx * dx + dz * dz <= 0.7 ** 2;
    }
    const shape = new RAPIER.Ball(0.7);
    return this.flock.some(egg => egg.collider.intersectsShape(shape, { x, y: 0.3, z: -ahead }, IDENTITY));
  }

  removeSlots(indices: readonly number[], gap: boolean): bigint {
    let loss = 0n;
    for (const index of [...new Set(indices)].sort((a, b) => b - a)) {
      const egg = this.flock[index];
      if (!egg) continue;
      const p = egg.body.translation(), fragment = this.makeFragment(p.x, p.y, p.z, false, egg.id);
      fragment.body.setLinvel({ x: Math.sin(egg.id * 9) * (gap ? 0.35 : 3.5), y: gap ? -0.7 : 3 + egg.id % 3, z: gap ? 0 : 2 + Math.cos(egg.id) * 2 }, true);
      loss += egg.weight; this.world.removeRigidBody(egg.body); this.flock.splice(index, 1);
    }
    this.represented -= loss;
    // Stop pending growth after a collision: every remaining egg is already represented by a survivor.
    this.targetSize = this.flock.length;
    this.growth = 0;
    return loss;
  }

  beginPan(count = 0n) {
    if (this.pan) return;
    this.pan = true; this.carton = false; this.panCount = count; this.time = 0;
    this.panRadius = 5.7 + panFill(count) * 1.8;
    for (const egg of this.flock) this.world.removeRigidBody(egg.body);
    this.flock.length = 0;
    for (const fragment of this.fragments) this.world.removeRigidBody(fragment.body);
    this.fragments.length = 0;
    this.panFloor = this.world.createCollider(RAPIER.ColliderDesc.cylinder(0.16, this.panRadius).setTranslation(0, -0.18, 0).setFriction(0.6).setRestitution(0.08));
    for (let i = 0; i < 24; i++) {
      const angle = i / 24 * Math.PI * 2;
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(this.panRadius * 0.15, 0.6, 0.17)
        .setTranslation(Math.sin(angle) * (this.panRadius - 0.1), 0.35, Math.cos(angle) * (this.panRadius - 0.1))
        .setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) }));
    }
  }

  dropIntoPan(index: number, total: number) {
    const angle = index * 2.399963229728653;
    const radius = Math.sqrt((index + 0.5) / Math.max(1, total)) * (this.panRadius - 0.8) * panSpread(this.panCount);
    const fragment = this.makeFragment(Math.cos(angle) * radius, 6.5 + (index % 4) * 0.3, Math.sin(angle) * radius, true, index);
    fragment.body.setLinvel({ x: Math.sin(index) * 0.15, y: -2, z: Math.cos(index) * 0.15 }, true);
  }

  private makeFragment(x: number, y: number, z: number, pan: boolean, index: number): Fragment {
    if (this.fragments.length >= FRAGMENT_LIMIT) this.world.removeRigidBody(this.fragments.shift()!.body);
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z)
      .setCcdEnabled(true).setLinearDamping(0.15).setAngularDamping(0.3)
      .setAngvel({ x: Math.sin(index) * 5, y: 2, z: Math.cos(index) * 4 }));
    const description = RAPIER.ColliderDesc.convexHull(this.hull)!;
    const collider = this.world.createCollider(description.setCollisionGroups(pan ? 0xffffffff : 0).setFriction(0.5).setRestitution(0.15), body);
    const fragment = { body, collider, life: pan ? 5 : 2.2, pan, index: this.serial++ };
    this.fragments.push(fragment);
    return fragment;
  }

  step(forward = 0) {
    if (this.disposed) return;
    this.time += STEP;
    for (const fragment of this.fragments) if (!fragment.pan && forward) {
      const p = fragment.body.translation();
      fragment.body.setTranslation({ x: p.x, y: p.y, z: p.z + forward }, true);
    }
    this.world.step();
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const fragment = this.fragments[i];
      fragment.life -= STEP;
      const p = fragment.body.translation();
      let cracked = false;
      if (fragment.pan && this.panFloor) this.world.contactPair(fragment.collider, this.panFloor, manifold => {
        for (let contact = 0; contact < manifold.numContacts(); contact++) if (manifold.contactDist(contact) <= 0.015) cracked = true;
      });
      if (cracked && this.fried.length < PAN_LIMIT) this.fried.push({ x: p.x, z: p.z, angle: fragment.index * 2.4,
        size: panMarkSize(this.panCount) * (0.92 + (fragment.index % 4) * 0.05), born: this.time });
      if (cracked || fragment.life <= 0 || p.y < -18) {
        this.world.removeRigidBody(fragment.body);
        this.fragments.splice(i, 1);
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.flock.length = this.fragments.length = this.fried.length = 0;
    this.world.free();
  }
}
