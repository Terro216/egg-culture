/** Decorative motion stops offscreen, in background tabs and when reduced motion is requested. */
export function animateDecoration(target: Element, draw: (seconds: number, deltaSeconds: number) => void) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0, elapsed = 0, previous = 0, visible = true, pageActive = true, disposed = false;
  const allowed = () => !disposed && pageActive && visible && !document.hidden && !reduced.matches;
  const tick = (now: number) => {
    frame = 0;
    if (!allowed()) return;
    const delta = previous ? Math.min((now - previous) / 1000, .1) : 0;
    previous = now;
    elapsed += delta;
    draw(elapsed, delta);
    frame = requestAnimationFrame(tick);
  };
  const update = () => {
    if (!allowed()) { cancelAnimationFrame(frame); frame = 0; previous = 0; }
    else if (!frame) frame = requestAnimationFrame(tick);
  };
  const hide = () => { pageActive = false; update(); };
  const show = () => { pageActive = true; update(); };
  const observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); update(); });
  observer.observe(target);
  document.addEventListener("visibilitychange", update);
  reduced.addEventListener("change", update);
  window.addEventListener("pagehide", hide);
  window.addEventListener("pageshow", show);
  draw(0, 0);
  update();
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    document.removeEventListener("visibilitychange", update);
    reduced.removeEventListener("change", update);
    window.removeEventListener("pagehide", hide);
    window.removeEventListener("pageshow", show);
  };
}
