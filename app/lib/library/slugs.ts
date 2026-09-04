import { EXPERIENCES, SUBJECTS } from './manifest';
import type { ExperienceManifest, SubjectId } from './types';

/**
 * URLs for the library, derived from the titles rather than from the ids.
 *
 * The manifest's `id` is an internal key and reads like one — `trex`, `bee`,
 * `molecule-co2`, `gram-positive-wall`. Those are the right thing for the
 * deep-link protocol and for `experienceById`, and the wrong thing for an
 * address a Vietnamese teacher types or reads: the query that should find the
 * bee is "ong mật", not "bee".
 *
 * So the id stays the key and the slug is generated from `title`. Nothing has to
 * be written by hand and nothing can drift out of sync with the content, which
 * is the same reason the FAQ counts its subjects instead of stating a number.
 *
 * The transliteration is NFD plus a manual `đ`, which Unicode does not decompose
 * into `d` + a combining mark the way it does every vowel — a detail that is easy
 * to miss and produces `-` where a letter should be, so `Động vật` would collapse
 * to `ong-vat` without it.
 */
export function slugify(value: string): string {
  return value
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    /* Strip the combining marks NFD just separated out. A named property
       escape rather than a hand-written codepoint range: the range spelled
       with literal characters is invisible in an editor and does not survive
       a careless copy — this file lost it twice while being written. */
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export type LibraryRoute = {
  subject: SubjectId;
  slug: string;
  experience: ExperienceManifest;
};

/**
 * Every routable experience.
 *
 * `ready` only. A stop that is still being sourced has no page, because a URL
 * that resolves to "đang bổ sung" is a promise the library has not made — the
 * honest-gap rule in PRODUCT.md is about not advertising what does not exist,
 * and an indexed empty page advertises it to everyone searching.
 */
export const LIBRARY_ROUTES: LibraryRoute[] = EXPERIENCES
  .filter((experience) => experience.status === 'ready')
  .map((experience) => ({
    subject: experience.subject,
    slug: slugify(experience.title),
    experience,
  }));

/*
 * A collision would silently drop one specimen's page, so it fails the build
 * instead. Scoped per subject because that is the uniqueness the URL needs:
 * two subjects may legitimately both hold a "Nước".
 */
const seen = new Map<string, string>();
for (const route of LIBRARY_ROUTES) {
  const key = `${route.subject}/${route.slug}`;
  const previous = seen.get(key);
  if (previous) {
    throw new Error(
      `library slug collision at /thu-vien/${key}: "${previous}" and "${route.experience.title}". `
        + 'Titles inside one subject must differ, or this route needs an explicit slug field.',
    );
  }
  seen.set(key, route.experience.title);
}

export function routesForSubject(subject: SubjectId): LibraryRoute[] {
  return LIBRARY_ROUTES.filter((route) => route.subject === subject);
}

export function findRoute(subject: string, slug: string): LibraryRoute | null {
  return LIBRARY_ROUTES.find((route) => route.subject === subject && route.slug === slug) ?? null;
}

export function subjectById(subject: string) {
  return SUBJECTS.find((entry) => entry.id === subject) ?? null;
}

/** Subjects with at least one routable experience — the ones that get a hub. */
export const ROUTABLE_SUBJECTS = SUBJECTS.filter(
  (subject) => routesForSubject(subject.id).length > 0,
);
