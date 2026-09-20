import { Route, Routes, useLocation, useNavigate } from "react-router";
import { NotFound } from "@/components/NotFound";
import { Kit } from "@/kit/Kit";
import { Channel } from "./Channel";
import { useChannel } from "./useChannel";
import { useNow } from "@/lib/hooks";

// Block 2, step 1: the shell. `/` is the channel now; legacy.html stays reachable at its own
// URL until the new app has been verified on prod.
//
// The kit is deliberately NOT wrapped in the shell — it is a workbench for components, and
// mounting a second globe behind it would cost a WebGL context for nothing.

function NotFoundRoute() {
  const now = useNow(30_000);
  const { onAir } = useChannel();
  const navigate = useNavigate();
  // Routed, not reloaded: a full page load would tear down the globe and the subscriptions,
  // which is the one thing the shell exists to prevent. The channel keeps running underneath
  // this page the whole time it is shown.
  const back = () => navigate("/", { replace: true });
  return <NotFound state={onAir ? "idle" : "error"} onAir={onAir} now={now} onReturn={back} onPick={back} />;
}

export function App() {
  const { pathname } = useLocation();
  if (pathname === "/_kit") return <Kit />;

  // TopBar and globe live in Channel, outside this outlet. Routes render over them.
  return (
    <Channel>
      <Routes>
        <Route path="/" element={null} />
        <Route path="*" element={<NotFoundRoute />} />
      </Routes>
    </Channel>
  );
}
