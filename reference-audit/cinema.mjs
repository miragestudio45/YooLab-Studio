/**
 * Cinematic QA harness — the Bee → water → Fish → Jellyfish run.
 *
 * `shots.mjs` photographs the page section by section, which is the right tool
 * for a document and the wrong one for this sequence: the crossing is not at a
 * section anchor. It lives between chapter 01 and chapter 02, on a continuous
 * panel clock, and the frames that matter — the surface closing over the eye,
 * the meadow going under, the reef resolving — exist only at fractional
 * positions nobody can scroll to reliably.
 *
 * So this harness drives the clock instead of the scrollbar. `lib/story/snap.ts`
 * exposes `window.__snap` in development so look-dev can hold a deliberately
 * intermediate position, and `ExploreCanvas` exposes `window.__story` with the
 * renderer's own counters. Both are development-only seams and this file is the
 * thing they exist for.
 *
 * It reports four kinds of evidence, because a screenshot alone proves none of
 * them:
 *
 *   - captures at named clock positions, with the image's own luminance
 *     statistics, so "black canvas" and "white-out" are numbers rather than
 *     opinions;
 *   - `scrollWidth - clientWidth` at every viewport, and when that is positive,
 *     the element actually sticking out;
 *   - program/texture/geometry counts sampled either side of a scripted
 *     crossing, so a shader compiled mid-transition is countable;
 *   - real wheel and touch input through the browser, so chapter settling is
 *     tested the way a visitor tests it.
 *
 * Usage:
 *   node reference-audit/cinema.mjs [--url http://localhost:3000] [--out dir] [w390 w1440 ...]
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import net from 'node:net';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

/** width, height, devicePixelRatio, mobile. */
const VIEWPORTS = {
  w1920: [1920, 1080, 1, false],
  w1536: [1536, 864, 1, false],
  w1440: [1440, 900, 1, false],
  w1366: [1366, 768, 1, false],
  w1024: [1024, 768, 1, false],
  w768: [768, 1024, 1, false],
  w390: [390, 844, 2, true],
};

/**
 * The clock positions worth photographing.
 *
 * `panel` is the story clock: 0 hero, 1 chapter 01, 2 chapter 02, 3 chapter 03.
 * The three crossing frames are chosen by the dive value they produce through
 * `diveFor` — a quarter under, halfway, three quarters — not by even spacing on
 * the panel axis, because the descent is eased and even panel spacing would put
 * two of the three frames in the same part of the transition.
 *
 * `clips` are extra magnified crops, in fractions of the frame so one number
 * works at every viewport. A whole-frame capture resamples the flower field down
 * to a few legible pixels per plant, which is enough to judge a composition and
 * nowhere near enough to judge whether a mask has drawn an edge in it.
 */
const STATES = [
  {
    name: 'hero',
    panel: 0,
    settle: 2600,
    profile: [0.72, 0.99],
    contrast: ['.hero-copy', '.hero-spec', '.scroll-cue'],
  },
  {
    name: 'bee',
    panel: 1,
    settle: 1800,
    contrast: ['.story-panel--bee .story-copy', '.story-panel--bee .annotation'],
  },
  {
    name: 'cross-25',
    panel: 1.375,
    settle: 1500,
    clips: [{ fx: 0.3, fy: 0.66, fw: 0.4, fh: 0.32, scale: 3 }],
    profile: [0.72, 0.99],
  },
  { name: 'cross-50', panel: 1.51, settle: 1500 },
  { name: 'cross-75', panel: 1.645, settle: 1500 },
  /*
   * `series` takes the same held frame more than once, seconds apart.
   *
   * The three background animals are on 52-to-118-second paths, so one capture
   * of chapter 03 says where a manta happened to be at one instant and nothing
   * about whether its path crosses the subject. Four frames spread over twenty
   * seconds sample a useful arc of every one of them, which is what "the manta
   * no longer crowds the jellyfish" actually has to be true of.
   */
  {
    name: 'fish',
    panel: 2,
    settle: 2200,
    series: [0, 7000, 14000],
    contrast: ['.story-panel--fish .story-copy', '.story-panel--fish .annotation'],
  },
  {
    name: 'jelly',
    panel: 3,
    settle: 2200,
    series: [0, 6000, 12000, 18000],
    contrast: ['.story-panel--jelly .story-copy', '.story-panel--jelly .annotation'],
  },
  { name: 'bridge', at: '#tu-kham-pha-den-tao', settle: 1400 },
];

/* ---------------------------------------------------------------- CDP client --- */

function frame(payload) {
  const data = Buffer.from(payload, 'utf8');
  const mask = Buffer.alloc(4);
  mask.writeUInt32BE((Math.random() * 0xffffffff) >>> 0, 0);
  let header;
  if (data.length < 126) header = Buffer.from([0x81, 0x80 | data.length]);
  else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  const masked = Buffer.alloc(data.length);
  for (let index = 0; index < data.length; index += 1) masked[index] = data[index] ^ mask[index % 4];
  return Buffer.concat([header, mask, masked]);
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const key = createHash('sha1').update(String(Math.random())).digest('base64');
    const socket = net.connect(Number(target.port), target.hostname, () => {
      socket.write(
        `GET ${target.pathname}${target.search} HTTP/1.1\r\nHost: ${target.host}\r\n` +
        'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    socket.setNoDelay(true);
    socket.setMaxListeners(0);
    let buffer = Buffer.alloc(0);
    let upgraded = false;
    const handlers = new Map();
    let nextId = 1;
    const api = {
      send(method, params = {}, sessionId) {
        const id = nextId += 1;
        const message = { id, method, params };
        if (sessionId) message.sessionId = sessionId;
        socket.write(frame(JSON.stringify(message)));
        return new Promise((ok, fail) => handlers.set(id, { ok, fail }));
      },
      close() { socket.destroy(); },
    };
    socket.on('error', reject);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!upgraded) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end < 0) return;
        upgraded = true;
        buffer = buffer.subarray(end + 4);
        resolve(api);
      }
      for (;;) {
        if (buffer.length < 2) return;
        const length1 = buffer[1] & 0x7f;
        let offset = 2;
        let length = length1;
        if (length1 === 126) {
          if (buffer.length < 4) return;
          length = buffer.readUInt16BE(2); offset = 4;
        } else if (length1 === 127) {
          if (buffer.length < 10) return;
          length = Number(buffer.readBigUInt64BE(2)); offset = 10;
        }
        if (buffer.length < offset + length) return;
        const payload = buffer.subarray(offset, offset + length).toString('utf8');
        buffer = buffer.subarray(offset + length);
        let message;
        try { message = JSON.parse(payload); } catch { continue; }
        const waiting = message.id !== undefined ? handlers.get(message.id) : undefined;
        if (!waiting) continue;
        handlers.delete(message.id);
        if (message.error) waiting.fail(new Error(message.error.message));
        else waiting.ok(message.result);
      }
    });
  });
}

const getJson = (port, path) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path }, (response) => {
    let body = '';
    response.on('data', (chunk) => { body += chunk; });
    response.on('end', () => { try { resolve(JSON.parse(body)); } catch (error) { reject(error); } });
  }).on('error', reject);
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* --------------------------------------------------------------- page helpers --- */

/**
 * Installed before any document script runs.
 *
 * `seek` is the inverse of what `ExploreStory` does every scroll frame: the
 * story turns a scroll position into a panel position by measuring where the
 * viewport centre falls between panel centres, so a scroll position for a wanted
 * panel position is that arithmetic run backwards. Doing it in the page rather
 * than in Node keeps it reading the same live layout the story reads, which is
 * the only version that stays correct when the panels are sized in `svh` and the
 * mobile toolbar changes their height.
 */
const PRELUDE = `
  window.__shotErrors = [];
  const original = console.error;
  console.error = function (...args) {
    try {
      window.__shotErrors.push(args.map((value) =>
        value && value.stack ? String(value.stack).split('\\n')[0] : String(value)).join(' '));
    } catch (error) { /* never break the page to log it */ }
    return original.apply(console, args);
  };
  addEventListener('error', (event) => {
    window.__shotErrors.push('uncaught: ' + (event.message ?? ''));
  });
  addEventListener('unhandledrejection', (event) => {
    window.__shotErrors.push('unhandled: ' + String(event.reason));
  });

  window.__qa = {
    centres() {
      const offset = window.scrollY;
      return [...document.querySelectorAll('[data-scene]')].map((panel) => {
        const rect = panel.getBoundingClientRect();
        return offset + rect.top + rect.height * 0.5;
      });
    },
    yFor(panel) {
      const c = window.__qa.centres();
      if (c.length < 2) return 0;
      const index = Math.min(c.length - 2, Math.max(0, Math.floor(panel)));
      const fraction = panel - index;
      return Math.round(c[index] + fraction * (c[index + 1] - c[index]) - innerHeight * 0.5);
    },
    /** The element whose right edge sticks out furthest past the viewport. */
    offender() {
      const limit = document.documentElement.clientWidth;
      let worst = null;
      for (const node of document.querySelectorAll('body *')) {
        const rect = node.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const over = Math.round(rect.right + window.scrollX - limit);
        if (over > 1 && (!worst || over > worst.over)) {
          worst = {
            over,
            tag: node.tagName.toLowerCase(),
            cls: String(node.className || '').slice(0, 70),
            width: Math.round(rect.width),
          };
        }
      }
      return worst;
    },
    /*
     * Text contrast against what is ACTUALLY behind the letters.
     *
     * Every other way of checking this is unavailable here. The copy sits over a
     * photographic reef and a lit sand plain, so there is no background colour
     * to read off the stylesheet; the scrim behind it is a radial gradient whose
     * value at any given line depends on where that line falls in the falloff;
     * and the ocean chapters re-derive their ink from the dive, so the
     * foreground colour is not a constant either. The only honest ground truth
     * is the frame that was just captured.
     *
     * The background under a line of type is the median of its box AFTER the
     * pixels close to the ink colour are thrown away, which is the only version
     * of this that survives a 60px heading. A plain median works for body copy,
     * where glyphs cover a tenth of the box - and reported 1.58:1 for white
     * display type on dark water, because bold 60px letterforms cover enough of
     * their own box that the median lands inside a glyph. The background is what
     * is NOT the ink; measuring it that way makes the estimate independent of
     * type size. Where almost nothing survives the exclusion there is no honest
     * reading to give, and the element is skipped rather than guessed at.
     */
    async contrast(dataUrl, roots) {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const dpr = image.width / document.documentElement.clientWidth;

      const channel = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
      const relative = (r, g, b) =>
        0.2126 * channel(r / 255) + 0.7152 * channel(g / 255) + 0.0722 * channel(b / 255);

      const out = [];
      for (const root of roots) {
        for (const host of document.querySelectorAll(root)) {
          const nodes = host.matches('*') && host.childNodes.length === 0 ? [host] : [host, ...host.querySelectorAll('*')];
          for (const node of nodes) {
            /* Only elements that own text directly: a wrapper's box spans its
               children's backgrounds and would average away the one line that
               is actually in trouble. */
            const own = [...node.childNodes].some(
              (child) => child.nodeType === 3 && child.textContent.trim().length > 1,
            );
            if (!own) continue;
            const style = getComputedStyle(node);
            /* Gradient headings paint through transparent type; there is no
               foreground colour to compare and the gradient is authored. */
            if (style.webkitBackgroundClip === 'text' || style.backgroundClip === 'text') continue;
            const match = style.color.match(/[\\d.]+/g);
            if (!match) continue;
            const alpha = match.length > 3 ? Number(match[3]) : 1;
            if (alpha < 0.15 || Number(style.opacity) < 0.15) continue;
            const rect = node.getBoundingClientRect();
            if (rect.width < 8 || rect.height < 6) continue;
            if (rect.bottom < 0 || rect.top > innerHeight) continue;
            const x = Math.max(0, Math.round(rect.left * dpr));
            const y = Math.max(0, Math.round(rect.top * dpr));
            const w = Math.min(canvas.width - x, Math.round(rect.width * dpr));
            const h = Math.min(canvas.height - y, Math.round(rect.height * dpr));
            if (w < 4 || h < 4) continue;
            const data = context.getImageData(x, y, w, h).data;
            const samples = [];
            for (let index = 0; index < data.length; index += 4) {
              samples.push(relative(data[index], data[index + 1], data[index + 2]));
            }
            samples.sort((a, b) => a - b);
            const ink = relative(Number(match[0]), Number(match[1]), Number(match[2]));
            /* 0.12 is wide enough to take the antialiased skirt of a glyph with
               it and narrow enough to leave a background that genuinely is close
               to the ink in the reading - which is the case being measured. */
            const kept = samples.filter((value) => Math.abs(value - ink) > 0.12);
            if (kept.length < samples.length * 0.2) continue;
            const ground = kept[Math.floor(kept.length * 0.5)];
            const hi = Math.max(ink, ground);
            const lo = Math.min(ink, ground);
            out.push({
              ratio: +((hi + 0.05) / (lo + 0.05)).toFixed(2),
              size: Math.round(parseFloat(style.fontSize)),
              text: node.textContent.trim().slice(0, 34),
            });
          }
        }
      }
      out.sort((a, b) => a.ratio - b.ratio);
      return out.slice(0, 6);
    },
    /*
     * A magnified crop, cut from the capture rather than re-rasterised.
     *
     * Page.captureScreenshot with a clip and a scale asks the compositor for a
     * fresh raster of that region, and a WebGL canvas with no
     * preserveDrawingBuffer has nothing to give it: the crop comes back as the
     * page background with the entire 3D frame missing. (That is why the
     * hero-detail crops in shots.mjs never produced a usable file.) Cutting the
     * region out of the PNG the compositor already made cannot miss it.
     */
    async crop(dataUrl, rect, scale) {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const sx = Math.round(rect.fx * image.width);
      const sy = Math.round(rect.fy * image.height);
      const sw = Math.round(rect.fw * image.width);
      const sh = Math.round(rect.fh * image.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(sw * scale);
      canvas.height = Math.round(sh * scale);
      const context = canvas.getContext('2d');
      context.imageSmoothingEnabled = false;
      context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
    },
    /**
     * Column-mean luminance across a horizontal strip, and the sharpest jump in
     * it.
     *
     * The failure this exists for is a mask edge in the flower field: a straight
     * vertical boundary with dense plants on one side and washed ones on the
     * other. Judging that by eye in a 1920-wide capture is guesswork, and it is
     * the kind of guess that gets a real defect dismissed or a designed
     * left-to-right density gradient "fixed". A gradient spreads its change over
     * many columns; an edge puts it in one.
     */
    async profile(dataUrl, y0, y1, columns) {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const height = Math.max(1, Math.round((y1 - y0) * image.height));
      const canvas = document.createElement('canvas');
      canvas.width = columns;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(
        image,
        0, Math.round(y0 * image.height), image.width, height,
        0, 0, columns, height,
      );
      const data = context.getImageData(0, 0, columns, height).data;
      const means = new Array(columns).fill(0);
      for (let x = 0; x < columns; x += 1) {
        let sum = 0;
        for (let y = 0; y < height; y += 1) {
          const index = (y * columns + x) * 4;
          sum += (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) / 255;
        }
        means[x] = sum / height;
      }
      let worst = 0;
      let at = 0;
      for (let x = 1; x < columns; x += 1) {
        const jump = Math.abs(means[x] - means[x - 1]);
        if (jump > worst) { worst = jump; at = x; }
      }
      return {
        jump: +worst.toFixed(4),
        atX: +(at / columns).toFixed(3),
        means: means.map((v) => +v.toFixed(3)),
      };
    },
    /**
     * Luminance statistics for a capture, decoded by the browser that made it.
     *
     * A black canvas and a white-out are the two failures this whole run exists
     * to catch, and both are invisible to a harness that only checks that a PNG
     * was written. Downsampled to 260 px wide first: the question is what the
     * frame is doing overall, and a quarter-million samples answer it as well as
     * two million.
     */
    async stats(dataUrl) {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const width = Math.min(260, image.width);
      const height = Math.max(1, Math.round(width * image.height / image.width));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, width, height);
      const data = context.getImageData(0, 0, width, height).data;
      const values = new Float64Array(width * height);
      let sum = 0;
      for (let index = 0, at = 0; index < data.length; index += 4, at += 1) {
        const luma = (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) / 255;
        values[at] = luma;
        sum += luma;
      }
      const sorted = Float64Array.from(values).sort();
      const at = (q) => sorted[Math.min(sorted.length - 1, Math.round(q * (sorted.length - 1)))];
      const mean = sum / values.length;
      let variance = 0;
      for (const value of values) variance += (value - mean) * (value - mean);
      let dark = 0;
      let blown = 0;
      for (const value of values) {
        if (value < 0.02) dark += 1;
        if (value > 0.97) blown += 1;
      }
      return {
        w: image.width,
        h: image.height,
        mean: +mean.toFixed(3),
        sd: +Math.sqrt(variance / values.length).toFixed(3),
        p01: +at(0.01).toFixed(3),
        p50: +at(0.5).toFixed(3),
        p99: +at(0.99).toFixed(3),
        dark: +(dark / values.length).toFixed(3),
        blown: +(blown / values.length).toFixed(3),
      };
    },
  };
`;

/* ----------------------------------------------------------------------- run --- */

const args = process.argv.slice(2);
const readFlag = (flag, fallback) => {
  const index = args.indexOf(flag);
  if (index < 0) return fallback;
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
};

const url = readFlag('--url', 'http://localhost:3000');
const outDir = readFlag('--out', 'reference-audit/cinema');
/* `--only hero,fish` captures those states and skips the sweeps and the snap
   cases, which is the difference between a four-minute run and a twenty-second
   one while a composition is being judged. */
const only = String(readFlag('--only', '')).split(',').map((v) => v.trim()).filter(Boolean);
const requested = args.filter((value) => VIEWPORTS[value]);
const unknown = args.filter((value) => !value.startsWith('-') && !VIEWPORTS[value]);
if (unknown.length) {
  console.error(`Unknown viewport(s): ${unknown.join(', ')}. Known: ${Object.keys(VIEWPORTS).join(', ')}`);
  process.exit(1);
}
const list = requested.length ? requested : Object.keys(VIEWPORTS);

const chrome = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!chrome) {
  console.error('No Chrome or Edge found. Edit CHROME_CANDIDATES.');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const problems = [];

for (const key of list) {
  const [width, height, scale, mobile] = VIEWPORTS[key];
  const profile = join(tmpdir(), `yoolab-cinema-${process.pid}-${key}`);
  const port = 9500 + (process.pid % 200) + list.indexOf(key);

  /*
   * Headed but parked off screen, as in `shots.mjs`: `--headless=new` renders
   * WebGL through SwiftShader, and this run measures frame times.
   *
   * The window is opened larger than the emulated viewport on purpose. The
   * phone case emulates a 2× device pixel ratio, which asks the compositor for
   * a 780×1688 surface; a window sized to the CSS viewport would clip it.
   */
  const child = spawn(chrome, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${Math.max(width, Math.round(width * scale))},${Math.max(height, Math.round(height * scale))}`,
    '--window-position=-32000,-32000',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,MediaRouter,CalculateNativeWinOcclusion',
    /*
     * The window is parked off screen, and Chrome is entitled to conclude from
     * that alone that nobody is looking at it: occlusion detection flips the
     * document to `hidden`, the compositor stops driving rAF, and the page's own
     * visibility gate pauses the renderer. The symptom is a run where every
     * state reports the same panel position and the animal series frames are
     * byte-identical, followed by a crossing sweep that never resolves because
     * its `requestAnimationFrame` loop is not being called.
     *
     * These three keep the tab awake without changing anything the page can
     * observe about itself.
     */
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--force-device-scale-factor=1',
    '--hide-scrollbars',
    '--mute-audio',
    'about:blank',
  ], { stdio: 'ignore', detached: false });

  try {
    let targets = null;
    for (let attempt = 0; attempt < 80 && !targets; attempt += 1) {
      await wait(250);
      try { targets = await getJson(port, '/json/list'); } catch { /* not yet */ }
    }
    if (!targets) throw new Error('Chrome did not open a debugging port');

    const info = await getJson(port, '/json/version');
    const browser = await connect(info.webSocketDebuggerUrl);
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => browser.send(method, params, sessionId);

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: scale, mobile,
    });
    if (mobile) {
      await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await send('Emulation.setEmitTouchEventsForMouse', { enabled: false });
    }
    await send('Page.addScriptToEvaluateOnNewDocument', { source: PRELUDE });

    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', {
        expression: `(window.__probe = (async () => { ${expression} })())`,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate failed');
      }
      return result.result?.value;
    };
    const errors = () => evaluate('const list = window.__shotErrors ?? []; window.__shotErrors = []; return list;');

    await send('Page.navigate', { url });
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await wait(250);
      const ready = await evaluate(
        'return document.readyState === "complete" && !!document.querySelector(".explore-canvas canvas") && !!window.__story && !!window.__snap;',
      );
      if (ready) break;
    }
    // The hero canvas has its own loader; a capture before it clears is a
    // capture of the loading copy over an empty stage.
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const loading = await evaluate(`
        const node = document.querySelector('.explore-canvas .visual-loader');
        return !!node && getComputedStyle(node).opacity !== '0';
      `);
      if (!loading) break;
      await wait(300);
    }

    console.log(`\n=========== ${key}  ${width}x${height} dpr${scale}${mobile ? ' mobile' : ''} ===========`);

    /* ------------------------------------------------------ named clock states --- */

    // Snapping off for the whole capture pass: three of the eight states are
    // deliberately mid-transition, which is exactly where the controller exists
    // to stop a visitor resting.
    await evaluate('window.__snap.disable(); return true;');

    for (const state of (only.length ? STATES.filter((s) => only.includes(s.name)) : STATES)) {
      try {
        if (state.at) {
          await evaluate(`
            const target = document.querySelector(${JSON.stringify(state.at)});
            if (!target) throw new Error('no section ' + ${JSON.stringify(state.at)});
            const previous = document.documentElement.style.scrollBehavior;
            document.documentElement.style.scrollBehavior = 'auto';
            target.scrollIntoView({ block: 'start', behavior: 'auto' });
            document.documentElement.style.scrollBehavior = previous;
            return true;
          `);
        } else {
          await evaluate(`
            const top = window.__qa.yFor(${state.panel});
            window.scrollTo({ top, left: 0, behavior: 'instant' });
            return true;
          `);
        }
        await wait(500);
        /* Collapse the damped camera onto its target: under a loaded GPU the
           settle takes longer than any sane fixed wait, and a half-eased camera
           reads as a broken composition rather than as a frame from a
           transition. */
        await evaluate('window.__story.snap(6); return true;');
        await wait(state.settle);

        const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        const file = join(outDir, `${key}-${state.name}.png`);
        writeFileSync(file, Buffer.from(capture.data, 'base64'));

        const shot = `data:image/png;base64,${capture.data}`;
        for (const [index, clip] of (state.clips ?? []).entries()) {
          const cropped = await evaluate(
            `return window.__qa.crop(${JSON.stringify(shot)}, ${JSON.stringify(clip)}, ${clip.scale ?? 3});`,
          );
          writeFileSync(join(outDir, `${key}-${state.name}-crop${index + 1}.png`), Buffer.from(cropped, 'base64'));
        }
        if (state.profile) {
          const edge = await evaluate(
            `return window.__qa.profile(${JSON.stringify(shot)}, ${state.profile[0]}, ${state.profile[1]}, 320);`,
          );
          console.log(`      band ${state.profile[0]}-${state.profile[1]}: sharpest column jump ${edge.jump} at x=${edge.atX}`);
          /*
           * 0.14, measured rather than guessed.
           *
           * The band is photographic plants against pale mist, and a dense
           * daisy cluster next to bare ground legitimately moves the column mean
           * by 0.06-0.09 in one 6 px column — both the hero and the crossing
           * measure in that range, and a magnified crop of the sharpest one
           * shows an ordinary soft falloff. A mask edge is a different
           * magnitude: it removes the plants entirely, so the step is the full
           * distance between "field" and "mist".
           */
          if (edge.jump > 0.14) {
            problems.push(`${key}/${state.name}: hard edge in the band (${edge.jump} luminance jump at x=${edge.atX})`);
          }
        }

        /* Extra frames of the same held position, for the animals that move
           through it on their own clock rather than on the scroll's. */
        for (const offset of (state.series ?? []).slice(1)) {
          const previous = state.series[state.series.indexOf(offset) - 1] ?? 0;
          await wait(offset - previous);
          const extra = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
          writeFileSync(
            join(outDir, `${key}-${state.name}-t${Math.round(offset / 1000)}.png`),
            Buffer.from(extra.data, 'base64'),
          );
        }

        if (state.contrast) {
          const worst = await evaluate(
            `return window.__qa.contrast(${JSON.stringify(shot)}, ${JSON.stringify(state.contrast)});`,
          );
          for (const line of worst.slice(0, 3)) {
            console.log(`      contrast ${line.ratio.toFixed(2)}:1 at ${line.size}px — "${line.text}"`);
          }
          for (const line of worst) {
            /* WCAG AA: 3:1 for type at 24px and up, 4.5:1 below it. */
            const need = line.size >= 24 ? 3 : 4.5;
            if (line.ratio < need) {
              problems.push(
                `${key}/${state.name}: ${line.ratio.toFixed(2)}:1 contrast on ${line.size}px text (needs ${need}) — "${line.text}"`,
              );
            }
          }
        }

        const stats = await evaluate(`return window.__qa.stats(${JSON.stringify(shot)});`);
        const geometry = await evaluate(`
          const doc = document.documentElement;
          const story = window.__story.state();
          return {
            overflowX: doc.scrollWidth - doc.clientWidth,
            y: Math.round(window.scrollY),
            progress: +story.progress.toFixed(3),
            dive: +story.dive.toFixed(3),
            presence: {
              bee: +story.presence.bee.toFixed(2),
              fish: +story.presence.fish.toFixed(2),
              jelly: +story.presence.jelly.toFixed(2),
            },
            offender: (doc.scrollWidth - doc.clientWidth) > 1 ? window.__qa.offender() : null,
          };
        `);
        const complaints = await errors();

        console.log(
          `${state.name.padEnd(9)} y=${String(geometry.y).padStart(5)} panel=${geometry.progress.toFixed(2)}`
          + ` dive=${geometry.dive.toFixed(2)} b/f/j=${geometry.presence.bee}/${geometry.presence.fish}/${geometry.presence.jelly}`
          + `  overflowX=${geometry.overflowX}`
          + `  ${stats.w}x${stats.h} mean=${stats.mean} sd=${stats.sd} p01=${stats.p01} p99=${stats.p99}`
          + ` dark=${stats.dark} blown=${stats.blown}`,
        );
        if (geometry.offender) {
          console.log(`      offender: <${geometry.offender.tag} class="${geometry.offender.cls}"> +${geometry.offender.over}px (w=${geometry.offender.width})`);
          problems.push(`${key}/${state.name}: overflow ${geometry.overflowX}px from <${geometry.offender.tag} class="${geometry.offender.cls}">`);
        } else if (geometry.overflowX > 1) {
          problems.push(`${key}/${state.name}: overflow ${geometry.overflowX}px, offender not identified`);
        }
        if (stats.dark > 0.9) problems.push(`${key}/${state.name}: frame is ${Math.round(stats.dark * 100)}% black`);
        if (stats.blown > 0.5) problems.push(`${key}/${state.name}: frame is ${Math.round(stats.blown * 100)}% blown out`);
        if (stats.sd < 0.02) problems.push(`${key}/${state.name}: frame is flat (sd=${stats.sd}) — nothing rendered?`);
        for (const line of complaints) {
          console.log(`      ! ${line}`);
          problems.push(`${key}/${state.name}: ${line}`);
        }
      } catch (error) {
        console.error(`FAILED ${state.name}: ${error.message}`);
        problems.push(`${key}/${state.name}: ${error.message}`);
      }
    }

    /* ----------------------------------------------------------- crossing sweep --- */

    if (only.length) { browser.close(); continue; }

    /*
     * Chapter 01 to chapter 02 in one scripted travel, counting what the
     * renderer allocates while it happens.
     *
     * A program compiled or a texture uploaded during the crossing is the root
     * cause of a transition hitch, and it is the one performance question here
     * with a yes/no answer. The sweep runs inside the page on rAF so it is
     * frame-paced rather than timer-paced, and it also collects the frame
     * intervals it observes, which is the closest thing to what the visitor
     * feels.
     */
    try {
      const sweep = await evaluate(`
        const yStart = window.__qa.yFor(1.0);
        const yEnd = window.__qa.yFor(2.0);
        window.scrollTo({ top: yStart, left: 0, behavior: 'instant' });
        await new Promise((r) => setTimeout(r, 900));
        window.__story.resetFrameWatch();
        const before = window.__story.info();

        const frames = [];
        const DURATION = 2400;
        await new Promise((resolve) => {
          let last = performance.now();
          const started = last;
          const step = (now) => {
            frames.push(now - last);
            last = now;
            const t = Math.min(1, (now - started) / DURATION);
            window.scrollTo({ top: Math.round(yStart + (yEnd - yStart) * t), left: 0, behavior: 'instant' });
            if (t >= 1) resolve(); else requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        });
        const after = window.__story.info();
        frames.sort((a, b) => a - b);
        const at = (q) => frames[Math.min(frames.length - 1, Math.round(q * (frames.length - 1)))];
        return {
          before, after,
          frames: frames.length,
          p50: +at(0.5).toFixed(1),
          p95: +at(0.95).toFixed(1),
          worst: +frames[frames.length - 1].toFixed(1),
          rendererWorst: after.worstFrameMs,
        };
      `);
      const delta = (field) => sweep.after[field] - sweep.before[field];
      console.log(
        `crossing  programs ${sweep.before.programs}->${sweep.after.programs} (${delta('programs') >= 0 ? '+' : ''}${delta('programs')})`
        + `  textures ${sweep.before.textures}->${sweep.after.textures} (${delta('textures') >= 0 ? '+' : ''}${delta('textures')})`
        + `  geometries ${sweep.before.geometries}->${sweep.after.geometries} (${delta('geometries') >= 0 ? '+' : ''}${delta('geometries')})`,
      );
      console.log(
        `crossing  ${sweep.frames} frames  p50=${sweep.p50}ms p95=${sweep.p95}ms worst=${sweep.worst}ms`
        + `  renderer-worst=${sweep.rendererWorst}ms  calls=${sweep.after.calls} tris=${sweep.after.triangles}`,
      );
      for (const field of ['programs', 'textures', 'geometries']) {
        if (delta(field) > 0) problems.push(`${key}: ${delta(field)} ${field} allocated DURING the crossing`);
      }
      const complaints = await errors();
      for (const line of complaints) {
        console.log(`      ! ${line}`);
        problems.push(`${key}/crossing: ${line}`);
      }
    } catch (error) {
      console.error(`FAILED crossing sweep: ${error.message}`);
      problems.push(`${key}/crossing: ${error.message}`);
    }

    /* ------------------------------------------------------------- reverse run --- */

    /* The same travel backwards. There is no state to be replayed — every value
       is a pure function of the panel clock — so the reverse run's job is to
       prove that: same counters, no second allocation, no error. */
    try {
      const reverse = await evaluate(`
        const yStart = window.__qa.yFor(2.0);
        const yEnd = window.__qa.yFor(1.0);
        window.scrollTo({ top: yStart, left: 0, behavior: 'instant' });
        await new Promise((r) => setTimeout(r, 900));
        window.__story.resetFrameWatch();
        const before = window.__story.info();
        const frames = [];
        await new Promise((resolve) => {
          let last = performance.now();
          const started = last;
          const step = (now) => {
            frames.push(now - last);
            last = now;
            const t = Math.min(1, (now - started) / 2400);
            window.scrollTo({ top: Math.round(yStart + (yEnd - yStart) * t), left: 0, behavior: 'instant' });
            if (t >= 1) resolve(); else requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        });
        const after = window.__story.info();
        frames.sort((a, b) => a - b);
        return {
          before, after,
          p50: +frames[Math.round(frames.length * 0.5)].toFixed(1),
          worst: +frames[frames.length - 1].toFixed(1),
          state: window.__story.state(),
        };
      `);
      const delta = (field) => reverse.after[field] - reverse.before[field];
      console.log(
        `reverse   programs ${delta('programs') >= 0 ? '+' : ''}${delta('programs')}`
        + `  textures ${delta('textures') >= 0 ? '+' : ''}${delta('textures')}`
        + `  geometries ${delta('geometries') >= 0 ? '+' : ''}${delta('geometries')}`
        + `  p50=${reverse.p50}ms worst=${reverse.worst}ms`
        + `  back at panel=${reverse.state.progress.toFixed(2)} dive=${reverse.state.dive.toFixed(2)}`,
      );
      for (const field of ['programs', 'textures', 'geometries']) {
        if (delta(field) > 0) problems.push(`${key}: ${delta(field)} ${field} allocated during the REVERSE crossing`);
      }
      const complaints = await errors();
      for (const line of complaints) {
        console.log(`      ! ${line}`);
        problems.push(`${key}/reverse: ${line}`);
      }
    } catch (error) {
      console.error(`FAILED reverse sweep: ${error.message}`);
      problems.push(`${key}/reverse: ${error.message}`);
    }

    /* ------------------------------------------------------------ chapter snap --- */

    /*
     * Real input, not `scrollTo`.
     *
     * The controller deliberately treats its own writes differently from the
     * visitor's, distinguishes a deliberate wheel from a momentum tail, and
     * biases forward — none of which a scripted scroll position exercises. So
     * these cases go through `Input.dispatch*`, which is the same path a mouse
     * and a finger take.
     *
     * The assertion is not "it landed on the chapter I expected" — the forward
     * bias means a short gesture legitimately settles back where it started.
     * It is "it landed on an anchor", because resting between anchors is the
     * defect.
     */
    try {
      await evaluate('window.__snap.enable(); return true;');
      const anchors = await evaluate('return window.__snap.anchors();');

      const wheelTo = async (fromPanel, delta, count) => {
        await evaluate(`
          window.__snap.disable();
          window.scrollTo({ top: window.__qa.yFor(${fromPanel}), left: 0, behavior: 'instant' });
          await new Promise((r) => setTimeout(r, 400));
          window.__snap.enable();
          return true;
        `);
        for (let index = 0; index < count; index += 1) {
          await send('Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            x: Math.round(width / 2),
            y: Math.round(height / 2),
            deltaX: 0,
            deltaY: delta,
            pointerType: 'mouse',
          });
          await wait(45);
        }
        await wait(2200);
        return evaluate(`
          const list = window.__snap.anchors();
          const y = window.scrollY;
          let best = Infinity;
          for (const anchor of list) best = Math.min(best, Math.abs(anchor - y));
          return { y: Math.round(y), off: Math.round(best), gliding: window.__snap.state().gliding };
        `);
      };

      const touchTo = async (fromPanel, distance) => {
        await evaluate(`
          window.__snap.disable();
          window.scrollTo({ top: window.__qa.yFor(${fromPanel}), left: 0, behavior: 'instant' });
          await new Promise((r) => setTimeout(r, 400));
          window.__snap.enable();
          return true;
        `);
        const x = Math.round(width / 2);
        const start = Math.round(height * 0.75);
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: start }] });
        const steps = 10;
        for (let index = 1; index <= steps; index += 1) {
          await send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x, y: Math.round(start - (distance * index) / steps) }],
          });
          await wait(16);
        }
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await wait(2400);
        return evaluate(`
          const list = window.__snap.anchors();
          const y = window.scrollY;
          let best = Infinity;
          for (const anchor of list) best = Math.min(best, Math.abs(anchor - y));
          return { y: Math.round(y), off: Math.round(best), gliding: window.__snap.state().gliding };
        `);
      };

      const cases = [
        ['nudge-fwd', () => wheelTo(1, 60, 1)],
        ['small-fwd', () => wheelTo(1, 80, 6)],
        ['half-fwd', () => wheelTo(1, 120, 8)],
        ['reverse', () => wheelTo(3, -100, 7)],
        ['reverse-deep', () => wheelTo(2, -110, 8)],
      ];
      if (mobile) cases.push(['swipe-fwd', () => touchTo(1, Math.round(height * 0.55))]);

      console.log(`snap      anchors: ${anchors.join(', ')}`);
      for (const [name, run] of cases) {
        const result = await run();
        const ok = result.off <= 8 && !result.gliding;
        console.log(`snap      ${name.padEnd(12)} y=${String(result.y).padStart(5)} off-anchor=${result.off}px gliding=${result.gliding}  ${ok ? 'OK' : 'STRANDED'}`);
        if (!ok) problems.push(`${key}/snap ${name}: rested ${result.off}px off an anchor (gliding=${result.gliding})`);
      }
      const complaints = await errors();
      for (const line of complaints) {
        console.log(`      ! ${line}`);
        problems.push(`${key}/snap: ${line}`);
      }
    } catch (error) {
      console.error(`FAILED snap: ${error.message}`);
      problems.push(`${key}/snap: ${error.message}`);
    }

    /* ------------------------------------------------------------- nav drawer --- */

    /*
     * The one part of the header a closed-hamburger screenshot cannot vouch for.
     *
     * "Header usable" on a phone means the drawer opens, its links are inside
     * the viewport and big enough to hit, and opening it does not lurch — and
     * the drawer animates `max-height`, which is a layout property, so the last
     * of those is worth measuring rather than assuming. It taps through
     * `Input.dispatch*` so React's own handler runs.
     */
    if (mobile) {
      try {
        const toggle = await evaluate(`
          const node = document.querySelector('.menu-toggle');
          if (!node) throw new Error('no .menu-toggle');
          const rect = node.getBoundingClientRect();
          return {
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          };
        `);
        /* Start sampling frame intervals, then tap: the transition is 300ms and
           the interesting frames are the first few after the class flips. */
        await evaluate(`
          window.__frames = [];
          let last = performance.now();
          const started = last;
          const step = (now) => {
            window.__frames.push(now - last);
            last = now;
            if (now - started < 900) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
          return true;
        `);
        for (const type of ['mousePressed', 'mouseReleased']) {
          await send('Input.dispatchMouseEvent', {
            type, x: toggle.x, y: toggle.y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0,
          });
        }
        await wait(1100);

        const open = await evaluate(`
          const doc = document.documentElement;
          const nav = document.querySelector('.mobile-nav');
          const links = [...document.querySelectorAll('.mobile-nav > a')];
          const rect = nav.getBoundingClientRect();
          const frames = (window.__frames ?? []).slice(1).sort((a, b) => a - b);
          return {
            opened: document.querySelector('.site-header').classList.contains('is-open'),
            height: Math.round(rect.height),
            offscreen: links.filter((a) => {
              const r = a.getBoundingClientRect();
              return r.right > doc.clientWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1;
            }).length,
            small: links.filter((a) => a.getBoundingClientRect().height < 44).length,
            links: links.length,
            overflowX: doc.scrollWidth - doc.clientWidth,
            worstFrame: frames.length ? +frames[frames.length - 1].toFixed(1) : 0,
            longFrames: frames.filter((v) => v > 25).length,
          };
        `);
        const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        writeFileSync(join(outDir, `${key}-nav-open.png`), Buffer.from(capture.data, 'base64'));

        console.log(
          `nav       toggle ${toggle.w}x${toggle.h}  opened=${open.opened} height=${open.height}`
          + ` links=${open.links} offscreen=${open.offscreen} under-44px=${open.small}`
          + `  overflowX=${open.overflowX}  worst frame ${open.worstFrame}ms (${open.longFrames} over 25ms)`,
        );
        if (!open.opened) problems.push(`${key}/nav: drawer did not open`);
        if (open.offscreen) problems.push(`${key}/nav: ${open.offscreen} link(s) outside the viewport`);
        if (open.small) problems.push(`${key}/nav: ${open.small} link(s) under a 44px touch target`);
        if (open.overflowX > 1) problems.push(`${key}/nav: drawer overflows by ${open.overflowX}px`);
        if (open.longFrames > 2) {
          problems.push(`${key}/nav: ${open.longFrames} frames over 25ms while the drawer animated`);
        }
        if (toggle.w < 44 || toggle.h < 44) {
          problems.push(`${key}/nav: hamburger is ${toggle.w}x${toggle.h}, under a 44px touch target`);
        }

        /* And it has to close again, from a link, or the drawer traps the page. */
        const link = await evaluate(`
          const node = document.querySelector('.mobile-nav > a');
          const rect = node.getBoundingClientRect();
          return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
        `);
        for (const type of ['mousePressed', 'mouseReleased']) {
          await send('Input.dispatchMouseEvent', {
            type, x: link.x, y: link.y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0,
          });
        }
        await wait(900);
        const closed = await evaluate(
          "return !document.querySelector('.site-header').classList.contains('is-open');",
        );
        console.log(`nav       closes on link tap: ${closed}`);
        if (!closed) problems.push(`${key}/nav: drawer stayed open after tapping a link`);
        for (const line of await errors()) {
          console.log(`      ! ${line}`);
          problems.push(`${key}/nav: ${line}`);
        }
      } catch (error) {
        console.error(`FAILED nav: ${error.message}`);
        problems.push(`${key}/nav: ${error.message}`);
      }
    }

    browser.close();
  } catch (error) {
    console.error(`FAILED ${key}: ${error.message}`);
    problems.push(`${key}: ${error.message}`);
  } finally {
    child.kill();
    await wait(500);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* windows lock */ }
  }
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const line of problems) console.error(` - ${line}`);
  process.exit(1);
}
console.log('\nno problems reported');
