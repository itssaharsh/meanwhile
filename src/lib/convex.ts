import { ConvexReactClient } from "convex/react";

// The deployment this build talks to. `upload --build [--prod]` bakes the right one in.
// Without it the app still runs on fixtures (the kit, ?demo=1), so a missing URL degrades to
// the demo rather than a blank screen.
export const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
export const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;
