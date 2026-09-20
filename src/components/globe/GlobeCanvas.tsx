import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import * as THREE from "three";
import countriesRaw from "@/data/countries.json";
import { ADDED } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { GlobeSlate } from "./GlobeSlate";
import { subsolarPoint, toUnitVector } from "./sun";

// C-02 GlobeCanvas — the real planet, lit by the true sun. One persistent instance: this module
// is lazy-loaded and its Suspense boundary wraps only itself, so nothing else waits on it.

type Country = { n: string; c: [number, number]; g: number[][][][] };
export type CountryFeature = {
  type: "Feature";
  properties: { name: string; centroid: [number, number] };
  geometry: { type: "MultiPolygon"; coordinates: number[][][][] };
};

const FEATURES: CountryFeature[] = (countriesRaw as Country[]).map((c) => ({
  type: "Feature",
  properties: { name: c.n, centroid: c.c },
  geometry: { type: "MultiPolygon", coordinates: c.g },
}));

export const countryByName = (name: string) => FEATURES.find((f) => f.properties.name === name) ?? null;

// Day/night blended at the terminator from the true subsolar point, feathered 0.9° (±0.45°).
const VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FRAGMENT = /* glsl */ `
  uniform sampler2D dayTexture;
  uniform sampler2D nightTexture;
  uniform vec3 sunDir;
  varying vec2 vUv;
  varying vec3 vNormalW;
  void main() {
    float d = dot(normalize(vNormalW), normalize(sunDir));
    float t = smoothstep(-0.00785, 0.00785, d);
    vec3 day = texture2D(dayTexture, vUv).rgb;
    vec3 night = texture2D(nightTexture, vUv).rgb;
    gl_FragColor = vec4(mix(night, day, t), 1.0);
    #include <colorspace_fragment>
  }
`;

/** A 1x1 texture, for a sampler that must be valid before the real image exists. */
function pixel(r: number, g: number, b: number): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** A token as rgba(), so three.js can take it. One palette: DESIGN.md's, read at runtime. */
function tokenRgba(name: string, alpha: number): string {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#e8eef4";
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export type GlobeProps = {
  onAir: { lat: number; lon: number; snapshotId?: string } | null;
  /** The country whose Story is open. Teal only if that story is verified-fresh. */
  active?: { name: string; verified: boolean } | null;
  /** Countries holding a camera that proved current within the hour. A faint --live wash:
   *  real coverage shown honestly, so a first click lands somewhere that works. Uncovered
   *  countries stay neutral and stay clickable — this is a hint, never a gate. */
  covered?: ReadonlySet<string> | null;
  /** Countries we hold a camera for that has not proved itself current within the hour. The
   *  honest middle tier: we know where to look, we are not claiming it is live. A --ink-muted
   *  edge, never teal — teal is a claim about freshness and this makes none. */
  indexed?: ReadonlySet<string> | null;
  /** A point to fly to. Changing it starts a flight — 400ms for a country click, 640ms for a
   *  cut (UI-SPEC C-02). Ignored if the viewer has had their hands on the planet in the last
   *  2.5 seconds: the director never yanks the camera out of someone's grip. */
  flyTo?: { lat: number; lng: number; ms?: number } | null;
  /** /_kit: pin a hover state on a country. */
  forceHover?: string | null;
  pov?: { lat: number; lng: number; altitude?: number };
  reduced?: boolean;
  /** /_kit: render the lost-context slate without killing a real context. */
  forceLost?: boolean;
  /** /_kit: the state after a restore has failed too. */
  forceUnavailable?: boolean;
  /** Simulated time multiplier for the terminator (?demo=1 runs at 60×). */
  sunSpeed?: number;
  onCountryClick?: (name: string, centroid: [number, number]) => void;
  className?: string;
};

export default function GlobeCanvas({
  onAir,
  active = null,
  covered = null,
  indexed = null,
  flyTo = null,
  forceHover = null,
  pov,
  reduced = false,
  forceLost = false,
  forceUnavailable = false,
  sunSpeed = 1,
  onCountryClick,
  className,
}: GlobeProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [ready, setReady] = useState(false);
  const [lost, setLost] = useState(false);
  // C-02 error: one restore attempt. If the picture doesn't come back within 3s, or the context
  // is lost again afterwards, the slate says so and stops offering the button.
  const [restores, setRestores] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  /** When the viewer last grabbed the globe, for the flight guard. */
  const handsOn = useRef(0);
  const [pinned, setPinned] = useState<{ x: number; y: number } | null>(null);

  const colors = useMemo(
    () => ({
      stroke: tokenRgba("--ink", 0.14),
      hoverFill: tokenRgba("--ink", 0.08),
      hoverStroke: tokenRgba("--ink-muted", 1),
      pressFill: tokenRgba("--ink", 0.14),
      activeFillLive: tokenRgba("--live", 0.1),
      activeStrokeLive: tokenRgba("--live", 1),
      activeFillInk: tokenRgba("--ink", 0.1),
      // Coverage, shown honestly. A fill alone washes out to fog over the day texture and only
      // reads at night, so the fill stays faint and a light stroke carries it: legible over
      // desert and ocean alike, and nowhere near the full-opacity --live of an open story.
      coveredFill: tokenRgba("--live", 0.1),
      coveredStroke: tokenRgba("--live", 0.42),
      indexedStroke: tokenRgba("--ink-muted", 0.34),
      activeStrokeInk: tokenRgba("--ink", 1),
      none: "rgba(0,0,0,0)",
    }),
    [],
  );

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          // 1x1 stand-ins: a valid sampler from the first frame, so nothing has to wait for a
          // JPEG before the globe can be drawn at all.
          dayTexture: { value: pixel(16, 32, 56) },
          nightTexture: { value: pixel(4, 7, 13) },
          sunDir: { value: new THREE.Vector3(0, 0, 1) },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
      }),
    [],
  );

  // size
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Textures, smallest first.
  //
  // The full pair is 4096x2048 and 2.1MB, and gating the planet on it meant a cold load on a
  // phone sat on ACQUIRING PICTURE for thirty seconds — measured, not guessed. A 1024x512 pair
  // (84KB together) arrives in a second or two and is enough to recognise the Earth; the full
  // resolution swaps in behind it when it lands, and nobody sees the moment it does. Both
  // uniforms start as a 1x1 pixel so the shader is valid from the very first frame.
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    let cancelled = false;
    let lifted = false;

    const put = (which: "dayTexture" | "nightTexture", tex: THREE.Texture) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      material.uniforms[which].value = tex;
      material.needsUpdate = true;
      if (lifted) return;
      lifted = true;
      // Ready once a frame carrying a real texture has actually been drawn — shader compile
      // included — not merely when the JPEG decodes.
      requestAnimationFrame(() => requestAnimationFrame(() => !cancelled && setReady(true)));
    };

    // Strictly in sequence. Requesting all four at once let 2.1MB of full-resolution JPEG
    // compete with the 84KB pair for the same pipe, and on a throttled connection the small
    // ones never won — the slate stayed up past forty seconds. The full pair is not asked for
    // until the small one is on screen.
    loader.loadAsync("/earth/day-lo.jpg").then((t) => {
      if (cancelled) return;
      put("dayTexture", t);
      loader.loadAsync("/earth/night-lo.jpg").then((n) => {
        if (cancelled) return;
        put("nightTexture", n);
        loader.loadAsync("/earth/day.jpg").then((d) => !cancelled && put("dayTexture", d));
        loader.loadAsync("/earth/night.jpg").then((n2) => !cancelled && put("nightTexture", n2));
      });
    });

    return () => {
      cancelled = true;
    };
  }, [material]);

  // the terminator: recomputed every 60s of simulated time
  useEffect(() => {
    const t0 = Date.now();
    const tick = () => {
      const sim = new Date(t0 + (Date.now() - t0) * sunSpeed);
      const s = subsolarPoint(sim);
      material.uniforms.sunDir.value.set(...toUnitVector(s.lat, s.lng));
    };
    tick();
    const id = setInterval(tick, Math.max(1000, 60_000 / sunSpeed));
    return () => clearInterval(id);
  }, [material, sunSpeed]);

  const small = size.w > 0 && size.w < 640;

  const onReady = useCallback(() => {
    const g = globeRef.current;
    if (!g) return;
    g.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const canvas = g.renderer().domElement;
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      setLost(true);
      setRestores((r) => {
        if (r > 0) setUnavailable(true);
        return r;
      });
    });
    canvas.addEventListener("webglcontextrestored", () => setLost(false));
  }, []);

  // camera + auto-rotate (0.18°/s, paused 8s after a drag; off under reduced motion and < 640)
  useEffect(() => {
    const g = globeRef.current;
    if (!g || size.w === 0) return;
    const altitude = pov?.altitude ?? (small ? 2.6 : 2.2);
    const target = pov ?? (onAir ? { lat: onAir.lat, lng: onAir.lon } : { lat: 20, lng: 10 });
    g.pointOfView({ ...target, altitude }, 0);
    const controls = g.controls();
    controls.autoRotate = !reduced && !small;
    controls.autoRotateSpeed = 0.03;
    let resume: ReturnType<typeof setTimeout> | undefined;
    const onStart = () => {
      controls.autoRotate = false;
      handsOn.current = Date.now();
      clearTimeout(resume);
    };
    const onEnd = () => {
      if (reduced || small) return;
      resume = setTimeout(() => (controls.autoRotate = true), 8000);
    };
    controls.addEventListener("start", onStart);
    controls.addEventListener("end", onEnd);
    return () => {
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
      clearTimeout(resume);
    };
    // pov is re-applied only when the kit changes it
  }, [size.w > 0, small, reduced, pov?.lat, pov?.lng, pov?.altitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // The flight. A cut or a country click moves the camera; a viewer's hand overrides both.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !flyTo || size.w === 0) return;
    if (Date.now() - handsOn.current < 2500) return;
    const altitude = pov?.altitude ?? (small ? 2.6 : 2.2);
    g.pointOfView({ lat: flyTo.lat, lng: flyTo.lng, altitude }, reduced ? 0 : (flyTo.ms ?? 640));
  }, [flyTo?.lat, flyTo?.lng, flyTo?.ms, size.w > 0, small, reduced, pov?.altitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // /_kit: pin the hover label on a country's centroid
  useEffect(() => {
    const g = globeRef.current;
    if (!forceHover || !g || !ready) {
      setPinned(null);
      return;
    }
    const f = countryByName(forceHover);
    if (!f) return;
    const [lng, lat] = f.properties.centroid;
    const p = g.getScreenCoords(lat, lng, 0.012);
    if (p) setPinned({ x: p.x, y: p.y });
  }, [forceHover, ready, size.w, size.h]);

  const hovered = forceHover ?? hover;
  const lift = reduced ? 0.004 : 0.016;

  const capColor = useCallback(
    (d: object) => {
      const name = (d as CountryFeature).properties.name;
      if (name === pressed) return colors.pressFill;
      if (active?.name === name) return active.verified ? colors.activeFillLive : colors.activeFillInk;
      if (name === hovered) return colors.hoverFill;
      if (covered?.has(name)) return colors.coveredFill;
      return colors.none;
    },
    [active, hovered, pressed, covered, colors],
  );
  const strokeColor = useCallback(
    (d: object) => {
      const name = (d as CountryFeature).properties.name;
      if (active?.name === name) return active.verified ? colors.activeStrokeLive : colors.activeStrokeInk;
      if (name === hovered) return colors.hoverStroke;
      if (covered?.has(name)) return colors.coveredStroke;
      if (indexed?.has(name)) return colors.indexedStroke;
      return colors.stroke;
    },
    [active, hovered, covered, indexed, colors],
  );
  const altitude = useCallback((d: object) => ((d as CountryFeature).properties.name === hovered ? lift : 0.004), [hovered, lift]);

  const markerData = useMemo(() => (onAir ? [{ lat: onAir.lat, lng: onAir.lon }] : []), [onAir?.lat, onAir?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  const markerEl = useCallback(() => {
    const el = document.createElement("div");
    el.className = "mw-onair-marker";
    el.setAttribute("aria-hidden", "true");
    if (onAir?.snapshotId) el.dataset.snapshotId = onAir.snapshotId;
    return el;
  }, [onAir?.snapshotId]);

  const showLost = forceLost || forceUnavailable || lost;
  const gone = forceUnavailable || unavailable;
  const restore = () => {
    setRestores((r) => r + 1);
    globeRef.current?.renderer().forceContextRestore();
    setTimeout(() => setLost((still) => (still && setUnavailable(true), still)), 3000);
  };
  const labelPos = forceHover ? pinned : pointer;
  const labelText = hovered;

  return (
    <div
      ref={wrapRef}
      // Keyboard users get the country list (K) rather than 177 polygon focus stops; the arrow,
      // +/- and Home bindings arrive with the live shell.
      tabIndex={0}
      role="application"
      aria-label={ADDED.globeAria.text}
      className={cn("absolute inset-0 overflow-hidden bg-canvas", className)}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPointer({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
      onPointerLeave={() => setPointer(null)}
    >
      {!forceLost && !forceUnavailable && size.w > 0 && (
        <div className={cn("absolute inset-0 [transition:opacity_320ms_var(--ease-out-quint)]", ready && !lost ? "opacity-100" : "opacity-0")}>
          <Globe
            ref={globeRef}
            width={size.w}
            height={size.h}
            backgroundColor="rgba(0,0,0,0)"
            globeMaterial={material}
            showAtmosphere={false}
            // No intro scale-in: three-globe's animateIn grows the planet from 1e-6 over 600ms
            // on the animation-frame clock, and where frames are throttled (an offscreen iframe,
            // a background tab) it stalls as a dot. The planet appears at its real size, behind
            // the slate's 320ms crossfade.
            {...({ animateIn: false } as object)}
            showGraticules={false}
            polygonsData={FEATURES}
            polygonCapColor={capColor}
            polygonSideColor={() => colors.none}
            polygonStrokeColor={strokeColor}
            polygonAltitude={altitude}
            polygonCapCurvatureResolution={3}
            polygonsTransitionDuration={reduced ? 0 : 150}
            onPolygonHover={(d) => setHover(d ? (d as CountryFeature).properties.name : null)}
            onPolygonClick={(d) => {
              const f = d as CountryFeature;
              setPressed(f.properties.name);
              setTimeout(() => setPressed(null), 120);
              onCountryClick?.(f.properties.name, f.properties.centroid);
            }}
            htmlElementsData={markerData}
            htmlElement={markerEl}
            htmlAltitude={0.005}
            htmlTransitionDuration={0}
            htmlElementVisibilityModifier={(el, visible) => {
              (el as HTMLElement).style.opacity = visible ? "1" : "0";
            }}
            onGlobeReady={onReady}
          />
        </div>
      )}

      {/* The slate stays mounted and crossfades out as the textures fade in (320ms), so there
          is never a frame with neither. */}
      <div aria-hidden={(ready && !showLost) || undefined}>
        <GlobeSlate
          state={gone ? "unavailable" : showLost ? "lost" : "loading"}
          onRestore={restore}
          className={cn(
            "[transition:opacity_320ms_var(--ease-out-quint)]",
            ready && !showLost && "pointer-events-none opacity-0",
          )}
        />
      </div>

      {/* the lower-third hover label: the place name, pinned to the pointer */}
      {labelText && labelPos && !small && !showLost && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-10 rounded-sm border border-line bg-surface-1 px-2 py-1 font-place text-[14px] leading-[1.2] font-semibold whitespace-nowrap text-ink"
          style={{ left: labelPos.x + 14, top: labelPos.y + 14 }}
        >
          {labelText}
        </div>
      )}

    </div>
  );
}
