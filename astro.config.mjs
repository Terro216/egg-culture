// @ts-check
import { defineConfig } from "astro/config";
// import { loadEnv } from "vite";
import react from "@astrojs/react";

// https://astro.build/config
// const domain = process.env.DOMAIN || "ilyamedve.dev";
// const { DOMAIN } = loadEnv(process.env.DOMAIN, process.cwd(), "");

export default defineConfig({
  site: `https://egg.ilyamedve.dev/`,
  integrations: [react()],
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
