import { useId, useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import { COPY, ADDED } from "@/lib/copy";
import type { MailState, Snapshot } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DeliveryChip } from "./DeliveryChip";

export type SubscribeState = "idle" | "invalid" | "sending" | "success" | "error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// C-09 SubscribeSheet — the one modal in the product: short, explicit, user-initiated. Its
// submit is not amber, because sending is not being on air.
export function SubscribeForm({
  onAir,
  state: forced,
  email: initialEmail = "",
  mail,
  inline = false,
  onSubmit,
  onDone,
}: {
  onAir: Snapshot | null;
  state?: SubscribeState;
  email?: string;
  mail?: MailState;
  /** Render as plain content (for /_kit) instead of inside the Dialog's title/description slots. */
  inline?: boolean;
  onSubmit?: (email: string) => void;
  onDone?: () => void;
}) {
  const id = useId();
  const [email, setEmail] = useState(initialEmail);
  const [blurred, setBlurred] = useState(forced === "invalid");
  const valid = EMAIL_RE.test(email.trim());
  const nothingOnAir = !onAir;
  const state = forced ?? "idle";
  const showInvalid = state === "invalid" || (blurred && email.length > 0 && !valid);
  // Two messages, because "missing an @" is a different mistake from "half an address", and
  // being told the wrong one is worse than being told nothing.
  const invalidMessage = email.includes("@") ? COPY.send.invalidOther : COPY.send.invalid;
  const disabled = nothingOnAir || !valid || state === "sending";

  const Title = inline ? "h2" : DialogTitle;
  const Desc = inline ? "p" : DialogDescription;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    onSubmit?.(email.trim());
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <Title className="m-0 font-display text-[17px] leading-[1.3] font-semibold text-ink">{COPY.send.title}</Title>
        <Desc className="m-0 font-sans text-[13px] leading-[1.5] text-ink-muted">{COPY.send.body}</Desc>
      </div>

      {onAir?.frameUrl && (
        <figure className="m-0 flex flex-col gap-1.5">
          <img src={onAir.frameUrl} alt="" className="aspect-video w-full rounded-md border border-line object-cover" />
          <figcaption className="font-place text-[14px] font-semibold text-ink">
            {onAir.place.name}, {onAir.place.country}
          </figcaption>
        </figure>
      )}

      {state === "success" && mail ? (
        <div className="flex flex-col gap-2.5">
          <p className="m-0 font-sans text-[14px] text-ink">{COPY.send.successTitle(email)}</p>
          <div>
            <DeliveryChip mail={mail} />
          </div>
          {/* Only while the message can still arrive: a bounce means it won't be in Promotions or Spam either. */}
          {mail.status !== "bounced" && <p className="m-0 font-sans text-[12px] leading-[1.5] text-ink-muted">{COPY.send.successBody}</p>}
          {mail.status === "delivered" && <p className="m-0 font-sans text-[12px] leading-[1.5] text-ink-muted">{COPY.send.trailing}</p>}
          <Button variant="default" size="lg" className="w-full max-sm:h-12" onClick={onDone}>
            {ADDED.mailDone.text}
          </Button>
        </div>
      ) : (
        <form className="flex flex-col gap-2.5" onSubmit={submit} noValidate>
          <label htmlFor={`${id}-email`} className="font-sans text-[13px] font-medium text-ink">
            {COPY.send.inputLabel}
          </label>
          <input
            id={`${id}-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={COPY.send.placeholder}
            value={email}
            readOnly={state === "sending"}
            aria-invalid={showInvalid || undefined}
            aria-describedby={showInvalid ? `${id}-hint` : nothingOnAir ? `${id}-none` : undefined}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setBlurred(true)}
            className={cn(
              "h-12 w-full rounded-md border bg-surface-2 px-3 font-sans text-[16px] text-ink outline-offset-2 placeholder:text-ink-muted max-sm:h-[52px]",
              "[transition:border-color_150ms_var(--ease-out-quint)] hover:border-line-strong",
              showInvalid ? "border-danger" : "border-line",
            )}
          />
          {showInvalid && (
            <p id={`${id}-hint`} className="m-0 font-sans text-[12px] text-ink-muted">
              {invalidMessage}
            </p>
          )}
          {nothingOnAir && (
            <p id={`${id}-none`} className="m-0 font-sans text-[12px] text-ink-muted">
              {COPY.rail.firstRunTitle}
            </p>
          )}
          {state === "error" && (
            <div role="alert" className="flex flex-col gap-1 border-l-2 border-danger pl-3">
              <p className="m-0 font-display text-[14px] font-semibold text-ink">{COPY.errors.generic.title}</p>
              <p className="m-0 font-sans text-[13px] leading-[1.5] text-ink-muted">{COPY.errors.generic.body}</p>
            </div>
          )}
          <Button
            type="submit"
            variant="strong"
            size="lg"
            aria-disabled={disabled || undefined}
            aria-busy={state === "sending" || undefined}
            focusableWhenDisabled
            className="w-full max-sm:h-12"
          >
            {state === "sending" ? COPY.send.sending : state === "error" ? COPY.errors.generic.action : COPY.send.button}
          </Button>
        </form>
      )}
    </>
  );
}

export function SubscribeSheet({
  open,
  onOpenChange,
  ...form
}: Parameters<typeof SubscribeForm>[0] & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <SubscribeForm {...form} />
      </DialogContent>
    </Dialog>
  );
}
