import { lazy, Suspense } from "react";
import type { GlobeProps } from "./GlobeCanvas";
import { GlobeSlate } from "./GlobeSlate";

// three.js and the country geometry load in their own chunk. The Suspense boundary wraps the
// globe and nothing else, and its fallback is the slate — so TopBar, Dock and Rail paint from
// the first frame and never wait on the canvas.
const GlobeCanvas = lazy(() => import("./GlobeCanvas"));

export function Globe(props: GlobeProps) {
  return (
    <Suspense fallback={<GlobeSlate state="loading" />}>
      <GlobeCanvas {...props} />
    </Suspense>
  );
}

export type { GlobeProps };
