// Frontend glue: subscribe to the reactive Convex queries and feed the globe UI.
//
// Two deliberate choices here:
//  1. Function references are built by NAME (makeFunctionReference) rather than imported
//     from convex/_generated/api — that directory doesn't exist until `npx convex dev`
//     has run, and demo mode must build on a clean checkout with no deployment at all.
//  2. Demo fixtures are imported, not fetched, so `?demo=true` works offline and
//     src/fixtures.json stays the single source that `npm run verify` also reads.
import { ConvexClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import fixtures from "./fixtures.json";
import { toMoment, toFeed, countryToMoment } from "./viewmodel.js";

const fn = {
  getCut: makeFunctionReference("director:getCut"),
  getFeed: makeFunctionReference("director:getFeed"),
  fetchCountry: makeFunctionReference("countries:fetchCountry"),
  subscribe: makeFunctionReference("agentmail:subscribe"),
};

export const DEMO =
  typeof location !== "undefined" && new URLSearchParams(location.search).get("demo") === "true";

// Canonical form: Vite only guarantees STATIC replacement of `import.meta.env.VITE_*`.
// Writing the lookup with optional chaining leaves it to runtime, which works in dev
// but is not a documented guarantee in a production build.
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL;

export function startLive() {
  if (DEMO) return startDemo();

  if (!CONVEX_URL) {
    console.warn(
      "VITE_CONVEX_URL is not set — falling back to demo fixtures.\n" +
        "Run `npx convex dev`, then put the deployment URL it prints in .env.local as VITE_CONVEX_URL.",
    );
    return startDemo();
  }

  const client = new ConvexClient(CONVEX_URL);

  client.onUpdate(fn.getCut, {}, (cut) => {
    const m = toMoment(cut);
    if (m) window.__setCut?.(m);
  });

  client.onUpdate(fn.getFeed, { limit: 12 }, (feed) => {
    // Always forward, including an empty list: in live mode "the backend has nothing yet"
    // must clear the placeholder cards rather than leave them showing as live.
    window.__setFeed?.(toFeed(feed));
  });

  return {
    mode: "live",
    fetchCountry: async (country, lat, lng) =>
      countryToMoment(await client.action(fn.fetchCountry, { country, lat, lng }), lat, lng),
    subscribe: (email) => client.mutation(fn.subscribe, { email }),
  };
}

function startDemo() {
  const feed = toFeed(fixtures.feed);
  const cut = toMoment(fixtures.cut);
  // next tick, so the page's own boot (select(0)) has run first
  setTimeout(() => {
    if (feed.length) window.__setFeed?.(feed);
    if (cut) window.__setCut?.(cut);
  }, 0);

  return {
    mode: "demo",
    fetchCountry: async (country, lat, lng) => {
      await new Promise((r) => setTimeout(r, 850)); // the real one takes about this long
      return countryToMoment({ ...fixtures.countryDemo, country, place: country }, lat, lng);
    },
    subscribe: null, // demo mode must never send real mail
  };
}
