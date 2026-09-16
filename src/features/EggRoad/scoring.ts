export type BonusKind = "gates" | "edge" | "speed" | "rhythm" | "drop" | "shortcut";
export type ScoreBreakdown = Record<BonusKind, number>;
export type ScoreNotice = { kind: BonusKind; points: number; serial: number };
export const emptyScore = (): ScoreBreakdown => ({ gates: 0, edge: 0, speed: 0, rhythm: 0, drop: 0, shortcut: 0 });

export class RoadScoring {
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
    this.add("gates", Math.max(0, gates - this.gates) * 100, seconds);
    this.gates = Math.max(this.gates, gates);
    // Only new ground counts. A landing cannot earn continuous bonuses for the air gap.
    const moved = Math.min(1, Math.max(0, distance - this.distance));
    const advanced = distance > this.distance + 0.01;
    this.distance = Math.max(this.distance, distance);
    if (!advanced) return;
    if (speed > 3 && edgeGap >= -0.2 && edgeGap < 0.5) { this.activate("edge", seconds); this.add("edge", moved * 14, seconds); }
    if (speed >= 23) { this.activate("speed", seconds); this.add("speed", moved * Math.min(20, (speed - 22) * 1.2), seconds); }
    if (chain >= 2) { this.activate("rhythm", seconds); this.add("rhythm", moved * Math.min(10, chain) * 2, seconds); }
    if (skipped > 0) this.add("shortcut", skipped * 35, seconds, true);
    if (drop >= 12) this.add("drop", Math.round(drop * 3), seconds, true);
  }
  breakdown(): ScoreBreakdown { return Object.fromEntries(Object.entries(this.totals).map(([k,v]) => [k, Math.floor(v)])) as ScoreBreakdown; }
}
