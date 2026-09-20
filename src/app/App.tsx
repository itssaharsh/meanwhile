import { useEffect } from "react";
import { Route, Routes } from "react-router";
import { NotFound } from "@/components/NotFound";
import { GlobeSlate } from "@/components/globe/GlobeSlate";
import { TopBar } from "@/components/TopBar";
import { Kit } from "@/kit/Kit";

// Block 0 routes. `/` keeps serving the current channel (legacy.html) until block 2 replaces
// it with the new shell, so nothing live changes while the component kit is reviewed.
function LegacyChannel() {
  useEffect(() => {
    window.location.replace(`/legacy.html${window.location.search}`);
  }, []);
  return null;
}

// Until block 5 wires channel.onAir, the 404 makes no claim about where the channel is: the
// TopBar stands by and the live line is omitted (NotFound's `error` state).
function NotFoundRoute() {
  return (
    <div className="fixed inset-0 flex flex-col bg-canvas">
      <TopBar state="standby" onAir={null} now={Date.now()} />
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 opacity-35 max-sm:opacity-[.22]">
          <GlobeSlate state="loading" />
        </div>
        <NotFound state="error" onAir={null} now={Date.now()} onReturn={() => (window.location.href = "/")} />
      </div>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LegacyChannel />} />
      <Route path="/_kit" element={<Kit />} />
      <Route path="*" element={<NotFoundRoute />} />
    </Routes>
  );
}
