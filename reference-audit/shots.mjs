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

/**
 * Selects one of the three practice labs by the start of its rail title, then
 * waits for its stage to exist.
 *
 * The two adapted labs are code-split, so selecting one is a chunk fetch, a
 * 320 ms crossfade and a mount — a fixed sleep raced all three and intermittently
 * handed the shot a Suspense fallback with no `.lab` in it at all.
 */
const PRACTICE = (title, selector) => `
  {
  const rail = [...document.querySelectorAll('.practice-rail-item')]
    .find((node) => node.textContent.includes(${JSON.stringify(title)}));
  if (!rail) throw new Error('practice lab not found: ' + ${JSON.stringify(title)});
  rail.click();
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (document.querySelector(${JSON.stringify(selector)})) break;
    await new Promise((r) => setTimeout(r, 120));
  }
  if (!document.querySelector(${JSON.stringify(selector)})) {
    throw new Error('practice lab never mounted: ' + ${JSON.stringify(selector)});
  }
  /*
   * Then press the lab's own "Làm lại".
   *
   * The harness navigates once and runs every shot against that one document,
   * so a lab is whatever the shot before it left behind — armed, mid-course,
   * finished, or a different lab entirely. Four shots that each passed alone
   * failed as a suite for exactly that reason, and the failures looked like
   * missing buttons rather than like stale state. Resetting through the visible
   * control is also the honest way to do it: if "Làm lại" ever stops actually
   * resetting a lab, every shot after it starts failing.
   */
  const restart = [...document.querySelectorAll('.lab-actions .lab-button')]
    .find((node) => node.textContent.includes('Làm lại'));
  if (restart) restart.click();
  await new Promise((r) => setTimeout(r, 1100));
  }
`;

/**
 * Waits for a lab action button to exist, then returns it.
 *
 * Every practice shot used to assume its lab was interactive by the time the
 * script ran, which held right up until the whole suite was run in one browser
 * session: eleven GLBs, three WebGL contexts and a dev server compiling on
 * demand make "ready" a range rather than a moment, and four shots that each
 * passed alone failed together. Polling costs nothing when the button is
 * already there.
 */
const ACTION = (text) => `
  const findAction = (label) => [...document.querySelectorAll('.lab-actions .lab-button')]
    .find((node) => node.textContent.includes(label));
  let action = null;
  for (let attempt = 0; attempt < 120 && !action; attempt += 1) {
    action = findAction(${JSON.stringify(text)});
    if (!action) await new Promise((r) => setTimeout(r, 200));
  }
  if (!action) throw new Error('practice: no action ' + ${JSON.stringify(text)});
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
  /*
   * Five magnified crops of the editor, for judging it against the Figma frame
   * rather than against a memory of it. A 1920 shot of this section renders the
   * whole editor at about 48% of the source frame's scale, which is small enough
   * that a wrong icon, a 4 px radius or a stretched glyph is invisible — and
   * every round of "chưa giống Figma" notes has been about exactly those. The
   * clips are in CSS pixels at w1920 and are only meaningful at that viewport.
   */
  { name: 'studio-rail', at: '#cong-cu', settle: 2000, clipOf: { sel: '.studio-main-rail', scale: 3.2 } },
  { name: 'studio-topbar', at: '#cong-cu', settle: 2000, clipOf: { sel: '.studio-topbar', scale: 3 } },
  { name: 'studio-canvas-chrome', at: '#cong-cu', settle: 2400, clipOf: { sel: '.studio-canvas', inset: [0, 0, 380, 0], scale: 2.4 } },
  { name: 'studio-timeline-detail', at: '#cong-cu', settle: 2000, clipOf: { sel: '.studio-timeline', scale: 2.4 } },
  { name: 'studio-props', at: '#cong-cu', settle: 2000, clipOf: { sel: '.studio-properties', scale: 2.6 } },
  /*
   * The inspector's right edge, mid-scroll. It must stay empty: this panel
   * deliberately shows no scrollbar and no indicator of any kind, and the two
   * previous rounds of an OS trough leaking through were only ever caught by
   * looking at this strip. Use w1366, where the panel actually overflows.
   */
  {
    name: 'studio-props-edge',
    at: '#cong-cu',
    settle: 1800,
    run: `
      const panel = document.querySelector('.studio-properties');
      panel.scrollTop = Math.round((panel.scrollHeight - panel.clientHeight) * 0.35);
      await new Promise((r) => setTimeout(r, 320));
    `,
    clipOf: { sel: '.studio-properties', fromRight: 26, scale: 6 },
  },
  { name: 'studio-detail-rail', at: '#cong-cu', settle: 2000, clipOf: { sel: '.studio-detail-rail', scale: 3.2 } },
  { name: 'studio-story', at: '#cong-cu', settle: 2000, clipOf: { sel: '.tool-story', scale: 2.4 } },
  { name: 'studio-head', at: '#cong-cu', settle: 1400, clipOf: { sel: '.tool-heading', scale: 2.2 } },
  /*
   * The three spaces, each with the car in its own state and the timeline holding
   * that state's own score. This is the pair of shots that proves the review note
   * "space 1 2 3 chỗ timeline tương ứng với từng anim của car" — a still of the
   * default space cannot, because all three look identical until one is clicked.
   */
  { name: 'studio-space-2', at: '#cong-cu', settle: 2600, run: `[...document.querySelectorAll('.studio-spaces > button')][1].click();` },
  { name: 'studio-space-3', at: '#cong-cu', settle: 3200, run: `[...document.querySelectorAll('.studio-spaces > button')][2].click();` },
  /*
   * The T-rex is the Library's default selection, so this shot takes no `run` —
   * it photographs what a visitor actually lands on. 4.6 s of settle because the
   * shot has more to wait for than any other in this file: a 1.6 MB meshopt GLB,
   * four WebP textures pulled through the spec/gloss fallback, the `bite` clip
   * fading in, and six anatomy pins whose positions are only correct once the
   * skeleton has been evaluated at least one frame.
   */
  { name: 'library-trex', at: '#thu-vien', settle: 4600 },
  {
    /* One pin open. The rest of the pin machinery — projection, occlusion,
       tracking through the animation — is only judgeable with a card on screen. */
    name: 'library-trex-pin',
    at: '#thu-vien',
    run: `
      await new Promise((r) => setTimeout(r, 3200));
      const dots = [...document.querySelectorAll('.stage-pin-dot')];
      if (!dots.length) throw new Error('no anatomy pins rendered');
      const jaw = dots.find((node) => (node.getAttribute('aria-label') || '').startsWith('Hàm'));
      (jaw ?? dots[0]).click();
    `,
    settle: 2200,
  },
  {
    /*
     * The knowledge panel, scrolled past its own fold and magnified.
     *
     * The three faults this catches are all invisible in a full-page shot: the
     * measurement table's glyph column drifting out of line, a value long enough
     * to wrap and break the readout's alignment, and the two notes rendering in
     * the same tint — which is the one thing that would turn the whole block back
     * into a paragraph in a box.
     */
    name: 'library-panel',
    at: '#thu-vien',
    settle: 3200,
    run: `
      const panel = document.querySelector('.library-knowledge-scroll');
      panel.scrollTop = Math.round((panel.scrollHeight - panel.clientHeight) * 0.62);
      await new Promise((r) => setTimeout(r, 340));
    `,
    clipOf: { sel: '.library-knowledge', scale: 2.2 },
  },
  { name: 'library-bee', at: '#thu-vien', run: OPEN('Sinh học', 'Ong mật'), settle: 3400 },
  { name: 'library-fish', at: '#thu-vien', run: OPEN('Sinh học', 'Cá cảnh biển'), settle: 3200 },
  { name: 'library-jelly', at: '#thu-vien', run: OPEN('Sinh học', 'Sứa biển'), settle: 3200 },
  /*
   * The twelve Human Reference Atlas organs.
   *
   * Shot individually rather than sampled, because the fault this catches is
   * per-mesh and invisible in any one of them: the HRA set is authored at real
   * anatomical scale in a shared body-space, so the meshes arrive at wildly
   * different sizes AND wildly different distances from the origin — an eye is
   * 24 mm and sits off-axis in a skull, a colon is a half-metre frame. A global
   * camera cannot serve both, so each entry carries its own `fill`/`yaw`/`pitch`
   * and each one has to be looked at. The five named in the QA brief lead.
   */
  { name: 'library-organ-heart', at: '#thu-vien', run: OPEN('Sinh học', 'Tim'), settle: 2800 },
  { name: 'library-organ-brain', at: '#thu-vien', run: OPEN('Sinh học', 'Não'), settle: 2800 },
  { name: 'library-organ-lungs', at: '#thu-vien', run: OPEN('Sinh học', 'Phổi'), settle: 2800 },
  { name: 'library-organ-kidney', at: '#thu-vien', run: OPEN('Sinh học', 'Thận'), settle: 2800 },
  { name: 'library-organ-eye', at: '#thu-vien', run: OPEN('Sinh học', 'Mắt'), settle: 2800 },
  { name: 'library-organ-liver', at: '#thu-vien', run: OPEN('Sinh học', 'Gan'), settle: 2600 },
  { name: 'library-organ-gallbladder', at: '#thu-vien', run: OPEN('Sinh học', 'Túi mật'), settle: 2600 },
  { name: 'library-organ-pancreas', at: '#thu-vien', run: OPEN('Sinh học', 'Tuyến tụy'), settle: 2600 },
  { name: 'library-organ-ileum', at: '#thu-vien', run: OPEN('Sinh học', 'Hồi tràng'), settle: 2600 },
  { name: 'library-organ-colon', at: '#thu-vien', run: OPEN('Sinh học', 'Ruột già'), settle: 2600 },
  { name: 'library-organ-spleen', at: '#thu-vien', run: OPEN('Sinh học', 'Lách'), settle: 2600 },
  { name: 'library-organ-thymus', at: '#thu-vien', run: OPEN('Sinh học', 'Thùy tuyến ức trái'), settle: 2600 },
  /* The organ knowledge panel past its own fold, at the same magnification the
     `library-panel` shot uses — so the twelve new entries' readouts are judged
     by the same rule the existing ones were. */
  {
    name: 'library-organ-panel',
    at: '#thu-vien',
    run: `${OPEN('Sinh học', 'Tim')}
      await new Promise((r) => setTimeout(r, 900));
      const panel = document.querySelector('.library-knowledge-scroll');
      panel.scrollTop = Math.round((panel.scrollHeight - panel.clientHeight) * 0.55);
      await new Promise((r) => setTimeout(r, 340));`,
    settle: 1600,
    clipOf: { sel: '.library-knowledge', scale: 2.2 },
  },
  /* The rail scrolled to its middle, where the twelve organ marks sit, with the
     drawn indicator caught mid-move. This is the only shot that photographs the
     scroll thumb at full strength — it settles back after 720 ms. */
  {
    name: 'library-rail-thumb',
    at: '#thu-vien',
    run: `${OPEN('Sinh học')}
      const rail = document.querySelector('.library-rail-list');
      rail.scrollTop = Math.round((rail.scrollHeight - rail.clientHeight) * 0.45);
      rail.dispatchEvent(new Event('scroll'));
      await new Promise((r) => setTimeout(r, 200));`,
    settle: 0,
    clipOf: { sel: '.library-rail', scale: 2 },
  },
  { name: 'library-cell-animal', at: '#thu-vien', run: OPEN('Sinh học', 'Tế bào động vật'), settle: 2600 },
  { name: 'library-cell-plant', at: '#thu-vien', run: OPEN('Sinh học', 'Tế bào thực vật'), settle: 2600 },
  { name: 'library-cell-blood', at: '#thu-vien', run: OPEN('Sinh học', 'Bạch cầu'), settle: 2600 },
  { name: 'library-cell-epithelial', at: '#thu-vien', run: OPEN('Sinh học', 'Tế bào biểu mô'), settle: 2600 },
  { name: 'library-cell-muscle', at: '#thu-vien', run: OPEN('Sinh học', 'Tế bào cơ'), settle: 2600 },
  { name: 'library-neuron', at: '#thu-vien', run: OPEN('Sinh học', 'Tế bào thần kinh'), settle: 2600 },
  /* The prokaryote. Worth its own shot because it is the one cell whose whole
     point is what the scene does NOT contain — a blob in the middle would mean
     the nucleoid tube collapsed. */
  { name: 'library-cell-bacteria', at: '#thu-vien', run: OPEN('Sinh học', 'Tế bào vi khuẩn'), settle: 2800 },
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
  /*
   * All eight tools, not a sample.
   *
   * The bench renders one mesh at a time behind a chip row, so a single shot of
   * it proves one tool and hides seven. Six of the eight are long and thin and
   * each carries its own `fill`/`roll`, which is exactly the kind of per-item
   * setting that goes wrong quietly — the ruler and the pencil were spanning the
   * viewer corner to corner for months behind a shot list that only ever opened
   * the ruler.
   */
  {
    name: 'library-tool-ruler',
    at: '#thu-vien',
    run: `${OPEN('KHCN', 'Bộ dụng cụ mô hình')}
      await new Promise((r) => setTimeout(r, 700));
      const tool = [...document.querySelectorAll('.toolkit-chip')]
        .find((node) => node.textContent.trim().startsWith('Thước kẻ'));
      if (!tool) throw new Error('tool not found: ' + 'Thước kẻ');
      tool.click();`,
    settle: 2400,
  },
  {
    name: 'library-tool-pencil',
    at: '#thu-vien',
    run: `${OPEN('KHCN', 'Bộ dụng cụ mô hình')}
      await new Promise((r) => setTimeout(r, 700));
      const tool = [...document.querySelectorAll('.toolkit-chip')]
        .find((node) => node.textContent.trim().startsWith('Bút chì'));
      if (!tool) throw new Error('tool not found: ' + 'Bút chì');
      tool.click();`,
    settle: 2400,
  },
  {
    name: 'library-tool-eraser',
    at: '#thu-vien',
    run: `${OPEN('KHCN', 'Bộ dụng cụ mô hình')}
      await new Promise((r) => setTimeout(r, 700));
      const tool = [...document.querySelectorAll('.toolkit-chip')]
        .find((node) => node.textContent.trim().startsWith('Gôm'));
      if (!tool) throw new Error('tool not found: ' + 'Gôm');
      tool.click();`,
    settle: 2400,
  },
  {
    name: 'library-tool-scissor',
    at: '#thu-vien',
    run: `${OPEN('KHCN', 'Bộ dụng cụ mô hình')}
      await new Promise((r) => setTimeout(r, 700));
      const tool = [...document.querySelectorAll('.toolkit-chip')]
        .find((node) => node.textContent.trim().startsWith('Kéo'));
      if (!tool) throw new Error('tool not found: ' + 'Kéo');
      tool.click();`,
    settle: 2400,
  },
  {
    name: 'library-tool-boxcutter',
    at: '#thu-vien',
    run: `${OPEN('KHCN', 'Bộ dụng cụ mô hình')}
      await new Promise((r) => setTimeout(r, 700));
      const tool = [...document.querySelectorAll('.toolkit-chip')]
        .find((node) => node.textContent.trim().startsWith('Dao rọc giấy'));
      if (!tool) throw new Error('tool not found: ' + 'Dao rọc giấy');
      tool.click();`,
    settle: 2400,
  },
  {
    name: 'library-tool-mat',
    at: '#thu-vien',
    run: `${OPEN('KHCN', 'Bộ dụng cụ mô hình')}
      await new Promise((r) => setTimeout(r, 700));
      const tool = [...document.querySelectorAll('.toolkit-chip')]
        .find((node) => node.textContent.trim().startsWith('Thảm cắt'));
      if (!tool) throw new Error('tool not found: ' + 'Thảm cắt');
      tool.click();`,
    settle: 2400,
  },
  {
    name: 'library-tool-screwdriver',
    at: '#thu-vien',
    run: `${OPEN('KHCN', 'Bộ dụng cụ mô hình')}
      await new Promise((r) => setTimeout(r, 700));
      const tool = [...document.querySelectorAll('.toolkit-chip')]
        .find((node) => node.textContent.trim().startsWith('Tua vít'));
      if (!tool) throw new Error('tool not found: ' + 'Tua vít');
      tool.click();`,
    settle: 2400,
  },
  {
    name: 'library-tool-paintjar',
    at: '#thu-vien',
    run: `${OPEN('KHCN', 'Bộ dụng cụ mô hình')}
      await new Promise((r) => setTimeout(r, 700));
      const tool = [...document.querySelectorAll('.toolkit-chip')]
        .find((node) => node.textContent.trim().startsWith('Hũ sơn'));
      if (!tool) throw new Error('tool not found: ' + 'Hũ sơn');
      tool.click();`,
    settle: 2400,
  },
  { name: 'library-empty', at: '#thu-vien', run: OPEN('Khoa học vũ trụ'), settle: 900 },
  /*
   * The practice hub, three labs deep.
   *
   * One shot of this section proves almost nothing: only the selected lab is
   * mounted, so a capture of the default tells you the Formula workshop loaded
   * and nothing at all about the two that were adapted for this build. Each of
   * the three is photographed with its own stage running, and the drone and the
   * robot are each driven far enough into their guided flow that the step strip,
   * the objective line and the on-stage controls are all on screen — which is
   * the whole claim this section makes.
   */
  {
    name: 'practice',
    at: '#thuc-hanh',
    run: PRACTICE('Xưởng mô hình', '.lab--formula'),
    settle: 4200,
  },
  {
    /*
     * Three labs in one page load, in the order the rail lists them.
     *
     * The section's central performance rule is that only one heavy renderer is
     * ever alive — selecting a lab disposes the previous one's WebGL context,
     * geometries, materials and animation loop before the next asks for a
     * context. Browsers cap live contexts, and the failure mode when that cap is
     * hit is not an error, it is the *first* canvas silently going blank. So the
     * cycle is walked in one session and the last stage photographed: if a
     * teardown regresses, this is the shot that comes back empty.
     */
    name: 'practice-cycle',
    at: '#thuc-hanh',
    run: `${PRACTICE('Trải nghiệm', '.lab--drone')}
      ${PRACTICE('Vận hành', '.lab--robot')}
      ${PRACTICE('Xưởng mô hình', '.lab--formula')}
      await new Promise((r) => setTimeout(r, 2600));
      ${PRACTICE('Vận hành', '.lab--robot')}
    `,
    settle: 2600,
  },
  {
    /* The bench. The one frame that proves the kit ⇄ assembled blend still runs
       in the ivory room, and the one most likely to break when the workshop is
       moved between two lighting rigs. */
    name: 'practice-formula-kit',
    at: '#thuc-hanh',
    run: `${PRACTICE('Xưởng mô hình', '.lab--formula')}
      /* Waits on the action row, then clicks the step chip: both only exist
         once the workshop has finished loading. */
      ${ACTION('Lái thử')}
      [...document.querySelectorAll('.lab-step')]
        .find((node) => node.textContent.includes('Lắp ráp')).click();
    `,
    settle: 2800,
  },
  {
    name: 'practice-formula-drive',
    at: '#thuc-hanh',
    run: `${PRACTICE('Xưởng mô hình', '.lab--formula')}
      ${ACTION('Lái thử')}
      action.click();
      await new Promise((r) => setTimeout(r, 900));
      const stage = document.querySelector('.lab');
      stage.focus();
      await new Promise((r) => setTimeout(r, 500));
      stage.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
      await new Promise((r) => setTimeout(r, 1600));
      stage.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
    `,
    settle: 1400,
  },
  {
    /* Armed and climbing: the props are spinning, the takeoff gate is lit, and
       the step strip has moved off 01. */
    name: 'practice-drone',
    at: '#thuc-hanh',
    run: `${PRACTICE('Trải nghiệm', '.lab--drone')}
      ${ACTION('Khởi động')}
      action.click();
      const stage = document.querySelector('.lab--drone');
      stage.focus();
      await new Promise((r) => setTimeout(r, 400));
      // Hold the climb key for two seconds of simulated flight.
      stage.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true }));
      await new Promise((r) => setTimeout(r, 2200));
      stage.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyR', bubbles: true }));
      await new Promise((r) => setTimeout(r, 600));
      stage.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
      await new Promise((r) => setTimeout(r, 1500));
      stage.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
    `,
    settle: 1600,
  },
  {
    /*
     * The drone's whole lesson, flown end to end.
     *
     * This is the shot that proves the guided flow *finishes*. A lab whose
     * first two steps work and whose fourth never fires strands every student
     * who gets that far, and no still frame of a hovering drone can tell you
     * which of those you have.
     */
    name: 'practice-drone-landed',
    at: '#thuc-hanh',
    run: `${PRACTICE('Trải nghiệm', '.lab--drone')}
      const stage = document.querySelector('.lab--drone');
      stage.focus();
      ${ACTION('Khởi động')}

      /* 1.2 s of settling after every release: letting go glides the aircraft
         to a stop over about a second, and a leg that starts while the last one
         is still arriving compounds its error into the next gate. */
      const hold = (codes, ms) => new Promise((done) => {
        for (const code of codes) stage.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
        setTimeout(() => {
          for (const code of codes) stage.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
          setTimeout(done, 1200);
        }, ms);
      });
      const tap = (code, ms) => new Promise((done) => {
        stage.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
        setTimeout(() => {
          stage.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
          setTimeout(done, 320);
        }, ms);
      });

      /* Parsed by hand rather than by regex: this whole script is embedded in a
         template literal, so a backslash class never survives to the page. */
      const readout = () => document.querySelector('.lab-readout')?.textContent ?? '';
      const rings = () => {
        const mark = readout().indexOf('/3');
        return mark > 0 ? Number(readout()[mark - 1]) || 0 : 0;
      };
      const altitude = () => Number.parseFloat(readout()) || 0;
      /*
       * The ring counter only exists while the route step is current: clearing
       * the third gate advances the lab to "hạ cánh" and the counter leaves the
       * readout altogether. Reading a missing counter as zero is what sent an
       * earlier version of this script twenty metres past the course, still
       * pressing keys at a step that had already finished.
       */
      const routeOver = () => !readout().includes('vòng');
      const cleared = () => (routeOver() ? 3 : rings());
      /*
       * A staircase, not a computed leg.
       *
       * Two earlier versions converted metres to milliseconds from the flight
       * model's constants, and both drifted: real travel per press depends on
       * how long the attitude loop takes to reach the commanded tilt, which is
       * not a number the envelope states. Alternating short presses along the
       * leg's two axes walks toward a gate the way a person does and converges
       * regardless — and because it stops the instant the counter moves, it is
       * a direct test of the capture radius rather than of arithmetic.
       */
      const approach = async (codes, target, presses) => {
        for (let attempt = 0; attempt < presses && cleared() < target; attempt += 1) {
          await hold([codes[attempt % codes.length]], 700);
        }
        return cleared() >= target;
      };

      action.click();
      await new Promise((r) => setTimeout(r, 320));
      await hold(['KeyR'], 1250);                  // up to the takeoff gate, ~3 m
      if (!await approach(['KeyW'], 1, 10)) throw new Error('drone: never reached ring 01');
      await hold(['KeyR'], 700);                   // ring 02 at (7.4, 3.9, −14.2)
      if (!await approach(['KeyD', 'KeyW'], 2, 16)) throw new Error('drone: never reached ring 02');
      await hold(['KeyF'], 700);                   // ring 03 at (14.6, 2.7, −7.4)
      if (!await approach(['KeyD', 'KeyS'], 3, 16)) throw new Error('drone: never reached ring 03');

      // The pad is at (13.6, 0, 1.4); ring 03 leaves the aircraft near
      // (15.6, ·, −7.5), so one press left and five back covers it.
      await hold(['KeyA'], 700);
      for (let attempt = 0; attempt < 5; attempt += 1) await hold(['KeyS'], 700);

      const landed = () => (document.querySelector('.lab-objective')?.textContent ?? '')
        .includes('Hoàn thành');
      /* Down in taps rather than one long press: a held descent stick arrives at
         2.6 m/s, which is survivable and graceless. Taps never let the sink rate
         build — the technique the lab's own hint describes. */
      const descend = async () => {
        await tap('KeyF', 700);
        for (let attempt = 0; attempt < 16 && altitude() > 0.1 && !landed(); attempt += 1) {
          await tap('KeyF', 260);
        }
      };
      await descend();
      /*
       * Missing the pad is a recoverable mistake in this lab rather than a
       * failure — the aircraft simply reports "chưa đúng bãi đáp" and waits — so
       * the script takes the recovery a student would: climb back up, shuffle,
       * set down again. The pattern spirals rather than repeating one nudge,
       * because the error after three ring approaches can be a metre and a half
       * in either direction on either axis. Reaching the pad on the first try is
       * not what this shot is testing; reaching it at all is.
       */
      const SEARCH = ['KeyS', 'KeyA', 'KeyW', 'KeyW', 'KeyD', 'KeyD', 'KeyS', 'KeyS'];
      for (let attempt = 0; attempt < SEARCH.length && !landed(); attempt += 1) {
        await hold(['KeyR'], 900);
        await hold([SEARCH[attempt]], 620);
        await descend();
      }
      if (!landed()) throw new Error('drone: never landed on the pad');
    `,
    settle: 2400,
  },
  {
    /*
     * The robot's whole lesson, run closed-loop.
     *
     * Unlike the drone this one steers on feedback rather than on timings: the
     * cell already shows the pilot when the tool is over its target — the ring
     * goes green and the readout says "Đúng vị trí" — so the script watches for
     * exactly the signal a student watches for. That makes it a test of the
     * affordance as well as of the mechanism: if the snap indicator stops being
     * truthful, this shot stops passing.
     */
    name: 'practice-robot-done',
    at: '#thuc-hanh',
    run: `${PRACTICE('Vận hành', '.lab--robot')}
      const stage = document.querySelector('.lab--robot');
      stage.focus();
      ${ACTION('Bắt đầu điều khiển')}
      const click = (text) => {
        const button = [...document.querySelectorAll('.lab-actions .lab-button')]
          .find((node) => node.textContent.includes(text));
        if (!button) throw new Error('robot: no action ' + text);
        button.click();
      };
      const hold = (code, ms) => new Promise((done) => {
        stage.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
        setTimeout(() => {
          stage.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
          setTimeout(done, 180);
        }, ms);
      });
      const onTarget = () => Boolean(document.querySelector('.lab-readout b.is-ok'));
      /* Settle before trusting the ring: it goes green while the arm is still
         travelling, and what matters is whether it is green once it stops. */
      const settled = async () => {
        if (!onTarget()) return false;
        await new Promise((r) => setTimeout(r, 420));
        return onTarget();
      };
      const nudgeUntilOnTarget = async (codes, budget) => {
        for (let attempt = 0; attempt < budget; attempt += 1) {
          if (await settled()) return true;
          await hold(codes[attempt % codes.length], 200);
        }
        return settled();
      };

      /* The jog is a flat 0.42 m/s with no ramp, so metres convert straight to
         milliseconds. Home is (0.46, 0.78, 0.50); the pick station is
         (0.66, 0.35, 0.46) and tray slot 01 is (−0.66, 0.35, 0.34). */
      const jogMs = (metres) => Math.round((metres / 0.42) * 1000);
      const ALL_AXES = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyR', 'KeyF'];

      click('Bắt đầu điều khiển');
      await new Promise((r) => setTimeout(r, 400));
      await hold('ArrowRight', jogMs(0.2));
      await hold('KeyF', jogMs(0.43));
      await hold('ArrowDown', jogMs(0.04));
      if (!await nudgeUntilOnTarget(ALL_AXES, 30)) {
        throw new Error('robot: never reached the pick point');
      }
      click('Đóng kẹp');
      await new Promise((r) => setTimeout(r, 900));
      await hold('KeyR', jogMs(0.16));
      await hold('ArrowLeft', jogMs(1.32));
      await hold('ArrowDown', jogMs(0.12));
      await hold('KeyF', jogMs(0.16));
      if (!await nudgeUntilOnTarget(ALL_AXES, 36)) {
        throw new Error('robot: never reached the tray slot');
      }
      click('Mở kẹp');
      await new Promise((r) => setTimeout(r, 1000));
      click('Chạy tự động');
      await new Promise((r) => setTimeout(r, 22000));
    `,
    settle: 1800,
  },
  {
    /*
     * A hint open, and the flash it replaces.
     *
     * "Gợi ý" is the one control in this section whose whole job is to render
     * something — a step with no hint hides the button, so an empty panel is a
     * silent failure. It is photographed on the drone because that lab's hint is
     * the longest and the most likely to collide with the objective line above
     * it or the control pads below.
     */
    name: 'practice-hint',
    at: '#thuc-hanh',
    run: `${PRACTICE('Trải nghiệm', '.lab--drone')}
      ${ACTION('Khởi động')}
      action.click();
      await new Promise((r) => setTimeout(r, 900));
      const hint = [...document.querySelectorAll('.lab-actions .lab-button')]
        .find((node) => node.textContent.includes('Gợi ý'));
      if (!hint) throw new Error('practice: no hint button');
      hint.click();
      await new Promise((r) => setTimeout(r, 400));
      if (!document.querySelector('.lab-hint')) throw new Error('practice: hint did not open');
    `,
    settle: 1200,
  },
  {
    /* Past the look step and jogging, so the target ring, the key legend and
       the gripper action are all showing at once. */
    name: 'practice-robot',
    at: '#thuc-hanh',
    run: `${PRACTICE('Vận hành', '.lab--robot')}
      ${ACTION('Bắt đầu điều khiển')}
      action.click();
      const stage = document.querySelector('.lab--robot');
      stage.focus();
      await new Promise((r) => setTimeout(r, 500));
      stage.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }));
      await new Promise((r) => setTimeout(r, 900));
      stage.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight', bubbles: true }));
      stage.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }));
      await new Promise((r) => setTimeout(r, 900));
      stage.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF', bubbles: true }));
    `,
    settle: 2200,
  },
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
      /*
       * `clipOf` is `clip` for something that moves.
       *
       * CDP's clip is in DOCUMENT coordinates, so a literal `y` only works for a
       * region near the top of the page — which is why the hero crops above are
       * written that way and why the same numbers mean nothing for a section
       * three thousand pixels down, whose offset changes with every copy edit
       * above it. `clipOf: { sel, inset }` measures the element at capture time
       * and adds the scroll offset, so the crop follows the component.
       */
      let clip = shot.clip;
      if (shot.clipOf) {
        const { sel, inset = [0, 0, 0, 0], scale = 2.4, fromRight } = shot.clipOf;
        const box = await evaluate(`
          const node = document.querySelector(${JSON.stringify(sel)});
          if (!node) return null;
          const r = node.getBoundingClientRect();
          return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
        `);
        if (!box) throw new Error(`clipOf selector not found: ${sel}`);
        const [top, right, bottom, left] = inset;
        /* `fromRight: n` takes the rightmost n px of the element — the only way to
           frame a scrollbar or a resize handle without hard-coding a width that
           changes with the viewport. A left inset computed from the outside can go
           negative, and CDP hangs rather than erroring on a negative clip. */
        clip = fromRight
          ? { x: Math.round(box.x + box.width - fromRight), y: Math.round(box.y + top), width: fromRight, height: Math.round(box.height - top - bottom), scale }
          : {
            x: Math.round(box.x + left),
            y: Math.round(box.y + top),
            width: Math.round(box.width - left - right),
            height: Math.round(box.height - top - bottom),
            scale,
          };
        if (clip.width <= 0 || clip.height <= 0) throw new Error(`clipOf produced an empty box for ${sel}: ${JSON.stringify(clip)}`);
      }

      const capture = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
        ...(clip ? { clip: { ...clip, scale: clip.scale ?? 3 } } : {}),
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
