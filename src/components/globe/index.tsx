import { lazy, Suspense } from "react";
import type { GlobeProps } from "./GlobeCanvas";
import { GlobeSlate } from "./GlobeSlate";
import { GlobeBoundary } from "./GlobeBoundary";

// three.js and the country geometry load in their own chunk. The Suspense boundary wraps the
// globe and nothing else, and its fallback is the slate — so TopBar, Dock and Rail paint from
// the first frame and never wait on the canvas.
const GlobeCanvas = lazy(() => import("./GlobeCanvas"));

/** `slate` false mounts the planet with no loading or failure placard.
 *
 *  The slate is the player's own status line — "acquiring picture" is a statement about the
 *  channel. On the 404 it was rendering underneath the error page, so a route whose whole job
 *  is to say "this does not exist" also claimed to be acquiring a picture. The planet still
 *  turns there as scenery; it just stops narrating itself. */
export function Globe({ slate = true, ...props }: GlobeProps & { slate?: boolean }) {
  return (
    // The boundary is OUTSIDE the Suspense: a chunk that fails to load and a context that fails
    // to start both end up here, and both leave the rest of the channel running.
    <GlobeBoundary fallback={slate ? <GlobeSlate state="unavailable" /> : null}>
      <Suspense fallback={slate ? <GlobeSlate state="loading" /> : null}>
        <GlobeCanvas {...props} slate={slate} />
      </Suspense>
    </GlobeBoundary>
  );
}

export type { GlobeProps };
