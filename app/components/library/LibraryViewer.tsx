'use client';

import { Suspense, lazy } from 'react';
import { ModelStage } from './ModelStage';
import type { BuiltExperienceKey, ExperienceManifest } from '../../lib/library/types';

/**
 * The centre of the workspace.
 *
 * Every built experience is behind its own `lazy`, which is the whole reason the
 * Library can carry a periodic table, a cell, a simulation and a globe without
 * the homepage paying for any of them: opening Chemistry fetches the chemistry
 * chunk and nothing else, and a visitor who never scrolls to the Library
 * downloads none of it.
 */

const EXPERIENCE_COMPONENTS: Record<
  Exclude<BuiltExperienceKey, 'formula-workshop'>,
  React.LazyExoticComponent<() => React.JSX.Element>
> = {
  'periodic-table': lazy(() =>
    import('./experiences/PeriodicTable').then((module) => ({ default: module.PeriodicTable }))),
  'cell-studio': lazy(() =>
    import('./experiences/CellStudio').then((module) => ({ default: module.CellStudio }))),
  'projectile-lab': lazy(() =>
    import('./experiences/ProjectileLab').then((module) => ({ default: module.ProjectileLab }))),
  'globe-explorer': lazy(() =>
    import('./experiences/GlobeExplorer').then((module) => ({ default: module.GlobeExplorer }))),
};

export function LibraryViewer({
  item,
  onOpenWorkshop,
}: {
  item: ExperienceManifest;
  onOpenWorkshop: () => void;
}) {
  const { view } = item;

  if (view.type === 'model') {
    return <ModelStage url={view.url} preset={view.preset} framing={view.framing} label={item.title} />;
  }

  if (view.type === 'experience' && view.key !== 'formula-workshop') {
    const Experience = EXPERIENCE_COMPONENTS[view.key];
    return (
      <Suspense fallback={<p className="model-stage-status">Đang mở trải nghiệm…</p>}>
        <Experience />
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
