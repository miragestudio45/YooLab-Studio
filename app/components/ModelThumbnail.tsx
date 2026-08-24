'use client';

import { useEffect, useRef, useState } from 'react';
import { getCachedThumbnail, requestThumbnail, type ThumbnailRequest } from '../lib/three/thumbnails';
import { whenOnScreen } from '../lib/three/visibility';

/**
 * Renders a real picture of a GLB asset.
 *
 * The bake is deferred until the card is close to the viewport and runs through
 * the shared offscreen renderer, so a grid of cards costs one WebGL context and
 * one frame per asset instead of a live canvas each.
 *
 * The baked picture is held keyed by the request, not as a bare piece of state.
 * The Library's knowledge panel keeps *one* of these mounted and swaps its
 * `request` as the selection changes, and with a plain `useState` the first
 * bake stuck: the effect saw a truthy `source` and returned early, so the panel
 * beside the jellyfish showed the bee that had been selected before it. Storing
 * the key alongside the picture and re-deriving during render — React's own
 * pattern for prop-derived state — makes a request change behave exactly like a
 * fresh mount, cache hit included.
 */
export function ModelThumbnail({ request, alt }: { request: ThumbnailRequest; alt: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const key = `${request.url}|${request.preset}|${request.width ?? 0}x${request.height ?? 0}`;
  const [entry, setEntry] = useState(() => ({ key, source: getCachedThumbnail(request), failed: false }));
  if (entry.key !== key) setEntry({ key, source: getCachedThumbnail(request), failed: false });

  const source = entry.key === key ? entry.source : null;

  useEffect(() => {
    if (getCachedThumbnail(request)) return;
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    // `whenOnScreen`, not a bare IntersectionObserver: a record that never
    // arrives leaves a whole rail of rows stuck on "đang dựng bản xem trước…"
    // for the rest of the session, which is exactly what was happening.
    const stop = whenOnScreen(host, () => {
      requestThumbnail(request).then((data) => {
        if (cancelled) return;
        setEntry((current) => (current.key === key ? { key, source: data, failed: !data } : current));
      });
    }, 320);
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="model-thumbnail" ref={hostRef}>
      {source
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={source} alt={alt} decoding="async" />
        : <span className="model-thumbnail-status">{entry.failed ? 'Bản xem trước chưa sẵn sàng' : 'Đang dựng bản xem trước…'}</span>}
    </div>
  );
}
