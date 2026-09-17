import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

type FullscreenDocument = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> | void };
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
const currentElement = () => document.fullscreenElement ?? (document as FullscreenDocument).webkitFullscreenElement;
const leaveFullscreen = async () => {
  if (document.exitFullscreen) await document.exitFullscreen();
  else await (document as FullscreenDocument).webkitExitFullscreen?.();
};

export function useRoadFullscreen(root: RefObject<HTMLDivElement | null>, pause: () => void) {
  const [active, setActive] = useState(false), [standalone, setStandalone] = useState(false);
  const [notice, setNotice] = useState<"install" | "unavailable" | null>(null);
  const [pending, setPending] = useState(false);
  const pauseRef = useRef(pause); pauseRef.current = pause;
  const mounted = useRef(false), inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const element = root.current;
    let wasActive = currentElement() === element;
    const display = matchMedia("(display-mode: standalone)");
    const update = () => {
      const next = currentElement() === element;
      if (wasActive && !next) pauseRef.current();
      wasActive = next; setActive(next);
      setStandalone(display.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    };
    update();
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    display.addEventListener("change", update);
    return () => {
      mounted.current = false;
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
      display.removeEventListener("change", update);
      if (currentElement() === element) void leaveFullscreen().catch(() => {});
    };
  }, [root]);

  const toggle = async () => {
    if (inFlight.current || standalone || !root.current) return;
    const element = root.current as FullscreenElement;
    const showFallback = () => {
      pauseRef.current();
      const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      setNotice(appleMobile ? "install" : "unavailable");
    };
    setNotice(null);
    inFlight.current = true; setPending(true);
    try {
      if (currentElement() === element) await leaveFullscreen();
      else if (element.requestFullscreen && document.fullscreenEnabled !== false) await element.requestFullscreen({ navigationUI: "hide" });
      else if (element.webkitRequestFullscreen) await element.webkitRequestFullscreen();
      else { showFallback(); return; }
      // A pending permission prompt can resolve after the game was closed.
      if (!mounted.current && currentElement() === element) await leaveFullscreen();
      else if (mounted.current) setActive(currentElement() === element);
    } catch { if (mounted.current) showFallback(); }
    finally { inFlight.current = false; if (mounted.current) setPending(false); }
  };
  return { active, standalone, pending, notice, toggle };
}
