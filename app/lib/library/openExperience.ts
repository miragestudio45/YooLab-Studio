import { EXPERIENCES } from './manifest';
import type { SubjectId } from './types';

/**
 * "Open this specific thing in the Library."
 *
 * The proof cards claim that every one of them opens something real. An anchor
 * to `#thu-vien` does not honour that claim: it scrolls the Library into view
 * with whatever was already selected, so a card promising the periodic table
 * delivers the bee. This is the one-line channel that makes the claim true —
 * the workspace subscribes, sets subject and specimen, and the page scrolls.
 *
 * A plain module-level listener set rather than a context: the publishers are
 * scattered across four sections that have no reason to be inside a provider,
 * and there is exactly one subscriber for the whole page.
 */

export type OpenRequest = { subject: SubjectId; id: string };

type Listener = (request: OpenRequest) => void;

const listeners = new Set<Listener>();

/**
 * Latches the most recent request so a publisher that fires before the
 * workspace has mounted is not simply lost.
 */
let pending: OpenRequest | null = null;

export function subscribeToLibraryOpen(listener: Listener) {
  listeners.add(listener);
  if (pending) {
    const request = pending;
    pending = null;
    listener(request);
  }
  return () => { listeners.delete(listener); };
}

/**
 * Resolves a reference from a URL to a manifest entry.
 *
 * Two spellings arrive here and both have to work. `bee` is the manifest id and
 * what the in-page publishers pass. `ong-mat` is the slug the library's own
 * pages are addressed by (`/thu-vien/sinh-hoc/ong-mat`), and it is what anyone
 * shortening that URL by hand would reach for. Accepting only one of them means
 * a link that looks obviously correct silently does nothing.
 */
export function resolveExperienceRef(ref: string) {
  const wanted = ref.trim().toLowerCase();
  if (!wanted) return null;
  return (
    EXPERIENCES.find((entry) => entry.id.toLowerCase() === wanted)
    ?? EXPERIENCES.find((entry) => slugifyTitle(entry.title) === wanted)
    ?? null
  );
}

/* Kept here rather than imported from `slugs.ts` so this module stays free of
   that file's build-time collision guard, which has no business running as part
   of a click handler. The two must agree; they are four lines apart in intent
   and both derive from `title`. */
function slugifyTitle(title: string): string {
  return title
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/** Opens an experience by manifest id or by title slug. Unknown refs are ignored, not guessed. */
export function openLibraryExperience(id: string) {
  const item = resolveExperienceRef(id);
  if (!item) {
    console.warn(`openLibraryExperience: no manifest entry "${id}"`);
    return;
  }
  const request: OpenRequest = { subject: item.subject, id: item.id };
  if (!listeners.size) pending = request;
  for (const listener of listeners) listener(request);

  document.getElementById('thu-vien')?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  });
}
