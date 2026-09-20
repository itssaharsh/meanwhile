import { envOrNull } from "./lib";

// Every vision provider worth using speaks the OpenAI chat-completions wire format, so the
// only thing that really varies is the base URL and the model id. Swapping provider is
// therefore a config change, not a code change.
//
// Pure module: no ./_generated imports, so nothing here can drag a function's type into a
// circular inference cycle.
//
// GitHub Models was removed: it is retired (410 github_models_retirement_brownout, dead
// as of 2026-07-30), and its old host no longer resolves.

export type ProviderId = "gemini" | "openai" | "openrouter";

// Gemini failover order, by daily free-tier headroom: Flash-Lite first (~500 requests/day
// each), then regular Flash (~20/day each). Each model has its OWN daily quota, so when
// one is spent the next still works. Validated against the live /models list at runtime;
// IDs that aren't present are dropped, never guessed at.
// OpenAI, small first: a webcam frame at detail:"low" is a cheap call, and the cheapest model
// that can see is the right default for a channel that scores a frame every twenty minutes.
// Validated against the live /models list like every other chain, so an id that does not exist
// on the account is dropped rather than guessed at.
export const OPENAI_CHAIN = ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o"];

export const GEMINI_CHAIN = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
  "gemini-3-flash-preview", // the live ID; plain "gemini-3-flash" is not on /models
  "gemini-2.5-flash",
  "gemini-3.7-flash",
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-2.5-flash-lite",
];

export const PROVIDERS: Record<
  ProviderId,
  {
    label: string;
    baseURL: string | undefined;
    defaultModel: string;
    keyHint: string;
    // When set, the provider is called with model failover: the preferred model first,
    // then this chain, each validated against the provider's live /models list.
    chain?: string[];
    // Where every model in this provider's chain being unavailable sends us next. Crossing
    // providers matters when the first one is a small paid account: a $5 balance running out
    // mid-demo should cost us the better model, not the channel.
    fallback?: ProviderId;
    // Env vars holding this provider's key, most specific first. OPENAI_API_KEY is last on
    // Gemini for the deployments that set the Gemini key there before there was anywhere else.
    keyEnvs: string[];
  }
> = {
  // The deployment default.
  gemini: {
    label: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: GEMINI_CHAIN[0],
    keyHint: "from aistudio.google.com",
    chain: GEMINI_CHAIN,
    keyEnvs: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY"],
  },
  // BYOK. baseURL undefined = the SDK's own default (api.openai.com/v1).
  openai: {
    label: "OpenAI",
    baseURL: undefined,
    defaultModel: OPENAI_CHAIN[0],
    keyHint: "sk-… from platform.openai.com",
    chain: OPENAI_CHAIN,
    fallback: "gemini",
    keyEnvs: ["OPENAI_API_KEY", "OPENAI_KEY"],
  },
  openrouter: {
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    keyHint: "sk-or-… from openrouter.ai",
    keyEnvs: ["OPENROUTER_API_KEY", "OPENAI_API_KEY"],
  },
};

export const DEFAULT_PROVIDER: ProviderId = "gemini";

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PROVIDERS, v);
}

// A caller may bring its own provider and key (BYOK). Anything omitted falls back to the
// deployment's environment variables, and then to the provider table.
export type VisionOverride = {
  provider?: string;
  apiKey?: string;
  model?: string;
};

export type Resolved = {
  provider: ProviderId;
  label: string;
  baseURL: string | undefined;
  // The model to try FIRST. With a chain, failover continues from there.
  preferredModel: string | null;
  defaultModel: string;
  chain: string[] | null;
  apiKey: string | null;
  byok: boolean;
};

export function resolveProvider(o?: VisionOverride): Resolved {
  const envRaw = envOrNull("AI_PROVIDER");
  if (envRaw && !isProviderId(envRaw)) {
    console.warn(`[meanwhile] AI_PROVIDER="${envRaw}" is not a known provider — using ${DEFAULT_PROVIDER}`);
  }
  const envProvider: ProviderId = isProviderId(envRaw) ? envRaw : DEFAULT_PROVIDER;
  const byokProvider = isProviderId(o?.provider) ? (o!.provider as ProviderId) : null;
  if (o?.provider && !byokProvider) {
    console.warn(`[meanwhile] unknown provider "${o.provider}" requested — using ${envProvider}`);
  }
  const provider = byokProvider ?? envProvider;
  const table = PROVIDERS[provider];

  // A caller who names a provider gets that provider's base URL and default model — the
  // deployment's OPENAI_BASE_URL/OPENAI_MODEL describe the DEFAULT provider and would be
  // wrong for a different one.
  const baseURL = byokProvider ? table.baseURL : (envOrNull("OPENAI_BASE_URL") ?? table.baseURL);
  const preferredModel = o?.model ?? (byokProvider ? null : envOrNull("OPENAI_MODEL"));

  // Each provider keeps its key in its own variable, so two providers can be configured at
  // once — which is what lets a paid OpenAI account sit in front of the free Gemini chain.
  const apiKey = o?.apiKey ?? keyFor(provider);

  return {
    provider,
    label: table.label,
    baseURL,
    preferredModel,
    defaultModel: table.defaultModel,
    chain: table.chain ?? null,
    apiKey,
    byok: Boolean(o?.apiKey),
  };
}

/** The deployment's key for one provider, from the first of its variables that is set. */
export function keyFor(provider: ProviderId): string | null {
  for (const name of PROVIDERS[provider].keyEnvs) {
    const v = envOrNull(name);
    if (v) return v;
  }
  return null;
}

/**
 * Every provider a single call may try, in order.
 *
 * One entry for a caller's own key: BYOK never falls through to the deployment's provider,
 * because someone else's request should not spend our quota, and a key they supplied should
 * not silently be replaced by ours.
 */
export function resolveChain(o?: VisionOverride): Resolved[] {
  const first = resolveProvider(o);
  if (first.byok) return [first];
  const next = PROVIDERS[first.provider].fallback;
  if (!next || next === first.provider) return [first];
  // Only worth queueing if it actually has a key of its own.
  const key = keyFor(next);
  if (!key) return [first];
  const table = PROVIDERS[next];
  return [
    first,
    {
      provider: next,
      label: table.label,
      baseURL: table.baseURL,
      preferredModel: null,
      defaultModel: table.defaultModel,
      chain: table.chain ?? null,
      apiKey: key,
      byok: false,
    },
  ];
}

// Describes a provider + the model that actually served, for a log line. NEVER includes
// the key — not a prefix, not a length, nothing. A caller-supplied key is someone else's
// credential passing through this deployment; it is used for the request and dropped.
export function describe(r: Resolved, model?: string): string {
  return `${r.label}/${model ?? r.preferredModel ?? r.defaultModel}${r.byok ? " (caller key)" : ""}`;
}

// Redacts a secret from anything about to be logged, in case an SDK error echoes the
// request back at us.
export function scrub(text: unknown, secret: string | null): string {
  let s = typeof text === "string" ? text : String(text ?? "");
  if (secret && secret.length >= 8) s = s.split(secret).join("[redacted]");
  // Belt and braces: common key shapes, in case a different secret shows up.
  return s
    // A provider may echo the key back with its own masking — OpenAI's 401 prints
    // "AQ.Ab8RN*****". The visible head is still eight characters of a real credential, and
    // this file's rule is no prefix, no length, nothing.
    .replace(/[A-Za-z0-9._-]{3,}\*{3,}/g, "[redacted]")
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, "[redacted]")
    .replace(/AIza[A-Za-z0-9_-]{20,}/g, "[redacted]")
    .replace(/AQ\.[A-Za-z0-9_-]{20,}/g, "[redacted]")
    .replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]{16,}/gi, "Bearer [redacted]");
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------
// Several providers will not fetch an external image URL for you (Gemini's OpenAI-compat
// endpoint expects inline data), so frames are always sent as base64 data URIs rather than
// as a link to Convex file storage.
const CHUNK = 0x8000;

export function toDataUri(bytes: ArrayBuffer, contentType: string): string {
  const arr = new Uint8Array(bytes);
  let binary = "";
  // Chunked: String.fromCharCode(...arr) blows the argument limit on a 500 KB frame.
  for (let i = 0; i < arr.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(arr.subarray(i, i + CHUNK)) as unknown as number[]);
  }
  const type = contentType && contentType.startsWith("image/") ? contentType : "image/jpeg";
  return `data:${type};base64,${btoa(binary)}`;
}
