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
