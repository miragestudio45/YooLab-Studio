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

/** Opens an experience by manifest id. Unknown ids are ignored, not guessed. */
export function openLibraryExperience(id: string) {
  const item = EXPERIENCES.find((entry) => entry.id === id);
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
