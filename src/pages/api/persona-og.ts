import type { APIRoute } from "astro";
import { Resvg } from "@resvg/resvg-js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  PERSONAS,
  getPersonaById,
  PERSONA_AXIS_LABELS,
  type PersonaLang,
} from "@features/EggPersona/personaData";

export const prerender = false;

// og:image результата теста «Какое вы яйцо?»: 1200×630, SVG → PNG (resvg).
// Шрифты читаются с диска (src/shared/assets/fonts попадает в Docker-образ
// через COPY . .), готовые PNG кэшируются в памяти — вариантов всего 16.

const W = 1200;
const H = 630;

const FONT_DIR = resolve(process.cwd(), "src/shared/assets/fonts");
const FONT_FILES = [
  resolve(FONT_DIR, "PlayfairDisplay-SemiBold.ttf"),
  resolve(FONT_DIR, "Lora-Regular.ttf"),
  resolve(FONT_DIR, "Lora-Italic.ttf"),
];

const cache = new Map<string, Buffer>();

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Оценочный перенос строк: canvas.measureText на сервере нет,
// ширину строки оцениваем по количеству символов.
function wrap(text: string, fontSize: number, maxWidth: number): string[] {
  const avgChar = fontSize * 0.52;
  const maxChars = Math.floor(maxWidth / avgChar);
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (probe.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = probe;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function buildSvg(personaId: string, lang: PersonaLang): string {
  const persona = getPersonaById(personaId)!;
  const labels = PERSONA_AXIS_LABELS[lang];
  const content = persona[lang];

  // Компас слева
  const cx = 330;
  const cy = 315;
  const R = 175;
  const px = cx + persona.x * R;
  const py = cy - persona.y * R;

  const palePoints = PERSONAS.filter((p) => p.id !== persona.id)
    .map(
      (p) =>
        `<circle cx="${cx + p.x * R}" cy="${cy - p.y * R}" r="5" fill="rgba(43,43,43,0.15)"/>`,
    )
    .join("");

  // Текст справа
  const tx = 880; // центр текстовой колонки
  const nameSize = Math.min(
    58,
    Math.floor(520 / (content.name.length * 0.62)),
  );
  const descLines = wrap(content.desc, 25, 520);
  const descSvg = descLines
    .slice(0, 5)
    .map(
      (line, i) =>
        `<text x="${tx}" y="${430 + i * 38}" text-anchor="middle" font-family="Lora" font-size="25" fill="#2b2b2b">${esc(line)}</text>`,
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

  <text x="${cx}" y="${cy - R - 18}" text-anchor="middle" font-family="Lora" font-size="17" fill="rgba(43,43,43,0.5)">${esc(labels.top.toUpperCase())}</text>
  <text x="${cx}" y="${cy + R + 34}" text-anchor="middle" font-family="Lora" font-size="17" fill="rgba(43,43,43,0.5)">${esc(labels.bottom.toUpperCase())}</text>
  <text x="${cx - R - 22}" y="${cy}" text-anchor="middle" font-family="Lora" font-size="17" fill="rgba(43,43,43,0.5)" transform="rotate(-90 ${cx - R - 22} ${cy})">${esc(labels.left.toUpperCase())}</text>
  <text x="${cx + R + 22}" y="${cy}" text-anchor="middle" font-family="Lora" font-size="17" fill="rgba(43,43,43,0.5)" transform="rotate(90 ${cx + R + 22} ${cy})">${esc(labels.right.toUpperCase())}</text>

  ${palePoints}

  <circle cx="${px}" cy="${py}" r="42" fill="url(#glow)"/>
  <circle cx="${px}" cy="${py}" r="12" fill="#d4af37" stroke="#8b6914" stroke-width="2"/>

  <!-- Текст -->
  <text x="${tx}" y="128" text-anchor="middle" font-family="Playfair Display" font-weight="600" font-size="26" fill="#b8963a">${"EGG CULTURE".split("").join(" ")}</text>
  <text x="${tx}" y="178" text-anchor="middle" font-family="Lora" font-style="italic" font-size="28" fill="#6b5a2a">${esc(labels.header)}</text>

  <text x="${tx}" y="290" text-anchor="middle" font-family="Playfair Display" font-weight="600" font-size="${nameSize}" fill="#8b6914">${esc(content.name)}</text>
  <line x1="${tx - 240}" y1="318" x2="${tx + 240}" y2="318" stroke="rgba(139,105,20,0.5)" stroke-width="2"/>
  <text x="${tx}" y="366" text-anchor="middle" font-family="Lora" font-style="italic" font-size="30" fill="#6b5a2a">${esc(content.epithet)}</text>

  ${descSvg}

  <text x="${tx}" y="${H - 68}" text-anchor="middle" font-family="Lora" font-size="21" fill="rgba(43,43,43,0.45)">egg.ilyamedve.dev</text>
</svg>`;
}

export const GET: APIRoute = ({ url }) => {
  const type = url.searchParams.get("type") ?? "";
  const langParam = url.searchParams.get("lang");
  const lang: PersonaLang = langParam === "en" ? "en" : "ru";

  if (!getPersonaById(type)) {
    return new Response("Unknown persona", { status: 404 });
  }

  const key = `${type}:${lang}`;
  let png = cache.get(key);

  if (!png) {
    const svg = buildSvg(type, lang);
    const resvg = new Resvg(svg, {
      font: {
        fontFiles: FONT_FILES.filter((file) => existsSync(file)),
        loadSystemFonts: false,
        defaultFontFamily: "Lora",
      },
    });
    png = Buffer.from(resvg.render().asPng());
    cache.set(key, png);
  }

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
};
