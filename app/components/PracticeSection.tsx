'use client';

import { useCallback, useEffect, useState } from 'react';
import { PracticeIcon } from './practice/PracticeIcons';
import { PracticeModal } from './practice/PracticeModal';
import {
  PRACTICE_BENEFITS,
  PRACTICE_EXPERIENCES,
  findExperience,
  type PracticeId,
} from '../lib/practice/manifest';

/**
 * Thực hành & STEM — three labs, one poster wall, one popup.
 *
 * The version this replaces put a live WebGL lab in the middle of the section
 * and swapped it as the rail was clicked. It worked, and it was the wrong
 * shape, for a reason that only shows up once there are three of them: **a
 * chooser cannot also be the thing being chosen.** A running renderer wants
 * key focus, drag gestures, a loading state and every pixel it can get; a
 * section wants to be read, scrolled past, and to offer three doors. Putting
 * one inside the other cost the section its composure and the lab its room, and
 * it charged every visitor a WebGL context plus eleven GLBs for the privilege
 * of scrolling past.
 *
 * So the section is now a poster wall and the labs open into `PracticeModal`:
 *
 *   - **the stage** is the selected experience's still, cropped to the stage's
 *     own aspect at build time. It is the whole click target.
 *   - **the brief** beside it names what the experience is and what its three
 *     verbs are, and carries the one primary button.
 *   - **the rail** is three photographs, because these three subjects
 *     photograph well and a drawn mark of a drone at 30 px is a smudge. The
 *     previous build used glyphs here for an honest reason — two of the labs
 *     were built from primitives, so there was no object to photograph. The
 *     robot now loads a real industrial arm and the stills are renders of the
 *     same three subjects, so the rail can show them.
 *
 * Nothing here mounts a renderer, and since the three experiences became their
 * own deployments nothing in this bundle does — see `lib/practice/manifest.ts`.
 * The section's entire cost is three WebP posters and three thumbnails, about
 * 440 kB fetched lazily; the popup embeds the build a visitor actually opens.
 *
 * The preloader that used to live here is gone with the labs. Warming a `lazy`
 * import on pointer-enter bought ~200 ms on a chunk this bundle no longer
 * contains, and there is nothing honest to prefetch in its place: a hidden
 * `<iframe>` or a `<link rel="prefetch">` at an external origin would start
 * downloading a whole simulator for a visitor who only moved the mouse across a
 * thumbnail.
 */

export function PracticeSection() {
  const [active, setActive] = useState<PracticeId>('excavator');
  const [open, setOpen] = useState(false);

  const select = useCallback((id: PracticeId) => setActive(id), []);

  const launch = useCallback((id: PracticeId) => {
    setActive(id);
    setOpen(true);
  }, []);

  /* A hash link to a specific experience opens it. The Library does the same,
     and it is what makes "xem thử phòng robot" shareable as a URL. */
  useEffect(() => {
    const fromHash = () => {
      const match = /^#thuc-hanh\/(excavator|drone|robot)$/.exec(window.location.hash);
      if (!match) return;
      launch(match[1] as PracticeId);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [launch]);

  const close = useCallback(() => {
    setOpen(false);
    /* Leave the section's own anchor behind rather than the lab's, so closing
       the popup does not immediately reopen it on the next hashchange. */
    if (window.location.hash.startsWith('#thuc-hanh/')) {
      window.history.replaceState(null, '', '#thuc-hanh');
    }
  }, []);

  const experience = findExperience(active);

  return (
    <section className="practice" id="thuc-hanh" data-snap aria-labelledby="practice-title">
      <div className="shell">
        <div className="section-heading section-heading--split practice-head" data-reveal>
          <div>
            <p className="section-kicker">Thực hành &amp; STEM</p>
            <h2 id="practice-title" data-kinetic>Thực hành những điều<br /><em>khó thực hiện trong lớp học.</em></h2>
          </div>
          <p>
            Thiết bị đắt, thao tác nguy hiểm, hoặc quá nhỏ để nhìn thấy. Trong
            không gian 3D, học sinh làm được — và làm lại bao nhiêu lần cũng được.
          </p>
        </div>

        <div className="practice-hub" data-reveal>
          <div className="practice-main">
            {/*
              The poster is a button, not an image with a click handler. It is
              the largest affordance in the section and the one a visitor is
              most likely to try first, so it has to be reachable by keyboard
              and announce what it opens.
            */}
            <button
              type="button"
              className="practice-stage"
              onClick={() => launch(experience.id)}
              aria-label={`Mở trải nghiệm: ${experience.title}`}
            >
              {PRACTICE_EXPERIENCES.map((entry) => (
                /*
                 * All three posters are in the DOM and cross-faded, rather than
                 * one `src` being swapped. Swapping the source shows a blank
                 * frame on the first visit to each poster, because the decode
                 * happens after the paint — and a chooser that flashes white
                 * every time it is used reads as broken rather than as loading.
                 */
                <img
                  key={entry.id}
                  className={`practice-poster${entry.id === active ? ' is-active' : ''}`}
                  src={entry.poster}
                  alt={entry.id === active ? entry.posterAlt : ''}
                  aria-hidden={entry.id === active ? undefined : true}
                  width={1400}
                  height={1050}
                  loading={entry.id === 'excavator' ? undefined : 'lazy'}
                  decoding="async"
                  draggable={false}
                />
              ))}

              <span className="practice-live">
                <i aria-hidden="true" />
                Sẵn sàng trải nghiệm
              </span>

              <span className="practice-open" aria-hidden="true">
                <PracticeIcon name="expand" />
                Mở trải nghiệm
              </span>

              <span className="practice-tools" aria-hidden="true">
                {experience.tools.map((tool) => (
                  <span key={tool.label}>
                    <PracticeIcon name={tool.glyph} />
                    {tool.label}
                  </span>
                ))}
              </span>
            </button>

            {/*
              Outside the poster button, because a button inside a button is
              invalid and the dots have their own job: they page the chooser
              without opening anything.
            */}
            <div className="practice-dots" role="tablist" aria-label="Chọn phòng thực hành">
              {PRACTICE_EXPERIENCES.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  role="tab"
                  aria-selected={entry.id === active}
                  aria-label={entry.title}
                  className={`practice-dot${entry.id === active ? ' is-active' : ''}`}
                  onClick={() => select(entry.id)}
                />
              ))}
            </div>

            <aside className="practice-brief" aria-live="polite">
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
                onClick={() => launch(experience.id)}
              >
                {experience.action}
                <span aria-hidden="true">›</span>
              </button>
            </aside>
          </div>

          <div className="practice-rail" role="tablist" aria-label="Ba phòng thực hành">
            {PRACTICE_EXPERIENCES.map((entry) => (
              <button
                type="button"
                key={entry.id}
                role="tab"
                aria-selected={entry.id === active}
                className={`practice-rail-item${entry.id === active ? ' is-active' : ''}`}
                onClick={() => select(entry.id)}
                onDoubleClick={() => launch(entry.id)}
              >
                <i aria-hidden="true">
                  <img
                    src={entry.thumb}
                    alt=""
                    width={480}
                    height={360}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                </i>
                <span>
                  <b>{entry.index}</b>
                  {entry.railTitle.split('\n').map((line, index) => (
                    <em key={index}>{line}</em>
                  ))}
                </span>
              </button>
            ))}
            <p className="practice-rail-note">
              <PracticeIcon name="star" />
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

      {/* The dialog owns the embed, keyed on the url inside it. Mounted only
          while open, so a closed popup holds no frame and no external origin is
          contacted until a visitor asks for one. */}
      {open && <PracticeModal experience={experience} onClose={close} />}
    </section>
  );
}
