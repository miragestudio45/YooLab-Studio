import Cookies from 'js-cookie';
import { ACCESS_TOKEN_KEY } from './config';

export function isLoggedIn(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(Cookies.get(ACCESS_TOKEN_KEY));
}

// A tab opened after an `await`-ed call is no longer inside the click's
// user-gesture window, so browsers commonly block it. Callers that need to
// open a tab once some async work resolves (fetching the account, resolving
// which project to open) call `openBlankTab()` synchronously at the click,
// then `redirectPendingTab(url)` once the real destination is known — the
// tab already exists, only its location changes, which browsers allow.
let pendingTab: Window | null = null;

export function openBlankTab(): void {
  pendingTab = window.open('about:blank', '_blank');
}

// Returns whether a pending tab was actually redirected.
export function redirectPendingTab(url: string): boolean {
  const tab = pendingTab;
  pendingTab = null;
  if (tab && !tab.closed) {
    tab.location.href = url;
    tab.focus();
    return true;
  }
  return false;
}

// Closes the pending blank tab when the async work it was waiting on fails,
// so it doesn't linger as a stray empty tab.
export function discardPendingTab(): void {
  const tab = pendingTab;
  pendingTab = null;
  tab?.close();
}
