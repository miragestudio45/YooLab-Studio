import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ROUTABLE_SUBJECTS, routesForSubject, subjectById } from '../../lib/library/slugs';

/**
 * A subject's index.
 *
 * Two jobs. It is the page for the broader query — a teacher searching "học liệu
 * 3D sinh học" rather than a specimen by name — and it is the internal link hub
 * that gives every specimen page a parent, so the library reads as a structure
 * rather than as thirty orphans.
 *
 * Only subjects with a `ready` specimen get one. `Khoa học vũ trụ` and `Lịch sử
 * & Văn hóa` have honest gaps on the homepage and no page here: an indexed hub
 * listing nothing is the advertised emptiness PRODUCT.md's honest-gap rule
 * exists to avoid.
 */

export function generateStaticParams() {
  return ROUTABLE_SUBJECTS.map((subject) => ({ subject: subject.id }));
}

type Params = { params: Promise<{ subject: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { subject } = await params;
  const entry = subjectById(subject);
  if (!entry) return {};
  const count = routesForSubject(entry.id).length;

  return {
    title: `Học liệu 3D ${entry.label} — ${count} mô hình mở được ngay | YooLab`,
    description:
      `${count} mô hình 3D ${entry.label.toLowerCase()} mở thẳng trong trình duyệt: ${entry.note}. `
      + 'Mỗi mô hình có mục tiêu bài học, thông số và ghi chú giảng dạy.',
    alternates: { canonical: `/thu-vien/${subject}` },
  };
}

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
export default async function SubjectHubPage({ params }: Params) {
  const { subject } = await params;
  const entry = subjectById(subject);
  if (!entry) notFound();

  const routes = routesForSubject(entry.id);
  if (routes.length === 0) notFound();

  return (
    <main className="lib-page lib-hub" id="noi-dung">
      <nav className="lib-page__crumbs" aria-label="Đường dẫn">
        <Link prefetch={false} href="/">YooLab</Link>
        <span aria-hidden="true">/</span>
        <b>{entry.label}</b>
      </nav>

      <header className="lib-page__head">
        <p className="section-kicker section-kicker--light">Thư viện học liệu</p>
        <h1>Học liệu 3D {entry.label}</h1>
        <p className="lib-page__lede">
          {routes.length} mô hình mở được ngay trong trình duyệt — {entry.note}. Mỗi
          mô hình kèm mục tiêu bài học, thông số và ghi chú giảng dạy.
        </p>
        <Link prefetch={false} className="lib-page__open" href="/#thu-vien">
          Mở thư viện tương tác <span aria-hidden="true">↗</span>
        </Link>
      </header>

      <ul className="lib-hub__list">
        {routes.map(({ slug, experience }) => (
          <li key={slug}>
            <Link prefetch={false} href={`/thu-vien/${entry.id}/${slug}`}>
              <h2>{experience.title}</h2>
              {experience.subtitle ? <i>{experience.subtitle}</i> : null}
              <p>{experience.summary}</p>
              <span className="lib-hub__topic">{experience.topic}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
