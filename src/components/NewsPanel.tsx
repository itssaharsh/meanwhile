import { ADDED } from "@/lib/copy";
import { formatAge } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/primitives";

export type NewsItem = {
  key: string;
  place: string;
  country: string;
  headline: string;
  headlineUrl: string | null;
  at: number;
  snapshotId: string | null;
  onAir: boolean;
};

/**
 * C-16 NewsPanel — what is actually happening in the places the channel is watching.
 *
 * The headlines were already there, one at a time, at the bottom of whichever story you
 * happened to open. This is the same data gathered in one place: the point of a channel is
 * that things are going on everywhere at once, and one card at a time cannot show that.
 *
 * Every row is a real search result for that place, with the time it was published. Rows with
 * a frame behind them open it; rows from a country someone pulled up are text only.
 */
export function NewsPanel({
  items,
  now,
  loading,
  onOpen,
}: {
  items: NewsItem[];
  now: number;
  loading?: boolean;
  onOpen?: (item: NewsItem) => void;
}) {
  if (loading && !items.length) {
    return (
      <div className="flex flex-col gap-3 py-4" aria-busy="true">
        <p className="m-0 font-mono text-[11px] tracking-[0.14em] text-ink-muted uppercase">{ADDED.newsLoading.text}</p>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="mw-skeleton h-3 w-24 rounded-sm" />
            <div className="mw-skeleton h-4 w-full rounded-sm" />
          </div>
        ))}
      </div>
    );
  }

  if (!items.length) {
    return <EmptyState kind="none" region="story" title={ADDED.newsEmptyTitle.text} body={ADDED.newsEmptyBody.text} />;
  }

  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
      {items.map((n) => {
        const clickable = Boolean(n.snapshotId && onOpen);
        const Row = clickable ? "button" : "div";
        return (
          // The ON AIR chip is amber, and amber in this product means one specific frame. The row
          // has to carry that frame's id or the claim is unbound — /_kit's amber-one-frame
          // assertion fails the state outright, which is how this was caught.
          <li key={n.key} data-snapshot-id={n.snapshotId ?? undefined} className="py-3 first:pt-1">
            <Row
              {...(clickable ? { type: "button" as const, onClick: () => onOpen?.(n) } : {})}
              className={cn(
                "flex w-full flex-col items-start gap-1.5 text-left",
                clickable && "hit-44 rounded-md [transition:background-color_150ms_var(--ease-out-quint)] hover:bg-surface-2",
              )}
            >
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-place text-[14px] leading-none font-semibold text-ink">{n.place}</span>
                <span className="font-mono text-[10px] tracking-[0.12em] text-ink-muted uppercase">{n.country}</span>
                {n.onAir && n.snapshotId && (
                  <span className="rounded-sm border border-accent px-1.5 py-px font-mono text-[10px] leading-[1.4] tracking-[0.12em] text-accent uppercase">
                    {ADDED.chairOnAir.text}
                  </span>
                )}
              </span>
              <span className="font-sans text-[14px] leading-[1.45] text-ink">{n.headline}</span>
              <span className="font-mono text-[10px] tracking-[0.1em] text-ink-muted uppercase tnum">
                {formatAge(Math.max(0, now - n.at))} ago
              </span>
            </Row>
            {n.headlineUrl && (
              <a
                href={n.headlineUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block font-mono text-[10px] tracking-[0.1em] text-ink-muted underline decoration-line-strong underline-offset-[3px] uppercase hover:text-ink"
              >
                {hostOf(n.headlineUrl)}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "source";
  }
}
