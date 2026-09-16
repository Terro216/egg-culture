import * as THREE from "three";
import { createEggGeometry } from "./geometry.ts";
import { createRoadTrack, GATE_SPACING } from "./track.ts";
import { initializePhysics, PHYSICS_STEP, RoadSimulation } from "./simulation.ts";
import type { RoadResult, RoadSnapshot } from "./simulation.ts";

type Callbacks = {
  update: (snapshot: RoadSnapshot) => void;
  complete: (result: RoadResult) => void;
  failure: () => void;
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
  private readonly simulation: RoadSimulation;
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

  constructor(container: HTMLElement, callbacks: Callbacks) {
    this.callbacks = callbacks;
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
    this.scene.fog = new THREE.Fog(0x17131e, 78, 235);
    this.scene.add(new THREE.HemisphereLight(0xe8dcff, 0x584029, 2));
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);
    Object.assign(this.light.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 100 });
    this.light.shadow.bias = -0.00025;
    this.light.shadow.normalBias = 0.035;
    this.scene.add(this.light, this.light.target);

    const track = createRoadTrack();
    this.simulation = new RoadSimulation(track);
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
    const { samples } = this.simulation.track;
    const top: number[] = [], sides: number[] = [], edges: number[] = [];
    const topIndices: number[] = [], sideIndices: number[] = [], edgeIndices: number[] = [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      for (const side of [-1, 1]) {
        const outer = s.position.clone().addScaledVector(s.right, side * s.width / 2);
        top.push(outer.x, outer.y, outer.z);
        const bottom = outer.clone().addScaledVector(s.normal, -0.3);
        sides.push(outer.x, outer.y, outer.z, bottom.x, bottom.y, bottom.z);
        const inner = outer.clone().addScaledVector(s.right, -side * 0.075).addScaledVector(s.normal, 0.018);
        outer.addScaledVector(s.normal, 0.018);
        edges.push(outer.x, outer.y, outer.z, inner.x, inner.y, inner.z);
      }
      if (i < samples.length - 1) {
        const t = i * 2;
        topIndices.push(t, t + 1, t + 2, t + 1, t + 3, t + 2);
        for (let side = 0; side < 2; side++) {
          const v = i * 4 + side * 2;
          sideIndices.push(v, v + 1, v + 4, v + 1, v + 5, v + 4);
          edgeIndices.push(v, v + 1, v + 4, v + 1, v + 5, v + 4);
        }
      }
    }
    const addSurface = (vertices: number[], indices: number[], material: THREE.Material) => {
      const geometry = this.keep(new THREE.BufferGeometry());
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    };
    addSurface(top, topIndices, this.keep(new THREE.MeshStandardMaterial({
      color: 0x99634b, roughness: 0.92, metalness: 0.08, side: THREE.DoubleSide,
    })));
    addSurface(sides, sideIndices, this.keep(new THREE.MeshStandardMaterial({
      color: 0x4d3134, roughness: 0.85, side: THREE.DoubleSide,
    })));
    addSurface(edges, edgeIndices, this.keep(new THREE.MeshBasicMaterial({ color: 0xe1b981, side: THREE.DoubleSide })));

    const gateCount = Math.floor(this.simulation.track.length / GATE_SPACING);
    const gateMaterial = this.keep(new THREE.MeshBasicMaterial({ color: 0xf5d6a0 }));
    const gateGeometry = this.keep(new THREE.BoxGeometry(1, 0.018, 0.12));
    const gates = new THREE.InstancedMesh(gateGeometry, gateMaterial, gateCount);
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const basis = new THREE.Matrix4();
    for (let gate = 1; gate <= gateCount; gate++) {
      const index = Math.round(gate * GATE_SPACING / this.simulation.track.length * (samples.length - 1));
      const sample = samples[index];
      rotation.setFromRotationMatrix(basis.makeBasis(sample.right, sample.normal, sample.tangent.clone().negate()));
      matrix.compose(sample.position.clone().addScaledVector(sample.normal, 0.025), rotation, new THREE.Vector3(sample.width, 1, 1));
      gates.setMatrixAt(gate - 1, matrix);
    }
    gates.instanceMatrix.needsUpdate = true;
    gates.computeBoundingSphere();
    this.scene.add(gates);
    this.keep(gates);
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
    const sim = this.simulation;
    this.previousPosition.copy(sim.position);
    this.previousRotation.copy(sim.rotation);
    this.egg.position.copy(sim.position);
    this.egg.quaternion.copy(sim.rotation);
    this.heading.copy(sim.track.samples[sim.sampleIndex].tangent).setY(0).normalize();
    this.camera.position.copy(sim.position).addScaledVector(this.heading, -12).add(new THREE.Vector3(0, 6.4, 0));
    this.lookTarget.copy(sim.position).addScaledVector(this.heading, 8);
    this.camera.lookAt(this.lookTarget);
  }

  play = () => {
    if (this.disposed) return;
    if (this.simulation.phase === "over" || this.simulation.phase === "finished") this.restart();
    else if (this.simulation.phase === "paused") this.simulation.resume();
    else this.simulation.start();
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.audio.unlock();
    this.notify();
  };

  restart = () => {
    if (this.disposed) return;
    this.clearInput();
    this.simulation.reset();
    this.simulation.start();
    this.finishedReported = false;
    this.previousScore = 0;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.resetCamera();
    this.audio.unlock();
    this.notify();
  };

  pause = () => { this.simulation.pause(); this.clearInput(); this.accumulator = 0; this.notify(); };
  steer(value: number) { this.pointerSteering = value; }
  setMuted(muted: boolean) { this.audio.muted = muted; if (!muted) this.audio.unlock(); }
  private clearInput() { this.keys.clear(); this.pointerSteering = 0; }
  private notify() { this.callbacks.update(this.simulation.snapshot()); }
  private loseFocus = () => { if (this.simulation.phase === "running") this.pause(); else this.clearInput(); };
  private visibility = () => { if (document.hidden) this.loseFocus(); };
  private contextLost = (event: Event) => { event.preventDefault(); this.pause(); this.callbacks.failure(); };

  private keyDown = (event: KeyboardEvent) => {
    if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD"].includes(event.code)) {
      event.preventDefault();
      this.keys.add(event.code);
    }
    if (event.repeat) return;
    if (event.code === "Escape" || event.code === "KeyP") {
      event.preventDefault();
      if (this.simulation.phase === "running") this.pause();
      else if (this.simulation.phase === "paused") this.play();
    }
    if (event.code === "KeyR") { event.preventDefault(); this.restart(); }
  };
  private keyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };

  private tick = (now: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    const sim = this.simulation;
    if (sim.phase === "running") {
      this.needsRender = true;
      this.accumulator += dt;
      const keyboard = Number(this.keys.has("ArrowRight") || this.keys.has("KeyD")) - Number(this.keys.has("ArrowLeft") || this.keys.has("KeyA"));
      const steering = THREE.MathUtils.clamp(keyboard + this.pointerSteering, -1, 1);
      while (this.accumulator >= PHYSICS_STEP && sim.phase === "running") {
        this.previousPosition.copy(sim.position);
        this.previousRotation.copy(sim.rotation);
        sim.step(steering);
        this.accumulator -= PHYSICS_STEP;
      }
      const alpha = Math.min(1, this.accumulator / PHYSICS_STEP);
      this.egg.position.lerpVectors(this.previousPosition, sim.position, alpha);
      this.egg.quaternion.slerpQuaternions(this.previousRotation, sim.rotation, alpha);
      if (sim.score > this.previousScore) { this.previousScore = sim.score; this.audio.tone(360 + (sim.score % 5) * 80); }
    }

    // Keep menus and pauses still without spending GPU time on identical frames.
    if (!this.needsRender) return;

    this.desiredHeading.copy(sim.track.samples[sim.sampleIndex].tangent).setY(0).normalize();
    if (!sim.grounded && sim.airTime > 0.3) {
      const velocity = sim.body.linvel();
      if (Math.hypot(velocity.x, velocity.z) > 2) this.desiredHeading.set(velocity.x, 0, velocity.z).normalize();
    }
    this.heading.lerp(this.desiredHeading, 1 - Math.exp(-dt * 3.5)).normalize();
    this.desiredCamera.copy(this.egg.position).addScaledVector(this.heading, -12);
    this.desiredCamera.y += 6.4;
    this.desiredLook.copy(this.egg.position).addScaledVector(this.heading, 8);
    this.desiredLook.y += 0.2;
    const follow = 1 - Math.exp(-dt * 7);
    this.camera.position.lerp(this.desiredCamera, follow);
    this.lookTarget.lerp(this.desiredLook, follow);
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
    this.simulation.dispose();
    this.audio.dispose();
    for (const resource of this.resources) resource.dispose();
    this.light.shadow.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
