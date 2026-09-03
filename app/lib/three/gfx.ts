/**
 * One switchboard for every risky GPU path on this page, and one place to read
 * what the machine actually did.
 *
 * ## Why this exists
 *
 * Two reproducible defects are being chased on hardware that is not in the room
 * — a flat green land chapter on iPadOS, and torn tile-shaped corruption across
 * the fish and the jellyfish on an Apple laptop. Both had a plausible cause,
 * both causes were fixed, and both defects survived. That is the point at which
 * guessing has to stop and elimination has to start.
 *
 * So every pass that could be responsible is now individually switchable from
 * the URL, and the page reports its own state back through `window.__gfx`
 * **in production**, because the devices that fail are the ones without a
 * console attached.
 *
 * ## Using it
 *
 *   ?gfx=safe                 every optical extra off, the most conservative
 *                             path the page can draw
 *   ?gfx=no-transmission      three's transmission pass (MSAA + resolve + mip)
 *   ?gfx=no-hdr               half-float intermediates; everything goes 8-bit
 *   ?gfx=no-mip               mipmapped captures; the bee shell stops using LOD
 *   ?gfx=no-bloom             the ocean's HDR extract/blur/composite chain
 *   ?gfx=no-msaa              MSAA on the drawing buffers
 *   ?gfx=no-foreground        the bee's SECOND WebGL context, and with it the
 *                             extra land render it does every other frame
 *   ?gfx=no-liquid            the animated backdrop simulation
 *   ?gfx=no-composite         the land/ocean render targets; the crossing is
 *                             drawn without them
 *   ?gfx=hud                  an on-screen readout, for a device with no console
 *
 * Any of them can be combined: `?gfx=no-bloom,no-transmission,hud`.
 *
 * Every switch also has a **force-on** form with the `no-` dropped —
 * `?gfx=transmission` — which overrides the automatic decision. That direction
 * matters as much as the other: on a handheld most of these are already off, so
 * finding out which one corrupts an iPad means turning them back **on** one at
 * a time, not off.
 *
 * ## What it is not
 *
 * Not a quality setting and not persisted. It lives in the query string for the
 * length of one page load, so a device cannot get stuck in a degraded mode, and
 * nothing here is read anywhere except at renderer construction.
 */

export type GfxFeature =
  | 'apple-safe'
  | 'transmission'
  | 'hdr'
  | 'mip'
  | 'bloom'
  | 'msaa'
  | 'foreground'
  | 'liquid'
  | 'composite';

/** Everything `safe` turns off. `composite` is absent: the crossing needs it. */
const SAFE_OFF: GfxFeature[] = ['transmission', 'hdr', 'mip', 'bloom', 'msaa', 'foreground', 'liquid'];

let parsed: Set<string> | null = null;

function flags(): Set<string> {
  if (parsed) return parsed;
  parsed = new Set<string>();
  if (typeof window === 'undefined') return parsed;
  try {
    const raw = new URLSearchParams(window.location.search).get('gfx');
    if (raw) for (const part of raw.split(',')) {
      const token = part.trim().toLowerCase();
      if (token) parsed.add(token);
    }
  } catch {
    /* A malformed URL is not worth failing a render over. */
  }
  return parsed;
}

/** True when the URL asked for the on-screen readout. */
export function gfxHud(): boolean {
  return flags().has('hud');
}

/** The raw token list, for the report. */
export function gfxFlagList(): string[] {
  return [...flags()];
}

/**
 * Whether a feature may run.
 *
 * `automatic` is what the page decided on its own — from the device tier, the
 * capability probe, or the frame governor. An explicit flag beats it in either
 * direction; nothing else does.
 */
export function gfxAllows(feature: GfxFeature, automatic: boolean): boolean {
  const set = flags();
  if (set.has(`no-${feature}`)) return false;
  if (set.has(feature)) return true;
  if (set.has('safe') && SAFE_OFF.includes(feature)) return false;
  return automatic;
}

/* ------------------------------------------------------------- context census --- */

type TrackedContext = {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  kind: string;
  lost: number;
  restored: number;
};

/*
 * The census counts contexts at `getContext`, not at `new WebGLRenderer`.
 *
 * There are ten renderer construction sites on this page and three of them are
 * inside helpers that other code calls, so a census built from hand-placed
 * `track()` calls is a census that is wrong the first time somebody adds an
 * eleventh. Patching the one function every WebGL context on the planet has to
 * go through cannot miss one — including the contexts three.js or a library
 * creates without asking us.
 */
const tracked: TrackedContext[] = [];
const labels = new WeakMap<HTMLCanvasElement, string>();

export type GfxEvent = { at: number; label: string; kind: 'lost' | 'restored' | 'created' | 'disposed' };
/** Ring buffer. Long enough for a full scroll pass, short enough to never grow. */
const events: GfxEvent[] = [];
const EVENT_CAP = 120;
/**
 * How many context losses this page has seen, ever.
 *
 * Counted across the whole session rather than over the live contexts, because
 * a lost context is usually a *replaced* context: by the time anything asks,
 * the entry that recorded the loss has been swept away. The number has to
 * outlive it, because one loss is enough to stop trusting this GPU.
 */
let lossTotal = 0;
export function gfxContextLossCount(): number {
  return lossTotal;
}

function note(label: string, kind: GfxEvent['kind']) {
  events.push({ at: Math.round(performance.now()), label, kind });
  if (events.length > EVENT_CAP) events.shift();
  if (kind === 'lost') lossTotal += 1;
  if (kind === 'lost' || kind === 'restored') {
    /* Never noise. Logged even in production because these two are the events
       that explain a canvas going blank, and iOS Safari drops the oldest
       context silently when a page asks for more than it will give. */
    console.error(`[gfx] WebGL context ${kind.toUpperCase()}: ${label} (tracked ${tracked.length})`);
  }
}

function nameOf(canvas: HTMLCanvasElement): string {
  /* `||`, not `??`: an unclassed canvas has `className === ''`, which is not
     nullish, so the nullish chain stopped there and reported every Studio and
     Library surface as an empty name. */
  return labels.get(canvas)
    || canvas.className
    || canvas.parentElement?.className
    || 'anonymous';
}

/**
 * Drop the entries that are no longer real.
 *
 * A context can stop counting in two ways and neither of them notifies: the
 * browser marks it lost, or the canvas is detached and left to the collector.
 * Sweeping on read rather than tracking disposal keeps this honest without
 * every call site having to remember to say goodbye.
 */
function sweep(): TrackedContext[] {
  for (let index = tracked.length - 1; index >= 0; index -= 1) {
    const entry = tracked[index];
    if (entry.gl.isContextLost() || !entry.canvas.isConnected) tracked.splice(index, 1);
  }
  return tracked;
}

/** Add one context to the census, once, and watch it for loss. */
function register(
  canvas: HTMLCanvasElement,
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  kind: string,
) {
  /*
   * Capability probes are not part of the census.
   *
   * `appleSafePath` opens a 1x1 context to read the GL renderer string and
   * hands it straight back with `loseContext`. That is a deliberate release,
   * but it arrives here as a `webglcontextlost` event like any other — and one
   * of the safe path's own triggers is "a context has been lost". Left
   * unmarked, the probe put every machine on the planet onto the fallback path
   * a beat after it started, which is a worse bug than the one it was
   * diagnosing.
   */
  if (canvas.dataset.gfxProbe) return;
  if (tracked.some((entry) => entry.gl === gl)) return;
  tracked.push({ canvas, gl, kind, lost: 0, restored: 0 });
  canvas.addEventListener('webglcontextlost', (event) => {
    /* Prevented so the browser will fire `webglcontextrestored` rather than
       leaving the canvas permanently dead. Whether the owner rebuilds its
       resources is the owner's business; this only keeps the door open. */
    event.preventDefault();
    const entry = tracked.find((item) => item.gl === gl);
    if (entry) entry.lost += 1;
    note(nameOf(canvas), 'lost');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    const entry = tracked.find((item) => item.gl === gl);
    if (entry) entry.restored += 1;
    note(nameOf(canvas), 'restored');
  });
  note(nameOf(canvas), 'created');
}

let installed = false;

function installCensus() {
  if (installed || typeof HTMLCanvasElement === 'undefined') return;
  installed = true;
  const original = HTMLCanvasElement.prototype.getContext;

  function patched(this: HTMLCanvasElement, ...args: unknown[]) {
    /* The original is called first and its result returned untouched. Nothing
       here may change what a caller gets back — this is a counter, not a
       policy. */
    const context = (original as unknown as (...a: unknown[]) => unknown).apply(this, args);
    const kind = String(args[0] ?? '');
    if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') {
      if (context) register(this, context as WebGLRenderingContext | WebGL2RenderingContext, kind);
    }
    return context;
  }

  HTMLCanvasElement.prototype.getContext = patched as typeof HTMLCanvasElement.prototype.getContext;
}

installCensus();

/**
 * Give a canvas a readable name in the census, and note its lifetime.
 *
 * Optional — the census counts every context whether or not this is called. It
 * exists so a report from a phone says `explore-bee-foreground` rather than a
 * blank class name.
 */
export function trackRenderer(canvas: HTMLCanvasElement, label: string): () => void {
  labels.set(canvas, label);
  return () => {
    note(label, 'disposed');
    labels.delete(canvas);
  };
}

/** How many WebGL contexts this page is holding right now. */
export function gfxContextCount(): number {
  return sweep().length;
}


/* --------------------------------------------------------------- capabilities --- */

type CapabilityRecord = Record<string, unknown>;
const capabilities: CapabilityRecord = {};

/** Record what a subsystem decided, so the report can show it on a device. */
export function gfxRecord(key: string, value: unknown) {
  capabilities[key] = value;
}

export type GfxReport = {
  flags: string[];
  contexts: { count: number; labels: string[]; lost: number; restored: number };
  events: GfxEvent[];
  device: { dpr: number; cores: number; memory: number | null; handheld: boolean; ua: string };
  capabilities: CapabilityRecord;
};

export function gfxReport(): GfxReport {
  const entries = sweep();
  const nav = typeof navigator === 'undefined'
    ? null
    : (navigator as Navigator & { deviceMemory?: number });
  return {
    flags: gfxFlagList(),
    contexts: {
      count: entries.length,
      labels: entries.map((entry) => nameOf(entry.canvas)),
      lost: entries.reduce((total, entry) => total + entry.lost, 0),
      restored: entries.reduce((total, entry) => total + entry.restored, 0),
    },
    events: [...events],
    device: {
      dpr: typeof window === 'undefined' ? 0 : window.devicePixelRatio || 1,
      cores: nav?.hardwareConcurrency ?? 0,
      memory: nav?.deviceMemory ?? null,
      handheld: typeof window !== 'undefined'
        && window.matchMedia('(hover: none) and (pointer: coarse)').matches,
      ua: nav?.userAgent ?? '',
    },
    capabilities: { ...capabilities },
  };
}

/*
 * Published unconditionally, production included.
 *
 * The whole reason this file exists is that the failing devices are the ones a
 * debugger cannot reach, so a report that only appears in a dev build is a
 * report that never appears where it is needed. It is a few hundred bytes and
 * reads nothing it does not already hold.
 */
if (typeof window !== 'undefined') {
  (window as unknown as { __gfx?: unknown }).__gfx = {
    report: gfxReport,
    contexts: gfxContextCount,
    allows: gfxAllows,
  };
}
