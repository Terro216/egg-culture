import { MathUtils, Vector3 } from "three";
import type { RoadTrack } from "./track.ts";

const UP = new Vector3(0, 1, 0);
export const FLYBY_SECONDS = 4.6;

/** The sphere fit uses the narrower field of view, including portrait screens. */
export function flybyPose(track: RoadTrack, progress: number, aspect: number, fov: number, finishPosition: Vector3, finishTarget: Vector3) {
  const vertical = MathUtils.degToRad(fov) / 2;
  const horizontal = Math.atan(Math.tan(vertical) * aspect);
  const distance = track.bounds.radius / Math.sin(Math.min(vertical, horizontal)) * 1.14;
  const angle = 0.68 - Math.min(progress / 0.23, 1) * 0.28;
  const direction = new Vector3(Math.sin(angle), 0.52, Math.cos(angle)).normalize();
  const overview = track.bounds.center.clone().addScaledVector(direction, distance);
  const t = MathUtils.smootherstep(progress, 0.23, 1);
  return {
    position: overview.lerp(finishPosition, t),
    target: track.bounds.center.clone().lerp(finishTarget, t),
    far: Math.max(310, distance + track.bounds.radius * 2),
  };
}

export function lookDirection(heading: Vector3, horizontal: number) {
  return heading.clone().applyAxisAngle(UP, -MathUtils.clamp(horizontal, -1, 1) * 0.65);
}

/** Sensor axes stay tied to the device when the screen rotates. */
export function orientationLook(beta: number, gamma: number, originBeta: number, originGamma: number, angle: number) {
  const wrap = (x: number) => ((x + 540) % 360) - 180;
  const b = wrap(beta - originBeta), g = wrap(gamma - originGamma);
  const radians = MathUtils.degToRad(angle);
  return {
    x: MathUtils.clamp((g * Math.cos(radians) + b * Math.sin(radians)) / 24, -1, 1),
    y: MathUtils.clamp((b * Math.cos(radians) - g * Math.sin(radians)) / 22, -1, 1),
  };
}

export type GyroState = "off" | "waiting" | "on" | "unavailable";

export class CameraLook {
  x = 0;
  y = 0;
  gyroState: GyroState = "off";
  private manual = { x: 0, y: 0 };
  private sensor = { x: 0, y: 0 };
  private origin: { beta: number; gamma: number; angle: number } | null = null;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private disposed = false;
  private readonly changed: (state: GyroState) => void;

  constructor(changed: (state: GyroState) => void) { this.changed = changed; }
  setManual(x: number, y: number) { this.manual = { x: MathUtils.clamp(x, -1, 1), y: MathUtils.clamp(y, -1, 1) }; }
  recenter() { this.x = this.y = 0; this.origin = null; this.sensor = { x: 0, y: 0 }; this.setManual(0, 0); }
  step(dt: number, keyboard = 0) {
    const rate = 1 - Math.exp(-dt * 8);
    this.x = MathUtils.lerp(this.x, MathUtils.clamp(this.manual.x + this.sensor.x + keyboard, -1, 1), rate);
    this.y = MathUtils.lerp(this.y, MathUtils.clamp(this.manual.y + this.sensor.y, -1, 1), rate);
  }
  private status(state: GyroState) { this.gyroState = state; this.changed(state); }

  async enableGyro() {
    this.disableGyro();
    const generation = this.generation;
    if (typeof DeviceOrientationEvent === "undefined" || !window.isSecureContext) { this.status("unavailable"); return; }
    try {
      const api = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
      if (api.requestPermission && await api.requestPermission() !== "granted") {
        if (!this.disposed && generation === this.generation) this.status("unavailable");
        return;
      }
      if (this.disposed || generation !== this.generation) return;
      this.status("waiting");
      window.addEventListener("deviceorientation", this.orientation);
      this.timeout = setTimeout(() => { this.disableGyro(); this.status("unavailable"); }, 2500);
    } catch { if (!this.disposed && generation === this.generation) this.status("unavailable"); }
  }

  private orientation = (event: DeviceOrientationEvent) => {
    if (event.beta === null || event.gamma === null || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    const angle = window.screen.orientation?.angle ?? Number((window as Window & { orientation?: number }).orientation ?? 0);
    if (!this.origin || this.origin.angle !== angle) this.origin = { beta: event.beta, gamma: event.gamma, angle };
    this.sensor = orientationLook(event.beta, event.gamma, this.origin.beta, this.origin.gamma, angle);
    if (this.gyroState !== "on") { clearTimeout(this.timeout); this.status("on"); }
  };

  disableGyro() {
    this.generation++;
    clearTimeout(this.timeout);
    window.removeEventListener("deviceorientation", this.orientation);
    this.recenter();
    if (!this.disposed) this.status("off");
  }
  dispose() { this.disposed = true; this.disableGyro(); }
}
