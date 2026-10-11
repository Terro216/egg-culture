import * as THREE from "three";
import { createEggGeometry } from "../EggRoad/geometry.ts";
import { sectorAt, sectorEnd } from "./track.ts";

export const SCENERY_PERIOD = 192;
export function sceneryZ(offset: number, distance: number, parallax: number) {
  return ((offset + distance * parallax + SCENERY_PERIOD) % SCENERY_PERIOD + SCENERY_PERIOD) % SCENERY_PERIOD - 152;
}
export function sceneryTheme(distance: number) {
  const sector = sectorAt(Math.max(0, distance)), index = Math.floor(sector / 3) % 3;
  const t = sector % 3 === 2 ? Math.max(0, Math.min(1, 1 - (sectorEnd(sector) - distance) / 72)) : 0;
  return { index, next: (index + 1) % 3, blend: t * t * (3 - 2 * t) };
}

const THEMES = [
  { sky: 0x233d45, metal: 0x507178, rim: 0xb8d1ca, copper: 0xba7544, cream: 0xffe5b2, tile: 0x597577, dark: 0x182b34, glow: 0xffbb63, glass: 0x236675, stone: 0x344e55 },
  { sky: 0x18304a, metal: 0x527795, rim: 0xb0dfe6, copper: 0x7486a7, cream: 0xe5f1d5, tile: 0x4a738b, dark: 0x142838, glow: 0x75dcff, glass: 0x255a85, stone: 0x30475f },
  { sky: 0x2b263d, metal: 0x625576, rim: 0xd3c2c6, copper: 0xb77555, cream: 0xffdab4, tile: 0x665779, dark: 0x221d32, glow: 0xffa975, glass: 0x754563, stone: 0x463a55 },
] as const;
type Tint = keyof typeof THEMES[0];
type Batch = "solids" | "rounds" | "rings" | "eggs" | "lights" | "steam";
type Part = { batch: Batch; x: number; y: number; z: number; w: number; h: number; d: number; tint: Tint; rx: number; ry: number; rz: number; motion?: "belt" | "fan" | "whisk"; phase: number };
type Prop = { position: THREE.Vector3; userData: { offset: number; parallax: number }; parts: Part[]; steam: boolean };
export const SCENERY_BUDGETS = { solids: 640, rounds: 192, rings: 96, eggs: 128, lights: 192, steam: 64 } as const;

/** Six instanced batches for a whole moving kitchen. No per-frame mesh/texture creation. */
export class FryScenery {
  readonly background = new THREE.Color(THEMES[0].sky);
  readonly props: Prop[] = [];
  readonly meshes: Record<Batch, THREE.InstancedMesh>;
  private readonly resources: { dispose(): void }[] = [];
  private readonly matrix = new THREE.Object3D();
  private readonly colors = {} as Record<Tint, THREE.Color>;
  private readonly palettes = THEMES.map(theme => Object.fromEntries(Object.entries(theme).map(([name, color]) => [name, new THREE.Color(color)])) as Record<Tint, THREE.Color>);
  private disposed = false;

  constructor(group: THREE.Group) {
    for (const name of Object.keys(THEMES[0]) as Tint[]) this.colors[name] = new THREE.Color();
    const cube = this.keep(new THREE.BoxGeometry(1, 1, 1));
    const standard = this.keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.18 }));
    const eggMaterial = this.keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65 }));
    const bright = this.keep(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const pixels = new Uint8Array(32 * 32 * 4);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const at = (y * 32 + x) * 4, radius = Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5);
      pixels[at] = pixels[at + 1] = pixels[at + 2] = 255;
      pixels[at + 3] = Math.round(Math.max(0, 1 - radius) ** 2 * 150);
    }
    const steamTexture = this.keep(new THREE.DataTexture(pixels, 32, 32));
    steamTexture.minFilter = steamTexture.magFilter = THREE.LinearFilter; steamTexture.needsUpdate = true;
    const steamMaterial = this.keep(new THREE.MeshBasicMaterial({ map: steamTexture, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
    const batch = (name: Batch, geometry: THREE.BufferGeometry, material: THREE.Material) => {
      const mesh = this.keep(new THREE.InstancedMesh(geometry, material, SCENERY_BUDGETS[name]));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
      mesh.setColorAt(0, new THREE.Color(0xffffff)); mesh.count = 0; group.add(mesh); return mesh;
    };
    this.meshes = {
      solids: batch("solids", cube, standard),
      rounds: batch("rounds", this.keep(new THREE.CylinderGeometry(1, 1, 1, 16)), standard),
      rings: batch("rings", this.keep(new THREE.TorusGeometry(1, 0.055, 6, 28)), standard),
      eggs: batch("eggs", this.keep(createEggGeometry(10, 8)), eggMaterial),
      lights: batch("lights", cube, bright),
      steam: batch("steam", this.keep(new THREE.PlaneGeometry(1, 1)), steamMaterial),
    };
    for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
      this.props.push({ position: new THREE.Vector3(side * (i % 2 ? 17 : 10.5), -1.5, 0),
        userData: { offset: 164 - i * 32 - (side > 0 ? 15 : 0), parallax: i % 2 ? 0.58 : 1 },
        parts: this.station((i + (side > 0 ? 2 : 0)) % 6), steam: i % 3 === 0 });
    }
    this.update(0, 0, 9.5, false);
  }

  private keep<T extends { dispose(): void }>(resource: T) { this.resources.push(resource); return resource; }

  private station(kind: number): Part[] {
    const parts: Part[] = [];
    const add = (batch: Batch, x: number, y: number, z: number, w: number, h: number, d: number, tint: Tint, rx = 0, ry = 0, rz = 0, motion?: Part["motion"], phase = 0) => parts.push({ batch, x, y, z, w, h, d, tint, rx, ry, rz, motion, phase });
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, tint: Tint) => add("solids", x, y, z, w, h, d, tint);
    const round = (x: number, y: number, z: number, radius: number, height: number, tint: Tint) => add("rounds", x, y, z, radius, height, radius, tint);
    if (kind === 0) {
      round(0, 2, 0, 2.1, 3.7, "metal");
      round(0, 3.87, 0, 2.24, 0.18, "rim"); round(0, 4.05, 0, 1.9, 0.18, "copper"); round(0, 4.36, 0, 0.43, 0.4, "dark");
      for (const side of [-1, 1]) { box(side * 2.43, 2.85, 0, 0.9, 0.2, 1, "copper"); box(side * 2.82, 2.85, 0, 0.18, 0.2, 1.2, "rim"); }
      add("rings", 0, 0.2, 0, 2.05, 2.05, 2.05, "glow", Math.PI / 2);
      add("lights", 0, 1.6, 2.08, 0.75, 0.12, 0.03, "glow");
    } else if (kind === 1) {
      box(0, 2.8, 0, 4.4, 5.5, 3.8, "metal"); box(0, 2.55, 1.96, 3.75, 3.5, 0.2, "dark");
      box(0, 2.55, 2.08, 3.25, 2.9, 0.1, "glass");
      for (let i = 0; i < 4; i++) add("lights", 0, 1.5 + i * 0.68, 2.16, 2.9, 0.09, 0.035, "glow");
      for (let i = -1; i <= 1; i++) round(i * 1.1, 4.82, 2.1, 0.19, 0.32, "copper");
      round(1.25, 6.8, -0.8, 0.5, 2.8, "copper"); round(1.25, 8.25, -0.8, 0.72, 0.16, "rim");
      box(0, 0.2, 0, 4.9, 0.3, 4.4, "dark");
    } else if (kind === 2) {
      box(0, 0.7, 0, 5.8, 0.5, 8.5, "dark");
      for (const side of [-1, 1]) { box(side * 2.8, 1.05, 0, 0.18, 0.38, 8.8, "copper"); box(side * 2, 0, 0, 0.4, 1.3, 7, "metal"); }
      for (let i = 0; i < 9; i++) add("rounds", 0, 1, -3.6 + i * 0.9, 0.24, 5.4, 0.24, "rim", 0, 0, Math.PI / 2);
      for (let i = 0; i < 8; i++) add("eggs", i % 2 ? -1.25 : 1.25, 1.92, 0, 0.64, 0.64, 0.64, "cream", 0, 0, 0, "belt", Math.floor(i / 2) * 1.8);
    } else if (kind === 3) {
      round(0, 0.7, 0, 2.25, 1.4, "metal"); round(0, 1.42, 0, 2.02, 0.1, "dark");
      add("rings", 0, 1.5, 0, 2.2, 2.2, 2.2, "rim", Math.PI / 2);
      box(0, 3.6, -2.45, 1.1, 7.2, 1.1, "copper"); box(0, 6.7, -0.8, 1.4, 0.7, 4.5, "metal");
      round(0, 4.8, 0, 0.2, 3.5, "rim");
      for (let i = 0; i < 4; i++) add("rings", 0, 2.75, 0, 1.15, 1.55, 1.15, "rim", 0, i * Math.PI / 4, 0, "whisk");
      add("lights", 0, 6.72, 1.49, 0.7, 0.16, 0.05, "glow");
    } else if (kind === 4) {
      box(0, 0.25, 0, 5.8, 0.6, 5.8, "copper");
      for (let i = 0; i < 8; i++) { round(0, 0.8 + i * 0.26, 0, 2.5, 0.12, "cream"); add("rings", 0, 0.84 + i * 0.26, 0, 2.28, 2.28, 2.28, "rim", Math.PI / 2); }
      for (let i = -1; i <= 1; i++) add("eggs", i * 1.25, 3.4, 0, 0.75, 0.75, 0.75, "cream");
    } else {
      box(0, 4, 0, 5.2, 7.7, 1.3, "metal"); box(0, 4.5, 0.7, 4.55, 4.55, 0.1, "dark");
      add("rings", 0, 4.5, 0.86, 2.05, 2.05, 2.05, "rim");
      for (let i = 0; i < 4; i++) add("solids", 0, 4.5, 0.85, 3.55, 0.32, 0.13, "copper", 0, 0, i * Math.PI / 4, "fan");
      for (let i = 0; i < 4; i++) box(0, 0.7 + i * 0.4, 0.72, 3.8, 0.11, 0.12, "dark");
      add("lights", -1.8, 7.38, 0.71, 0.28, 0.28, 0.04, "glow");
    }
    return parts;
  }

  private emit(batch: Batch, x: number, y: number, z: number, w: number, h: number, d: number, tint: Tint, rx = 0, ry = 0, rz = 0) {
    const mesh = this.meshes[batch];
    if (mesh.count >= SCENERY_BUDGETS[batch]) throw new Error(`Scenery ${batch} budget exceeded`);
    this.matrix.position.set(x, y, z); this.matrix.scale.set(w, h, d); this.matrix.rotation.set(rx, ry, rz); this.matrix.updateMatrix();
    mesh.setMatrixAt(mesh.count, this.matrix.matrix); mesh.setColorAt(mesh.count++, this.colors[tint]);
  }

  update(distance: number, motionTime: number, speed: number, calm: boolean) {
    if (this.disposed) return;
    const theme = sceneryTheme(distance), time = calm ? 0 : motionTime;
    for (const name of Object.keys(this.colors) as Tint[]) this.colors[name].copy(this.palettes[theme.index][name]).lerp(this.palettes[theme.next][name], theme.blend);
    this.background.copy(this.colors.sky);
    for (const mesh of Object.values(this.meshes)) mesh.count = 0;
    for (const side of [-1, 1]) {
      this.emit("solids", side * 15, -2.5, -55, 17, 1.3, 194, "dark");
      this.emit("solids", side * 6.65, -1.8, -55, 0.18, 0.3, 194, "copper");
      for (let i = 0; i < 24; i++) for (let column = 0; column < 2; column++) {
        this.emit("solids", side * (10.5 + column * 8), -1.76, sceneryZ(i * 8, distance, 1), 7.75, 0.18, 7.78, (i + column) % 2 ? "tile" : "stone");
      }
      // Far columns, luminous service windows and pipes give the horizon a scale.
      for (let i = 0; i < 7; i++) {
        const z = sceneryZ(i * 27 + 14, distance, 0.34);
        this.emit("solids", side * 25, 5.5, z, 0.7, 16, 1.3, "metal");
        this.emit("solids", side * 25, 11.4, z, 1.3, 0.5, 25.5, "copper");
        this.emit("solids", side * 25, 4.5, z, 0.3, 8, 16, "glass");
        for (let j = 0; j < 3; j++) this.emit("lights", side * 24.75, 2.5 + j * 2.3, z, 0.2, 0.14, 15, "glow");
        this.emit("rounds", side * 22.5, -0.3, z, 0.5, 27, 0.5, "copper", Math.PI / 2);
      }
      if (!calm) for (let i = 0; i < 18; i++) {
        this.emit("lights", side * (6.9 + i % 3 * 0.36), -0.75 + i % 2 * 0.18, sceneryZ(i * 10.5 + 6, distance, 1.35), 0.045, 0.045, 0.35 + Math.max(0, speed - 9.5) * 0.075, "glow");
      }
    }
    for (const [index, prop] of this.props.entries()) {
      prop.position.z = sceneryZ(prop.userData.offset, distance, prop.userData.parallax);
      for (const part of prop.parts) {
        const z = part.motion === "belt" ? (part.phase + time * 1.5) % 7.2 - 3.6 : part.z;
        this.emit(part.batch, prop.position.x + part.x, prop.position.y + part.y, prop.position.z + z, part.w, part.h, part.d, part.tint,
          part.rx, part.ry + (part.motion === "whisk" ? time * 1.4 : 0), part.rz + (part.motion === "fan" ? time * 0.7 : 0));
      }
      if (prop.steam) for (let i = 0; i < 8; i++) {
        const phase = (time * 0.19 + i / 8 + index * 0.11) % 1, size = (0.4 + phase * 2.5) * Math.sin(phase * Math.PI);
        this.emit("steam", prop.position.x + Math.sin(phase * 5 + index) * phase * 0.8, 3 + phase * 7, prop.position.z, size, size * 1.25, 1, "rim", -0.5);
      }
    }
    for (const mesh of Object.values(this.meshes)) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of Object.values(this.meshes)) mesh.removeFromParent();
    for (const resource of this.resources) resource.dispose();
  }
}
