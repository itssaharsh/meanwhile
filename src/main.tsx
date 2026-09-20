import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ConvexProvider } from "convex/react";
import { MotionConfig } from "motion/react";
import { App } from "./app/App";
import { convex } from "./lib/convex";
import "./styles/app.css";

// Without VITE_CONVEX_URL there is no client and no provider: the fixture pages (/_kit) still
// render, and anything live says so rather than throwing.
const WithConvex = ({ children }: { children: ReactNode }) =>
  convex ? <ConvexProvider client={convex}>{children}</ConvexProvider> : <>{children}</>;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Every choreography row honours prefers-reduced-motion; components that must also drop
        their crossfades read useReduced() themselves. */}
    <MotionConfig reducedMotion="user">
      <WithConvex>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </WithConvex>
    </MotionConfig>
  </StrictMode>,
);
