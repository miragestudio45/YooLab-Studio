import * as THREE from 'three';
import { gfxAllows, gfxRecord, gfxContextLossCount } from './gfx';
import { hdrTargetSupport, transmissionTargetSupport } from './hdrTarget';

/**
 * When to stop asking this GPU for the clever passes.
 *
 * ## Why a path and not more probes
 *
 * Two probes already run here: one on the half-float targets this project
 * creates, one on the 4× MSAA half-float buffer three builds for
 * `transmission`. Both **pass** on the machines that corrupt — an Apple laptop
 * that tears the jellyfish into black tiles, an iPad that fills the land
 * chapter with flat green. That is not a reason to write a third probe. It is
 * the finding.
 *
 * A probe is a 64 × 64 target, written once, read once, while nothing else is
 * happening. The failure is a full-viewport RGBA16F surface, resolved out of
 * multisample and re-mipmapped **every frame**, sampled in the same frame it
 * was written, with a second scene render and a second context competing for
 * the same tile memory. Those are not the same question, and no small
 * synchronous test is going to reproduce the second one. Chasing it with
 * probes is how two rounds of fixes shipped and changed nothing.
 *
 * So the rule changes: on the GPU family where these passes are reported
 * broken, they are not used. Not degraded, not probed harder — not used.
 *
 * ## What identifies the family
 *
 * Not a model name and not a screen size. Four signals, any one of which is
 * enough, and every one of them is a property of the renderer rather than a
 * guess about the hardware it is bolted to:
 *
 *   1. **The GL renderer string reports an Apple GPU.** `UNMASKED_RENDERER_WEBGL`
 *      says `Apple GPU`, or `ANGLE (Apple, Apple M…)` — this is the driver
 *      naming itself, which is exactly the thing that is misbehaving. It is not
 *      "is this a MacBook Air"; a Mac with a discrete AMD card does not match,
 *      and it should not, because it is not the driver in question.
 *   2. **The engine is WebKit and only WebKit.** Safari and every iOS browser,
 *      which all render through the same stack whatever the badge says.
 *   3. **A capability probe failed.** Kept, because when it does fire it is
 *      proof rather than inference.
 * *   4. **A context has already been lost.** The strongest signal available,
 *      and the only one that can arrive after the page has started: the next
 *      renderer built on this page reads it from the census and starts safe.
 *
 * ## What it costs
 *
 * The refraction through the jellyfish membranes, the MSAA edges, and some
 * precision in the dark water. What it buys is a picture that is the same in
 * every frame. That trade was made deliberately and on instruction; the labels
 * on it are in `describe()` so it can be read back off a device.
 */
export type AppleSafePath = {
  /** True when the conservative path is in force. */
  active: boolean;
  /** Every signal that fired, for the report. */
  reasons: string[];
  /** GL renderer string, or '' where the extension is unavailable. */
  renderer: string;
};

const cache = new WeakMap<THREE.WebGLRenderer, AppleSafePath>();

function readName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (!info) return '';
    return String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '');
  } catch {
    return '';
  }
}

function rendererString(renderer: THREE.WebGLRenderer): string {
  try {
    return readName(renderer.getContext());
  } catch {
    return '';
  }
}

let probedName: string | null = null;

/**
 * The GL renderer string, read before there is a renderer to ask.
 *
 * `antialias` is fixed at context construction, so the decision about MSAA has
 * to be made before the context that would answer it exists. A 1 x 1 throwaway
 * context answers instead and is handed straight back with `loseContext` — the
 * census sweeps lost contexts, so it never counts against the budget this file
 * also exists to protect. Read once and remembered.
 */
function probeRendererName(): string {
  if (probedName !== null) return probedName;
  probedName = '';
  if (typeof document === 'undefined') return probedName;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    /* Marks it for `gfx.ts` to skip, so releasing it below is not mistaken for
       the page losing a context it was using. */
    canvas.dataset.gfxProbe = '1';
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (gl) {
      probedName = readName(gl as WebGLRenderingContext | WebGL2RenderingContext);
      (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    /* No context available at all is not this function's problem to solve. */
  }
  return probedName;
}

/**
 * WebKit, and not a Chromium wearing its user-agent.
 *
 * Every browser on iOS is WebKit whatever it calls itself, and Safari on macOS
 * is the same engine. Chromium on macOS is NOT — it reaches the same Apple
 * driver through ANGLE/Metal, which signal 1 catches instead.
 */
function isWebKitOnly(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua);
}

/**
 * iPadOS has reported itself as a Mac since 2019, so the platform string is
 * useless on its own — but a "Mac" with a touch screen is an iPad, and that
 * pair is still the cheapest honest test there is.
 */
function isIosLike(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/** The signals that need no renderer. Shared by both entry points. */
function earlyReasons(name: string): string[] {
  const reasons: string[] = [];
  /* `Apple` appears in both `Apple GPU` (WebKit) and `ANGLE (Apple, Apple M3
     Pro, …)` (Chromium on macOS), which is the point: it is the driver that
     matters, not the browser wrapped around it. */
  if (/apple/i.test(name)) reasons.push(`gpu:${name.slice(0, 48)}`);
  if (isWebKitOnly()) reasons.push('engine:webkit');
  if (isIosLike()) reasons.push('platform:ios');
  /* One loss is enough, and it is read from the census rather than a flag of
     our own: a lost context is usually a replaced one, so the signal has to
     survive the renderer that recorded it. */
  if (gfxContextLossCount() > 0) reasons.push('context-lost');
  return reasons;
}

/**
 * The decision as far as it can be made before a renderer exists.
 *
 * Used for the two settings that are fixed at construction — `antialias` and
 * whether a second context is opened at all. It can only ever be a subset of
 * the full answer, never a superset, so a machine that trips only a probe still
 * gets MSAA for the life of that context. That is the correct trade: MSAA on the
 * default framebuffer is not the surface any of these defects live on.
 */
export function presumeAppleSafePath(): AppleSafePath {
  const name = probeRendererName();
  const reasons = earlyReasons(name);
  const active = gfxAllows('apple-safe', reasons.length > 0);
  if (active && reasons.length === 0) reasons.push('forced:flag');
  return { active, reasons, renderer: name };
}

function evaluate(renderer: THREE.WebGLRenderer): AppleSafePath {
  const name = rendererString(renderer) || probeRendererName();
  const reasons = earlyReasons(name);

  const hdr = hdrTargetSupport(renderer);
  if (!hdr.renderable) reasons.push('probe:hdr-unrenderable');
  if (!hdr.mipmappable) reasons.push('probe:hdr-mip');

  const transmission = transmissionTargetSupport(renderer);
  if (!transmission.resolve) reasons.push('probe:msaa-resolve');
  if (!transmission.mips) reasons.push('probe:transmission-mip');

  /*
   * `?gfx=apple-safe` forces it on any machine, which is how the path itself
   * gets tested somewhere it can be watched; `?gfx=no-apple-safe` forces it off
   * on a machine that trips a signal, which is how the signal gets confirmed as
   * the thing that mattered.
   */
  const active = gfxAllows('apple-safe', reasons.length > 0);
  if (active && reasons.length === 0) reasons.push('forced:flag');

  return { active, reasons, renderer: name };
}

/** Decide once per renderer, and publish the decision. */
export function appleSafePath(renderer: THREE.WebGLRenderer): AppleSafePath {
  const known = cache.get(renderer);
  if (known) return known;
  const decision = evaluate(renderer);
  cache.set(renderer, decision);
  gfxRecord('appleSafePath', decision);
  console.info(
    `[gfx] apple safe path ${decision.active ? 'ACTIVE' : 'off'}`
    + `${decision.reasons.length ? ` — ${decision.reasons.join(', ')}` : ''}`,
  );
  return decision;
}

