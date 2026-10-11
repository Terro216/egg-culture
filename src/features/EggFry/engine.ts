import * as THREE from "three";
import { createEggGeometry } from "../EggRoad/geometry.ts";
import { FryAudio } from "./audio.ts";
import { FrySteering } from "./controls.ts";
import { fryCopy } from "./copy.ts";
import { EGG_SCALE, initializeFryPhysics } from "./physics.ts";
import { CARTON_HALF_DEPTH, CARTON_HALF_WIDTH, CARTON_Z, compactCount, FLOCK_LIMIT, FRAGMENT_LIMIT, isLargeMultiplier, PAN_LIMIT, operationLabel, operationTone, panFill, STEP, tailPoint, visibleFlockSize, VISIBLE_FLOCK_LIMIT } from "./rules.ts";
import type { FryLang } from "./rules.ts";
import { FrySimulation } from "./simulation.ts";
import type { FrySnapshot } from "./simulation.ts";
import type { FryResult } from "./storage.ts";
import { forkGap, gateChoice, gateSwapProgress, hazardFootprint, roadIntervals, subtractInterval } from "./track.ts";
import type { FryRow } from "./track.ts";
import { FryScenery } from "./scenery.ts";

type Resource = { dispose(): void };
type Callbacks = { update(snapshot: FrySnapshot): void; complete(result: FryResult): void; failure(): void };
type RowVisual = { row: FryRow; signature?: string; group: THREE.Group; materials: THREE.MeshBasicMaterial[]; resources: Resource[]; tool?: THREE.Group; gates?: THREE.Group[] };
const PALETTE = { cream: 0xfff1cd, yolk: 0xffba24, mint: 0x70f3c0, coral: 0xff7277, jackpot: 0xf6c35c, mystery: 0xc794ff, road: 0x394b53 };

export async function createFryEngine(host: HTMLElement, lang: FryLang, seed: number, callbacks: Callbacks, signal: AbortSignal) {
  await initializeFryPhysics();
  if (signal.aborted) return null;
  return new FryEngine(host, lang, seed, callbacks);
}

export class FryEngine {
  simulation: FrySimulation;
  readonly steering = new FrySteering();
  readonly audio = new FryAudio();
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(56, 1, 0.1, 180);
  private readonly road = new THREE.Group();
  private readonly pan = new THREE.Group();
  private readonly surroundings = new THREE.Group();
  private readonly rows = new Map<string, RowVisual>();
  private readonly resources: Resource[] = [];
  private readonly colors = new Map<number, THREE.MeshStandardMaterial>();
  private readonly cube = this.keep(new THREE.BoxGeometry(1, 1, 1));
  private readonly sphere = this.keep(new THREE.SphereGeometry(1, 16, 10));
  private readonly cylinder = this.keep(new THREE.CylinderGeometry(1, 1, 1, 32));
  private readonly eggGeometry = this.keep(createEggGeometry(12, 10));
  private readonly matrix = new THREE.Object3D();
  private readonly flock: THREE.InstancedMesh;
  private readonly fragments: THREE.InstancedMesh;
  private readonly whites: THREE.InstancedMesh;
  private readonly yolks: THREE.InstancedMesh;
  private readonly shadows: THREE.InstancedMesh;
  private readonly shells: THREE.InstancedMesh;
  private readonly slats: THREE.InstancedMesh;
  private readonly carton = new THREE.Group();
  private readonly scenery: FryScenery;
  private readonly resizeObserver: ResizeObserver;
  private readonly keys = new Set<string>();
  private readonly runningEye = new THREE.Vector3();
  private readonly runningTarget = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private frame = 0;
  private previousTime = 0;
  private accumulator = 0;
  private hudTime = 0;
  private reported = false;
  private previousNotice = 0;
  private disposed = false;
  private dirty = true;
  private flash = 0;
  private renderPopulation = 10;
  private slowFrames = 0;
  private cartonWasActive = false;
  private cartonBreakAt = -100;
  private cartonBreakX = 0;
  reducedMotion = false;

  constructor(private host: HTMLElement, private lang: FryLang, seed: number, private callbacks: Callbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    this.host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x182631);
    this.scene.fog = new THREE.Fog(0x182631, 48, 115);
    this.scene.add(new THREE.HemisphereLight(0xfff5da, 0x39546b, 3.2));
    const light = new THREE.DirectionalLight(0xffdfad, 3.5); light.position.set(-9, 18, 12); this.scene.add(light);
    const fill = new THREE.DirectionalLight(0x89d1dc, 1.7); fill.position.set(12, 8, -18); this.scene.add(fill);
    this.scene.add(this.road, this.pan, this.surroundings, this.carton);
    this.flock = new THREE.InstancedMesh(this.eggGeometry, this.material(PALETTE.cream), VISIBLE_FLOCK_LIMIT);
    this.fragments = new THREE.InstancedMesh(this.eggGeometry, this.material(PALETTE.cream), FRAGMENT_LIMIT);
    this.whites = new THREE.InstancedMesh(this.sphere, this.material(0xfff6dd), PAN_LIMIT);
    this.yolks = new THREE.InstancedMesh(this.sphere, this.material(PALETTE.yolk), PAN_LIMIT);
    const shadowCanvas = document.createElement("canvas"); shadowCanvas.width = shadowCanvas.height = 64;
    const shadowContext = shadowCanvas.getContext("2d")!, gradient = shadowContext.createRadialGradient(32, 32, 3, 32, 32, 31);
    gradient.addColorStop(0, "#08141fa0"); gradient.addColorStop(1, "#08141f00"); shadowContext.fillStyle = gradient; shadowContext.fillRect(0, 0, 64, 64);
    const shadowTexture = this.keep(new THREE.CanvasTexture(shadowCanvas));
    this.shadows = new THREE.InstancedMesh(this.keep(new THREE.PlaneGeometry(0.75, 0.9)), this.keep(new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false })), VISIBLE_FLOCK_LIMIT);
    this.shells = new THREE.InstancedMesh(this.keep(new THREE.SphereGeometry(1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2)), this.keep(new THREE.MeshStandardMaterial({ color: PALETTE.cream, side: THREE.DoubleSide })), 64);
    this.slats = new THREE.InstancedMesh(this.cube, this.material(0xffffff), 512);
    for (const mesh of [this.flock, this.fragments, this.whites, this.yolks, this.slats, this.shadows, this.shells]) {
      mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.keep(mesh);
    }
    for (let i = 0; i < VISIBLE_FLOCK_LIMIT; i++) this.flock.setColorAt(i, new THREE.Color(i % 11 === 0 ? 0xecc795 : i % 5 === 0 ? 0xffe7ae : 0xffffff));
    this.flock.instanceColor!.needsUpdate = true;
    this.scene.add(this.flock, this.fragments, this.whites, this.yolks, this.shadows, this.shells);
    this.road.add(this.slats);
    this.buildRoad(); this.buildPan(); this.buildCarton();
    this.scenery = new FryScenery(this.surroundings);
    this.scene.background = this.scenery.background;
    this.simulation = new FrySimulation(seed);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(host); this.resize();
    window.addEventListener("blur", this.pause);
    document.addEventListener("visibilitychange", this.visibility);
    this.renderer.domElement.addEventListener("webglcontextlost", this.contextLost);
    this.notify(); this.frame = requestAnimationFrame(this.tick);
  }

  private keep<T extends Resource>(resource: T): T { this.resources.push(resource); return resource; }
  private material(color: number): THREE.MeshStandardMaterial {
    if (!this.colors.has(color)) this.colors.set(color, this.keep(new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.04 })));
    return this.colors.get(color)!;
  }
  private box(group: THREE.Group, x: number, y: number, z: number, w: number, h: number, d: number, color: number) {
    const mesh = new THREE.Mesh(this.cube, this.material(color)); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); group.add(mesh); return mesh;
  }
  private round(group: THREE.Group, x: number, y: number, z: number, radius: number, height: number, color: number) {
    const mesh = new THREE.Mesh(this.cylinder, this.material(color)); mesh.position.set(x, y, z); mesh.scale.set(radius, height, radius); group.add(mesh); return mesh;
  }

  private buildRoad() {
    for (const side of [-1, 1]) {
      this.box(this.road, side * 5.6, -0.24, -40, 0.12, 0.12, 112, 0xd2ae69);
    }
  }

  private buildCarton() {
    for (let i = 0; i < 5; i++) this.box(this.carton, (i - 2) * 0.54, 0.09, CARTON_Z, 0.52, 0.12, CARTON_HALF_DEPTH * 2, 0xb68750);
    for (const side of [-1, 1]) this.box(this.carton, side * (CARTON_HALF_WIDTH - 0.065), 0.38, CARTON_Z, 0.13, 0.58, CARTON_HALF_DEPTH * 2, 0xdba563);
    for (const side of [-1, 1]) this.box(this.carton, 0, 0.38, CARTON_Z + side * (CARTON_HALF_DEPTH - 0.065), CARTON_HALF_WIDTH * 2, 0.58, 0.13, 0xdba563);
    for (const child of this.carton.children) child.userData.rest = child.position.clone();
  }

  private buildPan() {
    this.round(this.pan, 0, -0.36, 0, 5.9, 0.55, 0x151c24);
    this.round(this.pan, 0, -0.065, 0, 5.53, 0.035, 0x292c31);
    const rim = new THREE.Mesh(this.keep(new THREE.TorusGeometry(5.65, 0.24, 10, 64)), this.material(0x4b5155));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.26; this.pan.add(rim);
    this.box(this.pan, 8.1, -0.05, 0, 5.2, 0.5, 1.05, 0x232b34);
    this.box(this.pan, 10.1, -0.05, 0, 0.4, 0.53, 1.13, 0xbe8a47);
    for (const z of [-0.27, 0.27]) {
      const rivet = new THREE.Mesh(this.sphere, this.material(0xc0a981)); rivet.scale.set(0.1, 0.055, 0.1); rivet.position.set(5.2, 0.22, z); this.pan.add(rivet);
    }
    const burner = new THREE.Mesh(this.keep(new THREE.TorusGeometry(4.8, 0.09, 8, 64)), this.keep(new THREE.MeshBasicMaterial({ color: 0xff7b28 })));
    burner.rotation.x = Math.PI / 2; burner.position.y = -0.68; this.pan.add(burner);
    this.pan.visible = false;
  }

  private textTexture(label: string, small: string, color: string): THREE.CanvasTexture {
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(2, 2, 636, 252, 28); ctx.fill();
    ctx.fillStyle = "#102936"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    let size = label.length > 10 ? 70 : label.length > 6 ? 96 : 138;
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    while (ctx.measureText(label).width > 590 && size > 35) ctx.font = `900 ${--size}px system-ui, sans-serif`;
    ctx.fillText(label, 320, 115);
    ctx.font = "700 23px system-ui, sans-serif"; ctx.fillText(small.toUpperCase(), 320, 215);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
  }

  private makeRow(row: FryRow): RowVisual {
    const group = new THREE.Group(), materials: THREE.MeshBasicMaterial[] = [], resources: Resource[] = [], gates: THREE.Group[] = [];
    const ui = fryCopy[this.lang];
    const label = (text: string, small: string, x: number, color: string, width = 4.55) => {
      const texture = this.textTexture(text, small, color); const material = new THREE.MeshBasicMaterial({ map: texture });
      const geometry = new THREE.PlaneGeometry(width, width * 0.4);
      resources.push(texture, material, geometry);
      const plane = new THREE.Mesh(geometry, material); plane.position.set(x, 2.75, 0.12); group.add(plane);
    };
    if (row.kind === "gate" || row.kind === "exit") {
      const triple = row.kind === "gate" && !!row.mystery;
      const choices: (0 | 1 | "mystery")[] = triple ? [0, "mystery", 1] : [0, 1];
      for (const [side, choice] of choices.entries()) {
        const firstChild = group.children.length;
        const gap = forkGap(this.simulation.seed, row.at), center = gap ? (5.5 + gap / 2) / 2 : 2.65;
        const width = triple ? 11 / 3 - 0.16 : gap ? 5.5 - gap / 2 - 0.2 : 4.9;
        const x = triple ? (side - 1) * 11 / 3 : side === 0 ? -center : center;
        const effect = row.kind === "gate" && choice === "mystery" ? row.mystery?.revealed : undefined;
        const operation = row.kind === "gate" && choice !== "mystery" ? row.operations[choice] : effect?.kind === "operation" ? effect.operation : null;
        const tone = operation ? operationTone(operation) : "green", big = operation && isLargeMultiplier(operation);
        const inactive = row.kind === "gate" && (row.cancelled || row.recipe && row.reference === undefined);
        const color = row.kind === "exit" ? side === 0 ? PALETTE.yolk : PALETTE.mint : inactive ? 0x94a6ae : choice === "mystery" ? PALETTE.mystery : tone === "gold" ? PALETTE.jackpot : tone === "green" ? PALETTE.mint : PALETTE.coral;
        const css = `#${color.toString(16).padStart(6, "0")}`;
        const glass = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });
        resources.push(glass); materials.push(glass);
        const panel = new THREE.Mesh(this.cube, glass); panel.position.set(x, 1.35, 0); panel.scale.set(width, 2.7, 0.1); group.add(panel);
        for (const post of [-width / 2, width / 2]) this.box(group, x + post, 1.8, 0, 0.14, 3.6, 0.2, color);
        this.box(group, x, 3.55, 0, width + 0.2, 0.12, 0.2, color);
        this.box(group, x, 0.035, 0, width, 0.07, 0.85, color);
        if (row.kind === "gate" && choice === "mystery") {
          const caption = effect?.kind === "shield" ? ui.shield : effect?.kind === "cancel" ? ui.cancelPower : effect?.kind === "brake" ? ui.brakePower : effect ? ui.mysteryResult : ui.mystery;
          label(row.cancelled ? "—" : operation ? operationLabel(operation, this.lang) : effect?.kind === "shield" ? "▣" : effect?.kind === "cancel" ? "⊘" : effect?.kind === "brake" ? "Ⅱ" : "?", row.cancelled ? ui.cancelled : caption, x, css, width - 0.35);
        } else if (row.kind === "gate") label(row.cancelled ? "—" : inactive ? "…" : operationLabel(operation!, this.lang), row.cancelled ? ui.cancelled : inactive ? "" : big ? ui.jackpot : ui.operation[operation!.kind], x, css, width - 0.35);
        else label(side === 0 ? ui.pan : ui.onward, side === 0 ? "✓" : "→", x, css, width - 0.35);
        const gate = new THREE.Group();
        gate.userData.travel = triple ? 0 : center * 2;
        gate.userData.choice = choice;
        for (const child of group.children.slice(firstChild)) gate.add(child);
        group.add(gate); gates.push(gate);
      }
    } else if (row.kind === "pickup") {
      for (let i = 0; i < 7; i++) {
        const egg = new THREE.Mesh(this.eggGeometry, this.material(PALETTE.cream));
        egg.scale.setScalar(EGG_SCALE * 1.1); egg.position.set(row.x + (i % 3 - 1) * 0.5, 0.35, Math.floor(i / 3) * 0.6 - 0.6); group.add(egg);
      }
      label(row.adaptive && row.reference === undefined ? "…" : `+${compactCount(row.count, this.lang)}`, row.multiplier ? `${ui.collection} ×${row.multiplier}` : "", row.x, "#70f3c0", 1.85);
    } else if (row.kind === "power") {
      const orb = new THREE.Mesh(this.sphere, this.material(row.power === "cancel" ? 0x97ceff : 0xb8a2ff));
      orb.position.set(row.x, 0.7, 0); orb.scale.setScalar(0.55); group.add(orb);
      const ring = new THREE.Mesh(this.cylinder, this.material(0xe0e7ff));
      ring.position.set(row.x, 0.25, 0); ring.scale.set(0.8, 0.08, 0.8); group.add(ring);
      label(row.power === "cancel" ? "⊘" : "Ⅱ", row.power === "cancel" ? ui.cancelPower : ui.brakePower, row.x, row.power === "cancel" ? "#97ceff" : "#b8a2ff", 2.15);
    } else if (row.kind === "modifier") {
      label("⇄", ui.invertSoon, 0, "#d1afff", 3.2);
    } else if (row.kind === "shield") {
      this.box(group, row.x, 0.2, 0, 1.65, 0.28, 1.35, 0xd7a866);
      for (const x of [-0.45, 0.45]) for (const z of [-0.35, 0.35]) {
        const egg = new THREE.Mesh(this.eggGeometry, this.material(PALETTE.cream)); egg.scale.setScalar(EGG_SCALE); egg.position.set(row.x + x, 0.58, z); group.add(egg);
      }
      label("▣", ui.shield, row.x, "#ffcf7d", 2);
    } else if (row.kind === "hazard") {
      const footprint = hazardFootprint(row, 0);
      const tool = new THREE.Group(); group.add(tool);
      tool.userData.baseWidth = footprint.halfWidth;
      if (row.hazard === "gap") {
        this.box(tool, 0, -3.2, 0, footprint.halfWidth * 2, 0.06, 6.4, 0x090f17);
        for (const side of [-1, 1]) this.box(tool, side * footprint.halfWidth, 0.09, 0, 0.12, 0.1, 6.55, PALETTE.coral);
        for (const z of [-3.2, 3.2]) this.box(tool, 0, 0.09, z, footprint.halfWidth * 2, 0.1, 0.1, PALETTE.coral);
      } else {
        const shadow = new THREE.Mesh(this.cube, new THREE.MeshBasicMaterial({ color: PALETTE.coral, transparent: true, opacity: 0.24 }));
        shadow.scale.set(footprint.halfWidth * 2, 0.04, 6.4); shadow.position.y = 0.06; tool.add(shadow); resources.push(shadow.material);
        const moving = new THREE.Group(); moving.name = "moving"; tool.add(moving);
        if (row.hazard === "spatula") {
          this.box(moving, 0, 0, 0, 2.9, 0.16, 6.4, 0xd4dbd8);
          for (const x of [-0.7, 0, 0.7]) this.box(moving, x, 0.09, 0, 0.17, 0.025, 3.9, 0x3b5058);
          this.box(moving, 0, 0.25, -6.6, 0.45, 0.42, 7, 0xb1814b);
        } else {
          this.round(moving, 0, 3.8, 0, 0.24, 2.3, 0xc79752);
          const torusGeometry = new THREE.TorusGeometry(1, 0.055, 6, 24); resources.push(torusGeometry);
          for (let i = 0; i < 5; i++) {
            const loop = new THREE.Mesh(torusGeometry, this.material(0xd6e3df)); loop.scale.set(1.28, 1.6, 1); loop.rotation.y = i * Math.PI / 5; loop.position.y = 1.55; moving.add(loop);
          }
        }
      }
      return { row, group, materials, resources, tool };
    }
    return { row, group, materials, resources, gates };
  }

  private resize = () => {
    if (this.disposed) return;
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = width / height;
    this.camera.fov = width < height ? 58 : 47;
    this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false);
    this.runningEye.set(0, width < height ? 13.5 : 13, width < height ? 14.5 : 18);
    this.runningTarget.set(0, 0, width < height ? -11 : -9);
    this.dirty = true;
  };

  private clearRows() {
    for (const visual of this.rows.values()) { this.scene.remove(visual.group); for (const resource of visual.resources) resource.dispose(); }
    this.rows.clear();
  }

  reset(seed: number) {
    if (this.disposed) return;
    this.simulation.dispose(); this.clearRows(); this.simulation = new FrySimulation(seed);
    this.steering.reset(); this.keys.clear(); this.reported = false; this.previousNotice = 0; this.renderPopulation = 10;
    this.cartonWasActive = false; this.cartonBreakAt = -100;
    this.flash = this.accumulator = 0; this.audio.stopFry(); this.audio.resume(); this.dirty = true;
    this.simulation.start(); this.notify();
  }
  start() { this.audio.resume(); this.simulation.start(); this.dirty = true; this.notify(); }
  pause = () => {
    if (this.disposed) return;
    this.simulation.pause(); this.steering.release(); this.keys.clear(); this.accumulator = 0;
    this.audio.pause(); this.dirty = true; this.notify();
  };
  resume() { this.audio.resume(); this.simulation.resume(); this.accumulator = 0; this.dirty = true; this.notify(); }
  skip() { this.simulation.skipFrying(); this.audio.stopFry(); this.dirty = true; this.notify(); }
  key(code: string, down: boolean) { if (down) this.keys.add(code); else this.keys.delete(code); }
  selectSide(side: -1 | 1) { this.steering.target = side * 2.65 * (this.simulation.inverted ? -1 : 1); }
  selectCenter() { if (this.simulation.snapshot().mysteryAhead) this.steering.reanchor(0); }
  cancelGate() { this.simulation.cancelNextGate(); this.dirty = true; this.notify(); }
  brake() { this.simulation.useBrake(); this.dirty = true; this.notify(); }
  private visibility = () => { if (document.hidden) this.pause(); };
  private contextLost = (event: Event) => { event.preventDefault(); this.pause(); this.callbacks.failure(); };
  private notify() { this.callbacks.update(this.simulation.snapshot()); }

  private drawRoad() {
    const sim = this.simulation, from = sim.distance - 18, to = sim.distance + 96;
    const cuts = new Set([from, to]);
    for (let at = Math.ceil(from / 1.8) * 1.8; at < to; at += 1.8) cuts.add(at);
    const holes = sim.rows.flatMap(row => row.kind === "hazard" && row.hazard === "gap" && row.at > from - 4 && row.at < to + 4
      ? [{ at: row.at, ...hazardFootprint(row, row.at - sim.distance, sim.motionTime) }] : []);
    for (const hole of holes) for (const at of [hole.at - hole.halfDepth, hole.at + hole.halfDepth]) if (at > from && at < to) cuts.add(at);
    const bounds = [...cuts].sort((a, b) => a - b), colors = [new THREE.Color(PALETTE.road), new THREE.Color(0x465c65)];
    let count = 0;
    for (let i = 1; i < bounds.length; i++) {
      const start = bounds[i - 1], end = bounds[i], mid = (start + end) / 2;
      let intervals = roadIntervals(sim.seed, mid);
      for (const hole of holes) if (Math.abs(mid - hole.at) < hole.halfDepth) intervals = subtractInterval(intervals, hole.x - hole.halfWidth, hole.x + hole.halfWidth);
      for (const [left, right] of intervals) {
        if (right - left < 0.001 || count >= 512) continue;
        this.matrix.position.set((left + right) / 2, -0.35, sim.distance - mid);
        this.matrix.rotation.set(0, 0, 0); this.matrix.scale.set(right - left, 0.7, end - start); this.matrix.updateMatrix();
        this.slats.setMatrixAt(count, this.matrix.matrix); this.slats.setColorAt(count++, colors[Math.abs(Math.floor(mid / 1.8)) % 2]);
      }
    }
    this.slats.count = count; this.slats.instanceMatrix.needsUpdate = true;
    if (this.slats.instanceColor) this.slats.instanceColor.needsUpdate = true;
  }

  private draw(elapsed = 0) {
    const sim = this.simulation, frying = !!sim.result?.success;
    this.road.visible = this.surroundings.visible = !frying;
    this.pan.visible = frying;
    const panScale = sim.physics.panRadius / 5.7;
    this.pan.scale.set(panScale, 1, panScale);
    const cartonTime = sim.seconds + (sim.phase === "falling" ? sim.fryTime : 0);
    if (this.cartonWasActive && !sim.shield) { this.cartonBreakAt = cartonTime; this.cartonBreakX = sim.x; }
    this.cartonWasActive = sim.shield;
    const brokenFor = cartonTime - this.cartonBreakAt;
    this.carton.visible = !frying && (sim.shield || brokenFor < 0.65);
    this.carton.position.set(sim.shield ? sim.x : this.cartonBreakX, 0, sim.shield ? 0 : brokenFor * sim.speed);
    this.carton.children.forEach((child, i) => {
      child.position.copy(child.userData.rest); child.rotation.set(0, 0, 0);
      if (!sim.shield && brokenFor < 0.65) {
        child.position.x += Math.sin(i * 3.1) * brokenFor * 2.5;
        child.position.y += brokenFor * 1.4 - brokenFor * brokenFor * 7;
        child.rotation.z = (i % 2 ? 1 : -1) * brokenFor * 2;
      }
    });
    const transition = frying ? Math.min(1, sim.fryTime / 1.2) : 0;
    const panFraming = (this.camera.aspect < 1 ? 1.23 : 1.02) * panScale;
    this.eye.copy(this.runningEye).lerp(new THREE.Vector3(7.5, 15, 13).multiplyScalar(panFraming), transition);
    this.target.copy(this.runningTarget).lerp(new THREE.Vector3(0.8, 0, 0), transition);
    if (!this.reducedMotion && this.flash > 0) this.eye.x += Math.sin(sim.seconds * 71) * this.flash * 0.12;
    this.camera.position.copy(this.eye); this.camera.lookAt(this.target);
    this.drawRoad();
    this.scenery.update(sim.distance, sim.motionTime, sim.speed, this.reducedMotion);
    (this.scene.fog as THREE.Fog).color.copy(this.scenery.background);
    const wanted = new Set(sim.rows.filter(row => row.at - sim.distance < 94 && row.at - sim.distance > -20 && !sim.collected.has(row.id)).map(row => row.id));
    for (const [id, visual] of this.rows) if (!wanted.has(id)) {
      this.scene.remove(visual.group); for (const resource of visual.resources) resource.dispose(); this.rows.delete(id);
    }
    const nearest = sim.rows.find(row => (row.kind === "gate" || row.kind === "exit") && row.at > sim.distance);
    for (const row of sim.rows) if (wanted.has(row.id)) {
      const signature = row.kind === "gate" ? `${row.reference}:${row.cancelled}:${row.mystery?.revealed ? row.mystery.revealed.kind === "operation" ? operationLabel(row.mystery.revealed.operation, this.lang) : row.mystery.revealed.kind : "?"}` : row.kind === "pickup" ? `${row.reference}:${row.count}` : "";
      const existing = this.rows.get(row.id);
      if (existing && existing.signature !== signature) {
        this.scene.remove(existing.group); for (const resource of existing.resources) resource.dispose(); this.rows.delete(row.id);
      }
      if (!this.rows.has(row.id)) { const visual = this.makeRow(row); visual.signature = signature; this.rows.set(row.id, visual); this.scene.add(visual.group); }
      const visual = this.rows.get(row.id)!, ahead = row.at - sim.distance;
      visual.group.visible = !frying; visual.group.position.z = -ahead;
      if (visual.tool && row.kind === "hazard") {
        const footprint = hazardFootprint(row, ahead, sim.motionTime); visual.tool.position.x = footprint.x;
        if (row.hazard === "gap") visual.tool.scale.x = footprint.halfWidth / visual.tool.userData.baseWidth;
        const moving = visual.tool.getObjectByName("moving");
        if (moving && row.hazard === "spatula") {
          const lift = Math.min(1, Math.max(0, ahead - 8, -ahead - 18) / 9);
          moving.position.y = 0.55 + lift * 4.4; moving.rotation.x = -lift * 0.25;
        } else if (moving) moving.rotation.y = sim.motionTime * 3 + row.variant;
      }
      const swap = row.kind === "gate" ? gateSwapProgress(row, ahead, sim.speed, sim.seconds) : 0;
      visual.gates?.forEach((gate, side) => {
        gate.position.x = (side === 0 ? 1 : -1) * gate.userData.travel * swap;
        gate.position.z = (side === 0 ? 0.18 : -0.18) * Math.sin(swap * Math.PI);
      });
      const chosen = row.kind === "gate" ? gateChoice(row, sim.x, sim.selectedSide) : sim.selectedSide;
      visual.materials.forEach((material, side) => {
        const cell = row.kind === "gate" && row.mystery ? visual.gates?.[side].userData.choice : swap > 0.5 ? 1 - side : side;
        material.opacity = row === nearest && chosen === cell ? 0.34 : 0.1;
      });
    }
    const visibleSize = visibleFlockSize(sim.eggs);
    const physicalCount = sim.physics.flock.length;
    const desired = physicalCount + (sim.shield ? 0 : Math.max(0, visibleSize - FLOCK_LIMIT) * physicalCount / FLOCK_LIMIT);
    this.renderPopulation = desired < this.renderPopulation ? desired : this.renderPopulation + (desired - this.renderPopulation) * (1 - Math.exp(-elapsed * 3));
    const population = frying || !physicalCount ? 0 : Math.max(physicalCount, Math.floor(this.renderPopulation));
    let visible = 0;
    for (let i = 0; i < population; i++) {
      const body = sim.physics.flock[i]?.body, point = body ? null : tailPoint(FLOCK_LIMIT + i - physicalCount);
      const p = body ? body.translation() : { x: sim.trail.at(point!.z + 3.2) + point!.x, y: 0.31 + Math.abs(Math.sin(sim.seconds * 6 + i)) * 0.05, z: point!.z };
      if (!body) {
        if (!roadIntervals(sim.seed, sim.distance - p.z).some(([a, b]) => p.x >= a + 0.06 && p.x <= b - 0.06)) continue;
        if (sim.rows.some(row => {
          if (row.kind !== "hazard" || row.hazard !== "gap") return false;
          const h = hazardFootprint(row, row.at - sim.distance, sim.motionTime);
          return Math.abs(sim.distance - p.z - row.at) < h.halfDepth && Math.abs(p.x - h.x) < h.halfWidth;
        })) continue;
      }
      const q = body?.rotation() ?? { x: 0, y: 0, z: 0, w: 1 };
      this.matrix.position.set(p.x, p.y, p.z); this.matrix.quaternion.set(q.x, q.y, q.z, q.w); this.matrix.scale.setScalar(EGG_SCALE); this.matrix.updateMatrix(); this.flock.setMatrixAt(visible, this.matrix.matrix);
      this.matrix.position.set(p.x, sim.shield ? 0.155 : 0.024, p.z); this.matrix.rotation.set(-Math.PI / 2, 0, 0); this.matrix.scale.setScalar(1); this.matrix.updateMatrix(); this.shadows.setMatrixAt(visible++, this.matrix.matrix);
    }
    this.flock.count = this.shadows.count = visible;
    this.flock.instanceMatrix.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;
    this.fragments.count = sim.physics.fragments.length;
    for (let i = 0; i < this.fragments.count; i++) {
      const body = sim.physics.fragments[i].body, p = body.translation(), q = body.rotation();
      this.matrix.position.set(p.x, p.y, p.z); this.matrix.quaternion.set(q.x, q.y, q.z, q.w); this.matrix.scale.setScalar(EGG_SCALE); this.matrix.updateMatrix(); this.fragments.setMatrixAt(i, this.matrix.matrix);
    }
    this.fragments.instanceMatrix.needsUpdate = true;
    this.whites.count = this.yolks.count = sim.physics.fried.length;
    for (let i = 0; i < sim.physics.fried.length; i++) {
      const mark = sim.physics.fried[i];
      this.matrix.position.set(mark.x, 0.06 + i * 0.0008, mark.z); this.matrix.rotation.set(0, mark.angle, 0);
      this.matrix.scale.set(mark.size * 1.2, 0.045, mark.size); this.matrix.updateMatrix(); this.whites.setMatrixAt(i, this.matrix.matrix);
      this.matrix.position.y = 0.17 + i * 0.0008; this.matrix.scale.set(mark.size * 0.43, 0.16, mark.size * 0.43); this.matrix.updateMatrix(); this.yolks.setMatrixAt(i, this.matrix.matrix);
    }
    this.whites.instanceMatrix.needsUpdate = this.yolks.instanceMatrix.needsUpdate = true;
    let shellCount = 0;
    for (let i = sim.physics.fried.length - 1; i >= 0 && shellCount < 62; i--) {
      const mark = sim.physics.fried[i], age = sim.physics.time - mark.born;
      if (age > 0.85) break;
      for (const side of [-1, 1]) {
        this.matrix.position.set(mark.x + Math.cos(mark.angle) * side * age * 2, 0.3 + age * 3.5 - 6 * age * age, mark.z + Math.sin(mark.angle) * side * age * 2);
        this.matrix.rotation.set(age * side * 8, mark.angle, side * age * 4);
        this.matrix.scale.setScalar(0.17 * Math.max(0, 1 - age / 0.85)); this.matrix.updateMatrix(); this.shells.setMatrixAt(shellCount++, this.matrix.matrix);
      }
    }
    this.shells.count = shellCount; this.shells.instanceMatrix.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  private tick = (time: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.tick);
    const elapsed = this.previousTime ? Math.min(0.12, (time - this.previousTime) / 1000) : 0;
    this.previousTime = time;
    const active = !["ready", "paused", "result"].includes(this.simulation.phase);
    if (active) {
      const previousPhase = this.simulation.phase;
      this.accumulator += elapsed;
      while (this.accumulator >= STEP) {
        const left = this.keys.has("ArrowLeft") || this.keys.has("KeyA"), right = this.keys.has("ArrowRight") || this.keys.has("KeyD");
        this.steering.setInverted(this.simulation.inverted);
        this.steering.keyboard(Number(right) - Number(left), STEP);
        const boxed = this.simulation.shield;
        this.simulation.step(this.steering.target); this.accumulator -= STEP;
        // Release a target previously stopped by the box's rail. A stationary
        // finger must not fling the unpacked clutch off the road on destruction.
        if (boxed && !this.simulation.shield && this.simulation.cartonSteeringLimited) this.steering.reanchor(this.simulation.x);
      }
      if (this.simulation.notice && this.simulation.notice.id !== this.previousNotice) {
        this.previousNotice = this.simulation.notice.id; this.audio.notice(this.simulation.notice);
        this.flash = this.simulation.notice.kind === "jackpot" ? 0.8 : this.simulation.notice.kind === "loss" ? 0.45 : 0;
      }
      this.flash = Math.max(0, this.flash - elapsed * 2);
      if (this.simulation.phase === "frying" && this.simulation.result?.success) {
        this.audio.fry(this.simulation.fryTime / 4 * (0.25 + 0.75 * panFill(this.simulation.result.eggs)));
      }
      if (this.simulation.phase === "result") this.audio.stopFry();
      if (this.simulation.result && !this.reported) { this.reported = true; this.callbacks.complete(this.simulation.result); }
      if (time - this.hudTime > 75 || previousPhase !== this.simulation.phase) { this.hudTime = time; this.notify(); }
      if (elapsed > 0.034) this.slowFrames++; else this.slowFrames = Math.max(0, this.slowFrames - 1);
      if (this.slowFrames > 100 && this.renderer.getPixelRatio() > 0.9) { this.renderer.setPixelRatio(Math.max(0.9, this.renderer.getPixelRatio() - 0.25)); this.resize(); this.slowFrames = 0; }
    }
    if (active || this.dirty) { this.draw(active && this.simulation.phase !== "countdown" ? elapsed : 0); this.dirty = false; }
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true; cancelAnimationFrame(this.frame); this.resizeObserver.disconnect();
    window.removeEventListener("blur", this.pause); document.removeEventListener("visibilitychange", this.visibility);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.contextLost);
    this.clearRows(); this.simulation.dispose(); this.audio.dispose(); this.scenery.dispose();
    for (const resource of this.resources) resource.dispose();
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
