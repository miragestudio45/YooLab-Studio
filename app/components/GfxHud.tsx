'use client';

import { useEffect, useState } from 'react';
import { gfxHud, gfxReport, type GfxReport } from '../lib/three/gfx';

/**
 * The readout, for a device with no console attached.
 *
 * An iPad reporting a green hero cannot be asked to open devtools, and the
 * answer to "which pass is corrupting this" is a handful of numbers that the
 * page already knows and has no way to say out loud. This says them: what the
 * flags decided, how many WebGL contexts are alive right now, whether any has
 * been lost, what the quality ladder settled on, and what the half-float probe
 * measured.
 *
 * Only ever mounted for `?gfx=hud`, so it costs a closed `if` on every other
 * page load. Rendered as plain text at 10 px in the corner, tappable to copy
 * the whole report as JSON — because the useful thing to send back is the
 * report, not a photograph of it.
 */
export function GfxHud() {
  const [visible] = useState(() => gfxHud());
  const [report, setReport] = useState<GfxReport | null>(null);
  const [fps, setFps] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible) return;

    /* Twice a second. Often enough to catch a context being dropped mid-scroll,
       rare enough that the readout is not itself a cost being measured. */
    const poll = window.setInterval(() => setReport(gfxReport()), 500);

    /*
     * Frame time measured here rather than read from the renderer.
     *
     * The quality ladder's own mean is over its window and is reset by every
     * rung change, and what a person watching a stutter wants to know is what
     * the last second did. This counts real animation frames, which also keeps
     * counting when the renderer has stopped — a scene that has stopped drawing
     * while the page still animates is exactly the symptom of a lost context.
     */
    let frames = 0;
    let since = performance.now();
    let raf = 0;
    const tick = () => {
      frames += 1;
      const now = performance.now();
      if (now - since >= 1000) {
        setFps(Math.round((frames * 1000) / (now - since)));
        frames = 0;
        since = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      window.clearInterval(poll);
      cancelAnimationFrame(raf);
    };
  }, [visible]);

  if (!visible || !report) return null;

  const copy = () => {
    const text = JSON.stringify({ ...gfxReport(), fps }, null, 2);
    /* `writeText` needs a secure context and a permission that Safari may
       refuse. The textarea fallback is what makes this work over plain http on
       a LAN address, which is how the failing devices reach a dev build. */
    const fallback = () => {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); } catch { /* nothing else to try */ }
      area.remove();
    };
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(fallback);
    } else {
      fallback();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const capabilities = report.capabilities as {
    hdrProbe?: { measured?: Record<string, boolean>; inForce?: Record<string, boolean> };
    transmissionProbe?: { resolve?: boolean; mips?: boolean };
    appleSafePath?: { active?: boolean; reasons?: string[]; renderer?: string };
    explore?: Record<string, unknown>;
    quality?: { level?: number; label?: string; dpr?: number };
  };
  const explore = capabilities.explore ?? {};
  const on = (value: unknown) => (value ? 'on' : 'OFF');

  return (
    <button
      type="button"
      onClick={copy}
      style={{
        position: 'fixed',
        zIndex: 2147483647,
        top: 'env(safe-area-inset-top, 0px)',
        left: 0,
        maxWidth: 'min(92vw, 380px)',
        margin: 8,
        padding: '8px 10px',
        border: 0,
        borderRadius: 8,
        textAlign: 'left',
        color: '#d6ffe4',
        background: 'rgba(8, 14, 12, 0.86)',
        font: '10px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
        whiteSpace: 'pre-wrap',
        WebkitBackdropFilter: 'blur(4px)',
        backdropFilter: 'blur(4px)',
      }}
    >
      {[
        `gfx  ${report.flags.join(',') || '(none)'}${copied ? '   ✓ copied' : '   — tap to copy'}`,
        `SAFE ${capabilities.appleSafePath?.active ? 'APPLE PATH ON' : 'off'}`
        + `  ${(capabilities.appleSafePath?.reasons ?? []).join(' ') || '—'}`,
        `gpu  ${(capabilities.appleSafePath?.renderer || 'unknown').slice(0, 44)}`,
        `fps  ${fps}   dpr ${report.device.dpr}   tier ${capabilities.quality?.level ?? '?'} ${capabilities.quality?.label ?? ''}`,
        `ctx  ${report.contexts.count}  lost ${report.contexts.lost}  restored ${report.contexts.restored}`,
        `     ${report.contexts.labels.join(', ') || '(none)'}`,
        `hdr  render ${on(capabilities.hdrProbe?.inForce?.renderable)}  mip ${on(capabilities.hdrProbe?.inForce?.mipmappable)}`
        + `  (measured ${on(capabilities.hdrProbe?.measured?.renderable)}/${on(capabilities.hdrProbe?.measured?.mipmappable)})`,
        `xmit msaa-resolve ${on(capabilities.transmissionProbe?.resolve)}  mipchain ${on(capabilities.transmissionProbe?.mips)}`,
        `tgt  ${String(explore.hdrTargets ?? '?')}`,
        `pass trans ${on(explore.transmission)}  bloom ${on(explore.bloom)}  fg ${on(explore.foreground)}`
        + `  msaa ${on(explore.msaa)}  liquid ${on(explore.liquidSim)}`,
        `dev  lean ${on(explore.lean)}  handheld ${on(report.device.handheld)}  cores ${report.device.cores}`,
      ].join('\n')}
    </button>
  );
}
