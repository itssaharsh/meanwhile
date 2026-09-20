import { useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { convex } from "@/lib/convex";
import type { SubscribeState } from "@/components/SubscribeSheet";
import type { MailState } from "@/lib/types";
import { DEMO } from "./useChannel";

/**
 * "Send me this", end to end.
 *
 * The chip that follows is driven by AgentMail's own webhook rather than by the send call
 * returning 200 — a send that was accepted and then bounced is a failure the viewer should see,
 * and claiming success at submit time would hide exactly that.
 */
export function useSubscribe() {
  const subscribe = useMutation(api.agentmail.subscribe);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SubscribeState>("idle");
  const [email, setEmail] = useState("");

  // Only once an address has been submitted: until then there is nothing to follow.
  const delivery = useQuery(
    api.agentmail.deliveryFor,
    DEMO || !convex || !email || state === "idle" ? "skip" : { email },
  );

  const submit = useCallback(
    (address: string) => {
      setEmail(address);
      setState("sending");
      subscribe({ email: address })
        .then((r) => setState(r?.ok ? "success" : "error"))
        .catch(() => setState("error"));
    },
    [subscribe],
  );

  const mail: MailState | undefined = delivery
    ? { status: delivery.status, messageId: delivery.messageId, at: delivery.at }
    : state === "success"
      ? { status: "queued", messageId: "", at: Date.now() }
      : undefined;

  return {
    open,
    state,
    email,
    mail,
    submit,
    show: () => {
      setState("idle");
      setOpen(true);
    },
    close: () => setOpen(false),
  };
}
