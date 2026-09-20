// Entry module. The page's own IIFE exposes window.__setCut / __setFeed and looks for
// window.__fetchCountry / __subscribe; this hands it whichever data source is active.
import { startLive, DEMO } from "./live.js";
const live = startLive();

window.__fetchCountry = live.fetchCountry;
if (live.subscribe) window.__subscribe = live.subscribe;
if (live.ask) window.__ask = live.ask;

// The director banner gets overwritten on every cut, so the mode goes in the masthead
// subtitle instead — where it stays visible for the whole demo.
if (live.mode === "demo") {
  const tag = document.querySelector(".brand .tag");
  if (tag) tag.textContent = "Earth, right now — demo fixtures, no live calls";
}

console.info(`Meanwhile — ${live.mode} mode${DEMO ? " (?demo=true)" : ""}`);
