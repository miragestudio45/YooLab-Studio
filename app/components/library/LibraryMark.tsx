import type { ReactNode } from 'react';
import type { MarkId } from '../../lib/library/types';

/**
 * The drawn half of the rail illustrations.
 *
 * A rail row without a picture is the weak row — every row looks like every
 * other one and the list reads as a menu rather than as a collection. Meshes get
 * a real baked render (see `RailVisual`), but most of the Library is not a mesh:
 * a periodic table, a wave, a circuit, a cell type. Those get a diagram of the
 * concept.
 *
 * Three constraints keep nineteen hand-drawn marks looking like one set rather
 * than like nineteen icons from nineteen sources:
 *
 *   - one viewBox, `0 0 40 40`, for all of them. Optical weight lands in the
 *     same place in every 56 px slot, so a scrolling rail does not jitter.
 *   - `fill: none; stroke: currentColor` at a single stroke width. `currentColor`
 *     is inherited from the row, which sets it to the subject tint — so Biology
 *     marks are sage, Physics marks are lavender, and the colour coding costs
 *     nothing per mark.
 *   - at most one accent group filled at low opacity, to say what the subject of
 *     the drawing is (the nucleus, the highlighted element, the block on the
 *     slope). More than one and the mark stops reading at 56 px.
 *
 * They are diagrams, not glyphs: `molecule` is drawn at the real 104.5° water
 * bond angle, `atom-grid` has the periodic table's s/p-block gap, `circuit` uses
 * the IEC rectangle for a resistor because that is the symbol in the Vietnamese
 * curriculum. A student who already knows the diagram recognises the row before
 * reading it, which is the entire point.
 */

const MARKS: Record<MarkId, ReactNode> = {
  /* ------------------------------------------------------------- biology --- */
  cell: (
    <>
      <circle cx="20" cy="20" r="14.2" />
      <circle cx="17.4" cy="17.6" r="5.4" fill="currentColor" fillOpacity="0.15" stroke="none" />
      <circle cx="17.4" cy="17.6" r="5.4" />
      <circle cx="18.7" cy="18.6" r="1.4" />
      <g transform="rotate(-28 26.8 25.6)">
        <ellipse cx="26.8" cy="25.6" rx="4.4" ry="2.4" />
        <path d="M23.4 25.6h6.8" opacity="0.5" />
      </g>
      <circle cx="12.4" cy="26.2" r="2.6" />
    </>
  ),
  'cell-plant': (
    <>
      <rect x="4.4" y="7.6" width="31.2" height="24.8" rx="3.2" />
      <rect x="7" y="10.2" width="26" height="19.6" rx="2.4" opacity="0.5" />
      <circle cx="14" cy="20" r="4.4" />
      <circle cx="15.1" cy="20.9" r="1.2" />
      <g fill="currentColor" fillOpacity="0.16" stroke="none">
        <ellipse cx="25.2" cy="15.4" rx="4.1" ry="2.2" transform="rotate(-22 25.2 15.4)" />
        <ellipse cx="26.4" cy="24.6" rx="4.1" ry="2.2" transform="rotate(14 26.4 24.6)" />
      </g>
      <ellipse cx="25.2" cy="15.4" rx="4.1" ry="2.2" transform="rotate(-22 25.2 15.4)" />
      <ellipse cx="26.4" cy="24.6" rx="4.1" ry="2.2" transform="rotate(14 26.4 24.6)" />
    </>
  ),
  'cell-blood': (
    <>
      <circle cx="20" cy="20" r="13.6" />
      <g fill="currentColor" fillOpacity="0.14" stroke="none">
        <circle cx="15.4" cy="16.6" r="4.1" />
        <circle cx="24.4" cy="17.6" r="3.7" />
        <circle cx="19.6" cy="25.2" r="4" />
      </g>
      <circle cx="15.4" cy="16.6" r="4.1" />
      <circle cx="24.4" cy="17.6" r="3.7" />
      <circle cx="19.6" cy="25.2" r="4" />
      <path d="M19 18.3q1.9 1.1 3.1.6M17 20.4q.9 1.6 2 2.1" opacity="0.6" />
    </>
  ),
  'cell-epithelial': (
    <>
      <path d="M4.6 31.4h30.8" />
      <rect x="6.6" y="11.4" width="8" height="20" rx="1.8" />
      <rect x="16" y="9.4" width="8" height="22" rx="1.8" fill="currentColor" fillOpacity="0.13" stroke="none" />
      <rect x="16" y="9.4" width="8" height="22" rx="1.8" />
      <rect x="25.4" y="12.6" width="8" height="18.8" rx="1.8" />
      <circle cx="10.6" cy="22.6" r="2.1" />
      <circle cx="20" cy="20.8" r="2.1" />
      <circle cx="29.4" cy="23.4" r="2.1" />
    </>
  ),
  'cell-muscle': (
    <>
      <rect x="4.4" y="10" width="31.2" height="6.4" rx="2.2" />
      <rect x="4.4" y="18.8" width="31.2" height="6.4" rx="2.2" fill="currentColor" fillOpacity="0.13" stroke="none" />
      <rect x="4.4" y="18.8" width="31.2" height="6.4" rx="2.2" />
      <rect x="4.4" y="27.6" width="31.2" height="6.4" rx="2.2" />
      <path
        d="M11 10.8v4.8M17.2 10.8v4.8M23.4 10.8v4.8M29.6 10.8v4.8M11 19.6v4.8M17.2 19.6v4.8M23.4 19.6v4.8M29.6 19.6v4.8M11 28.4v4.8M17.2 28.4v4.8M23.4 28.4v4.8M29.6 28.4v4.8"
        opacity="0.45"
      />
    </>
  ),
  neuron: (
    <>
      <circle cx="12.6" cy="20" r="4.8" fill="currentColor" fillOpacity="0.15" stroke="none" />
      <circle cx="12.6" cy="20" r="4.8" />
      <path d="M9.4 16.4 5.2 11.8m0 0 .2 2.8m-.2-2.8 2.8-.2" />
      <path d="M8 21.6 3.4 23.2" />
      <path d="M10.6 24.2 8.2 29m0 0-2.2.4M8.2 29l.6 2.2" />
      <path d="M14.4 15.8 16.2 11.4" />
      <path d="M17.4 20h11" />
      <path d="M21 18.4v3.2M25 18.4v3.2" opacity="0.45" />
      <path d="M28.4 20 33.6 15.6M28.4 20h5.8M28.4 20 33.6 24.4" />
    </>
  ),

  /* ----------------------------------------------------------- chemistry --- */
  /* The s/p-block gap in the top row is what makes four columns of squares read
     as a periodic table instead of as a spreadsheet. */
  'atom-grid': (
    <>
      <rect x="6" y="9.2" width="6.6" height="6.6" rx="1.2" />
      <rect x="29.4" y="9.2" width="6.6" height="6.6" rx="1.2" />
      <rect x="6" y="17" width="6.6" height="6.6" rx="1.2" />
      <rect x="13.8" y="17" width="6.6" height="6.6" rx="1.2" fill="currentColor" fillOpacity="0.18" stroke="none" />
      <rect x="13.8" y="17" width="6.6" height="6.6" rx="1.2" strokeWidth="1.7" />
      <rect x="21.6" y="17" width="6.6" height="6.6" rx="1.2" />
      <rect x="29.4" y="17" width="6.6" height="6.6" rx="1.2" />
      <rect x="6" y="24.8" width="6.6" height="6.6" rx="1.2" />
      <rect x="13.8" y="24.8" width="6.6" height="6.6" rx="1.2" />
      <rect x="21.6" y="24.8" width="6.6" height="6.6" rx="1.2" />
      <rect x="29.4" y="24.8" width="6.6" height="6.6" rx="1.2" />
    </>
  ),
  /* Water, at 104.5°. A drawn right angle would be a different molecule. */
  molecule: (
    <>
      <path d="M16.35 20.33 12 23.71M23.65 20.33 28 23.71" />
      <circle cx="20" cy="17.5" r="4.6" fill="currentColor" fillOpacity="0.16" stroke="none" />
      <circle cx="20" cy="17.5" r="4.6" />
      <circle cx="9.3" cy="25.8" r="3.4" />
      <circle cx="30.7" cy="25.8" r="3.4" />
    </>
  ),
  /* CO₂ at 180°, with the two double bonds drawn as two lines each. Next to the
     water mark above, the pair is the lesson: same kind of bonds, different
     shape, and only one of the two molecules is polar. */
  'molecule-linear': (
    <>
      <path d="M11.4 18.7h4.2M11.4 21.3h4.2M24.4 18.7h4.2M24.4 21.3h4.2" />
      <circle cx="20" cy="20" r="4.4" fill="currentColor" fillOpacity="0.16" stroke="none" />
      <circle cx="20" cy="20" r="4.4" />
      <circle cx="7.6" cy="20" r="3.3" />
      <circle cx="32.4" cy="20" r="3.3" />
    </>
  ),
  /* O₂: two atoms of the same size, both filled, because neither one pulls the
     shared pair. The double bond is what there is to see. */
  'molecule-diatomic': (
    <>
      <path d="M17.6 18.5h4.8M17.6 21.5h4.8" />
      <g fill="currentColor" fillOpacity="0.16" stroke="none">
        <circle cx="12" cy="20" r="4.9" />
        <circle cx="28" cy="20" r="4.9" />
      </g>
      <circle cx="12" cy="20" r="4.9" />
      <circle cx="28" cy="20" r="4.9" />
    </>
  ),
  /* CH₄. Three bonds in the plane and a fourth coming towards the viewer, drawn
     lighter — the only way a flat 40×40 box can say "tetrahedron" rather than
     "cross with four right angles", which is the misreading the model exists to
     correct. */
  'molecule-tetra': (
    <>
      <path d="M20 15.1V9.4M16.7 22.1 11.4 25.2M23.3 22.1 28.6 25.2" />
      <path d="M20 23.9v4.8" opacity="0.45" />
      <circle cx="20" cy="19.5" r="4.4" fill="currentColor" fillOpacity="0.16" stroke="none" />
      <circle cx="20" cy="19.5" r="4.4" />
      <circle cx="20" cy="6.6" r="2.7" />
      <circle cx="8.8" cy="26.6" r="2.7" />
      <circle cx="31.2" cy="26.6" r="2.7" />
      <circle cx="20" cy="31.3" r="2.7" opacity="0.45" />
    </>
  ),
  /* NH₃: the pyramid, and the two dots for the lone pair that closes it from
     109.5° to 107.8°. The gap where a fourth bond would be is the point. */
  'molecule-pyramid': (
    <>
      <path d="M17.1 16.8 11.3 24.6M22.9 16.8 28.7 24.6M20 17.9v9.5" opacity="0.9" />
      <circle cx="20" cy="13.5" r="4.3" fill="currentColor" fillOpacity="0.16" stroke="none" />
      <circle cx="20" cy="13.5" r="4.3" />
      <circle cx="17.3" cy="6.4" r="1.2" />
      <circle cx="22.7" cy="6.4" r="1.2" />
      <circle cx="9" cy="27.4" r="2.6" />
      <circle cx="31" cy="27.4" r="2.6" />
      <circle cx="20" cy="30.2" r="2.6" opacity="0.5" />
    </>
  ),
  'molecule-ring': (
    <>
      <path d="M20 7 31.26 13.5V26.5L20 33 8.74 26.5V13.5Z" />
      <path d="M21.23 10.57 27.55 14.22M27.55 25.78 21.23 29.43M11.22 23.65V16.35" opacity="0.75" />
    </>
  ),
  crystal: (
    <>
      <path d="M9 15h16v16H9z" />
      <path d="M15 9h16v16H15z" opacity="0.6" />
      <path d="M9 15 15 9M25 15 31 9M25 31 31 25M9 31 15 25" opacity="0.6" />
      <g fill="currentColor" fillOpacity="0.2">
        <circle cx="9" cy="15" r="1.7" />
        <circle cx="25" cy="15" r="1.7" />
        <circle cx="25" cy="31" r="1.7" />
        <circle cx="9" cy="31" r="1.7" />
        <circle cx="15" cy="9" r="1.7" />
        <circle cx="31" cy="9" r="1.7" />
        <circle cx="31" cy="25" r="1.7" />
        <circle cx="15" cy="25" r="1.7" />
      </g>
    </>
  ),
  flask: (
    <>
      <path d="M16.2 6.4h7.6" />
      <path d="M17 6.4v6.4L11.2 27.4a2.4 2.4 0 0 0 2.2 3.6h13.2a2.4 2.4 0 0 0 2.2-3.6L23 12.8V6.4" />
      <path
        d="M13.9 23.6h12.2l2.7 3.8a2.4 2.4 0 0 1-2.2 3.6H13.4a2.4 2.4 0 0 1-2.2-3.6z"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="none"
      />
      <path d="M13.9 23.6h12.2" opacity="0.65" />
      <circle cx="17.6" cy="27.4" r="1" opacity="0.7" />
      <circle cx="22.6" cy="28.6" r="1.3" opacity="0.7" />
      <path d="M11.6 31h16.8" />
      <path d="M9 34.4h22M13.4 34.4 15.2 31M26.6 34.4 24.8 31" opacity="0.75" />
    </>
  ),

  /* ------------------------------------------------------------- physics --- */
  projectile: (
    <>
      <path d="M4.6 31.4h30.8" opacity="0.55" />
      <path d="M7.2 31.4Q20-8 32.8 31.4" />
      <path d="M7.2 31.4 10.6 20.9" />
      <path d="M8.3 23.7 10.6 20.9 10.9 24.5" />
      <path d="M12.6 31.4A5.4 5.4 0 0 0 8.9 26.3" opacity="0.45" />
      <circle cx="20" cy="11.7" r="2.2" fill="currentColor" fillOpacity="0.2" stroke="none" />
      <circle cx="20" cy="11.7" r="2.2" />
    </>
  ),
  incline: (
    <>
      <path d="M5 31.6h30V12.4z" />
      <g transform="rotate(-32.6 23.6 19.7)">
        <rect x="19.3" y="14.4" width="8.6" height="5.3" rx="1" fill="currentColor" fillOpacity="0.17" stroke="none" />
        <rect x="19.3" y="14.4" width="8.6" height="5.3" rx="1" />
      </g>
      {/* Both vectors leave the block's rotated centre, (22.2, 17.5): weight
          straight down, normal perpendicular to the surface. */}
      <path d="M22.2 17.5V30.2M20.2 27.5 22.2 30.2 24.2 27.5" />
      <path d="M22.2 17.5 18.64 11.94M19.27 15.28 18.64 11.94 21.41 13.91" />
      <path d="M13 31.6A8 8 0 0 0 11.74 27.3" opacity="0.45" />
    </>
  ),
  wave: (
    <>
      <path d="M5 20h30" opacity="0.3" strokeDasharray="2 2.6" />
      <path d="M5 20q3.75-12 7.5 0z" fill="currentColor" fillOpacity="0.16" stroke="none" />
      <path d="M5 20q3.75-12 7.5 0t7.5 0t7.5 0t7.5 0" />
      <path d="M5 30.6v3.6M20 30.6v3.6M5.6 32.4h13.8" opacity="0.8" />
      <path d="M8 31.2 5.6 32.4 8 33.6M17 31.2 19.4 32.4 17 33.6" opacity="0.8" />
    </>
  ),
  circuit: (
    <>
      <path d="M11 10h7.6" />
      <path d="M18.6 6.4v7.2M21.4 8.2v3.6" />
      <path d="M21.4 10h7.6a4 4 0 0 1 4 4v2" />
      <rect x="30.2" y="16" width="5.6" height="8" rx="1.2" fill="currentColor" fillOpacity="0.17" stroke="none" />
      <rect x="30.2" y="16" width="5.6" height="8" rx="1.2" />
      <path d="M33 24v2a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4" />
    </>
  ),

  /* ------------------------------------------------------- earth & tools --- */
  globe: (
    <>
      <circle cx="20" cy="20" r="14" fill="currentColor" fillOpacity="0.09" stroke="none" />
      <circle cx="20" cy="20" r="14" />
      <ellipse cx="20" cy="20" rx="4.7" ry="14" opacity="0.6" />
      <ellipse cx="20" cy="20" rx="9.4" ry="14" opacity="0.4" />
      <path d="M20 6v28" opacity="0.6" />
      <path d="M6 20h28" />
      <path d="M7.76 13.2h24.48M7.76 26.8h24.48" opacity="0.5" />
    </>
  ),
  /* Cut open on the upper-right quadrant: three shells stop at the cut and the
     two radii close it, which is the textbook cross-section, not a bullseye. */
  'earth-layers': (
    <>
      <path d="M20 6A14 14 0 1 0 34 20" />
      <path d="M20 9.8A10.2 10.2 0 1 0 30.2 20" opacity="0.8" />
      <path d="M20 13.6A6.4 6.4 0 1 0 26.4 20" opacity="0.8" />
      <path d="M20 20V6M20 20h14" />
      <circle cx="20" cy="20" r="2.9" fill="currentColor" fillOpacity="0.2" stroke="none" />
      <circle cx="20" cy="20" r="2.9" />
    </>
  ),
  toolkit: (
    <>
      <g transform="rotate(-28 20 20)">
        <rect x="4.5" y="17.2" width="31" height="5.6" rx="1.4" />
        <path d="M10 17.2v2.4M15 17.2v2.4M20 17.2v2.4M25 17.2v2.4M30 17.2v2.4" opacity="0.55" />
      </g>
      <g transform="rotate(30 20 20)">
        <rect x="5" y="18.9" width="19" height="2.6" rx="1.3" />
        <path d="M24 19.1 34.5 20.2 24 21.7z" fill="currentColor" fillOpacity="0.18" stroke="none" />
        <path d="M24 19.1 34.5 20.2 24 21.7z" />
      </g>
    </>
  ),
  workshop: (
    <>
      <path d="M3 32.9h34" opacity="0.4" />
      <path d="M3.4 30.2h5.6" />
      <path d="M4.6 28.2 10.4 26.4 16 26 18.8 21.2 24.6 20.6 27.6 25.2 33.6 25.6 35.8 28.2" />
      <path d="M19.4 20.9a3.2 3.2 0 0 1 4.9-.3" opacity="0.7" />
      <path d="M30.2 15.4h7.4M34 15.4V25M31.4 18.4h5" />
      <g fill="currentColor" fillOpacity="0.15">
        <circle cx="12.4" cy="28.5" r="4.4" />
        <circle cx="29.6" cy="28.5" r="4.4" />
      </g>
    </>
  ),
};

export function LibraryMark({ mark }: { mark: MarkId }) {
  return (
    <svg
      className="library-mark"
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {MARKS[mark]}
    </svg>
  );
}
