import { useEffect, useState } from "react";
import { usePortal } from "./PortalPresence.tsx";
import { isInitiated } from "./adept.ts";

export function useAdept() {
  const portal = usePortal();
  const [, update] = useState(0);
  useEffect(() => {
    const changed = () => update(n => n + 1);
    window.addEventListener("egg:initiation", changed);
    window.addEventListener("storage", changed);
    return () => { window.removeEventListener("egg:initiation", changed); window.removeEventListener("storage", changed); };
  }, []);
  return isInitiated(portal);
}
