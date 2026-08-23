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
 * `model` points at a GLB; `experience` names one of the built interactives and
 * is resolved through a lazy import map, so a subject nobody visits costs
 * nothing. `poster` is the still that stands in until either arrives.
 */
export type ExperienceView =
  | { type: 'model'; url: string; preset: ModelPreset; framing?: ModelFraming }
  | { type: 'experience'; key: BuiltExperienceKey }
  | { type: 'poster'; src: string; alt: string }
  | { type: 'placeholder' };

export type ModelPreset = 'ruby' | 'opal' | 'natural' | 'tissue' | 'plastic';

export type ModelFraming = {
  /** Camera azimuth in radians. */
  yaw?: number;
  pitch?: number;
  /** 1 frames the bounding sphere tightly; higher pulls back. */
  zoom?: number;
  /** Vertical aim as a fraction of the bounding box. */
  targetY?: number;
  /** Seconds into the first clip to hold, for models that animate. */
  poseTime?: number;
  /** Play the first clip instead of holding a pose. */
  animate?: boolean;
};

export type BuiltExperienceKey =
  | 'periodic-table'
  | 'cell-studio'
  | 'projectile-lab'
  | 'globe-explorer'
  | 'formula-workshop';

export type LearningPoint = { label: string; body: string };

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
  /** Named structures, organelles, parts — the anatomy readout. */
  parts?: LearningPoint[];
  /** What a student should be able to do afterwards. */
  goals?: string[];
  /** Numbers and facts worth putting on screen. */
  facts?: { label: string; value: string }[];
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
