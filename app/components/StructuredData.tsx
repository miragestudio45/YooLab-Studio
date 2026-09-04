/**
 * Structured data for the homepage.
 *
 * A server component with no `'use client'`, so this is markup in the document
 * and costs the browser nothing to hydrate.
 *
 * What is deliberately absent matters more than what is here. `aggregateRating`
 * and `review` are the two properties every SEO guide reaches for first, and
 * both are exactly the "invented proof" PRODUCT.md forbids — YooLab publishes no
 * testimonials, no school logos and no user counts, so it has no ratings to
 * declare. Google also treats fabricated review markup as a manual-action
 * offence, so the product rule and the search rule agree here. `offers` is
 * absent for the same reason in a weaker form: pricing is not published on this
 * site yet, and a `price` field invented to fill the schema would be a claim.
 *
 * Everything below is checkable against the page it describes.
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://yoolab.vn';

const GRAPH = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE}/#organization`,
      name: 'YooLab',
      url: SITE,
      email: 'hello@yoolab.vn',
      logo: `${SITE}/brand/yoolab-icon.svg`,
      description:
        'YooLab xây dựng không gian học tập 3D/XR cho giáo dục phổ thông Việt Nam.',
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      url: SITE,
      name: 'YooLab',
      inLanguage: 'vi-VN',
      publisher: { '@id': `${SITE}/#organization` },
    },
    {
      /*
       * `SoftwareApplication`, not `Product`: the thing being described is the
       * authoring tool, and the category is what tells search engines this is
       * classroom software rather than a consumer app.
       */
      '@type': 'SoftwareApplication',
      '@id': `${SITE}/#app`,
      name: 'YooLab',
      applicationCategory: 'EducationalApplication',
      applicationSubCategory: 'Công cụ soạn bài giảng 3D/XR',
      /* It is a WebGL page. There is nothing to install and no native build. */
      operatingSystem: 'Web browser',
      browserRequirements: 'Trình duyệt hỗ trợ WebGL 2',
      inLanguage: 'vi-VN',
      url: SITE,
      publisher: { '@id': `${SITE}/#organization` },
      description:
        'Công cụ soạn bài giảng 3D/XR cho giáo viên: chọn mô hình từ thư viện học liệu đa môn, thêm chú thích, âm thanh và câu hỏi tương tác, rồi chia sẻ bằng một liên kết — không cần lập trình.',
    },
  ],
};

export function StructuredData() {
  return (
    <script
      type="application/ld+json"
      // The payload is a literal in this module, not user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(GRAPH) }}
    />
  );
}
