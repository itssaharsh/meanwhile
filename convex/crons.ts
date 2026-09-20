import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Re-pull + re-score the whole camera pool. This is what makes the channel self-updating.
//
// 20 minutes, not 5: at 5 minutes a 12-camera pool is ~3,456 vision calls a day (>$100/mo),
// and if any camera uses the firecrawl source it burns that provider's entire ~500-credit
// free tier inside two hours. 20 minutes is ~864/day and still feels live; a demo can
// always force an instant refresh with `npx convex run pool:refreshAll`.
//
// cronRefresh is a no-op until POOL_ENABLED=1, so pushing this code costs nothing.
crons.interval("refresh camera pool", { minutes: 20 }, internal.pool.cronRefresh, {});

// Nothing deleted snapshots or their stored images before, so both grew without bound.
crons.interval("prune old snapshots", { hours: 6 }, internal.cut.prune, {});

// The country -> camera map that the click's best rung reads. Ten countries an hour walks all
// 177 in under a day and asks very little of a free service; nothing reads that service at
// click time, so an outage there can never take the rung out mid-demo.
crons.interval("refresh country coverage", { hours: 1 }, internal.coverage.cronRefresh, {});

export default crons;
