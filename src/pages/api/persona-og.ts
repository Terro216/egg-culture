import type { APIRoute } from "astro";
import { Resvg } from "@resvg/resvg-js";
import { resolve } from "node:path";
import {
  PERSONAS,
  getPersonaById,
  PERSONA_AXIS_LABELS,
  type PersonaLang,
} from "../../features/EggPersona/personaData.ts";

export const prerender = false;

// og:image результата теста «Какое вы яйцо?»: 1200×630, SVG → PNG (resvg).
// Шрифты читаются с диска (src/shared/assets/fonts попадает в Docker-образ
// через COPY . .), готовые PNG кэшируются в памяти: 16 результатов + 2 обложки.

const W = 1200;
const H = 630;

const FONT_DIR = resolve(process.cwd(), "src/shared/assets/fonts");
const FONT_FILES = [
  resolve(FONT_DIR, "PlayfairDisplay-SemiBold.ttf"),
  resolve(FONT_DIR, "Lora-Regular.ttf"),
  resolve(FONT_DIR, "Lora-Italic.ttf"),
];

const cache = new Map<string, Buffer>();
const font = {
  fontFiles: FONT_FILES,
  loadSystemFonts: false,
  defaultFontFamily: "Lora",
};

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Measure the shipped fonts, including Cyrillic, using the same renderer as the PNG.
function textWidth(text: string, size: number, family = "Lora", style = "") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="100"><text x="0" y="75" font-family="${family}" font-size="${size}" ${style}>${esc(text)}</text></svg>`;
  return new Resvg(svg, { font }).innerBBox()?.width ?? 0;
}

function wrap(text: string, fontSize: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (textWidth(probe, fontSize) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = probe;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function buildSvg(personaId: string | null, lang: PersonaLang): string {
  const persona = personaId ? getPersonaById(personaId) : undefined;
  const labels = PERSONA_AXIS_LABELS[lang];
  const content = persona?.[lang] ?? (lang === "ru" ? {
    name: "Какое вы яйцо?",
    epithet: "Семь вопросов. Восемь стилей.",
    desc: "От аскетичного Blanc до Дворового Дикого. Ответьте не думая — и Компас Яй Ци укажет ваш стиль.",
  } : {
    name: "Which egg are you?",
    epithet: "Seven questions. Eight styles.",
    desc: "From ascetic Blanc to Yard Wild. Answer without thinking — and the Egg Qi Compass will point to your style.",
  });

  // Компас слева
  const cx = 330;
  const cy = 315;
  const R = 175;
  const px = cx + (persona?.x ?? 0) * R;
  const py = cy - (persona?.y ?? 0) * R;

  const palePoints = PERSONAS.filter((p) => p.id !== persona?.id)
    .map(
      (p) =>
        `<circle cx="${cx + p.x * R}" cy="${cy - p.y * R}" r="${persona ? 5 : 8}" fill="${persona ? "rgba(43,43,43,0.2)" : "#80600f"}"/>`,
    )
    .join("");

  // Текст справа
  const tx = 880; // центр текстовой колонки
  const nameSize = Math.min(
    58,
    Math.floor(58 * 520 / Math.max(1, textWidth(content.name, 58, "Playfair Display", 'font-weight="600"'))),
  );
  const epithetSize = Math.min(30, Math.floor(30 * 520 / Math.max(1, textWidth(content.epithet, 30, "Lora", 'font-style="italic"'))));
  let descSize = 25;
  let descLines = wrap(content.desc, descSize, 520);
  while (descLines.length > 4 && descSize > 21) {
    descLines = wrap(content.desc, --descSize, 520);
  }
  const descSvg = descLines
    .map(
      (line, i) =>
        `<text x="${tx}" y="${424 + i * 34}" text-anchor="middle" font-family="Lora" font-size="${descSize}" fill="#2b2b2b">${esc(line)}</text>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#aa8c46" stop-opacity="0.16"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#d4af37" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#d4af37" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="#f0ead6"/>
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>

  <rect x="28" y="28" width="${W - 56}" height="${H - 56}" fill="none" stroke="#d4af37" stroke-width="4"/>
  <rect x="44" y="44" width="${W - 88}" height="${H - 88}" fill="none" stroke="#d4af37" stroke-width="1.5"/>

  <!-- Компас -->
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(43,43,43,0.1)" stroke-width="1.5"/>
  <circle cx="${cx}" cy="${cy}" r="${R / 2}" fill="none" stroke="rgba(43,43,43,0.1)" stroke-width="1.5"/>
  <line x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}" stroke="rgba(43,43,43,0.25)" stroke-width="1.5"/>
  <line x1="${cx}" y1="${cy - R}" x2="${cx}" y2="${cy + R}" stroke="rgba(43,43,43,0.25)" stroke-width="1.5"/>

  <text x="${cx}" y="${cy - R - 18}" text-anchor="middle" font-family="Lora" font-size="17" fill="#655f50">${esc(labels.top.toUpperCase())}</text>
  <text x="${cx}" y="${cy + R + 34}" text-anchor="middle" font-family="Lora" font-size="17" fill="#655f50">${esc(labels.bottom.toUpperCase())}</text>
  <text x="${cx - R - 22}" y="${cy}" text-anchor="middle" font-family="Lora" font-size="17" fill="#655f50" transform="rotate(-90 ${cx - R - 22} ${cy})">${esc(labels.left.toUpperCase())}</text>
  <text x="${cx + R + 22}" y="${cy}" text-anchor="middle" font-family="Lora" font-size="17" fill="#655f50" transform="rotate(90 ${cx + R + 22} ${cy})">${esc(labels.right.toUpperCase())}</text>

  ${palePoints}

  ${persona ? `<circle cx="${px}" cy="${py}" r="42" fill="url(#glow)"/>
  <circle cx="${px}" cy="${py}" r="12" fill="#d4af37" stroke="#80600f" stroke-width="2"/>` : ""}

  <!-- Текст -->
  <text x="${tx}" y="128" text-anchor="middle" font-family="Playfair Display" font-weight="600" font-size="26" fill="#80600f">${"EGG CULTURE".split("").join(" ")}</text>
  ${persona ? `<text x="${tx}" y="178" text-anchor="middle" font-family="Lora" font-style="italic" font-size="28" fill="#6b5a2a">${esc(labels.header)}</text>` : ""}

  <text x="${tx}" y="290" text-anchor="middle" font-family="Playfair Display" font-weight="600" font-size="${nameSize}" fill="#80600f">${esc(content.name)}</text>
  <line x1="${tx - 240}" y1="318" x2="${tx + 240}" y2="318" stroke="rgba(139,105,20,0.5)" stroke-width="2"/>
  <text x="${tx}" y="366" text-anchor="middle" font-family="Lora" font-style="italic" font-size="${epithetSize}" fill="#6b5a2a">${esc(content.epithet)}</text>

  ${descSvg}

  <text x="${tx}" y="${H - 68}" text-anchor="middle" font-family="Lora" font-size="21" fill="#655f50">${lang === "ru" ? "Компас Яй Ци" : "Egg Qi Compass"}</text>
</svg>`;
}

export const GET: APIRoute = ({ url }) => {
  const type = url.searchParams.get("type");
  const langParam = url.searchParams.get("lang");
  const lang: PersonaLang = langParam === "en" ? "en" : "ru";

  if (type !== null && !getPersonaById(type)) {
    return new Response("Unknown persona", { status: 404 });
  }

  const key = `${type ?? "quiz"}:${lang}`;
  let png = cache.get(key);

  if (!png) {
    const svg = buildSvg(type, lang);
    const resvg = new Resvg(svg, { font });
    png = Buffer.from(resvg.render().asPng());
    cache.set(key, png);
  }

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
