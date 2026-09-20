/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentmail from "../agentmail.js";
import type * as cameras from "../cameras.js";
import type * as centroids from "../centroids.js";
import type * as countries from "../countries.js";
import type * as coverage from "../coverage.js";
import type * as crons from "../crons.js";
import type * as cut from "../cut.js";
import type * as director from "../director.js";
import type * as fetches from "../fetches.js";
import type * as frames from "../frames.js";
import type * as geo from "../geo.js";
import type * as http from "../http.js";
import type * as ingest from "../ingest.js";
import type * as lib from "../lib.js";
import type * as limits from "../limits.js";
import type * as modelState from "../modelState.js";
import type * as news from "../news.js";
import type * as pool from "../pool.js";
import type * as providers from "../providers.js";
import type * as rank from "../rank.js";
import type * as score from "../score.js";
import type * as seed from "../seed.js";
import type * as stages from "../stages.js";
import type * as stories from "../stories.js";
import type * as text from "../text.js";
import type * as vision from "../vision.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentmail: typeof agentmail;
  cameras: typeof cameras;
  centroids: typeof centroids;
  countries: typeof countries;
  coverage: typeof coverage;
  crons: typeof crons;
  cut: typeof cut;
  director: typeof director;
  fetches: typeof fetches;
  frames: typeof frames;
  geo: typeof geo;
  http: typeof http;
  ingest: typeof ingest;
  lib: typeof lib;
  limits: typeof limits;
  modelState: typeof modelState;
  news: typeof news;
  pool: typeof pool;
  providers: typeof providers;
  rank: typeof rank;
  score: typeof score;
  seed: typeof seed;
  stages: typeof stages;
  stories: typeof stories;
  text: typeof text;
  vision: typeof vision;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
};
