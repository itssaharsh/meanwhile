import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

// One page. index.html is the app (/, /_kit and the 404 route, all client-side); Convex
// static hosting falls back to it for unknown paths, so neither needs server support.
//
// legacy.html is no longer built. The file stays in the repo as the record of what shipped
// first, but block 2 replaced it and serving two versions of the channel — one of them a
// prototype with numbers we removed — is how a stale tab ends up in front of a judge.
// public/legacy.html redirects anyone with that URL to the real thing.
/**
 * The globe's chunk is the biggest thing we ship and the whole point of the page, but it is
 * lazy — so the browser only learns it exists after the main bundle has arrived and React has
 * rendered. Measured on a throttled connection that cost about twenty-six seconds of pure
 * serialisation, with the slate up the whole time. The filename is content-hashed, so the link
 * has to be written after the bundle is built.
 */
function preloadGlobeChunk(): import("vite").Plugin {
  return {
    name: "meanwhile:preload-globe",
    apply: "build",
    closeBundle() {
      const dir = fileURLToPath(new URL("./dist", import.meta.url));
      const indexPath = `${dir}/index.html`;
      const assets = readdirSync(`${dir}/assets`);
      const globe = assets.find((f) => /^GlobeCanvas-.*\.js$/.test(f));
      if (!globe) return;
      const html = readFileSync(indexPath, "utf8");
      if (html.includes(globe)) return;
      writeFileSync(
        indexPath,
        html.replace("</head>", `  <link rel="modulepreload" crossorigin href="/assets/${globe}" />\n  </head>`),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), preloadGlobeChunk()],
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
