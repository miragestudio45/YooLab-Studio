'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LibraryViewer } from './LibraryViewer';
import { useFormulaGate } from '../FormulaGate';
import {
  DEFAULT_SUBJECT,
  EXPERIENCES,
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
 * Three deliberate consequences of that:
 *
 *   - the centre gets the space. On a 1920 screen the viewer is roughly a
 *     thousand pixels wide, because the specimen is the product and the panels
 *     are the chrome, not the other way round.
 *   - switching subject or specimen never reloads. It is state, so the whole
 *     thing transitions instead of blinking.
 *   - a subject with nothing in it says so in the middle of the workspace, at
 *     full size, in plain words. That is a stronger signal of good faith than a
 *     hidden tab would be, and it is what stops the six real experiences from
 *     being read as a sample of thirty.
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

  const gap = SUBJECT_GAPS[subject];
  const readyCount = readyCountForSubject(subject);

  return (
    <section className="library" id="thu-vien" aria-labelledby="library-title">
      <div className="shell-editorial library-intro">
        <div className="section-heading section-heading--split" data-reveal>
          <div>
            <p className="section-kicker">Thư viện YooLab</p>
            <h2 id="library-title">Học liệu 3D<br /><em>lấy ở đâu?</em></h2>
          </div>
          <p>
            Ở đây. Chọn môn học, mở mô hình hoặc trải nghiệm ngay trong trang, rồi
            đưa thẳng vào không gian biên soạn.
          </p>
        </div>
      </div>

      <div className="shell-wide library-app" data-reveal>
        {/* ------------------------------------------------ subject switcher --- */}
        <div className="library-subjects" role="tablist" aria-label="Môn học">
          <div className="library-subjects-rail">
            {SUBJECTS.map((entry) => {
              const count = readyCountForSubject(entry.id);
              return (
                <button
                  type="button"
                  role="tab"
                  key={entry.id}
                  aria-selected={subject === entry.id}
                  className={`library-subject${subject === entry.id ? ' is-active' : ''}${count === 0 ? ' is-empty' : ''}`}
                  style={{ '--subject-tint': entry.tint } as React.CSSProperties}
                  onClick={() => { setSubject(entry.id); setQuery(''); }}
                >
                  <b>{entry.label}</b>
                  <small>{entry.note}</small>
                  <i>{count === 0 ? 'Đang bổ sung' : `${count} học liệu`}</i>
                </button>
              );
            })}
          </div>
          <label className="library-search">
            <span aria-hidden="true">⌕</span>
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

        <div className="library-body">
          {/* ------------------------------------------------- asset rail --- */}
          <aside className="library-rail" aria-label="Học liệu của môn">
            <div className="library-rail-head">
              <span>{searchHits ? 'Kết quả tìm' : 'Học liệu'}</span>
              <b>{listed.length}</b>
            </div>
            <ul className="library-rail-list">
              {listed.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`library-asset${active?.id === item.id ? ' is-active' : ''}`}
                    aria-current={active?.id === item.id}
                    onClick={() => { setActiveId(item.id); setSheetOpen(false); }}
                  >
                    <span className="library-asset-kind">{KIND_LABEL[item.kind]}</span>
                    <b>{item.title}</b>
                    <small>{item.summary}</small>
                    {item.status === 'planned' && <em>Đang bổ sung</em>}
                  </button>
                </li>
              ))}
              {!listed.length && (
                <li className="library-rail-empty">
                  {searchHits ? 'Không có học liệu nào khớp từ khóa.' : 'Môn học này chưa có học liệu.'}
                </li>
              )}
            </ul>
            {!searchHits && (
              <p className="library-rail-foot">
                {readyCount > 0
                  ? `${readyCount} học liệu mở được ngay trong trang.`
                  : 'Chưa có học liệu mở được cho môn này.'}
              </p>
            )}
          </aside>

          {/* ----------------------------------------------------- viewer --- */}
          <div className="library-viewer">
            {active ? (
              <>
                <div className="library-viewer-bar">
                  <div className="library-viewer-title">
                    <b>{active.title}</b>
                    {active.subtitle && <span>{active.subtitle}</span>}
                  </div>
                  <div className="library-viewer-tags">
                    <span>{KIND_LABEL[active.kind]}</span>
                    <span>{active.topic}</span>
                    <span className={active.status === 'ready' ? 'is-ready' : 'is-planned'}>
                      {active.status === 'ready' ? 'Mở được ngay' : 'Đang bổ sung'}
                    </span>
                  </div>
                </div>
                <div className="library-viewer-stage">
                  <LibraryViewer
                    key={active.id}
                    item={active}
                    onOpenWorkshop={openFormula}
                  />
                </div>
              </>
            ) : (
              <div className="library-viewer-stage">
                <div className="viewer-empty">
                  <p>{gap ?? 'Môn học này chưa có học liệu.'}</p>
                </div>
              </div>
            )}
            <button
              type="button"
              className="library-sheet-toggle"
              onClick={() => setSheetOpen((value) => !value)}
              aria-expanded={sheetOpen}
            >
              {sheetOpen ? 'Ẩn thông tin bài học' : 'Xem thông tin bài học'}
            </button>
          </div>

          {/* -------------------------------------------- knowledge panel --- */}
          <aside className={`library-knowledge${sheetOpen ? ' is-open' : ''}`} aria-label="Thông tin học liệu">
            {active ? (
              <>
                <header>
                  <span>{active.topic}</span>
                  <h3>{active.title}</h3>
                  <p>{active.description}</p>
                </header>

                {active.parts && (
                  <section>
                    <h4>Cấu tạo</h4>
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
                    <h4>Mục tiêu học tập</h4>
                    <ul className="knowledge-goals">
                      {active.goals.map((goal) => <li key={goal}>{goal}</li>)}
                    </ul>
                  </section>
                )}

                {active.facts && (
                  <section>
                    <h4>Thông số</h4>
                    <dl className="knowledge-facts">
                      {active.facts.map((fact) => (
                        <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
                      ))}
                    </dl>
                  </section>
                )}

                <div className="knowledge-actions">
                  {active.status === 'ready' && (
                    active.opensWorkshop
                      ? (
                        <button type="button" className="is-primary" onClick={openFormula}>
                          Mở trải nghiệm <span aria-hidden="true">↗</span>
                        </button>
                      )
                      : (
                        <a className="is-primary" href="#cong-cu">
                          Thêm vào bài giảng <span aria-hidden="true">→</span>
                        </a>
                      )
                  )}
                  <a href="#bai-hoc-mau">Xem bài học mẫu</a>
                </div>

                {active.credits && (
                  <footer className="knowledge-credits">
                    <h4>Nguồn &amp; giấy phép</h4>
                    {active.credits.map((credit) => (
                      <p key={credit.source}>
                        <b>{credit.author}</b>
                        <span>{credit.license}</span>
                        {credit.notice && <small>{credit.notice}</small>}
                      </p>
                    ))}
                  </footer>
                )}
              </>
            ) : (
              <header>
                <span>{SUBJECTS.find((entry) => entry.id === subject)?.label}</span>
                <h3>Đang bổ sung</h3>
                <p>{gap}</p>
              </header>
            )}
          </aside>
        </div>

        {/* ------------------------------------------- secondary strip --- */}
        <div className="library-foot">
          <p>
            {searchHits
              ? `${searchHits.length} kết quả trong toàn thư viện.`
              : gap
                ? 'Môn học này được liệt kê để cấu trúc thư viện đầy đủ — nội dung sẽ mở khi có nguồn hợp lệ.'
                : 'Mỗi học liệu ở đây đều mở và tương tác được ngay trong trang. Không có mục nào là ảnh minh hoạ.'}
          </p>
          <div className="library-foot-links">
            <a href="#cong-cu">Mở YooStudio <span aria-hidden="true">→</span></a>
            <a href="#thuc-hanh">Thực hành &amp; STEM <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </div>
    </section>
  );
}
