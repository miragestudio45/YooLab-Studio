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
  const plugins: PluginOption[] = [vinext()];

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
       * Pinned to 3000 rather than left on Vite's default.
       *
       * 5173 is the default for *every* Vite project, so leaving it unset means
       * this repo fights whatever else is running for the same port — and Vite's
       * normal response is to quietly take the next free one instead, which is
       * worse than failing: the dev server comes up fine and every bookmark,
       * screenshot harness and launch config still points at the old number.
       *
       * `strictPort` makes that collision loud. If something already holds 3000,
       * startup stops and says so instead of drifting to 3001.
       */
      port: 3000,
      strictPort: true,
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins,
  };
});
