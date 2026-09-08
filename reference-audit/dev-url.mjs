import { readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

/**
 * Where the dev server actually is.
 *
 * `vite.config.ts` prefers port 3000 and accepts the next free one, so a
 * hard-coded `http://localhost:3000` in a harness is a guess. It is also the
 * *dangerous* kind of guess: if something stale is sitting on 3000 while the
 * real dev server is on 3001, every screenshot and measurement comes back
 * plausible and wrong. That happened in this repository — a fix was reported as
 * not working because the harness was reading a server two edits behind.
 *
 * So the port is a fact recorded by the server (`.cache/dev-server.json`, see
 * `recordDevPort`) and verified here before it is used:
 *
 *   1. an explicit `--url` always wins, because a person naming a URL knows
 *      something this file does not;
 *   2. the recorded port, if something is actually listening on it;
 *   3. 3000, which is what a first run with no cache file gets.
 *
 * The liveness check is what makes a stale file harmless: a hard kill (`taskkill`,
 * a closed terminal) leaves the file behind, and connecting to it is the only
 * way to tell that apart from a live server.
 */

const CACHE = path.join(import.meta.dirname, '..', '.cache', 'dev-server.json');
const FALLBACK = 3000;

/** Resolves once the port accepts a TCP connection, or false after `timeout`. */
function listening(port, timeout = 400) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const done = (answer) => {
      socket.destroy();
      resolve(answer);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function recordedPort() {
  try {
    const port = JSON.parse(readFileSync(CACHE, 'utf8')).port;
    return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
  } catch {
    return null;
  }
}

/**
 * The base URL for a harness run.
 *
 * `explicit` is whatever the caller read from `--url`; pass it through so the
 * flag keeps working and this function stays the only place that knows about the
 * cache file. Returns a string with no trailing slash.
 */
export async function devUrl(explicit) {
  if (explicit) return explicit.replace(/\/+$/, '');
  const recorded = recordedPort();
  if (recorded && recorded !== FALLBACK && (await listening(recorded))) {
    console.log(`[dev-url] using recorded dev-server port ${recorded}`);
    return `http://localhost:${recorded}`;
  }
  return `http://localhost:${FALLBACK}`;
}
