import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Combined CampConnect app: student ("normal") UI + Club Admin UI in one SPA.
// Any PORT/BASE_PATH env vars are optional here (they were only required by the
// original Replit host); local dev defaults to Vite's defaults.
const port = process.env.PORT ? Number(process.env.PORT) : 5173;
const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    port,
    host: true,
    strictPort: false,
    proxy: {
      '/api': 'http://localhost:4000',
      '/auth': 'http://localhost:4000',
    },
  },
  preview: {
    port,
    host: true,
  },
});