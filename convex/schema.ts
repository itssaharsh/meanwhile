import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  cameras: defineTable({
    name: v.string(),
    country: v.string(),
    lat: v.number(),
    lng: v.number(),
    tz: v.number(),          // hours offset from UTC (rough, for local time)
    source: v.string(),      // "image" | "windy"  (Firecrawl is never used per camera)
    ref: v.string(),         // direct image URL, or a Windy webcam id
    active: v.boolean(),
  }).index("by_active", ["active"]).index("by_name", ["name"]),

  snapshots: defineTable({
    cameraId: v.id("cameras"),
    storageId: v.optional(v.id("_storage")), // stored image bytes (preferred)
    imageUrl: v.optional(v.string()),        // fallback if storing failed
    score: v.number(),                       // 0-10 beauty / human-interest
    caption: v.string(),                     // one-line AI narration
    tags: v.array(v.string()),
    weather: v.optional(v.string()),
    localTime: v.optional(v.string()),
    isDay: v.optional(v.boolean()),
    headline: v.optional(v.string()),        // today's local news headline (Firecrawl)
    headlineUrl: v.optional(v.string()),
    imageHash: v.optional(v.string()),       // sha256 of the frame, for the no-op skip
    reusedScore: v.optional(v.boolean()),    // true = identical frame, score carried over
    servedBy: v.optional(v.string()),        // "<provider>/<model>" that produced the score
    // The SOURCE's own timestamp for the frame (its Last-Modified, read against the host's
    // clock). Absent = the source sent none, and the frame can never be shown as verified.
    capturedAt: v.optional(v.number()),
    at: v.number(),
  })
    .index("by_camera", ["cameraId"])
    .index("by_storage", ["storageId"])
    .index("by_score", ["score"]),

  // The current "now showing" cut. We append and read the latest row.
  cut: defineTable({
    snapshotId: v.id("snapshots"),
    cameraId: v.id("cameras"),
    at: v.number(),
  }),

  subscribers: defineTable({
    email: v.string(),
    confirmed: v.boolean(),
    at: v.number(),
    // The send we are waiting on, so the delivery chip has something to follow. AgentMail's
    // webhook reports against the message id, and without this there is nothing to join on.
    lastMessageId: v.optional(v.string()),
    lastSentAt: v.optional(v.number()),
  }).index("by_email", ["email"]),

  // One row per country click, written stage by stage as the fetch runs; the story panel
  // subscribes to it, so the wait shows what is actually happening (C-08). Counts reconcile:
  // stale + misplaced = rejected, and rejected + kept = n.
  fetches: defineTable({
    country: v.string(),       // the polygon name the click sent
    lat: v.number(),
    lng: v.number(),
    stage: v.string(),         // searching | candidates | pulling | checking | rejected | scoring | done | failed
    n: v.number(),             // candidate frames found
    i: v.number(),             // the frame being worked on, 1-based
    cameraName: v.optional(v.string()),
    frameAgeMs: v.optional(v.union(v.number(), v.null())), // null = the source sent no timestamp
    stale: v.number(),
    misplaced: v.number(),
    kept: v.number(),
    pages: v.number(),         // camera pages searched
    oldestAt: v.optional(v.number()), // the oldest stale frame's own timestamp
    elsewhere: v.optional(v.string()),// a place a rejected frame was actually filmed
    outcome: v.optional(v.string()),  // live | stale | undated | cached | empty | error
    storyId: v.optional(v.id("stories")),
    error: v.optional(v.string()),
    startedAt: v.number(),
    stageStartedAt: v.number(),
    finishedAt: v.optional(v.number()),
  }).index("by_country", ["country"]),

  // Frames a country fetch found and kept, one row per fetch, stored in Convex storage. The
  // cache behind the cached-frame rung and behind "three countries verified this minute".
  stories: defineTable({
    country: v.string(),       // polygon name
    place: v.string(),         // what the frame shows, as best we know (camera or page title)
    lat: v.number(),
    lng: v.number(),
    storageId: v.id("_storage"),
    sourceImageUrl: v.string(),
    sourcePage: v.optional(v.string()),
    cameraName: v.optional(v.string()),
    capturedAt: v.union(v.number(), v.null()), // the source's own timestamp; null = none sent
    score: v.optional(v.number()),
    caption: v.string(),
    tags: v.array(v.string()),
    headline: v.optional(v.string()),
    headlineUrl: v.optional(v.string()),
    via: v.string(),           // "search" | "pool"
    at: v.number(),
  })
    .index("by_country_at", ["country", "at"])
    .index("by_at", ["at"])
    .index("by_storage", ["storageId"]),

  // What the public camera index knows about each country, kept here rather than fetched at
  // click time. The index is a third party: if it 404s during judging, a live lookup would
  // silently take out the rung that actually works and drop every click back onto the paid
  // search that answered none of fifteen. A row that exists is used even when stale.
  //
  // `verifiedAt` is the other half: the last time a frame from this country passed the
  // freshness check. It is what tints a country on the globe, so the tint is a record of
  // something that actually happened rather than a guess about what might.
  coverage: defineTable({
    country: v.string(),     // the polygon name a click arrives with
    slug: v.string(),        // the index slug that answered, or the one we tried
    listed: v.boolean(),     // false = the index has no page for this country
    // id is a Windy camera id, or the index's own feed id for a camera from some other
    // source; `url` is that camera's real origin, resolved once here so a click never has to.
    cameras: v.array(v.object({ id: v.string(), name: v.optional(v.string()), url: v.optional(v.string()) })),
    refreshedAt: v.number(), // when the index page was last read
    verifiedAt: v.optional(v.number()), // last frame from here that proved it was current
  })
    .index("by_country", ["country"])
    .index("by_refreshedAt", ["refreshedAt"])
    .index("by_verifiedAt", ["verifiedAt"]),

  // Crude fixed-window counters. `countries:fetchCountry` and `agentmail:subscribe` are
  // public and unauthenticated — without this, anyone holding the deployment URL can
  // loop them and spend your OpenAI/Firecrawl credit, or mail arbitrary addresses.
  // Cached local headlines. Firecrawl search is billed per call and headlines move far
  // slower than webcam frames, so one lookup per place is reused across refreshes.
  headlines: defineTable({
    place: v.string(),
    title: v.string(),
    url: v.optional(v.string()),
    source: v.optional(v.string()),
    at: v.number(),
  }).index("by_place", ["place"]),

  // Vision models that are unusable right now, per provider and per deployment key.
  // Each Gemini model has its own daily quota, so when one is spent the failover chain
  // should skip it for the rest of the UTC day instead of paying a 429 on every call.
  // One row per model (upserted), so this never grows past the size of the chain.
  modelState: defineTable({
    provider: v.string(),
    keyTag: v.string(), // short sha256 fingerprint of the DEPLOYMENT key — never a caller's key
    model: v.string(),
    until: v.number(), // unusable until this time (ms since epoch)
    reason: v.string(), // "daily-quota" | "zero-limit" | "per-minute" | "gone"
    at: v.number(),
  })
    .index("by_provider_key", ["provider", "keyTag"])
    .index("by_provider_key_model", ["provider", "keyTag", "model"]),

  // AgentMail delivery events, received by the signed webhook in http.ts. "Did the email
  // arrive?" becomes a record — delivered / bounced / rejected — instead of a guess.
  // Svix retries deliveries, so rows are unique per event id.
  mailEvents: defineTable({
    eventType: v.string(),
    eventId: v.string(),
    messageId: v.optional(v.string()),
    recipients: v.array(v.string()),
    detail: v.optional(v.string()), // the event's own object, truncated, for bounce reasons etc.
    at: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_messageId", ["messageId"]),

  rateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    windowStart: v.number(),
  }).index("by_key", ["key"]),
});
