import { fryCode } from "./rules.ts";
import type { FryLang } from "./rules.ts";

/** Shared runs always open the public game, even when copied by an adept. */
export function fryShareUrl(lang: FryLang, seed: number, origin: string): URL {
  const url = new URL(`/${lang}/fry/`, origin);
  url.searchParams.set("fry", fryCode(seed));
  return url;
}
