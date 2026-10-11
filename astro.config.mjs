// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import node from "@astrojs/node";
import { loadEnv } from "vite";
import { roadOffline } from "./scripts/road-offline.mjs";

const env = loadEnv(process.env.NODE_ENV || "development", process.cwd(), "");
const domain = process.env.DOMAIN || env.DOMAIN || "ilyamedve.dev";
if (!/^[a-z0-9.-]+$/i.test(domain)) throw new Error("DOMAIN must be a bare domain name");

// https://astro.build/config
export default defineConfig({
  site: `https://egg.${domain}/`,
  output: "static",
  // Node-адаптер не учитывает Host/X-Forwarded-* при вычислении url.origin
  // (за Caddy origin всегда "http://localhost:4321"), поэтому встроенная
  // CSRF-проверка форм ломала бы все multipart-POST в проде. Отключаем:
  // мутирующие эндпоинты защищены своими механизмами (кодовое слово Фонина,
  // secret_token вебхука Книги, рейт-лимит + премодерация записей).
  security: { checkOrigin: false },
  adapter: node({
    mode: "standalone",
  }),
  integrations: [react(), roadOffline()],
  i18n: {
    locales: ["ru", "en"],
    defaultLocale: "ru",
    routing: {
      prefixDefaultLocale: true,
    },
  },
  server: {
    host: "0.0.0.0",
  },
  vite: {
    preview: {
      allowedHosts: true,
    },
    server: {
      allowedHosts: true,
    },
  },
});
