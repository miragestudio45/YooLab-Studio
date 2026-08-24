/**
 * Screenshot harness.
 *
 * The Claude browser pane in this environment reports `visibilityState: hidden`,
 * so `requestAnimationFrame` never fires, no WebGL frame is ever composited and
 * capture times out — which is why every previous round of this project shipped
 * with "no screenshots were captured" in KNOWN_LIMITATIONS.md. This drives a real
 * Chrome over the DevTools protocol instead, headed but off-screen, so the page
 * is genuinely visible to the compositor and the 3D actually renders.
 *
 * Usage:
 *   node reference-audit/shots.mjs [--url http://localhost:3000] [--out dir] [shot ...]
 *
 * A "shot" is a name from SHOTS below; with none given it takes them all. Each
 * shot names a viewport, a scroll target and an optional script to run before the
 * capture (open a subject, select a specimen, switch a tab), plus how long to let
 * the scene settle — a WebGL panel needs its model fetched, its materials built
 * and a few frames of camera easing before a capture means anything.
 *
 * No dependency is installed for this: it speaks CDP over a WebSocket from Node's
 * own `ws`-less implementation, which is about eighty lines and does not add a
 * 300 MB Playwright download to a repo that ships a static site.
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

/* -------------------------------------------------------------------- shots --- */

const VIEWPORTS = {
  'w1920': { width: 1920, height: 1080 },
  'w1512': { width: 1512, height: 982 },
  'w1440': { width: 1440, height: 900 },
  'w1366': { width: 1366, height: 768 },
  'w1024': { width: 1024, height: 768 },
  'w768': { width: 768, height: 1024 },
  'w390': { width: 390, height: 844 },
};

/** Selects a subject tab, then a row in the rail, by visible text. */
const OPEN = (subject, row) => `
  const tab = [...document.querySelectorAll('.library-subject')]
    .find((node) => node.textContent.trim().startsWith(${JSON.stringify(subject)}));
  if (tab) tab.click();
  await new Promise((r) => setTimeout(r, 260));
  ${row ? `
  const asset = [...document.querySelectorAll('.library-asset')]
    .find((node) => node.querySelector('b')?.textContent.trim() === ${JSON.stringify(row)});
  if (!asset) throw new Error('row not found: ' + ${JSON.stringify(row)});
  asset.click();` : ''}
`;

const SHOTS = [
  { name: 'hero', at: '#trang-chu', settle: 2600 },
  /*
   * The growth wave, mid-flight.
   *
   * Not a scroll position: the flower valley's growth clock starts when
   * `ExploreCanvas` mounts and is deliberately monotonic — scrolling back to the
   * hero must not replay the bloom — so the only way to photograph the front
   * while it is travelling is to reload and capture on a schedule. The numbers
   * are milliseconds after the canvas element appears, against a 2.6 s wave.
   */
  { name: 'grow', at: '#trang-chu', growth: [450, 1000, 1700, 3000] },
  /*
   * Mid-handover, between the hero and the bee study.
   *
   * The one frame where the flower-valley dispersal is actually visible: at the hero
   * it is at full composition and at the bee study it is gone, so a fault in the
   * exit — a jump, a residue over the anatomy column, a flash — lives only here.
   */
  /* Two magnified crops of the hero, for judging plant silhouettes rather than
     composition: the left bank's foliage and the right-hand bloom clusters. */
  {
    name: 'hero-detail-left',
    at: '#trang-chu',
    settle: 3600,
    clip: { x: 40, y: 760, width: 620, height: 320, scale: 3 },
  },
  {
    name: 'hero-detail-right',
    at: '#trang-chu',
    settle: 3600,
    clip: { x: 1280, y: 620, width: 620, height: 400, scale: 3 },
  },
  {
    name: 'hero-exit',
    at: '#trang-chu',
    run: `
      const next = document.querySelector('#ong-mat');
      const top = next.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.round(top * 0.45), behavior: 'auto' });
      await new Promise((r) => setTimeout(r, 500));
    `,
    settle: 1600,
  },
  /* The three creature chapters, each captured at the scroll position anchor
     navigation actually lands on. The composition faults in this part of the
     page are all about where the copy column sits relative to the creature, and
     that is invisible in a shot of the hero. */
  /*
   * 4.2 s, not 2.4.
   *
   * These three are the only shots whose subject is driven by scroll position
   * rather than by state. The canvas damps its way to the new place on the track,
   * and every creature not yet at full presence is still travelling its entry
   * arc — so a capture taken too early shows two creatures crossfading and the
   * third half out of frame, which reads as a broken composition rather than as
   * a frame from the middle of a transition.
   */
  { name: 'bee-study', at: '#ong-mat', settle: 4200 },
  { name: 'fish', at: '#ca-canh-bien', settle: 4200 },
  { name: 'jelly', at: '#sinh-vat-bien', settle: 4200 },
  { name: 'bridge', at: '#tu-kham-pha-den-tao', settle: 1800 },
  { name: 'ribbon', at: '#quy-trinh' },
  { name: 'studio', at: '#cong-cu', settle: 2200 },
  { name: 'library-bee', at: '#thu-vien', run: OPEN('Sinh học', 'Ong mật'), settle: 3400 },
  { name: 'library-fish', at: '#thu-vien', run: OPEN('Sinh học', 'Cá cảnh biển'), settle: 3200 },
  { name: 'library-jelly', at: '#thu-vien', run: OPEN('Sinh học', 'Sứa biển'), settle: 3200 },
  { name: 'library-cell-animal', at: '#thu-vien', run: OPEN('Sinh học', 'Tế bào động vật'), settle: 2600 },
  { name: 'library-cell-plant', at: '#thu-vien', run: OPEN('Sinh học', 'Tế bào thực vật'), settle: 2600 },
  { name: 'library-cell-blood', at: '#thu-vien', run: OPEN('Sinh học', 'Bạch cầu'), settle: 2600 },
  { name: 'library-cell-epithelial', at: '#thu-vien', run: OPEN('Sinh học', 'Tế bào biểu mô'), settle: 2600 },
  { name: 'library-cell-muscle', at: '#thu-vien', run: OPEN('Sinh học', 'Tế bào cơ'), settle: 2600 },
  { name: 'library-neuron', at: '#thu-vien', run: OPEN('Sinh học', 'Tế bào thần kinh'), settle: 2600 },
  { name: 'library-gram', at: '#thu-vien', run: OPEN('Sinh học', 'Vách tế bào Gram dương'), settle: 3000 },
  { name: 'library-periodic', at: '#thu-vien', run: OPEN('Hóa học', 'Bảng tuần hoàn'), settle: 1800 },
  { name: 'library-water', at: '#thu-vien', run: OPEN('Hóa học', 'Nước'), settle: 2400 },
  { name: 'library-methane', at: '#thu-vien', run: OPEN('Hóa học', 'Methane'), settle: 2400 },
  { name: 'library-nacl', at: '#thu-vien', run: OPEN('Hóa học', 'Muối ăn'), settle: 2400 },
  { name: 'library-caffeine', at: '#thu-vien', run: OPEN('Hóa học', 'Caffeine'), settle: 2400 },
  { name: 'library-projectile', at: '#thu-vien', run: OPEN('Vật lý', 'Chuyển động ném'), settle: 1600 },
  { name: 'library-incline', at: '#thu-vien', run: OPEN('Vật lý', 'Mặt phẳng nghiêng'), settle: 1600 },
  { name: 'library-wave', at: '#thu-vien', run: OPEN('Vật lý', 'Sóng cơ'), settle: 1600 },
  { name: 'library-circuit', at: '#thu-vien', run: OPEN('Vật lý', 'Mạch điện một chiều'), settle: 1600 },
  { name: 'library-globe', at: '#thu-vien', run: OPEN('Địa lý', 'Địa cầu tương tác'), settle: 3000 },
  { name: 'library-earth', at: '#thu-vien', run: OPEN('Địa lý', 'Cấu tạo Trái Đất'), settle: 1400 },
  { name: 'library-formula', at: '#thu-vien', run: OPEN('KHCN', 'Xưởng mô hình xe đua'), settle: 4200 },
  { name: 'library-toolkit', at: '#thu-vien', run: OPEN('KHCN', 'Bộ dụng cụ mô hình'), settle: 3000 },
  {
    // A second tool, because the bench renders one mesh at a time and the eight
    // of them do not share a material any more: the ruler proves the plastic
    // path, the scissors prove the steel one.
    name: 'library-toolkit-steel',
    at: '#thu-vien',
    run: `${OPEN('KHCN', 'Bộ dụng cụ mô hình')}
      await new Promise((r) => setTimeout(r, 700));
      const tool = [...document.querySelectorAll('.toolkit-chip')]
        .find((node) => node.textContent.trim().startsWith('Kéo'));
      if (!tool) throw new Error('tool not found: Kéo');
      tool.click();`,
    settle: 2600,
  },
  { name: 'library-empty', at: '#thu-vien', run: OPEN('Khoa học vũ trụ'), settle: 900 },
  { name: 'practice', at: '#thuc-hanh', settle: 1400 },
  { name: 'education', at: '#giao-duc', settle: 3600 },
  { name: 'proof', at: '#bai-hoc-mau', settle: 2200 },
  { name: 'cta', at: '#bat-dau-voi-yoolab' },
];

/* ---------------------------------------------------------------- CDP client --- */

function frame(payload) {
  const data = Buffer.from(payload, 'utf8');
  const mask = Buffer.alloc(4);
  mask.writeUInt32BE((Math.random() * 0xffffffff) >>> 0, 0);
  let header;
  if (data.length < 126) {
    header = Buffer.from([0x81, 0x80 | data.length]);
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  const masked = Buffer.alloc(data.length);
  for (let index = 0; index < data.length; index += 1) masked[index] = data[index] ^ mask[index % 4];
  return Buffer.concat([header, mask, masked]);
}

/** Minimal client-side WebSocket over a raw socket. Text frames only, which is
 *  all CDP uses, and no extensions are negotiated so no frame is ever
 *  compressed. */
function connect(url) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const key = createHash('sha1').update(String(Math.random())).digest('base64');
    const socket = net.connect(Number(target.port), target.hostname, () => {
      socket.write(
        `GET ${target.pathname}${target.search} HTTP/1.1\r\n` +
        `Host: ${target.host}\r\n` +
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
      // Unpick server frames. The server never masks, so payloads are literal.
      for (;;) {
        if (buffer.length < 2) return;
        const length1 = buffer[1] & 0x7f;
        let offset = 2;
        let length = length1;
        if (length1 === 126) {
          if (buffer.length < 4) return;
          length = buffer.readUInt16BE(2);
          offset = 4;
        } else if (length1 === 127) {
          if (buffer.length < 10) return;
          length = Number(buffer.readBigUInt64BE(2));
          offset = 10;
        }
        if (buffer.length < offset + length) return;
        const payload = buffer.subarray(offset, offset + length).toString('utf8');
        buffer = buffer.subarray(offset + length);
        let message;
        try { message = JSON.parse(payload); } catch { continue; }
        const waiting = message.id !== undefined ? handlers.get(message.id) : undefined;
        if (!waiting) continue;
        handlers.delete(message.id);
        if (message.error) waiting.fail(new Error(`${message.error.message} (${message.method ?? ''})`));
        else waiting.ok(message.result);
      }
    });
  });
}

function getJson(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    }).on('error', reject);
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---------------------------------------------------------------------- run --- */

const args = process.argv.slice(2);
const readFlag = (flag, fallback) => {
  const index = args.indexOf(flag);
  if (index < 0) return fallback;
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
};

const url = readFlag('--url', 'http://localhost:3000');
const outDir = readFlag('--out', 'reference-audit/shots');
const viewportKey = readFlag('--viewport', 'w1512');
const only = args.filter((value) => !value.startsWith('-'));

const viewport = VIEWPORTS[viewportKey];
if (!viewport) {
  console.error(`Unknown viewport "${viewportKey}". Known: ${Object.keys(VIEWPORTS).join(', ')}`);
  process.exit(1);
}

const chrome = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!chrome) {
  console.error('No Chrome or Edge found. Edit CHROME_CANDIDATES.');
  process.exit(1);
}

const profile = join(tmpdir(), `yoolab-shots-${process.pid}`);
mkdirSync(outDir, { recursive: true });

/*
 * Headed, but parked far off screen.
 *
 * `--headless=new` renders WebGL through SwiftShader, which is both very slow
 * and visibly different from a GPU — wrong tone mapping on the transmissive
 * materials, and the bee's refraction pass costs seconds a frame. A real window
 * at -32000,-32000 is composited by the real GPU and is never seen by anyone.
 */
const port = 9333 + (process.pid % 400);
const child = spawn(chrome, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  `--window-size=${viewport.width},${viewport.height}`,
  '--window-position=-32000,-32000',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=Translate,MediaRouter',
  '--force-device-scale-factor=1',
  '--hide-scrollbars',
  '--mute-audio',
  'about:blank',
], { stdio: 'ignore', detached: false });

const failures = [];

try {
  // Chrome writes its debugging endpoint only once the browser is up.
  let targets = null;
  for (let attempt = 0; attempt < 60 && !targets; attempt += 1) {
    await wait(250);
    try { targets = await getJson(port, '/json/list'); } catch { /* not yet */ }
  }
  if (!targets) throw new Error('Chrome did not open a debugging port');

  const browserInfo = await getJson(port, '/json/version');
  const browser = await connect(browserInfo.webSocketDebuggerUrl);
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });

  const send = (method, params) => browser.send(method, params, sessionId);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.width < 700,
  });

  const evaluate = async (expression) => {
    /*
     * The promise is parked on `window` before it is awaited.
     *
     * `Runtime.evaluate` with `awaitPromise` occasionally failed with "Promise was
     * collected" on the longer scripts — the ones that click a subject, wait, click
     * a row and wait again. A promise referenced only by the microtask queue can be
     * garbage-collected mid-await, and the harness then reported a failure for a
     * shot whose page was perfectly fine. A global is a strong reference, so it
     * cannot be.
     */
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

  /*
   * Collect everything the page complains about, into the page itself.
   *
   * A blank WebGL panel is the failure mode this harness exists to catch, and a
   * blank panel looks identical whether the model 404'd, a shader failed to
   * compile, or the camera fit put the eye inside the subject. The console says
   * which. Patching `console.error` from an on-new-document script rather than
   * subscribing to CDP events keeps this file to one request/response pattern.
   */
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
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
    `,
  });

  await send('Page.navigate', { url });
  // Wait for the document plus a beat for hydration: every stage mounts from an
  // effect, so a capture before hydration is a capture of empty panels.
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await wait(250);
    const ready = await evaluate('return document.readyState === "complete" && !!document.querySelector(".library-app");');
    if (ready) break;
  }
  await wait(1500);

  const list = only.length ? SHOTS.filter((shot) => only.includes(shot.name)) : SHOTS;
  for (const shot of list) {
    try {
      /* A growth shot is a burst timed from the canvas's own mount, so it takes
         the reload path and skips everything below. */
      if (shot.growth) {
        await send('Page.reload', { ignoreCache: false });
        for (let attempt = 0; attempt < 150; attempt += 1) {
          const up = await evaluate('return !!document.querySelector(".explore-canvas canvas");');
          if (up) break;
          await wait(60);
        }
        const started = Date.now();
        for (const offset of shot.growth) {
          const remaining = offset - (Date.now() - started);
          if (remaining > 0) await wait(remaining);
          const burst = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
          const path = join(outDir, `${viewportKey}-${shot.name}-${offset}.png`);
          writeFileSync(path, Buffer.from(burst.data, 'base64'));
          console.log(path);
        }
        continue;
      }

      // Jump rather than smooth-scroll: a capture mid-animation is a capture of
      // a section sliding past.
      await evaluate(`
        const target = document.querySelector(${JSON.stringify(shot.at)});
        if (!target) throw new Error('no section ' + ${JSON.stringify(shot.at)});
        const previous = document.documentElement.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = 'auto';
        target.scrollIntoView({ block: 'start', behavior: 'auto' });
        document.documentElement.style.scrollBehavior = previous;
        await new Promise((r) => setTimeout(r, 400));
      `);
      if (shot.run) await evaluate(shot.run);

      /*
       * Wait for readiness, then settle — not settle and hope.
       *
       * A fixed delay is the wrong tool for a WebGL panel. The bee is a 2.6 MB
       * rigged mesh with two texture sets and a two-pass refraction shader, and
       * it is fetched while the thumbnail baker is fetching the same file for the
       * rail and the hero stage is fetching it for the scroll story. Shot first
       * in a run it needs about five seconds; shot after the hero it is already
       * warm and needs none. A 3.4 s settle captured a *blank panel* and the run
       * reported success — exactly the kind of false pass a screenshot harness
       * exists to prevent.
       *
       * So: poll until no stage in the viewer is still showing its loading
       * block, then spend `settle` on the animation actually reaching a
       * representative frame — the camera easing in, a wingbeat, a spin.
       */
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const loading = await evaluate(`
          const stage = document.querySelector('.library-viewer-stage');
          const staging = stage
            ? !!stage.querySelector('.stage-status:not(.is-error), .model-stage-status:not(.is-error)')
            : false;
          /*
           * Also wait on the thumbnail baker. Its queue is serialised and one
           * bee costs seconds, so a section whose only picture is a bake — the
           * studio mock, the education roles, the proof row — was being captured
           * with an empty box in it and the run reported success.
           */
          /*
           * And on the hero canvas, which has its own loader and is not a
           * library viewer stage. A 1024 capture of the hero came back with
           * "Đang mở phòng thí nghiệm 3D…" still on screen, an empty stage and no
           * botanical field — and the run reported success, which is the exact
           * false pass this loop exists to prevent.
           */
          const hero = document.querySelector('.explore-canvas .visual-loader');
          const heroLoading = !!hero && getComputedStyle(hero).opacity !== '0';

          const pending = [...document.querySelectorAll('.model-thumbnail')]
            .filter((node) => {
              const rect = node.getBoundingClientRect();
              const onScreen = rect.bottom > 0 && rect.top < innerHeight && rect.width > 0;
              return onScreen && !node.querySelector('img');
            });
          return staging || heroLoading || pending.length > 0;
        `);
        if (!loading) break;
        await wait(400);
      }
      await wait(shot.settle ?? 1100);

      /*
       * `clip` asks the compositor for a magnified crop instead of the frame.
       *
       * A 1920 screenshot resamples a 40 px flower down to something like a dozen
       * legible pixels, which is enough to judge a composition and not nearly
       * enough to judge a silhouette — "does this petal read as grown or as a
       * vector icon" is invisible at frame scale. Chrome will rasterise a region
       * at any scale, so a 4× crop of one bank answers it for one extra capture.
       */
      const capture = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
        ...(shot.clip ? { clip: { ...shot.clip, scale: shot.clip.scale ?? 3 } } : {}),
      });
      const file = join(outDir, `${viewportKey}-${shot.name}.png`);
      writeFileSync(file, Buffer.from(capture.data, 'base64'));

      // Overflow and geometry are cheap to measure while we are here, and they
      // are the two things a screenshot is worst at proving.
      const metrics = await evaluate(`
        const doc = document.documentElement;
        return {
          overflowX: doc.scrollWidth - doc.clientWidth,
          scrollY: Math.round(window.scrollY),
        };
      `);
      const errors = await evaluate('const list = window.__shotErrors ?? []; window.__shotErrors = []; return list;');
      console.log(`${file}  overflowX=${metrics.overflowX}${errors.length ? `  errors=${errors.length}` : ''}`);
      for (const line of errors) console.log(`      ! ${line}`);
      if (metrics.overflowX > 1) failures.push(`${shot.name}: horizontal overflow ${metrics.overflowX}px`);
      for (const line of errors) failures.push(`${shot.name}: ${line}`);
    } catch (error) {
      failures.push(`${shot.name}: ${error.message}`);
      console.error(`FAILED ${shot.name}: ${error.message}`);
    }
  }

  browser.close();
} finally {
  child.kill();
  await wait(400);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* windows lock */ }
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const line of failures) console.error(` - ${line}`);
  process.exit(1);
}
