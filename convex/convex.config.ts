import { defineApp } from "convex/server";
import staticHosting from "@convex-dev/static-hosting/convex.config";

// Serves the built Vite frontend from this same deployment, so backend and frontend share
// one https://<deployment>.convex.site origin. Routes are registered explicitly in
// http.ts rather than by mounting the component at "/", which keeps the app's own
// /agentmail/webhook route where AgentMail expects it.
const app = defineApp();
app.use(staticHosting);

export default app;
