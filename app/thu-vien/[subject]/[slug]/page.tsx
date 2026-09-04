import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { LIBRARY_ROUTES, findRoute, subjectById } from '../../../lib/library/slugs';
import { LibraryExperienceJsonLd } from './structured-data';

/**
 * One learning resource, at its own address.
 *
 * Every specimen in the library already carries a title, a scientific subtitle,
 * an opening line, a description, its named parts, its learning goals, six
 * measured facts, teaching notes and — for most of biology — the exact place it
 * sits in the Vietnamese curriculum. All of that was reachable only as
 * `#thu-vien`, a fragment on the homepage, which is not a URL: a teacher
 * searching "mô hình 3D thận sinh học 8" could not arrive at the kidney even
 * though the kidney is here, works, and is mapped to that lesson.
 *
 * This route is the whole content-marketing change, and it writes no new copy.
 * The manifest was always the article; it just had nowhere to be published.
 *
 * Text first, and the model after it. The page is server-rendered prose that a
 * crawler and a teacher on a slow connection both get immediately; the
 * interactive stage is a link into the workspace rather than a second WebGL
 * context booted on every landing. That is deliberate after this project's own
 * Lighthouse run: main-thread time, not payload, is what the audit found
 * blocking this site, and a library page whose job is to be *found* should not
 * repeat the mistake the homepage is still paying for.
 */

export function generateStaticParams() {
  return LIBRARY_ROUTES.map((route) => ({ subject: route.subject, slug: route.slug }));
}

type Params = { params: Promise<{ subject: string; slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { subject, slug } = await params;
  const route = findRoute(subject, slug);
  if (!route) return {};

  const { experience } = route;
  const subjectLabel = subjectById(subject)?.label ?? '';
  /* The title carries the subject because that is how the query is typed —
     "ong mật sinh học", not "ong mật" alone. */
  const title = `${experience.title} — mô hình 3D ${subjectLabel} | YooLab`;

  return {
    title,
    description: experience.description,
    alternates: { canonical: `/thu-vien/${subject}/${slug}` },
    openGraph: {
      title,
      description: experience.description,
      type: 'article',
      locale: 'vi_VN',
    },
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
export default async function LibraryExperiencePage({ params }: Params) {
  const { subject, slug } = await params;
  const route = findRoute(subject, slug);
  if (!route) notFound();

  const { experience } = route;
  const subjectEntry = subjectById(subject);

  return (
    <main className="lib-page" id="noi-dung">
      <LibraryExperienceJsonLd route={route} />

      <nav className="lib-page__crumbs" aria-label="Đường dẫn">
        <Link prefetch={false} href="/">YooLab</Link>
        <span aria-hidden="true">/</span>
        <Link prefetch={false} href={`/thu-vien/${subject}`}>{subjectEntry?.label}</Link>
        <span aria-hidden="true">/</span>
        <b>{experience.title}</b>
      </nav>

      <header className="lib-page__head">
        <p className="section-kicker section-kicker--light">{experience.topic}</p>
        <h1>{experience.title}</h1>
        {experience.subtitle ? <p className="lib-page__latin">{experience.subtitle}</p> : null}
        {experience.poetic ? <p className="lib-page__poetic">{experience.poetic}</p> : null}
        <p className="lib-page__lede">{experience.description}</p>

        {/*
          The interactive model lives in the workspace, and this is the link to
          it. The fragment is the same slug this page is addressed by, and
          `LibraryWorkspace` resolves it through `openLibraryExperience` — so
          arriving here from search and pressing this lands on *this* specimen
          with its stage open, not on whatever the rail was showing.
        */}
        <Link prefetch={false} className="lib-page__open" href={`/#thu-vien/${slug}`}>
          Mở mô hình tương tác <span aria-hidden="true">↗</span>
        </Link>
      </header>

      <div className="lib-page__body">
        {experience.goals?.length ? (
          <section aria-labelledby="goals-title">
            <h2 id="goals-title">Sau bài này học sinh làm được gì</h2>
            <ul className="lib-page__goals">
              {experience.goals.map((goal) => <li key={goal}>{goal}</li>)}
            </ul>
          </section>
        ) : null}

        {experience.parts?.length ? (
          <section aria-labelledby="parts-title">
            <h2 id="parts-title">Các bộ phận trên mô hình</h2>
            <dl className="lib-page__parts">
              {experience.parts.map((part) => (
                <div key={part.label}>
                  <dt>{part.label}</dt>
                  <dd>{part.body}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {experience.facts?.length ? (
          <section aria-labelledby="facts-title">
            <h2 id="facts-title">Thông số</h2>
            <dl className="lib-page__facts">
              {experience.facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {experience.notes?.length ? (
          <section aria-labelledby="notes-title">
            <h2 id="notes-title">Ghi chú giảng dạy</h2>
            {experience.notes.map((note) => (
              <div className="lib-page__note" key={note.label}>
                <b>{note.label}</b>
                <p>{note.body}</p>
              </div>
            ))}
          </section>
        ) : null}

        {experience.context?.length ? (
          <section aria-labelledby="context-title">
            <h2 id="context-title">Dùng ở đâu trong chương trình</h2>
            <ul className="lib-page__context">
              {experience.context.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </section>
        ) : null}
      </div>

      <footer className="lib-page__foot">
        <Link prefetch={false} href={`/thu-vien/${subject}`}>
          ← Toàn bộ học liệu {subjectEntry?.label}
        </Link>
      </footer>
    </main>
  );
}
