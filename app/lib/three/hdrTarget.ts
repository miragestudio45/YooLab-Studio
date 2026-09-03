import * as THREE from 'three';
import { gfxAllows, gfxRecord } from './gfx';

/**
 * Whether this GPU can actually be trusted with half-float render targets.
 *
 * ## Why a probe rather than a feature test
 *
 * Every full-screen pass on this site writes into a `HalfFloatType` target: the
 * land/ocean composite, the bee's refraction capture, the ocean bloom chain and
 * the liquid backdrop's simulation. That is the right format — ACES needs values
 * above 1 to tone-map, and an 8-bit intermediate bands visibly in the dark water
 * — and on every desktop GPU it is unremarkable.
 *
 * It is not unremarkable on Apple's. `EXT_color_buffer_half_float` being
 * *present* says the extension is advertised; it does not say the driver writes
 * the pixels, and the two places this page leans hardest are exactly the two
 * that go wrong there:
 *
 *   - **Rendering into RGBA16F at all.** Where it fails, the target is never
 *     written and the shader that samples it reads undefined GPU memory. That is
 *     not black — undefined half-float memory decodes to huge values and NaNs,
 *     and a pass that multiplies them by zero still gets NaN, because `0 * NaN`
 *     is NaN. It reaches the screen as a flat saturated colour.
 *   - **`generateMipmap` on RGBA16F.** Mip generation for float formats is
 *     famously patchy, and this page does not merely *have* mipmaps on those
 *     targets — the bee's shell reads its refraction through an explicit
 *     `textureLod`, so a broken mip chain is not a soft blur, it is whatever the
 *     level happens to contain.
 *
 * No user-agent string separates a working driver from a broken one, so this
 * asks the GPU instead: write a known colour into a small half-float target,
 * sample it back through an 8-bit target, and compare. Two questions, two
 * answers, one readback.
 *
 * ## The cost, and why it is paid once
 *
 * `readRenderTargetPixels` is a synchronous GPU→CPU stall — the one call in
 * this file that has to be justified. It runs on a 8×8 target, once per
 * renderer, during setup, before anything is on screen. Measured at well under
 * a millisecond, and the alternative is shipping a page that is a flat green
 * rectangle on a device nobody here owns.
 *
 * ## What a failure means
 *
 * `renderable` false is rare and drops the whole page to 8-bit intermediates:
 * some banding in the deep water, everything else intact. `mipmappable` false is
 * the common one, and it only moves the two refraction captures to 8-bit —
 * they are blurred backdrops seen through a ruby shell, which is the one place
 * on this page where eight bits is genuinely enough.
 */
export type HdrTargetSupport = {
  /** A half-float colour target can be rendered into and sampled back. */
  renderable: boolean;
  /** `generateMipmap` on a half-float target produces levels `textureLod` can read. */
  mipmappable: boolean;
};

const cache = new WeakMap<THREE.WebGLRenderer, HdrTargetSupport>();

/*
 * GLSL3, because `textureLod` in a fragment shader is core there and an
 * extension in GLSL1 — and reaching a specific mip level is half of what this
 * probe is for.
 */
const PROBE_VERTEX = /* glsl */ `
  in vec3 position;
  in vec2 uv;
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** Written into the half-float target. Arbitrary, but not 0, 1 or equal per channel. */
const PROBE_R = 0.25;
const PROBE_G = 0.5;
const PROBE_B = 0.75;
/** Eight bits of headroom plus mip filtering; anything closer would be flaky. */
const TOLERANCE = 0.06;

function makeMaterial(fragmentShader: string, uniforms: Record<string, THREE.IUniform> = {}) {
  return new THREE.RawShaderMaterial({
    uniforms,
    vertexShader: PROBE_VERTEX,
    fragmentShader,
    glslVersion: THREE.GLSL3,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

function runProbe(renderer: THREE.WebGLRenderer): HdrTargetSupport {
  const size = 8;
  const hdr = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    depthBuffer: false,
    stencilBuffer: false,
  });
  hdr.texture.colorSpace = THREE.NoColorSpace;

  /* The readback surface is 8-bit on purpose: `readRenderTargetPixels` from a
     byte target is a plain `Uint8Array` on every driver, whereas reading
     RGBA16F means decoding halves by hand — and would be testing the readback
     path rather than the rendering path this probe is about. */
  const readback = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    depthBuffer: false,
    stencilBuffer: false,
  });
  readback.texture.colorSpace = THREE.NoColorSpace;

  const write = makeMaterial(/* glsl */ `
    precision highp float;
    out vec4 fragColor;
    void main() {
      fragColor = vec4(${PROBE_R}, ${PROBE_G}, ${PROBE_B}, 1.0);
    }
  `);
  const sampleUniforms = {
    uSource: { value: hdr.texture as THREE.Texture | null },
    uLod: { value: 0 },
  };
  const sample = makeMaterial(/* glsl */ `
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;
    uniform sampler2D uSource;
    uniform float uLod;
    void main() {
      fragColor = vec4(textureLod(uSource, vUv, uLod).rgb, 1.0);
    }
  `, sampleUniforms);

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), write);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.Camera();

  /* Everything this touches on the renderer is put back. A probe that leaves the
     clear colour or the bound target changed would corrupt the first real frame,
     which is a worse bug than the one it is looking for. */
  const previousTarget = renderer.getRenderTarget();
  const previousClear = new THREE.Color();
  renderer.getClearColor(previousClear);
  const previousAlpha = renderer.getClearAlpha();
  const previousToneMapping = renderer.toneMapping;

  const pixels = new Uint8Array(4);
  const read = (lod: number) => {
    sampleUniforms.uLod.value = lod;
    quad.material = sample;
    renderer.setRenderTarget(readback);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(readback, 0, 0, 1, 1, pixels);
    return [pixels[0] / 255, pixels[1] / 255, pixels[2] / 255] as const;
  };
  const matches = (got: readonly number[]) =>
    Math.abs(got[0] - PROBE_R) < TOLERANCE
    && Math.abs(got[1] - PROBE_G) < TOLERANCE
    && Math.abs(got[2] - PROBE_B) < TOLERANCE;

  let renderable = false;
  let mipmappable = false;
  try {
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0x000000, 1);

    quad.material = write;
    renderer.setRenderTarget(hdr);
    renderer.render(scene, camera);

    renderable = matches(read(0));
    /*
     * The whole target is one colour, so a correct mip chain returns that same
     * colour at every level. Level 2 rather than 1: a driver that quietly
     * produces only the first level still fails here.
     */
    if (renderable) mipmappable = matches(read(2));
  } catch {
    /*
     * The probe itself threw — a context loss mid-setup, or a driver that
     * refuses the readback. Keep HDR, which nearly every GPU including the
     * broken ones does honour, and give up only the mipmapped half-float path,
     * which is the fragile half and the one with a cheap replacement.
     */
    renderable = true;
    mipmappable = false;
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClear, previousAlpha);
    renderer.toneMapping = previousToneMapping;
    quad.geometry.dispose();
    write.dispose();
    sample.dispose();
    hdr.dispose();
    readback.dispose();
  }

  return { renderable, mipmappable };
}

/**
 * Probe this renderer once, then let the URL override either answer.
 *
 * The probe is evidence and the flag is a hypothesis, and both are needed: a
 * probe can only catch a driver that gets a small case *visibly* wrong, and the
 * failures this file exists for are reported from devices nobody here owns. So
 * `?gfx=no-hdr` and `?gfx=no-mip` force the fallback on a machine the probe
 * passed, and `?gfx=hdr` / `?gfx=mip` force the fast path on one it failed —
 * which is how the question "is this the pass that corrupts the picture" gets
 * answered in a reload instead of a build. See `lib/three/gfx.ts`.
 */
export function hdrTargetSupport(renderer: THREE.WebGLRenderer): HdrTargetSupport {
  const known = cache.get(renderer);
  if (known) return known;

  const probed = runProbe(renderer);
  const support: HdrTargetSupport = {
    renderable: gfxAllows('hdr', probed.renderable),
    /* Mipmapped half-float needs both: a GPU that renders into one at all, and
       one whose mip chain is usable. `no-hdr` therefore implies `no-mip`
       without the caller having to pass both. */
    mipmappable: gfxAllows('hdr', probed.renderable) && gfxAllows('mip', probed.mipmappable),
  };
  cache.set(renderer, support);

  /* Recorded, not just logged: on an iPad there is nothing reading the console,
     and `window.__gfx.report()` is how this answer gets off the device. */
  gfxRecord('hdrProbe', { measured: probed, inForce: support });
  console.info(
    `[gfx] half-float targets — measured renderable=${probed.renderable} mipmappable=${probed.mipmappable}`
    + `, in force renderable=${support.renderable} mipmappable=${support.mipmappable}`,
  );
  return support;
}

/** The colour type a full-screen intermediate should use on this renderer. */
export function hdrTargetType(renderer: THREE.WebGLRenderer): THREE.TextureDataType {
  return hdrTargetSupport(renderer).renderable ? THREE.HalfFloatType : THREE.UnsignedByteType;
}

/**
 * The colour type a **mipmapped** intermediate should use.
 *
 * Separate from `hdrTargetType` because the two failures are separate: a GPU
 * that renders half-float correctly may still botch its mip chain, and the
 * caller here — a refraction capture read through `textureLod` — is the one
 * place that cannot simply ignore the difference.
 */
export function hdrMipTargetType(renderer: THREE.WebGLRenderer): THREE.TextureDataType {
  const support = hdrTargetSupport(renderer);
  return support.renderable && support.mipmappable ? THREE.HalfFloatType : THREE.UnsignedByteType;
}
