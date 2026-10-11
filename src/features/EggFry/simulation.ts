import { FryPhysics } from "./physics.ts";
import { applyOperation, CARTON_HALF_WIDTH, clampSteering, COLLECTION_STEP, collectionMultiplier, FRY_SECONDS, isLargeMultiplier, MAX_COLLECTION_MULTIPLIER, panDropCount, STARTING_EGGS, STEP } from "./rules.ts";
import { bindGate, forkGap, gateChoice, gateOperations, makeSector, mysteryEffect, roundedAmount, runningSpeed, sectorAt, sectorEnd, supportedCenter } from "./track.ts";
import type { FryRow, HazardRow, MysteryEffect } from "./track.ts";
import type { FryResult } from "./storage.ts";
import { FryTrail } from "./trail.ts";

export type FryPhase = "ready" | "running" | "falling" | "frying" | "result" | "paused" | "countdown";
export type FryNotice = { id: number; kind: "gain" | "loss" | "shield" | "protected" | "jackpot" | "cancel" | "brake" | "cancelled" | "mystery"; amount: bigint; at: number; effect?: MysteryEffect };
export type FrySnapshot = {
  phase: FryPhase; eggs: bigint; peak: bigint; x: number; distance: number; seconds: number;
  sector: number; untilExit: number; speed: number; shield: boolean; fryProgress: number; received: bigint;
  countdown: number; result: FryResult | null; notice: FryNotice | null; selectedSide: 0 | 1;
  cancelCharges: number; brakeCharges: number; gateCancelled: boolean; brakeRemaining: number;
  invertPending: number; invertRemaining: number; split: boolean;
  collectionMultiplier: number; skillPoints: number; mysteryAhead: boolean;
};

export class FrySimulation {
  readonly physics = new FryPhysics();
  readonly trail = new FryTrail();
  readonly collected = new Set<string>();
  private impacts = new Set<string>();
  private protectedHazards = new Set<string>();
  dodged = 0;
  swaps = 0;
  skillPoints = 0;
  readonly seed: number;
  rows: FryRow[];
  phase: FryPhase = "ready";
  eggs = STARTING_EGGS;
  peak = STARTING_EGGS;
  x = 0;
  distance = 0;
  seconds = 0;
  motionTime = 0;
  shield = false;
  cartonSteeringLimited = false;
  cancelCharges = 0;
  brakeCharges = 0;
  brakeUntil = 0;
  invertStarts = 0;
  invertUntil = 0;
  losses = 0;
  jackpot = false;
  fryTime = 0;
  countdown = 0;
  result: FryResult | null = null;
  notice: FryNotice | null = null;
  selectedSide: 0 | 1 = 0;
  private resolved = new Set<string>();
  private generatedSector = 1;
  private noticeSerial = 0;
  private dropped = 0;
  private resumePhase: "running" | "frying" | "falling" = "running";
  private disposed = false;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.rows = [...makeSector(this.seed, 0), ...makeSector(this.seed, 1)];
    this.prepareBoards();
    this.physics.positionFlock(this.eggs, this.x, 0);
    this.physics.step();
  }

  get inverted() { return this.invertUntil > this.seconds && this.seconds >= this.invertStarts; }
  get collectionMultiplier() { return collectionMultiplier(this.skillPoints); }
  private awardSkill() { this.skillPoints = Math.min((MAX_COLLECTION_MULTIPLIER - 1) * COLLECTION_STEP, this.skillPoints + 1); }
  get speed() {
    const sector = sectorAt(this.distance);
    return runningSpeed(sector, sectorEnd(sector) - this.distance, this.peak) * (this.brakeUntil > this.seconds ? 0.62 : 1);
  }
  private nextGate() { return this.rows.find(row => row.kind === "gate" && !this.resolved.has(row.id) && row.at > this.distance + 3.2); }
  private prepareBoards() {
    const next = this.nextGate();
    if (next?.kind === "gate" && next.at - this.distance < 94) bindGate(next, this.eggs);
    for (const row of this.rows) if (row.kind === "pickup" && !this.collected.has(row.id) && row.at - this.distance < 74) {
      if (row.baseCount === undefined) {
        if (row.adaptive) {
          row.reference = this.eggs;
          const portion = roundedAmount(this.eggs, 3);
          row.baseCount = portion < 8n ? 8n : portion;
        } else row.baseCount = row.count;
      }
      row.multiplier = this.collectionMultiplier;
      row.count = row.baseCount * BigInt(row.multiplier);
    }
  }

  start() { if (this.phase === "ready") this.phase = "running"; }
  pause() {
    if (!["running", "frying", "falling", "countdown"].includes(this.phase)) return;
    if (this.phase !== "countdown") this.resumePhase = this.phase as typeof this.resumePhase;
    this.phase = "paused";
  }
  resume() { if (this.phase === "paused") { this.countdown = 3; this.phase = "countdown"; } }
  skipFrying() { if (this.phase === "frying") { this.fryTime = FRY_SECONDS; this.phase = "result"; } }

  cancelNextGate() {
    if (this.phase !== "running" || !this.cancelCharges) return false;
    const row = this.nextGate();
    if (row?.kind !== "gate" || row.cancelled) return false;
    row.cancelled = true; this.cancelCharges--; this.announce("cancelled"); return true;
  }
  useBrake() {
    if (this.phase !== "running" || !this.brakeCharges || this.brakeUntil > this.seconds) return false;
    this.brakeCharges--; this.brakeUntil = this.seconds + 4; this.announce("brake"); return true;
  }
  private announce(kind: FryNotice["kind"], amount = 0n) {
    if (kind === "loss" && this.notice?.kind === "loss" && this.seconds - this.notice.at < 0.22) {
      this.notice = { ...this.notice, amount: this.notice.amount + amount, at: this.seconds }; return;
    }
    this.notice = { id: ++this.noticeSerial, kind, amount, at: this.seconds };
  }

  private finish(success: boolean, sector: number) {
    if (this.result) return;
    this.result = { eggs: success ? this.eggs : 0n, peak: this.peak, seconds: this.seconds, sector, seed: this.seed, success, losses: this.losses, jackpot: this.jackpot, dodged: this.dodged, swaps: this.swaps, collectionMultiplier: this.collectionMultiplier, skillPoints: this.skillPoints };
    this.phase = success ? "frying" : "falling"; this.fryTime = 0;
    this.shield = false;
    if (success) this.physics.beginPan(this.result.eggs);
    else if (this.physics.flock.length) this.physics.removeSlots(this.physics.flock.map((_, i) => i), true);
  }

  /** Resolving an event is idempotent, including at a checkpoint or zero count. */
  private resolve(row: FryRow, ahead = 0) {
    if (this.resolved.has(row.id) || this.phase !== "running") return;
    this.resolved.add(row.id);
    const before = this.eggs;
    if (row.kind === "gate") {
      bindGate(row, this.eggs);
      if (row.cancelled) this.announce("cancelled");
      else if (row.mystery && gateChoice(row, this.x, this.selectedSide) === "mystery") {
        let effect = mysteryEffect(row.mystery.salt);
        // A full power slot does not turn a lucky draw into a silent no-op.
        if (effect.kind === "shield" && this.shield || effect.kind === "cancel" && this.cancelCharges === 2 || effect.kind === "brake" && this.brakeCharges === 1) {
          effect = { kind: "operation", operation: { kind: "multiply", value: 3n, divisor: 2n } };
        }
        row.mystery.revealed = effect;
        if (effect.kind === "operation") this.eggs = applyOperation(this.eggs, effect.operation);
        else if (effect.kind === "shield") this.shield = true;
        else if (effect.kind === "cancel") this.cancelCharges++;
        else this.brakeCharges++;
        this.awardSkill(); this.announce("mystery", this.eggs - before);
        if (this.notice) this.notice = { ...this.notice, effect };
      }
      else {
        const choice = gateChoice(row, this.x, this.selectedSide);
        const operation = gateOperations(row)[choice === "mystery" ? 0 : choice];
        if (row.swap) this.swaps++;
        this.eggs = applyOperation(this.eggs, operation);
        if (row.operations.every(other => this.eggs >= applyOperation(before, other))) this.awardSkill();
        if (this.eggs > before && isLargeMultiplier(operation)) {
          if (isLargeMultiplier(operation, 20n)) this.jackpot = true;
          this.announce("jackpot", this.eggs - before);
        } else this.announce(this.eggs >= before ? "gain" : "loss", this.eggs >= before ? this.eggs - before : before - this.eggs);
      }
    } else if (row.kind === "pickup" && this.physics.touchesPickup(row.x, ahead)) {
      this.eggs += row.count; this.collected.add(row.id); this.awardSkill(); this.announce("gain", row.count);
    } else if (row.kind === "shield" && this.physics.touchesPickup(row.x, ahead)) {
      this.shield = true; this.collected.add(row.id); this.awardSkill(); this.announce("shield");
    } else if (row.kind === "power" && this.physics.touchesPickup(row.x, ahead)) {
      if (row.power === "cancel") this.cancelCharges = Math.min(2, this.cancelCharges + 1);
      else this.brakeCharges = Math.min(1, this.brakeCharges + 1);
      this.collected.add(row.id); this.awardSkill(); this.announce(row.power);
    } else if (row.kind === "modifier") {
      this.invertStarts = this.seconds + 1.4; this.invertUntil = this.invertStarts + 5.5;
    } else if (row.kind === "exit" && this.selectedSide === 0) this.finish(true, row.sector + 1);
    if (this.eggs < before) this.losses++;
    if (this.eggs > this.peak) this.peak = this.eggs;
    if (this.eggs === 0n) this.finish(false, row.sector + 1);
  }

  private loseSlots(indices: number[], gap: boolean, sector: number) {
    if (!indices.length || this.phase !== "running") return;
    const loss = this.physics.removeSlots(indices, gap);
    if (loss <= 0n) return;
    this.eggs -= loss; this.losses++; this.announce("loss", loss);
    if (this.eggs === 0n) this.finish(false, sector + 1);
  }
  private hitHazard(row: HazardRow, ahead: number) {
    if (this.protectedHazards.has(row.id)) return;
    if (this.shield) {
      if (!this.physics.hitsCarton(row, ahead, this.motionTime, this.x)) return;
      this.impacts.add(row.id); this.protectedHazards.add(row.id);
      this.shield = false; this.announce("protected"); return;
    }
    const indices = this.physics.hitSlots(row, ahead, this.motionTime);
    if (!indices.length) return;
    if (!this.impacts.has(row.id)) {
      this.impacts.add(row.id);
    }
    if (!this.protectedHazards.has(row.id)) this.loseSlots(indices, row.hazard === "gap", row.sector);
  }

  step(targetX: number) {
    if (this.disposed || ["ready", "paused", "result"].includes(this.phase)) return;
    if (this.phase === "countdown") {
      this.countdown = Math.max(0, this.countdown - STEP);
      if (this.countdown <= 0) this.phase = this.resumePhase;
      return;
    }
    if (this.phase === "falling") {
      this.fryTime += STEP; this.physics.step();
      if (this.fryTime >= 1.5) this.phase = "result";
      return;
    }
    if (this.phase === "frying") {
      this.fryTime += STEP;
      const total = panDropCount(this.result?.eggs ?? 0n);
      const duration = Math.min(3.9, 1.2 + total / 180);
      const requested = Math.floor(Math.max(0, Math.min(1, (this.fryTime - 0.6) / duration)) * total);
      while (this.dropped < requested) this.physics.dropIntoPan(this.dropped++, total);
      this.physics.step();
      if (this.fryTime >= FRY_SECONDS) this.phase = "result";
      return;
    }
    this.prepareBoards();
    const sector = sectorAt(this.distance), speed = this.speed, previous = this.distance;
    this.seconds += STEP;
    this.motionTime += STEP * (this.brakeUntil > this.seconds ? 0.55 : 1);
    this.distance += speed * STEP;
    const previousX = this.x;
    const target = this.shield ? supportedCenter(this.seed, this.distance + 15, clampSteering(targetX), previousX, CARTON_HALF_WIDTH + 0.1) : clampSteering(targetX);
    this.cartonSteeringLimited = this.shield && Math.abs(target - clampSteering(targetX)) > 1e-6;
    const delta = target - this.x;
    this.x += Math.max(-9 * STEP, Math.min(9 * STEP, delta * (1 - Math.exp(-STEP * 18))));
    if (this.shield) for (const offset of [3.35, 0.7, -1.95]) {
      const constrained = supportedCenter(this.seed, this.distance + offset, this.x, previousX, CARTON_HALF_WIDTH + 0.1);
      if (Math.abs(constrained - this.x) > 1e-6) this.cartonSteeringLimited = true;
      this.x = constrained;
    }
    if (Math.abs(this.x) > 0.12) this.selectedSide = this.x < 0 ? 0 : 1;
    this.trail.push(this.distance, this.x);
    this.physics.positionFlock(this.eggs, this.x, this.seconds, this.trail, { seed: this.seed, distance: this.distance, carton: this.shield });
    this.physics.step(speed * STEP);
    this.loseSlots(this.physics.unsupportedSlots(this.seed, this.distance), true, sector);
    for (const row of this.rows) {
      if (this.phase !== "running") break;
      const ahead = row.at - this.distance;
      if (row.kind === "gate" && row.swap && row.swapStartedAt === undefined && ahead < speed * 1.9 + 3.2) row.swapStartedAt = this.seconds;
      if (row.kind === "hazard") {
        if (ahead < 7 && ahead > -18) this.hitHazard(row, ahead);
      } else if (row.kind === "pickup" || row.kind === "shield" || row.kind === "power") {
        if (ahead < 5 && ahead > -13 && !this.resolved.has(row.id) && this.physics.touchesPickup(row.x, ahead)) this.resolve(row, ahead);
      } else if (row.at > previous + 3.2 && row.at <= this.distance + 3.2) this.resolve(row);
    }
    if (this.phase !== "running") return;
    const needed = sectorAt(this.distance) + 1;
    while (this.generatedSector < needed) this.rows.push(...makeSector(this.seed, ++this.generatedSector));
    this.prepareBoards();
    const removed = this.rows.filter(row => row.at < this.distance - 24);
    for (const row of removed) {
      if (row.kind === "hazard" && !this.impacts.has(row.id)) { this.dodged++; this.awardSkill(); }
      this.resolved.delete(row.id); this.collected.delete(row.id); this.impacts.delete(row.id); this.protectedHazards.delete(row.id);
    }
    this.rows = this.rows.filter(row => row.at >= this.distance - 24);
  }

  snapshot(): FrySnapshot {
    const sector = sectorAt(this.distance), fryProgress = Math.max(0, Math.min(1, (this.fryTime - 0.6) / 4.8));
    const next = this.nextGate();
    const received = this.phase === "result" ? this.result?.eggs ?? 0n : (this.result?.eggs ?? 0n) * BigInt(Math.floor(fryProgress * 1000)) / 1000n;
    return { phase: this.phase, eggs: this.eggs, peak: this.peak, x: this.x, distance: this.distance, seconds: this.seconds,
      sector, untilExit: Math.max(0, sectorEnd(sector) - this.distance - 3.2), speed: this.speed, shield: this.shield,
      fryProgress, received, countdown: this.countdown, result: this.result, selectedSide: this.selectedSide,
      cancelCharges: this.cancelCharges, brakeCharges: this.brakeCharges, gateCancelled: this.nextGate()?.kind === "gate" && !!(this.nextGate() as Extract<FryRow, { kind: "gate" }>).cancelled,
      brakeRemaining: Math.max(0, this.brakeUntil - this.seconds), invertPending: Math.max(0, this.invertStarts - this.seconds),
      invertRemaining: this.inverted ? this.invertUntil - this.seconds : 0, split: forkGap(this.seed, this.distance + 35) > 0 || forkGap(this.seed, this.distance) > 0,
      collectionMultiplier: this.collectionMultiplier, skillPoints: this.skillPoints,
      mysteryAhead: !!(next?.kind === "gate" && next.mystery && !next.cancelled && next.at - this.distance < 60),
      notice: this.notice && this.seconds - this.notice.at < 1.5 ? this.notice : null };
  }

  dispose() { if (!this.disposed) { this.disposed = true; this.physics.dispose(); } }
}
