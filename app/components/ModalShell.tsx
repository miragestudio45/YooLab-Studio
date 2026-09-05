'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The dialog behaviour both new overlays need, written once.
 *
 * `PracticeModal` already implements this correctly and is deliberately left
 * alone — it also owns fullscreen, and Escape means something different while
 * the browser is in it. This is the plain case: the consultation form and the
 * trial invitation, which are ordinary modal dialogs and must not each grow
 * their own half-correct copy of scroll locking and focus handling.
 *
 * What it guarantees, all of which MKT's checklist asks for by name:
 *
 *   - `role="dialog"` + `aria-modal`, labelled by its own heading.
 *   - Escape closes.
 *   - Focus moves in on open and returns to the trigger on close.
 *   - Tab is trapped inside.
 *   - The page behind cannot scroll — and does not shift, because the
 *     scrollbar's width is replaced as padding rather than simply removed.
 */
export function ModalShell({
  open,
  onClose,
  labelledBy,
  className = '',
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Id of the heading inside `children`. */
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;

    /*
     * Replace the scrollbar's width instead of just hiding overflow.
     *
     * Locking the body without this is the classic modal layout shift: the
     * scrollbar disappears, the viewport gets ~15px wider and every centred
     * section on the page jumps sideways behind the dialog.
     */
    const gap = window.innerWidth - document.documentElement.clientWidth;
    const previousOverflow = document.body.style.overflow;
    const previousPad = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;

    const frame = requestAnimationFrame(() => {
      const first = panel?.querySelector<HTMLElement>(
        'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
      );
      (first ?? panel)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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

    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPad;
      previousFocus?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        className={`modal-panel ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        ref={panelRef}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
