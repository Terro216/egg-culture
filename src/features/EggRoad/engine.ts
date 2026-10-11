import * as THREE from "three";
import { ROAD_RULES_VERSION } from "./rules.ts";
import { createEggGeometry } from "./geometry.ts";
import { createEggOcclusion } from "./eggOcclusion.ts";
import type { RoadTrack } from "./track.ts";
import { RoadRenderer } from "./roadRenderer.ts";
import { RoadTrackFactory } from "./trackFactory.ts";
import { RoadGhost } from "./ghost.ts";
import { RoadKeyboard } from "./input.ts";
import { RoadEngineError } from "./errors.ts";
import type { RoadFailure } from "./errors.ts";
import { initializePhysics, PHYSICS_STEP } from "./simulation.ts";
import type { RoadResult, RoadSnapshot } from "./simulation.ts";
import { RoadJourney } from "./journey.ts";
import type { RoadProgress } from "./storage.ts";
import { CameraLook, ChaseHeading, ChaseRig, MapOrbit, FLYBY_SECONDS, flybyPose, overviewPose, lookDirection } from "./camera.ts";
import { LoopCamera } from "./loopCamera.ts";
import { SteeringRamp } from "./controls.ts";
import { landingGuideEligible, predictLandingGuide } from "./landing.ts";
import type { RoadSpec } from "./seed.ts";
import type { GyroState } from "./camera.ts";

type Callbacks = {
  update: (snapshot: RoadSnapshot) => void;
  complete: (result: RoadResult, checkpoint: RoadProgress | null) => void;
  start: () => string | null;
  menu: (open: boolean) => void;
  busy: (busy: boolean) => void;
  failure: (code: RoadFailure) => void;
  gyro?: (state: GyroState) => void;
};
type Resource = { dispose: () => void };

class RoadAudio {
  private context: AudioContext | null = null;
  muted = true;
  unlock() {
    if (this.muted) return;
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
    } catch { /* Sound is optional. */ }
  }
  tone(frequency: number, length = 0.09) {
    const ctx = this.context;
    if (this.muted || !ctx || ctx.state !== "running") return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.68, ctx.currentTime + length);
    gain.gain.setValueAtTime(0.045, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + length);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + length);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  dispose() { if (this.context) void this.context.close().catch(() => {}); }
}

export async function createRoadEngine(container: HTMLElement, callbacks: Callbacks, signal: AbortSignal, spec: RoadSpec) {
  const factory = new RoadTrackFactory();
  signal.addEventListener("abort", () => factory.dispose(), { once: true });
  let instance: RoadEngine | null = null;
  signal.addEventListener("abort", () => instance?.dispose(), { once: true });
  try {
    const [track] = await Promise.all([
      factory.create(spec).catch(error => { throw new RoadEngineError("track", error); }),
      initializePhysics().catch(error => { throw new RoadEngineError("physics", error); }),
    ]);
    if (signal.aborted) { factory.dispose(); return null; }
    instance = new RoadEngine(container, callbacks, spec, track, factory);
    await instance.warmup();
    if (signal.aborted) { instance.dispose(); return null; }
    return instance;
  } catch (error) { instance?.dispose(); factory.dispose(); throw error; }
}

export class RoadEngine {
  private readonly callbacks: Callbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 310);
  private baseFov = 62;
  private readonly journey: RoadJourney;
  private get simulation() { return this.journey.simulation; }
  private readonly look: CameraLook;
  private readonly loopCamera = new LoopCamera();
  private readonly roadVisuals = new RoadRenderer();
  private readonly factory: RoadTrackFactory;
  private readonly keyboard: RoadKeyboard;
  private selection = 0;
  private busy = false;
  private failed = false;
  private haptics = false;
  private get keys() { return this.keyboard.keys; }
  private readonly roadFog = new THREE.Fog(0x17131e, 78, 235);
  private readonly egg: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly light = new THREE.DirectionalLight(0xffe1b1, 3.2);
  private readonly ghost = new RoadGhost();
  private readonly ghostMesh: THREE.Mesh;
  private readonly audio = new RoadAudio();
  private readonly resources: Resource[] = [];
  private readonly resizeObserver: ResizeObserver;
  private readonly previousPosition = new THREE.Vector3();
  private readonly previousRotation = new THREE.Quaternion();
  private readonly heading = new THREE.Vector3(0, 0, -1);
  private readonly chaseHeading = new ChaseHeading();
  private readonly chaseRig = new ChaseRig();
  private readonly mapOrbit = new MapOrbit();
  private readonly steeringRamp = new SteeringRamp();
  private readonly lookTarget = new THREE.Vector3();
  private readonly landingMarker = new THREE.Group();
  private landingGuide = false;
  private lastPrediction = 0;
  private readonly lightOffset = new THREE.Vector3(-18, 34, 9);
  private frame = 0;
  private lastTime = performance.now();
  private accumulator = 0;
  private lastHud = 0;
  private pointerSteering = 0;
  private finishedReported = false;
  private previousScore = 0;
  private previousStroke = 0;
  private disposed = false;
  private needsRender = true;
  private flybyTime = 0;
  private overviewTime = 0;
  private readonly transitionPosition = new THREE.Vector3();
  private readonly transitionTarget = new THREE.Vector3();
  private fromOverview = false;
  private roadRevision = 0;
  private menuOpen = true;

  constructor(container: HTMLElement, callbacks: Callbacks, spec: RoadSpec, track: RoadTrack, factory: RoadTrackFactory) {
    this.callbacks = callbacks; this.factory = factory;
    try {
    this.look = new CameraLook(state => callbacks.gyro?.(state));
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    const renderer = this.renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.setAttribute("aria-hidden", "true");
    container.appendChild(renderer.domElement);
    this.scene.background = new THREE.Color(0x17131e);
    this.scene.fog = this.roadFog;
    this.scene.add(new THREE.HemisphereLight(0xe8dcff, 0x584029, 2));
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);
    Object.assign(this.light.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 100 });
    this.light.shadow.bias = -0.00025;
    this.light.shadow.normalBias = 0.035;
    this.scene.add(this.light, this.light.target);

    this.journey = new RoadJourney(spec, track);
    this.factory.prepare(track);
    this.scene.add(this.roadVisuals.group);
    this.buildRoad();
    const eggGeometry = this.keep(createEggGeometry());
    const eggTexture = this.keep(this.shellTexture());
    const material = this.keep(new THREE.MeshStandardMaterial({
      color: 0xfff4dc, map: eggTexture, roughness: 0.57, metalness: 0.02,
    }));
    this.egg = new THREE.Mesh(eggGeometry, material);
    this.egg.castShadow = true;
    this.egg.receiveShadow = true;
    this.scene.add(this.egg);
    const silhouette = createEggOcclusion(eggGeometry);
    this.keep(silhouette.material); this.egg.add(silhouette);
    this.ghostMesh = new THREE.Mesh(eggGeometry, this.keep(new THREE.MeshBasicMaterial({ color: 0x9adeef, transparent: true, opacity: .28, depthWrite: false })));
    this.ghostMesh.visible = false; this.scene.add(this.ghostMesh);
    this.buildDust();
    this.buildLandingMarker();
    this.resetCamera();

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      this.camera.aspect = width / height;
      this.baseFov = width < height ? 69 : 59;
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      this.wake();
    };
    this.resizeObserver = new ResizeObserver(resize);
    this.resizeObserver.observe(container);
    resize();
    this.keyboard = new RoadKeyboard({ phase: () => this.simulation.phase, menu: () => this.menuOpen || this.busy,
      play: this.play, pause: this.pause, restart: () => { void this.restart(); }, center: this.centerLook, skip: this.skipFlyby, jump: this.jump });
    window.addEventListener("blur", this.loseFocus);
    document.addEventListener("visibilitychange", this.visibility);
    renderer.domElement.addEventListener("webglcontextlost", this.contextLost);
    this.notify();
    this.wake();
    } catch (error) { this.dispose(); throw new RoadEngineError("graphics", error); }
  }

  private keep<T extends Resource>(resource: T): T { this.resources.push(resource); return resource; }

  private buildRoad() {
    this.roadVisuals.sync(this.simulation.track);
    this.roadRevision = this.simulation.track.endless?.revision ?? 0;
    this.factory.prepare(this.simulation.track);
  }

  warmup() { return this.renderer.compileAsync(this.scene, this.camera); }
  setQuality(quality: "auto" | "low" | "high") {
    const ratio = Math.min(window.devicePixelRatio, quality === "low" ? 1 : quality === "high" ? 2 : 1.5);
    const shadows = quality !== "low";
    if (this.renderer.getPixelRatio() === ratio && this.renderer.shadowMap.enabled === shadows) return;
    this.renderer.setPixelRatio(ratio);
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse(object => {
        if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.needsUpdate = true;
      });
    }
    this.wake();
  }
  setHaptics(enabled: boolean) { this.haptics = enabled; }
  setGhost(enabled: boolean) { this.ghost.enabled = enabled; if (!enabled) this.ghostMesh.visible = false; this.wake(); }
  private startAttempt() { this.ghost.begin(this.simulation.snapshot().code, this.callbacks.start()); }

  private shellTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f9eddb";
    ctx.fillRect(0, 0, 256, 256);
    let seed = 17;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 520; i++) {
      const x = random() * 256, y = random() * 256;
      ctx.fillStyle = `rgba(132, 92, 60, ${0.1 + random() * 0.23})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 0.3 + random() * 1.3, 0.25 + random() * 0.7, random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private buildDust() {
    const vertices: number[] = [];
    let seed = 1203;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 650; i++) vertices.push((random() - 0.5) * 380, random() * 220 - 150, (random() - 0.5) * 360);
    const geometry = this.keep(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    this.scene.add(new THREE.Points(geometry, this.keep(new THREE.PointsMaterial({
      color: 0xe1bd93, size: 0.13, transparent: true, opacity: 0.45, depthWrite: false,
    }))));
  }

  private buildLandingMarker() {
    const material = this.keep(new THREE.MeshBasicMaterial({ color: 0xffedc4, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    this.landingMarker.add(new THREE.Mesh(this.keep(new THREE.RingGeometry(0.9, 1.04, 40)), material));
    this.scene.add(this.landingMarker);
  }

  private updateLandingMarker(now: number) {
    if (!this.landingGuide || !landingGuideEligible(this.simulation)) { this.landingMarker.visible = false; return; }
    // Ten bounded predictions per second; never step or clone the physics world.
    if (now - this.lastPrediction < 100) return;
    this.lastPrediction = now;
    const landing = predictLandingGuide(this.simulation);
    this.landingMarker.visible = Boolean(landing);
    if (!landing) return;
    this.landingMarker.scale.setScalar(1 + landing.uncertainty * .35);
    this.landingMarker.position.copy(landing.position).addScaledVector(landing.sample.normal, 0.07);
    this.landingMarker.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(landing.sample.right, landing.sample.tangent, landing.sample.normal));
  }

  private resetCamera() {
    this.needsRender = true;
    this.look.centerView();
    this.landingMarker.visible = false; this.lastPrediction = 0;
    this.camera.far = 310;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.scene.fog = this.roadFog;
    const sim = this.simulation;
    this.previousStroke = sim.rhythm.strokes;
    this.previousPosition.copy(sim.position);
    this.previousRotation.copy(sim.rotation);
    this.egg.position.copy(sim.position);
    this.egg.quaternion.copy(sim.rotation);
    this.heading.copy(sim.track.samples[sim.sampleIndex].tangent).setY(0).normalize();
    this.loopCamera.reset();
    this.chaseHeading.reset(this.heading);
    this.chaseRig.reset(sim.position, this.heading);
    this.camera.position.copy(this.chaseRig.position);
    this.lookTarget.copy(this.chaseRig.target);
    this.camera.lookAt(this.lookTarget);
  }

  play = () => {
    if (this.disposed || this.busy || this.failed) return;
    if (!["ready", "overview", "paused", "over", "finished"].includes(this.simulation.phase)) return;
    this.menuOpen = false; this.callbacks.menu(false);
    if (this.simulation.phase === "finished") { if (this.simulation.mode === "levels") this.nextLevel(); else this.restart(); return; }
    if (this.simulation.phase === "over") { this.restart(); return; }
    if (this.simulation.phase === "paused") this.simulation.resume();
    else this.beginFlyby();
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.audio.unlock();
    this.notify();
  };

  private beginFlyby() {
    this.fromOverview = this.simulation.phase === "overview";
    this.clearInput();
    this.transitionPosition.copy(this.camera.position); this.transitionTarget.copy(this.lookTarget);
    this.flybyTime = 0;
    this.startAttempt();
    this.simulation.beginIntro();
    this.needsRender = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) this.skipFlyby();
  }

  skipFlyby = () => {
    if (this.simulation.phase !== "intro") return;
    this.simulation.start();
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.resetCamera();
    this.notify();
  };

  private nextLevel() {
    const progress = this.journey.checkpoint();
    if (progress) void this.selectRoad({ ...progress, mode: "levels" }).then(ok => { if (ok) this.play(); });
  }

  practice = () => { void this.selectRoad({ mode: "practice", level: 1, seed: 0, version: ROAD_RULES_VERSION }); };

  async selectRoad(spec: RoadSpec): Promise<boolean> {
    if (this.disposed || this.failed) return false;
    const selection = ++this.selection;
    this.pause(); this.busy = true; this.callbacks.busy(true);
    try {
      const track = await this.factory.create(spec);
      if (this.disposed || selection !== this.selection) return false;
      this.journey.select(spec, track);
      this.menuOpen = false; this.callbacks.menu(false); this.changeRoad(false);
      return true;
    } catch { if (!this.disposed) this.fail("track"); return false; }
    finally { if (!this.disposed && selection === this.selection) { this.busy = false; this.callbacks.busy(false); } }
  }

  overview = async () => {
    if (this.disposed || this.busy || this.failed) return;
    this.menuOpen = false; this.callbacks.menu(false);
    const position = this.camera.position.clone(), target = this.lookTarget.clone();
    if (this.simulation.track.endless) {
      const track = this.simulation.track;
      if (!await this.selectRoad({ mode: "endless", level: 2, seed: track.seed, version: track.version })) return;
    } else { this.journey.retry(); this.changeRoad(false); }
    this.camera.position.copy(position); this.lookTarget.copy(target);
    this.transitionPosition.copy(position); this.transitionTarget.copy(target);
    this.mapOrbit.reset(); this.overviewTime = 0; this.simulation.beginOverview(); this.notify();
  };

  private changeRoad(fly = true) {
    this.clearInput();
    this.buildRoad();
    this.finishedReported = false;
    this.previousScore = this.accumulator = 0;
    this.lastTime = performance.now();
    this.resetCamera();
    if (fly) this.beginFlyby();
    this.audio.unlock();
    this.notify();
  }

  restart = async () => {
    if (this.disposed || this.busy || this.failed) return;
    this.clearInput();
    if (this.simulation.track.endless) {
      const track = this.simulation.track;
      if (!await this.selectRoad({ mode: "endless", level: 2, seed: track.seed, version: track.version })) return;
    } else this.journey.retry();
    this.menuOpen = false; this.callbacks.menu(false);
    this.startAttempt();
    this.simulation.start();
    this.finishedReported = false;
    this.previousScore = 0;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.resetCamera();
    this.audio.unlock();
    this.notify();
  };

  openMenu() { this.pause(); this.menuOpen = true; this.callbacks.menu(true); }
  pause = () => { this.simulation.pause(); this.clearInput(); this.accumulator = 0; this.notify(); };
  steer(value: number) { this.pointerSteering = value; if (!value) this.steeringRamp.reset(); }
  jump = () => {
    if (!this.simulation.jump()) return;
    this.audio.unlock(); this.audio.tone(520, 0.16);
    this.notify();
  };
  lookAround(dx: number, dy: number) { this.look.drag(dx, dy); }
  setViewRotation(rotation: number) { this.look.setViewRotation(rotation); }
  centerLook = () => { this.look.resetView(); };
  grabOverview() { if (this.simulation.phase === "overview") this.mapOrbit.grab(); }
  rotateOverview(dx: number, dy: number) { if (this.simulation.phase === "overview") this.mapOrbit.drag(dx, dy); }
  resetOverview = () => { if (this.simulation.phase === "overview") this.mapOrbit.restore(); };
  toggleGyro() { if (this.look.gyroState === "on" || this.look.gyroState === "waiting") this.look.disableGyro(); else void this.look.enableGyro(); }
  calibrateGyro() { return this.look.calibrate(); }
  setMuted(muted: boolean) { this.audio.muted = muted; if (!muted) this.audio.unlock(); }
  setLandingGuide(enabled: boolean) {
    this.landingGuide = enabled; this.landingMarker.visible = false;
    this.lastPrediction = 0; this.wake();
  }
  private clearInput() { this.keyboard?.clear(); this.pointerSteering = 0; this.steeringRamp.reset(); }
  private notify() { this.callbacks.update(this.simulation.snapshot()); this.wake(); }
  private wake() { this.needsRender = true; if (!this.frame && !this.disposed && !this.failed) this.frame = requestAnimationFrame(this.tick); }
  private fail(code: RoadFailure) {
    this.pause(); this.failed = true; cancelAnimationFrame(this.frame); this.frame = 0;
    this.callbacks.failure(code);
  }
  private loseFocus = () => { if (this.simulation.phase === "running" || this.simulation.phase === "intro" || this.simulation.phase === "overview") this.pause(); else this.clearInput(); };
  private visibility = () => { if (document.hidden) this.loseFocus(); };
  private contextLost = (event: Event) => { event.preventDefault(); this.fail("context"); };

  private tick = (now: number) => {
    this.frame = 0;
    if (this.disposed || this.failed) return;
    try { this.renderFrame(now); } catch { this.fail("runtime"); return; }
    if (!this.frame && (this.needsRender || ["running", "intro", "overview"].includes(this.simulation.phase))) this.frame = requestAnimationFrame(this.tick);
  };

  private renderFrame(now: number) {
    if (this.disposed) return;
    const dt = Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    const sim = this.simulation;
    const wasIntro = sim.phase === "intro" || sim.phase === "overview";
    if (sim.phase === "overview") {
      this.needsRender = true; this.overviewTime += dt;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const horizontal = Number(this.keys.has("ArrowRight") || this.keys.has("KeyD") || this.keys.has("KeyE")) - Number(this.keys.has("ArrowLeft") || this.keys.has("KeyA") || this.keys.has("KeyQ"));
      const vertical = Number(this.keys.has("ArrowUp") || this.keys.has("KeyW")) - Number(this.keys.has("ArrowDown") || this.keys.has("KeyS"));
      this.mapOrbit.step(dt, horizontal, vertical, !reduced && this.overviewTime > 2);
      const pose = overviewPose(sim.track, 0, this.camera.aspect, this.camera.fov, this.mapOrbit);
      const t = reduced ? 1 : THREE.MathUtils.smootherstep(this.overviewTime / 2, 0, 1);
      this.camera.position.lerpVectors(this.transitionPosition, pose.position, t);
      this.lookTarget.lerpVectors(this.transitionTarget, pose.target, t);
      this.camera.far = Math.max(pose.far, this.camera.position.distanceTo(sim.track.bounds.center) + sim.track.bounds.radius * 2);
      this.camera.updateProjectionMatrix(); this.scene.fog = null;
    }
    if (sim.phase === "intro") {
      this.needsRender = true;
      this.flybyTime += dt;
      const endPosition = sim.position.clone().addScaledVector(this.heading, -12).add(new THREE.Vector3(0, 6.4, 0));
      const endTarget = sim.position.clone().addScaledVector(this.heading, 8).add(new THREE.Vector3(0, 0.2, 0));
      const pose = flybyPose(sim.track, Math.min(1, this.flybyTime / FLYBY_SECONDS), this.camera.aspect, this.camera.fov, endPosition, endTarget);
      if (this.fromOverview) {
        const t = THREE.MathUtils.smootherstep(this.flybyTime / FLYBY_SECONDS, 0, 1);
        this.camera.position.lerpVectors(this.transitionPosition, endPosition, t);
        this.lookTarget.lerpVectors(this.transitionTarget, endTarget, t);
      } else {
        this.camera.position.copy(pose.position); this.lookTarget.copy(pose.target);
      }
      this.camera.far = pose.far;
      this.camera.updateProjectionMatrix();
      this.scene.fog = null;
      if (this.flybyTime >= FLYBY_SECONDS) this.skipFlyby();
    }
    if (!wasIntro && sim.phase === "running") {
      this.needsRender = true;
      this.accumulator += dt;
      const keyboard = Number(this.keys.has("ArrowRight") || this.keys.has("KeyD")) - Number(this.keys.has("ArrowLeft") || this.keys.has("KeyA"));
      while (this.accumulator >= PHYSICS_STEP && sim.phase === "running") {
        const steering = this.steeringRamp.step(PHYSICS_STEP, THREE.MathUtils.clamp(keyboard + this.pointerSteering, -1, 1));
        this.previousPosition.copy(sim.position);
        this.previousRotation.copy(sim.rotation);
        const hardLandings = sim.hardLandings;
        sim.step(steering);
        this.ghost.sample(sim.seconds, sim.position, sim.rotation, sim.originShift);
        if (sim.hardLandings > hardLandings) this.chaseHeading.landed();
        if (sim.originShift.lengthSq()) {
          this.chaseRig.shift(sim.originShift);
          this.previousPosition.sub(sim.originShift); this.camera.position.sub(sim.originShift);
          this.lookTarget.sub(sim.originShift); this.egg.position.sub(sim.originShift);
          this.landingMarker.position.sub(sim.originShift);
          sim.originShift.set(0, 0, 0);
        }
        this.accumulator -= PHYSICS_STEP;
      }
      if (sim.track.endless && sim.track.endless.revision !== this.roadRevision) this.buildRoad();
      const alpha = Math.min(1, this.accumulator / PHYSICS_STEP);
      this.egg.position.lerpVectors(this.previousPosition, sim.position, alpha);
      this.egg.quaternion.slerpQuaternions(this.previousRotation, sim.rotation, alpha);
      if (sim.gates > this.previousScore) { this.previousScore = sim.gates; this.audio.tone(360 + (sim.gates % 5) * 80); }
      if (sim.rhythm.strokes > this.previousStroke) {
        this.previousStroke = sim.rhythm.strokes;
        this.audio.tone(700 + Math.min(6, sim.rhythm.chain) * 60, 0.07);
        try { if (this.haptics) navigator.vibrate?.(12); } catch { /* Feedback is optional. */ }
      }
    }

    // Keep menus and pauses still without spending GPU time on identical frames.
    if (!this.needsRender) return;

    if (!wasIntro && sim.phase === "running") {
      const airborne = !sim.rollingOnRoad && (this.chaseHeading.inFlight || sim.flightTime > 0.2);
      this.heading.copy(this.chaseHeading.step(dt, sim.body.linvel(), airborne));
      this.look.step(dt, Number(this.keys.has("KeyE")) - Number(this.keys.has("KeyQ")));
      const facing = lookDirection(this.heading, this.look.x);
      this.updateLandingMarker(now);
      this.chaseRig.step(dt, this.egg.position, facing, this.look.y, this.chaseHeading.inFlight,
        !sim.rollingOnRoad && this.landingMarker.visible ? this.landingMarker.position : undefined);
      this.camera.position.copy(this.chaseRig.position);
      this.lookTarget.copy(this.chaseRig.target);
      this.loopCamera.apply(dt, sim.track, sim.sampleIndex, this.egg.position, this.camera.position, this.lookTarget);
      const fov = this.baseFov + this.chaseRig.flightAmount * (this.camera.aspect < 1 ? 12 : 20);
      if (Math.abs(this.camera.fov - fov) > 0.001) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    } else this.landingMarker.visible = false;
    this.ghostMesh.visible = sim.phase === "running" && this.ghost.pose(sim.seconds, this.ghostMesh.position, this.ghostMesh.quaternion);
    this.camera.lookAt(this.lookTarget);
    this.light.position.copy(this.egg.position).add(this.lightOffset);
    this.light.target.position.copy(this.egg.position);
    this.renderer.render(this.scene, this.camera);
    this.needsRender = false;

    if (!this.finishedReported && (sim.phase === "over" || sim.phase === "finished")) {
      this.finishedReported = true;
      this.clearInput();
      this.audio.tone(sim.phase === "finished" ? 620 : 140, 0.35);
      this.notify();
      const checkpoint = this.journey.checkpoint();
      this.callbacks.complete(sim.snapshot(), checkpoint);
      this.ghost.finish(sim.snapshot());
    } else if (now - this.lastHud > 100) { this.lastHud = now; this.notify(); }
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    this.keyboard?.dispose();
    this.factory.dispose();
    window.removeEventListener("blur", this.loseFocus);
    document.removeEventListener("visibilitychange", this.visibility);
    this.renderer?.domElement.removeEventListener("webglcontextlost", this.contextLost);
    this.journey?.dispose();
    this.look?.dispose();
    this.audio.dispose();
    for (const resource of this.resources) resource.dispose();
    this.roadVisuals.dispose();
    this.light.shadow.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer?.domElement.remove();
  }
}
