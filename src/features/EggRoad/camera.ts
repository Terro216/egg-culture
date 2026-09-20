import { MathUtils, Vector3 } from "three";
import type { RoadTrack } from "./track.ts";

const UP = new Vector3(0, 1, 0);
export const FLYBY_SECONDS = 4.6;
export const MAX_LOOK_YAW = MathUtils.degToRad(200);
const GYRO_LOOK_YAW = 0.65;
export const CHASE_TURN_SPEED = 3.6;
const MAP_YAW = 0.68;
const MAP_PITCH = Math.atan(0.52);
const angleDelta = (from: number, to: number) => MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
const yawOf = (direction: { x: number; z: number }) => Math.atan2(direction.x, -direction.z);

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

export function overviewPose(track: RoadTrack, seconds: number, aspect: number, fov: number, orbit?: { yaw: number; pitch: number }) {
  const pose = flybyPose(track, 0, aspect, fov, new Vector3(), new Vector3());
  const distance = pose.position.distanceTo(track.bounds.center);
  const yaw = orbit?.yaw ?? MAP_YAW + seconds * 0.12, pitch = orbit?.pitch ?? MAP_PITCH;
  pose.position.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
    .multiplyScalar(distance).add(track.bounds.center);
  return pose;
}

export class MapOrbit {
  yaw = MAP_YAW;
  pitch = MAP_PITCH;
  private targetYaw = MAP_YAW;
  private targetPitch = MAP_PITCH;
  private manual = false;
  reset() { this.yaw = this.targetYaw = MAP_YAW; this.pitch = this.targetPitch = MAP_PITCH; this.manual = false; }
  restore() { this.targetYaw = MAP_YAW; this.targetPitch = MAP_PITCH; this.manual = false; }
  grab() { this.manual = true; this.targetYaw = this.yaw; this.targetPitch = this.pitch; }
  drag(dx: number, dy: number) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.manual = true;
    this.targetYaw -= dx * 0.008;
    this.targetPitch = MathUtils.clamp(this.targetPitch + dy * 0.006, -0.25, 1.35);
  }
  step(dt: number, horizontal = 0, vertical = 0, auto = true) {
    if (horizontal || vertical) {
      this.manual = true;
      this.targetYaw += horizontal * dt;
      this.targetPitch = MathUtils.clamp(this.targetPitch + vertical * dt * 0.7, -0.25, 1.35);
    }
    if (!this.manual && auto) this.targetYaw += dt * 0.12;
    const rate = 1 - Math.exp(-dt * 8);
    this.yaw += MathUtils.clamp(angleDelta(this.yaw, this.targetYaw) * rate, -dt * 2, dt * 2);
    this.pitch = MathUtils.lerp(this.pitch, this.targetPitch, rate);
  }
}

/** Follow a heading as an angle: opposite vectors must never collapse to zero. */
export class ChaseHeading {
  readonly direction = new Vector3(0, 0, -1);
  private yaw = 0;
  private target = 0;
  private candidate = 0;
  private candidateTime = 0;
  private turnRate = 0;
  private turnSide = 1;
  private flight = false;
  private roadTime = 0;
  get inFlight() { return this.flight; }

  reset(direction: { x: number; z: number }) {
    this.yaw = this.target = this.candidate = yawOf(direction);
    this.candidateTime = this.turnRate = this.roadTime = 0;
    this.flight = false;
    this.turnSide = 1;
    this.direction.set(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  landed() { this.flight = true; this.roadTime = 0; }
  step(dt: number, velocity: { x: number; z: number }, airborne: boolean) {
    // Flight changes the framing, never the reference direction. Follow the
    // same actual horizontal motion on the road, in the air and after a bounce.
    if (airborne) this.landed();
    else if (this.flight) {
      this.roadTime += dt;
      if (this.roadTime >= 0.55) this.flight = false;
    }
    // A nearly stopped egg has no useful travel heading; preserve the view.
    if (Math.hypot(velocity.x, velocity.z) < 3) {
      this.target = this.yaw; this.turnRate = this.candidateTime = 0;
      return this.direction;
    }
    const requested = yawOf(velocity);
    // Ignore a fleeting impact reversal, but do not wait for a settled landing.
    if (Math.abs(angleDelta(this.target, requested)) > Math.PI / 2) {
      if (Math.abs(angleDelta(this.candidate, requested)) > 0.35) { this.candidate = requested; this.candidateTime = 0; }
      this.candidateTime += dt;
      if (this.candidateTime >= 0.16) this.target = requested;
    } else { this.target = this.candidate = requested; this.candidateTime = 0; }
    let error = angleDelta(this.yaw, this.target);
    // Near 180 degrees, tiny left/right noise must not keep changing the chosen arc.
    if (Math.abs(error) > 2.6) error = Math.abs(error) * this.turnSide;
    else if (Math.abs(error) > 0.03) this.turnSide = Math.sign(error);
    const desiredRate = MathUtils.clamp(error * 6, -CHASE_TURN_SPEED, CHASE_TURN_SPEED);
    this.turnRate += MathUtils.clamp(desiredRate - this.turnRate, -dt * 12, dt * 12);
    const turn = this.turnRate * dt;
    if (Math.sign(turn) === Math.sign(error) && Math.abs(turn) >= Math.abs(error)) { this.yaw += error; this.turnRate = 0; }
    else this.yaw += turn;
    this.direction.set(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    return this.direction;
  }
}

/** Orbit around a shared, bounded anchor instead of cutting through the egg. */
export class ChaseRig {
  readonly position = new Vector3();
  readonly target = new Vector3();
  private readonly anchor = new Vector3();
  private readonly offset = new Vector3();
  private readonly direction = new Vector3();
  private yaw = 0;
  private lookY = 0;
  private flight = 0;
  private aimPitch = 0;
  get flightAmount() { return this.flight; }
  reset(position: Vector3, direction: Vector3) {
    this.anchor.copy(position); this.yaw = yawOf(direction); this.lookY = this.flight = 0;
    this.pose();
    this.aimPitch = Math.atan2(this.target.y - this.position.y, 20);
  }
  shift(offset: Vector3) { this.anchor.sub(offset); this.position.sub(offset); this.target.sub(offset); }
  step(dt: number, egg: Vector3, facing: Vector3, lookY: number, flight = false, landing?: Vector3) {
    const rate = 1 - Math.exp(-dt * 8);
    this.yaw += MathUtils.clamp(angleDelta(this.yaw, yawOf(facing)) * (1 - Math.exp(-dt * 12)), -dt * CHASE_TURN_SPEED, dt * CHASE_TURN_SPEED);
    this.lookY = MathUtils.lerp(this.lookY, lookY, rate);
    this.flight = MathUtils.lerp(this.flight, Number(flight), 1 - Math.exp(-dt * (flight ? 3 : 2)));
    this.anchor.lerp(egg, rate);
    this.offset.copy(this.anchor).sub(egg).clampLength(0, 2);
    this.anchor.copy(egg).add(this.offset);
    this.pose();
    const reach = this.target.clone().sub(this.position).dot(this.direction);
    let pitch = Math.atan2(this.target.y - this.position.y, reach);
    if (flight && landing) {
      const eggAhead = egg.clone().sub(this.position).dot(this.direction);
      const landingAhead = landing.clone().sub(this.position).dot(this.direction);
      if (eggAhead > 2 && landingAhead > 2) {
        // Frame both the egg and first contact vertically without changing yaw.
        const eggAngle = Math.atan2(egg.y - this.position.y, eggAhead);
        const contactAngle = Math.atan2(landing.y - this.position.y, landingAhead);
        pitch = (eggAngle + contactAngle) / 2 - this.lookY * 0.2;
      }
    }
    this.aimPitch += MathUtils.clamp((pitch - this.aimPitch) * rate, -dt * 0.9, dt * 0.9);
    this.target.y = this.position.y + Math.tan(this.aimPitch) * reach;
  }
  private pose() {
    this.direction.set(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.position.copy(this.anchor).addScaledVector(this.direction, -12 - this.flight * 6); this.position.y += 6.4 + this.flight * 5 + this.lookY * 3.4;
    this.target.copy(this.anchor).addScaledVector(this.direction, 8 - this.flight * 3); this.target.y += 0.2 - this.flight * 6 - this.lookY * 1.5;
  }
}

export function lookDirection(heading: Vector3, horizontal: number) {
  return heading.clone().applyAxisAngle(UP, -MathUtils.clamp(horizontal, -1, 1) * MAX_LOOK_YAW);
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
  private manualY = 0;
  private orbit = 0;
  private sensor = { x: 0, y: 0 };
  private origin: { beta: number; gamma: number; angle: number } | null = null;
  private latest: { beta: number; gamma: number; angle: number } | null = null;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private disposed = false;
  private readonly changed: (state: GyroState) => void;

  constructor(changed: (state: GyroState) => void) { this.changed = changed; }
  drag(dx: number, dy: number) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.orbit = MathUtils.clamp(this.orbit + dx * 0.004 * (0.9 - 0.35 * Math.abs(this.orbit)), -1, 1);
    this.manualY = MathUtils.clamp(this.manualY + dy * 0.008, -1, 1);
  }
  resetView() { this.orbit = this.manualY = 0; }
  recenter() { this.x = this.y = 0; this.origin = null; this.sensor = { x: 0, y: 0 }; this.resetView(); }
  centerView() { this.x = this.y = 0; this.resetView(); }
  calibrate() {
    if (!this.latest || this.gyroState !== "on") return false;
    this.origin = { ...this.latest }; this.sensor = { x: 0, y: 0 }; this.centerView();
    return true;
  }
  step(dt: number, keyboard = 0) {
    const input = MathUtils.clamp(keyboard, -1, 1);
    if (Math.abs(input) > 0.03) {
      // A held gesture turns gradually, slowing as it approaches the rear view.
      this.orbit = MathUtils.clamp(this.orbit + input * (0.62 - 0.42 * Math.abs(this.orbit)) * dt, -1, 1);
    }
    const rate = 1 - Math.exp(-dt * 6);
    const target = MathUtils.clamp(this.orbit + this.sensor.x * GYRO_LOOK_YAW / MAX_LOOK_YAW, -1, 1);
    // Dragging and explicit recentering share the same bounded angular speed.
    this.x += MathUtils.clamp((target - this.x) * rate, -0.65 * dt, 0.65 * dt);
    this.y = MathUtils.lerp(this.y, MathUtils.clamp(this.manualY + this.sensor.y, -1, 1), rate);
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
    this.latest = { beta: event.beta, gamma: event.gamma, angle };
    if (!this.origin || this.origin.angle !== angle) this.origin = { beta: event.beta, gamma: event.gamma, angle };
    this.sensor = orientationLook(event.beta, event.gamma, this.origin.beta, this.origin.gamma, angle);
    if (this.gyroState !== "on") { clearTimeout(this.timeout); this.status("on"); }
  };

  disableGyro() {
    this.generation++;
    clearTimeout(this.timeout);
    window.removeEventListener("deviceorientation", this.orientation);
    this.recenter(); this.latest = null;
    if (!this.disposed) this.status("off");
  }
  dispose() { this.disposed = true; this.disableGyro(); }
}
