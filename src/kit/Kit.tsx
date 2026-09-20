import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { cn } from "@/lib/utils";
import { ADDED, renderAdded, type AddedKey } from "@/lib/copy";
import { LogoMark, Wordmark, EnvelopeArc, TrackToRing, DotBetweenArcs, ClockBeforeThree } from "@/components/brand";
import { PhoneFrame } from "./KitApp";
import { ALL_STATES, Isolated, KIT, cellClass, findState, type Frame, type KitCtx } from "./registry";
import { KitAssert, KitAssertCell } from "./assertions";
import { LiveFetch } from "./LiveFetch";

// /_kit — every component in every state from its Acceptance line, the type scale, the logo
// at three sizes, and the copy audit. `?state=<id>` renders one state alone at the viewport's
// own size (the QA loop screenshots those). Harness chrome is plain mono labels; the product's
// strings appear only inside the components.

const TOKENS: { name: string; hex: string; claim: string }[] = [
  { name: "--canvas", hex: "#080b11", claim: "page ground" },
  { name: "--surface-1", hex: "#10151d", claim: "dock, cards, sheets" },
  { name: "--surface-2", hex: "#18202a", claim: "raised rows, hover fills" },
  { name: "--line", hex: "#232d3a", claim: "separators, idle borders" },
  { name: "--line-strong", hex: "#33404f", claim: "hover borders" },
  { name: "--ink", hex: "#e8eef4", claim: "primary text" },
  { name: "--ink-muted", hex: "#94a3b3", claim: "secondary text · the unverified state" },
  { name: "--accent", hex: "#f5bd53", claim: "ON AIR only" },
  { name: "--accent-ink", hex: "#1a1204", claim: "text on amber" },
  { name: "--live", hex: "#43e6d4", claim: "VERIFIED-FRESH only" },
  { name: "--success", hex: "#5fd39a", claim: "delivery confirmed" },
  { name: "--danger", hex: "#ff6f60", claim: "destructive or failed" },
];

const TYPE = [
  { token: "3xl · 44", cls: "font-display text-[44px] leading-[1.1] font-semibold tracking-[-0.03em]", sample: "9.6 on air" },
  { token: "2xl · 32", cls: "font-display text-[32px] leading-[1.1] font-semibold tracking-[-0.03em]", sample: "The running order" },
  { token: "xl · 24", cls: "font-display text-[24px] leading-[1.3] font-semibold tracking-[-0.03em]", sample: "Off air" },
  { token: "lg · 18", cls: "font-place text-[18px] leading-[1.3] font-semibold tracking-[-0.01em]", sample: "Tromsø, Norway" },
  { token: "base · 15", cls: "font-sans text-[15px] leading-[1.6]", sample: "Sunlight spills across the fjord waters, casting a warm golden glow on the rolling hills." },
  { token: "sm · 13", cls: "font-sans text-[13px] leading-[1.5] text-ink-muted", sample: "Picking the next view · 11 frames scored" },
  { token: "xs · 11", cls: "font-mono text-[11px] tracking-[0.14em] uppercase text-ink-muted tnum", sample: "On air · 12 min · 15:04 UTC" },
];

const ROLES = [
  { role: "--ff-display", cls: "font-display font-semibold tracking-[-0.03em]", use: "Funnel Display 600 · headings, ident, big numerals" },
  { role: "--ff-body", cls: "font-sans", use: "Funnel Sans 400/500 · all running text" },
  { role: "--ff-place", cls: "font-place font-semibold", use: "Newsreader 600 · place names only" },
  { role: "--ff-mono", cls: "font-mono tnum", use: "Space Mono 400 · scores, times, ages, ids, stages" },
];

const H = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <h2 id={id} className="m-0 scroll-mt-20 font-mono text-[11px] font-normal tracking-[0.14em] text-ink-muted uppercase">
    {children}
  </h2>
);

function Embed({ id, frame }: { id: string; frame: Frame }) {
  const phone = frame === "phone";
  const w = phone ? 390 : 1440;
  const h = phone ? 844 : 900;
  const scale = phone ? 0.5 : 0.44;
  // Mounted only while near the viewport and unmounted when scrolled away, so every embed can
  // run the live globe without the page ever holding more than a handful of WebGL contexts.
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: "300px 0px" });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="overflow-hidden rounded-md border border-line bg-canvas" style={{ width: w * scale, height: h * scale }}>
      {near && (
        <iframe
          src={`/_kit?state=${id}&inframe=1`}
          title={id}
          className="origin-top-left border-0"
          style={{ width: w, height: h, transform: `scale(${scale})` }}
        />
      )}
    </div>
  );
}

function Catalogue() {
  const ctx: KitCtx = { isolated: false, globe: "slate" };
  // The anchor doesn't exist when the browser first tries the #hash; jump once it does.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-[70] flex h-14 items-center gap-6 border-b border-line bg-canvas px-5">
        <Wordmark size={22} />
        <span className="font-mono text-[11px] tracking-[0.14em] text-ink-muted uppercase">/_kit</span>
        <nav className="flex min-w-0 gap-3 overflow-x-auto font-mono text-[11px] text-ink-muted [scrollbar-width:none]">
          {["tokens", "type", "logo", "copy", ...KIT.map((s) => s.id)].map((a) => (
            <a key={a} href={`#${a}`} className="shrink-0 hover:text-ink">
              {a}
            </a>
          ))}
        </nav>
      </header>

      <main className="mx-auto flex max-w-[1440px] flex-col gap-16 px-5 py-10">
        <section className="flex flex-col gap-4">
          <H id="tokens">Tokens · DESIGN.md</H>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {TOKENS.map((t) => (
              <div key={t.name} className="flex items-center gap-3 rounded-md border border-line p-2">
                <span className="size-10 shrink-0 rounded-sm border border-line" style={{ background: t.hex }} />
                <span className="flex min-w-0 flex-col">
                  <span className="font-mono text-[11px] text-ink">{t.name}</span>
                  <span className="font-mono text-[11px] text-ink-muted">{t.hex}</span>
                  <span className="truncate font-sans text-[12px] text-ink-muted">{t.claim}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="m-0 font-mono text-[11px] text-ink-muted">radii 2 · 6 · 12 — no --warning token exists — one shadow (the mobile sheet)</p>
        </section>

        <section className="flex flex-col gap-4">
          <H id="type">Type scale · four roles</H>
          <div className="flex flex-col divide-y divide-line rounded-md border border-line">
            {TYPE.map((t) => (
              <div key={t.token} className="flex items-baseline gap-6 px-4 py-3 max-sm:flex-col max-sm:gap-1">
                <span className="w-24 shrink-0 font-mono text-[11px] text-ink-muted">{t.token}</span>
                <span className={t.cls}>{t.sample}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
            {ROLES.map((r) => (
              <div key={r.role} className="flex flex-col gap-1 rounded-md border border-line p-3">
                <span className={cn("text-[28px] leading-[1.2]", r.cls)}>Reykjavík 8.4</span>
                <span className="font-mono text-[11px] text-ink-muted">{r.role}</span>
                <span className="font-sans text-[12px] text-ink-muted">{r.use}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <H id="logo">Logo · 16 / 32 / 128</H>
          <div className="flex flex-wrap items-end gap-10 rounded-md border border-line p-6">
            {[16, 32, 128].map((s) => (
              <div key={s} className="flex flex-col items-center gap-2">
                <LogoMark size={s} />
                <span className="font-mono text-[11px] text-ink-muted">{s}px</span>
              </div>
            ))}
            {[16, 32].map((s) => (
              <div key={`f${s}`} className="flex flex-col items-center gap-2">
                <LogoMark size={s} favicon />
                <span className="font-mono text-[11px] text-ink-muted">icon.svg {s}px</span>
              </div>
            ))}
            <div className="flex flex-col gap-2">
              <Wordmark size={64} />
              <span className="font-mono text-[11px] text-ink-muted">wordmark 64px</span>
            </div>
            <div className="flex items-center gap-5 text-ink">
              <EnvelopeArc size={20} />
              <TrackToRing size={20} />
              <DotBetweenArcs size={20} />
              <DotBetweenArcs size={20} lit />
              <span className="text-live">
                <ClockBeforeThree size={20} />
              </span>
              <span className="text-ink-muted">
                <ClockBeforeThree size={20} />
              </span>
              <span className="font-mono text-[11px] text-ink-muted">glyphs 20px</span>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <H id="copy">Copy audit · strings not in COPY.md, approved ({Object.keys(ADDED).length})</H>
          <p className="m-0 max-w-[80ch] font-sans text-[13px] text-ink-muted">
            Everything else on this page is COPY.md verbatim. These are the strings added beyond it — UI-SPEC.md’s wording, approved as rendered,
            plus the three copy calls — each rendered with the arguments its call site passes.
          </p>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full border-collapse text-left">
              <tbody>
                {Object.entries(ADDED).map(([k, v]) => (
                  <tr key={k} className="border-b border-line last:border-b-0">
                    <td className="px-3 py-2 align-top font-mono text-[11px] text-ink-muted">{k}</td>
                    <td className="px-3 py-2 align-top font-sans text-[13px] text-ink">
                      {renderAdded(k as AddedKey)}
                    </td>
                    <td className="px-3 py-2 align-top font-mono text-[11px] text-ink-muted">{v.source}</td>
                    <td className="px-3 py-2 align-top font-mono text-[11px] text-ink-muted">{v.usedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {KIT.map((section) => (
          <section key={section.id} className="flex flex-col gap-5">
            <H id={section.id}>
              {section.id} · {section.name}
            </H>
            <div className="flex flex-wrap items-start gap-x-6 gap-y-8">
              {section.states.map((st) => {
                const wide = st.frame === "bar" || st.frame === "rail";
                const embed = st.frame === "app" || st.frame === "phone" || st.frame === "globe";
                return (
                  <figure key={st.id} className={cn("m-0 flex min-w-0 flex-col gap-2", wide && "w-full")}>
                    <figcaption className="flex items-center gap-2 font-mono text-[11px] text-ink-muted">
                      <a href={`/_kit?state=${st.id}`} className="text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink-muted">
                        ?state={st.id}
                      </a>
                      {st.extra && <span>· extra</span>}
                      {st.live && <span>· loops</span>}
                    </figcaption>
                    {embed ? (
                      <Embed id={st.id} frame={st.frame} />
                    ) : (
                      <KitAssertCell state={st.id}>
                        <div className={cn(cellClass(st.frame), wide && "w-full overflow-hidden rounded-md border border-line")}>{st.render(ctx)}</div>
                      </KitAssertCell>
                    )}
                  </figure>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

export function Kit() {
  const [params] = useSearchParams();
  const id = params.get("state");
  const inframe = params.get("inframe") === "1";
  const country = params.get("country") ?? undefined;
  const ctx: KitCtx = { isolated: true, globe: params.get("globe") === "slate" ? "slate" : "live" };

  if (!id) return <Catalogue />;
  // For the screenshot/assertion loop: every state id, as JSON.
  if (id === "__list") return <pre id="kit-states">{JSON.stringify(ALL_STATES.map((s) => ({ id: s.id, frame: s.frame })))}</pre>;
  const st = findState(id);
  if (!st) {
    return (
      <div className="min-h-dvh bg-canvas p-8 font-mono text-[12px] text-ink-muted">
        unknown state “{id}” — known: {ALL_STATES.map((s) => s.id).join(", ")}
      </div>
    );
  }
  // Mobile-only states on a wide screen: show them in a 390×844 frame that is its own viewport.
  if (st.frame === "live") return <LiveFetch country={country} />;
  if (st.frame === "phone" && !inframe && window.innerWidth >= 640) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas py-8">
        <PhoneFrame>
          <iframe src={`/_kit?state=${id}&inframe=1${ctx.globe === "slate" ? "&globe=slate" : ""}`} title={id} className="size-full border-0" />
        </PhoneFrame>
      </div>
    );
  }
  return (
    <KitAssert state={id} whole>
      <Isolated id={id} ctx={ctx} />
    </KitAssert>
  );
}
