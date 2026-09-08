/**
 * One rule about who owns the wheel over a 3D surface.
 *
 * ## The bug this replaces
 *
 * Every stage on this page used to claim the wheel outright:
 *
 * ```ts
 * if (Math.abs(event.deltaY) < 2) return;
 * event.preventDefault();
 * ```
 *
 * The `< 2` guard was written as "only a clear zoom gesture, so the page still
 * scrolls past the viewer", and it does not do that. A real wheel notch is 100
 * px of delta and even a trackpad's gentlest glide clears 2 in its first frame,
 * so in practice the branch never returned: **the page could not be scrolled
 * while the pointer was anywhere over a 3D panel.** On a page that is mostly 3D
 * panels — the bridge viewer is 60% of its section, the Library workspace and
 * the editor are most of theirs — the visitor's scroll simply stopped, with no
 * indication of why. That is what came back from review as "scroll vướng vào
 * phần zoom".
 *
 * It is also the harder half of the same problem the chapter snap solves: a
 * page whose scroll is the animation clock cannot afford a region that eats the
 * gesture. See `lib/story/snap.ts`.
 *
 * ## The rule
 *
 * **The page's scroll always wins, unless there is no page scroll to win.**
 *
 *   - A plain wheel is never claimed. It scrolls the document, every time,
 *     wherever the pointer is.
 *   - `ctrl`/`⌘` + wheel zooms. This is the same gesture maps and design tools
 *     use, and — the reason it is the right choice rather than merely a
 *     conventional one — **a trackpad pinch arrives as exactly this event.**
 *     Chrome, Safari and Edge all deliver a two-finger pinch as `wheel` with
 *     `ctrlKey: true`, so pinch-to-zoom over a specimen works without a line of
 *     code that mentions pinching, on every stage, on Windows and on macOS.
 *   - When the document cannot scroll, a plain wheel zooms after all. That is
 *     the locked case: `PracticeModal`, `FormulaGate` and `ModalShell` all set
 *     `body { overflow: hidden }` while they are open, and a short standalone
 *     route may simply have no overflow. Where there is nothing to steal there
 *     is nothing to be surprised by.
 *
 * The last one is read from the document per event rather than passed in as a
 * flag, and that is the design rather than an economy: the Library's stages are
 * mounted in-page by `LibraryWorkspace`, full-screen behind `FormulaGate`, and
 * again on the `/thu-vien/…` routes, where the page can be short enough not to
 * scroll at all. A flag would have to be threaded correctly through every one of
 * those, and a stage that gains a fourth parent later would inherit whatever the
 * new one forgot to pass. The document's own scroll state cannot be forgotten,
 * and it is the thing the rule is actually about.
 *
 * Verified in a real browser: over the bridge viewer, the Library viewer and the
 * YooStudio editor canvas a plain wheel is left to the page and `ctrl` is
 * claimed; with the body locked, both are claimed. That last check was run
 * against the drone lab's overlay, which no longer exists — the three practice
 * experiences are embedded deployments now (`lib/practice/manifest.ts`) and an
 * iframe's wheel belongs to the iframe.
 *
 * Losing plain-wheel zoom loses an affordance on the in-page stages, so it is
 * replaced rather than dropped. `ModelStage`, `CreatureStage` and
 * `MoleculeViewer` already carry explicit `Gần` / `Xa` buttons in their rails
 * (`StageRail` in `library/StageChrome.tsx`), and every hint card that used to
 * read "Cuộn để phóng" now names the modifier instead —
 * `zoomModifierLabel()` below, through `lib/useZoomModifier.ts`, is what keeps
 * that copy honest on a Mac. Two surfaces have no button and are left with the
 * hint alone: the bridge, whose own toolbar replaces the stage rail, and
 * `CellStudio`. The labs need neither, because their overlay never took the
 * page's scroll in the first place.
 */

/**
 * Whether the document itself can still absorb a wheel gesture.
 *
 * Two questions, and both have to be asked every time. `overflow: hidden` on
 * the body is how all four of this project's overlays lock the page, and it is
 * set imperatively while they are open — so it is a fact about *now*, not about
 * mount time. And a short page has nothing to scroll even with overflow left
 * alone, which is the ordinary case on a phone-sized standalone route.
 */
function pageCanScroll() {
  const doc = document.documentElement;
  const bodyStyle = getComputedStyle(document.body);
  if (bodyStyle.overflowY === 'hidden' || bodyStyle.overflow === 'hidden') return false;
  const docStyle = getComputedStyle(doc);
  if (docStyle.overflowY === 'hidden' || docStyle.overflow === 'hidden') return false;
  return doc.scrollHeight - doc.clientHeight > 1;
}

/**
 * Attaches the policy to a stage host and returns its teardown.
 *
 * `onZoom` receives the raw `deltaY` of a gesture that has been decided to be a
 * zoom; the caller keeps its own clamps and its own feel, because a drone at
 * 1.2-26 units and a molecule at 0.42-2.6× do not share a curve.
 */
export function attachWheelZoom(
  host: HTMLElement,
  onZoom: (deltaY: number) => void,
): () => void {
  const onWheel = (event: WheelEvent) => {
    /* A gesture too small to move anything is not a gesture. Kept from the
       original for the trackpad's trailing frames, which arrive at well under a
       pixel and would otherwise nudge the camera after the hand has stopped. */
    if (Math.abs(event.deltaY) < 2) return;
    const pinching = event.ctrlKey || event.metaKey;
    if (!pinching && pageCanScroll()) return;
    /* Claimed, so the browser does not ALSO act on it: a plain wheel here means
       the page has nothing to scroll, and `ctrl` + wheel is the browser's own
       page-zoom shortcut, which must not fire over a canvas the visitor is
       zooming. */
    event.preventDefault();
    onZoom(event.deltaY);
  };

  host.addEventListener('wheel', onWheel, { passive: false });
  return () => host.removeEventListener('wheel', onWheel);
}

/**
 * What to call the modifier in on-screen copy.
 *
 * Apple keyboards have no key labelled Ctrl in the position a Windows user
 * means, so a hint that says "Ctrl" is wrong on half the tablets a school owns.
 * Both modifiers are accepted by `attachWheelZoom`; this only decides which one
 * the hint names.
 *
 * Pure and cheap, with no module-scope `navigator` read: these stages are
 * server rendered before they hydrate, and a module that touches `navigator`
 * while being imported would fail there rather than at the call. Components do
 * not call this directly — `useZoomModifier` in `lib/useZoomModifier.ts` is what
 * they use, and it is where the server-versus-client render is reconciled.
 */
export function zoomModifierLabel() {
  if (typeof navigator === 'undefined') return 'Ctrl';
  const platform = navigator.userAgent;
  return /Mac|iPhone|iPad|iPod/.test(platform) ? '⌘' : 'Ctrl';
}
