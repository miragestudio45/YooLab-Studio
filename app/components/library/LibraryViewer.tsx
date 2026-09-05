'use client';

import { Suspense, lazy } from 'react';
import type { BuiltExperienceKey, ExperienceManifest } from '../../lib/library/types';

/**
 * The centre of the workspace.
 *
 * Every built experience is behind its own `lazy`, which is the whole reason the
 * Library can carry a periodic table, seven molecules, six cells, four physics
 * models, a globe and a planet cross-section without the homepage paying for any
 * of them: opening Chemistry fetches the chemistry chunk and nothing else, and a
 * visitor who never scrolls to the Library downloads none of it.
 *
 * `params` is what lets one component serve many manifest entries. Six cell
 * types are one `CellStudio` and one chunk, not six components — and the rail
 * still shows six specimens, because the manifest is the unit of content, not
 * the module.
 */

/*
 * The two shared stages are split for the same reason the experiences are.
 *
 * They were the exception that undid the rule above: ten experiences behind
 * `lazy` while `CreatureStage` and `ModelStage` — and through them the library
 * environment and the creature pipeline — were imported statically, so the
 * Library still shipped a stage's worth of code to a visitor who never scrolled
 * to it. They are what the *first* rail selection needs, never what the page
 * needs, and the fallback below is the one the rail already shows.
 */
const CreatureStage = lazy(() =>
  import('./CreatureStage').then((module) => ({ default: module.CreatureStage })));
const ModelStage = lazy(() =>
  import('./ModelStage').then((module) => ({ default: module.ModelStage })));

/** Every built experience takes the same one prop. */
export type ExperienceProps = { params?: Record<string, string> };

type LazyExperience = React.LazyExoticComponent<(props: ExperienceProps) => React.JSX.Element>;

const EXPERIENCE_COMPONENTS: Record<
  Exclude<BuiltExperienceKey, 'formula-workshop'>,
  LazyExperience
> = {
  'periodic-table': lazy(() =>
    import('./experiences/PeriodicTable').then((module) => ({ default: module.PeriodicTable }))),
  'molecule-viewer': lazy(() =>
    import('./experiences/MoleculeViewer').then((module) => ({ default: module.MoleculeViewer }))),
  'cell-studio': lazy(() =>
    import('./experiences/CellStudio').then((module) => ({ default: module.CellStudio }))),
  'projectile-lab': lazy(() =>
    import('./experiences/ProjectileLab').then((module) => ({ default: module.ProjectileLab }))),
  'incline-lab': lazy(() =>
    import('./experiences/InclineLab').then((module) => ({ default: module.InclineLab }))),
  'wave-lab': lazy(() =>
    import('./experiences/WaveLab').then((module) => ({ default: module.WaveLab }))),
  'circuit-lab': lazy(() =>
    import('./experiences/CircuitLab').then((module) => ({ default: module.CircuitLab }))),
  'globe-explorer': lazy(() =>
    import('./experiences/GlobeExplorer').then((module) => ({ default: module.GlobeExplorer }))),
  'earth-layers': lazy(() =>
    import('./experiences/EarthLayers').then((module) => ({ default: module.EarthLayers }))),
  'toolkit-bench': lazy(() =>
    import('./experiences/ToolkitBench').then((module) => ({ default: module.ToolkitBench }))),
};

/**
 * The Formula card is the one experience that opens full screen, so the viewer
 * shows a live preview of the real car rather than a photograph of it.
 *
 * It is not in the map above because it takes a different prop — the callback
 * that opens the overlay — and because it is the heaviest chunk on the site: the
 * car model, its four texture sets and the Formula runtime. Behind its own
 * `lazy`, none of that is fetched until a visitor actually selects the workshop
 * in the STEM rail, and the preview itself falls back to the poster on reduced
 * data or a narrow viewport.
 */
const FormulaPreview = lazy(() =>
  import('../FormulaPreview').then((module) => ({ default: module.FormulaPreview })));

export function LibraryViewer({
  item,
  onOpenWorkshop,
}: {
  item: ExperienceManifest;
  onOpenWorkshop: () => void;
}) {
  const { view } = item;

  /*
   * The three creatures go through the hero's own renderer.
   *
   * This is the branch that fixed the worst inconsistency on the site: the bee
   * in the Library used to be the generic GLB path with a solid ruby material
   * over it, so the same animal that is optical glass in the hero arrived here
   * as flat red plastic with opaque wings. Same pipeline, different camera.
   */
  if (view.type === 'creature') {
    return (
      <Suspense fallback={<div className="stage-status"><i />Đang mở trải nghiệm…</div>}>
        <CreatureStage creature={view.creature} framing={view.framing} label={item.title} />
      </Suspense>
    );
  }

  if (view.type === 'model') {
    return (
      <Suspense fallback={<div className="stage-status"><i />Đang mở trải nghiệm…</div>}>
        <ModelStage
          url={view.url}
          preset={view.preset}
          framing={view.framing}
          clips={view.clips}
          defaultClip={view.defaultClip}
          lockRoot={view.lockRoot}
          shell={view.shell}
          anchors={view.anchors}
          label={item.title}
        />
      </Suspense>
    );
  }

  if (view.type === 'experience' && view.key === 'formula-workshop') {
    return (
      <Suspense fallback={<div className="stage-status"><i />Đang mở xưởng mô hình…</div>}>
        <FormulaPreview onOpen={onOpenWorkshop} />
      </Suspense>
    );
  }

  if (view.type === 'experience' && view.key !== 'formula-workshop') {
    const Experience = EXPERIENCE_COMPONENTS[view.key];
    return (
      <Suspense fallback={<div className="stage-status"><i />Đang mở trải nghiệm…</div>}>
        <Experience params={view.params} />
      </Suspense>
    );
  }

  if (view.type === 'poster') {
    return (
      <div className="viewer-poster">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={view.src} alt={view.alt} loading="lazy" decoding="async" />
        <button type="button" className="viewer-poster-open" onClick={onOpenWorkshop}>
          Mở trải nghiệm <span aria-hidden="true">↗</span>
        </button>
      </div>
    );
  }

  /*
   * The honest empty stage.
   *
   * Deliberately not a card with a disabled button on it: an outline of an
   * instrument and one sentence saying what is missing. Nothing here is
   * clickable, because nothing here works yet.
   */
  return (
    <div className="viewer-empty">
      <svg viewBox="0 0 220 150" aria-hidden="true" className="viewer-empty-art">
        <g fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
          <path d="M74 22h34v34l26 58a14 14 0 0 1-12 21H60a14 14 0 0 1-12-21l26-58Z" opacity="0.45" />
          <path d="M60 106h62" opacity="0.3" />
          <path d="M74 22h34" opacity="0.6" />
          <circle cx="164" cy="44" r="20" opacity="0.3" />
          <path d="M164 24v40M144 44h40" opacity="0.22" />
        </g>
      </svg>
      <p>{item.description}</p>
    </div>
  );
}
