import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig, type PluginOption } from 'vite';
import hostingConfig from './.openai/hosting.json';

/**
 * One Vite config, two deployment targets.
 *
 * vinext is Next.js on Vite, and a Vite build has no idea where it is going
 * unless something tells it. The deployment plugin is what tells it: vinext
 * detects a Cloudflare plugin *or* a Nitro plugin by name in the plugin list and
 * hands that plugin ownership of the server environment — externalisation, the
 * server entry, the output layout. Exactly one of them may be present.
 *
 *   - Cloudflare (`@cloudflare/vite-plugin`) is the local and OpenAI Sites path.
 *     It gives `vinext dev` a real workerd runtime, which is what the D1 and R2
 *     bindings in `.openai/hosting.json` are declared against.
 *   - Nitro (`nitro/vite`) is the Vercel path, and it is vinext's own supported
 *     route to every non-Cloudflare host. Its `vercel` preset emits Build Output
 *     API v3 into `.vercel/output`, which is what Vercel deploys.
 *
 * Loading both would be a contradiction rather than a conflict — two plugins
 * claiming the same server environment — so the Cloudflare plugin is not merely
 * disabled on the Vercel build, it is never imported. Same for Wrangler's
 * environment variables below: they exist to keep Miniflare state project-local
 * and mean nothing to Nitro.
 */

/**
 * Writes the port the dev server actually bound, so nothing has to guess it.
 *
 * Vite resolves `server.port` before it knows whether the port is free, and the
 * number it ends up listening on is only knowable from the HTTP server itself —
 * `server.config.server.port` still says 3000 after Vite has moved to 3001. So
 * this reads it off the `listening` event, where it is a fact.
 *
 * `.cache/` because it is already gitignored, and the file is removed on a clean
 * shutdown: a reader that finds no file falls back to 3000, which is right, and
 * a reader that finds a stale one from a hard kill is protected by the liveness
 * check in `reference-audit/dev-url.mjs`. Nothing here throws — a dev server
 * must not fail to start because a cache file could not be written.
 */
function recordDevPort(): PluginOption {
  const file = path.join(import.meta.dirname, '.cache', 'dev-server.json');
  return {
    name: 'yoolab:record-dev-port',
    apply: 'serve',
    configureServer(server) {
      const write = () => {
        const address = server.httpServer?.address();
        if (!address || typeof address === 'string') return;
        try {
          mkdirSync(path.dirname(file), { recursive: true });
          writeFileSync(
            file,
            `${JSON.stringify({ port: address.port, pid: process.pid, startedAt: new Date().toISOString() }, null, 2)}
`,
          );
        } catch {
          /* A dev server that cannot start because of a cache file is worse
             than a harness that has to fall back to 3000. */
        }
      };
      server.httpServer?.once('listening', write);
      /*
       * Only clear the file if it still describes *this* server. Two dev servers
       * can run at once — that is the whole reason the port moves — and the
       * second one to exit must not delete a record belonging to the first,
       * which would send readers back to the 3000 fallback while a live server
       * sat on 3001.
       */
      const clear = () => {
        try {
          if (JSON.parse(readFileSync(file, 'utf8')).pid !== process.pid) return;
          rmSync(file, { force: true });
        } catch { /* no file, or unreadable: nothing to clean up */ }
      };
      server.httpServer?.once('close', clear);
      process.once('exit', clear);
    },
  };
}

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

/**
 * Which Nitro preset this build is for, or `null` for the Cloudflare path.
 *
 * `NITRO_PRESET` is Nitro's own variable and wins, so any Nitro target can be
 * driven from the environment without touching this file. `VERCEL=1` is set in
 * every Vercel build container, which is what makes the Vercel deployment work
 * without a build-time flag; Nitro would also auto-detect it, but naming the
 * preset means the build cannot silently pick a different one.
 *
 * Neither is set during local `npm run dev` or `npm run build`, so the existing
 * workflow is byte-for-byte what it was.
 */
const nitroPreset: string | null =
  process.env.NITRO_PRESET ?? (process.env.VERCEL ? 'vercel' : null);

export default defineConfig(async () => {
  const plugins: PluginOption[] = [vinext(), recordDevPort()];

  if (nitroPreset) {
    const { nitro } = await import('nitro/vite');
    plugins.push(
      nitro({
        preset: nitroPreset,
        /*
         * The app is one route with no server data, so Nitro can render it at
         * build time and let the CDN serve it — the flower valley, the bee and
         * every other client component still boot and run in the browser exactly
         * as they do in dev, because prerendering an RSC page ships the same
         * client bundle either way. The server function stays in the output and
         * handles anything not prerendered, so this is a fast path rather than a
         * static export.
         */
        prerender: { routes: ['/'] },
      }),
    );
  } else {
    /*
     * Keep Wrangler and Miniflare state project-local. These are non-secret tool
     * settings; application environment belongs in ignored `.env*` files.
     */
    process.env.WRANGLER_WRITE_LOGS ??= 'false';
    process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
    process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

    // Wrangler snapshots its log path while the Cloudflare plugin is imported,
    // so the import has to happen after the assignments above.
    const { cloudflare } = await import('@cloudflare/vite-plugin');
    const { sites } = await import('@openai/sites-vite-plugin');

    plugins.push(
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: {
          main: 'vinext/server/app-router-entry',
          compatibility_flags: ['nodejs_compat'],
          d1_databases: d1
            ? [
                {
                  binding: d1,
                  database_name: 'site-creator-d1',
                  database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
                },
              ]
            : [],
          r2_buckets: r2
            ? [
                {
                  binding: r2,
                  bucket_name: 'site-creator-r2',
                },
              ]
            : [],
        },
      }),
    );
  }

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: {
      /*
       * 3000 preferred, the next free port accepted, and the number written down.
       *
       * This was `strictPort: true` on a real argument: 5173 is the default for
       * *every* Vite project, so an unset port means this repo fights whatever
       * else is running — and Vite's normal response, quietly taking the next
       * free port, is worse than failing, because the dev server comes up fine
       * while every bookmark and screenshot harness still points at the old
       * number. That hazard is not hypothetical. It cost real time in this
       * repository: a harness aimed at a hard-coded 3000 hit a *stale* server
       * there, reported a fix as not working, and sent the investigation after a
       * bug that had already been fixed.
       *
       * But refusing to start is not a fix for that, it is the cost of it — and
       * the person who has to close another window is paying it. The answer is
       * to let the port move and stop making the tooling guess: `recordDevPort`
       * below writes the port Vite actually bound to `.cache/dev-server.json`,
       * and `reference-audit/dev-url.mjs` reads it, so the harnesses follow the
       * server instead of assuming it.
       *
       * `host: true` binds 0.0.0.0 for LAN testing on a phone or tablet. It was
       * already how this project is run (`--host` in the dev script); saying it
       * here means the flag is no longer what makes it true.
       */
      port: 3000,
      strictPort: false,
      host: true,
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins,
  };
});
