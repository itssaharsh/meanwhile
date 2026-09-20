import { ImageResponse } from 'next/og'

export const alt =
  'Meanwhile — a live, AI-directed 3D Earth. Lauterbrunnen, Switzerland is on air, scored 9.4.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/* Put these four files in app/fonts/. ttf/otf/woff only — next/og cannot parse woff2. */
const font = (f: string) =>
  fetch(new URL(`./fonts/${f}`, import.meta.url)).then((r) => r.arrayBuffer())

const C = {
  canvas: '#080b11',
  surface: '#10151d',
  line: '#232d3a',
  ink: '#e8eef4',
  muted: '#94a3b3',
  air: '#f5bd53',
  live: '#43e6d4',
}

/* The mark: day/night disc cut by the terminator. Inlined as a data URI so Satori
   rasterises it without needing SVG-element support. */
const MARK = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">` +
    `<path d="M24 6A6 18 0 0 0 24 42A18 18 0 0 1 24 6Z" fill="${C.live}"/>` +
    `<path d="M24 6A18 18 0 0 1 24 42A6 18 0 0 1 24 6Z" fill="${C.air}"/>` +
    `</svg>`,
)}`

type Row = {
  place: string
  country: string
  score: string
  state: 'air' | 'live' | 'unverified'
}

const RUNNING_ORDER: Row[] = [
  { place: 'Lauterbrunnen', country: 'Switzerland', score: '9.4', state: 'air' },
  { place: 'Reynisfjara', country: 'Iceland', score: '8.8', state: 'live' },
  { place: 'Ha Long Bay', country: 'Vietnam', score: '8.1', state: 'live' },
  { place: 'Shibuya', country: 'Japan', score: '—', state: 'unverified' },
]

export default async function Image() {
  const [display, sans, serif, mono] = await Promise.all([
    font('FunnelDisplay-SemiBold.ttf'),
    font('FunnelSans-Medium.ttf'),
    font('Newsreader-SemiBold.ttf'),
    font('SpaceMono-Regular.ttf'),
  ])

  const tone = (s: Row['state']) =>
    s === 'air' ? C.air : s === 'live' ? C.ink : C.muted

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '1200px',
          height: '630px',
          backgroundColor: C.canvas,
          color: C.ink,
          fontFamily: 'Funnel Sans',
        }}
      >
        {/* ── top rail: the tally and the slate ───────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '72px',
            padding: '0 44px',
            borderBottom: `1px solid ${C.line}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                width: '14px',
                height: '14px',
                borderRadius: '7px',
                backgroundColor: C.air,
                boxShadow: `0 0 0 7px rgba(245,189,83,0.16)`,
                marginRight: '16px',
              }}
            />
            <div
              style={{
                fontFamily: 'Space Mono',
                fontSize: '17px',
                letterSpacing: '0.22em',
                color: C.air,
              }}
            >
              ON AIR
            </div>
            <div
              style={{
                width: '1px',
                height: '18px',
                backgroundColor: C.line,
                margin: '0 20px',
              }}
            />
            <div
              style={{
                fontFamily: 'Space Mono',
                fontSize: '15px',
                letterSpacing: '0.14em',
                color: C.muted,
              }}
            >
              CUT 0412
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              fontFamily: 'Space Mono',
              fontSize: '15px',
              letterSpacing: '0.14em',
              color: C.muted,
            }}
          >
            SUBSOLAR 6.4°N 149.2°E · 14:02:51 UTC
          </div>
        </div>

        {/* ── body: the frame on air, and the running order ───────────── */}
        <div style={{ display: 'flex', flex: 1, padding: '30px 44px 0 44px' }}>
          {/* the frame */}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              flex: 1,
              flexDirection: 'column',
              justifyContent: 'flex-end',
              borderRadius: '14px',
              border: `3px solid ${C.air}`,
              backgroundColor: '#0b1017',
              overflow: 'hidden',
            }}
          >
            {/* the limb — a 2400px circle cropped by the frame */}
            <div
              style={{
                position: 'absolute',
                left: '-780px',
                top: '198px',
                width: '2400px',
                height: '2400px',
                borderRadius: '1200px',
                backgroundColor: '#0e1a21',
                border: `4px solid ${C.live}`,
              }}
            />
            {/* subsolar point */}
            <div
              style={{
                position: 'absolute',
                left: '556px',
                top: '86px',
                width: '54px',
                height: '54px',
                borderRadius: '27px',
                backgroundColor: C.air,
                boxShadow: '0 0 0 20px rgba(245,189,83,0.10)',
              }}
            />

            {/* chyron */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                padding: '24px 28px 26px 28px',
                backgroundColor: 'rgba(8,11,17,0.88)',
                borderTop: `1px solid ${C.line}`,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    display: 'flex',
                    alignSelf: 'flex-start',
                    alignItems: 'center',
                    padding: '5px 10px',
                    marginBottom: '14px',
                    borderRadius: '4px',
                    border: '1px solid rgba(67,230,212,0.38)',
                    fontFamily: 'Space Mono',
                    fontSize: '13px',
                    letterSpacing: '0.16em',
                    color: C.live,
                  }}
                >
                  VERIFIED LIVE · SOURCE 2 MIN AGO
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <div
                    style={{
                      fontFamily: 'Newsreader',
                      fontSize: '58px',
                      lineHeight: 1,
                      color: C.ink,
                    }}
                  >
                    Lauterbrunnen
                  </div>
                  <div
                    style={{
                      fontSize: '22px',
                      lineHeight: 1.1,
                      color: C.muted,
                      marginLeft: '14px',
                    }}
                  >
                    Switzerland
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                }}
              >
                <div
                  style={{
                    fontFamily: 'Space Mono',
                    fontSize: '12px',
                    letterSpacing: '0.22em',
                    color: C.muted,
                    marginBottom: '4px',
                  }}
                >
                  BEAUTY
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <div
                    style={{
                      fontFamily: 'Funnel Display',
                      fontSize: '66px',
                      lineHeight: 1,
                      letterSpacing: '-0.03em',
                      color: C.air,
                    }}
                  >
                    9.4
                  </div>
                  <div
                    style={{
                      fontFamily: 'Funnel Display',
                      fontSize: '28px',
                      lineHeight: 1.6,
                      color: C.muted,
                      marginLeft: '4px',
                    }}
                  >
                    /10
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* running order */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '316px',
              marginLeft: '28px',
            }}
          >
            <div
              style={{
                display: 'flex',
                fontFamily: 'Space Mono',
                fontSize: '12px',
                letterSpacing: '0.22em',
                color: C.muted,
                paddingBottom: '13px',
                borderBottom: `1px solid ${C.line}`,
              }}
            >
              RUNNING ORDER
            </div>
            {RUNNING_ORDER.map((r) => (
              <div
                key={r.place}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '15px 0',
                  borderBottom: `1px solid ${C.line}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div
                    style={{
                      display: 'flex',
                      width: '7px',
                      height: '7px',
                      borderRadius: '4px',
                      marginRight: '12px',
                      backgroundColor:
                        r.state === 'air'
                          ? C.air
                          : r.state === 'live'
                            ? C.live
                            : C.line,
                    }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div
                      style={{
                        fontFamily: 'Newsreader',
                        fontSize: '21px',
                        lineHeight: 1.15,
                        color: tone(r.state),
                      }}
                    >
                      {r.place}
                    </div>
                    <div
                      style={{
                        fontFamily: 'Space Mono',
                        fontSize: '11px',
                        letterSpacing: '0.14em',
                        color: C.muted,
                      }}
                    >
                      {r.state === 'unverified'
                        ? 'NO TIMESTAMP'
                        : r.country.toUpperCase()}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: 'Space Mono',
                    fontSize: '18px',
                    color: tone(r.state),
                  }}
                >
                  {r.score}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── bottom rail: the lockup ─────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '92px',
            padding: '0 44px',
            borderTop: `1px solid ${C.line}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* lockup at 38px: disc = 1.3 x cap (33.3px) -> 44px box;
                gap = 0.5 x disc; marginTop nudges the disc centre onto
                the x-height middle. */}
            <img
              src={MARK}
              width={44}
              height={44}
              alt=""
              style={{ marginTop: '9.5px', marginRight: '8px' }}
            />
            <div
              style={{
                fontFamily: 'Funnel Display',
                fontSize: '38px',
                lineHeight: 1,
                letterSpacing: '-0.03em',
                color: C.ink,
              }}
            >
              Meanwhile
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              fontFamily: 'Space Mono',
              fontSize: '16px',
              letterSpacing: '0.06em',
              color: C.muted,
            }}
          >
            honorable-opossum-473.convex.site
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Funnel Display', data: display, weight: 600, style: 'normal' },
        { name: 'Funnel Sans', data: sans, weight: 500, style: 'normal' },
        { name: 'Newsreader', data: serif, weight: 600, style: 'normal' },
        { name: 'Space Mono', data: mono, weight: 400, style: 'normal' },
      ],
    },
  )
}
