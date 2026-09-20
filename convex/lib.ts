// Shared pure helpers (no Convex context needed).

// --- environment ------------------------------------------------------------
// Convex provides process.env in every runtime, but the functions directory is not a Node
// program, so declare just this rather than pulling in all of @types/node.
declare const process: { env: Record<string, string | undefined> };

// Every integration used to read `process.env.X ?? ""` and call the API anyway, so a
// missing key and a wrong key looked identical from the outside: silence. The app must
// still push and run with no keys at all (that's what makes `?demo=true` useful), so the
// policy is skip-with-one-clear-log, never throw.
export function envOrNull(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v : null;
}

export function missingKey(name: string, context: string): void {
  console.warn(`[meanwhile] ${name} is not set — skipping ${context}. Set it with: npx convex env set ${name} <value>`);
}

// Every external call goes through here so failures are visible in `npx convex logs`
// instead of turning into a silent early return.
/** The longest we will sit on a 429 before giving the caller its null. */
const RETRY_AFTER_CAP_MS = 20_000;

export async function fetchOk(label: string, url: string, init?: RequestInit): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, init);
      if (r.ok) return r;
      const body = await r.text().catch(() => "");
      // A per-minute ceiling is not a failure, it's a queue: two country clicks in the same
      // minute are enough to hit Firecrawl's 10 req/min, and treating that as "no page here"
      // spends the whole page budget on nothing.
      if (r.status === 429 && attempt === 0) {
        const header = Number(r.headers.get("retry-after"));
        const advertised = Number(/retry after (\d+)/i.exec(body)?.[1]);
        const waitMs = Math.min((header || advertised || 5) * 1000, RETRY_AFTER_CAP_MS);
        console.log(`[meanwhile] ${label} rate-limited — waiting ${Math.round(waitMs / 1000)}s`);
        await new Promise((res) => setTimeout(res, waitMs));
        continue;
      }
      console.error(`[meanwhile] ${label} failed: HTTP ${r.status} ${body.slice(0, 300)}`);
      return null;
    } catch (e) {
      console.error(`[meanwhile] ${label} threw:`, e);
      return null;
    }
  }
  return null;
}

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}


export function localTimeFor(tz: number): string {
  const d = new Date(Date.now() + tz * 3600 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function isNight(tz: number): boolean {
  const hh = new Date(Date.now() + tz * 3600 * 1000).getUTCHours();
  return hh >= 19 || hh < 6;
}

// WMO weather code -> short human text (Open-Meteo).
export function weatherText(code: number | undefined, tempC: number | undefined): string {
  const t = tempC != null ? `${Math.round(tempC)}°C` : "";
  const map: Record<number, string> = {
    0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
    45: "fog", 48: "fog", 51: "drizzle", 53: "drizzle", 55: "drizzle",
    61: "light rain", 63: "rain", 65: "heavy rain", 71: "light snow",
    73: "snow", 75: "heavy snow", 80: "showers", 81: "showers", 82: "downpour",
    95: "thunderstorm", 96: "thunderstorm", 99: "thunderstorm",
  };
  const w = code != null ? map[code] ?? "" : "";
  return [t, w].filter(Boolean).join(" · ");
}

// Open-Meteo: free, no key. Returns { tempC, isDay, text } or null.
export async function getWeather(lat: number, lng: number) {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,weather_code,is_day`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j: any = await r.json();
    const c = j.current ?? {};
    return {
      tempC: c.temperature_2m as number | undefined,
      isDay: c.is_day === 1,
      text: weatherText(c.weather_code, c.temperature_2m),
    };
  } catch {
    return null;
  }
}
