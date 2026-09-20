import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { ADDED } from "@/lib/copy";
import { formatCoord, formatUtcTime } from "@/lib/format";
import type { Snapshot } from "@/lib/types";
import { FreshnessChip } from "@/components/primitives";
import { Button } from "@/components/ui/button";

/**
 * C-04's frame at full size — UI-SPEC: "clicking opens the frame at full size in a Base UI
 * Dialog (modal is fine here; it is an explicit user action and the globe is behind it, not
 * being hidden from a cut — the dialog is 80vw max and the TopBar stays visible above it)."
 *
 * The card's frame is 348px wide inside the dock, which is smaller than most of these cameras
 * actually shoot. This is where a judge can see that the picture is a real webcam and not a
 * render: the timestamp burned into the corner by the camera itself, the weather, the people.
 *
 * The freshness claim travels with the frame. A bigger picture is a stronger claim, so the
 * chip that qualifies it has to be on the same screen.
 */
export function FrameDialog({ story, now, onOpenChange }: { story: Snapshot | null; now: number; onOpenChange: (open: boolean) => void }) {
  return (
    <DialogPrimitive.Root open={Boolean(story?.frameUrl)} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={
            "fixed inset-x-0 top-[var(--topbar-h)] bottom-0 z-50 bg-[color-mix(in_oklab,var(--canvas)_86%,transparent)] " +
            "[transition:opacity_200ms_var(--ease-out-quint)] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
          }
        />
        <DialogPrimitive.Popup
          className={
            "fixed inset-x-4 inset-y-0 z-50 mx-auto my-auto flex h-fit max-h-[calc(100dvh-var(--topbar-h)-32px)] w-fit max-w-[min(80vw,1200px)] flex-col gap-3 " +
            "rounded-lg border border-line bg-surface-1 p-3 text-ink outline-none max-sm:max-w-none max-sm:p-2 " +
            "[transition:opacity_200ms_var(--ease-out-quint),scale_200ms_var(--ease-out-quint)] data-[starting-style]:scale-[.985] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 " +
            "motion-reduce:[transition:opacity_120ms_linear] motion-reduce:data-[starting-style]:scale-100"
          }
        >
          {story && (
            <>
              <img
                src={story.frameUrl!}
                alt={story.caption}
                className="max-h-[calc(100dvh-var(--topbar-h)-140px)] w-auto max-w-full rounded-md object-contain"
              />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <DialogPrimitive.Title className="m-0 font-place text-[17px] leading-none font-semibold text-ink">{story.place.name}</DialogPrimitive.Title>
                <FreshnessChip capturedAt={story.capturedAt} now={now} />
                <span className="font-mono text-[11px] text-ink-muted tnum">
                  {formatCoord(story.place.lat)}, {formatCoord(story.place.lon)}
                  {story.capturedAt != null && ` · ${formatUtcTime(story.capturedAt)} UTC`}
                </span>
                <DialogPrimitive.Close
                  render={
                    <Button variant="icon" size="icon" aria-label={ADDED.dockClose.text} className="ml-auto">
                      <XIcon className="size-4" strokeWidth={2} />
                    </Button>
                  }
                />
              </div>
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
