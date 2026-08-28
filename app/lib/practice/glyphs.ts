/**
 * The practice hub's glyph vocabulary.
 *
 * A type-only module, exactly like the Library's: the manifest names a mark and
 * `PracticeIcons.tsx` decides what it looks like, so nothing between data and
 * pixels has to guess from a label. The marks themselves are drawn on the
 * Library's grid at the Library's weight — this section is a different set of
 * subjects, not a different hand.
 */
export type PracticeGlyph =
  /* Formula */
  | 'car'
  | 'assemble'
  | 'inspect'
  | 'drive'
  /* Drone */
  | 'drone'
  | 'takeoff'
  | 'route'
  | 'landing'
  /* Robot */
  | 'robot'
  | 'joint'
  | 'grip'
  | 'auto'
  /* Bottom strip */
  | 'shield'
  | 'repeat'
  | 'depth'
  | 'signal'
  /* Lab chrome */
  | 'restart'
  | 'hint'
  | 'check';
