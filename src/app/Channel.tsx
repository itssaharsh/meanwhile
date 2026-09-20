import { useMemo, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { convex } from "@/lib/convex";
import { useNow } from "@/lib/hooks";
import { Globe } from "@/components/globe";
import { TopBar } from "@/components/TopBar";
import { FeedRail } from "@/components/FeedRail";
import { useChannel, DEMO } from "./useChannel";
import type { Snapshot } from "@/lib/types";

/**
 * The shell. Everything that must never stop is mounted here.
 *
 * The TopBar and the globe sit OUTSIDE the router outlet and outside every Suspense boundary,
 * so a route change, a story loading, or a lazy chunk arriving cannot unmount them. That is the
 * load-bearing rule of the whole screen: the channel's claim is that you are watching something
 * live, and a globe that freezes while a panel loads breaks that claim more thoroughly than any
 * missing feature would. The outlet renders over them; it never contains them.
 *
 * The globe is lazy-loaded behind its own Suspense (inside `Globe`), whose fallback is the
 * slate — so the bar and the rail paint on the first frame and never wait on WebGL.
 */
export function Channel({ children }: { children?: ReactNode }) {
  const now = useNow(30_000);
  const { onAir, feed, topBarState, railState, previous, flashId } = useChannel();

  // Countries the globe tints, straight from the coverage table. Two lists, three honest
  // tiers: verified within the hour, a camera we hold that hasn't proved itself, and nothing.
  const coveredList = useQuery(api.coverage.covered, DEMO || !convex ? "skip" : {});
  const indexedList = useQuery(api.coverage.indexed, DEMO || !convex ? "skip" : {});
  const covered = useMemo(() => (coveredList ? new Set(coveredList) : null), [coveredList]);
  const indexed = useMemo(() => (indexedList ? new Set(indexedList) : null), [indexedList]);

  const marker = onAir ? { lat: onAir.place.lat, lon: onAir.place.lon, snapshotId: onAir.snapshotId } : null;

  return (
    <div className="fixed inset-0 flex flex-col bg-canvas">
      <TopBar state={topBarState} onAir={onAir} previous={previous} now={now} />

      <div className="relative min-h-0 flex-1">
        {/* The planet, always mounted, always turning. */}
        <Globe onAir={marker} covered={covered} indexed={indexed} />

        {/* The router's outlet renders over the globe, never around it. */}
        {children}
      </div>

      <FeedRail items={feed} onAirId={onAir?.snapshotId ?? null} now={now} state={railState} flashId={flashId} />
    </div>
  );
}

export type { Snapshot };
