import * as THREE from 'three';

/**
 * The land → ocean crossing, as one shader.
 *
 * The page has two worlds with irreconcilable cameras: the flower valley's is
 * choreographed across two chapters, and the reef's is a hand-approved constant
 * that nothing may move. They cannot share a camera, so they are rendered to two
 * targets by the same renderer and joined here — the brief's second permitted
 * architecture, and on this page the only honest one.
 *
 * What this is NOT is a crossfade. A dissolve between two images is exactly what
 * the pass exists to avoid, and the difference is entirely in the boundary:
 *
 *   - there is a *line*, at a height the caller drives, and it travels from below
 *     the frame to above it. Sinking, seen from inside the frame, is the surface
 *     climbing the view — so water fills upward and the sky closes over.
 *   - the line is not straight. Two sine trains at incommensurable frequencies
 *     displace it, so the surface has swell rather than being a wipe.
 *   - above the line, near it, the land is refracted: sampled through a
 *     displacement that grows toward the boundary and is dispersed per channel,
 *     which is what a wet meniscus does to what is behind it.
 *   - below the line, near it, the land comes *back* — compressed, flipped and
 *     fading with depth. That is Snell's window: from under the surface the
 *     world above is squeezed into a cone and the rest of the underside turns
 *     into a mirror. It is the single strongest cue that the eye is now below
 *     the water rather than in front of a blue picture.
 *   - the line itself carries a thin bright meniscus, brightest where the swell
 *     is steepest.
 *
 * Everything is a pure function of `uDive`, so scrolling upward runs the whole
 * thing backwards with no state to restore.
 */

export type WaterlinePass = {
  mesh: THREE.Mesh;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  uniforms: {
    uLand: { value: THREE.Texture | null };
    uOcean: { value: THREE.Texture | null };
    uDive: { value: number };
    uLine: { value: number };
    uBand: { value: number };
    uTime: { value: number };
    uAspect: { value: number };
    uExposure: { value: number };
  };
  dispose(): void;
};

export function createWaterlinePass(): WaterlinePass {
  const uniforms = {
    uLand: { value: null as THREE.Texture | null },
    uOcean: { value: null as THREE.Texture | null },
    uDive: { value: 0 },
    uLine: { value: -0.4 },
    uBand: { value: 0.02 },
    uTime: { value: 0 },
    uAspect: { value: 1.777 },
    uExposure: { value: 1 },
  };

  const material = new THREE.RawShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms,
    glslVersion: THREE.GLSL3,
    vertexShader: /* glsl */ `
      precision highp float;
      in vec3 position;
      in vec2 uv;
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      in vec2 vUv;
      out vec4 fragColor;

      uniform sampler2D uLand;
      uniform sampler2D uOcean;
      uniform float uDive;
      uniform float uLine;
      uniform float uBand;
      uniform float uTime;
      uniform float uAspect;
      uniform float uExposure;

      /*
       * Both inputs are LINEAR and un-tone-mapped.
       *
       * three only applies tone mapping and the output transfer function when it
       * renders to the default framebuffer, so a scene rendered into a target
       * arrives here as raw radiance. That is the right place to be working: the
       * refraction, the Snell window and the meniscus are all light arithmetic
       * and doing them after a filmic curve would compress the boundary exactly
       * where it needs range. So the pass blends linear and then runs the same
       * ACES curve and sRGB transfer three would have run — byte-for-byte the
       * chunks in tonemapping_pars_fragment and colorspace_pars_fragment —
       * so a frame at dive 0.001 is indistinguishable from the direct render at
       * dive 0.
       */
      vec3 RRTAndODTFit(vec3 v) {
        vec3 a = v * (v + 0.0245786) - 0.000090537;
        vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
        return a / b;
      }

      vec3 acesFilmic(vec3 color) {
        const mat3 ACESInputMat = mat3(
          vec3(0.59719, 0.07600, 0.02840),
          vec3(0.35458, 0.90834, 0.13383),
          vec3(0.04823, 0.01566, 0.83777)
        );
        const mat3 ACESOutputMat = mat3(
          vec3( 1.60475, -0.10208, -0.00327),
          vec3(-0.53108,  1.10813, -0.07276),
          vec3(-0.07367, -0.00605,  1.07602)
        );
        color *= uExposure / 0.6;
        color = ACESInputMat * color;
        color = RRTAndODTFit(color);
        color = ACESOutputMat * color;
        return clamp(color, 0.0, 1.0);
      }

      vec3 sRGBTransferOETF(vec3 value) {
        return mix(
          pow(value, vec3(0.41666)) * 1.055 - vec3(0.055),
          value * 12.92,
          vec3(lessThanEqual(value, vec3(0.0031308)))
        );
      }

      /* The surface, as a height field along x. Three trains, none a multiple of
         another, so the swell never repeats inside a frame width. */
      float surface(float x) {
        return  sin(x * 6.10 + uTime * 0.72) * 0.0090
              + sin(x * 11.30 - uTime * 0.51) * 0.0052
              + sin(x * 21.70 + uTime * 1.09) * 0.0022;
      }

      /* Its slope, as a finite difference — used for the meniscus, which should
         be brightest where the surface is steepest, exactly as a real one is. */
      float surfaceSlope(float x) {
        return (surface(x + 0.004) - surface(x - 0.004)) / 0.008;
      }

      vec3 sampleLand(vec2 uv) { return texture(uLand, clamp(uv, vec2(0.0005), vec2(0.9995))).rgb; }
      vec3 sampleOcean(vec2 uv) { return texture(uOcean, clamp(uv, vec2(0.0005), vec2(0.9995))).rgb; }

      void main() {
        vec2 uv = vUv;
        float wave = surface(uv.x * uAspect);
        float line = uLine + wave;
        float band = max(uBand, 0.0008);

        /* Signed distance from the surface, positive above it, in frame heights. */
        float d = uv.y - line;
        /* 0 above the surface, 1 below it, with a hairline of anti-aliasing so
           the boundary is never a stair-stepped edge on a high-DPR screen. */
        float below = smoothstep(0.0012, -0.0012, d);

        /* ------------------------------------------------------------ above --- */
        /*
         * The air half, refracted through the meniscus.
         *
         * The displacement grows as the boundary is approached rather than being
         * constant across the band: away from the surface the air is just air.
         * The vertical term compresses toward the line, which is what makes the
         * last stretch of land squash into the surface instead of sliding under
         * it.
         */
        float nearAbove = 1.0 - smoothstep(0.0, band * 2.6, max(d, 0.0));
        float push = nearAbove * nearAbove;
        vec2 warp = vec2(wave * 2.2 * push, -push * band * 0.55);
        vec3 air;
        /* Chromatic dispersion, only where the warp is actually doing something —
           a per-channel offset across the whole frame would just look like a
           misconverged monitor. */
        float disp = push * 0.0028;
        air.r = sampleLand(uv + warp + vec2(disp, 0.0)).r;
        air.g = sampleLand(uv + warp).g;
        air.b = sampleLand(uv + warp - vec2(disp, 0.0)).b;

        /*
         * The land cools as the water rises.
         *
         * Without this the ivory meadow stays ivory right up to the moment it is
         * covered, and the crossing reads as a blue shape sliding over a warm
         * picture. Grading the air half toward the water's own colour — more
         * strongly the closer the surface gets — is what makes the two halves
         * belong to one photograph.
         */
        /* Linear radiance, not a swatch: this is graded before the curve. */
        vec3 water = vec3(0.0044, 0.082, 0.236);
        float chill = smoothstep(0.02, 0.72, uDive);
        /*
         * The air half loses light as the surface approaches.
         *
         * 0.55 / 0.14 was far too gentle against a pale sky: the crossing read
         * as a white-out with a reef appearing under it. Water swallows light,
         * so the grade both pulls harder toward the water's own colour and
         * genuinely darkens — which is what makes the last land frames feel like
         * going under rather than fading out.
         */
        air = mix(air, mix(air, water, 0.72), chill * 0.82);
        air *= 1.0 - chill * 0.34;

        /* ------------------------------------------------------------ below --- */
        vec3 sea = sampleOcean(uv);

        /*
         * Snell's window.
         *
         * Under the surface, the world above is compressed into a cone around
         * straight-up and everything outside it is a mirror. Approximated here
         * as a vertically flipped, strongly compressed re-sample of the land,
         * blended in only just under the line and falling off fast — the depth
         * ramp is the cone, and the horizontal wobble is the swell breaking it up.
         */
        float underDepth = max(-d, 0.0);
        /* 1.7 band-widths, not 3.4. At the wider figure the window reached a
           third of the way down a 1080 frame and put a pale wash across the top
           of the reef — a Snell cone that size is not a cone. */
        float windowFade = 1.0 - smoothstep(0.0, band * 1.7, underDepth);
        vec2 mirrored = vec2(
          uv.x + wave * 3.4 + sin(uv.y * 34.0 + uTime * 1.3) * band * 0.16,
          line + underDepth * 0.42
        );
        /* Attenuated: light reaching the eye through the underside of the
           surface has been through water, and a full-strength copy of an ivory
           sky put a pale band across the top of the reef. */
        vec3 ceiling = sampleLand(mirrored) * vec3(0.62, 0.78, 0.86);
        /* Fresnel: at grazing angles the underside reflects the sea back rather
           than showing the sky, so the window is brightest near the line and
           tinted into the water as it spreads. */
        float fresnel = pow(windowFade, 1.7);
        sea = mix(sea, mix(sea * 1.06, ceiling, 0.58), fresnel * 0.5 * (1.0 - smoothstep(0.86, 1.0, uDive)));

        /* ------------------------------------------------------- the surface --- */
        vec3 color = mix(air, sea, below);

        /* Meniscus: a thin bright line on the boundary, gained by the swell's
           own slope so the highlight runs along the crests. */
        float lip = exp(-pow(d / (band * 0.34 + 0.0016), 2.0));
        float sheen = 0.35 + 0.65 * clamp(abs(surfaceSlope(uv.x * uAspect)) * 6.0, 0.0, 1.0);
        float alive = smoothstep(0.0, 0.06, uDive) * (1.0 - smoothstep(0.9, 1.0, uDive));
        color += vec3(0.62, 0.92, 1.0) * lip * 0.34 * sheen * alive;

        /* And a short shadowed skirt just under it, which is what gives the
           surface thickness instead of leaving it a drawn line. */
        float skirt = (1.0 - smoothstep(0.0, band * 1.5, underDepth)) * below;
        color *= 1.0 - skirt * 0.16;

        fragColor = vec4(sRGBTransferOETF(acesFilmic(max(color, 0.0))), 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    mesh,
    scene,
    camera,
    uniforms,
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
