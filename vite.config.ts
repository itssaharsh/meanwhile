import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// One page. index.html is the app (/, /_kit and the 404 route, all client-side); Convex
// static hosting falls back to it for unknown paths, so neither needs server support.
//
// legacy.html is no longer built. The file stays in the repo as the record of what shipped
// first, but block 2 replaced it and serving two versions of the channel — one of them a
// prototype with numbers we removed — is how a stale tab ends up in front of a judge.
// public/legacy.html redirects anyone with that URL to the real thing.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
      },
    },
  },
});
