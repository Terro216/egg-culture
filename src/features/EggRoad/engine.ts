import * as THREE from "three";
import { createEggGeometry } from "./geometry.ts";
import { GATE_SPACING } from "./track.ts";
import { initializePhysics, PHYSICS_STEP } from "./simulation.ts";
import type { RoadResult, RoadSnapshot } from "./simulation.ts";
import { RoadJourney } from "./journey.ts";
import { readRoadProgress, saveRoadProgress } from "./storage.ts";
import { CameraLook, FLYBY_SECONDS, flybyPose, overviewPose, lookDirection } from "./camera.ts";
import type { RoadSpec } from "./seed.ts";
import type { GyroState } from "./camera.ts";

type Callbacks = {
  update: (snapshot: RoadSnapshot) => void;
  complete: (result: RoadResult) => void;
  failure: () => void;
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

export async function createRoadEngine(container: HTMLElement, callbacks: Callbacks, signal: AbortSignal) {
  await initializePhysics();
  if (signal.aborted) return null;
  return new RoadEngine(container, callbacks);
}

export class RoadEngine {
  private readonly callbacks: Callbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 310);
  private readonly journey: RoadJourney;
  private get simulation() { return this.journey.simulation; }
  private readonly look: CameraLook;
  private readonly roadGroup = new THREE.Group();
  private readonly roadResources: Resource[] = [];
  private readonly roadFog = new THREE.Fog(0x17131e, 78, 235);
  private readonly egg: THREE.Mesh;
  private readonly light = new THREE.DirectionalLight(0xffe1b1, 3.2);
  private readonly audio = new RoadAudio();
  private readonly resources: Resource[] = [];
  private readonly resizeObserver: ResizeObserver;
  private readonly keys = new Set<string>();
  private readonly previousPosition = new THREE.Vector3();
  private readonly previousRotation = new THREE.Quaternion();
  private readonly heading = new THREE.Vector3(0, 0, -1);
  private readonly desiredHeading = new THREE.Vector3();
  private readonly desiredCamera = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly desiredLook = new THREE.Vector3();
  private readonly lightOffset = new THREE.Vector3(-18, 34, 9);
  private frame = 0;
  private lastTime = performance.now();
  private accumulator = 0;
  private lastHud = 0;
  private pointerSteering = 0;
  private finishedReported = false;
  private previousScore = 0;
  private disposed = false;
  private needsRender = true;
  private flybyTime = 0;
  private overviewTime = 0;
  private readonly transitionPosition = new THREE.Vector3();
  private readonly transitionTarget = new THREE.Vector3();
  private fromOverview = false;
  private roadRevision = 0;
  private menuOpen = true;

  constructor(container: HTMLElement, callbacks: Callbacks) {
    this.callbacks = callbacks;
    this.look = new CameraLook(state => callbacks.gyro?.(state));
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    const renderer = this.renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

    this.journey = new RoadJourney(readRoadProgress());
    this.scene.add(this.roadGroup);
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
    this.buildDust();
    this.resetCamera();

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      this.camera.aspect = width / height;
      this.camera.fov = width < height ? 69 : 59;
      this.camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      this.needsRender = true;
    };
    this.resizeObserver = new ResizeObserver(resize);
    this.resizeObserver.observe(container);
    resize();
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.loseFocus);
    document.addEventListener("visibilitychange", this.visibility);
    renderer.domElement.addEventListener("webglcontextlost", this.contextLost);
    this.notify();
    this.frame = requestAnimationFrame(this.tick);
  }

  private keep<T extends Resource>(resource: T): T { this.resources.push(resource); return resource; }

  private buildRoad() {
    this.roadGroup.clear();
    for (const resource of this.roadResources) resource.dispose();
    this.roadResources.length = 0;
    const keep = <T extends Resource>(resource: T): T => { this.roadResources.push(resource); return resource; };
    const { samples, chunks } = this.simulation.track;
    for (const chunk of chunks) {
      const top: number[] = [], shell: number[] = [];
      for (let segment = 0; segment < chunk.last - chunk.first; segment++) {
        const offset = segment * 24;
        top.push(...chunk.indices.slice(offset, offset + 6));
        shell.push(...chunk.indices.slice(offset + 6, offset + 24));
      }
      shell.push(...chunk.indices.slice(-12));
      const addSurface = (indices: number[], color: number) => {
        const geometry = keep(new THREE.BufferGeometry());
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(chunk.vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        const material = keep(new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.05, side: THREE.DoubleSide }));
        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        this.roadGroup.add(mesh);
      };
      addSurface(top, 0x99634b);
      addSurface(shell, 0x4d3134);
    }

    const edges: number[] = [], edgeIndices: number[] = [];
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      for (const side of [-1, 1]) {
        const outer = sample.position.clone().addScaledVector(sample.right, side * sample.width / 2).addScaledVector(sample.normal, 0.008);
        const inner = outer.clone().addScaledVector(sample.right, -side * 0.075);
        edges.push(outer.x, outer.y, outer.z, inner.x, inner.y, inner.z);
      }
      if (i < samples.length - 1) for (let side = 0; side < 2; side++) {
        const v = i * 4 + side * 2;
        edgeIndices.push(v, v+1, v+4, v+1, v+5, v+4);
      }
    }
    const edgeGeometry = keep(new THREE.BufferGeometry());
    edgeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(edges, 3));
    edgeGeometry.setIndex(edgeIndices);
    this.roadGroup.add(new THREE.Mesh(edgeGeometry, keep(new THREE.MeshBasicMaterial({ color: 0xe1b981, side: THREE.DoubleSide }))));

    const firstGate = Math.floor(samples[0].distance / GATE_SPACING) + 1;
    const lastGate = Math.floor(this.simulation.track.length / GATE_SPACING);
    const gateCount = lastGate - firstGate + 1;
    const gates = keep(new THREE.InstancedMesh(keep(new THREE.BoxGeometry(1, 0.018, 0.12)), keep(new THREE.MeshBasicMaterial({ color: 0xf5d6a0 })), gateCount));
    const matrix = new THREE.Matrix4(), basis = new THREE.Matrix4(), rotation = new THREE.Quaternion();
    let sampleIndex = 0;
    for (let gate = firstGate; gate <= lastGate; gate++) {
      while (sampleIndex < samples.length - 1 && samples[sampleIndex].distance < gate * GATE_SPACING) sampleIndex++;
      const sample = samples[sampleIndex];
      rotation.setFromRotationMatrix(basis.makeBasis(sample.right, sample.normal, sample.tangent.clone().negate()));
      matrix.compose(sample.position.clone().addScaledVector(sample.normal, 0.02), rotation, new THREE.Vector3(sample.width, 1, 1));
      gates.setMatrixAt(gate - firstGate, matrix);
    }
    gates.instanceMatrix.needsUpdate = true;
    gates.computeBoundingSphere();
    this.roadGroup.add(gates);
    this.roadRevision = this.simulation.track.endless?.revision ?? 0;
  }

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

  private resetCamera() {
    this.needsRender = true;
    this.look.centerView();
    this.camera.far = 310;
    this.camera.updateProjectionMatrix();
    this.scene.fog = this.roadFog;
    const sim = this.simulation;
    this.previousPosition.copy(sim.position);
    this.previousRotation.copy(sim.rotation);
    this.egg.position.copy(sim.position);
    this.egg.quaternion.copy(sim.rotation);
    this.heading.copy(sim.track.samples[sim.sampleIndex].tangent).setY(0).normalize();
    this.camera.position.copy(sim.position).addScaledVector(this.heading, -12).add(new THREE.Vector3(0, 6.4, 0));
    this.lookTarget.copy(sim.position).addScaledVector(this.heading, 8);
    this.lookTarget.y += 0.2;
    this.camera.lookAt(this.lookTarget);
  }

  play = () => {
    if (this.disposed) return;
    this.menuOpen = false;
    if (this.simulation.phase === "finished") { if (this.simulation.mode === "levels") this.nextLevel(); else this.restart(); return; }
    if (this.simulation.phase === "over") { this.restart(); return; }
    if (this.simulation.phase === "paused") { this.look.centerView(); this.simulation.resume(); }
    else this.beginFlyby();
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.audio.unlock();
    this.notify();
  };

  private beginFlyby() {
    this.fromOverview = this.simulation.phase === "overview";
    this.transitionPosition.copy(this.camera.position); this.transitionTarget.copy(this.lookTarget);
    this.flybyTime = 0;
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
    try {
      if (!this.journey.advance()) return;
      this.changeRoad(false);
    } catch { this.callbacks.failure(); }
  }

  practice = () => { if (!this.disposed) { this.journey.practice(); this.changeRoad(); } };

  selectRoad(spec: RoadSpec) {
    if (this.disposed) return;
    this.menuOpen = false; this.journey.select(spec); this.changeRoad(false);
  }

  overview = () => {
    if (this.disposed) return;
    const position = this.camera.position.clone(), target = this.lookTarget.clone();
    this.journey.retry(); this.changeRoad(false);
    this.camera.position.copy(position); this.lookTarget.copy(target);
    this.transitionPosition.copy(position); this.transitionTarget.copy(target);
    this.overviewTime = 0; this.simulation.beginOverview(); this.notify();
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

  restart = () => {
    if (this.disposed) return;
    this.clearInput();
    this.journey.retry();
    if (this.simulation.track.endless) this.buildRoad();
    this.simulation.start();
    this.finishedReported = false;
    this.previousScore = 0;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.resetCamera();
    this.audio.unlock();
    this.notify();
  };

  openMenu() { this.pause(); this.menuOpen = true; }
  pause = () => { this.simulation.pause(); this.clearInput(); this.accumulator = 0; this.notify(); };
  steer(value: number) { this.pointerSteering = value; }
  lookAround(x: number, y: number) { this.look.setManual(x, y); }
  toggleGyro() { if (this.look.gyroState === "on" || this.look.gyroState === "waiting") this.look.disableGyro(); else void this.look.enableGyro(); }
  calibrateGyro() { return this.look.calibrate(); }
  setMuted(muted: boolean) { this.audio.muted = muted; if (!muted) this.audio.unlock(); }
  private clearInput() { this.keys.clear(); this.pointerSteering = 0; this.look.setManual(0, 0); }
  private notify() { this.callbacks.update(this.simulation.snapshot()); }
  private loseFocus = () => { if (this.simulation.phase === "running" || this.simulation.phase === "intro" || this.simulation.phase === "overview") this.pause(); else this.clearInput(); };
  private visibility = () => { if (document.hidden) this.loseFocus(); };
  private contextLost = (event: Event) => { event.preventDefault(); this.pause(); this.callbacks.failure(); };

  private keyDown = (event: KeyboardEvent) => {
    if (this.menuOpen) return;
    if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
    if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD", "KeyQ", "KeyE"].includes(event.code)) {
      event.preventDefault();
      this.keys.add(event.code);
    }
    if (event.repeat) return;
    if (event.code === "Escape" || event.code === "KeyP") {
      event.preventDefault();
      if (this.simulation.phase === "running" || this.simulation.phase === "intro" || this.simulation.phase === "overview") this.pause();
      else if (this.simulation.phase === "paused") this.play();
    }
    if (event.code === "KeyR") { event.preventDefault(); this.restart(); }
    if (event.code === "Space" && this.simulation.phase === "intro") { event.preventDefault(); this.skipFlyby(); }
  };
  private keyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };

  private tick = (now: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    const sim = this.simulation;
    const wasIntro = sim.phase === "intro" || sim.phase === "overview";
    if (sim.phase === "overview") {
      this.needsRender = true; this.overviewTime += dt;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const pose = overviewPose(sim.track, reduced ? 0 : Math.max(0, this.overviewTime - 2), this.camera.aspect, this.camera.fov);
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
      const steering = THREE.MathUtils.clamp(keyboard + this.pointerSteering, -1, 1);
      while (this.accumulator >= PHYSICS_STEP && sim.phase === "running") {
        this.previousPosition.copy(sim.position);
        this.previousRotation.copy(sim.rotation);
        sim.step(steering);
        if (sim.originShift.lengthSq()) {
          this.previousPosition.sub(sim.originShift); this.camera.position.sub(sim.originShift);
          this.lookTarget.sub(sim.originShift); this.egg.position.sub(sim.originShift);
          sim.originShift.set(0, 0, 0);
        }
        this.accumulator -= PHYSICS_STEP;
      }
      if (sim.track.endless && sim.track.endless.revision !== this.roadRevision) this.buildRoad();
      const alpha = Math.min(1, this.accumulator / PHYSICS_STEP);
      this.egg.position.lerpVectors(this.previousPosition, sim.position, alpha);
      this.egg.quaternion.slerpQuaternions(this.previousRotation, sim.rotation, alpha);
      if (sim.gates > this.previousScore) { this.previousScore = sim.gates; this.audio.tone(360 + (sim.gates % 5) * 80); }
    }

    // Keep menus and pauses still without spending GPU time on identical frames.
    if (!this.needsRender) return;

    if (!wasIntro && sim.phase === "running") {
      this.desiredHeading.copy(sim.track.samples[sim.sampleIndex].tangent).setY(0).normalize();
      if (!sim.nearRoad && sim.flightTime > 0.3) {
        const velocity = sim.body.linvel();
        if (Math.hypot(velocity.x, velocity.z) > 2) this.desiredHeading.set(velocity.x, 0, velocity.z).normalize();
      }
      this.heading.lerp(this.desiredHeading, 1 - Math.exp(-dt * 3.5)).normalize();
      this.look.step(dt, Number(this.keys.has("KeyE")) - Number(this.keys.has("KeyQ")));
      const facing = lookDirection(this.heading, this.look.x);
      this.desiredCamera.copy(this.egg.position).addScaledVector(facing, -12);
      this.desiredCamera.y += 6.4 + this.look.y * 3.4;
      this.desiredLook.copy(this.egg.position).addScaledVector(facing, 8);
      this.desiredLook.y += 0.2 - this.look.y * 1.5;
      const follow = 1 - Math.exp(-dt * 7);
      this.camera.position.lerp(this.desiredCamera, follow);
      this.lookTarget.lerp(this.desiredLook, follow);
    }
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
      if (checkpoint) saveRoadProgress(checkpoint);
      this.callbacks.complete(sim.snapshot());
    } else if (now - this.lastHud > 100) { this.lastHud = now; this.notify(); }
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    window.removeEventListener("blur", this.loseFocus);
    document.removeEventListener("visibilitychange", this.visibility);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.contextLost);
    this.journey.dispose();
    this.look.dispose();
    this.audio.dispose();
    for (const resource of this.resources) resource.dispose();
    for (const resource of this.roadResources) resource.dispose();
    this.light.shadow.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
