import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal, components } from "./_generated/api";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { envOrNull } from "./lib";

const http = httpRouter();

// ---------------------------------------------------------------------------
// AgentMail delivery webhook: message.delivered / message.bounced / message.rejected.
// Register it at  https://<your-deployment>.convex.site/agentmail/webhook
// ---------------------------------------------------------------------------
// AgentMail delivers webhooks through Svix. Every request is signed, and this endpoint
// refuses anything it can't verify: the whole point is a DEFINITIVE answer to "did the
// email arrive?", and an unauthenticated endpoint would let anyone log a fake "delivered".
const MAX_SKEW_S = 5 * 60; // Svix's own replay window

// Returns a real ArrayBuffer: TypeScript 5.7+ won't accept a Uint8Array<ArrayBufferLike>
// as an HMAC key (BufferSource).
function base64ToBytes(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// Constant-time comparison, so a forger learns nothing from response timing.
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Svix: HMAC-SHA256 over `${id}.${timestamp}.${rawBody}`, keyed with the base64-decoded
// secret after its "whsec_" prefix; the header holds space-separated "v1,<base64>" entries.
async function verifySvix(secret: string, request: Request, raw: string): Promise<string | null> {
  const id = request.headers.get("svix-id") ?? request.headers.get("webhook-id");
  const ts = request.headers.get("svix-timestamp") ?? request.headers.get("webhook-timestamp");
  const sig = request.headers.get("svix-signature") ?? request.headers.get("webhook-signature");
  if (!id || !ts || !sig) return "missing signature headers";

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > MAX_SKEW_S) {
    return "timestamp outside the replay window";
  }

  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(secret.replace(/^whsec_/, "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${raw}`));
  const expected = bytesToBase64(new Uint8Array(mac));

  const ok = sig.split(" ").some((part) => {
    const [version, value] = part.split(",");
    return version === "v1" && typeof value === "string" && sameString(value, expected);
  });
  return ok ? null : "signature mismatch";
}

// Event payloads carry their data in an event-specific object (`delivery`, `bounce`, …),
// so look for the message id wherever it sits rather than hard-coding one shape.
function findMessageId(v: unknown, depth = 0): string | undefined {
  if (!v || typeof v !== "object" || depth > 3) return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.message_id === "string") return o.message_id;
  for (const k of Object.keys(o)) {
    const found = findMessageId(o[k], depth + 1);
    if (found) return found;
  }
  return undefined;
}

function findRecipients(v: unknown, depth = 0): string[] {
  if (!v || typeof v !== "object" || depth > 3) return [];
  const o = v as Record<string, unknown>;
  for (const k of ["recipients", "to"]) {
    const r = o[k];
    if (Array.isArray(r)) {
      return r
        .map((x) => (typeof x === "string" ? x : (x as any)?.address ?? (x as any)?.email))
        .filter((x): x is string => typeof x === "string");
    }
  }
  for (const k of Object.keys(o)) {
    const found = findRecipients(o[k], depth + 1);
    if (found.length) return found;
  }
  return [];
}

http.route({
  path: "/agentmail/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const raw = await request.text();

    const secret = envOrNull("AGENTMAIL_WEBHOOK_SECRET");
    if (!secret) {
      // 503, not 200: Svix retries, so an event that lands before the secret is set is
      // delivered again later instead of being lost.
      console.warn("[meanwhile] agentmail webhook: AGENTMAIL_WEBHOOK_SECRET not set — refusing unverified event");
      return new Response("webhook secret not configured", { status: 503 });
    }
    const problem = await verifySvix(secret, request, raw);
    if (problem) {
      console.warn(`[meanwhile] agentmail webhook: rejected (${problem})`);
      return new Response("invalid signature", { status: 401 });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response("body is not JSON", { status: 400 });
    }
    const b = (body ?? {}) as Record<string, unknown>;
    const eventType = typeof b.event_type === "string" ? b.event_type : null;
    const eventId = typeof b.event_id === "string" ? b.event_id : null;
    if (!eventType || !eventId) return new Response("missing event_type / event_id", { status: 400 });

    const messageId = findMessageId(b);
    const recipients = findRecipients(b);
    // The event's own object — delivery / bounce / rejection details — kept short.
    const own = Object.entries(b).find(([k, v]) => k !== "event_type" && k !== "event_id" && v && typeof v === "object");
    const detail = own ? JSON.stringify({ [own[0]]: own[1] }).slice(0, 1500) : undefined;

    console.log(
      `[meanwhile] agentmail ${eventType} — message_id ${messageId ?? "(none)"} ` +
        `to ${recipients.join(", ") || "(unknown)"} (event ${eventId})`,
    );
    await ctx.runMutation(internal.agentmail.recordEvent, {
      eventType,
      eventId,
      messageId,
      recipients,
      detail,
    });
    return new Response("ok", { status: 200 });
  }),
});

// The built frontend (dist/), uploaded with `npx @convex-dev/static-hosting upload`.
// Registered after the webhook so the static catch-all can't shadow it.
registerStaticRoutes(http, components.staticHosting);

export default http;
