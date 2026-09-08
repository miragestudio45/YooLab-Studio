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
  /* iPad Pro / iPad Air in landscape. Between 1024 and 1366 the page had no
     tested regime at all, and every iPad in that orientation lands here. */
  'w1298': { width: 1298, height: 970 },
  /* iPad Air / Pro 11" landscape, the most common school tablet. */
  'w1194': { width: 1194, height: 834 },
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
 * Selects one of the three practice cards by the start of its rail title.
 *
 * The section is a set of cards now: nothing 3D is mounted until a card is
 * opened, so this is the cheap half — it only changes which poster, which brief
 * and which highlighted rail row are on screen.
 */
const CARD = (title) => `
  {
  const rail = [...document.querySelectorAll('.practice-rail-item')]
    .find((node) => node.textContent.includes(${JSON.stringify(title)}));
  if (!rail) throw new Error('practice card not found: ' + ${JSON.stringify(title)});
  rail.click();
  await new Promise((r) => setTimeout(r, 520));
  }
`;


/** Closes the popup if one is open, so the next shot starts from the section. */
const CLOSE_LAB = `
  {
  const close = document.querySelector('.practice-modal-button--close');
  if (close) close.click();
  await new Promise((r) => setTimeout(r, 420));
  }
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
  /* Dismiss the trial invitation before shooting anything else. It fires six
     seconds in, which is inside every settle on this list, so without this it
     lands on top of whatever is being photographed. */
  /* The MKT round: new hero positioning, pricing, the consultation dialog and
     the trial invitation. All DOM, so these are cheap and worth having pinned. */
  { name: 'hero-copy', at: '#trang-chu', settle: 2600, run: `try { sessionStorage.setItem('yoolab.trial-invite.seen', '1'); } catch {} const t = document.querySelector('.trial-modal .modal-close'); if (t) t.click(); await new Promise((r) => setTimeout(r, 260));`, clipOf: { sel: '.hero-copy', scale: 1.5 } },
  { name: 'hero-full', at: '#trang-chu', settle: 2800, run: `try { sessionStorage.setItem('yoolab.trial-invite.seen', '1'); } catch {} const t = document.querySelector('.trial-modal .modal-close'); if (t) t.click(); await new Promise((r) => setTimeout(r, 260));` },
  { name: 'pricing', at: '#bang-gia', settle: 900, run: `try { sessionStorage.setItem('yoolab.trial-invite.seen', '1'); } catch {} const t = document.querySelector('.trial-modal .modal-close'); if (t) t.click(); await new Promise((r) => setTimeout(r, 260));` },
  { name: 'final-cta', at: '#bat-dau-voi-yoolab', settle: 700, run: `try { sessionStorage.setItem('yoolab.trial-invite.seen', '1'); } catch {} const t = document.querySelector('.trial-modal .modal-close'); if (t) t.click(); await new Promise((r) => setTimeout(r, 260));` },
  {
    name: 'consult-modal',
    at: '#bat-dau-voi-yoolab',
    settle: 700,
    run: `
      try { sessionStorage.setItem('yoolab.trial-invite.seen', '1'); } catch {} const t = document.querySelector('.trial-modal .modal-close'); if (t) t.click(); await new Promise((r) => setTimeout(r, 260));
      const btn = document.querySelector('.cta-secondary');
      if (!btn) throw new Error('no "Trao doi them" button');
      btn.click();
      await new Promise((r) => setTimeout(r, 420));
    `,
  },
  {
    name: 'consult-errors',
    at: '#bat-dau-voi-yoolab',
    settle: 700,
    run: `
      try { sessionStorage.setItem('yoolab.trial-invite.seen', '1'); } catch {} const t = document.querySelector('.trial-modal .modal-close'); if (t) t.click(); await new Promise((r) => setTimeout(r, 260));
      document.querySelector('.cta-secondary').click();
      await new Promise((r) => setTimeout(r, 380));
      document.querySelector('.consult-submit').click();
      await new Promise((r) => setTimeout(r, 320));
    `,
  },
  { name: 'library-empty', at: '#thu-vien', run: OPEN('Khoa học vũ trụ'), settle: 900 },
  /*
   * The practice hub, and its one popup.
   *
   * It used to be thirteen shots. The three experiences were in-page WebGL labs
   * and each had to be driven into its guided flow before a capture proved
   * anything — arm the drone, fly it through three rings, land it; teach the
   * robot a cycle; put the Formula car in DRIVE — plus a set of poster bakes
   * taken from those same labs with their chrome stripped.
   *
   * All of it is gone because the labs are. Each experience is its own
   * deployment now and the popup embeds it (`lib/practice/manifest.ts`), so
   * there is no local stage to drive, no step strip to reach and nothing this
   * harness can honestly photograph inside the frame: it is another origin's
   * first paint, on another origin's schedule.
   *
   * What is left is what this page is still responsible for — the poster wall
   * on each of the three cards, and the dialog's own chrome around the embed.
   * `settle` is generous on the popup because the frame is a real network
   * fetch of a real simulator.
   */
  {
    name: 'practice',
    at: '#thuc-hanh',
    run: `${CLOSE_LAB}${CARD('Vận hành')}`,
    settle: 900,
  },
  { name: 'practice-drone-card', at: '#thuc-hanh', run: `${CLOSE_LAB}${CARD('lái drone')}`, settle: 900 },
  { name: 'practice-robot-card', at: '#thuc-hanh', run: `${CLOSE_LAB}${CARD('robot')}`, settle: 900 },
  {
    /* The dialog, open on card 01. Proves the head — the eyebrow, the title,
       fullscreen, "Mở tab mới", close — and that the embed reaches `load`
       rather than sitting on the spinner. */
    name: 'practice-modal',
    at: '#thuc-hanh',
    run: `${CLOSE_LAB}${CARD('Vận hành')}
      const open = document.querySelector('.practice-cta');
      if (!open) throw new Error('practice: no "Mở trải nghiệm" button');
      open.click();
      for (let waited = 0; waited < 20000; waited += 200) {
        if (document.querySelector(".practice-frame[data-ready='true']")) break;
        await new Promise((r) => setTimeout(r, 200));
      }
    `,
    settle: 1600,
  },

  /*
   * The lesson belt, frozen at the start of its loop.
   *
   * It is a continuously moving strip, so an unfrozen capture is a picture of
   * wherever the animation happened to be — two half-cards at the mask edges and
   * nothing legible. Killing the animation and zeroing the transform puts card
   * one at the left gutter, which is the only frame in which the covers, the
   * subject labels and the titles can all be checked at once.
   */
  {
    name: 'proof-belt',
    at: '#bai-hoc-mau',
    settle: 2200,
    run: `
      const track = document.querySelector('.proof-belt-track');
      if (!track) throw new Error('no .proof-belt-track');
      track.style.animation = 'none';
      track.style.transform = 'none';
      await new Promise((r) => setTimeout(r, 900));
    `,
  },
  { name: 'education', at: '#giao-duc', settle: 3600 },
  /*
   * Education's own detail shots.
   *
   * The section stopped being a diagram beside a list and became a picture of
   * the lesson player, which means it now has the same problem YooStudio and the
   * Library have: an 11 px rail label, a 17 px pin mark and a 6 px track node are
   * all invisible at frame scale, and "the tool rail looks fine" is not a claim a
   * 1512-wide capture can support. Same treatment, same reason.
   */
  { name: 'education-player', at: '#giao-duc', settle: 3600, clipOf: { sel: '.edu-viewer', scale: 2 } },
  { name: 'education-object', at: '#giao-duc', settle: 3600, clipOf: { sel: '.edu-object', scale: 3.4 } },
  { name: 'education-transport', at: '#giao-duc', settle: 3600, clipOf: { sel: '.edu-transport', scale: 3 } },
  { name: 'education-tools', at: '#giao-duc', settle: 3600, clipOf: { sel: '.edu-tools', scale: 4 } },
  { name: 'education-brief', at: '#giao-duc', settle: 2600, clipOf: { sel: '.education-brief', scale: 2.2 } },
  { name: 'education-features', at: '#giao-duc', settle: 2600, clipOf: { sel: '.education-features', scale: 2.2 } },
  /* The other two roles, so a tab that only ever gets clicked by hand is not
     the one place a broken lesson can hide. */
  {
    name: 'education-student',
    at: '#giao-duc',
    settle: 3200,
    run: `[...document.querySelectorAll('.education-tabs button')][1].click();`,
  },
  {
    name: 'education-school',
    at: '#giao-duc',
    settle: 3200,
    run: `[...document.querySelectorAll('.education-tabs button')][2].click();`,
  },
  { name: 'proof', at: '#bai-hoc-mau', settle: 2200 },
  /* Closed is the state the section is first seen in, so it is the state that
     has to be checked; `faq-open` then covers the row heights and the marker's
     open state, which is the only thing opening a row changes. */
  { name: 'faq', at: '#cau-hoi', settle: 900 },
  {
    name: 'faq-open',
    at: '#cau-hoi',
    settle: 900,
    run: `document.querySelector('.faq-item').open = true;`,
  },
  { name: 'cta', at: '#bat-dau-voi-yoolab' },
  /*
   * The footer, whole.
   *
   * `#bat-dau-voi-yoolab` lands the closing band's top edge at viewport 0 and
   * the footer is 600 px further down, so every previous shot of "the end of the
   * page" stopped at the pledge strip. Scrolled to the document's end rather
   * than clipped to the element: `clipOf` captures out of the composited frame,
   * so the part of the footer below the fold comes back blank.
   */
  {
    name: 'footer',
    at: '#bat-dau-voi-yoolab',
    run: `
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
      await new Promise((r) => setTimeout(r, 400));
    `,
    settle: 700,
  },

  /*
   * The library deep link, end to end. Run with the fragment in the URL:
   *   node reference-audit/shots.mjs --url 'http://localhost:3000/#thu-vien/tim' deeplink-tim
   * The failure it guards is silent: before `LibraryWorkspace` handled the
   * fragment, this landed at the top of the homepage and the rail kept whatever
   * specimen it already had, so the link looked like it worked.
   */
  { name: 'deeplink-tim', at: '#thu-vien', settle: 4200 },

  /*
   * The mobile sheet, open. Run at w390:
   *   node reference-audit/shots.mjs --viewport w390 --url http://localhost:3000 mobile-nav
   * It exists because the open/close animation was rewritten from `max-height`
   * to `grid-template-rows`, and the failure mode of that technique is a sheet
   * that stays collapsed — invisible in every desktop shot.
   */
  {
    name: 'mobile-nav',
    at: '#trang-chu',
    settle: 900,
    run: `document.querySelector('.menu-toggle').click();`,
  },

  /*
   * The standalone library pages, which are separate routes rather than
   * sections — so these two need the harness pointed at the page itself:
   *
   *   node reference-audit/shots.mjs --url http://localhost:3000/thu-vien/sinh-hoc/ong-mat library-page
   *   node reference-audit/shots.mjs --url http://localhost:3000/thu-vien library-index
   *
   * `clipOf` rather than an anchor because there is nothing to scroll to: the
   * whole document is the subject, and clipping to the content column is what
   * shows the part that is not already visible at the top.
   */
  { name: 'library-page', at: '#noi-dung', settle: 700, clipOf: { sel: '.lib-page__head', scale: 1.6 } },
  { name: 'library-facts', at: '#noi-dung', settle: 700, run: `document.querySelector('.lib-page__facts').scrollIntoView({ block: 'center' });`, clipOf: { sel: '.lib-page__facts', scale: 1.8 } },
  { name: 'library-note', at: '#noi-dung', settle: 700, run: `document.querySelector('.lib-page__note').scrollIntoView({ block: 'center' });`, clipOf: { sel: '.lib-page__note', scale: 1.8 } },
  { name: 'library-index', at: '#noi-dung', settle: 700, clipOf: { sel: '.lib-hub__list', scale: 1.6 } },
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
  /* `CalculateNativeWinOcclusion` joins the list for the same reason the three
     flags below it are here: this window is off-screen on purpose, and Chrome
     backgrounds a renderer it believes nobody can see — which drops
     `requestAnimationFrame` to about 1 Hz and hands a capture harness a WebGL
     panel that has composited two frames. See `probe.mjs` for the long version. */
  '--disable-features=Translate,MediaRouter,CalculateNativeWinOcclusion',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
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
      /* The trial dialog fires six seconds in and lands on top of whatever is
         being photographed. Suppressed for every shot, not per shot: it has its
         own entry when it is the subject. */
      await evaluate(`
        try { sessionStorage.setItem('yoolab.trial-invite.seen', '1'); } catch {}
        const invite = document.querySelector('.trial-modal .modal-close');
        if (invite) invite.click();
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
