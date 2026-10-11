import * as THREE from "three";
import type { RoadChunk, RoadTrack } from "./track.ts";
import { FINISH_MARGIN, GATE_SPACING } from "./rules.ts";
import { roadFinish } from "./finish.ts";

type RenderChunk = { group: THREE.Group; dispose: () => void };
/** Retained chunks keep their GPU buffers, including across floating-origin shifts. */
export class RoadRenderer {
  readonly group = new THREE.Group();
  readonly chunks = new Map<RoadChunk, RenderChunk>();
  private readonly top = new THREE.MeshStandardMaterial({ color: 0x99634b, roughness: .92, metalness: .05, side: THREE.DoubleSide });
  private readonly shell = new THREE.MeshStandardMaterial({ color: 0x4d3134, roughness: .92, metalness: .05, side: THREE.DoubleSide });
  private readonly edge = new THREE.MeshBasicMaterial({ color: 0xe1b981, side: THREE.DoubleSide });
  private readonly gate = new THREE.MeshBasicMaterial({ color: 0xf5d6a0 });
  private readonly finishMaterial = new THREE.MeshBasicMaterial({ color: 0xffedc4 });
  private readonly gateGeometry = new THREE.BoxGeometry(1, .018, .12);
  private readonly finish = new THREE.Group();
  private readonly saucerMaterial = new THREE.MeshStandardMaterial({ color: 0xf3e8d2, roughness: .7, side: THREE.DoubleSide });
  private readonly yolkMaterial = new THREE.MeshBasicMaterial({ color: 0xffc34e });
  private readonly inkMaterial = new THREE.MeshBasicMaterial({ color: 0x6b4426 });
  private platform: RenderChunk | null = null;
  private track: RoadTrack | null = null;
  constructor() {
    for (const x of [-.47, .47]) {
      const post = new THREE.Mesh(this.gateGeometry, this.finishMaterial);
      post.position.set(x, 2.75, 0); post.scale.set(.045, 5.5 / .018, .4 / .12); this.finish.add(post);
    }
    const bar = new THREE.Mesh(this.gateGeometry, this.finishMaterial);
    bar.position.y = 5.5; bar.scale.set(1.045, .4 / .018, .4 / .12); this.finish.add(bar);
    this.group.add(this.finish);
  }
  sync(track: RoadTrack) {
    for (const [chunk, visual] of this.chunks) if (!track.chunks.includes(chunk)) {
      visual.dispose(); this.group.remove(visual.group); this.chunks.delete(chunk);
    }
    for (const chunk of track.chunks) {
      let visual = this.chunks.get(chunk);
      if (!visual) { visual = this.build(track, chunk); this.chunks.set(chunk, visual); this.group.add(visual.group); }
      visual.group.position.copy(chunk.origin);
    }
    this.finish.visible = !track.endless;
    if (this.track !== track) {
      if (this.platform) { this.group.remove(this.platform.group); this.platform.dispose(); this.platform = null; }
      const finish = roadFinish(track);
      if (finish) {
        const group = new THREE.Group(), resources: THREE.BufferGeometry[] = [];
        const keep = <T extends THREE.BufferGeometry>(geometry: T) => { resources.push(geometry); return geometry; };
        const geometry = keep(new THREE.BufferGeometry());
        geometry.setAttribute("position", new THREE.BufferAttribute(finish.chunk.vertices, 3));
        geometry.setIndex(new THREE.BufferAttribute(finish.chunk.indices, 1)); geometry.computeVertexNormals();
        const plate = new THREE.Mesh(geometry, this.saucerMaterial); plate.receiveShadow = true; group.add(plate);
        const decoration = new THREE.Group();
        decoration.scale.setScalar(.48);
        decoration.position.copy(finish.center).addScaledVector(finish.normal, .03);
        decoration.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(finish.right, finish.tangent, finish.normal));
        // A smiling golden yolk in the dish: flat paint, no obstacle on landing.
        const yolk = new THREE.Mesh(keep(new THREE.CircleGeometry(6, 48)), this.yolkMaterial); decoration.add(yolk);
        const eye = keep(new THREE.CircleGeometry(.34, 12));
        for (const x of [-1.8, 1.8]) { const dot = new THREE.Mesh(eye, this.inkMaterial); dot.position.set(x, 1.25, .01); decoration.add(dot); }
        const smile = new THREE.Mesh(keep(new THREE.RingGeometry(2.3, 2.5, 24, 1, Math.PI, Math.PI)), this.inkMaterial);
        smile.position.z = .01; decoration.add(smile);
        group.add(decoration); this.group.add(group);
        this.platform = { group, dispose: () => resources.forEach(resource => resource.dispose()) };
      }
    }
    if (!track.endless && this.track !== track) {
      const sample = track.samples.find(s => s.distance >= track.length - FINISH_MARGIN)!;
      this.finish.position.copy(sample.position);
      this.finish.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(sample.right, sample.normal, sample.tangent.clone().negate()));
      this.finish.scale.x = sample.width;
    }
    this.track = track;
  }
  private build(track: RoadTrack, chunk: RoadChunk): RenderChunk {
    const group = new THREE.Group(), resources: { dispose: () => void }[] = [];
    const keep = <T extends { dispose: () => void }>(value: T) => { resources.push(value); return value; };
    const top: number[] = [], shell: number[] = [];
    for (let segment = 0; segment < chunk.last - chunk.first; segment++) {
      const offset = segment * 24;
      for (let i = offset; i < offset + 24; i++) (i < offset + 6 ? top : shell).push(chunk.indices[i]);
    }
    shell.push(...chunk.indices.slice(-12));
    const position = new THREE.BufferAttribute(chunk.vertices, 3);
    const topMaterial = chunk.color === undefined ? this.top : keep(this.top.clone());
    if (chunk.color !== undefined) topMaterial.color.setHex(chunk.color);
    for (const [indices, material] of [[top, topMaterial], [shell, this.shell]] as const) {
      const geometry = keep(new THREE.BufferGeometry());
      geometry.setAttribute("position", position); geometry.setIndex(indices); geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; group.add(mesh);
    }
    const edges: number[] = [], edgeIndices: number[] = [];
    for (let i = chunk.first; i <= chunk.last; i++) {
      const sample = track.samples[i];
      for (const side of [-1, 1]) {
        const outer = sample.position.clone().sub(chunk.origin).addScaledVector(sample.right, side * sample.width / 2).addScaledVector(sample.normal, .008);
        const inner = outer.clone().addScaledVector(sample.right, -side * .075);
        edges.push(...outer, ...inner);
      }
      if (i < chunk.last) for (let side = 0; side < 2; side++) {
        const v = (i - chunk.first) * 4 + side * 2;
        edgeIndices.push(v, v + 1, v + 4, v + 1, v + 5, v + 4);
      }
    }
    const geometry = keep(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(edges, 3)); geometry.setIndex(edgeIndices);
    group.add(new THREE.Mesh(geometry, this.edge));
    const first = Math.floor(track.samples[chunk.first].distance / GATE_SPACING) + 1;
    const last = Math.floor(track.samples[chunk.last].distance / GATE_SPACING);
    if (last >= first) {
      const gates = keep(new THREE.InstancedMesh(this.gateGeometry, this.gate, last - first + 1));
      const matrix = new THREE.Matrix4(), basis = new THREE.Matrix4(), rotation = new THREE.Quaternion();
      let index = chunk.first;
      for (let gate = first; gate <= last; gate++) {
        while (index < chunk.last && track.samples[index].distance < gate * GATE_SPACING) index++;
        const sample = track.samples[index];
        rotation.setFromRotationMatrix(basis.makeBasis(sample.right, sample.normal, sample.tangent.clone().negate()));
        matrix.compose(sample.position.clone().sub(chunk.origin).addScaledVector(sample.normal, .02), rotation, new THREE.Vector3(sample.width, 1, 1));
        gates.setMatrixAt(gate - first, matrix);
      }
      gates.instanceMatrix.needsUpdate = true; gates.computeBoundingSphere(); group.add(gates);
    }
    return { group, dispose: () => { for (const resource of resources) resource.dispose(); } };
  }
  dispose() {
    this.platform?.dispose(); this.platform = null;
    for (const chunk of this.chunks.values()) chunk.dispose();
    this.chunks.clear(); this.group.clear();
    for (const resource of [this.top, this.shell, this.edge, this.gate, this.finishMaterial, this.gateGeometry, this.saucerMaterial, this.yolkMaterial, this.inkMaterial]) resource.dispose();
  }
}
