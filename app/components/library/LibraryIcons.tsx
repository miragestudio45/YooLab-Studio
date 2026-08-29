import type { LibraryGlyph } from '../../lib/library/glyphs';

/**
 * The Library's drawn marks — one grid, one weight, one file.
 *
 * Everything is authored on a 20-unit box with a 2-unit margin, `currentColor`,
 * 1.5 stroke, round caps and joins. That is the whole system, and it is what
 * makes a rail of thirty marks read as one instrument rather than as thirty
 * decisions: a control in the stage rail, a row in the measurement table and a
 * tab in the subject switcher are drawn by the same hand at the same weight.
 *
 * Two rules the previous set broke and this one does not:
 *
 *   1. **Arcs are computed, not eyeballed.** Every `A` command here has its
 *      endpoints on the circle it claims — a rotate arrow whose two ends sit at
 *      different radii is the most visible way a hand-drawn icon set admits it
 *      was traced. The auto-rotate mark is two opposed 300° arcs on the same
 *      r=6.4 circle, so it survives being spun by CSS.
 *   2. **A motion clip is drawn as its action, not as its animal.** The T-rex
 *      carries five clips, and five silhouettes of the same dinosaur at 15 px
 *      are five identical smudges. A bite is a toothed jaw opening, a roar is a
 *      mouth with sound leaving it, a tail sweep is a whip with a direction.
 *
 * `spin` is the one mark with moving parts: it wraps its arcs in `.glyph-turn`
 * so `library.css` can rotate them while auto-rotation is on. That is the only
 * place on this page where an icon reports state by moving, and
 * `prefers-reduced-motion` stops it in the stylesheet, not here.
 */

const MARKS: Record<LibraryGlyph, React.ReactNode> = {
  /* ------------------------------------------------------- stage controls --- */
  rotate: (
    <>
      <path d="M12.96 4.44A6.3 6.3 0 1 0 16.24 10.88" />
      <path d="M15.92 3.93 12.96 4.44 14.19 7.18" />
    </>
  ),
  spin: (
    <g className="glyph-turn">
      <path d="M4.35 7A6.4 6.4 0 1 0 15.85 7.4" />
      <path d="M3.86 4.14 4.35 7 7 5.81" />
      <path d="M15.65 13A6.4 6.4 0 1 0 4.15 12.6" />
      <path d="M16.14 15.86 15.65 13 13 14.19" />
    </g>
  ),
  zoomIn: (
    <>
      <circle cx="9" cy="9" r="4.9" />
      <path d="M12.6 12.6 16.9 16.9" />
      <path d="M6.7 9h4.6M9 6.7v4.6" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="9" cy="9" r="4.9" />
      <path d="M12.6 12.6 16.9 16.9" />
      <path d="M6.7 9h4.6" />
    </>
  ),
  /* Four corner brackets and a centre mark: this control returns the CAMERA to
     its authored frame, so it is drawn as a viewfinder rather than as an undo
     arrow — which would promise to undo the visitor's other choices too. */
  reset: (
    <>
      <path d="M3.3 7.4V4.6a1.3 1.3 0 0 1 1.3-1.3h2.8" />
      <path d="M12.6 3.3h2.8a1.3 1.3 0 0 1 1.3 1.3v2.8" />
      <path d="M16.7 12.6v2.8a1.3 1.3 0 0 1-1.3 1.3h-2.8" />
      <path d="M7.4 16.7H4.6a1.3 1.3 0 0 1-1.3-1.3v-2.8" />
      <circle cx="10" cy="10" r="1.7" />
    </>
  ),
  hotspot: (
    <>
      <circle cx="10" cy="10" r="5.6" strokeDasharray="2.3 2.4" opacity="0.72" />
      <circle cx="10" cy="10" r="1.9" fill="currentColor" stroke="none" />
    </>
  ),
  drag: (
    <>
      <path d="M4.4 10h11.2" />
      <path d="M6.9 7.4 4.3 10l2.6 2.6M13.1 7.4 15.7 10l-2.6 2.6" />
      <circle cx="10" cy="10" r="1.5" fill="currentColor" stroke="none" opacity="0.5" />
    </>
  ),
  scroll: (
    <>
      <rect x="6.9" y="2.9" width="6.2" height="14.2" rx="3.1" />
      <path d="M10 6.1v3.1" />
      <path d="M8.6 13.4 10 14.9l1.4-1.5" opacity="0.6" />
    </>
  ),
  tap: (
    <>
      <circle cx="10" cy="10.6" r="2.2" fill="currentColor" stroke="none" />
      <path d="M4.6 5.2 6.3 6.9M15.4 5.2 13.7 6.9M10 2.9v2.4" opacity="0.62" />
      <path d="M10 15.4v1.9" opacity="0.4" />
    </>
  ),

  /* ---------------------------------------------------------- motion clips --- */
  /* The bee's three flight states, unchanged from the hero's own rail. */
  rest: <path d="M4.6 15.4h10.8M10 4.6v6.6M7.4 8.6 10 11.2l2.6-2.6" />,
  /*
   * Held in place, not moving to a place.
   *
   * A ring with a bar under it, and the ring is r=3.9 rather than the r=2.4 it
   * started at: at the 16 px the rail actually renders, a small ring between two
   * chevrons collapsed into a single dot with two ticks and read as no shape at
   * all. One large ring plus one line survives the size, and the pair of short
   * arrows now sit outside it rather than crowding it.
   */
  hover: (
    <>
      <circle cx="10" cy="9.2" r="3.9" />
      <path d="M5.1 16.4h9.8" opacity="0.6" />
      <path d="M2.9 9.2h1.5M15.6 9.2h1.5" opacity="0.72" />
    </>
  ),
  fly: <path d="M3.4 16.6 16.6 3.4M8.9 3.4h7.7v7.7" />,
  stride: (
    <>
      <path d="M11.3 5.2 16.3 10l-5 4.8" />
      <path d="M3.7 10h5.1" />
      <path d="M5.4 6.3h3M5.4 13.7h3" opacity="0.6" />
    </>
  ),
  /* Upper and lower jaw share their two endpoints, so the mark closes into one
     shape instead of reading as two loose crescents. The depths differ — 4.1
     above, 3.3 below — because a theropod skull does. */
  bite: (
    <>
      <path d="M4.6 10A5.61 5.61 0 0 1 15.4 10" />
      <path d="M15.4 10A6.07 6.07 0 0 1 4.6 10" />
      <path d="M7.4 6.6v1.6M10 5.9v1.7M12.6 6.6v1.6" opacity="0.75" />
      <path d="M8.6 13.1v-1.5M11.4 13.1v-1.5" opacity="0.75" />
    </>
  ),
  roar: (
    <>
      <path d="M8.37 5.96A4.5 4.5 0 0 1 8.37 14.04" />
      <path d="M11.72 4.86A7.4 7.4 0 0 1 11.72 15.14" opacity="0.66" />
      <path d="M15.14 4.75A10.2 10.2 0 0 1 15.14 15.25" opacity="0.38" />
    </>
  ),
  tail: (
    <>
      <path d="M3.6 15.4C7 15.4 8.2 11 10.6 8.4 12.6 6.2 14.6 5.2 16.4 4.8" />
      <path d="M13.7 5.5 16.4 4.8 15.8 7.5" />
      <path d="M4.4 11.8c1.9-.2 2.9-2.4 4.2-4.2" opacity="0.42" />
    </>
  ),

  /* ------------------------------------------------------- readout glyphs --- */
  ruler: (
    <>
      <rect x="2.4" y="7.6" width="15.2" height="4.8" rx="1.3" />
      <path d="M6.4 7.6v2.3M10 7.6v3.1M13.6 7.6v2.3" opacity="0.8" />
    </>
  ),
  weight: (
    <>
      <path d="M7.6 8.2a2.4 2.4 0 0 1 4.8 0" />
      <path d="M6.2 8.2h7.6l1.9 8.1a.9.9 0 0 1-.9 1.1H5.2a.9.9 0 0 1-.9-1.1z" />
    </>
  ),
  era: (
    <>
      <circle cx="10" cy="10" r="6.7" />
      <path d="M10 5.9V10l2.9 1.9" />
    </>
  ),
  pin: (
    <>
      <path d="M10 17.3c3.5-4 5.3-6.8 5.3-8.9A5.3 5.3 0 0 0 4.7 8.4c0 2.1 1.8 4.9 5.3 8.9z" />
      <circle cx="10" cy="8.4" r="2" />
    </>
  ),
  pulse: <path d="M2.5 11h3l1.9-4.9L10.5 15l2-4h5" />,
  speed: (
    <>
      <path d="M3.27 12.05A6.8 6.8 0 0 1 16.73 12.05" />
      <path d="M10 12.4 13.6 8.3" />
      <circle cx="10" cy="12.4" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  'bite-force': (
    <>
      <path d="M4.9 10.4A5.2 5.2 0 0 1 15.1 10.4" />
      <path d="M15.1 10.4A5.6 5.6 0 0 1 4.9 10.4" />
      <path d="M10 3.1v2.6M8.6 4.4 10 3l1.4 1.4" opacity="0.7" />
    </>
  ),
  bone: (
    <>
      <path d="M7.4 7.4 12.6 12.6" />
      <circle cx="6.34" cy="8.46" r="1.9" />
      <circle cx="8.46" cy="6.34" r="1.9" />
      <circle cx="11.54" cy="13.66" r="1.9" />
      <circle cx="13.66" cy="11.54" r="1.9" />
    </>
  ),
  tooth: (
    <path d="M6.1 4.7c1.3-1 2.6-1 3.9 0 1.3-1 2.6-1 3.9 0 1 .8 1.2 2.4.6 5-.4 1.8-.6 4.6-1.4 6.2-.5 1.1-1.6.8-2-.4-.4-1.2-.5-3-1.1-3s-.7 1.8-1.1 3c-.4 1.2-1.5 1.5-2 .4-.8-1.6-1-4.4-1.4-6.2-.6-2.6-.4-4.2.6-5z" />
  ),
  dna: (
    <>
      <path d="M7 3c0 3.6 6 5.4 6 7s-6 3.4-6 7" />
      <path d="M13 3c0 3.6-6 5.4-6 7s6 3.4 6 7" />
      <path d="M7.9 6.3h4.2M6.9 10h6.2M7.9 13.7h4.2" opacity="0.62" />
    </>
  ),
  layers: (
    <>
      <path d="M10 2.9 17 6.6 10 10.3 3 6.6z" />
      <path d="M3 10.5 10 14.2l7-3.7" opacity="0.62" />
      <path d="M3 13.8 10 17.5l7-3.7" opacity="0.34" />
    </>
  ),
  thermo: (
    <>
      <path d="M8.2 11.4V5.1a1.8 1.8 0 0 1 3.6 0v6.3a3.1 3.1 0 1 1-3.6 0z" />
      <path d="M10 8.4v4.6" opacity="0.7" />
    </>
  ),
  drop: <path d="M10 2.8c3.2 4 4.8 6.7 4.8 8.4a4.8 4.8 0 0 1-9.6 0c0-1.7 1.6-4.4 4.8-8.4z" />,
  sun: (
    <>
      <circle cx="10" cy="10" r="3.6" />
      <path d="M10 2.6v1.8M10 15.6v1.8M2.6 10h1.8M15.6 10h1.8M4.8 4.8l1.3 1.3M13.9 13.9l1.3 1.3M15.2 4.8l-1.3 1.3M6.1 13.9l-1.3 1.3" opacity="0.68" />
    </>
  ),
  clip: (
    <>
      <rect x="2.7" y="4.9" width="14.6" height="10.2" rx="1.6" />
      <path d="M2.7 8.1h14.6M2.7 11.9h14.6" opacity="0.4" />
      <path d="M8.6 8.1v3.8" opacity="0.4" />
    </>
  ),
  'scale-micro': (
    <>
      <path d="M5 5.6v8.8M15 5.6v8.8" />
      <path d="M5 10h10" />
      <path d="M7.2 8.2 5.1 10l2.1 1.8M12.8 8.2 14.9 10l-2.1 1.8" opacity="0.72" />
    </>
  ),
  /* A hexagon with its three long diagonals: the least ornamental way to draw
     "this shape was generated, not scanned". */
  geometry: (
    <>
      <path d="M10 3.4 15.72 6.7v6.6L10 16.6 4.28 13.3V6.7z" />
      <path d="M10 3.4v13.2M4.28 6.7l11.44 6.6M15.72 6.7 4.28 13.3" opacity="0.44" />
    </>
  ),
  surface: (
    <>
      <path d="M2.9 13.6h14.2" />
      <path d="M5 13.6V7.4M7.5 13.6V5.9M10 13.6V6.8M12.5 13.6V5.5M15 13.6V7.6" opacity="0.82" />
    </>
  ),

  /* -------------------------------------------------------- panel sections --- */
  structure: (
    <>
      <path d="M10 2.9 17 6.6 10 10.3 3 6.6z" />
      <path d="M3 10.5 10 14.2l7-3.7" opacity="0.62" />
      <path d="M3 13.8 10 17.5l7-3.7" opacity="0.34" />
    </>
  ),
  goals: (
    <>
      <circle cx="10" cy="10" r="6.6" />
      <circle cx="10" cy="10" r="3.2" opacity="0.66" />
      <circle cx="10" cy="10" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  readout: (
    <>
      <path d="M3.27 12.05A6.8 6.8 0 0 1 16.73 12.05" />
      <path d="M10 12.4 13.6 8.3" />
      <circle cx="10" cy="12.4" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  science: (
    <>
      <path d="M5.6 17.1h8.8" />
      <path d="M8.7 17.1c-.4-2.3.2-3.6 1.9-4.6" />
      <path d="M11.1 3.6 14.2 5.5l-4 6.6-3.1-1.9z" />
      <path d="M6.3 8.1 5 10.2" opacity="0.7" />
      <path d="M12.4 13.9h3.2" opacity="0.7" />
    </>
  ),
  curio: (
    <>
      <path d="M9.2 2.9l1.4 3.9 3.9 1.4-3.9 1.4-1.4 3.9-1.4-3.9L3.8 8.2l3.9-1.4z" />
      <path d="M14.8 12.6l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" opacity="0.62" />
    </>
  ),
  context: (
    <>
      <path d="M5.4 4.2v7.6a2.2 2.2 0 0 0 2.2 2.2h6.4" />
      <path d="M5.4 8.3h4.3" opacity="0.62" />
      <circle cx="15.3" cy="14" r="1.6" />
      <circle cx="11.2" cy="8.3" r="1.4" opacity="0.62" />
    </>
  ),
  source: (
    <>
      <path d="M11.4 2.9H6.1a1.6 1.6 0 0 0-1.6 1.6v11a1.6 1.6 0 0 0 1.6 1.6h7.8a1.6 1.6 0 0 0 1.6-1.6V6.9z" />
      <path d="M11.4 2.9v4h4.1" opacity="0.66" />
      <path d="M7.3 10.6h5.4M7.3 13.4h3.6" opacity="0.66" />
    </>
  ),
  search: (
    <>
      <circle cx="8.9" cy="8.9" r="5.1" />
      <path d="M12.7 12.7 17 17" />
    </>
  ),
  /* Three shelves with some slots filled and some waiting — the rail's own mark,
     and the same drawing the empty stage uses at ten times the size. */
  shelf: (
    <>
      <path d="M2.8 6.4h14.4M2.8 11h14.4M2.8 15.6h14.4" opacity="0.78" />
      <path d="M5 3.6h2.6v2.8H5zM9.8 4.5h2.2v1.9H9.8z" fill="currentColor" stroke="none" opacity="0.34" />
      <path d="M5 8.4h2.2v2.6H5z" fill="currentColor" stroke="none" opacity="0.34" />
      <path d="M14 4.2h2.2v2.2H14zM9 8.8h2.6v2.2H9zM5 13.2h2.4v2.4H5z" strokeDasharray="2 2.2" opacity="0.46" />
    </>
  ),

  /* -------------------------------------------------------------- subjects --- */
  /* Seven marks, one per subject, each drawn as the thing the subject studies
     rather than as a letter in a tinted square. A two-letter chip is what the
     proof cards used to do, and it reads as a placeholder for a picture. */
  biology: (
    <>
      <path d="M10 3.1c3.9 0 6.9 3.1 6.9 6.9S13.9 16.9 10 16.9 3.1 13.8 3.1 10 6.1 3.1 10 3.1z" />
      <circle cx="11.4" cy="8.5" r="2.4" />
      <circle cx="6.9" cy="12.2" r="1.2" opacity="0.66" />
      <circle cx="12.6" cy="13.4" r="1" opacity="0.5" />
    </>
  ),
  chemistry: (
    <>
      <path d="M7.9 3.2h4.2" />
      <path d="M8.4 3.2v3.9L4.5 15a1.4 1.4 0 0 0 1.3 2h8.4a1.4 1.4 0 0 0 1.3-2l-3.9-7.9V3.2" />
      <path d="M6.3 12.4h7.4" opacity="0.6" />
    </>
  ),
  physics: (
    <>
      <circle cx="10" cy="10" r="1.7" fill="currentColor" stroke="none" />
      <ellipse cx="10" cy="10" rx="7.1" ry="3.1" transform="rotate(-28 10 10)" />
      <ellipse cx="10" cy="10" rx="7.1" ry="3.1" transform="rotate(28 10 10)" opacity="0.6" />
    </>
  ),
  earth: (
    <>
      <circle cx="10" cy="10" r="6.8" />
      <ellipse cx="10" cy="10" rx="2.9" ry="6.8" />
      <path d="M3.4 10h13.2" opacity="0.66" />
      <path d="M4.4 6.4h11.2M4.4 13.6h11.2" opacity="0.36" />
    </>
  ),
  stem: (
    <>
      <circle cx="10" cy="10" r="3.4" />
      <path d="M10 2.6v2.4M10 15v2.4M2.6 10h2.4M15 10h2.4M4.8 4.8l1.7 1.7M13.5 13.5l1.7 1.7M15.2 4.8l-1.7 1.7M6.5 13.5l-1.7 1.7" />
    </>
  ),
  space: (
    <>
      <circle cx="9.4" cy="9.2" r="4.5" />
      <ellipse cx="10" cy="10.4" rx="8.1" ry="2.7" transform="rotate(-22 10 10.4)" opacity="0.72" />
    </>
  ),
  history: (
    <>
      <path d="M3.4 3.4h13.2" />
      <path d="M4.7 6.1h10.6M4.7 16.6h10.6" opacity="0.8" />
      <path d="M7.1 6.1v10.5M10 6.1v10.5M12.9 6.1v10.5" />
    </>
  ),
};

/**
 * One mark. The wrapper carries the stroke contract so no individual path has to
 * repeat it, and `fill="none"` sits on the `svg` rather than on every path — the
 * few filled marks opt out locally with `stroke="none"`.
 */
export function LibraryIcon({ name, className }: { name: LibraryGlyph; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {MARKS[name]}
    </svg>
  );
}
