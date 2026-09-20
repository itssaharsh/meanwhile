import { lazy, Suspense } from "react";
import type { GlobeProps } from "./GlobeCanvas";
import { GlobeSlate } from "./GlobeSlate";
import { GlobeBoundary } from "./GlobeBoundary";

// three.js and the country geometry load in their own chunk. The Suspense boundary wraps the
// globe and nothing else, and its fallback is the slate — so TopBar, Dock and Rail paint from
// the first frame and never wait on the canvas.
const GlobeCanvas = lazy(() => import("./GlobeCanvas"));

export function Globe(props: GlobeProps) {
  return (
    // The boundary is OUTSIDE the Suspense: a chunk that fails to load and a context that fails
    // to start both end up here, and both leave the rest of the channel running.
    <GlobeBoundary fallback={<GlobeSlate state="unavailable" />}>
      <Suspense fallback={<GlobeSlate state="loading" />}>
        <GlobeCanvas {...props} />
      </Suspense>
    </GlobeBoundary>
  );
}

export type { GlobeProps };
