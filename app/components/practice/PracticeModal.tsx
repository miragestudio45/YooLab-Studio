'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { PracticeIcon } from './PracticeIcons';
import type { PracticeExperience } from '../../lib/practice/manifest';

/**
 * The popup every practice experience opens into.
 *
 * The section behind it is a poster wall now, and that is the whole point: a
 * landing section cannot host a running WebGL lab and stay a landing section.
 * It has a heading to read, three things to choose between and four claims
 * underneath, and a live renderer in the middle of that competes with every
 * one of them for the same attention — while costing a context, a loader and an
 * animation loop to a visitor who is still deciding whether to look.
 *
 * So the lab moves here, and gets the two things it could never have on the
 * page:
 *
 *   - **the whole viewport.** A drone course or a palletising cell needs depth
 *     to read, and depth needs height. At 620 px inside a section the camera is
 *     always too close to the subject or too far from the detail.
 *   - **an exit.** A modal can be closed. A section cannot, so a lab embedded
 *     in one has to keep its controls polite enough to share a scroll container
 *     — no key capture, no pointer lock, no fullscreen.
 *
 * ## Fullscreen
 *
 * Two levels, and the distinction is deliberate. The dialog itself is already
 * ~94 vw × 92 vh — big enough that most visitors never ask for more. The
 * expand button goes to *real* fullscreen via the Fullscreen API on the card,
 * which drops the browser chrome as well and is the mode a projector in a
 * classroom actually wants.
 *
 * The API is requested on the card rather than the overlay so the card keeps
 * its own border radius and padding while filling the screen; `:fullscreen`
 * squares it off and drops the scrim, since there is nothing left to scrim.
 *
 * `requestFullscreen` rejects when the gesture is not trusted or the browser
 * disallows it (an iframe without `allowfullscreen`, iOS Safari on iPhone). The
 * failure is caught and the button simply stops offering — the dialog is
 * already large, so there is nothing to fall back *to*.
 */

export function PracticeModal({
  experience,
  onClose,
  children,
}: {
  experience: PracticeExperience;
  onClose: () => void;
  children: ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  /** Set once a request has been refused, so a dead button stops being offered. */
  const [fullscreenBlocked, setFullscreenBlocked] = useState(false);

  const toggleFullscreen = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    const request = card.requestFullscreen?.({ navigationUI: 'hide' });
    void Promise.resolve(request).catch(() => setFullscreenBlocked(true));
  }, []);

  /*
   * Fullscreen state comes from the event, never from the click.
   *
   * The user can leave fullscreen by pressing Escape or F11, neither of which
   * passes through this component. A boolean toggled optimistically in the
   * handler is wrong within one keystroke of being set.
   */
  useEffect(() => {
    /* Captured, not read from the ref in the cleanup: by teardown React has
       already detached the node and `cardRef.current` is null, so the exit
       below would never fire and the browser would be left fullscreen on a
       node that no longer exists. */
    const card = cardRef.current;
    const sync = () => setFullscreen(document.fullscreenElement === card);
    document.addEventListener('fullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      if (card && document.fullscreenElement === card) {
        void document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  /* Scroll lock, focus restore, Escape and a Tab trap. */
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const focusFrame = requestAnimationFrame(() => closeRef.current?.focus());

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        /*
         * One Escape, one meaning. In fullscreen the browser is already
         * handling this key to leave fullscreen, and closing the dialog on the
         * same press would collapse two steps into one — the visitor asked to
         * come back to the page, not to leave the lab.
         */
        if (document.fullscreenElement) return;
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !cardRef.current) return;
      const focusable = Array.from(
        cardRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => node.offsetParent !== null || node === document.activeElement);
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

  const titleId = `practice-modal-${experience.id}`;

  return (
    <div className="practice-modal" role="presentation">
      {/*
        The scrim is a sibling button rather than a click handler on the
        overlay. A handler on the overlay fires for anything that bubbles out
        of the lab — and a lab is nothing but drag gestures that end outside
        the element they started in, so a released orbit drag would close the
        dialog.
      */}
      <button
        type="button"
        className="practice-modal-scrim"
        aria-label="Đóng trải nghiệm"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        className="practice-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={cardRef}
        data-fullscreen={fullscreen ? 'true' : 'false'}
      >
        <header className="practice-modal-head">
          <p className="practice-modal-eyebrow">
            <b>{experience.index}</b>
            Thực hành &amp; STEM
          </p>
          <h2 id={titleId}>{experience.title}</h2>
          <div className="practice-modal-tools">
            {!fullscreenBlocked && (
              <button
                type="button"
                className="practice-modal-button"
                onClick={toggleFullscreen}
                aria-pressed={fullscreen}
              >
                <PracticeIcon name={fullscreen ? 'collapse' : 'expand'} />
                <span>{fullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}</span>
              </button>
            )}
            <button
              type="button"
              className="practice-modal-button practice-modal-button--close"
              onClick={onClose}
              ref={closeRef}
            >
              <PracticeIcon name="close" />
              <span>Đóng</span>
            </button>
          </div>
        </header>
        <div className="practice-modal-body">{children}</div>
      </div>
    </div>
  );
}
