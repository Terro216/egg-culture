const clamp = (value: number) => Math.max(-1, Math.min(1, value));

/** Each finger keeps its own anchor, even after crossing the screen midpoint. */
export class RoadSteering {
  private readonly pointers = new Map<number, { x: number; side: number; value: number }>();

  begin(id: number, x: number, side: -1 | 1) {
    if (Number.isFinite(x)) this.pointers.set(id, { x, side, value: side * 0.25 });
  }
  move(id: number, x: number) {
    const pointer = this.pointers.get(id);
    if (!pointer || !Number.isFinite(x)) return;
    const distance = x - pointer.x;
    const drag = Math.sign(distance) * Math.max(0, Math.abs(distance) - 3) / 64;
    const value = clamp(pointer.side * 0.25 + drag);
    pointer.value = Math.abs(value) < 0.035 ? 0 : value;
  }
  end(id: number) { this.pointers.delete(id); }
  clear() { this.pointers.clear(); }
  get value() {
    let left = 0, right = 0;
    for (const { value } of this.pointers.values()) { left = Math.min(left, value); right = Math.max(right, value); }
    return left + right;
  }
}

/** Short keyboard presses make small corrections; holding reaches full force. */
export class KeyboardSteering {
  private value = 0;
  step(dt: number, direction: number) {
    if (!direction) { this.value = 0; return 0; }
    if (Math.sign(direction) !== Math.sign(this.value)) this.value = 0;
    this.value = Math.sign(direction) * Math.min(1, Math.abs(this.value) + dt / 0.18);
    return this.value;
  }
  reset() { this.value = 0; }
}
