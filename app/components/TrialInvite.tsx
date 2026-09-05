'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ModalShell } from './ModalShell';
import { StartWithYooLabButton } from './StartWithYooLabButton';
import { useConsult } from './ConsultModal';

/**
 * The trial invitation.
 *
 * Opens on whichever comes first: six seconds on the page, or reaching the
 * fourth section. Once per browsing session, and never again once dismissed.
 *
 * ## Why `sessionStorage` and not `localStorage`
 *
 * MKT asked for "only once for the relevant browsing session". A dismissal that
 * outlives the tab would mean a visitor who came back a week later never sees
 * the offer again; one that resets on every scroll would mean the modal is a
 * pop-up in the pejorative sense. The session is the right unit, and it is also
 * the unit that survives the in-page navigation this site does.
 *
 * ## Why the copy is roles rather than "Đăng ký ngay"
 *
 * The same reason the hero opens on two roles: a visitor six seconds into the
 * page still does not necessarily know which half of the product is theirs. The
 * three options here are the same three the Education section uses, so the
 * dialog restates the site's own structure instead of introducing a fourth way
 * of describing the product.
 *
 * No canvas, no new render loop, no image beyond what the page already has —
 * see the performance note in the task brief. This is type and rules.
 */

const SEEN_KEY = 'yoolab.trial-invite.seen';
const DELAY_MS = 6000;
/** Zero-based: the fourth section on the page. */
const SECTION_INDEX = 3;

export function TrialInvite() {
  const [open, setOpen] = useState(false);
  const uid = useId();
  const consult = useConsult();
  /* Guards the whole lifecycle, including the gap between a timer firing and
     React committing the state — so a scroll trigger cannot open a second one. */
  const spent = useRef(false);

  const close = useCallback(() => {
    setOpen(false);
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ }
  }, []);

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(SEEN_KEY) === '1'; } catch { /* private mode */ }
    if (seen) return;

    /* Respect a visitor who has asked for less motion by not ambushing them
       mid-scroll — they still get the dialog, on the timer, once. */
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const fire = () => {
      if (spent.current) return;
      /* Re-read rather than trust the check above: six seconds is long enough
         for the visitor to have dismissed it from another trigger, and long
         enough for a harness to mark it seen. */
      try { if (sessionStorage.getItem(SEEN_KEY) === '1') { spent.current = true; return; } } catch { /* private mode */ }
      spent.current = true;
      /* Marked as seen the moment it opens, not when it closes: a visitor who
         reloads with the dialog on screen has already been asked. */
      try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ }
      setOpen(true);
    };

    const timer = window.setTimeout(fire, DELAY_MS);

    let observer: IntersectionObserver | undefined;
    if (!reduce) {
      const sections = Array.from(document.querySelectorAll('main > * > section, main > section'));
      const fourth = sections[SECTION_INDEX];
      if (fourth) {
        observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) fire();
        }, { rootMargin: '-25% 0px' });
        observer.observe(fourth);
      }
    }

    return () => {
      window.clearTimeout(timer);
      observer?.disconnect();
    };
  }, []);

  return (
    <ModalShell open={open} onClose={close} labelledBy={`${uid}-title`} className="trial-modal">
      <button type="button" className="modal-close" onClick={close} aria-label="Đóng lời mời dùng thử">
        <span aria-hidden="true">✕</span>
      </button>

      <p className="consult-eyebrow">YooLab</p>
      <h2 id={`${uid}-title`}>Một nền tảng. <em>Ba cách sử dụng.</em></h2>
      <p className="trial-lede">Bạn đang ở vai nào? Chọn một để bắt đầu đúng chỗ.</p>

      <ul className="trial-roles">
        <li>
          <b>Giáo viên</b>
          <p>Soạn và tổ chức bài học 3D/XR</p>
          <StartWithYooLabButton className="trial-cta trial-cta--solid" onClick={close}>
            Mở YooLab ngay
          </StartWithYooLabButton>
        </li>
        <li>
          <b>Học sinh</b>
          <p>Khám phá và thực hành 3D/XR</p>
          <a className="trial-cta" href="#thu-vien" onClick={close}>Khám phá bài học</a>
        </li>
        <li>
          <b>Nhà trường / Tổ chức</b>
          <p>Triển khai học liệu và không gian học tập số</p>
          <button
            type="button"
            className="trial-cta"
            onClick={() => { close(); consult.open('trial-invite:school'); }}
          >
            Trao đổi triển khai
          </button>
        </li>
      </ul>

      <button type="button" className="trial-dismiss" onClick={close}>Để sau</button>
    </ModalShell>
  );
}
