import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { convex } from "@/lib/convex";
import { byScore, RUNNING_ORDER, ON_AIR } from "@/lib/fixtures";
import type { Snapshot } from "@/lib/types";
import type { TopBarState } from "@/components/TopBar";
import type { RailState } from "@/components/FeedRail";

/** ?demo=true renders the whole channel from fixtures: no keys, no deployment, no network.
 *  It is the same render path the live channel uses, which is what makes it a safety net
 *  rather than a mock. */
export const DEMO = typeof location !== "undefined" && new URLSearchParams(location.search).get("demo") === "true";

/** How long the TopBar holds the "Cutting" line after the director changes frame (T-03). */
const CUT_HOLD_MS = 1400;

type Row = NonNullable<ReturnType<typeof useQuery<typeof api.director.getCut>>>;

/** The channel's own row shape -> the shape every component in /_kit was built against. */
function toSnapshot(row: Row): Snapshot | null {
  if (!row?.camera) return null;
  let host: string | null = null;
  try {
    host = row.imageUrl ? new URL(row.imageUrl).host : null;
  } catch {
    host = null;
  }
  return {
    snapshotId: row._id,
    place: {
      name: row.camera.name,
      country: row.camera.country,
      lat: row.camera.lat,
      lon: row.camera.lng,
      utcOffsetMin: row.camera.tz * 60,
    },
    score: typeof row.score === "number" ? row.score : null,
    capturedAt: row.capturedAt ?? null,
    checkedAt: row.at,
    frameUrl: row.url ?? null,
    caption: row.caption,
    tags: row.tags ?? [],
    beat: null,
    cameraName: row.camera.name,
    sourceHost: host,
    sourceUrl: row.imageUrl ?? null,
    headline: row.headline ?? null,
  };
}

export type Channel = {
  onAir: Snapshot | null;
  feed: Snapshot[];
  topBarState: TopBarState;
  railState: RailState;
  /** The frame being cut away from, for the TopBar's two-line cut (T-03). */
  previous: Snapshot | null;
  /** The rail item to flash when it arrives (T-07). */
  flashId: string | null;
  live: boolean;
};

export function useChannel(): Channel {
  // A single subscription each. Convex pushes; nothing here polls, and nothing refetches.
  const cutRow = useQuery(api.director.getCut, DEMO || !convex ? "skip" : {});
  const feedRows = useQuery(api.director.getFeed, DEMO || !convex ? "skip" : { limit: 12 });

  const onAir = useMemo(() => {
    if (DEMO || !convex) return ON_AIR;
    return cutRow ? toSnapshot(cutRow) : null;
  }, [cutRow]);

  const feed = useMemo(() => {
    if (DEMO || !convex) return RUNNING_ORDER;
    if (!feedRows) return [];
    return byScore(feedRows.map(toSnapshot).filter((s): s is Snapshot => s !== null));
  }, [feedRows]);

  // T-03: when the cut changes, the bar says "Cutting" for a beat and names what it beat,
  // then settles. Held in a ref so a re-render for any other reason can't retrigger it.
  const [cutting, setCutting] = useState(false);
  const previousRef = useRef<Snapshot | null>(null);
  const lastIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = onAir?.snapshotId ?? null;
    if (id === lastIdRef.current) return;
    const had = lastIdRef.current;
    previousRef.current = had ? feed.find((s) => s.snapshotId === had) ?? previousRef.current : null;
    lastIdRef.current = id;
    if (!had || !id) return; // the first frame of the session is not a cut
    setCutting(true);
    const t = setTimeout(() => setCutting(false), CUT_HOLD_MS);
    return () => clearTimeout(t);
  }, [onAir?.snapshotId, feed]);

  // The rail flashes the frame that just arrived on air.
  const [flashId, setFlashId] = useState<string | null>(null);
  useEffect(() => {
    if (!onAir) return;
    setFlashId(onAir.snapshotId);
    const t = setTimeout(() => setFlashId(null), 900);
    return () => clearTimeout(t);
  }, [onAir?.snapshotId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loading = !DEMO && convex && (cutRow === undefined || feedRows === undefined);

  const topBarState: TopBarState = cutting ? "cut" : onAir ? "onair" : loading ? "standby" : "empty";
  const railState: RailState = loading ? "loading" : feed.length ? "idle" : "first";

  return {
    onAir,
    feed,
    topBarState,
    railState,
    previous: cutting ? previousRef.current : null,
    flashId,
    live: !DEMO && Boolean(convex),
  };
}
