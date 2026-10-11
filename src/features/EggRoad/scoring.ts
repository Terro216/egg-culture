import { scoreRules } from "./rules.ts";
import type { RoadVersion } from "./rules.ts";
export type BonusKind = "gates" | "edge" | "speed" | "rhythm" | "drop" | "shortcut";
export type ScoreBreakdown = Record<BonusKind, number>;
export type ScoreNotice = { kind: BonusKind; points: number; serial: number; parts?: { kind: BonusKind; points: number }[] };
export const emptyScore = (): ScoreBreakdown => ({ gates: 0, edge: 0, speed: 0, rhythm: 0, drop: 0, shortcut: 0 });

export class RoadScoring {
  private readonly rules: ReturnType<typeof scoreRules>;
  constructor(version: RoadVersion = 1) { this.rules = scoreRules(version); }
  totals = emptyScore();
  active: BonusKind[] = [];
  notice: ScoreNotice | null = null;
  private distance = 0;
  private gates = 0;
  private serial = 0;
  private noticeUntil = 0;
  private pending = emptyScore();
  private activeUntil: Partial<Record<BonusKind, number>> = {};
  get total() { return Object.values(this.totals).reduce((a, b) => a + Math.floor(b), 0); }
  reset() { this.totals = emptyScore(); this.pending = emptyScore(); this.distance = this.gates = this.serial = this.noticeUntil = 0; this.notice = null; this.active = []; this.activeUntil = {}; }
  tick(seconds: number) { this.active = (Object.keys(this.activeUntil) as BonusKind[]).filter(kind => this.activeUntil[kind]! > seconds); if (seconds > this.noticeUntil) this.notice = null; }
  private activate(kind: BonusKind, seconds: number) {
    this.activeUntil[kind] = seconds + .25;
    if (!this.active.includes(kind)) this.active.push(kind);
  }
  private add(kind: BonusKind, points: number, seconds: number, immediate = false) {
    if (points <= 0) return;
    this.totals[kind] += points;
    this.pending[kind] += points;
    if (kind !== "gates" && (immediate || (!this.notice && this.pending[kind] >= 20))) {
      this.notice = { kind, points: Math.floor(this.pending[kind]), serial: ++this.serial };
      this.pending[kind] = 0; this.noticeUntil = seconds + 1.7;
    }
  }
  contact({ distance, gates, speed, edgeGap, chain, drop, skipped, seconds }: {
    distance: number; gates: number; speed: number; edgeGap: number; chain: number; drop: number; skipped: number; seconds: number;
  }) {
    this.add("gates", Math.max(0, gates - this.gates) * this.rules.gate, seconds);
    this.gates = Math.max(this.gates, gates);
    // Only new ground counts. A landing cannot earn continuous bonuses for the air gap.
    const moved = Math.min(1, Math.max(0, distance - this.distance));
    const advanced = distance > this.distance + 0.01;
    this.distance = Math.max(this.distance, distance);
    if (!advanced) return;
    if (speed > 3 && edgeGap >= -0.2 && edgeGap < 0.5) { this.activate("edge", seconds); this.add("edge", moved * this.rules.edge, seconds); }
    if (speed >= 23) { this.activate("speed", seconds); this.add("speed", moved * Math.min(this.rules.speed, (speed - 22) * 1.2), seconds); }
    if (chain >= 2) { this.activate("rhythm", seconds); this.add("rhythm", moved * Math.min(this.rules.rhythmCap, chain) * this.rules.rhythm, seconds); }
    const landing: { kind: BonusKind; points: number }[] = [];
    if (skipped > 0) landing.push({ kind: "shortcut", points: skipped * this.rules.shortcut });
    if (drop >= 12) landing.push({ kind: "drop", points: Math.round(drop * this.rules.drop) });
    if (landing.length) {
      for (const part of landing) { this.totals[part.kind] += part.points; this.pending[part.kind] = 0; }
      this.notice = { kind: landing[0].kind, points: landing.reduce((sum, part) => sum + part.points, 0), parts: landing, serial: ++this.serial };
      this.noticeUntil = seconds + 2.6;
    }
  }
  breakdown(): ScoreBreakdown { return Object.fromEntries(Object.entries(this.totals).map(([k,v]) => [k, Math.floor(v)])) as ScoreBreakdown; }
}
