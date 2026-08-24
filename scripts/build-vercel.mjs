/**
 * The Vercel production build.
 *
 * Why this is a script and not `"build:vercel": "NITRO_PRESET=vercel vite build"`:
 * npm runs scripts through `cmd.exe` on Windows, where `VAR=value command` is not
 * an assignment — it is a command called `VAR=value`. This project is developed on
 * Windows and built on Vercel's Linux containers, and the build has to be
 * verifiable in both, so the variable is set in Node rather than by the shell.
 *
 * `??=`, not `=`: Nitro's own `NITRO_PRESET` is the documented way to retarget a
 * Nitro build, so if the environment already names a preset — a Vercel project
 * variable, a one-off local experiment — that choice wins and this script only
 * supplies the default.
 *
 * The build itself is plain `vite build`, which is what vinext's Nitro path
 * documents. `vinext build` reaches the same Vite builder, but it also owns
 * `dist/standalone` emission and its own prerender pass, and neither belongs in a
 * build whose output is Nitro's.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

process.env.NITRO_PRESET ??= 'vercel';

const require = createRequire(import.meta.url);
/*
 * Resolve Vite's own CLI rather than shelling out to `npx`/`vite`: on Vercel the
 * PATH contains whatever the install step left behind, and a resolved path cannot
 * pick up a different Vite than the one this build is pinned to.
 *
 * Resolved through `vite/package.json` and its `bin` field, not by requiring
 * `vite/bin/vite.js` directly — Vite 8 ships an `exports` map that does not
 * expose `./bin/*`, so the direct path is an `ERR_PACKAGE_PATH_NOT_EXPORTED`.
 * `./package.json` is exported, which makes this the one stable way in.
 */
const vitePackagePath = require.resolve('vite/package.json');
const vitePackage = JSON.parse(readFileSync(vitePackagePath, 'utf8'));
const viteBin = resolve(dirname(vitePackagePath), vitePackage.bin.vite);

console.log(`[build:vercel] NITRO_PRESET=${process.env.NITRO_PRESET}`);

const child = spawn(process.execPath, [viteBin, 'build', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[build:vercel] vite build terminated by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error('[build:vercel] could not start vite build');
  console.error(error);
  process.exit(1);
});
