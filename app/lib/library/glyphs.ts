/**
 * The Library's glyph vocabulary.
 *
 * A type-only module so the *manifest* can name an icon without importing a
 * React component, and so `LibraryIcons.tsx` can be checked against the same
 * list. Data says `icon: 'ruler'`; the component decides what a ruler looks
 * like. Nothing in between guesses from a label.
 *
 * Every glyph in this union is drawn — authored SVG on one 20-unit grid at one
 * stroke weight. There is no Unicode fallback and no icon font: DESIGN.md §10
 * records what happened the last time this project let glyphs drift, and the
 * cheapest way for a control rail of sixty marks to read as an imitation is for
 * three of them to come from somewhere else.
 */

/** Stage chrome: the controls that sit on top of a running 3D canvas. */
export type StageGlyph =
  | 'rotate'
  | 'zoomIn'
  | 'zoomOut'
  | 'reset'
  | 'spin'
  | 'hotspot'
  | 'drag'
  | 'scroll'
  | 'tap';

/**
 * Motion clips.
 *
 * `rest` / `hover` / `fly` are the bee's three flight states and keep their
 * names from the hero. The rest are the T-rex's five clips, and each is drawn as
 * the *action* rather than as the animal: a bite is two jaw arcs closing, a roar
 * is a mouth with sound travelling out of it, a tail sweep is an S-curve with a
 * direction. At 15 px five silhouettes of the same dinosaur would be five
 * identical smudges.
 */
export type MotionGlyph =
  | 'rest'
  | 'hover'
  | 'fly'
  | 'stride'
  | 'bite'
  | 'roar'
  | 'tail';

/**
 * Readout glyphs, one per row of the knowledge panel's measurement table.
 *
 * Authored per fact in the manifest. This is the single detail that separates a
 * table of numbers from a specimen card: the eye finds "how long is it" by the
 * shape of the rule beside it, not by reading six labels in sequence.
 */
export type FactGlyph =
  | 'ruler'
  | 'weight'
  | 'era'
  | 'pin'
  | 'pulse'
  | 'speed'
  | 'bite-force'
  | 'bone'
  | 'tooth'
  | 'dna'
  | 'layers'
  | 'thermo'
  | 'drop'
  | 'sun'
  | 'clip'
  | 'scale-micro'
  /** Procedural geometry — a wireframe, for a specimen YooLab built rather than loaded. */
  | 'geometry'
  /** A fringed surface — microvilli, a brush border, anything that multiplies area. */
  | 'surface';

/** Section marks inside the knowledge panel, plus the workspace's own chrome. */
export type PanelGlyph =
  | 'structure'
  | 'goals'
  | 'readout'
  | 'science'
  | 'curio'
  | 'context'
  | 'source'
  | 'search'
  | 'shelf';

/** One mark per subject in the switcher. */
export type SubjectGlyph =
  | 'biology'
  | 'chemistry'
  | 'physics'
  | 'earth'
  | 'stem'
  | 'space'
  | 'history';

export type LibraryGlyph = StageGlyph | MotionGlyph | FactGlyph | PanelGlyph | SubjectGlyph;
