'use client';

import { useEffect, useRef, useState } from 'react';
import { getCachedThumbnail, requestThumbnail, type ThumbnailRequest } from '../lib/three/thumbnails';

/**
 * Renders a real picture of a GLB asset.
 *
 * The bake is deferred until the card is close to the viewport and runs through
 * the shared offscreen renderer, so a grid of cards costs one WebGL context and
 * one frame per asset instead of a live canvas each.
 */
export function ModelThumbnail({ request, alt }: { request: ThumbnailRequest; alt: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<string | null>(() => getCachedThumbnail(request));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (source) return;
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      requestThumbnail(request).then((data) => {
        if (cancelled) return;
        if (data) setSource(data);
        else setFailed(true);
      });
    }, { rootMargin: '320px 0px' });
    observer.observe(host);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.url, request.preset, source]);

  return (
    <div className="model-thumbnail" ref={hostRef}>
      {source
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={source} alt={alt} decoding="async" />
        : <span className="model-thumbnail-status">{failed ? 'Bản xem trước chưa sẵn sàng' : 'Đang dựng bản xem trước…'}</span>}
    </div>
  );
}
