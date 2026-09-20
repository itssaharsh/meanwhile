import OpenAI from "openai";
import { resolveChain, describe, scrub, type VisionOverride, type Resolved } from "./providers";

// One vision call, spoken to whichever OpenAI-compatible provider is configured — with
// model failover for providers that have a chain (Gemini).
//
// Two nested loops:
//   outer: MODELS. Preferred model first, then the provider's chain, each validated
//          against the live /models list. Quota / retired / overloaded -> next model.
//   inner: STRUCTURED OUTPUT. json_schema -> json_object -> prompt-only, per model.
// A genuine 400 (bad image, bad request) does NOT rotate: it would fail on every model,
// so it is surfaced immediately instead of burning the chain.
//
// Pure module (no ./_generated imports). Persistence is injected via `state`, so this file
// never touches the database itself and can't create a type-inference cycle.

export type ModelMark = { model: string; until: number; reason: string };

// How the caller lets failover remember exhausted models across calls.
export type ModelStateStore = {
  blocked: (provider: string, keyTag: string) => Promise<ModelMark[]>;
  mark: (provider: string, keyTag: string, mark: ModelMark) => Promise<void>;
};

export type Attempt = { model: string; outcome: string };

export type VisionResult = {
  text: string;
  provider: Resolved;
  model: string;
  attempts: Attempt[];
} | null;

type Args = {
  label: string; // for logs only — never a key
  system: string;
  text: string;
  dataUri: string;
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  override?: VisionOverride;
  maxTokens?: number;
  state?: ModelStateStore;
};

// ---------------------------------------------------------------------------
// Live model discovery
// ---------------------------------------------------------------------------
// /models on Gemini's compat endpoint returns ids and display names only — no quotas, no
// capability flags. So discovery answers "does this id exist?", a name filter removes
// everything that isn't a vision-in / text-out chat model, and anything with a ZERO quota
// is found at call time (it answers 429 with `limit: 0`) and marked like any other
// exhausted model. Listing is also not proof of life: gemini-2.5-pro is on the list and
// still answers 404 "no longer available to new users" — the runtime 404 path covers it.
const NOT_VISION_CHAT =
  /gemma|embed|tts|image|imagen|live|veo|aqa|audio|transcribe|robotics|computer-use|learnlm|lyria|nano-banana|deep-research/i;

const MODELS_TTL_MS = 60 * 60 * 1000;
const modelCache = new Map<string, { at: number; ids: Set<string> }>();
// So "not on the live list" is said once per list refresh, not on every one of ~790
// daily calls.
const reportedMissing = new Set<string>();

async function liveModels(client: OpenAI, cacheKey: string): Promise<Set<string> | null> {
  const hit = modelCache.get(cacheKey);
  if (hit && Date.now() - hit.at < MODELS_TTL_MS) return hit.ids;
  try {
    const page: any = await client.models.list();
    const ids = new Set<string>();
    for (const m of page?.data ?? []) {
      const id = String(m?.id ?? "").replace(/^models\//, "");
      if (id && !NOT_VISION_CHAT.test(id)) ids.add(id);
    }
    if (!ids.size) return null;
    modelCache.set(cacheKey, { at: Date.now(), ids });
    reportedMissing.clear(); // a fresh list may have changed what's missing
    return ids;
  } catch (err: any) {
    console.warn(`[meanwhile] could not list models (${err?.status ?? "no status"}) — using the chain unvalidated`);
    return null;
  }
}

function buildChain(p: Resolved, live: Set<string> | null): string[] {
  const wanted = [p.preferredModel, ...(p.chain ?? [p.defaultModel])].filter(
    (m, i, all): m is string => Boolean(m) && all.indexOf(m) === i,
  );
  if (!live) return wanted;

  const present = wanted.filter((m) => live.has(m));
  const fresh = wanted.filter((m) => !live.has(m) && !reportedMissing.has(m));
  if (fresh.length) {
    fresh.forEach((m) => reportedMissing.add(m));
    console.log(`[meanwhile] not on ${p.label}'s live model list, skipped: ${fresh.join(", ")}`);
  }
  // Nothing survived validation: the list is probably wrong rather than every model gone.
  return present.length ? present : wanted;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------
type Verdict =
  | { kind: "format" } // this response_format isn't supported: step down, same model
  | { kind: "rotate"; mark?: { until: number; reason: string } } // try the next model
  | { kind: "surface" }; // would fail on every model: stop

function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

function retryDelayMs(blob: string): number {
  const m = /retry(?:Delay)?[^0-9]{0,12}(\d+(?:\.\d+)?)\s*s/i.exec(blob);
  const s = m ? Number(m[1]) : 60;
  return Math.min(Math.max(s, 15), 120) * 1000;
}

function errorText(err: any): string {
  // The SDK puts Gemini's error body (a JSON array) in .message; .error may hold it parsed.
  let parsed = "";
  try {
    parsed = JSON.stringify(err?.error ?? "");
  } catch {
    /* ignore */
  }
  return `${parsed} ${String(err?.message ?? "")}`;
}

function classify(err: any, now: number): Verdict {
  const status: number | undefined = err?.status ?? err?.response?.status;
  const blob = errorText(err);

  // Quota. Gemini's 429 carries structured quotaIds, which is what separates "this model's
  // daily allowance is spent" from "slow down for a minute". Treating a per-minute limit
  // as daily would let one 11-camera burst mark the whole chain dead until midnight.
  if (status === 429 || /RESOURCE_EXHAUSTED|exceeded your current quota/i.test(blob)) {
    // A billing problem, not a rate limit: OpenAI answers 429 insufficient_quota /
    // credit_balance_exhausted when the balance is zero. It reads identically to a spent daily
    // allowance in the logs, which is exactly how an unfunded account hides behind a working
    // fallback — so it gets its own reason and says the word "credit".
    if (/insufficient_quota|credit_balance_exhausted|no credits remaining/i.test(blob)) {
      return { kind: "rotate", mark: { until: nextUtcMidnight(now), reason: "no-credit" } };
    }
    if (/limit:\s*0\b/.test(blob)) {
      return { kind: "rotate", mark: { until: nextUtcMidnight(now), reason: "zero-limit" } };
    }
    const daily = /PerDay/i.test(blob);
    const perMinute = /PerMinute/i.test(blob);
    if (perMinute && !daily) {
      return { kind: "rotate", mark: { until: now + retryDelayMs(blob), reason: "per-minute" } };
    }
    // PerDay, or a quota error we can't read: assume the day's allowance is gone.
    return { kind: "rotate", mark: { until: nextUtcMidnight(now), reason: "daily-quota" } };
  }

  // Retired or unknown model. Checked BEFORE the format case: an old build read Gemini's
  // "model no longer available" 404 as "response_format unsupported" and stepped the
  // format down against a model that was never going to answer.
  if (status === 410) {
    return { kind: "rotate", mark: { until: nextUtcMidnight(now), reason: "gone" } };
  }
  if (status === 404 && /model|no longer available|not found|not supported/i.test(blob)) {
    return { kind: "rotate", mark: { until: nextUtcMidnight(now), reason: "gone" } };
  }

  if ((status === 400 || status === 422) && /response_format|json_schema|json_object|structured output/i.test(blob)) {
    return { kind: "format" };
  }

  // Overloaded / transient upstream: another model may well be fine. Not remembered.
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return { kind: "rotate" };
  }

  // 400 bad image, 401/403 auth, network failure — the same on every model.
  return { kind: "surface" };
}

type Mode = "json_schema" | "json_object" | "none";
function nextMode(m: Mode): Mode | null {
  return m === "json_schema" ? "json_object" : m === "json_object" ? "none" : null;
}

async function keyTag(key: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(d).slice(0, 6))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
export async function visionComplete(args: Args): Promise<VisionResult> {
  const providers = resolveChain(args.override);
  const usable = providers.filter((r) => r.apiKey);
  if (!usable.length) {
    console.warn(
      `[meanwhile] no API key for ${providers[0].label} — skipping ${args.label}. ` +
        `Set one with: npx convex env set OPENAI_API_KEY <key>`,
    );
    return null;
  }

  const attempts: Attempt[] = [];

  // Providers in order, models within each. The second provider is only reached when every
  // model on the first is unavailable, so a paid account in front costs nothing while it works
  // and costs only itself when it runs out.
  for (const p of usable) {
    const client = new OpenAI({ apiKey: p.apiKey!, baseURL: p.baseURL });
    const now = Date.now();

    // Only the deployment key's exhaustion is remembered (see modelState.ts).
    const persist = args.state && !p.byok ? { store: args.state, tag: await keyTag(p.apiKey!) } : null;
    const blocked = new Map<string, ModelMark>();
    if (persist) {
      for (const m of await persist.store.blocked(p.provider, persist.tag)) {
        if (m.until > now) blocked.set(m.model, m);
      }
    }

    const live = p.chain ? await liveModels(client, `${p.provider}:${p.baseURL ?? ""}`) : null;
    const chain = buildChain(p, live);
    if (!chain.length) {
      attempts.push({ model: `${p.label}:*`, outcome: "no usable model on this account" });
      console.warn(
        `[meanwhile] ${args.label}: ${p.label} has none of its chain on this account ` +
          `(${(p.chain ?? []).join(", ")}) — moving on`,
      );
      continue;
    }

    models: for (const model of chain) {
    const b = blocked.get(model);
    if (b) {
      attempts.push({ model, outcome: `skipped (${b.reason})` });
      continue;
    }

    let mode: Mode = args.jsonSchema ? "json_schema" : "none";
    for (;;) {
      const body: Record<string, unknown> = {
        model,
        // Headroom matters: the 3.x Flash models think, and reasoning tokens count against
        // this cap. A tight cap returns finish_reason "length" with no content at all.
        max_tokens: args.maxTokens ?? 1536,
        messages: [
          { role: "system", content: args.system },
          {
            role: "user",
            content: [
              { type: "text", text: args.text },
              // Always inline: Gemini's compat endpoint won't fetch an external image URL.
              { type: "image_url", image_url: { url: args.dataUri, detail: "low" } },
            ],
          },
        ],
      };
      if (mode === "json_schema" && args.jsonSchema) {
        body.response_format = {
          type: "json_schema",
          json_schema: { name: args.jsonSchema.name, strict: true, schema: args.jsonSchema.schema },
        };
      } else if (mode === "json_object") {
        body.response_format = { type: "json_object" };
      }

      try {
        const res: any = await client.chat.completions.create(body as any);
        const text = res?.choices?.[0]?.message?.content;
        if (typeof text !== "string" || !text.trim()) {
          const why = res?.choices?.[0]?.finish_reason ?? "unknown";
          // Same prompt, same budget: another model would hit the same wall. Surface it.
          console.error(`[meanwhile] ${args.label}: ${describe(p, model)} returned no content (finish_reason=${why})`);
          return null;
        }
        attempts.push({ model, outcome: "served" });
        const fallbacks = attempts.filter((a) => a.outcome !== "served");
        console.log(
          `[meanwhile] ${args.label}: served by ${describe(p, model)}` +
            (fallbacks.length ? ` — after ${fallbacks.map((a) => `${a.model} ${a.outcome}`).join(", ")}` : ""),
        );
        return { text, provider: p, model, attempts };
      } catch (err: any) {
        const v = classify(err, Date.now());
        const detail = scrub(err?.message, p.apiKey).replace(/\s+/g, " ").slice(0, 160);

        if (v.kind === "format" && args.jsonSchema) {
          const step = nextMode(mode);
          if (step) {
            console.warn(`[meanwhile] ${describe(p, model)} rejected response_format=${mode} — retrying as ${step}`);
            mode = step;
            continue;
          }
        }

        if (v.kind === "rotate") {
          const reason = v.mark?.reason ?? `HTTP ${err?.status ?? "?"}`;
          attempts.push({ model, outcome: reason });
          console.warn(`[meanwhile] ${args.label}: ${describe(p, model)} ${reason} — rotating. ${detail}`);
          if (v.mark) {
            const mark = { model, until: v.mark.until, reason: v.mark.reason };
            blocked.set(model, mark);
            if (persist) await persist.store.mark(p.provider, persist.tag, mark);
          }
          break; // next model
        }

        // The same on every model of THIS provider — a bad key, a rejected image — but it
        // says nothing about the next provider's key. Abandon this account, not the frame.
        attempts.push({ model, outcome: `HTTP ${err?.status ?? "?"}` });
        console.error(
          `[meanwhile] ${args.label}: ${describe(p, model)} failed (${err?.status ?? "no status"}) — ` +
            `giving up on ${p.label}: ${detail}`,
        );
        break models;
      }
    }
  }

  }

  console.error(
    `[meanwhile] ${args.label}: every model on ${usable.map((u) => u.label).join(" then ")} is ` +
      `unavailable right now — ${attempts.map((a) => `${a.model}: ${a.outcome}`).join("; ")}`,
  );
  return null;
}

// Models wrap JSON in ``` fences often enough to be worth handling, especially once
// response_format has been stepped down to "none".
export function parseJson(text: string): any {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
