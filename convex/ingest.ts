import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { envOrNull, fetchOk, missingKey } from "./lib";
import { frameAgeMs } from "./frames.js";

// Pull one fresh snapshot image for a camera, then either reuse the last score (if the
// frame is byte-identical) or send it for scoring.
//
// Two source kinds:
//   "image" — `ref` is a direct still-image URL (a road/harbour/airport cam's .jpg).
//             No API key, no credit, no third party. This is what the seed uses.
//   "windy" — `ref` is a Windy webcam id. Needs WINDY_KEY.
//
// This runs on the cron, so it never calls Firecrawl. Firecrawl is demand-driven: the
// country click, and one cached headline for the snapshot on air (see news.ts). A
// "firecrawl" camera source — screenshot a page per camera per refresh — was removed
// for exactly that reason.

const BROWSER_HEADERS = {
  // Some camera hosts (Transport for NSW, for one) answer a header-less request with
  // HTTP 200 and a small HTML "temporarily unavailable" page instead of an image.
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/jpeg,image/png,*/*",
};

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const refreshCamera = internalAction({
  args: { cameraId: v.id("cameras") },
  handler: async (ctx, { cameraId }): Promise<void> => {
    const cam = await ctx.runQuery(internal.cameras.get, { id: cameraId });
    if (!cam) return;

    if (!cam.ref) {
      console.warn(`[meanwhile] ${cam.name}: no ref configured — skipping.`);
      return;
    }

    // --- 1. work out where this camera's current frame lives -----------------
    let imageUrl: string | null = null;

    if (cam.source === "image") {
      imageUrl = cam.ref;
    } else if (cam.source === "windy") {
      const key = envOrNull("WINDY_KEY");
      if (!key) { missingKey("WINDY_KEY", `windy camera ${cam.name}`); return; }
      const r = await fetchOk(
        `windy ${cam.name}`,
        `https://api.windy.com/webcams/api/v3/webcams/${cam.ref}?include=images`,
        { headers: { "x-windy-api-key": key } },
      );
      if (!r) return;
      const j: any = await r.json().catch(() => null);
      imageUrl = j?.images?.current?.preview ?? j?.images?.current?.thumbnail ?? null;
      if (!imageUrl) console.error(`[meanwhile] ${cam.name}: windy returned no current image`);
    } else {
      // Includes the retired "firecrawl" source: the cron must never spend Firecrawl credit.
      console.error(`[meanwhile] ${cam.name}: unsupported source "${cam.source}" — use "image" or "windy"`);
      return;
    }

    if (!imageUrl) return;

    // --- 2. download and fingerprint the frame -------------------------------
    const img = await fetchOk(`download ${cam.name}`, imageUrl, { headers: BROWSER_HEADERS });
    if (!img) return;

    const contentType = img.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      console.error(
        `[meanwhile] ${cam.name}: ${imageUrl} returned ${contentType || "no content-type"}, not an image`,
      );
      return;
    }

    const bytes = await img.arrayBuffer();
    const imageHash = await sha256(bytes);
    // What the camera itself says about this frame, measured against its own clock. Absent =
    // the host sent no Last-Modified, and the frame can never be claimed as verified.
    const sourceAgeMs = frameAgeMs(img.headers.get("last-modified"), img.headers.get("date"));
    const capturedAt = sourceAgeMs === null ? undefined : Date.now() - sourceAgeMs;

    // --- 3. identical frame? reuse the score instead of paying for it again ---
    const previous = await ctx.runQuery(internal.cut.latestForCamera, { cameraId });
    if (previous && previous.imageHash === imageHash) {
      // Byte-identical to the last frame we scored: the scene has not changed, so the
      // score and caption still hold. Mark the EXISTING snapshot rather than inserting a
      // new one — a new row would reset `at` and hand a frozen camera permanent freshness
      // (see cut.touch). No vision call, no second blob, and the frame ages out of cut
      // eligibility normally if it never changes again.
      await ctx.runMutation(internal.cut.touch, { snapshotId: previous._id, capturedAt });
      const ageMin = Math.round((Date.now() - previous.at) / 60000);
      console.log(
        `[meanwhile] ${cam.name}: frame unchanged for ${ageMin}m — kept score ${previous.score}, no OpenAI call`,
      );
      return;
    }

    // --- 4. new frame: store the bytes, then score ---------------------------
    let storageId: Id<"_storage"> | undefined;
    try {
      storageId = await ctx.storage.store(new Blob([bytes], { type: contentType }));
    } catch (e) {
      console.error(`[meanwhile] ${cam.name}: storing the frame failed`, e);
    }
    if (!storageId) return;

    await ctx.runAction(internal.score.scoreSnapshot, {
      cameraId,
      imageUrl,
      storageId,
      imageHash,
      capturedAt,
    });
  },
});
