import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { COPY, ADDED } from "@/lib/copy";
import { formatUtcTime } from "@/lib/format";
import { useReduced } from "@/lib/hooks";
import type { MailState } from "@/lib/types";

const E = [0.22, 1, 0.36, 1] as const;

export function deliveryText(m: MailState): string {
  const t = formatUtcTime(m.at);
  switch (m.status) {
    case "queued":
      return COPY.send.chipQueued(t);
    case "accepted":
      return COPY.send.chipAccepted(t);
    case "delivered":
      return COPY.send.chipHanded(t);
    case "bounced":
      return ADDED.mailBounced.text(t);
    case "unconfirmed":
      return ADDED.mailUnconfirmed.text;
  }
}

const TONE: Record<MailState["status"], string> = {
  queued: "border-line text-ink-muted",
  accepted: "border-line-strong text-ink",
  delivered: "border-[color-mix(in_oklab,var(--success)_45%,transparent)] text-success",
  bounced: "border-[color-mix(in_oklab,var(--danger)_50%,transparent)] text-danger",
  unconfirmed: "border-line text-ink-muted",
};

// C-09 DeliveryChip — driven only by recorded mailEvents; never optimistic. Teal is never used
// here: --live means frame freshness and nothing else. The mail provider accepting a message is
// as far as anyone can see, so the last step says "handed to your mail server", in --success.
export function DeliveryChip({ mail, docked = false, reduced: forceReduced }: { mail: MailState; docked?: boolean; reduced?: boolean }) {
  const reduced = useReduced(forceReduced);
  const text = deliveryText(mail);

  const chip = (
    <motion.span
      layout={!reduced}
      transition={{ layout: { duration: 0.2, ease: E } }}
      className={cn(
        "inline-flex h-[26px] max-w-full items-center overflow-hidden rounded-sm border bg-transparent px-2 font-mono text-[10px] leading-none font-normal tracking-[0.12em] whitespace-nowrap uppercase tnum",
        reduced ? "" : "[transition:border-color_200ms_var(--ease-out-quint),color_200ms_var(--ease-out-quint)]",
        TONE[mail.status],
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          className="block truncate"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1, transition: reduced ? { duration: 0 } : { duration: 0.14, delay: 0.06 } }}
          exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.1 } }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );

  if (docked) {
    return (
      <button type="button" title={mail.messageId} className="hit-44 inline-flex max-w-[42vw] items-center rounded-sm" aria-live="polite" aria-atomic="true">
        {chip}
      </button>
    );
  }
  return (
    <span role="status" aria-live="polite" aria-atomic="true" title={mail.messageId} className="inline-flex max-w-full">
      {chip}
    </span>
  );
}
