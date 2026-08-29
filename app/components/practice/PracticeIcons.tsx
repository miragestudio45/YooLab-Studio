import type { PracticeGlyph } from '../../lib/practice/glyphs';

/**
 * The practice hub's drawn marks.
 *
 * Same contract as `LibraryIcons`: one 20-unit box with a 2-unit margin,
 * `currentColor`, 1.5 stroke, round caps and joins. That is not a style choice
 * repeated for tidiness — it is the reason a coral capability row in this
 * section and a control in the Library's stage rail read as the same
 * instrument. A second icon set at a second weight would be the fastest
 * possible way to make this page look assembled from parts.
 *
 * Each mark is the *action*, not the machine. Three silhouettes of a drone at
 * 16 px are three identical smudges; a takeoff is an aircraft with a rising
 * arrow under it, a route is a path through two gates, a landing is a descent
 * onto a marked pad. Only the three rail marks — car, drone, robot — draw the
 * object itself, because there the object is what is being named.
 */
const MARKS: Record<PracticeGlyph, React.ReactNode> = {
  /* --------------------------------------------------------------- formula --- */
  /* Side elevation: nose, cockpit hump, rear wing, two wheels on the ground
     line. A three-quarter view would be more flattering and completely
     unreadable at 22 px. */
  car: (
    <>
      <path d="M2.4 12.6h1.9l1.5-2.4h5.4l1.6 2.4h4.8" />
      <path d="M9 10.2 10.6 7.4h2.1" />
      <path d="M15.6 7.6h2.2v2.3" />
      <circle cx="6.3" cy="14.1" r="1.6" />
      <circle cx="14.2" cy="14.1" r="1.6" />
    </>
  ),
  /* Two parts and the gap between them, with the join marked. */
  assemble: (
    <>
      <path d="M3.2 6.5h5.1v5.1H3.2z" />
      <path d="M11.7 8.4h5.1v5.1h-5.1z" />
      <path d="M8.3 9.1h3.4" strokeDasharray="1.2 1.4" />
      <path d="M6.4 11.6v2.6h3.1" />
    </>
  ),
  /* An eye inside a frame: looking at something, not merely an eye. */
  inspect: (
    <>
      <path d="M3.4 4.6h13.2v10.8H3.4z" />
      <path d="M5.9 10c1.5-2 2.9-3 4.1-3s2.6 1 4.1 3c-1.5 2-2.9 3-4.1 3s-2.6-1-4.1-3Z" />
      <circle cx="10" cy="10" r="1.15" />
    </>
  ),
  /* A steering wheel — the verb, where `car` is the noun. */
  drive: (
    <>
      <circle cx="10" cy="10" r="6.6" />
      <circle cx="10" cy="10" r="2.1" />
      <path d="M10 7.9V3.4M8.2 11.1 4.4 13.6M11.8 11.1l3.8 2.5" />
    </>
  ),

  /* ----------------------------------------------------------------- drone --- */
  /* Plan view: an X frame with four rotor discs. The only orientation in which
     a quadrotor is instantly a quadrotor. */
  drone: (
    <>
      <path d="M6.6 6.6 13.4 13.4M13.4 6.6 6.6 13.4" />
      <rect x="8.4" y="8.4" width="3.2" height="3.2" rx="0.8" />
      <circle cx="5.4" cy="5.4" r="2" />
      <circle cx="14.6" cy="5.4" r="2" />
      <circle cx="5.4" cy="14.6" r="2" />
      <circle cx="14.6" cy="14.6" r="2" />
    </>
  ),
  takeoff: (
    <>
      <path d="M5.6 8.4h8.8" />
      <circle cx="4.4" cy="8.4" r="1.3" />
      <circle cx="15.6" cy="8.4" r="1.3" />
      <path d="M10 8.4v2.2" />
      <path d="M10 16.6V12M8.1 13.6 10 11.7l1.9 1.9" />
    </>
  ),
  /* Two gates and the line through them. */
  route: (
    <>
      <ellipse cx="6.6" cy="7.4" rx="2.5" ry="3.1" />
      <ellipse cx="14.4" cy="12.4" rx="2.5" ry="3.1" />
      <path d="M3.1 15.4c2.6 0 3-6.1 6-6.1 2.4 0 2.6 3.4 4.6 3.4" strokeDasharray="1.6 1.5" />
    </>
  ),
  landing: (
    <>
      <path d="M5.6 6.2h8.8" />
      <circle cx="4.4" cy="6.2" r="1.3" />
      <circle cx="15.6" cy="6.2" r="1.3" />
      <path d="M10 6.2v4.4M8.1 8.9 10 10.8l1.9-1.9" />
      <path d="M4.6 15.2h10.8" />
      <path d="M6.6 15.2v2M13.4 15.2v2" opacity="0.55" />
    </>
  ),

  /* ----------------------------------------------------------------- robot --- */
  /* The arm in its own resting pose: pedestal, upper arm, forearm, gripper. */
  robot: (
    <>
      <path d="M4.6 17h5.2" />
      <path d="M7.2 17v-2.3" />
      <path d="M7.2 14.7 6.1 8.2l6.2-2.1" />
      <path d="M12.3 6.1l3.1 3.1" />
      <path d="M14.2 10.4 16.6 8" />
      <circle cx="6.1" cy="8.2" r="1.1" />
      <path d="M14 11.6l1.5 1.5M17 11.6l-1.5 1.5" />
    </>
  ),
  /* One joint, with the arc it turns through. */
  joint: (
    <>
      <circle cx="10" cy="10" r="2.2" />
      <path d="M10 7.8V3.6" />
      <path d="M11.6 11.6 15.4 15.4" />
      <path d="M14.9 5.6a6.3 6.3 0 0 1 1.4 4" />
    </>
  ),
  /* Two jaws closing on a block. */
  grip: (
    <>
      <rect x="7.6" y="10.2" width="4.8" height="4.8" rx="0.7" />
      <path d="M6.1 5.2v4.1a1.4 1.4 0 0 0 1.4 1.4" />
      <path d="M13.9 5.2v4.1a1.4 1.4 0 0 1-1.4 1.4" />
      <path d="M4.4 5.2h3.4M12.2 5.2h3.4" />
    </>
  ),
  /* A cycle arrow around a workpiece: the sequence repeating itself. */
  auto: (
    <>
      <rect x="8.1" y="8.1" width="3.8" height="3.8" rx="0.7" />
      <path d="M4.6 12.4A5.9 5.9 0 0 1 9.4 3.7" />
      <path d="M15.4 7.6a5.9 5.9 0 0 1-4.8 8.7" />
      <path d="M8.2 2.4 9.6 3.8 8.2 5.2" />
      <path d="M11.8 17.6l-1.4-1.4 1.4-1.4" />
    </>
  ),

  /* ----------------------------------------------------- poster tool hints --- */
  /*
   * These three sit on the poster's pill and answer the one question a still
   * image cannot: what happens when I click it. So each is the *gesture*, not
   * the result — a cube with an orbit ring around it rather than a globe, a
   * loupe with a plus rather than a lens, a stack being separated rather than a
   * stack.
   */
  orbit: (
    <>
      <path d="M10 4.1 14.6 6.7v5.2L10 14.5 5.4 11.9V6.7Z" />
      <path d="M5.4 6.7 10 9.3l4.6-2.6M10 9.3v5.2" opacity="0.55" />
      <path d="M3.4 14.6a8.4 8.4 0 0 0 13.2 0" strokeDasharray="1.5 1.6" />
    </>
  ),
  zoom: (
    <>
      <circle cx="9" cy="9" r="5.2" />
      <path d="M12.8 12.8 16.6 16.6" />
      <path d="M9 6.8v4.4M6.8 9h4.4" />
    </>
  ),
  layers: (
    <>
      <path d="M10 2.8 16.8 6 10 9.2 3.2 6Z" />
      <path d="M3.2 10 10 13.2 16.8 10" strokeDasharray="1.4 1.5" />
      <path d="M3.2 14 10 17.2 16.8 14" opacity="0.45" />
    </>
  ),
  /* A dial with its needle off-centre: an instrument reading, not a clock. */
  gauge: (
    <>
      <path d="M3.6 13.4a6.9 6.9 0 1 1 12.8 0" />
      <path d="M10 11.4 13.1 8" />
      <circle cx="10" cy="12.4" r="1.15" />
      <path d="M3.6 13.4h2M14.4 13.4h2" />
    </>
  ),

  /* ---------------------------------------------------------- bottom strip --- */
  shield: (
    <>
      <path d="M10 3.2 15.6 5.4v4.2c0 3.3-2.2 5.9-5.6 7.2-3.4-1.3-5.6-3.9-5.6-7.2V5.4Z" />
      <path d="M7.6 9.9 9.4 11.7 12.6 8.4" />
    </>
  ),
  repeat: (
    <>
      <path d="M4.2 9.1A5.9 5.9 0 0 1 14.9 6.4" />
      <path d="M15.8 10.9A5.9 5.9 0 0 1 5.1 13.6" />
      <path d="M15.4 3.6v2.9h-2.9" />
      <path d="M4.6 16.4v-2.9h2.9" />
    </>
  ),
  /* Three stacked planes seen on edge: looking *into* a thing, not at it. */
  depth: (
    <>
      <path d="M10 3.4 17 6.6 10 9.8 3 6.6Z" />
      <path d="M3 10.2 10 13.4l7-3.2" opacity="0.7" />
      <path d="M3 13.6 10 16.8l7-3.2" opacity="0.42" />
    </>
  ),
  /* A reading that has just arrived: a needle and its two rising steps. */
  signal: (
    <>
      <path d="M3.6 16.4h12.8" />
      <path d="M6.2 16.4v-3.6M10 16.4V8.6M13.8 16.4v-5.6" />
      <path d="M5 6.2 8.4 9.6 11 7l3.6 3.6" opacity="0.5" />
    </>
  ),

  /* ------------------------------------------------------------ lab chrome --- */
  restart: (
    <>
      <path d="M16.1 10a6.1 6.1 0 1 1-1.9-4.4" />
      <path d="M16.4 3.2v3.5h-3.5" />
    </>
  ),
  hint: (
    <>
      <path d="M7.7 14.2a4.9 4.9 0 1 1 4.6 0v1.6H7.7Z" />
      <path d="M8.4 17.4h3.2" />
    </>
  ),
  check: (
    <>
      <circle cx="10" cy="10" r="6.8" />
      <path d="M6.8 10.2 9 12.4l4.2-4.6" />
    </>
  ),

  /* ---------------------------------------------------------- modal chrome --- */
  star: (
    <path d="M10 3.2l2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 13.9l-4.2 2.3.8-4.7L3.2 8.2l4.7-.7Z" />
  ),
  /* Four corners pushing outward. Reads as "make this bigger" at 14 px, which
     a diagonal double-arrow does not. */
  expand: (
    <>
      <path d="M3.4 7.6V3.4h4.2M16.6 7.6V3.4h-4.2" />
      <path d="M3.4 12.4v4.2h4.2M16.6 12.4v4.2h-4.2" />
    </>
  ),
  collapse: (
    <>
      <path d="M7.6 3.4v4.2H3.4M12.4 3.4v4.2h4.2" />
      <path d="M7.6 16.6v-4.2H3.4M12.4 16.6v-4.2h4.2" />
    </>
  ),
  close: <path d="M5.4 5.4 14.6 14.6M14.6 5.4 5.4 14.6" />,
  play: <path d="M7.2 4.6 15.4 10l-8.2 5.4Z" />,
  pause: (
    <>
      <path d="M7.4 4.8v10.4M12.6 4.8v10.4" strokeWidth="2.2" />
    </>
  ),
  /* A point being written down: the crosshair plus the mark it leaves. */
  teach: (
    <>
      <circle cx="10" cy="10" r="2.1" />
      <path d="M10 3.2v2.6M10 14.2v2.6M3.2 10h2.6M14.2 10h2.6" />
      <path d="M13.4 13.4 16.8 16.8" opacity="0.5" />
    </>
  ),
};

export function PracticeIcon({ name, className }: { name: PracticeGlyph; className?: string }) {
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
