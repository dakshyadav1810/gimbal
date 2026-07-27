import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "../core/static", emptyOutDir: true },
  server: {
    // Dev-only proxy — in prod core serves the dashboard bundle itself, so there's no cross-origin
    // hop. /tests, /reviews, etc. are intentionally NOT proxied: those are the SPA's own client
    // routes now that the REST API lives under /api (see DECISIONS.md #11/#12).
    proxy: {
      "/api": "http://127.0.0.1:4319",
      "/screenshots": "http://127.0.0.1:4319",
      "/ws": { target: "ws://127.0.0.1:4319", ws: true },
    },
  },
});
