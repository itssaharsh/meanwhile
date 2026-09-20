import { useEffect, useRef, useState, type ReactNode } from "react";

// Kit assertions: invariants the design rests on, checked against the RENDERED DOM (not the
// data), so a fixture, a sort, a class name or a default prop can't slip past them.
//
//   rail-order       the running order is ordered — no rail item outscores the one above it
//   amber-one-frame  amber marks exactly one frame — every amber-painted element resolves, via
//                    its nearest [data-snapshot-id], to the same snapshot
//   amber-unbound    amber that isn't bound to any snapshot at all
//
// Violations fail loudly: a red strip on the offending state, console.error, and
// window.__kitViolations for the screenshot loop.

export type Violation = { rule: "rail-order" | "amber-one-frame" | "amber-unbound"; detail: string };

declare global {
  interface Window {
    __kitViolations?: (Violation & { state: string })[];
  }
}

const ACCENT: [number, number, number] = [245, 189, 83]; // --accent #f5bd53

// --- colour parsing: getComputedStyle hands back rgb(), color(srgb …), oklab() or oklch() ---
const gamma = (x: number) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}
function parseColor(c: string): [number, number, number, number] | null {
  const nums = (c.match(/-?[\d.]+(e-?\d+)?%?/g) ?? []).map((t) => (t.endsWith("%") ? parseFloat(t) / 100 : parseFloat(t)));
  if (c.startsWith("rgb")) return [nums[0], nums[1], nums[2], nums[3] ?? 1];
  if (c.startsWith("color(srgb")) return [nums[0] * 255, nums[1] * 255, nums[2] * 255, nums[3] ?? 1];
  if (c.startsWith("oklab")) return [...oklabToRgb(nums[0], nums[1], nums[2]), nums[3] ?? 1];
  if (c.startsWith("oklch")) {
    const [L, C, H] = nums;
    const h = (H * Math.PI) / 180;
    return [...oklabToRgb(L, C * Math.cos(h), C * Math.sin(h)), nums[3] ?? 1];
  }
  return null;
}
/** Amber at any alpha: a 35% tally ring or an 18% wash is still an amber claim. */
export function isAmber(c: string): boolean {
  const p = parseColor(c);
  if (!p || p[3] < 0.02) return false;
  return Math.abs(p[0] - ACCENT[0]) <= 10 && Math.abs(p[1] - ACCENT[1]) <= 10 && Math.abs(p[2] - ACCENT[2]) <= 10;
}

const SIDES = ["Top", "Right", "Bottom", "Left"] as const;
function paints(cs: CSSStyleDeclaration, withText: boolean): string[] {
  const out = [cs.backgroundColor];
  if (withText) out.push(cs.color);
  for (const side of SIDES) {
    if (parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 && cs.getPropertyValue(`border-${side.toLowerCase()}-style`) !== "none")
      out.push(cs.getPropertyValue(`border-${side.toLowerCase()}-color`));
  }
  if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) out.push(cs.outlineColor);
  return out;
}

function visible(el: Element): boolean {
  const e = el as HTMLElement;
  if (typeof e.checkVisibility === "function" && !e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function checkScope(scope: Element): Violation[] {
  const out: Violation[] = [];

  // 1. rail order
  for (const rail of scope.querySelectorAll("[data-rail]")) {
    const items = [...rail.querySelectorAll<HTMLElement>("[data-rail-item]")];
    const scores = items.map((i) => (i.dataset.score === "" ? -Infinity : Number(i.dataset.score)));
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] > scores[i - 1]) {
        out.push({ rule: "rail-order", detail: `rail item #${i + 1} (${scores[i]}) outscores #${i} (${scores[i - 1]})` });
      }
    }
  }

  // 2. amber marks one frame
  const bound = new Map<string, string[]>();
  for (const el of [scope, ...scope.querySelectorAll("*")]) {
    if (!visible(el)) continue;
    const withText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "");
    const colours = paints(getComputedStyle(el), withText);
    for (const pseudo of ["::before", "::after"]) {
      const ps = getComputedStyle(el, pseudo);
      if (ps.content && ps.content !== "none" && ps.content !== "normal") colours.push(...paints(ps, false));
    }
    if (!colours.some(isAmber)) continue;
    const owner = el.closest("[data-snapshot-id]")?.getAttribute("data-snapshot-id");
    const what = `<${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? ` .${el.className.split(" ")[0]}` : ""}> “${(el.textContent ?? "").trim().slice(0, 24)}”`;
    if (!owner) out.push({ rule: "amber-unbound", detail: `amber on ${what} with no snapshot` });
    else bound.set(owner, [...(bound.get(owner) ?? []), what]);
  }
  if (bound.size > 1) {
    out.push({ rule: "amber-one-frame", detail: `amber on ${bound.size} frames: ${[...bound.keys()].join(", ")}` });
  }
  return out;
}

/** Wraps one state; checks it once motion has settled (and again after loops have turned). */
export function KitAssert({ state, whole = false, children }: { state: string; whole?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [violations, setViolations] = useState<Violation[]>([]);

  useEffect(() => {
    const run = () => {
      const scope = whole ? document.body : ref.current;
      if (!scope) return;
      const v = checkScope(scope);
      setViolations(v);
      window.__kitViolations = [...(window.__kitViolations ?? []).filter((x) => x.state !== state), ...v.map((x) => ({ ...x, state }))];
      for (const x of v) console.error(`[kit] ${state}: ${x.rule} — ${x.detail}`);
    };
    const t1 = setTimeout(run, 1600);
    const t2 = setTimeout(run, 4600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [state, whole]);

  return (
    <div ref={ref} data-kit-state={state} className={whole ? "contents" : "relative"}>
      {children}
      {violations.length > 0 && (
        <div role="alert" className="fixed inset-x-0 bottom-0 z-[100] bg-danger px-3 py-2 font-mono text-[11px] text-canvas">
          kit assertion failed · {state} · {violations.map((v) => `${v.rule}: ${v.detail}`).join(" | ")}
        </div>
      )}
    </div>
  );
}

/** The catalogue variant: a red strip under the cell instead of a fixed banner. */
export function KitAssertCell({ state, children }: { state: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [violations, setViolations] = useState<Violation[]>([]);
  useEffect(() => {
    const run = () => {
      if (!ref.current) return;
      const v = checkScope(ref.current);
      setViolations(v);
      for (const x of v) console.error(`[kit] ${state}: ${x.rule} — ${x.detail}`);
    };
    const t1 = setTimeout(run, 1600);
    const t2 = setTimeout(run, 4600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [state]);
  return (
    <>
      <div ref={ref}>{children}</div>
      {violations.length > 0 && (
        <p role="alert" className="m-0 mt-1 bg-danger px-2 py-1 font-mono text-[11px] text-canvas">
          {violations.map((v) => `${v.rule}: ${v.detail}`).join(" | ")}
        </p>
      )}
    </>
  );
}

// Exposed for the assertion loop's self-test, which plants known violations and expects them caught.
if (typeof window !== "undefined") (window as unknown as { __kitCheck: typeof checkScope }).__kitCheck = checkScope;
