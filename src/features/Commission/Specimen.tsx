import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { hash } from "./cases.ts";
import type { GameCase, Lang, Tool } from "./types.ts";

type Props = { item: GameCase; tool: Tool; examined: boolean; lang: Lang };
export default function Specimen({ item, tool, examined, lang }: Props) {
  const root = useRef<HTMLDivElement>(null), rotation = useRef(0);
  const [failed, setFailed] = useState(false);
  const ru = lang === "ru";
  useEffect(() => {
    const host = root.current; if (!host) return;
    let renderer: THREE.WebGLRenderer | undefined, frame = 0;
    const disposed: { dispose(): void }[] = [];
    const keep = <T extends { dispose(): void }>(asset: T): T => { disposed.push(asset); return asset; };
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let observer: ResizeObserver | undefined;
    let dragging = false, previousX = 0;
    const down = (e: PointerEvent) => { dragging = true; previousX = e.clientX; host.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (dragging) { rotation.current += (e.clientX - previousX) * .015; previousX = e.clientX; } };
    const up = () => { dragging = false; };
    const lost = (e: Event) => { e.preventDefault(); setFailed(true); };
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.setClearColor(0, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      host.prepend(renderer.domElement); renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.domElement.addEventListener("webglcontextlost", lost);
      const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(33, 1, .1, 30);
      camera.position.set(0, .65, tool === "inspect" ? 5.9 : 6.9); camera.lookAt(0, -.05, 0);
      const ambient = new THREE.HemisphereLight(0xfff5e5, 0x4c4334, 2.0); scene.add(ambient);
      const key = new THREE.DirectionalLight(0xfff1da, 4); key.position.set(-3, 5, 4); key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -3; key.shadow.camera.right = 3; key.shadow.camera.top = 3; key.shadow.camera.bottom = -3; key.shadow.bias = -.002; scene.add(key);
      const rim = new THREE.DirectionalLight(0xdde7ec, 2); rim.position.set(3, 2, -3); scene.add(rim);
      const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(20, 20)), keep(new THREE.ShadowMaterial({ opacity: .17 })));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -1.16; floor.receiveShadow = true; scene.add(floor);
      const stage = new THREE.Group(); scene.add(stage);
      const surface = document.createElement("canvas"); surface.width = 512; surface.height = 512;
      const ctx = surface.getContext("2d")!;
      ctx.fillStyle = item.colour === "brown" ? "#c39462" : item.colour === "speckled" ? "#e0cfad" : "#f5eee0"; ctx.fillRect(0, 0, 512, 512);
      let seed = hash(item.id); const random = () => { seed = Math.imul(seed ^ seed >>> 13, 1597334677); return (seed >>> 0) / 4294967296; };
      for (let i = 0; i < (item.colour === "speckled" ? 1800 : 2600); i++) { ctx.globalAlpha = item.colour === "speckled" ? .18 + random() * .3 : .035; ctx.fillStyle = "#715338"; ctx.beginPath(); ctx.ellipse(random() * 512, random() * 512, random() * (item.colour === "speckled" ? 2 : 1) + .2, random() + .2, random() * 3, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = .65; ctx.fillStyle = "#8f563e"; ctx.font = "16px monospace"; ctx.textAlign = "center"; ctx.fillText(item.lot, 128, 250);
      const texture = keep(new THREE.CanvasTexture(surface)); texture.colorSpace = THREE.SRGBColorSpace;
      const eggProfile = Array.from({ length: 65 }, (_, i) => { const angle = i / 64 * Math.PI; return new THREE.Vector2(Math.sin(angle) * (.76 - .12 * Math.cos(angle)), Math.cos(angle) * 1.08); }).reverse();
      const material = keep(new THREE.MeshStandardMaterial({ map: texture, roughness: .63, metalness: 0 }));
      const egg = new THREE.Mesh(keep(new THREE.LatheGeometry(eggProfile, 80)), material); egg.castShadow = true; stage.add(egg);
      if (item.defect === "shell") {
        const points: THREE.Vector3[] = [];
        for (let i = 0; i < 12; i++) { const y = -.5 + i * .09, angle = Math.acos(y / 1.08), x = Math.sin(i * 8) * .055 + .15; const radius = Math.sin(angle) * (.76 - .12 * Math.cos(angle)); points.push(new THREE.Vector3(x, y, Math.sqrt(radius * radius - x * x) + .006)); }
        stage.add(new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints(points)), keep(new THREE.LineBasicMaterial({ color: 0x604c39 }))));
      }
      const brass = keep(new THREE.MeshStandardMaterial({ color: 0x9d793e, roughness: .32, metalness: .7 }));
      if (tool === "scale") {
        const pan = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.03, .86, .11, 72)), brass); pan.position.y = -1.13; pan.receiveShadow = true; stage.add(pan);
        const stem = new THREE.Mesh(keep(new THREE.CylinderGeometry(.11, .14, .25, 32)), brass); stem.position.y = -1.32; stage.add(stem);
        floor.position.y = -1.46; camera.position.y = .9;
      }
      if (tool === "light" && examined) {
        material.transparent = true; material.opacity = .28; material.depthWrite = false; material.emissive.set(0x6c3610); material.emissiveIntensity = .22;
        const yolk = new THREE.Mesh(keep(new THREE.SphereGeometry(.48, 48, 32)), keep(new THREE.MeshStandardMaterial({ color: 0xd8a544, roughness: .8, emissive: 0x774000, emissiveIntensity: .3 })));
        yolk.scale.set(.9, 1.05, .9); yolk.position.y = -.12; stage.add(yolk);
        const air = new THREE.Mesh(keep(new THREE.SphereGeometry(.48, 40, 24)), keep(new THREE.MeshBasicMaterial({ color: 0xffedb2, transparent: true, opacity: .85 })));
        air.scale.set(.9, item.defect === "age" || item.style === "aged" ? .65 : .22, .9); air.position.y = .71; stage.add(air);
        const lamp = new THREE.PointLight(0xffcc66, 3, 5); lamp.position.set(0, -1, .1); scene.add(lamp);
      }
      if (tool === "plate" && examined) {
        egg.visible = false; for (const object of stage.children) if (object instanceof THREE.Line) object.visible = false;
        const dish = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.5, 1.35, .12, 80)), keep(new THREE.MeshStandardMaterial({ color: 0xf6f2e9, roughness: .25, metalness: .05 })));
        dish.position.y = -.55; dish.castShadow = true; dish.receiveShadow = true; stage.add(dish);
        const albumen = new THREE.Mesh(keep(new THREE.SphereGeometry(1, 64, 32)), keep(new THREE.MeshPhysicalMaterial({ color: 0xede5b5, roughness: .16, transparent: true, opacity: .7, clearcoat: 1 })));
        albumen.scale.set(1.12, .055, .85); albumen.position.y = -.44; stage.add(albumen);
        const yolk = new THREE.Mesh(keep(new THREE.SphereGeometry(.57, 64, 40)), keep(new THREE.MeshPhysicalMaterial({ color: item.defect === "profile" ? 0xa96c22 : 0xe8b137, roughness: .2, clearcoat: 1 })));
        yolk.scale.y = item.defect === "profile" ? .3 : item.style === "aged" ? .45 : .67; yolk.position.set(0, -.39, .02); yolk.castShadow = true; stage.add(yolk);
        camera.position.set(0, 3.6, 5.2); camera.lookAt(0, -.4, 0); floor.position.y = -.64;
      }
      let redraw = true;
      const resize = () => { if (!renderer) return; const { width, height } = host.getBoundingClientRect(); renderer.setSize(width, height, false); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix(); redraw = true; };
      observer = new ResizeObserver(resize); observer.observe(host); resize();
      host.addEventListener("pointerdown", down); host.addEventListener("pointermove", move); host.addEventListener("pointerup", up); host.addEventListener("pointercancel", up);
      let last = 0;
      const render = (now: number) => {
        frame = requestAnimationFrame(render);
        if (document.hidden || now - last < 32) return;
        if (!redraw && Math.abs(rotation.current - stage.rotation.y) < .0005) return;
        last = now;
        stage.rotation.y += (rotation.current - stage.rotation.y) * (media.matches ? 1 : .18);
        redraw = false;
        renderer!.render(scene, camera);
      }; frame = requestAnimationFrame(render); setFailed(false);
    } catch { setFailed(true); }
    return () => {
      cancelAnimationFrame(frame); observer?.disconnect();
      host.removeEventListener("pointerdown", down); host.removeEventListener("pointermove", move); host.removeEventListener("pointerup", up); host.removeEventListener("pointercancel", up);
      if (renderer) { renderer.domElement.removeEventListener("webglcontextlost", lost); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); }
      for (const asset of disposed) asset.dispose();
    };
  }, [item.id, item.colour, item.defect, item.mass, item.style, item.lot, tool, examined]);
  return <div className={`commission-specimen ${tool === "light" && examined ? "is-lit" : ""}`}>
    <div ref={root} className="commission-specimen-canvas" tabIndex={0} role="group" aria-label={ru ? "Контрольный образец. Вращайте стрелками или перетаскиванием." : "Control specimen. Rotate with arrow keys or by dragging."} onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); rotation.current += e.key === "ArrowLeft" ? -.3 : .3; } }} />
    {failed && <p className="commission-model-fallback" role="status">{ru ? "Объёмная модель недоступна. Все признаки и измерения доступны в протоколе исследования." : "The 3D model is unavailable. All signs and measurements remain available in the examination record."}</p>}
    <div className="commission-rotate"><button type="button" aria-label={ru ? "Повернуть образец влево" : "Rotate specimen left"} onClick={() => { rotation.current -= .5; }}>←</button><span>{ru ? "КОНТРОЛЬНЫЙ ОБРАЗЕЦ" : "CONTROL SPECIMEN"}</span><button type="button" aria-label={ru ? "Повернуть образец вправо" : "Rotate specimen right"} onClick={() => { rotation.current += .5; }}>→</button></div>
  </div>;
}
