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
  }
> = {
  // The deployment default.
  gemini: {
    label: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: GEMINI_CHAIN[0],
    keyHint: "from aistudio.google.com",
    chain: GEMINI_CHAIN,
  },
  // BYOK. baseURL undefined = the SDK's own default (api.openai.com/v1).
  openai: {
    label: "OpenAI",
    baseURL: undefined,
    defaultModel: "gpt-4o-mini",
    keyHint: "sk-… from platform.openai.com",
  },
  openrouter: {
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    keyHint: "sk-or-… from openrouter.ai",
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

  // OPENAI_API_KEY is the documented name; OPENAI_KEY is accepted so older deployments
  // keep working.
  const apiKey = o?.apiKey ?? envOrNull("OPENAI_API_KEY") ?? envOrNull("OPENAI_KEY");

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
