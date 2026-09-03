'use client';

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { PracticeIcon } from './PracticeIcons';
import { findExperience, type PracticeId } from '../../lib/practice/manifest';

/**
 * The window a lab actually runs in.
 *
 * The section itself is a set of cards now, and the reason is not decoration:
 * a 3D lab wants the whole screen. Every one of these has a step strip, an
 * objective line, a control pad and a live scene, and asking all of that to
 * share a 900 px panel with a column of copy is what made the first version
 * feel like a demo reel rather than a workshop. The card says what the lab is;
 * this says *do it*.
 *
 * Two levels of "big", deliberately:
 *
 *   - **the overlay** — a dialog covering the page, with the site's own chrome
 *     still legible around it. The visitor is still on YooLab, and Escape gets
 *     them out. This is where almost everyone will stay.
 *   - **true fullscreen** — the Fullscreen API, for a class doing the exercise
 *     on a projector. Offered rather than assumed, and it degrades to nothing
 *     on browsers (and iframes) that refuse it, which is why the button hides
 *     itself when `requestFullscreen` is not there to call.
 *
 * The labs are loaded here rather than in the section, so the section's own
 * bundle carries three cards and no WebGL at all.
 */

const FormulaLab = lazy(() => import('./FormulaLab').then((module) => ({ default: module.FormulaLab })));
const DroneLab = lazy(() => import('./DroneLab').then((module) => ({ default: module.DroneLab })));
const RobotLab = lazy(() => import('./RobotLab').then((module) => ({ default: module.RobotLab })));

export const PRELOAD: Record<PracticeId, () => Promise<unknown>> = {
  formula: () => import('./FormulaLab'),
  drone: () => import('./DroneLab'),
  robot: () => import('./RobotLab'),
};

export function PracticeOverlay({
  id,
  onClose,
  onSelect,
  experiences,
}: {
  id: PracticeId;
  onClose: () => void;
  onSelect: (next: PracticeId) => void;
  experiences: { id: PracticeId; index: string; title: string }[];
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const experience = findExperience(id);

  /*
   * Body scroll lock, focus trap and Escape — the same three the Formula
   * overlay has always done, because a dialog that leaves the page scrolling
   * underneath it is a dialog the visitor can lose.
   */
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const focusFrame = requestAnimationFrame(() => closeRef.current?.focus());

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (document.fullscreenElement) return; // the browser handles this one
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !frameRef.current) return;
      const focusable = Array.from(frameRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])',
      )).filter((node) => node.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
      previousFocus?.focus();
    };
  }, [onClose]);

  /*
   * Whether the button appears at all is a capability question, and the answer
   * differs between browsers and between an iframe and a tab.
   *
   * Read during the first render rather than set from an effect: it never
   * changes for the life of the dialog, so an effect would only be a second
   * render that lands after the bar has already been painted without the
   * button in it.
   */
  const [canFullscreen] = useState(
    () => typeof document !== 'undefined'
      && typeof document.documentElement.requestFullscreen === 'function',
  );

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void frame.requestFullscreen?.().catch(() => {});
    }
  }, []);

  return (
    <div className="practice-overlay" role="dialog" aria-modal="true" aria-label={experience.title}>
      <div className="practice-overlay-frame" ref={frameRef}>
        <header className="practice-overlay-bar">
          <p className="practice-overlay-title">
            <b>{experience.index}</b>
            {experience.title}
          </p>

          {/* Switching lab from inside the overlay: the visitor is already in
              the mood to try things, and sending them back out to the cards to
              do it is a step nobody needs. */}
          <div className="practice-overlay-tabs" role="group" aria-label="Chọn phòng thực hành">
            {experiences.map((entry) => (
              <button
                type="button"
                key={entry.id}
                aria-pressed={entry.id === id}
                className={entry.id === id ? 'is-active' : ''}
                onClick={() => onSelect(entry.id)}
              >
                <b>{entry.index}</b>
                <span>{entry.title}</span>
              </button>
            ))}
          </div>

          <div className="practice-overlay-actions">
            {canFullscreen && (
              <button
                type="button"
                className="practice-overlay-button"
                aria-pressed={fullscreen}
                onClick={toggleFullscreen}
              >
                <PracticeIcon name={fullscreen ? 'collapse' : 'expand'} />
                <span>{fullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}</span>
              </button>
            )}
            <button
              type="button"
              className="practice-overlay-close"
              onClick={onClose}
              aria-label="Đóng phòng thực hành"
              ref={closeRef}
            >
              <PracticeIcon name="close" />
            </button>
          </div>
        </header>

        <div className="practice-overlay-stage">
          {/*
            `key` on the id: each lab owns a WebGL context, a loader and an
            animation loop, and re-keying is the only way to guarantee the
            outgoing one is torn down in order before the incoming one asks for
            a context.
          */}
          <Suspense fallback={<p className="lab-status"><i />Đang mở phòng thực hành…</p>}>
            {id === 'formula' && <FormulaLab key="formula" />}
            {id === 'drone' && <DroneLab key="drone" />}
            {id === 'robot' && <RobotLab key="robot" />}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
