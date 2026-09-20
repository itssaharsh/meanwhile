// One view-model, three sources.
//
// The globe prototype renders from {place, country, lat, lng, tz, score, landmark, src,
// story[3], scene{}} and paints every frame procedurally on canvas. The backend returns
// {...snapshot, camera, url} with a single caption. Rather than rewrite the renderers,
// everything is adapted into the prototype's shape here — so demo fixtures, live
// subscriptions and on-demand country pulls all travel the same render path.

/* ---------------------------------------------------------------- scenes ---
 * scene{} is the procedural-art descriptor drawScene()/drawLandmark() understand.
 * It is derived from real signal only — the weather text, the vision model's tags,
 * whether it's day there, and latitude. Nothing here is invented per-camera.
 */
const FLAGS = [
  [/aurora|northern lights|borealis/, "aurora"],
  [/harbou?r|sea|ocean|fjord|lake|river|bay|coast|water|waves|marina|port/, "water"],
  [/mountain|peak|alps|summit|ridge|volcano|caldera|cliff/, "mountains"],
  [/skyline|skyscraper|downtown|highrise|high-rise|buildings|cityscape|towers/, "skyline"],
  [/lantern|market|temple|shrine|festival|candle/, "lanterns"],
  [/neon|nightlife|signs|arcade/, "neon"],
  [/village|town|rooftops|houses|old town/, "town"],
  [/snow|frost|glacier|ice/, "snow"],
];

const SKY = {
  night: ["#151d33", "#0b1120", "#05070f"],
  arctic: ["#051a22", "#03101a", "#01060c"],
  dusk: ["#ffb27a", "#e06a8a", "#4a2b63"],
  dawn: ["#a9c8e4", "#5f7fa6", "#2b4560"],
  day: ["#9fc0dc", "#6f8fb4", "#38547a"],
  grey: ["#8f9bab", "#5d6878", "#333b48"],
  storm: ["#48566a", "#222b3a", "#121824"],
};

function hourOf(localTime, tz) {
  const m = /^(\d{1,2}):/.exec(String(localTime ?? ""));
  if (m) return Number(m[1]);
  return new Date(Date.now() + (tz ?? 0) * 3600 * 1000).getUTCHours();
}

export function synthScene({ isDay, weather, tags, lat, localTime, tz }) {
  const w = String(weather ?? "").toLowerCase();
  const text = (w + " " + (tags ?? []).join(" ")).toLowerCase();
  const hour = hourOf(localTime, tz);
  const night = isDay === false || (isDay == null && (hour >= 19 || hour < 6));

  const wet = /rain|drizzle|shower|downpour|thunder/.test(w);
  const foggy = /fog|mist|haze/.test(w);
  const snowy = /snow/.test(w);
  const dull = /overcast|cloud/.test(w);

  const scene = {};
  for (const [re, flag] of FLAGS) if (re.test(text)) scene[flag] = true;

  // latitude fills in what the caption didn't mention
  if (Math.abs(lat ?? 0) > 60 && night && !dull && !wet) scene.aurora = true;
  if (Math.abs(lat ?? 0) > 45 && !scene.skyline) scene.mountains = scene.mountains ?? true;

  if (wet) scene.rain = true;
  if (foggy) scene.mist = true;
  if (snowy) scene.snow = true;

  if (night) {
    scene.sky = scene.aurora ? SKY.arctic : SKY.night;
    if (!dull && !wet && !foggy) scene.stars = true;
    if (scene.skyline) scene.windows = true;
  } else if (wet || (dull && !foggy)) {
    scene.sky = wet ? SKY.storm : SKY.grey;
  } else if (hour >= 17 && hour < 21) {
    scene.sky = SKY.dusk;
    scene.sun = { x: 0.62, y: 0.54, c: "#ffe6a8" };
    scene.warm = true;
  } else if (hour >= 5 && hour < 8) {
    scene.sky = SKY.dawn;
  } else {
    scene.sky = SKY.day;
    scene.sun = { x: 0.7, y: 0.42, c: "#ffe6a8" };
  }

  // drawScene needs three stops
  if (!scene.sky) scene.sky = night ? SKY.night : SKY.day;
  return scene;
}

/* ----------------------------------------------------------------- story --- */
// The backend writes ONE caption. Frames 2 and 3 are built from the facts that came
// with it — never invented.
function storyFrom({ caption, weather, localTime, score, tags, place, headline }) {
  const line2 = [localTime ? `${localTime} local` : null, weather || null]
    .filter(Boolean)
    .join(" · ");
  const line3 = [
    score != null ? `scored ${Number(score).toFixed(1)}/10 by the director` : null,
    (tags ?? []).length ? tags.slice(0, 3).join(" · ") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return [
    caption || `Live right now from ${place}`,
    // Frame two is what's actually happening there today, when Firecrawl found something.
    headline ? `Today in ${place}: ${headline}` : line2 || `Live from ${place}`,
    [line2, line3].filter(Boolean).join(" · ") || "live camera",
  ];
}

function hostOf(ref) {
  if (!ref) return null;
  try {
    return new URL(ref).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- adapters --- */

// A snapshot row from director:getCut / director:getFeed, or a fixture feed item.
export function toMoment(row) {
  if (!row) return null;
  const cam = row.camera ?? {};
  const tz = cam.tz ?? row.tz ?? 0;
  const tags = row.tags ?? [];
  const place = cam.name ?? row.place ?? "Somewhere";
  return {
    id: row._id ?? row.id ?? `${place}:${row.at ?? row.localTime ?? ""}`,
    place,
    country: cam.country ?? row.country ?? "",
    lat: cam.lat ?? row.lat ?? 0,
    lng: cam.lng ?? row.lng ?? 0,
    tz,
    score: row.score != null ? Number(row.score).toFixed(1) : "live",
    landmark: null, // live frames are photographs; the landmark art is placeholder-only
    // Credit where the frame really came from: the camera's own host, or for a country
    // click the page the frame was taken from. Only demo fixtures fall back to a label.
    src: hostOf(cam.ref) ?? hostOf(row.sourcePage) ?? `${String(place).toLowerCase().replace(/[^a-z]/g, "")}.live`,
    url: row.url ?? row.imageUrl ?? null,
    headline: row.headline ?? null,
    headlineUrl: row.headlineUrl ?? null,
    story: storyFrom({
      caption: row.caption,
      weather: row.weather,
      localTime: row.localTime,
      score: row.score,
      tags,
      place,
      headline: row.headline,
    }),
    scene: synthScene({
      isDay: row.isDay,
      weather: row.weather,
      tags,
      lat: cam.lat ?? row.lat,
      localTime: row.localTime,
      tz,
    }),
  };
}

// The countries:fetchCountry action result — same idea, different field names
// (it returns `imageUrl`, `place` and `tz` rather than a camera row).
export function countryToMoment(res, fallbackLat, fallbackLng) {
  if (!res) return null;
  const lat = res.lat ?? fallbackLat ?? 0;
  const lng = res.lng ?? fallbackLng ?? 0;
  const moment = toMoment({
    ...res,
    id: `country:${res.country}:${res.localTime ?? ""}`,
    lat,
    lng,
    url: res.imageUrl ?? res.url ?? null,
    score: res.score ?? null,
  });
  // Provenance travels with the card: where the frame came from, and how old it was.
  return {
    ...moment,
    imageSource: res.imageSource ?? "none",
    sourcePage: res.sourcePage ?? null,
    sourceImageUrl: res.sourceImageUrl ?? null,
    frameAgeMinutes: res.frameAgeMinutes ?? null,
  };
}

export function toFeed(rows) {
  return (rows ?? []).map(toMoment).filter(Boolean);
}
