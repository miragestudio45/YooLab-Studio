// A minimal pub-sub, not a Context: `ToastHost` mounts once in the root
// layout and survives client-side navigation (the layout never unmounts),
// so a toast fired right before `router.push()` still shows on the page it
// lands on — no need to round-trip the message through sessionStorage.

export type ToastKind = 'success' | 'error';
export type ToastMessage = { id: number; kind: ToastKind; text: string };

type Listener = (toast: ToastMessage) => void;

const listeners = new Set<Listener>();
let nextId = 1;

export function showToast(text: string, kind: ToastKind = 'success'): void {
  const toast: ToastMessage = { id: nextId++, kind, text };
  listeners.forEach((listener) => listener(toast));
}

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
