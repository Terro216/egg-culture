// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import node from "@astrojs/node";
import { loadEnv } from "vite";

const env = loadEnv(process.env.NODE_ENV || "development", process.cwd(), "");
const domain = env.DOMAIN || "ilyamedve.dev";

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
  integrations: [react()],
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
