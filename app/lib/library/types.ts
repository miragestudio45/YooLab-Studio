/**
 * The Library content model.
 *
 * Everything the Library shows comes from a manifest, never from JSX. That is
 * the difference between a page with cards on it and a product that can grow: a
 * new subject, a new specimen or a new interactive is a data entry, and the
 * workspace, the subject switcher, the counters and the empty states all follow
 * from it automatically.
 *
 * Two rules are enforced by the shape itself rather than by discipline:
 *
 *   - `status` is required. An entry is `ready` only when opening it produces a
 *     real experience in this build; anything else is `planned` and renders as a
 *     stated gap, never as a card that looks live.
 *   - `credits` is required on anything derived from an outside source, and it
 *     carries the licence with it. An asset whose licence has not been verified
 *     does not get an entry — it does not ship.
 *
 * The manifest itself is split one file per subject under `subjects/`, so a
 * subject can grow without every other subject's entries moving in the diff.
 */

export type ExperienceKind =
  | 'model-3d'      // a real GLB in a viewer
  | 'interactive'   // a built interface: periodic table, globe
  | 'simulation'    // a running physical model
  | 'lab'           // an instrumented practice bench
  | 'story'         // narrative scroll
  | 'workshop';     // a full-screen experience of its own (Formula)

export type ExperienceStatus = 'ready' | 'planned';

export type SubjectId =
  | 'sinh-hoc'
  | 'hoa-hoc'
  | 'vat-ly'
  | 'dia-ly'
  | 'vu-tru'
  | 'lich-su'
  | 'stem';

export type Credit = {
  /** Who made the underlying asset or data. */
  author: string;
  /** SPDX-ish licence label, exactly as the source states it. */
  license: string;
  /** Where it came from, so the claim is checkable. */
  source: string;
  /** Anything the licence obliges us to say. */
  notice?: string;
};

/**
 * What the centre of the workspace renders for an entry.
 *
 * `creature` is the important one: it routes bee / fish / jellyfish through the
 * *same* renderer the hero uses — optical glass shell, refraction capture,
 * authored flight clips — instead of through the generic GLB path. Before this
 * existed the Library's bee was a flat red mesh next to a hero bee made of
 * glass, which is the single most damaging kind of inconsistency a product page
 * can have: it says the good version was a marketing render.
 *
 * `model` is the generic GLB path, for specimens with no bespoke optics.
 * `experience` names one of the built interactives and is resolved through a
 * lazy import map, so a subject nobody visits costs nothing. `params` lets one
 * component serve many manifest entries — one cell studio for seven cell types,
 * one molecule viewer for seven molecules.
 */
export type ExperienceView =
  | { type: 'creature'; creature: CreatureId; framing?: ModelFraming }
  | { type: 'model'; url: string; preset: ModelPreset; framing?: ModelFraming }
  | { type: 'experience'; key: BuiltExperienceKey; params?: Record<string, string> }
  | { type: 'poster'; src: string; alt: string }
  | { type: 'placeholder' };

/** Creatures with a bespoke optical pipeline shared with the hero. */
export type CreatureId = 'bee' | 'fish' | 'jellyfish';

export type ModelPreset = 'ruby' | 'opal' | 'natural' | 'tissue' | 'plastic' | 'steel' | 'rubber';

export type ModelFraming = {
  /** Camera azimuth in radians. */
  yaw?: number;
  pitch?: number;
  /**
   * Fraction of the frame the subject should span, 0–1.
   *
   * This replaces the old `zoom` multiplier, which fitted the *bounding sphere*
   * to the vertical field of view. For a long horizontal subject like the bee
   * that wastes most of the frame: the sphere radius is half the wingspan, so
   * the animal ended up occupying a third of the width and a fifth of the
   * height. `fill` fits the projected bounding box on both axes instead, which
   * is what makes a specimen read as the subject of the viewer rather than as
   * an artefact floating in it.
   */
  fill?: number;
  /** Vertical aim as a fraction of the bounding box, 0 = bottom, 1 = top. */
  targetY?: number;
  /** Seconds into the first clip to hold, for models that animate. */
  poseTime?: number;
  /** Play the first clip instead of holding a pose. */
  animate?: boolean;
  /** Frame tilt in radians, for subjects that read better on a diagonal. */
  roll?: number;
};

export type BuiltExperienceKey =
  | 'periodic-table'
  | 'molecule-viewer'
  | 'cell-studio'
  | 'projectile-lab'
  | 'incline-lab'
  | 'wave-lab'
  | 'circuit-lab'
  | 'globe-explorer'
  | 'earth-layers'
  | 'toolkit-bench'
  | 'formula-workshop';

export type LearningPoint = { label: string; body: string };

/**
 * The small illustration beside a row in the asset rail.
 *
 * Two kinds, and the split is deliberate. Anything with a real mesh gets a real
 * baked render of that mesh — a picture of the actual thing. Everything else
 * gets a drawn mark: a diagram of the concept in the subject's own accent.
 * Twenty-six live WebGL bakes would cost more than the workspace does, and a
 * two-letter chip in a tinted square (which is what the proof cards used to do)
 * reads as a placeholder, so the marks are drawn rather than lettered.
 */
export type RailVisual =
  | { kind: 'thumbnail'; thumb: ThumbnailKey }
  | { kind: 'mark'; mark: MarkId };

export type ThumbnailKey = 'bee' | 'fish' | 'jellyfish' | 'gram-wall' | 'toolkit' | 'formula';

export type MarkId =
  | 'cell'
  | 'cell-plant'
  | 'cell-blood'
  | 'cell-epithelial'
  | 'cell-muscle'
  | 'neuron'
  | 'atom-grid'
  /*
   * Five molecular shapes, not one "molecule" icon.
   *
   * The chemistry rail lists seven molecules, and the whole lesson of that rail
   * is that a formula does not tell you a shape: H₂O is bent, CO₂ is straight,
   * CH₄ is a tetrahedron, NH₃ is a pyramid with a gap in it. Drawing all five
   * with the same generic mark would have thrown that away before a student
   * opened anything — five identical rows saying "molecule". Each mark below is
   * drawn at its real geometry, so the rail is a shape catalogue.
   */
  | 'molecule'            // bent — water, at 104.5°
  | 'molecule-linear'     // straight — CO₂
  | 'molecule-diatomic'   // two identical atoms — O₂
  | 'molecule-tetra'      // tetrahedron — CH₄
  | 'molecule-pyramid'    // trigonal pyramid with a lone pair — NH₃
  | 'molecule-ring'       // fused rings — caffeine
  | 'crystal'             // ionic lattice — NaCl
  | 'projectile'
  | 'incline'
  | 'wave'
  | 'circuit'
  | 'globe'
  | 'earth-layers'
  | 'toolkit'
  | 'workshop'
  | 'flask';

export type ExperienceManifest = {
  id: string;
  title: string;
  /** Latin/scientific or technical subtitle, shown under the title. */
  subtitle?: string;
  subject: SubjectId;
  /** Free-text topic inside the subject, e.g. "Tế bào". */
  topic: string;
  kind: ExperienceKind;
  status: ExperienceStatus;
  /** One line for the asset rail. */
  summary: string;
  /** A paragraph for the knowledge panel. */
  description: string;
  view: ExperienceView;
  /** The rail illustration. Required: a row with no picture is the weak row. */
  rail: RailVisual;
  /** Named structures, organelles, parts — the anatomy readout. */
  parts?: LearningPoint[];
  /** What a student should be able to do afterwards. */
  goals?: string[];
  /** Numbers and facts worth putting on screen. */
  facts?: { label: string; value: string }[];
  /**
   * One or two short highlighted notes — the thing a teacher repeats out loud.
   * Rendered as tinted blocks under the readout, not as more body copy.
   */
  notes?: LearningPoint[];
  credits?: Credit[];
  /** Search terms, unaccented, so Vietnamese queries match. */
  keywords?: string;
  /** Opens the full-screen Formula overlay instead of the inline viewer. */
  opensWorkshop?: boolean;
};

export type Subject = {
  id: SubjectId;
  label: string;
  /** Shown under the subject name in the switcher. */
  note: string;
  /** Soft accent used to colour-code the subject. */
  tint: string;
};
