
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import net from 'node:net';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

const VIEWPORTS = {
  w1920: [1920, 1080],
  w1512: [1512, 982],
  w1440: [1440, 900],
  w1366: [1366, 768],
  /* iPad landscape: the untested gap between 1024 and 1366, plus the 1024
     class itself (iPad mini / iPad 9 in landscape). */
  w1298: [1298, 970],
  w1194: [1194, 834],
  w1024: [1024, 768],
  w768: [768, 1024],
  w390: [390, 844],
};


/* ------------------------------------------------------------- CDP plumbing --- */

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
    let buffer = Buffer.alloc(0);
    let upgraded = false;
    const handlers = new Map();
    const events = new Set();
    let nextId = 1;
    const api = {
      on(listener) { events.add(listener); return () => events.delete(listener); },
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
        if (message.id === undefined) {
          /* A CDP EVENT. These were being parsed and then dropped, which is why
             this harness could report "nothing rendered" without being able to
             say why: every console error and every uncaught exception on the
             page was invisible to it. */
          for (const listener of events) listener(message);
          continue;
        }
        const waiting = handlers.get(message.id);
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

/* ------------------------------------------------------------------ probe --- */
/*
 * `probe.mjs` — evaluate an arbitrary expression in the real page.
 *
 * `measure.mjs` answers a fixed set of questions; this answers a new one. Point
 * it at a file of JavaScript, give it a viewport, and it prints whatever that
 * file returns. Used while diagnosing a layout fault, not in CI.
 *
 *   node reference-audit/probe.mjs <script.mjs-ish> [--viewport w1366] [--url ...] [--dpr 2] [--handheld]
 */
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  const value = argv[index + 1];
  argv.splice(index, 2);
  return value;
};
const url = flag('--url', 'http://localhost:3000');
const key = flag('--viewport', 'w1366');
/* `--reduced` emulates `prefers-reduced-motion: reduce`. The only way to check a
   reduced-motion path is in a browser that claims it, and Chrome will not take it
   from a command-line flag reliably — CDP's media emulation will. */
const reduced = argv.includes('--reduced');
if (reduced) argv.splice(argv.indexOf('--reduced'), 1);
/*
 * `--dpr 2`, because half this project's performance questions are retina
 * questions and this harness could not ask one.
 *
 * Every pixel-ratio ceiling in `app/lib/three/deviceTier.ts` is a `Math.min`
 * against `devicePixelRatio`, so on the 1x display this harness was pinned to,
 * every one of them is inert and a capture proves nothing about the machines
 * that were reported as stuttering. The flag drives both Chrome's own scale
 * factor and CDP's metrics override; they have to agree or the page reports one
 * ratio and renders at the other.
 */
const dpr = Number(flag('--dpr', '1')) || 1;
/*
 * `--handheld`, because `mobile: true` is not what the site actually tests for.
 *
 * `Emulation.setDeviceMetricsOverride({ mobile: true })` changes the viewport
 * and the user-agent hints; it does NOT change the `hover` and `pointer` media
 * features. `app/layout.tsx` and `app/lib/three/deviceTier.ts` both branch on
 * `(hover: none) and (pointer: coarse)` — the only reliable way to tell a tablet
 * from the laptop iPadOS claims to be — so without emulating those two features
 * a 390 px capture takes the DESKTOP branch and the phone budget goes untested.
 * That is exactly the kind of gap that ships.
 */
const handheld = argv.includes('--handheld');
if (handheld) argv.splice(argv.indexOf('--handheld'), 1);
const file = argv[0];
if (!file) { console.error('usage: probe.mjs <file> [--viewport w1366]'); process.exit(1); }
const source = readFileSync(file, 'utf8');
const [width, height] = VIEWPORTS[key];

const chrome = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!chrome) { console.error('No Chrome or Edge found.'); process.exit(1); }
const profile = join(tmpdir(), `yoolab-probe-${process.pid}`);
mkdirSync(profile, { recursive: true });
const port = 9600 + (process.pid % 150);
const child = spawn(chrome, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  `--window-size=${width},${height}`,
  '--window-position=-32000,-32000',
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  /*
   * Anti-occlusion. Without these, half the numbers this harness prints are lies.
   *
   * The window is deliberately off-screen at -32000,-32000 so a capture run does
   * not steal the desktop. Chrome's native occlusion tracking notices that the
   * window is not visible and backgrounds the renderer, at which point
   * `requestAnimationFrame` drops to about 1 Hz — and a frame-time census then
   * reports a 60 fps page as a 1 fps page with 1,000 ms frames. It is
   * intermittent, because whether the window is judged occluded depends on what
   * else is on the desktop, which is exactly what makes it dangerous: a run
   * looks like a catastrophic regression and re-running it "fixes" the code.
   *
   * Three separate mechanisms have to be turned off, because they throttle for
   * three different reasons: native occlusion detection, renderer backgrounding
   * and background timer throttling.
   */
  '--disable-features=CalculateNativeWinOcclusion',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  `--force-device-scale-factor=${dpr}`, '--mute-audio', 'about:blank',
], { stdio: 'ignore' });

try {
  let ready = null;
  for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
    await wait(250);
    try { ready = await getJson(port, '/json/version'); } catch { /* not yet */ }
  }
  if (!ready) throw new Error('Chrome did not open a debugging port');
  const browser = await connect(ready.webSocketDebuggerUrl);
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => browser.send(method, params, sessionId);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable').catch(() => {});
  /*
   * Everything the page complained about.
   *
   * Printed alongside the probe's own result rather than instead of it: a probe
   * that returns `{ canvases: [] }` and says nothing else is indistinguishable
   * from a page that legitimately has no canvases, and the difference is usually
   * one uncaught exception during hydration.
   */
  const pageLog = [];
  browser.on((message) => {
    if (message.sessionId && message.sessionId !== sessionId) return;
    const { method, params } = message;
    if (method === 'Runtime.exceptionThrown') {
      const detail = params?.exceptionDetails;
      pageLog.push(`EXCEPTION ${detail?.exception?.description ?? detail?.text ?? 'unknown'}`);
    } else if (method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(params?.type)) {
      const text = (params.args ?? [])
        .map((arg) => arg.description ?? (arg.value !== undefined ? String(arg.value) : arg.type))
        .join(' ');
      pageLog.push(`${String(params.type).toUpperCase()} ${text}`);
    } else if (method === 'Log.entryAdded' && params?.entry?.level === 'error') {
      pageLog.push(`LOG ${params.entry.text}`);
    }
  });
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: dpr, mobile: width < 700,
  });
  const features = [];
  if (reduced) features.push({ name: 'prefers-reduced-motion', value: 'reduce' });
  if (handheld) features.push({ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' });
  if (features.length) await send('Emulation.setEmulatedMedia', { features });
  if (handheld) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await wait(250);
    const done = await send('Runtime.evaluate', {
      expression: 'document.readyState === "complete" && !!document.querySelector(".library-app")',
      returnByValue: true,
    });
    if (done.result?.value) break;
  }
  await wait(1400);
  const result = await send('Runtime.evaluate', {
    expression: `(window.__probe = (async () => { ${source} })())`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    console.error(result.exceptionDetails.exception?.description ?? 'eval failed');
  } else {
    console.log(JSON.stringify(result.result?.value, null, 2));
  }
  if (pageLog.length) {
    console.error(`
--- page reported ${pageLog.length} problem(s) ---`);
    for (const line of pageLog.slice(0, 12)) console.error(line.slice(0, 700));
  }
  browser.close();
} finally {
  child.kill();
  await wait(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* windows lock */ }
}
