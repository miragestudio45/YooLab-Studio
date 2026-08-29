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

import type { FactGlyph, MotionGlyph, SubjectGlyph } from './glyphs';

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
  | {
    type: 'model';
    url: string;
    preset: ModelPreset;
    framing?: ModelFraming;
    /**
     * Named animation clips the visitor may choose between.
     *
     * A rigged specimen is not one animation, it is a set of behaviours, and
     * which behaviour is running is the lesson: a T-rex biting and a T-rex
     * standing still answer different questions about the same skull. Clips are
     * addressed by the **name** in the glTF rather than by index, so a
     * re-export that reorders them cannot silently swap "gầm" for "chạy".
     */
    clips?: ModelClip[];
    /**
     * Which clip the specimen opens on, by name.
     *
     * Separate from the order of `clips`, because the two answer different
     * questions: the order is how a teacher reads the set (still → moving →
     * hunting), and the default is the one frame that has to sell the model the
     * instant the section arrives. For the T-rex those are not the same clip.
     */
    defaultClip?: string;
    /**
     * The joint whose position track carries root motion, as a name stem.
     *
     * Authored clips from a games pipeline usually **travel**: the T-rex's five
     * clips all animate `bn_Spine.translation`, so a run cycle actually walks the
     * animal forward and a bite lunges it. In a viewer that is a specimen leaving
     * the frame — the camera is fitted once and does not follow. Naming the joint
     * here flattens that one track to a single value across every clip, so the
     * limbs, neck and tail keep their motion and the animal performs on the spot.
     *
     * A stem, matched as `<stem>` or `<stem>.<suffix>`, because exporters append
     * numeric suffixes: `bn_Spine` finds `bn_Spine.4_4` and must not also catch
     * `bn_Spine1.5_5`.
     */
    lockRoot?: string;
    /**
     * Material name stems to render as a translucent envelope.
     *
     * One organ in the Human Reference Atlas set needs this and the rest must
     * not have it. `kidney.glb` is three concentric meshes — capsule, renal
     * column, renal pyramid — and the capsule is a closed opaque bag around the
     * other two, so the sectioned anatomy the panel describes was sealed inside
     * a bean. Every other organ is a single shell or a set of parts that sit
     * beside each other rather than inside each other, and fading those would
     * only make a solid organ look like a ghost.
     *
     * Matched as a stem against the glTF material name — `kidneycapsule` finds
     * `kidneycapsule_mat` — for the same reason `lockRoot` matches joints that
     * way: exporters decorate names, and the suffix is not the identity.
     */
    shell?: string[];
    /** Anatomy pins bound to real joints. See `ModelAnchor`. */
    anchors?: ModelAnchor[];
  }
  | { type: 'experience'; key: BuiltExperienceKey; params?: Record<string, string> }
  | { type: 'poster'; src: string; alt: string }
  | { type: 'placeholder' };

export type ModelClip = {
  /** The clip's own name inside the glTF. */
  name: string;
  /** Short label for the 52 px cell of the stage rail. */
  label: string;
  /** The full phrase, for `title` and `aria-label`. */
  title: string;
  icon: MotionGlyph;
};

/**
 * One anatomy pin on a running model.
 *
 * `bone` is matched as a *stem* against the rig's joint names, the way
 * `CreatureStage` matches the bee's — Blender and glTF exporters append numeric
 * suffixes, so `bn_Head` has to keep finding `bn_Head.10_10` across re-exports.
 * Because the anchor is a joint and not a screen coordinate, the pin travels
 * with the animation: the jaw label stays on the jaw through a bite.
 */
export type ModelAnchor = {
  bone: string;
  label: string;
  /** One clause. This is a pin, not a paragraph. */
  detail: string;
  /** Which side of the pin the card opens on, when there is a choice. */
  side?: 'left' | 'right';
};

/** Creatures with a bespoke optical pipeline shared with the hero. */
export type CreatureId = 'bee' | 'fish' | 'jellyfish';

export type ModelPreset =
  | 'ruby'
  | 'opal'
  /** Keep the glTF's own materials and only calibrate them. */
  | 'natural'
  /**
   * The organ preset: the mesh's own anatomical colours, made wet.
   *
   * `natural` was not enough for the Human Reference Atlas organs and `tissue`
   * was actively wrong. The HRA meshes arrive with per-material colours that are
   * anatomy — a near-black liver, a dark-green gallbladder, three separate
   * materials through a kidney's capsule, column and pyramids — so `tissue`,
   * which replaces every material with one salmon, would have thrown away the
   * only thing that makes a kidney readable and rendered twelve identical pink
   * lumps. But `natural` leaves them matte, and a matte organ is a clay model:
   * every surface in a body cavity is wet, and the single specular sheen across
   * it is most of what says "tissue" rather than "prop".
   */
  | 'organ'
  | 'tissue'
  | 'plastic'
  | 'steel'
  | 'rubber';

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
  /**
   * Frame tilt in radians, for subjects that read better on a diagonal.
   *
   * Use it for a few degrees of deliberate angle, the way the jellyfish uses
   * `-0.05`. It is **not** the tool for a mesh that was authored standing on
   * end: `roll` rotates the *camera*, so it takes the grid floor and the whole
   * room with it, and past a handful of degrees the viewer reads as crooked
   * rather than the subject as tilted. To lay a subject down, rotate the subject
   * — see `orient`.
   */
  roll?: number;
  /**
   * Model-space rotation in radians (XYZ Euler), applied before the fit.
   *
   * Some meshes arrive on end. Four of the eight toolkit models are authored
   * with their long axis along +Y — the ruler is 0.004 x **0.300** x 0.030 —
   * so a straight camera renders a 30 cm ruler as a vertical column. They had
   * been compensated for with 17-35 degrees of camera `roll`, which stood the
   * tool up at an angle and stood the room up with it.
   *
   * Rotating the object instead puts the tool on the floor where a tool belongs,
   * and leaves the camera free to use the same yaw and pitch as every other
   * specimen in the Library. Applied before the bounding box is measured, so the
   * fit frames what you actually see.
   */
  orient?: [number, number, number];
  /**
   * Fit for the whole yaw sweep of the idle orbit, not just for `yaw`.
   *
   * Opt-in, and only long subjects need it. A cell or a chunk of wall is about as
   * wide from every angle, so squaring its footprint would shrink it for nothing;
   * a twelve-metre theropod grows by a fifth on its way from three-quarters to
   * broadside, and without this its head leaves the frame a second after the
   * section arrives. See `spinSafeBox`.
   */
  spinSafe?: boolean;
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

export type ThumbnailKey = 'bee' | 'fish' | 'jellyfish' | 'trex' | 'gram-wall' | 'toolkit' | 'formula';

export type MarkId =
  | 'cell'
  | 'cell-plant'
  | 'cell-blood'
  | 'cell-epithelial'
  | 'cell-muscle'
  /*
   * Drawn as a rod with a coiled loop in it and a helical flagellum, and
   * deliberately with NO nucleus circle. Six of the seven cell marks have a ring
   * near their centre; this one is the row where that ring is missing, and at
   * 46 px that absence is the fastest way to say "nhân sơ".
   */
  | 'cell-bacteria'
  | 'neuron'
  /*
   * Twelve human organs, drawn rather than baked.
   *
   * These are the one place the rail's "a mesh gets a photograph of itself" rule
   * is deliberately not followed, and the reason is arithmetic: the twelve HRA
   * meshes are 6.4 MB, and a baked chip means downloading all twelve to fill a
   * rail nobody has clicked yet. The drawing is also simply better at 46 px — the
   * liver's own authored colour is nearly black and the gallbladder's is dark
   * green, so twelve honest renders would be twelve dark blobs, while a heart, a
   * brain and a pair of lungs are among the most recognisable outlines a human
   * being knows.
   */
  | 'organ-heart'
  | 'organ-brain'
  | 'organ-lungs'
  | 'organ-liver'
  | 'organ-gallbladder'
  | 'organ-kidney'
  | 'organ-eye'
  | 'organ-pancreas'
  | 'organ-ileum'
  | 'organ-colon'
  | 'organ-spleen'
  | 'organ-thymus'
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
  /**
   * One line that says what the specimen *is for*, not what it is called.
   *
   * "Cỗ máy săn lớn nhất từng đi trên cạn" is not decoration and it is not a
   * second summary: it is the sentence a teacher can open a lesson with, and it
   * is the only place in this panel where the writing is allowed a voice. It
   * sits directly under the title in italic, so the reader meets the idea before
   * the measurements — which is the order a specimen card has to be read in for
   * the numbers to mean anything.
   */
  poetic?: string;
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
  /**
   * Numbers and facts worth putting on screen, each with its own drawn mark.
   *
   * The glyph is authored per row rather than derived from the label. It is what
   * turns six lines of text into a specimen readout: the eye finds "how long is
   * it" by the shape of the rule beside it instead of by reading six labels in
   * sequence. A row with no glyph still renders — it just loses that.
   */
  facts?: { label: string; value: string; icon?: FactGlyph }[];
  /**
   * One or two short highlighted notes — the thing a teacher repeats out loud.
   * Rendered as tinted blocks under the readout, not as more body copy.
   *
   * The first note is the scientific point and takes the lavender tint; a second
   * one is the "did you know" and takes amber. Two tones, in that order, because
   * a page of identically tinted callouts is a page with no callouts.
   */
  notes?: LearningPoint[];
  /**
   * Where this specimen shows up outside the model — curriculum links, real
   * phenomena, the thing a student has already seen.
   *
   * A short list, not prose. It is the answer to "why am I looking at this",
   * which is the question a beautiful render does not answer on its own.
   */
  context?: string[];
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
  /** The subject's drawn mark in the switcher. */
  glyph: SubjectGlyph;
};
