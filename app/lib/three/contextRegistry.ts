/**
 * How many WebGL contexts this page is allowed to hold, and which ones.
 *
 * ## The problem this exists for
 *
 * Pausing a render loop stops the *work*; it does not release the *context*. A
 * full page here held five at once — the Explore canvas, its bee foreground
 * pass, the YooStudio editor, the Library stage and the bridge stage — plus the
 * thumbnail baker while its queue drained. On a desktop that is only wasted
 * memory. On iOS Safari the per-page context limit is low and exceeding it makes
 * the browser **drop the oldest context**, which is the difference between a
 * page that stutters and a page that flickers: a canvas whose context has been
 * taken away composites as nothing until something notices and rebuilds it.
 *
 * So visibility gating and context management are two different layers and both
 * are needed. The gate answers "should this draw a frame?" and lives in
 * `visibility.ts`. This answers "should this be holding a GPU context at all?"
 *
 * ## Why there is no flash
 *
 * The guarantee does not come from painting a snapshot over the canvas — it
 * comes from the hysteresis band being wide enough that **no state change is
 * ever on screen**. A surface is admitted while it is still more than a
 * viewport away and is only released once it is more than two viewports away,
 * so both transitions happen out of sight. What a released surface leaves
 * behind is its own section's resting background, never a hole: the DOM around
 * it is untouched and the canvas element itself goes away rather than being left
 * as a context-lost rectangle.
 *
 * ## Why there is no churn
 *
 * Three separate brakes, because scroll is not a well-behaved input:
 *
 *   - **A wide band.** Admit at 1.6 viewports, release at 3. A surface inside
 *     the band keeps whatever it currently has, so ordinary scrolling back and
 *     forth across a section boundary changes nothing — and the 1.6 is also the
 *     runway that keeps the cost of acquiring off screen.
 *   - **A minimum hold.** Nothing is released within 5 s of being acquired,
 *     whatever the distance says. A flick-scroll through the whole page
 *     therefore acquires along the way and releases nothing until it settles.
 *   - **Displacement needs the minimum hold too.** When more surfaces are near
 *     at once than the device can carry, the nearest win and the furthest are
 *     released — but never inside their hold window, so a scroll that crosses
 *     three sections in a second does not thrash three contexts.
 *
 * Distance is the normal reason to
 *     release. The budget only bites when more surfaces want a context at once
 *     than the device can carry, and then it takes the furthest one that has
 *     been held long enough.
 */

import { isLeanDevice } from './deviceTier';
import { presumeAppleSafePath } from './appleSafePath';

export type ManagedContext = {
  /** Its position decides distance from the viewport. */
  element: Element;
  /** For the dev-only readout. */
  label: string;
  /** Only breaks a tie between two surfaces at the same distance. */
  priority: number;
  /**
   * How far away this particular surface has to be before distance alone
   * releases it. Defaults to `RELEASE_VIEWPORTS`.
   *
   * This exists because the surfaces are not equally expensive to rebuild, and
   * a single number for all of them is wrong at both ends. Measured on the
   * editor — the worst case, a 2.6 MB DRACO car with fourteen materials — the
   * canvas is back in 0.5 to 1.1 s but the car is not fully built and compiled
   * for 1.3 to 2 s once the byte cache is warm. At 1.6 viewports of runway a
   * fast scroll back up to YooStudio can therefore arrive before the car does,
   * and what the visitor sees is the component's own loading line where a car
   * used to be. That is not a context-lost flash, but it is not free either.
   *
   * So an expensive surface is only released when the visitor is clearly gone.
   * Note what this does NOT do: it does not exempt anything from the budget. A
   * device with real context pressure still displaces it, because there a
   * loading line is unambiguously better than the browser taking a context away
   * from a canvas that was using it.
   */
  releaseViewports?: number;
  /** Bring the GPU context up. Must be safe to call when already held. */
  acquire(): void;
  /** Tear the GPU context down. Must be safe to call when already released. */
  release(): void;
  /** Whether it is holding a context right now. */
  isHeld(): boolean;
};

/**
 * Within this many viewport heights, a surface wants a context.
 *
 * 1.6, not 1.25, and the extra is runway. Acquiring is not free — the editor
 * has to build a renderer, rebuild an environment map and compile the car's
 * programs — and at 1.25 viewports a benchmark caught the tail of that landing
 * inside the first frames on screen: `cong-cu` measured 42.5 fps with the
 * acquire in the sample window against 57.3 with it excluded. Admitting earlier
 * moves the whole of it off screen at ordinary scroll speeds.
 */
const ADMIT_VIEWPORTS = 1.6;
/** Beyond this many, it may lose one. The gap between the two is the band. */
const RELEASE_VIEWPORTS = 3;
/** Nothing is released within this long of being acquired. */
const MIN_HOLD_MS = 6000;
/** Re-evaluation is coalesced to at most this often. */
const THROTTLE_MS = 160;
/** Safety net, for the same reason `visibility.ts` does not trust an observer. */
const SWEEP_MS = 1200;

type Entry = ManagedContext & { heldSince: number; distance: number };

const entries = new Set<Entry>();
let scheduled = false;
let lastRun = -Infinity;
let timer: ReturnType<typeof setInterval> | undefined;
let listening = false;
let budgetOverride: number | null = null;

/**
 * How many contexts this device may hold.
 *
 * This is the one place a device signal is still load-bearing rather than
 * advisory, and it has to be: the context limit is a property of the browser,
 * not of how fast frames are coming back, so there is nothing to measure. A
 * handheld gets two — which is exactly what the Explore chapter needs for
 * itself, and nothing else is on screen while you are in it.
 */
function budget(): number {
  if (budgetOverride !== null) return budgetOverride;
  const handheld = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  /*
   * The Explore hero holds one context outside this budget for the whole page,
   * so every number here is one less than the page's real ceiling.
   *
   * On the Apple path that ceiling comes down to two, handheld included, for a
   * page total of three. Safari's per-page limit is low and undocumented, it is
   * enforced by silently taking the OLDEST context away, and a canvas whose
   * context has been taken composites as nothing.
   *
   * Two rather than one on a tablet, and the one was a mistake worth recording:
   * a budget of one means the Library and YooStudio cannot both be admitted, so
   * scrolling between them evicts and rebuilds a stage every time — churn, on
   * the platform this exists to protect from churn. Two holds the section being
   * read and its neighbour, which is what the 1.6-viewport admit band was sized
   * for.
   */
  if (presumeAppleSafePath().active) return 2;
  if (handheld) return 2;
  return isLeanDevice() ? 3 : 4;
}

/** Distance from the viewport, in viewport heights. 0 while any part is on screen. */
function distanceOf(element: Element): number {
  const rect = element.getBoundingClientRect();
  const viewport = window.innerHeight || document.documentElement.clientHeight || 1;
  if (rect.bottom > 0 && rect.top < viewport) return 0;
  const gap = rect.top >= viewport ? rect.top - viewport : -rect.bottom;
  return Math.max(0, gap) / viewport;
}

function evaluate() {
  lastRun = performance.now();
  if (!entries.size) return;
  const now = performance.now();
  const list = [...entries];
  for (const entry of list) entry.distance = distanceOf(entry.element);

  const cap = budget();

  /*
   * The set that SHOULD hold a context, decided before anything is touched.
   *
   * Deciding this first is what makes displacement work, and the first version
   * of this function got it wrong: it admitted anything near and unheld while
   * slots remained, then trimmed the overflow. On a phone with a two-context
   * budget that meant whichever surface arrived first kept its slot, and a
   * census caught the consequence — standing in the Library, the Library's own
   * stage was the one surface NOT holding a context, because the bridge's stage
   * two sections up and the editor one section up had taken both slots and
   * nothing was allowed to take one back. Nearer has to be able to evict
   * further, so the ideal set is computed and then reconciled.
   *
   * Distance decides; priority only breaks a tie. That is the honest policy for
   * a page you scroll through: the contexts belong to whatever is closest to
   * being looked at.
   */
  const ideal = new Set(
    list
      .filter((entry) => entry.distance <= ADMIT_VIEWPORTS)
      .sort((a, b) => a.distance - b.distance || b.priority - a.priority)
      .slice(0, cap),
  );

  /* Release first, so the slots exist before anything asks for one. Two
     reasons to release, and the minimum hold vetoes both. */
  for (const entry of list) {
    if (!entry.isHeld()) continue;
    if (ideal.has(entry)) continue;
    if (now - entry.heldSince < MIN_HOLD_MS) continue;
    /* Far enough to be waste, or displaced by something nearer. */
    const tooFar = entry.distance > (entry.releaseViewports ?? RELEASE_VIEWPORTS);
    const displaced = ideal.size >= cap;
    if (!tooFar && !displaced) continue;
    entry.release();
  }

  let held = list.filter((entry) => entry.isHeld()).length;
  for (const entry of ideal) {
    if (entry.isHeld()) continue;
    if (held >= cap) break;
    entry.acquire();
    entry.heldSince = now;
    held += 1;
  }
}

/*
 * How fast the page is moving, and why acquisition waits for it to slow down.
 *
 * Acquiring a surface is not a cheap bookkeeping step: it mounts a scene, parses
 * a GLB and compiles its shaders, all synchronously on the main thread. Measured
 * on a fast scroll through the whole page, that showed up as frames of 1.1 s and
 * one of 3.9 s against a 32 ms median — which is exactly the "giật giật" a
 * visitor reports. The work is not avoidable, but *when* it happens is: a
 * visitor travelling at two viewports a second is not looking at the section
 * being built for them, and a visitor who has stopped is.
 *
 * So distance decides *what* to hold and this decides *when* to start holding
 * it. Releases are deliberately not gated — giving memory back during a flick is
 * free, and holding onto it is what causes the context loss this file exists to
 * prevent.
 */
const FAST_SCROLL_PX_PER_S = 2200;
let lastScrollY = 0;
let lastScrollAt = 0;

function scrollVelocity(): number {
  const now = performance.now();
  const y = window.scrollY;
  const dt = now - lastScrollAt;
  if (lastScrollAt === 0 || dt <= 0) {
    lastScrollAt = now;
    lastScrollY = y;
    return 0;
  }
  const velocity = (Math.abs(y - lastScrollY) / dt) * 1000;
  lastScrollAt = now;
  lastScrollY = y;
  return velocity;
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  const wait = Math.max(0, THROTTLE_MS - (performance.now() - lastRun));
  setTimeout(() => {
    scheduled = false;
    /* One rAF so the measurement happens after the scroll has been applied,
       rather than mid-gesture against a stale layout. */
    requestAnimationFrame(() => {
      if (scrollVelocity() > FAST_SCROLL_PX_PER_S) {
        /* Still moving fast. Re-arm rather than evaluate: the interval sweep
           would catch this anyway, but a re-arm settles within one throttle of
           the visitor stopping instead of within one sweep. */
        schedule();
        return;
      }
      evaluate();
    });
  }, wait);
}

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  timer = setInterval(schedule, SWEEP_MS);
}

function stopListening() {
  if (!listening || entries.size) return;
  listening = false;
  window.removeEventListener('scroll', schedule);
  window.removeEventListener('resize', schedule);
  if (timer !== undefined) clearInterval(timer);
  timer = undefined;
}

/**
 * Puts one GPU surface under management. Returns the unregister function.
 *
 * The surface is evaluated immediately, so a surface that registers while it is
 * already on screen is acquired in the same task rather than waiting for the
 * first scroll.
 */
export function registerManagedContext(context: ManagedContext): () => void {
  const entry: Entry = { ...context, heldSince: -Infinity, distance: 0 };
  entries.add(entry);
  listen();
  schedule();
  return () => {
    entries.delete(entry);
    stopListening();
  };
}

/** Dev-only: what is held, what is not, and how far away each one is. */
export function managedContextReport() {
  return {
    budget: budget(),
    held: [...entries].filter((entry) => entry.isHeld()).length,
    surfaces: [...entries].map((entry) => ({
      label: entry.label,
      held: entry.isHeld(),
      distance: Math.round(distanceOf(entry.element) * 100) / 100,
      priority: entry.priority,
      releaseAt: entry.releaseViewports ?? RELEASE_VIEWPORTS,
    })),
  };
}

/**
 * Test hook: pin the budget so a harness can exercise the eviction path without
 * having to be an iPhone. `null` restores the device's own answer.
 */
export function setManagedContextBudget(value: number | null) {
  budgetOverride = value;
  schedule();
}
