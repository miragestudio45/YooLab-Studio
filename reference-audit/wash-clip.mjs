/**
 * Does any soft wash on this page draw a hard edge, at any screen ratio?
 *
 *   node reference-audit/wash-clip.mjs            # every viewport
 *   node reference-audit/wash-clip.mjs w2560 w390 # named ones
 *
 * ## Why this exists as its own command
 *
 * Review found a white rectangle behind the hero copy on a 2560×1440 display.
 * The cause was `.hero-copy::before`: a radial wash whose box was `-170px` on
 * the left and `-46%` on the right, so the ellipse reached its zero stop 484 px
 * *past* its own left edge and the box clipped it there at alpha 0.68. A
 * straight vertical line with a near-white fill — the one thing the wash's own
 * comment said it must never become.
 *
 * Two things about that defect are worth building a tool around. It was
 * **invisible up to about 1920**, because the backdrop behind it is near-white
 * there and only turns warm on a taller frame, so nine tested regimes all said
 * fine. And the client's reasonable reaction was "how am I supposed to check
 * every ratio myself" — which is the right question to answer with a detector
 * rather than with more screenshots.
 *
 * It is decidable without pixels: the gradient's radii, centre and stops are all
 * in the computed style, and the box is measurable, so the alpha where the box
 * cuts the ellipse is arithmetic. `probes/wash-clip.js` does that per element and
 * this file runs it across every viewport `probe.mjs` knows.
 *
 * ## What counts as a finding
 *
 * Only washes, never plates. A card surface is supposed to be filled to its own
 * edge; the defect is an element with no border, no radius, no background colour,
 * and a gradient the author **ended at alpha 0** — their own statement that it
 * was meant to vanish before the box did. Elements that end their wash with a
 * `mask-image` instead (`.pricing-aura` fades its top and bottom that way) are
 * reported as `masked`, not as findings, so nothing is silently dropped.
 *
 * Exit code is 1 if anything is found, so this can gate a commit.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';

const HERE = import.meta.dirname;
const PROBE = path.join(HERE, 'probe.mjs');
const SCRIPT = path.join(HERE, 'probes', 'wash-clip.js');

/* Kept in step with probe.mjs by hand rather than imported: that file executes
   its own CLI on import, so there is nothing to import from it. */
const VIEWPORTS = ['w3440', 'w2560', 'w1920', 'w1512', 'w1440', 'w1366', 'w1298', 'w1194', 'w1024', 'w768', 'w390'];

const named = process.argv.slice(2).filter((arg) => /^w\d+$/.test(arg));
const viewports = named.length ? named : VIEWPORTS;

/** Runs one viewport and returns the probe's JSON payload. */
function run(viewport) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [PROBE, SCRIPT, '--viewport', viewport, '--motion'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', () => {});
    child.on('error', reject);
    child.on('close', () => {
      /* The probe prints its payload first and may append page warnings after,
         so take the first balanced object rather than parsing the whole stream. */
      const match = out.replace(/\0/g, '').match(/\{[\s\S]*?\n\}/);
      if (!match) return reject(new Error(`no payload from ${viewport}: ${out.slice(0, 200)}`));
      resolve(JSON.parse(match[0]));
    });
  });
}

let problems = 0;
for (const viewport of viewports) {
  const report = await run(viewport);
  const label = `${report.vw}x${report.vh}`.padEnd(10);
  if (!report.findings.length) {
    const note = report.masked.length ? `masked: ${report.masked.map((m) => m.el).join(', ')}` : '';
    console.log(`  ${label} clean  ${note}`);
    continue;
  }
  problems += report.findings.length;
  console.log(`  ${label} ${report.findings.length} CLIPPED`);
  for (const found of report.findings) {
    console.log(`      ${found.el}  box=${found.box?.join('x') ?? '?'}  edge alpha=${found.edgeAlpha ?? '?'}${found.unparsed ? `  unparsed=${found.unparsed}` : ''}`);
  }
}

console.log(problems ? `\n${problems} clipped wash(es) — a wash that stops at its box edge is a visible rectangle.` : '\nNo clipped washes.');
process.exit(problems ? 1 : 0);
