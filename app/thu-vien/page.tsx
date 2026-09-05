import type { Metadata } from 'next';
import Link from 'next/link';
import { LIBRARY_ROUTES, ROUTABLE_SUBJECTS, routesForSubject, subjectById } from '../lib/library/slugs';
import { SUBJECT_GAPS } from '../lib/library/manifest';

/**
 * The library index — and the only new link the rest of the site needs.
 *
 * Discovery was the last missing piece. The specimens exist, the hubs list them,
 * the sitemap declares them; but nothing on the homepage pointed *into* any of
 * it, so a crawler arriving at `/` would find thirty-three pages only by reading
 * the sitemap and a reader would find them not at all.
 *
 * Adding a fourth footer column would have meant re-cutting a hardcoded
 * `repeat(3, 1fr)` grid and re-checking seven responsive regimes for a link.
 * This page is the cheaper edge: the footer's existing "Thư viện" entry stops
 * being a fragment and starts being a URL, and every hub and specimen is two
 * clicks from the homepage.
 *
 * The subjects that are still empty are named here with their real reason,
 * exactly as the homepage names them. They are text on a page that is already
 * indexed, not indexed pages of their own — which is the line PRODUCT.md's
 * honest-gap rule draws: say what is missing, do not publish an empty room.
 */

const TITLE = `Thư viện học liệu 3D — ${LIBRARY_ROUTES.length} mô hình mở được ngay | YooLab`;

export const metadata: Metadata = {
  title: TITLE,
  description:
    `${LIBRARY_ROUTES.length} mô hình 3D cho ${ROUTABLE_SUBJECTS.length} môn học, mở thẳng trong trình duyệt `
    + 'không cần cài đặt. Mỗi mô hình kèm mục tiêu bài học, thông số và ghi chú giảng dạy.',
  alternates: { canonical: '/thu-vien' },
};

/*
 * `prefetch={false}` on every `Link` in this route group.
 *
 * vinext's RSC prefetch throws `TypeError: ee is not a function` during setup
 * as soon as any `Link` on a page opts into it — a console error on every
 * render, reproducible from `reference-audit/shots.mjs`. It is also the right
 * setting on merit here: a subject hub lists up to twenty-four specimens, and
 * prefetching two dozen documents to serve one click is waste even when it
 * works. Remove these once the runtime's prefetch is fixed.
 */
export default function LibraryIndexPage() {
  const gaps = Object.entries(SUBJECT_GAPS);

  return (
    <main className="lib-page lib-hub" id="noi-dung">
      <nav className="lib-page__crumbs" aria-label="Đường dẫn">
        <Link prefetch={false} href="/">YooLab</Link>
        <span aria-hidden="true">/</span>
        <b>Thư viện</b>
      </nav>

      <header className="lib-page__head">
        <p className="section-kicker section-kicker--light">Thư viện học liệu</p>
        <h1>Học liệu 3D mở được ngay</h1>
        <p className="lib-page__lede">
          {LIBRARY_ROUTES.length} mô hình cho {ROUTABLE_SUBJECTS.length} môn học, mở thẳng
          trong trình duyệt — không cài đặt, không tài khoản. Mỗi mô hình kèm mục
          tiêu bài học, thông số và ghi chú giảng dạy.
        </p>
        <Link prefetch={false} className="lib-page__open" href="/#thu-vien">
          Mở thư viện tương tác <span aria-hidden="true">↗</span>
        </Link>
      </header>

      <ul className="lib-hub__list">
        {ROUTABLE_SUBJECTS.map((subject) => (
          <li key={subject.id}>
            <Link prefetch={false} href={`/thu-vien/${subject.id}`}>
              <h2>{subject.label}</h2>
              <p>{subject.note}</p>
              <span className="lib-hub__topic">
                {routesForSubject(subject.id).length} học liệu
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {gaps.length ? (
        <section className="lib-page__body" aria-labelledby="gaps-title">
          <div>
            <h2 id="gaps-title">Đang bổ sung</h2>
            {gaps.map(([id, reason]) => (
              <div className="lib-page__note" key={id}>
                {/* The label comes from the manifest, not from a branch on the
                    id: a third gap would otherwise silently inherit the second
                    one's name. */}
                <b>{subjectById(id)?.label ?? id}</b>
                <p>{reason}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
