import type { LibraryRoute } from '../../../lib/library/slugs';
import { subjectById } from '../../../lib/library/slugs';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://yoolab.vn';

/**
 * `LearningResource` for one specimen.
 *
 * The mapping is unusually direct, which is the point: schema.org's vocabulary
 * for educational material asks for exactly the fields this manifest already
 * carries. `teaches` is `goals` — the outcomes, stated as outcomes.
 * `educationalLevel` is `context`, which for most of biology is already written
 * as "Sinh học 8 — Bài tiết và cấu tạo của thận". `about` is the topic. Nothing
 * here is composed for the crawler; it is the same sentences the page shows.
 *
 * `isAccessibleForFree` is stated as true because it is: every `ready` specimen
 * in this library opens in the browser with no account. That is a fact about the
 * library, not a claim about pricing for the authoring tool — which is why there
 * is still no `offers` anywhere in this codebase.
 */
export function LibraryExperienceJsonLd({ route }: { route: LibraryRoute }) {
  const { experience, subject, slug } = route;
  const url = `${SITE}/thu-vien/${subject}/${slug}`;
  const subjectLabel = subjectById(subject)?.label;

  const payload = {
    '@context': 'https://schema.org',
    '@type': 'LearningResource',
    '@id': url,
    url,
    name: experience.title,
    alternateName: experience.subtitle,
    description: experience.description,
    inLanguage: 'vi-VN',
    learningResourceType: 'Mô hình 3D tương tác',
    interactivityType: 'active',
    isAccessibleForFree: true,
    about: [subjectLabel, experience.topic].filter(Boolean),
    teaches: experience.goals,
    educationalLevel: experience.context,
    keywords: experience.keywords,
    provider: { '@type': 'Organization', name: 'YooLab', url: SITE },
    isPartOf: { '@type': 'Collection', name: `Thư viện học liệu ${subjectLabel}`, url: `${SITE}/thu-vien/${subject}` },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        /* Undefined optional fields drop out of the JSON rather than becoming
           `null`, which schema validators read as an empty assertion. */
        __html: JSON.stringify(payload),
      }}
    />
  );
}
