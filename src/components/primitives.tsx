import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatAge, freshness, freshnessText, isVerified } from "@/lib/format";
import { ADDED } from "@/lib/copy";
import type { VerifiedChip } from "@/lib/types";

// ----------------------------------------------------------------------------------------
// Freshness chip (C-04). Teal only when the SOURCE's timestamp is under 3 h old; otherwise
// transparent on a line border in --ink-muted. No amber, no red, no yellow: staleness is the
// absence of teal. The chip is a claim, so it reaches a screen reader as a status.
// ----------------------------------------------------------------------------------------
export function FreshnessChip({ capturedAt, now, className }: { capturedAt: number | null; now: number; className?: string }) {
  const f = freshness(capturedAt, now);
  const verified = isVerified(f);
  return (
    <span
      role="status"
      data-verified={verified}
      className={cn(
        "inline-flex min-h-6 max-w-full items-center self-start rounded-sm border px-2 py-[3px] font-mono text-[11px] leading-[1.3] font-normal tracking-[0.12em] uppercase tnum",
        verified
          ? "border-[color-mix(in_oklab,var(--live)_40%,transparent)] bg-[color-mix(in_oklab,var(--live)_12%,transparent)] text-live"
          : "border-line bg-transparent text-ink-muted",
        className,
      )}
    >
      {freshnessText(f)}
    </span>
  );
}

/** 4px teal dot: present only for a verified-fresh frame. No grey dot substitutes for it. */
export const LiveDot = ({ className }: { className?: string }) => (
  <span aria-hidden="true" className={cn("inline-block size-1 shrink-0 rounded-full bg-live", className)} />
);

/** Surface-2 blocks shaped like the real layout, pulsing opacity .55 ↔ 1 over 1400ms. */
export function Skeleton({ className, pulse = true }: { className?: string; pulse?: boolean }) {
  return <span aria-hidden="true" data-pulse={pulse} className={cn("mw-skeleton block", className)} />;
}

// ----------------------------------------------------------------------------------------
// The three-verified-countries row (C-11). Populated from countries.verifiedNow(); renders
// however many it gets and never pads with unverified suggestions, because a teal dot is a claim.
// ----------------------------------------------------------------------------------------
export function VerifiedChips({ chips, now, onPick }: { chips: VerifiedChip[]; now: number; onPick?: (country: string) => void }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <button
          key={c.country}
          type="button"
          onClick={() => onPick?.(c.country)}
          aria-label={ADDED.verifiedChipAria.text(c.country, formatAge(now - c.capturedAt))}
          className={cn(
            "hit-44 inline-flex h-8 items-center gap-1.5 rounded-sm border border-line bg-surface-2 px-2.5",
            "[transition:border-color_150ms_var(--ease-out-quint),transform_120ms_var(--ease-out-quint)] hover:border-line-strong active:scale-[.985] motion-reduce:active:scale-100",
          )}
        >
          <LiveDot />
          <span className="font-place text-[13px] font-semibold text-ink">{c.country}</span>
          <span className="font-mono text-[10px] text-ink-muted tnum">{formatAge(now - c.capturedAt)}</span>
        </button>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------------------
// C-11 EmptyState — one primitive, four regions × three kinds. No box, no card, no icon, no
// emoji: a 24px rule line is the only ornament. Error adds a 2px --danger left border; first-run
// and no-result get no colour at all, because nothing has gone wrong.
// ----------------------------------------------------------------------------------------
export type EmptyKind = "first" | "none" | "error";
export type EmptyRegion = "rail" | "story" | "chat" | "country";

export function EmptyState({
  kind,
  region,
  title,
  body,
  status,
  action,
  chips,
  chipsLabel,
  children,
  className,
}: {
  kind: EmptyKind;
  region: EmptyRegion;
  title: string;
  body?: string;
  /** A second, mono line under the body (e.g. "Reconnecting · attempt 2 of 5"). */
  status?: string;
  action?: { label: string; onClick?: () => void; busy?: boolean; busyLabel?: string };
  chips?: ReactNode;
  chipsLabel?: string;
  children?: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const isRail = region === "rail";
  const error = kind === "error";

  return (
    <div
      role={error ? "alert" : "status"}
      aria-labelledby={titleId}
      data-kind={kind}
      data-region={region}
      className={cn(
        "flex",
        isRail
          ? "h-full items-center gap-5 px-5 max-sm:px-3"
          : "h-full w-full flex-col justify-center gap-2 p-5 max-sm:justify-start",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col gap-2",
          !isRail && "mx-auto w-full max-w-[30ch] max-sm:mx-0 max-sm:max-w-none",
          isRail && "min-w-0 max-w-[52ch]",
          error && "border-l-2 border-danger pl-3",
        )}
      >
        <span aria-hidden="true" className="block h-px w-6 bg-line-strong" />
        <h3 id={titleId} className="m-0 font-display text-[14px] leading-[1.3] font-semibold text-ink">
          {title}
        </h3>
        {body && (
          <p className={cn("m-0 font-sans text-[13px] leading-[1.5] text-ink-muted", isRail && "max-sm:hidden")}>{body}</p>
        )}
        {status && <p className="m-0 font-mono text-[11px] text-ink-muted tnum">{status}</p>}
        {!isRail && (action || chips || children) && (
          <div className="mt-2 flex flex-col items-start gap-2">
            {chipsLabel && chips && <span className="font-sans text-[13px] text-ink-muted">{chipsLabel}</span>}
            {chips}
            {action && <EmptyAction {...action} />}
            {children}
          </div>
        )}
      </div>
      {isRail && action && <EmptyAction {...action} />}
    </div>
  );
}

function EmptyAction({ label, onClick, busy, busyLabel }: { label: string; onClick?: () => void; busy?: boolean; busyLabel?: string }) {
  return (
    <Button
      variant="default"
      size="md"
      onClick={onClick}
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      focusableWhenDisabled
    >
      {busy ? (busyLabel ?? ADDED.retrying.text) : label}
    </Button>
  );
}
