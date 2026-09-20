/** Whole-screen buttons: hold a half to turn, slide across the centre to reverse. */
export class RoadSteering {
  private readonly pointers = new Map<number, -1 | 1>();

  begin(id: number, side: -1 | 1) { this.pointers.set(id, side); }
  move(id: number, side: -1 | 1) {
    if (!this.pointers.has(id)) return false;
    this.pointers.set(id, side); return true;
  }
  end(id: number) { this.pointers.delete(id); }
  clear() { this.pointers.clear(); }
  get value() {
    let left = 0, right = 0;
    for (const value of this.pointers.values()) { left = Math.min(left, value); right = Math.max(right, value); }
    return left + right;
  }
}

/** Short taps make small corrections; either keys or touch reach full force in 180 ms. */
export class SteeringRamp {
  private value = 0;
  step(dt: number, direction: number) {
    if (!direction) { this.value = 0; return 0; }
    if (Math.sign(direction) !== Math.sign(this.value)) this.value = 0;
    this.value = Math.sign(direction) * Math.min(1, Math.abs(this.value) + dt / 0.18);
    return this.value;
  }
  reset() { this.value = 0; }
}
