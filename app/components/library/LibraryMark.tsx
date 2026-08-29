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
  /*
   * The one cell mark with no nucleus in it.
   *
   * Every other cell in the rail has a ring near its centre, so this row is
   * recognisable by what is *absent*: a rod with a free coiled loop of DNA, a few
   * loose plasmid rings, and a helix trailing off one end. The coil is drawn as
   * an open serpentine rather than as a blob for the same reason the 3D model is
   * — a blob in the middle of a prokaryote reads as a nucleus, which is the one
   * thing this specimen exists to contradict.
   */
  'cell-bacteria': (
    <>
      {/* thành ngoài và màng trong, lồng nhau */}
      <rect x="3.6" y="12.6" width="24.4" height="14.8" rx="7.4" />
      <rect x="5.8" y="14.8" width="20" height="10.4" rx="5.2" opacity="0.42" />
      {/* vùng nhân: một sợi vòng cuộn, không phải một khối cầu */}
      <path d="M9.8 20.6c1.4-2.4 2.8-2.4 4.2 0s2.8 2.4 4.2 0 2.8-2.4 4.2 0" />
      {/* ribosome rải khắp tế bào chất */}
      <g fill="currentColor" fillOpacity="0.5" stroke="none">
        <circle cx="10.6" cy="16.4" r="0.85" />
        <circle cx="16" cy="24" r="0.85" />
        <circle cx="21.6" cy="16.6" r="0.85" />
      </g>
      {/* một plasmid rời */}
      <circle cx="23.8" cy="23.4" r="1.7" opacity="0.6" />
      {/* roi: sợi xoắn, dài hơn thân, chỉ ở một đầu */}
      <path d="M28 20c1.4-2.5 2.8-2.5 4.2 0s2.8 2.5 4.2 0" opacity="0.78" />
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

  /* ------------------------------------------------------ human organs --- */
  /*
   * Twelve organs on the same 40-unit grid as the cells above them.
   *
   * The set has one rule of its own: **each mark is drawn at the feature that
   * names the organ, not at its outline.** Six of these twelve are, in
   * silhouette, a rounded blob — liver, spleen, pancreas, gallbladder, thymus
   * lobe, kidney — and a rail of six rounded blobs is a rail with no information
   * in it. So the spleen carries its hilar notch, the pancreas is drawn along the
   * duct that runs its whole length, the kidney is cut open to show the pyramids,
   * and the gallbladder keeps the cystic duct hooking off its neck. Those are the
   * features a textbook diagram labels them by, which means a student who has
   * seen the textbook recognises the row before reading it.
   */
  'organ-heart': (
    <>
      {/* Two chambers of unequal wall, because that asymmetry is the heart's own
          lesson: the left side pumps to the whole body and is built for it. */}
      <path d="M20 33.4c-5.6-4-11.4-8.2-11.4-14.6 0-4.2 3-7.4 6.8-7.4 2.2 0 3.7 1 4.6 2.3.9-1.3 2.4-2.3 4.6-2.3 3.8 0 6.8 3.2 6.8 7.4 0 6.4-5.8 10.6-11.4 14.6Z" />
      <path d="M20 13.7v19.7" opacity="0.42" />
      <path d="M17.2 9.4v3.4M22.6 8.6v4.2" />
      <g fill="currentColor" fillOpacity="0.15" stroke="none">
        <path d="M20 31.9c4.8-3.5 9.9-7.2 9.9-13.1 0-3.4-2.4-5.9-5.3-5.9-1.8 0-3 .9-3.6 1.9-.4.6-.7 1.3-1 2Z" />
      </g>
    </>
  ),
  'organ-brain': (
    <>
      {/* Cerebrum, one central sulcus, and the cerebellum as a separate lobed body
          under the back of it. A brain drawn as one gyrified oval is a walnut. */}
      <path d="M8.2 18.4c0-5.4 5.3-9.6 11.8-9.6s11.8 4.2 11.8 9.6c0 3.6-1.6 5.6-3.4 7.2" />
      <path d="M8.2 18.4c0 3.4 1.4 5.6 3.2 7.2 1.4 1.3 2 2.6 2 4.4" />
      <path d="M20 8.8v12.4" opacity="0.5" />
      <path d="M13.6 12.6c1.8 1.4 1.6 3.4 0 4.6M26.6 12.6c-1.8 1.4-1.6 3.4 0 4.6" opacity="0.55" />
      <g fill="currentColor" fillOpacity="0.14" stroke="none">
        <path d="M24.4 25.8c2.6 0 4.6 1.6 4.6 3.6s-2 3.6-4.6 3.6-4.6-1.6-4.6-3.6 2-3.6 4.6-3.6Z" />
      </g>
      <path d="M24.4 25.8c2.6 0 4.6 1.6 4.6 3.6s-2 3.6-4.6 3.6-4.6-1.6-4.6-3.6 2-3.6 4.6-3.6Z" />
      <path d="M21.4 27.6h6M20.6 30.4h7.4" opacity="0.5" />
    </>
  ),
  'organ-lungs': (
    <>
      {/* Trachea and the carina it splits at, drawn first: the airway is why the
          two lobes are the shape they are. */}
      <path d="M20 7.4v9.2" />
      <path d="M20 16.6 15 21M20 16.6 25 21" />
      <path d="M17.2 8.6h5.6M17.4 11.8h5.2" opacity="0.5" />
      <path d="M14.4 21.4c-3.4 1.6-5.4 5.4-5.4 9 0 2.4 1.6 3.6 3.4 3.6 2.8 0 5.2-2.6 5.2-6.4v-6.8Z" />
      <path d="M25.6 21.4c3.4 1.6 5.4 5.4 5.4 9 0 2.4-1.6 3.6-3.4 3.6-2.8 0-5.2-2.6-5.2-6.4v-6.8Z" />
      <g fill="currentColor" fillOpacity="0.13" stroke="none">
        <path d="M25.6 21.4c3.4 1.6 5.4 5.4 5.4 9 0 2.4-1.6 3.6-3.4 3.6-2.8 0-5.2-2.6-5.2-6.4v-6.8Z" />
      </g>
    </>
  ),
  'organ-liver': (
    <>
      {/* Two lobes of very unequal size, split by the falciform ligament. */}
      <path d="M5.4 15.2c0-1.8 1.6-2.8 3.6-2.6 6.4.6 15.6.6 22-.4 2.4-.4 3.8.8 3.6 2.8-.6 5.8-3.4 12.4-9.4 12.4-3.2 0-4.6-1.8-6.4-3.4-1.6-1.4-3.2-2.2-5.6-2.2-4.4 0-7.8-2.6-7.8-6.6Z" />
      <path d="M22.2 12.4l-1.4 11" opacity="0.5" />
      <path d="M17.6 27.2c1.4 1.2 2.2 2.6 2.4 4.4" opacity="0.45" />
      <g fill="currentColor" fillOpacity="0.14" stroke="none">
        <path d="M20.8 12.6c4.6-.1 9.6-.3 13.2-.8 2.4-.4 3.8.8 3.6 2.8-.6 5.8-3.4 12.4-9.4 12.4-3.2 0-4.6-1.8-6.4-3.4-.7-.6-1.4-1.1-2.2-1.5Z" />
      </g>
    </>
  ),
  'organ-gallbladder': (
    <>
      {/* A pear with a duct hooking off the neck. Without the duct it is a pear. */}
      <path d="M13.6 27.2c0-4.4 2.6-6.6 4.2-8.6 1-1.2 1.4-2.4 1.4-3.8" />
      <path d="M13.6 27.2c0 3.2 2.8 5.4 6.4 5.4s6.4-2.2 6.4-5.4c0-4.4-2.6-6.6-4.2-8.6-1-1.2-1.4-2.4-1.4-3.8" />
      <path d="M19.2 14.8c0-1.6 1.6-2.6 3.4-2.2 3 .6 4.6 3 5 6" />
      <path d="M27.6 18.6l1.4-1.6m-1.4 1.6 1.9.4" opacity="0.6" />
      <g fill="currentColor" fillOpacity="0.15" stroke="none">
        <path d="M13.6 27.2c0 3.2 2.8 5.4 6.4 5.4s6.4-2.2 6.4-5.4c0-2.4-.8-4.1-1.8-5.5H15.4c-1 1.4-1.8 3.1-1.8 5.5Z" />
      </g>
    </>
  ),
  'organ-kidney': (
    <>
      {/* Cut open on purpose. The bean outline is shared with the spleen; the
          medullary pyramids around the pelvis are what is not. */}
      <path d="M25.4 7.8c4.4 0 8 5.4 8 12.2s-3.6 12.2-8 12.2c-3 0-5-2.2-6-5.2-.7-2-1.9-2.9-3.6-2.9h-1.4" />
      <path d="M25.4 7.8c-3 0-5 2.2-6 5.2-.7 2-1.9 2.9-3.6 2.9h-1.4" />
      <path d="M14.4 15.9c-2.4 0-4 1.8-4 4.1s1.6 4.1 4 4.1" />
      <g fill="currentColor" fillOpacity="0.14" stroke="none">
        <path d="M25.4 9.6c3.3 0 6.2 4.6 6.2 10.4s-2.9 10.4-6.2 10.4c-2.1 0-3.5-1.6-4.3-3.9-.4-1.2-1-2.1-1.8-2.7 1.4-.9 2.3-2.4 2.3-4.2s-.9-3.3-2.3-4.2c.8-.6 1.4-1.5 1.8-2.7.8-2.3 2.2-3.1 4.3-3.1Z" />
      </g>
      <path d="M26 13.4l3.4 1.4M26.8 20h4M26 26.6l3.4-1.4" opacity="0.55" />
    </>
  ),
  'organ-eye': (
    <>
      {/* A section, not a front view. A front view of an eye is a target; the
          section is where the cornea's bulge and the optic nerve live. */}
      <circle cx="19" cy="20" r="10.6" />
      <path d="M8.6 20c0-2.6 2-4.6 4.4-4.6s4.4 2 4.4 4.6-2 4.6-4.4 4.6S8.6 22.6 8.6 20Z" />
      <circle cx="13" cy="20" r="2.1" fill="currentColor" fillOpacity="0.2" stroke="none" />
      <circle cx="13" cy="20" r="2.1" />
      <path d="M29 16.4c1.8 0 3.2 1.6 3.2 3.6s-1.4 3.6-3.2 3.6" />
      <path d="M32.2 20h3.4" opacity="0.6" />
      <path d="M17.4 15.4c1.4 1.2 2.2 2.8 2.2 4.6s-.8 3.4-2.2 4.6" opacity="0.45" />
    </>
  ),
  'organ-pancreas': (
    <>
      {/* Drawn along the duct, because the duct runs the organ's whole length and
          is why a stone in the head of it stops the tail working. */}
      <path d="M6.6 22.4c0-3.4 2.4-5.6 5.4-5.6 2.4 0 4 1 5.6 2 2.4 1.5 5 2.4 8 2.6 3.6.3 6.6 1.4 8.8 3" />
      <path d="M6.6 22.4c0 3.2 2.2 5 5 5 2.2 0 3.6-.9 5-1.8 2.4-1.5 5-2.3 8-2.1 3.4.2 6.4-.3 8.8-1.1" />
      <path d="M10.8 22.2c1.8.5 3 1.6 4.6 2.6 2.6 1.6 5.4 2.4 8.6 2.4h6.2" opacity="0.55" />
      <g fill="currentColor" fillOpacity="0.15" stroke="none">
        <path d="M6.6 22.4c0-3.4 2.4-5.6 5.4-5.6 2.4 0 4 1 5.6 2 .9.6 1.9 1.1 2.9 1.5v6.5c-1-.4-2-.9-2.9-1.4-1.4-.9-2.8-1.8-5-1.8-2.8 0-5-1.8-5-5Z" />
      </g>
    </>
  ),
  'organ-ileum': (
    <>
      {/* The last stretch of small intestine: tight coils held in a loop, and the
          villous lining that is why this is the absorbing segment. */}
      <path d="M11 10.6c5.4 0 5.4 4.2 0 4.2s-5.4 4.2 0 4.2 5.4 4.2 0 4.2 5.4 4.2 0 4.2" />
      <path d="M11 10.6h17.2c1.2 0 2.2 1 2.2 2.2s-1 2.2-2.2 2.2H11" />
      <path d="M11 19h17.2c1.2 0 2.2 1 2.2 2.2s-1 2.2-2.2 2.2H11" />
      <path d="M11 27.4h17.2c1.2 0 2.2 1 2.2 2.2s-1 2.2-2.2 2.2H11c-2.4 0-3.6-1.8-3.6-3.4" />
      <g fill="currentColor" fillOpacity="0.13" stroke="none">
        <path d="M13 10.6h15.2c1.2 0 2.2 1 2.2 2.2s-1 2.2-2.2 2.2H13Z" />
      </g>
    </>
  ),
  'organ-colon': (
    <>
      {/* The frame the small intestine sits inside: ascending, transverse,
          descending, and the sigmoid turn at the end. */}
      <path d="M11 31.2V16.4c0-2.6 2-4.6 4.6-4.6h9c2.6 0 4.6 2 4.6 4.6v12.4" />
      <path d="M29.2 28.8c0 2.4-2.6 3.4-4.4 2.4-1.6-.9-3.2 0-3.2 1.8" />
      <path d="M11 31.2c0 1.4-1.2 2.2-2.4 1.8" opacity="0.55" />
      <path d="M11 20.4h-2.2M11 25.6h-2.2M14 11.8v-2.4M20 11.8V9.4M26 11.8V9.4M29.2 20.4h2.4M29.2 25.6h2.4" opacity="0.45" />
      <g fill="currentColor" fillOpacity="0.13" stroke="none">
        <path d="M15.6 11.8h8.8c2.6 0 4.6 2 4.6 4.6v3.2H11v-3.2c0-2.6 2-4.6 4.6-4.6Z" />
      </g>
    </>
  ),
  'organ-spleen': (
    <>
      {/* The hilar notch on the concave face is the whole mark. Without it a
          spleen and a kidney are the same drawing. */}
      <path d="M27.6 8.6c3.4 2 5.2 6.4 5.2 11.4 0 6.6-4 12-9.6 12-4.8 0-8.4-3.4-9.8-8" />
      <path d="M27.6 8.6c-4.6-2.4-10.4-.4-13 4.6-1.2 2.4-1.4 4.6-1.2 6.8" />
      <path d="M13.4 20c.2 1.4.4 2.8 1 4" />
      <path d="M12.6 15.6 8.2 14M13.4 20H8.6M13.8 24.4l-4.2 2.2" opacity="0.6" />
      <g fill="currentColor" fillOpacity="0.14" stroke="none">
        <path d="M27.6 8.6c3.4 2 5.2 6.4 5.2 11.4 0 6.6-4 12-9.6 12-2.6 0-4.9-1-6.6-2.7 5-.6 8.8-5.6 8.8-11.7 0-3.8-1.5-7.2-3.8-9.3 2-.6 4.1-.6 6-.2v.5Z" />
      </g>
    </>
  ),
  'organ-thymus': (
    <>
      {/* One lobe, not two: this mesh is the left lobe only, and the mark says so
          rather than drawing the butterfly shape of the whole gland. */}
      <path d="M20.6 8.4c-4.2 0-7.6 3-7.6 7 0 2.6 1 4.2 1.8 6 .8 1.8 1 3.6.4 5.6-.6 2.2.6 4.4 3 4.6 2.6.2 4.4-1.6 4.6-4 .2-2.6-.6-4.4-.4-6.6.2-2.2 1.4-3.6 1.4-6 0-3.6-2.4-6.6-3.2-6.6Z" />
      <path d="M20.4 12.8c-.4 2 .4 3.6.4 5.6s-.8 3.4-.6 5.4" opacity="0.5" />
      <path d="M13.4 13.6 9.2 11.4M13 18.6 8.6 18.8" opacity="0.55" />
      <path d="M27 14.6c1.6.6 2.8 2 3.2 3.8" opacity="0.5" />
      <g fill="currentColor" fillOpacity="0.15" stroke="none">
        <path d="M20.6 8.4c.8 0 3.2 3 3.2 6.6 0 2.4-1.2 3.8-1.4 6-.2 2.2.6 4 .4 6.6-.1 1.4-.7 2.6-1.7 3.3-.6-.9-.9-2-.8-3.3.2-2.6-.6-4.4-.4-6.6.2-2.2 1.4-3.6 1.4-6 0-2.6-1.2-4.9-2.2-6.1.4-.3.9-.5 1.5-.5Z" />
      </g>
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
