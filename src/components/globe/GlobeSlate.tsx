import { cn } from "@/lib/utils";
import { ADDED } from "@/lib/copy";
import { Button } from "@/components/ui/button";

// C-02's slate: painted on the very first frame, before three.js has even been fetched, so the
// UI never waits on the canvas. On a lost GPU context it stays, with a way to restore. Nothing
// here is amber or red — a dead GPU is not a claim about the world.
export function GlobeSlate({
  state,
  onRestore,
  className,
}: {
  state: "loading" | "lost" | "unavailable";
  onRestore?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-1 px-6 text-center",
        "[background-image:linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] [background-position:center] [background-size:48px_48px]",
        className,
      )}
    >
      <p className="m-0 font-mono text-[11px] tracking-[0.14em] text-ink-muted uppercase">
        {state === "loading" ? ADDED.globeAcquiring.text : ADDED.globeLost.text}
      </p>
      {state !== "loading" && <p className="m-0 font-mono text-[11px] text-ink-muted">{ADDED.globeLostBody.text}</p>}
      {state === "lost" && (
        <Button variant="default" size="md" className="border-line-strong" onClick={onRestore}>
          {ADDED.globeRestore.text}
        </Button>
      )}
      {state === "unavailable" && <p className="m-0 font-sans text-[13px] text-ink-muted">{ADDED.globeUnavailable.text}</p>}
    </div>
  );
}
