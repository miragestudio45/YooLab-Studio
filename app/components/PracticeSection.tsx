'use client';

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useFormulaGate } from './FormulaGate';
import { FormulaLab } from './practice/FormulaLab';
import { PracticeIcon } from './practice/PracticeIcons';
import {
  PRACTICE_BENEFITS,
  PRACTICE_EXPERIENCES,
  findExperience,
  type PracticeId,
} from '../lib/practice/manifest';

/**
 * Thực hành & STEM — one stage, three real labs.
 *
 * The version this replaces had one working experience and one drawn absence,
 * and was composed to say exactly that: a wide workshop card beside a column
 * with no frame and nothing to click. That was the honest shape for a section
 * with one product. It is not the shape for a section with three.
 *
 * What is here now is a hub, and the composition is the argument: **one** large
 * live stage, because only one 3D experience can be worth looking at at a time;
 * a brief column welded to it, because a running experience needs its name and
 * its verbs within one glance of itself; and a narrow rail of three, because
 * choosing between three things is a list and not a gallery.
 *
 * Two rules hold this together and neither is negotiable:
 *
 *   - **One heavy renderer at a time.** Selecting a lab unmounts the previous
 *     one, which disposes its WebGL context, its geometries, its materials and
 *     its animation loop. Three live contexts on one page would cost more than
 *     the rest of the site put together, and browsers cap contexts anyway — the
 *     fourth one silently kills the first.
 *   - **One room.** The Formula workshop, the drone course and the robot cell
 *     all stand in the Library's ivory studio, under the Library's four-light
 *     rig, on the Library's measured grid. Two of the three were adapted from
 *     outside projects with strong looks of their own, and letting either keep
 *     it would have turned one product into three demos in a row.
 */

/*
 * The two adapted labs are code-split, and the rail preloads them on intent.
 *
 * This is the one preload in this section that is worth doing. The drone and
 * the robot fetch no assets at all — every mesh in both is built from
 * primitives at mount — so there is nothing to warm but the module itself, and
 * a module is exactly what a hover can fetch in the ~200 ms before a click
 * lands. The Formula workshop is the opposite case: it is eleven GLBs and eight
 * textures, and it is the default selection, so it is imported statically and
 * begins loading with the page rather than being prefetched into a race.
 */
const DroneLab = lazy(() => import('./practice/DroneLab').then((module) => ({ default: module.DroneLab })));
const RobotLab = lazy(() => import('./practice/RobotLab').then((module) => ({ default: module.RobotLab })));

const PRELOAD: Record<PracticeId, (() => Promise<unknown>) | null> = {
  formula: null,
  drone: () => import('./practice/DroneLab'),
  robot: () => import('./practice/RobotLab'),
};

/** Crossfade length. Long enough to read as a transition, short enough to obey. */
const SWAP_MS = 320;

function LabFallback() {
  return (
    <p className="lab-status">
      <i />
      Đang mở phòng thực hành…
    </p>
  );
}

export function PracticeSection() {
  const { openFormula } = useFormulaGate();
  const [active, setActive] = useState<PracticeId>('formula');
  const [swapping, setSwapping] = useState(false);
  /** Bumped by the brief column's CTA; each lab reads it as "start now". */
  const [startSignal, setStartSignal] = useState(0);
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preloaded = useRef(new Set<PracticeId>());

  useEffect(() => () => { if (swapTimer.current) clearTimeout(swapTimer.current); }, []);

  const preload = useCallback((id: PracticeId) => {
    if (preloaded.current.has(id)) return;
    preloaded.current.add(id);
    PRELOAD[id]?.();
  }, []);

  const select = useCallback((id: PracticeId) => {
    if (id === active) return;
    preload(id);
    /*
     * Fade out, swap, fade in — and the swap happens at the *bottom* of the
     * fade rather than immediately. Unmounting a WebGL context is not free, and
     * doing it under a fully-lit stage shows the visitor a frame of empty
     * ivory. Under an opacity of zero it shows them nothing at all.
     */
    setSwapping(true);
    if (swapTimer.current) clearTimeout(swapTimer.current);
    swapTimer.current = setTimeout(() => {
      setActive(id);
      setStartSignal(0);
      setSwapping(false);
    }, SWAP_MS * 0.6);
  }, [active, preload]);

  const experience = findExperience(active);

  return (
    <section className="practice" id="thuc-hanh" aria-labelledby="practice-title">
      <div className="shell">
        <div className="section-heading section-heading--split practice-head" data-reveal>
          <div>
            <p className="section-kicker">Thực hành &amp; STEM</p>
            <h2 id="practice-title">Thực hành những điều<br /><em>khó thực hiện trong lớp học.</em></h2>
          </div>
          <p>
            Thiết bị đắt, thao tác nguy hiểm, hoặc quá nhỏ để nhìn thấy. Trong
            không gian 3D, học sinh làm được — và làm lại bao nhiêu lần cũng được.
          </p>
        </div>

        <div className="practice-hub" data-reveal>
          <div className="practice-main">
            <div className={`practice-stage${swapping ? ' is-swapping' : ''}`}>
              {/*
                `key` on the experience id, not a prop swap. Each lab owns a
                WebGL context, a loader and an animation loop, and re-keying is
                the only way to guarantee the outgoing one is torn down in order
                before the incoming one asks for a context.
              */}
              <Suspense fallback={<LabFallback />}>
                {active === 'formula' && <FormulaLab key="formula" onOpenFull={openFormula} />}
                {active === 'drone' && <DroneLab key="drone" startSignal={startSignal} />}
                {active === 'robot' && <RobotLab key="robot" startSignal={startSignal} />}
              </Suspense>
            </div>

            <aside className={`practice-brief${swapping ? ' is-swapping' : ''}`} aria-live="polite">
              <p className="practice-brief-index">{experience.index}</p>
              <h3>{experience.title}</h3>
              <p className="practice-brief-summary">{experience.summary}</p>

              <ul className="practice-capabilities">
                {experience.capabilities.map((capability) => (
                  <li key={capability.label}>
                    <i aria-hidden="true"><PracticeIcon name={capability.glyph} /></i>
                    <div>
                      <b>{capability.label}</b>
                      <span>{capability.detail}</span>
                    </div>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className="practice-cta"
                onClick={() => {
                  if (experience.id === 'formula') openFormula();
                  else setStartSignal((signal) => signal + 1);
                }}
              >
                {experience.action}
                <span aria-hidden="true">›</span>
              </button>
            </aside>
          </div>

          <div className="practice-rail" role="tablist" aria-label="Chọn phòng thực hành">
            {PRACTICE_EXPERIENCES.map((entry) => (
              <button
                type="button"
                key={entry.id}
                role="tab"
                aria-selected={entry.id === active}
                className={`practice-rail-item${entry.id === active ? ' is-active' : ''}`}
                onClick={() => select(entry.id)}
                onPointerEnter={() => preload(entry.id)}
                onFocus={() => preload(entry.id)}
              >
                <i aria-hidden="true"><PracticeIcon name={entry.mark} /></i>
                <span>
                  <b>{entry.index}</b>
                  {entry.railTitle.split('\n').map((line, index) => (
                    <em key={index}>{line}</em>
                  ))}
                </span>
              </button>
            ))}
            <p className="practice-rail-note">
              <PracticeIcon name="signal" />
              3 phòng thực hành. Vô số kiến thức.
            </p>
          </div>
        </div>

        <ul className="practice-benefits" data-reveal>
          {PRACTICE_BENEFITS.map((benefit) => (
            <li key={benefit.label}>
              <i aria-hidden="true"><PracticeIcon name={benefit.glyph} /></i>
              <div>
                <b>{benefit.label}</b>
                <span>{benefit.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
