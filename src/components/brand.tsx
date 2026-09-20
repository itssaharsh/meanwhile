import type { SVGProps } from "react";

// brand/ as React. Paths are copied from the SVG files unchanged.

/** The mark: a disc cut by the terminator, teal night limb and amber day. r = 18 on the 48
 *  grid (brand/logo-mark.svg). Below ~12px the night side anti-aliases away; `favicon` uses
 *  brand/icon.svg's r = 22 cut, drawn for a 16px tab. */
export function LogoMark({ size = 32, favicon = false, title = "Meanwhile" }: { size?: number; favicon?: boolean; title?: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label={title}>
      {favicon ? (
        <>
          <path d="M24 2A7 22 0 0 0 24 46A22 22 0 0 1 24 2Z" fill="#43e6d4" />
          <path d="M24 2A22 22 0 0 1 24 46A7 22 0 0 1 24 2Z" fill="#f5bd53" />
        </>
      ) : (
        <>
          <path d="M24 6A6 18 0 0 0 24 42A18 18 0 0 1 24 6Z" fill="#43e6d4" />
          <path d="M24 6A18 18 0 0 1 24 42A6 18 0 0 1 24 6Z" fill="#f5bd53" />
        </>
      )}
    </svg>
  );
}

/** The wordmark, whose dotless ı carries the mark as its tittle (brand/wordmark.html). */
export function Wordmark({ size = 64 }: { size?: number }) {
  return (
    <span className="mw-wordmark mw-wordmark--marked" role="img" aria-label="Meanwhile" style={{ ["--mw-size" as string]: `${size}px` }}>
      Meanwh
      <span className="mw-i" aria-hidden="true">
        {String.fromCharCode(0x131)}
        <svg className="mw-tittle" viewBox="0 0 48 48" aria-hidden="true">
          <path d="M24 6A6 18 0 0 0 24 42A18 18 0 0 1 24 6Z" fill="#43e6d4" />
          <path d="M24 6A18 18 0 0 1 24 42A6 18 0 0 1 24 6Z" fill="#f5bd53" />
        </svg>
      </span>
      le
    </span>
  );
}

type GlyphProps = SVGProps<SVGSVGElement> & { size?: number };
const glyph = ({ size = 20, ...props }: GlyphProps) => ({
  viewBox: "0 0 24 24",
  width: size,
  height: size,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...props,
});

/** send-this */
export const EnvelopeArc = (props: GlyphProps) => (
  <svg {...glyph(props)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7.4Q12 15.6 21 7.4" />
  </svg>
);

/** fly-to */
export const TrackToRing = (props: GlyphProps) => (
  <svg {...glyph(props)}>
    <path d="M3 19.5C8 19.5 10.6 14.4 13 12" />
    <circle cx="17" cy="8" r="3" />
  </svg>
);

/** on-air; `lit` fills the centre circle and changes nothing else */
export const DotBetweenArcs = ({ lit = false, ...props }: GlyphProps & { lit?: boolean }) => (
  <svg {...glyph(props)}>
    <circle cx="12" cy="12" r="2.75" fill={lit ? "currentColor" : "none"} />
    <path d="M6.5 7.5A7 7 0 0 0 6.5 16.5" />
    <path d="M17.5 7.5A7 7 0 0 1 17.5 16.5" />
  </svg>
);

/** verified-fresh: a timestamp reading just before three, not a checkmark */
export const ClockBeforeThree = (props: GlyphProps) => (
  <svg {...glyph(props)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 6.5V12l3.9-2.25" />
  </svg>
);
