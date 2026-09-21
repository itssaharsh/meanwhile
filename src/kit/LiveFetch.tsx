import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import countriesRaw from "@/data/countries.json";
import { convex } from "@/lib/convex";
import { useNow } from "@/lib/hooks";
import { Globe } from "@/components/globe";
import { StoryPanel } from "@/app/StoryPanel";
import { useCountryFetch } from "@/app/useCountryFetch";

// countries.json carries the centroid as a plain [lng, lat] pair.
type Country = { n: string; c: number[] };
const centroid = (name: string) => (countriesRaw as Country[]).find((c) => c.n === name)?.c ?? null;

/** The country click, end to end, against the live deployment: click a country on the globe
 *  and the panel shows the ladder's named stages, then the story or the empty state that
 *  matches what failed. The docked version of this panel is what the product ships. */
function LiveFetchInner({ country }: { country?: string }) {
  const now = useNow(60_000);
  const f = useCountryFetch();
  // Countries whose camera proved current within the hour, straight from the coverage table.
  const coveredList = useQuery(api.coverage.covered, {});
  const covered = useMemo(() => (coveredList ? new Set(coveredList) : null), [coveredList]);
  // The middle tier: a camera we hold that hasn't proved itself current within the hour.
  const indexedList = useQuery(api.coverage.indexed, {});
  const indexed = useMemo(() => (indexedList ? new Set(indexedList) : null), [indexedList]);
  const [picked, setPicked] = useState<{ name: string; verified: boolean } | null>(null);

  const go = (name: string) => {
    const c = centroid(name);
    if (!c) return;
    setPicked({ name, verified: false });
    f.start(name, c[1], c[0]);
  };
  // ?state=live-fetch&country=Kenya starts one on load.
  useEffect(() => {
    if (country) go(country);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  const verified = f.outcome === "live" || f.outcome === "cached";
  return (
    <div className="fixed inset-0 flex bg-canvas max-md:flex-col">
      <div className="relative min-h-0 flex-1">
        <Globe
          onAir={null}
          active={picked ? { name: picked.name, verified } : null}
          covered={covered}
          indexed={indexed}
          onCountryClick={(name) => go(name)}
        />
      </div>
      <div className="flex w-[380px] shrink-0 flex-col border-l border-line bg-surface-1 max-md:w-full max-md:border-t max-md:border-l-0">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3 font-mono text-[11px] tracking-[0.14em] text-ink-muted uppercase">
          live · click a country
          {f.row && <span className="ml-auto normal-case tracking-normal">{f.row.stage}</span>}
        </div>
        <div className="@container/dock flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-4">
          <StoryPanel fetch={f} now={now} onAirId={null} onRetry={() => picked && go(picked.name)} onPickCountry={(c) => go(c)} />
        </div>
      </div>
    </div>
  );
}

export function LiveFetch({ country }: { country?: string }) {
  if (!convex) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas px-6 text-center font-mono text-[12px] text-ink-muted">
        no VITE_CONVEX_URL in this build — run `npm run dev:web` with .env.local, or use the fixture states
      </div>
    );
  }
  return <LiveFetchInner country={country} />;
}
