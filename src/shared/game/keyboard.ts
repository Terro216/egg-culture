/** Physical game keys survive a layout change; browser and editing shortcuts do not become game input. */
export function acceptsGameKey(event: Pick<KeyboardEvent, "defaultPrevented" | "ctrlKey" | "metaKey" | "altKey" | "target">) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return false;
  return !(event.target && typeof (event.target as Element).closest === "function" &&
    (event.target as Element).closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
}
