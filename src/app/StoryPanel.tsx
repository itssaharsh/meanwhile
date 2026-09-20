import { COPY, ADDED } from "@/lib/copy";
import { formatDate } from "@/lib/format";
import { CountryFetchProgress } from "@/components/CountryFetchProgress";
import { EmptyState, VerifiedChips } from "@/components/primitives";
import { StoryCard } from "@/components/StoryCard";
import { Button } from "@/components/ui/button";
import type { CountryFetch } from "./useCountryFetch";

// The Story tab's live contents: C-08 while the ladder runs, then C-04 for a frame, or the
// C-11 block that matches what actually failed. Every claim here comes from the row's counts.
export function StoryPanel({
  fetch: f,
  now,
  onAirId,
  onRetry,
  onPickCountry,
}: {
  fetch: CountryFetch;
  now: number;
  onAirId: string | null;
  onRetry?: () => void;
  onPickCountry?: (country: string) => void;
}) {
  const { row, outcome, story, chips, counts, country, timedOut } = f;

  if (!country || !row) {
    return <EmptyState kind="first" region="story" title={ADDED.storyFirstTitle.text} body={ADDED.storyFirstBody.text} />;
  }

  // Still running: one named stage at a time, never a spinner.
  if (!outcome) return <CountryFetchProgress row={row} />;

  if (story) return <StoryCard story={story} now={now} onAirId={onAirId} />;

  const chipRow = chips.length > 0 ? <VerifiedChips chips={chips} now={now} onPick={onPickCountry} /> : undefined;
  const offer = chipRow ? { chipsLabel: ADDED.tryThese.text, chips: chipRow } : {};

  if (outcome === "error") {
    // A client-side stop after 30 s of silence is the one failure we can name precisely.
    return (
      <EmptyState
        kind="error"
        region="country"
        title={ADDED.countryErrorTitle.text(country)}
        body={timedOut ? ADDED.countryErrorBody.text : COPY.errors.generic.body}
        action={{ label: ADDED.countryErrorAction.text(country), onClick: onRetry }}
        {...offer}
      />
    );
  }

  const n = counts?.n ?? 0;
  const stale = counts?.stale ?? 0;
  const misplaced = counts?.misplaced ?? 0;
  const pages = counts?.pages ?? 0;

  // Nothing served a frame at all.
  if (n === 0) {
    return (
      <EmptyState
        kind="none"
        region="country"
        title={COPY.countryEmpty.noCameraTitle(country)}
        body={COPY.countryEmpty.noCameraBody(pages, country)}
        action={{ label: COPY.countryEmpty.noCameraAction(country), onClick: onRetry }}
        {...offer}
      />
    );
  }

  // Every frame was too old.
  if (stale > 0 && misplaced === 0) {
    return (
      <EmptyState
        kind="none"
        region="country"
        title={COPY.countryEmpty.staleTitle(n, country)}
        body={counts?.oldestAt ? COPY.countryEmpty.staleBody(n, formatDate(counts.oldestAt), country) : undefined}
        action={{ label: COPY.countryEmpty.staleAction(country), onClick: onRetry }}
        {...offer}
      />
    );
  }

  // Every frame was filmed somewhere else. The body names where one of them actually was, but
  // only when the narrator could name it — otherwise the sentence ends at "somewhere else".
  if (misplaced > 0 && stale === 0) {
    return (
      <EmptyState
        kind="none"
        region="country"
        title={COPY.countryEmpty.misplacedTitle(country)}
        body={COPY.countryEmpty.misplacedBody(n, misplaced, counts?.elsewhere ?? null)}
        action={{ label: COPY.countryEmpty.misplacedAction(country), onClick: onRetry }}
        {...offer}
      />
    );
  }

  // Some stale, some elsewhere: no COPY title states that, so the line that does is the
  // reconciling count itself (COPY §3).
  return (
    <EmptyState
      kind="none"
      region="country"
      title={COPY.fetch.rejected(stale + misplaced, n, stale, misplaced, country)}
      action={{ label: COPY.countryEmpty.noCameraAction(country), onClick: onRetry }}
      {...offer}
    >
      {!chipRow && onRetry && (
        <Button variant="quiet" size="md" onClick={onRetry}>
          {ADDED.openList.text}
        </Button>
      )}
    </EmptyState>
  );
}
