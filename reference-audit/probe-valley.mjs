/*
 * Why the flower field flickers while scrolling the first chapters.
 *
 * Run through the CDP probe so it is a real Chrome that actually composites:
 *
 *   node reference-audit/probe.mjs reference-audit/probe-valley.mjs --url http://localhost:3320 --viewport w1512
 *   node reference-audit/probe.mjs reference-audit/probe-valley.mjs --url http://localhost:3320 --viewport w1512 --dpr 2
 *
 * The renderer already publishes everything needed onto the canvas element —
 * `data-fps`, `data-quality`, `data-scale`, `data-count`, `data-chapter` — so
 * this does not instrument the renderer, it just watches it while driving the
 * scroll the way a visitor does and records what moves.
 *
 * Three things are being separated:
 *
 *   1. Does `quality` change during the scroll? A change calls `rebuildField()`,
 *      which repopulates the field — that is a visible pop, not a slow frame.
 *   2. Does frame time spike at a particular scroll position, and does the ocean
 *      build land in the same window? `startOcean` is normally warmed on idle,
 *      but it is also called from the frame loop at `progress > 0.25`, and doing
 *      it there means five GLBs and a shader compile land mid-scroll.
 *   3. What does the connection report? `prefersLightPayload()` decides which of
 *      those two paths runs, and it is sampled right after the bee has pulled
 *      2.5 MB — the moment Chrome's own estimate is worst.
 */

const canvas = document.querySelector('.flower-valley-canvas');
if (!canvas) return { error: 'no flower canvas' };

const conn = navigator.connection || {};
const started = performance.now();

/* Long tasks, so a stall can be attributed rather than guessed at. */
const longTasks = [];
try {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      longTasks.push({ at: Math.round(entry.startTime), ms: Math.round(entry.duration) });
    }
  }).observe({ type: 'longtask', buffered: true });
} catch { /* not supported: the rest of the probe still reports */ }

/* When the ocean's own assets appear, which is when its build is happening. */
const oceanAt = () => {
  const hit = performance.getEntriesByType('resource')
    .filter((r) => /Clownfish|jellyfish|coral|basis_transcoder|sand_albedo/.test(r.name))
    .sort((a, b) => a.startTime - b.startTime)[0];
  return hit ? Math.round(hit.startTime) : null;
};

/* Wait for the field to be drawing and reporting. */
for (let i = 0; i < 80; i += 1) {
  if (canvas.dataset.fps) break;
  await new Promise((r) => setTimeout(r, 250));
}

const read = () => ({
  fps: Number(canvas.dataset.fps || 0),
  quality: canvas.dataset.quality || '?',
  scale: canvas.dataset.scale || '?',
  count: Number(canvas.dataset.count || 0),
  cost: Number(canvas.dataset.cost || 0),
  chapter: Number(canvas.dataset.chapter || 0),
  visible: canvas.dataset.visible,
});

const samples = [];
const qualityChanges = [];
let last = read();
samples.push({ y: 0, t: Math.round(performance.now() - started), ...last });

/*
 * Drive the scroll in small steps across the first three chapters, pausing long
 * enough at each for the renderer's own 900 ms fps window to produce a fresh
 * reading. A single jump to the bottom would miss the whole effect: the
 * complaint is about scrolling, not about a destination.
 */
const step = Math.round(window.innerHeight * 0.35);
const limit = window.innerHeight * 3.2;
for (let y = step; y <= limit; y += step) {
  window.scrollTo(0, y);
  await new Promise((r) => setTimeout(r, 1000));
  const now = read();
  if (now.quality !== last.quality) {
    qualityChanges.push({ y, from: last.quality, to: now.quality, fps: now.fps, count: now.count });
  }
  samples.push({ y, t: Math.round(performance.now() - started), ...now });
  last = now;
}

const fpsValues = samples.map((s) => s.fps).filter((v) => v > 0);

return {
  conditions: {
    dpr: window.devicePixelRatio,
    viewport: [window.innerWidth, window.innerHeight],
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    gpuTier: document.documentElement.getAttribute('data-gpu') || 'full',
    /* Whether this Chrome is on a real GPU at all. An off-screen harness that
       silently fell back to SwiftShader would make every timing below a
       property of the harness rather than of the site. */
    gl: (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
      } catch { return 'error'; }
    })(),
    /* `compileAsync` only actually defers work when this extension exists;
       without it three's `isReady()` returns true at once and the driver has
       already compiled synchronously inside `compile()`. */
    parallelShaderCompile: (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        return Boolean(gl && gl.getExtension('KHR_parallel_shader_compile'));
      } catch { return 'error'; }
    })(),
  },
  connection: {
    effectiveType: conn.effectiveType ?? null,
    saveData: conn.saveData ?? null,
    /* The exact predicate `deviceTier.prefersLightPayload()` evaluates. */
    wouldSkipOceanWarmup: Boolean(
      conn.saveData || ['slow-2g', '2g', '3g'].includes(conn.effectiveType),
    ),
  },
  oceanAssetsFirstRequestedAtMs: oceanAt(),
  fps: {
    min: Math.min(...fpsValues),
    max: Math.max(...fpsValues),
    samples: fpsValues,
  },
  qualityChanges,
  longTasksOver100ms: longTasks.filter((t) => t.ms > 100),
  samples,
};
