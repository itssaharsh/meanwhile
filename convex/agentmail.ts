import { mutation, query, internalAction, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { envOrNull, missingKey, escapeHtml } from "./lib";

// The ONE outward write in the whole app -> gated behind an explicit subscribe.
//
// It is still a public, unauthenticated mutation that mails whatever address it is
// handed, so it gets: format validation, per-address dedupe, and a global rate limit.
// That is proportionate to a demo — it is NOT double opt-in, and anyone who can reach
// the deployment can still cause mail to be sent to an address they typed.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;

export const subscribe = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    // Say so up front if this deployment can't send. Returning ok here made the button
    // show "✓ sent" while the scheduled send quietly skipped for want of a key.
    if (!envOrNull("AGENTMAIL_KEY") || !envOrNull("AGENTMAIL_INBOX")) {
      return { ok: false, error: "email isn't set up on this deployment yet" };
    }
    const addr = email.trim().toLowerCase();
    if (!EMAIL_RE.test(addr) || addr.length > 254) {
      return { ok: false, error: "that doesn't look like an email address" };
    }

    const gate = await ctx.runMutation(internal.limits.take, {
      key: "subscribe",
      limit: LIMIT,
      windowMs: WINDOW_MS,
    });
    if (!gate.ok) return { ok: false, error: "too many subscriptions right now — try again later" };

    const existing = await ctx.db
      .query("subscribers")
      .withIndex("by_email", (q) => q.eq("email", addr))
      .first();
    if (!existing) {
      await ctx.db.insert("subscribers", { email: addr, confirmed: true, at: Date.now() });
    }

    // Send the current best moment right away as a confirmation.
    await ctx.scheduler.runAfter(0, internal.agentmail.sendBestTo, { email: addr });
    return { ok: true };
  },
});

/** Remember which message a subscriber is waiting on. */
export const noteSend = internalMutation({
  args: { email: v.string(), messageId: v.string() },
  handler: async (ctx, { email, messageId }): Promise<void> => {
    const row = await ctx.db
      .query("subscribers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (row) await ctx.db.patch(row._id, { lastMessageId: messageId, lastSentAt: Date.now() });
  },
});

/**
 * What actually happened to the mail we just sent, for C-09's delivery chip.
 *
 * The states are the ones AgentMail can actually prove, and no more: queued until the send
 * call returns, accepted once it has a message id, then whatever the webhook says. "Delivered"
 * here means the recipient's mail server accepted it — not that a human has seen it, which is
 * why the copy never says "Delivered" on its own.
 */
export const deliveryFor = query({
  args: { email: v.string() },
  handler: async (
    ctx,
    { email },
  ): Promise<{ status: "queued" | "accepted" | "delivered" | "bounced" | "unconfirmed"; messageId: string; at: number } | null> => {
    const addr = email.trim().toLowerCase();
    const sub = await ctx.db
      .query("subscribers")
      .withIndex("by_email", (q) => q.eq("email", addr))
      .first();
    if (!sub) return null;
    if (!sub.lastMessageId) return { status: "queued", messageId: "", at: sub.at };

    const events = await ctx.db
      .query("mailEvents")
      .withIndex("by_messageId", (q) => q.eq("messageId", sub.lastMessageId))
      .collect();
    const latest = events.sort((a, b) => b.at - a.at)[0];
    if (!latest) {
      // Accepted by AgentMail. Without the webhook secret no event can ever arrive, so after a
      // couple of minutes say we cannot confirm rather than leaving a spinner on "accepted".
      const waited = Date.now() - (sub.lastSentAt ?? sub.at);
      return { status: waited > 120_000 ? "unconfirmed" : "accepted", messageId: sub.lastMessageId, at: sub.lastSentAt ?? sub.at };
    }
    const type = latest.eventType.toLowerCase();
    const status = type.includes("delivered")
      ? "delivered"
      : type.includes("bounce") || type.includes("reject") || type.includes("fail")
        ? "bounced"
        : "accepted";
    return { status, messageId: sub.lastMessageId, at: latest.at };
  },
});

// Called by the signed webhook in http.ts. Svix retries deliveries, so an event id that is
// already recorded is ignored rather than stored twice.
export const recordEvent = internalMutation({
  args: {
    eventType: v.string(),
    eventId: v.string(),
    messageId: v.optional(v.string()),
    recipients: v.array(v.string()),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const seen = await ctx.db
      .query("mailEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", a.eventId))
      .first();
    if (seen) return { duplicate: true };
    await ctx.db.insert("mailEvents", { ...a, at: Date.now() });
    return { duplicate: false };
  },
});

export const currentBest = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cut = (await ctx.db.query("cut").order("desc").take(1))[0];
    if (!cut) return null;
    const snap = await ctx.db.get(cut.snapshotId);
    if (!snap) return null;
    const cam = await ctx.db.get(snap.cameraId);
    const url = snap.storageId ? await ctx.storage.getUrl(snap.storageId) : snap.imageUrl;
    return { caption: snap.caption, score: snap.score, place: cam?.name, country: cam?.country, url };
  },
});

// Returns AgentMail's ids for the sent message, so a send can be traced end to end.
//   npx convex run agentmail:sendBestTo '{"email":"you@example.com"}'
export const sendBestTo = internalAction({
  args: { email: v.string() },
  handler: async (ctx, { email }): Promise<{ messageId: string | null; threadId: string | null } | null> => {
    const key = envOrNull("AGENTMAIL_KEY");
    if (!key) {
      missingKey("AGENTMAIL_KEY", `email to ${email}`);
      return null;
    }
    // No default: the scaffold fell back to the literal "meanwhile@agentmail.to", an
    // inbox you almost certainly don't own, which just 404s.
    const inbox = envOrNull("AGENTMAIL_INBOX");
    if (!inbox) {
      missingKey("AGENTMAIL_INBOX", `email to ${email}`);
      return null;
    }

    const best = await ctx.runQuery(internal.agentmail.currentBest, {});
    if (!best) {
      console.warn(`[meanwhile] nothing to send to ${email} yet — no cut has been picked`);
      return null;
    }

    // The caption is model-generated from an image anyone can point a camera at, so it
    // is escaped rather than interpolated raw.
    const place = escapeHtml(best.place ?? "Somewhere");
    const country = escapeHtml(best.country ?? "");
    const caption = escapeHtml(best.caption ?? "");
    const html =
      `<h2>Right now on Earth</h2>` +
      `<p><b>${place}, ${country}</b> — ${caption} (${best.score}/10)</p>` +
      (best.url ? `<img src="${escapeHtml(best.url)}" width="480" style="border-radius:12px"/>` : "");

    // The sender name can't be set per message. AgentMail writes the From line from the
    // inbox's display_name; a From passed in `headers` is accepted, stored on the message
    // record, and not used (checked against the raw .eml of a real send). To change the
    // name, rename the inbox: PATCH /v0/inboxes/{inbox} {"display_name": "..."}.
    let sent: Response;
    try {
      sent = await fetch(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inbox)}/messages/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          subject: `Meanwhile — ${best.place} right now`,
          html,
          text: `${best.place}, ${best.country} — ${best.caption} (${best.score}/10)${best.url ? `\n${best.url}` : ""}`,
        }),
      });
    } catch (e) {
      console.error(`[meanwhile] agentmail send to ${email} threw:`, e);
      return null;
    }
    if (!sent.ok) {
      console.error(`[meanwhile] agentmail send to ${email} failed: HTTP ${sent.status} ${(await sent.text().catch(() => "")).slice(0, 300)}`);
      return null;
    }
    const body: any = await sent.json().catch(() => null);
    const messageId: string | null = body?.message_id ?? null;
    const threadId: string | null = body?.thread_id ?? null;
    console.log(`[meanwhile] emailed ${email} — message_id ${messageId ?? "(not returned)"}, thread_id ${threadId ?? "-"}`);
    // The chip follows this id; without it the UI could only ever claim "sent".
    if (messageId) await ctx.runMutation(internal.agentmail.noteSend, { email, messageId });
    return { messageId, threadId };
  },
});
