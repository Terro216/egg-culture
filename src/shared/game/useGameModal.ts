import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const focusableSelector = "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex]:not([tabindex='-1'])";

/** Shared focus lifecycle for portaled games, including keyboard-only dismissal. */
export function useGameModal(root: RefObject<HTMLElement | null>, active: boolean, onEscape: () => void) {
  const escape = useRef(onEscape); escape.current = onEscape;
  useEffect(() => {
    const element = root.current;
    if (!active || !element) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const backgrounds = new Map<HTMLElement, boolean>();
    const isolate = () => {
      for (const child of document.body.children) {
        if (!(child instanceof HTMLElement) || child.contains(element) || child.matches('[role="status"][aria-live]') || backgrounds.has(child)) continue;
        backgrounds.set(child, child.inert); child.inert = true;
      }
    };
    isolate();
    const observer = new MutationObserver(isolate); observer.observe(document.body, { childList: true });
    const focusable = () => [...element.querySelectorAll<HTMLElement>(focusableSelector)]
      .filter(item => item.tabIndex >= 0 && item.getClientRects().length > 0 && !item.closest("[inert]"));
    const focusFirst = () => (focusable()[0] ?? element).focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault(); event.stopPropagation(); escape.current(); return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable(), first = elements[0], last = elements.at(-1);
      if (!first) { event.preventDefault(); element.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === element || !element.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element || !element.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    const focusin = (event: FocusEvent) => { if (!element.contains(event.target as Node)) focusFirst(); };
    document.body.style.overflow = "hidden";
    element.focus({ preventScroll: true });
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", focusin);
    return () => {
      observer.disconnect(); document.removeEventListener("keydown", keydown, true); document.removeEventListener("focusin", focusin);
      for (const [child, inert] of backgrounds) child.inert = inert;
      document.body.style.overflow = previousOverflow;
      const returnTo = previousFocus !== document.body && previousFocus?.isConnected ? previousFocus : root.current;
      if (returnTo?.isConnected && !returnTo.closest("[inert]")) returnTo.focus({ preventScroll: true });
    };
  }, [root, active]);
}
