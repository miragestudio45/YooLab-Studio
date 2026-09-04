/**
 * A compressing reverse proxy, so a lab audit measures the app and not the
 * dev server.
 *
 * `vinext start` serves `/_next/static/*` uncompressed. That is fine for local
 * work — Vercel and Cloudflare both compress at the edge, so production never
 * sees it — but it is ruinous for a Lighthouse run: the first audit of this site
 * attributed 12.7 s and 3.5 MB to `uses-text-compression`, which is larger than
 * every real finding combined and does not exist in production. Every metric
 * downstream of it was inflated by the same artifact.
 *
 * So the audit runs through here instead. This changes exactly one variable —
 * text responses come back gzipped — which is what the CDN would have done, and
 * leaves the application, the routes and the payloads identical.
 *
 *   node reference-audit/gzip-proxy.mjs --target http://localhost:3220 --port 3221
 *
 * Not a production component and not a general-purpose proxy: it buffers whole
 * responses, which is only acceptable because the thing on the other end is a
 * local static build.
 */

import http from 'node:http';
import { gzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const target = new URL(flag('--target', 'http://localhost:3220'));
const port = Number(flag('--port', '3221'));

/* What a CDN would compress: text, and nothing already compressed. */
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml)|image\/svg\+xml)/;

const server = http.createServer((request, response) => {
  const upstream = http.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: request.url,
      method: request.method,
      /* Ask upstream for identity so this proxy is the only thing encoding. */
      headers: { ...request.headers, host: target.host, 'accept-encoding': 'identity' },
    },
    (upstreamResponse) => {
      const chunks = [];
      upstreamResponse.on('data', (chunk) => chunks.push(chunk));
      upstreamResponse.on('end', () => {
        const body = Buffer.concat(chunks);
        const headers = { ...upstreamResponse.headers };
        delete headers['content-encoding'];
        delete headers['content-length'];

        const type = String(headers['content-type'] || '');
        const wants = String(request.headers['accept-encoding'] || '').includes('gzip');

        if (wants && COMPRESSIBLE.test(type) && body.length > 512) {
          const zipped = gzipSync(body, { level: 6 });
          headers['content-encoding'] = 'gzip';
          headers['content-length'] = String(zipped.length);
          headers.vary = 'Accept-Encoding';
          response.writeHead(upstreamResponse.statusCode ?? 200, headers);
          response.end(zipped);
          return;
        }

        headers['content-length'] = String(body.length);
        response.writeHead(upstreamResponse.statusCode ?? 200, headers);
        response.end(body);
      });
    },
  );

  upstream.on('error', (error) => {
    response.writeHead(502, { 'content-type': 'text/plain' });
    response.end(`proxy error: ${error.message}`);
  });

  request.pipe(upstream);
});

server.listen(port, () => {
  console.log(`gzip proxy :${port} -> ${target.origin}`);
});
