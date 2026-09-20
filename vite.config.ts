import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// Two pages while the channel is rebuilt in React:
//   index.html   the new app (/, /_kit, and the 404 route, all client-side)
//   legacy.html  the previous vanilla page, kept runnable until the new one replaces it
// Convex static hosting falls back to index.html for unknown paths, so /_kit and the 404
// route need no server support.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        legacy: fileURLToPath(new URL("./legacy.html", import.meta.url)),
      },
    },
  },
});
