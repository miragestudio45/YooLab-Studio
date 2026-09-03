/**
 * Layout probe.
 *
 * The companion to `shots.mjs`: same off-screen Chrome, but instead of a PNG it
 * returns numbers. A screenshot shows that a section does not fit; this says by
 * how many pixels and which element is doing it, at every viewport in one run.
 *
 * Usage:
 *   node reference-audit/measure.mjs [--url http://localhost:3000] [--viewport w1512 ...]
 */

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
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
  w1024: [1024, 768],
  w768: [768, 1024],
  w390: [390, 844],
};

/**
 * The sections that must compose inside the viewport when you land on them.
 *
 * "Fits" is not the same as "is shorter than the screen": a section may be
 * deliberately taller than one screen (the tool section, the proof grid) and
 * still have to reveal its main idea on arrival. So each entry names the block
 * that has to be whole — for the Library that is the app shell, not the section —
 * and the probe reports where that block's bottom edge lands.
 */
const TARGETS = [
  /*
   * `fitAbove` is the width above which a section promises to compose in one
   * viewport. Below it the section deliberately stacks and scrolls, and a report
   * of "CUT" would be the probe describing the design as a defect.
   *
   * The phone regime (700) is where two-up diagrams, a four-panel editor and a
   * four-card row all stop being one-screen propositions — squeezing them in
   * would mean 9 px type and thumbnail-sized evidence. The tablet regime (1000)
   * is where the two-column sections stack.
   */
  { id: 'tu-kham-pha-den-tao', must: '.bridge-layout', label: 'Bridge layout', fitAbove: 860 },
  { id: 'cong-cu', must: '.studio', label: 'YooStudio editor', fitAbove: 700 },
  { id: 'thu-vien', must: '.library-app', label: 'Library workspace' },
  { id: 'thuc-hanh', must: '.practice-grid', label: 'Practice grid', fitAbove: 1000 },
  /*
   * `fitAbove` is where a section stops promising to compose in one viewport.
   *
   * Education is a heading, a three-way switch, a five-point list, a call to
   * action and a full-size product shot. On a landscape laptop those fit beside
   * each other; on a 768×1024 tablet or a phone they stack, and the only way to
   * make the stack fit would be to shrink the product shot to a thumbnail —
   * which would cost the section the evidence it exists to show. Below 1000 px
   * the composition is deliberately the first screen (heading, switch, the
   * role's claim and lede) with the list and the shot following, so a report of
   * "CUT" there would be the probe describing the design as a defect.
   */
  /* 1180, not 1000. The section's product became a five-region application that
     needs 64% of the shell, which leaves its brief column too narrow to fit a
     five-row list at 1024. See the note in `sections.css` and the table in
     KNOWN_LIMITATIONS.md. */
  { id: 'giao-duc', must: '.education-panel', label: 'Education panel', fitAbove: 1180 },
  { id: 'bai-hoc-mau', must: '.proof-grid', label: 'Proof row', fitAbove: 700 },
  { id: 'bat-dau-voi-yoolab', must: '.final-cta > div:last-child', label: 'CTA actions' },
];

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
const keys = args.filter((value) => VIEWPORTS[value]);
const list = keys.length ? keys : Object.keys(VIEWPORTS);

const chrome = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!chrome) { console.error('No Chrome or Edge found.'); process.exit(1); }

const profile = join(tmpdir(), `yoolab-measure-${process.pid}`);
mkdirSync(profile, { recursive: true });
const port = 9800 + (process.pid % 150);

const child = spawn(chrome, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--window-size=1920,1080',
  '--window-position=-32000,-32000',
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--force-device-scale-factor=1', '--mute-audio',
  'about:blank',
], { stdio: 'ignore' });

const problems = [];

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

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression: `(window.__probe = (async () => { ${expression} })())`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'eval failed');
    return result.result?.value;
  };

  for (const key of list) {
    const [width, height] = VIEWPORTS[key];
    await send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: width < 700,
    });
    await send('Page.navigate', { url });
    for (let attempt = 0; attempt < 80; attempt += 1) {
      await wait(250);
      const done = await evaluate('return document.readyState === "complete" && !!document.querySelector(".library-app");');
      if (done) break;
    }
    await wait(1200);

    const report = await evaluate(`
      const out = { viewport: [innerWidth, innerHeight], sections: [], overflow: [] };
      /*
       * Disarm the scroll reveal before measuring anything.
       *
       * Removing the class is what globals.css keys the "everything is visible,
       * no transition" fallback off, so every data-reveal block is at opacity 1
       * with no transform from this point on. Waiting for the animation instead
       * was a race the probe kept losing: getBoundingClientRect includes
       * transforms, so a block still 20 px into its rise reported an 8 px overrun
       * on a section that has 12 px of clearance. A layout probe that reads a
       * transform invents defects.
       */
      document.documentElement.classList.remove('reveal-ready');
      const targets = ${JSON.stringify(TARGETS)};
      const style = getComputedStyle(document.documentElement);
      out.tokens = {
        headerH: style.getPropertyValue('--header-h').trim(),
        safeTop: style.getPropertyValue('--safe-top').trim(),
        safeGap: style.getPropertyValue('--safe-gap').trim(),
      };
      for (const target of targets) {
        const section = document.getElementById(target.id);
        if (!section) { out.sections.push({ id: target.id, missing: true }); continue; }
        const previous = document.documentElement.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = 'auto';
        section.scrollIntoView({ block: 'start', behavior: 'auto' });
        document.documentElement.style.scrollBehavior = previous;
        await new Promise((r) => setTimeout(r, 260));
        const must = document.querySelector(target.must);
        const rect = must ? must.getBoundingClientRect() : null;
        const first = section.querySelector('h2, h1');
        out.sections.push({
          id: target.id,
          label: target.label,
          sectionTop: Math.round(section.getBoundingClientRect().top),
          headingTop: first ? Math.round(first.getBoundingClientRect().top) : null,
          mustTop: rect ? Math.round(rect.top) : null,
          mustBottom: rect ? Math.round(rect.bottom) : null,
          mustHeight: rect ? Math.round(rect.height) : null,
          /* Negative = that many pixels of the block are below the fold. */
          slack: rect ? Math.round(innerHeight - rect.bottom) : null,
          /* Does the header cover the first thing in the section? */
          underHeader: first
            ? Math.round(first.getBoundingClientRect().top)
              < parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h'))
            : null,
        });
      }
      /*
       * The alignment lines, as one number.
       *
       * This is the whole "many grids" question in a single measurement: the
       * header's inner shell, a cinematic chapter's copy column, the product
       * workspaces, the editorial sections and the footer must all start on the
       * same x. Reported as a spread, so a regression is a non-zero value rather
       * than something somebody has to notice in a screenshot.
       */
      const edges = {};
      for (const [name, selector] of [
        ['header', '.site-header-inner'],
        ['story', '.story-grid'],
        ['studio', '.tool-section > .shell'],
        ['library', '.library-head'],
        ['practice', '.practice .shell-editorial'],
        ['proof', '.proof .shell-editorial'],
        ['footer', '.site-footer'],
      ]) {
        const node = document.querySelector(selector);
        if (!node) continue;
        const box = node.getBoundingClientRect();
        /* The footer paints edge to edge and insets its content with padding
           rather than with a wrapper, so its content edge is the one to compare. */
        const pad = name === 'footer' ? parseFloat(getComputedStyle(node).paddingLeft) : 0;
        edges[name] = Math.round(box.left + pad);
      }
      const edgeValues = Object.values(edges);
      out.edges = edges;
      out.edgeSpread = edgeValues.length ? Math.max(...edgeValues) - Math.min(...edgeValues) : 0;

      /* Anything wider than the document. The usual suspects are a fixed-width
         grid child and an unclamped canvas. */
      const doc = document.documentElement;
      out.overflowX = doc.scrollWidth - doc.clientWidth;
      if (out.overflowX > 1) {
        for (const node of document.querySelectorAll('body *')) {
          const box = node.getBoundingClientRect();
          if (box.width > 0 && box.right > doc.clientWidth + 2) {
            out.overflow.push({
              tag: node.tagName.toLowerCase(),
              cls: (node.className || '').toString().slice(0, 60),
              right: Math.round(box.right),
              width: Math.round(box.width),
            });
            if (out.overflow.length > 6) break;
          }
        }
      }
      return out;
    `);

    console.log(`\n=== ${key}  ${report.viewport[0]}x${report.viewport[1]}  header=${report.tokens.headerH} gap=${report.tokens.safeGap}`);
    console.log(`  edges ${Object.entries(report.edges).map(([k, v]) => `${k}=${v}`).join(' ')}  spread=${report.edgeSpread}px`);
    if (report.edgeSpread > 1) problems.push(`${key}: shell edges disagree by ${report.edgeSpread}px`);
    if (report.overflowX > 1) {
      console.log(`  ! horizontal overflow ${report.overflowX}px`);
      for (const item of report.overflow) console.log(`      ${item.tag}.${item.cls} right=${item.right} w=${item.width}`);
      problems.push(`${key}: overflowX ${report.overflowX}px`);
    }
    for (const section of report.sections) {
      if (section.missing) { console.log(`  #${section.id}  MISSING`); continue; }
      const target = TARGETS.find((entry) => entry.id === section.id);
      const asserts = !target?.fitAbove || report.viewport[0] >= target.fitAbove;
      const flags = [];
      if (section.slack !== null && section.slack < 0) flags.push(`${asserts ? 'CUT' : 'scrolls'} ${-section.slack}px`);
      if (section.underHeader) flags.push('HEADING UNDER HEADER');
      if (!asserts) flags.length = Math.min(flags.length, 1);
      console.log(
        `  #${section.id.padEnd(11)} ${String(section.label).padEnd(18)}` +
        ` head@${String(section.headingTop).padStart(4)}` +
        ` block ${String(section.mustTop).padStart(4)}→${String(section.mustBottom).padStart(4)}` +
        ` (h=${String(section.mustHeight).padStart(4)})` +
        ` slack=${String(section.slack).padStart(5)}  ${flags.join(' ')}`,
      );
      if (asserts) for (const flag of flags) problems.push(`${key} #${section.id}: ${flag}`);
      else if (section.underHeader) problems.push(`${key} #${section.id}: HEADING UNDER HEADER`);
    }
  }
  browser.close();
} finally {
  child.kill();
  await wait(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* windows lock */ }
}

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const line of problems) console.log(` - ${line}`);
}
