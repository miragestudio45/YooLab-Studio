'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LibraryViewer } from './LibraryViewer';
import { LibraryIcon } from './LibraryIcons';
import { RailVisual } from './RailVisual';
import { ScrollThumb } from './ScrollThumb';
import { useFormulaGate } from '../FormulaGate';
import {
  DEFAULT_SUBJECT,
  EXPERIENCES,
  READY_EXPERIENCES,
  SUBJECTS,
  SUBJECT_GAPS,
  experiencesForSubject,
  readyCountForSubject,
} from '../../lib/library/manifest';
import { subscribeToLibraryOpen } from '../../lib/library/openExperience';
import type { ExperienceManifest, SubjectId } from '../../lib/library/types';

/**
 * The YooLab Library.
 *
 * This is the section that has to answer "does this platform actually have
 * content?", and a grid of cards cannot answer it — a card is a promise, and
 * every visitor has learned to discount promises. So the Library is not a
 * catalogue page. It is the application: a subject switcher across the top, the
 * subject's specimens down the left, the specimen itself running at full size in
 * the middle, and what a teacher needs to know about it on the right.
 *
 * Four deliberate consequences of that:
 *
 *   - the centre gets the space. On a 1920 screen the viewer is roughly a
 *     thousand pixels wide, because the specimen is the product and the panels
 *     are the chrome, not the other way round.
 *   - **it is exactly one screen.** Head band, subject switcher and workspace are
 *     three rows of one screen-tall grid, so the arithmetic is done by the layout
 *     engine against the real heading rather than against a token that guessed
 *     its height. Nothing belongs below this fold; there is nothing below it.
 *   - switching subject or specimen never reloads. It is state, so the whole
 *     thing transitions instead of blinking.
 *   - a subject with nothing in it says so in the middle of the workspace, at
 *     full size, in plain words. That is a stronger signal of good faith than a
 *     hidden tab would be, and it is what stops the ready experiences from being
 *     read as a sample of thirty.
 *
 * The three panels are three separate cards with a gutter between them rather
 * than one bordered box with dividers. That gap is most of the difference
 * between "a section of a website" and "an application": a divider says the
 * panels are paragraphs of one document, a gutter says they are instruments that
 * happen to sit side by side.
 *
 * ---- what used to be under here ----
 *
 * A four-card strip: three "related" specimens and a note. It is gone, and its
 * removal is the reason this section can now be a chapter of the page's snap
 * track rather than a tall band you scroll through. Everything the strip listed
 * was already in the rail eight hundred pixels above it, and the note said in a
 * paragraph what the `Mở được ngay` tag on every row says in two words. A stop
 * says its one thing once.
 */

const KIND_LABEL: Record<ExperienceManifest['kind'], string> = {
  'model-3d': 'Mô hình 3D',
  interactive: 'Tương tác',
  simulation: 'Mô phỏng',
  lab: 'Phòng thực hành',
  story: 'Bài kể',
  workshop: 'Trải nghiệm',
};

function normalise(value: string) {
  return value
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

/**
 * Word-prefix search, not raw substring.
 *
 * Stripping Vietnamese diacritics collapses a lot of words onto each other, so a
 * plain `includes` is far too loose: "ong" matched every resource because it
 * appears inside "xuong", "trong" and "dong". Requiring each query token to
 * start a word makes "ong" find the bee and nothing else.
 */
function matches(haystack: string, query: string) {
  const words = normalise(haystack).split(/[^0-9a-z]+/).filter(Boolean);
  const tokens = normalise(query).split(/[^0-9a-z]+/).filter(Boolean);
  if (!tokens.length) return true;
  return tokens.every((token) => words.some((word) => word.startsWith(token)));
}

/**
 * The subject's accent, resolved per row rather than per workspace: a search
 * lists items from every subject at once, so the tint has to travel with the
 * item. It is handed to the row as a custom property and read by the drawn marks
 * through `currentColor`.
 */
function tintFor(subject: SubjectId) {
  return SUBJECTS.find((entry) => entry.id === subject)?.tint ?? 'var(--color-accent-strong)';
}

function labelFor(subject: SubjectId) {
  return SUBJECTS.find((entry) => entry.id === subject)?.label ?? '';
}

export function LibraryWorkspace() {
  const { openFormula } = useFormulaGate();
  const [subject, setSubject] = useState<SubjectId>(DEFAULT_SUBJECT);
  const [activeId, setActiveId] = useState<string>(
    () => experiencesForSubject(DEFAULT_SUBJECT)[0]?.id ?? '',
  );
  const [query, setQuery] = useState('');
  /** Mobile: the info panel is a sheet rather than a column. */
  const [sheetOpen, setSheetOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLUListElement>(null);
  const creditsRef = useRef<HTMLDetailsElement>(null);

  const subjectItems = useMemo(() => experiencesForSubject(subject), [subject]);

  const searchHits = useMemo(() => {
    const text = query.trim();
    if (!text) return null;
    return EXPERIENCES.filter((item) =>
      matches(
        `${item.title} ${item.subtitle ?? ''} ${item.topic} ${item.summary} ${item.keywords ?? ''}`,
        text,
      ));
  }, [query]);

  const listed = searchHits ?? subjectItems;
  /*
   * The selection is resolved *inside* whatever the rail is showing, never
   * against the whole manifest, and it falls back to the first row rather than
   * being corrected by an effect.
   *
   * Both halves of that matter. Looking the id up globally meant that switching
   * to a subject with nothing in it left the previous subject's specimen running
   * in the viewer while the rail said the subject was empty — the one place on
   * this page where the workspace would have contradicted itself. And deriving
   * the fallback here rather than writing `setActiveId` from an effect means the
   * first render after a subject change is already correct, instead of painting
   * a wrong selection and then re-rendering to fix it.
   */
  const active = useMemo(
    () => listed.find((item) => item.id === activeId) ?? listed[0] ?? null,
    [activeId, listed],
  );

  /*
   * Deep links from elsewhere on the page.
   *
   * The proof cards and the practice section point at specific experiences, and
   * they have to land on them — clearing the search too, or a stale query would
   * filter the requested specimen straight back out of the rail.
   */
  useEffect(() => subscribeToLibraryOpen(({ subject: next, id }) => {
    setSubject(next);
    setQuery('');
    setActiveId(id);
    setSheetOpen(false);
  }), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /*
   * "Nguồn & giấy phép" opens the licence block and scrolls it into view.
   *
   * Scrolling the panel's own `scrollTop` rather than calling `scrollIntoView`:
   * the knowledge card is an internal scroller inside a viewport-fitted
   * workspace, and `scrollIntoView` walks *every* scrollable ancestor, so it
   * moved the whole page as well as the panel.
   */
  const revealCredits = useCallback(() => {
    const details = creditsRef.current;
    const panel = panelRef.current;
    if (!details || !panel) return;
    details.open = true;
    panel.scrollTo({
      top: Math.max(details.offsetTop - 12, 0),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, []);

  const gap = SUBJECT_GAPS[subject];
  const readyCount = readyCountForSubject(subject);
  const subjectEntry = SUBJECTS.find((entry) => entry.id === subject);
  /*
   * A subject with nothing behind it gets one statement, not three.
   *
   * The three-column workspace applied to an empty subject produced an empty
   * rail, a 590 px void with a paragraph floating in the middle of it, and the
   * *same paragraph again* in the knowledge panel — the largest expanse of dead
   * canvas on the page, in the one place whose whole job is to say "there is
   * nothing here yet, honestly". One column, said once, is both smaller and more
   * convincing.
   */
  const emptySubject = !active && !searchHits;

  return (
    <section className="library" id="thu-vien" data-snap aria-labelledby="library-title">
      {/*
        One screen-tall grid: an `auto` head band, an `auto` chrome row and a
        `minmax(0, 1fr)` workspace. `--library-head` used to declare the band's
        height so the app could subtract it, and every time the band gained a
        line the workspace lost the bottom of a panel at whichever width the
        estimate went wrong. The layout engine measures the real heading now.
        See DESIGN.md §2, which learned this the same way in YooStudio.
      */}
      <div className="library-stage">
        {/* ----------------------------------------------------- head band --- */}
        <div className="shell-wide library-head" data-reveal="soft">
          <div className="library-head-copy">
            <p className="section-kicker">Thư viện YooLab</p>
            <h2 id="library-title">Học liệu 3D <em>mở được ngay</em></h2>
          </div>
          <p className="library-head-lede">
            Chọn môn, mở mô hình, đưa thẳng vào bài giảng.
          </p>
          <p className="library-head-count">
            <span><b>{READY_EXPERIENCES.length}</b> mở được ngay</span>
            <span><b>{listed.length}</b> {searchHits ? 'kết quả tìm' : 'trong môn này'}</span>
          </p>
        </div>

        {/* ------------------------------------------------ subject switcher --- */}
        {/* Borderless band, not a fourth card: the switcher is how you drive the
            three panels, so it must not read as a peer of them. */}
        <div className="shell-wide library-chrome" data-reveal="soft">
          <div className="library-subjects" role="tablist" aria-label="Môn học">
            {SUBJECTS.map((entry) => {
              const count = readyCountForSubject(entry.id);
              return (
                <button
                  type="button"
                  role="tab"
                  key={entry.id}
                  aria-selected={subject === entry.id}
                  aria-label={`${entry.label} — ${entry.note} — ${count === 0 ? 'đang bổ sung' : `${count} học liệu`}`}
                  className={`library-subject${subject === entry.id ? ' is-active' : ''}${count === 0 ? ' is-empty' : ''}`}
                  style={{ '--subject-tint': entry.tint } as React.CSSProperties}
                  onClick={() => { setSubject(entry.id); setQuery(''); }}
                >
                  <LibraryIcon name={entry.glyph} />
                  <b>{entry.label}</b>
                  <i aria-hidden="true">{count === 0 ? '—' : count}</i>
                </button>
              );
            })}
          </div>
          <label className="library-search">
            <LibraryIcon name="search" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm trong toàn thư viện…"
              aria-label="Tìm trong thư viện YooLab"
            />
            <kbd>⌘K</kbd>
          </label>
        </div>

        <div className="shell-wide library-app" data-reveal="soft">
          <div className={`library-body${emptySubject ? ' is-empty' : ''}`}>
            {/* --------------------------------------------- asset rail --- */}
            <aside className="library-rail" aria-label="Học liệu của môn">
              <div className="library-rail-head">
                <LibraryIcon name="shelf" />
                <span>{searchHits ? 'Kết quả tìm' : 'Học liệu'}</span>
                <b>{listed.length}</b>
              </div>

              <ul className="library-rail-list" ref={railRef}>
                {listed.map((item) => {
                  const isActive = active?.id === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`library-asset${isActive ? ' is-active' : ''}${item.status === 'planned' ? ' is-planned' : ''}`}
                        aria-current={isActive || undefined}
                        style={{ '--rail-tint': tintFor(item.subject) } as React.CSSProperties}
                        onClick={() => { setActiveId(item.id); setSheetOpen(false); }}
                      >
                        <span className="rail-visual"><RailVisual visual={item.rail} /></span>
                        <span className="library-asset-copy">
                          <span className="library-asset-kind">
                            {KIND_LABEL[item.kind]}
                            {searchHits && <em>{labelFor(item.subject)}</em>}
                          </span>
                          <b>{item.title}</b>
                          <small>{item.summary}</small>
                          {item.status === 'planned' && (
                            <span className="library-asset-flag">Đang bổ sung</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {!listed.length && (
                  <li className="library-rail-empty">
                    {searchHits ? 'Không có học liệu nào khớp từ khóa.' : 'Môn học này chưa có học liệu.'}
                  </li>
                )}
              </ul>

              {!searchHits && subjectEntry && (
                <div className="library-rail-foot">
                  <b>{subjectEntry.note}</b>
                  <span>
                    {readyCount > 0
                      ? `${readyCount} học liệu mở được ngay trong trang.`
                      : 'Chưa có học liệu mở được cho môn này.'}
                  </span>
                </div>
              )}

              <ScrollThumb scroller={railRef} />
            </aside>

            {/* ------------------------------------------------- viewer --- */}
            <div className="library-viewer">
              <div className="library-viewer-bar">
                <div className="library-viewer-title">
                  <b>{active ? active.title : subjectEntry?.label}</b>
                  {active
                    ? active.subtitle && <span>{active.subtitle}</span>
                    : <span>Chưa có học liệu</span>}
                </div>
                {active && (
                  <div className="library-viewer-tags">
                    <span>{KIND_LABEL[active.kind]}</span>
                    <span>{active.topic}</span>
                    <span className={active.status === 'ready' ? 'is-ready' : 'is-planned'}>
                      {active.status === 'ready' ? 'Mở được ngay' : 'Đang bổ sung'}
                    </span>
                  </div>
                )}
              </div>

              <div className="library-viewer-stage">
                {active
                  ? <LibraryViewer key={active.id} item={active} onOpenWorkshop={openFormula} />
                  : (
                    <div className="viewer-empty">
                      <svg className="viewer-empty-art" viewBox="0 0 200 120" aria-hidden="true" fill="none">
                        {/* Empty shelves: three rails, a few slots filled, the rest
                            waiting. Drawn rather than lettered, like the rail marks. */}
                        <g stroke="currentColor" strokeWidth="1.1" opacity="0.5">
                          <path d="M18 34h164M18 66h164M18 98h164" />
                        </g>
                        <g fill="currentColor" opacity="0.16">
                          <rect x="26" y="16" width="20" height="18" rx="3" />
                          <rect x="52" y="22" width="14" height="12" rx="3" />
                          <rect x="26" y="50" width="15" height="16" rx="3" />
                        </g>
                        <g stroke="currentColor" strokeWidth="1.1" strokeDasharray="3 4" opacity="0.42">
                          <rect x="74" y="18" width="22" height="16" rx="3" />
                          <rect x="104" y="18" width="18" height="16" rx="3" />
                          <rect x="49" y="48" width="24" height="18" rx="3" />
                          <rect x="81" y="52" width="16" height="14" rx="3" />
                          <rect x="26" y="82" width="20" height="16" rx="3" />
                          <rect x="54" y="80" width="18" height="18" rx="3" />
                        </g>
                      </svg>
                      <h3>Đang bổ sung</h3>
                      <p>{gap ?? 'Môn học này chưa có học liệu.'}</p>
                      <button
                        type="button"
                        className="viewer-empty-jump"
                        onClick={() => { setSubject(DEFAULT_SUBJECT); setQuery(''); }}
                      >
                        Mở môn có học liệu <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  )}
              </div>

              <button
                type="button"
                className="library-sheet-toggle"
                onClick={() => setSheetOpen((value) => !value)}
                aria-expanded={sheetOpen}
              >
                {sheetOpen ? 'Ẩn thông tin bài học' : 'Xem thông tin bài học'}
              </button>
            </div>

            {/* ------------------------------------- knowledge panel --- */}
            <aside
              className={`library-knowledge${sheetOpen ? ' is-open' : ''}`}
              aria-label="Thông tin học liệu"
            >
              <div className="library-knowledge-scroll" ref={panelRef}>
                {active ? (
                  <>
                    <header className="knowledge-head" style={{ '--rail-tint': tintFor(active.subject) } as React.CSSProperties}>
                      <p className="knowledge-topic"><i aria-hidden="true" />{active.topic}</p>
                      <span className="knowledge-thumb rail-visual">
                        <RailVisual visual={active.rail} />
                      </span>
                      <h3>{active.title}</h3>
                      {/*
                        One line, in the writing's own voice, before any number.
                        The Latin binomial is not repeated here — the viewer bar
                        two panels to the left is already printing it beside the
                        specimen's name — so this slot carries the idea instead,
                        and an entry with no authored line falls back to the
                        binomial rather than to nothing.
                      */}
                      {active.poetic
                        ? <p className="knowledge-poetic">{active.poetic}</p>
                        : active.subtitle && <p className="knowledge-epithet">{active.subtitle}</p>}
                      <p className="knowledge-body">{active.description}</p>
                    </header>

                    {active.facts && (
                      <section>
                        <h4><LibraryIcon name="readout" />Thông số</h4>
                        <dl className="knowledge-facts">
                          {active.facts.map((fact) => (
                            <div key={fact.label}>
                              <span className="knowledge-fact-mark" aria-hidden="true">
                                <LibraryIcon name={fact.icon ?? 'pulse'} />
                              </span>
                              <dt>{fact.label}</dt>
                              <dd>{fact.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </section>
                    )}

                    {active.parts && (
                      <section>
                        <h4><LibraryIcon name="structure" />Cấu tạo</h4>
                        <dl className="knowledge-parts">
                          {active.parts.map((part) => (
                            <div key={part.label}>
                              <dt>{part.label}</dt>
                              <dd>{part.body}</dd>
                            </div>
                          ))}
                        </dl>
                      </section>
                    )}

                    {active.goals && (
                      <section>
                        <h4><LibraryIcon name="goals" />Mục tiêu học tập</h4>
                        <ul className="knowledge-goals">
                          {active.goals.map((goal) => <li key={goal}>{goal}</li>)}
                        </ul>
                      </section>
                    )}

                    {/*
                      The sentences a teacher repeats out loud. Two tones in a
                      fixed order — the scientific point in lavender, the
                      "did you know" in amber — because a column of identically
                      tinted callouts is a column with no callouts in it.
                    */}
                    {active.notes && (
                      <div className="knowledge-notes">
                        {active.notes.map((note, index) => (
                          <div
                            className="knowledge-note"
                            data-tone={index === 0 ? 'science' : 'curio'}
                            key={note.label}
                          >
                            <h4>
                              <LibraryIcon name={index === 0 ? 'science' : 'curio'} />
                              {note.label}
                            </h4>
                            <p>{note.body}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {active.context && (
                      <section>
                        <h4><LibraryIcon name="context" />Liên hệ thực tế</h4>
                        <ul className="knowledge-context">
                          {active.context.map((entry) => <li key={entry}>{entry}</li>)}
                        </ul>
                      </section>
                    )}

                    <div className="knowledge-actions">
                      {active.status === 'ready' && (
                        active.opensWorkshop
                          ? (
                            <button type="button" className="knowledge-primary" onClick={openFormula}>
                              Mở trải nghiệm <span aria-hidden="true">↗</span>
                            </button>
                          )
                          : (
                            <a className="knowledge-primary" href="#cong-cu">
                              Thêm vào bài giảng <span aria-hidden="true">→</span>
                            </a>
                          )
                      )}
                      <div className="knowledge-actions-pair">
                        <a href="#bai-hoc-mau">Xem bài học mẫu</a>
                        {active.credits && (
                          <button type="button" onClick={revealCredits}>Nguồn &amp; giấy phép</button>
                        )}
                      </div>
                    </div>

                    {/* Collapsed by default: the licence text is obligatory, not
                        interesting, and open it used to eat a third of the panel. */}
                    {active.credits && (
                      <details className="knowledge-credits" ref={creditsRef}>
                        <summary><LibraryIcon name="source" />Nguồn &amp; giấy phép</summary>
                        {active.credits.map((credit) => (
                          <div className="knowledge-credit" key={credit.source}>
                            <b>{credit.author}</b>
                            <em>{credit.license}</em>
                            {/^https?:\/\//.test(credit.source)
                              ? (
                                <a href={credit.source} target="_blank" rel="noreferrer">
                                  {credit.source.replace(/^https?:\/\//, '')}
                                </a>
                              )
                              : <span>{credit.source}</span>}
                            {credit.notice && <small>{credit.notice}</small>}
                          </div>
                        ))}
                      </details>
                    )}
                  </>
                ) : (
                  <header className="knowledge-head">
                    <p className="knowledge-topic"><i aria-hidden="true" />{subjectEntry?.label}</p>
                    <h3>Đang bổ sung</h3>
                    <p className="knowledge-body">{gap}</p>
                  </header>
                )}
              </div>

              <ScrollThumb scroller={panelRef} />
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
