import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";

export type RoadOrientation = "landscape" | "portrait";
export type ViewRotation = -90 | 0 | 90;

/** Rotate the game itself when the browser cannot rotate its viewport. */
export function roadViewport(width: number, height: number, orientation: RoadOrientation | null, fixedRotation?: ViewRotation) {
  const rotation: ViewRotation = fixedRotation ?? (!orientation || (width >= height) === (orientation === "landscape") ? 0 : orientation === "landscape" ? 90 : -90);
  return { width: rotation ? height : width, height: rotation ? width : height, rotation };
}

/** Inverse CSS rotation, shared by touch steering, camera drag and map orbit. */
export function roadViewDelta(x: number, y: number, rotation: ViewRotation) {
  return rotation === 90 ? { x: y, y: -x } : rotation === -90 ? { x: -y, y: x } : { x, y };
}

export function useRoadViewport(root: RefObject<HTMLDivElement | null>, orientation: RoadOrientation | null) {
  const [view, setView] = useState(() => roadViewport(1, 1, null));
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const resize = () => setView(previous => {
      // Opening the software keyboard must not turn a short portrait phone sideways.
      const editing = element.contains(document.activeElement) && document.activeElement?.matches("input, textarea, [contenteditable='true']");
      const next = roadViewport(element.clientWidth, element.clientHeight, orientation, editing ? previous.rotation : undefined);
      return next.width === previous.width && next.height === previous.height && next.rotation === previous.rotation ? previous : next;
    });
    const observer = new ResizeObserver(resize);
    observer.observe(element); resize();
    element.addEventListener("focusout", resize);
    return () => { observer.disconnect(); element.removeEventListener("focusout", resize); };
  }, [root, orientation]);
  return view;
}
