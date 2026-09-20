import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { envOrNull } from "./lib";

const STAGGER_MS = 1500;
// How long to let the last camera finish before picking the cut. Each camera now does
// download + sha256 + a (usually cached) headline lookup + a vision call, so a slow one
// can run well past the old 30s. The cut is re-picked a second time later as insurance:
// reselect short-circuits when nothing changed, so the extra pass is nearly free, and it
// stops one slow camera from parking the channel on a stale cut for a whole cron interval.
const SETTLE_MS = 60_000;

// Refresh every active camera, staggered so we stay under API rate limits, then pick the
// cut ONCE for the whole batch.
//
// Always safe to run by hand: `npx convex run pool:refreshAll`. The cron goes through
// cronRefresh instead, which respects the POOL_ENABLED kill switch.
export const refreshAll = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<{ scheduled: number; of: number }> => {
    const cams = await ctx.runQuery(internal.cameras.listActive, {});
    if (!cams.length) {
      console.warn("[meanwhile] no active cameras — run `npx convex run seed:run` first");
      return { scheduled: 0, of: 0 };
    }

    const cap = limit ?? Number(envOrNull("POOL_MAX_CAMERAS") ?? 0) ?? 0;
    const batch = cap > 0 ? cams.slice(0, cap) : cams;
    if (batch.length < cams.length) {
      console.log(`[meanwhile] capped this run at ${batch.length} of ${cams.length} cameras`);
    }

    let delayMs = 0;
    for (const cam of batch) {
      await ctx.scheduler.runAfter(delayMs, internal.ingest.refreshCamera, { cameraId: cam._id });
      delayMs += STAGGER_MS;
    }

    await ctx.scheduler.runAfter(delayMs + SETTLE_MS, internal.cut.reselect, {});
    await ctx.scheduler.runAfter(delayMs + SETTLE_MS * 3, internal.cut.reselect, {});

    return { scheduled: batch.length, of: cams.length };
  },
});

// What the cron calls. Off by default so that pushing this code — which happens before
// any key is set — never starts spending money or free-tier credit on its own.
/** How often the pool refreshes when POOL_INTERVAL_MINUTES is unset — the pace prod has been
 *  running at all along, so an existing deployment's behaviour does not change under it. */
const DEFAULT_INTERVAL_MINUTES = 20;

export const cronRefresh = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    if (envOrNull("POOL_ENABLED") !== "1") {
      console.log(
        "[meanwhile] cron refresh skipped: POOL_ENABLED is not \"1\". Turn the channel on with: npx convex env set POOL_ENABLED 1",
      );
      return;
    }
    // The cron's own interval is compiled into crons.ts and is therefore the same on every
    // deployment. How often the channel actually refreshes is a per-deployment decision — dev
    // does not need prod's pace, and each has its own vision quota — so the tick is fast and
    // this gate decides whether it does anything. One refresh per window, counted.
    const minutes = Number(envOrNull("POOL_INTERVAL_MINUTES") ?? DEFAULT_INTERVAL_MINUTES);
    const windowMs = (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_INTERVAL_MINUTES) * 60_000;
    const gate = await ctx.runMutation(internal.limits.take, { key: "pool:interval", limit: 1, windowMs });
    if (!gate.ok) return;
    await ctx.runAction(internal.pool.refreshAll, {});
  },
});
