import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { RoadOrientation } from "./viewport.ts";

type FullscreenDocument = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> | void };
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
const currentElement = () => document.fullscreenElement ?? (document as FullscreenDocument).webkitFullscreenElement;
const leaveFullscreen = async () => {
  if (document.exitFullscreen) await document.exitFullscreen();
  else await (document as FullscreenDocument).webkitExitFullscreen?.();
};
const orientationKey = "egg-road-orientation";
type LockableOrientation = ScreenOrientation & { lock?: (orientation: RoadOrientation) => Promise<void> };
const unlockOrientation = () => { try { screen.orientation?.unlock?.(); } catch { /* Optional browser API. */ } };

export function useRoadFullscreen(root: RefObject<HTMLDivElement | null>, pause: () => void) {
  const [active, setActive] = useState(false), [standalone, setStandalone] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [orientation, setOrientation] = useState<RoadOrientation>("landscape");
  const orientationRef = useRef<RoadOrientation>("landscape");
  const [notice, setNotice] = useState<"install" | "unavailable" | null>(null);
  const [pending, setPending] = useState(false);
  const pauseRef = useRef(pause); pauseRef.current = pause;
  const mounted = useRef(false), inFlight = useRef(false);
  const autoAttempted = useRef(false);
  const lockOrientation = async () => {
    if (!mobile || !mounted.current || (!standalone && currentElement() !== root.current)) return;
    try { await (screen.orientation as LockableOrientation | undefined)?.lock?.(orientationRef.current); }
    catch { /* The game viewport supplies the same layout when locking is unavailable. */ }
    if (!mounted.current || (!standalone && currentElement() !== root.current)) unlockOrientation();
  };
  useEffect(() => {
    mounted.current = true;
    try {
      if (localStorage.getItem(orientationKey) === "portrait") orientationRef.current = "portrait";
    } catch { /* Optional storage. */ }
    setOrientation(orientationRef.current);
    const element = root.current;
    let wasActive = currentElement() === element;
    const display = matchMedia("(display-mode: standalone)");
    const touch = matchMedia("(pointer: coarse) and (hover: none)");
    const update = () => {
      const next = currentElement() === element;
      if (wasActive && !next) { unlockOrientation(); pauseRef.current(); }
      wasActive = next; setActive(next);
      setStandalone(display.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
      setMobile(touch.matches);
    };
    update();
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    display.addEventListener("change", update);
    touch.addEventListener("change", update);
    return () => {
      mounted.current = false;
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
      display.removeEventListener("change", update);
      touch.removeEventListener("change", update);
      unlockOrientation();
      if (currentElement() === element) void leaveFullscreen().catch(() => {});
    };
  }, [root]);

  const enter = async (automatic = false) => {
    if (inFlight.current || !root.current) return;
    if (standalone || currentElement() === root.current) { void lockOrientation(); return; }
    const element = root.current as FullscreenElement;
    const showFallback = () => {
      if (!automatic) pauseRef.current();
      const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      setNotice(appleMobile ? "install" : "unavailable");
    };
    setNotice(null);
    inFlight.current = true; setPending(true);
    try {
      if (element.requestFullscreen && document.fullscreenEnabled !== false) await element.requestFullscreen({ navigationUI: "hide" });
      else if (element.webkitRequestFullscreen) await element.webkitRequestFullscreen();
      else { showFallback(); return; }
      // A pending permission prompt can resolve after the game was closed.
      if (!mounted.current && currentElement() === element) await leaveFullscreen();
      else if (mounted.current) { setActive(currentElement() === element); void lockOrientation(); }
    } catch { if (mounted.current) showFallback(); }
    finally { inFlight.current = false; if (mounted.current) setPending(false); }
  };
  const toggle = async () => {
    if (inFlight.current || standalone || !root.current) return;
    // An explicit exit stays an exit: Resume must not immediately force fullscreen again.
    autoAttempted.current = true;
    if (currentElement() === root.current) {
      try { await leaveFullscreen(); } catch { /* Keep the browser's actual state. */ }
    } else await enter();
  };
  const enterForPlay = () => {
    if (!mobile || autoAttempted.current) return;
    autoAttempted.current = true;
    // Call directly in the trusted click; waiting for game loading loses user activation.
    void enter(true);
  };
  const toggleOrientation = () => {
    const next = orientationRef.current === "landscape" ? "portrait" : "landscape";
    orientationRef.current = next; setOrientation(next);
    pauseRef.current();
    try { localStorage.setItem(orientationKey, next); } catch { /* Optional storage. */ }
    void lockOrientation();
  };
  return { active, standalone, mobile, orientation, pending, notice, toggle, enterForPlay, toggleOrientation };
}
