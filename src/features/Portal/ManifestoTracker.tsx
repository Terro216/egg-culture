import { useEffect } from "react";
import { usePortal } from "./PortalPresence.tsx";
import { portalState, refreshPortal } from "./client.ts";
import { announceAchievements } from "./local.ts";
import { createManifestoTracker } from "./manifestoTracking.ts";

export default function ManifestoTracker() {
  const portal = usePortal();
  const owner = portal.account?.registered && !portal.failed ? portal.account.name : null;
  useEffect(() => {
    if (!owner) {
      const refresh = () => { void refreshPortal(); };
      window.addEventListener("focus", refresh);
      return () => window.removeEventListener("focus", refresh);
    }
    const tracker = createManifestoTracker({ owner,
      currentOwner: () => portalState().account?.registered ? portalState().account!.name : null,
      onAccountMismatch: refreshPortal,
      onUnlock: () => { announceAchievements(["manifesto.scholar"], owner.normalize("NFKC").toLowerCase()); void refreshPortal(); },
    });
    const attentive = () => document.visibilityState === "visible" && document.hasFocus();
    const update = () => { void tracker.visit(attentive()); };
    const focus = () => { void refreshPortal().then(update); };
    const pause = () => { void tracker.visit(false); };
    const timer = window.setInterval(() => { if (attentive()) void tracker.visit(true); }, 15000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", focus);
    window.addEventListener("blur", pause);
    window.addEventListener("pagehide", pause);
    window.addEventListener("pageshow", update);
    update();
    return () => {
      clearInterval(timer); document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", focus); window.removeEventListener("blur", pause);
      window.removeEventListener("pagehide", pause); window.removeEventListener("pageshow", update);
      void tracker.dispose();
    };
  }, [owner]);
  return null;
}
