import * as THREE from 'three';

/**
 * Soft gradient field for the Explore stage.
 *
 * Two half-float targets are ping-ponged through a small simulation pass that
 * carries a velocity field in RG and a two-frame wave state in BA, so a pointer
 * impulse propagates outward and decays instead of being redrawn as concentric
 * sine rings every frame. The display pass reads the height gradient and uses
 * it as a very small refraction offset into an analytic gradient field.
 *
 * Deliberately restrained. An earlier pass ran this as a full caustic surface:
 * it fought the typography above it, made every panel read as a different
 * background, and tired the eye out well before the product sections. The whole
 * effect now lives in the last few percent of the value range — it is a lit
 * studio wall that breathes, and the amplitude is low enough that the creature
 * and the copy are the only things the eye lands on.
 */

const simVertex = /* glsl */ `
  attribute vec3 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const simFragment = /* glsl */ `
  precision highp float;
  uniform sampler2D uPrev;
  uniform vec2 uTexel;
  uniform vec2 uPointer;
  uniform vec2 uPointerVelocity;
  uniform float uPointerStrength;
  uniform float uAspect;
  uniform float uTime;
  uniform float uDelta;
  uniform float uAmbient;
  varying vec2 vUv;

  vec4 fetch(vec2 uv) {
    return texture2D(uPrev, clamp(uv, uTexel * 0.5, vec2(1.0) - uTexel * 0.5));
  }

  float emitter(vec2 uv, vec2 center, float radius) {
    vec2 d = (uv - center) * vec2(uAspect, 1.0);
    return exp(-dot(d, d) / radius);
  }

  void main() {
    vec4 current = fetch(vUv);
    vec2 velocity = current.rg;
    float height = current.b;
    float previous = current.a;

    float left = fetch(vUv - vec2(uTexel.x, 0.0)).b;
    float right = fetch(vUv + vec2(uTexel.x, 0.0)).b;
    float down = fetch(vUv - vec2(0.0, uTexel.y)).b;
    float up = fetch(vUv + vec2(0.0, uTexel.y)).b;
    float laplacian = (left + right + down + up) - 4.0 * height;

    // Damped wave propagation. Two stored frames give real travelling fronts;
    // the decay term is what makes a disturbance die out on its own.
    float next = (2.0 * height - previous) + 0.284 * laplacian;
    next *= 0.9942;

    // Pointer impulse: a soft dome of displacement plus a directional shove so
    // fast strokes leave a wake instead of a symmetric ring.
    float touch = emitter(vUv, uPointer, 0.0022);
    next += touch * uPointerStrength * 0.20;

    // Slow drifting emitters keep the resting surface alive without a pointer.
    vec2 driftA = vec2(0.27 + 0.10 * sin(uTime * 0.121), 0.68 + 0.07 * cos(uTime * 0.098));
    vec2 driftB = vec2(0.76 + 0.08 * cos(uTime * 0.083), 0.31 + 0.09 * sin(uTime * 0.147));
    vec2 driftC = vec2(0.52 + 0.12 * sin(uTime * 0.061 + 2.1), 0.5 + 0.10 * cos(uTime * 0.071));
    float ambient =
      emitter(vUv, driftA, 0.020) * sin(uTime * 0.83)
      + emitter(vUv, driftB, 0.026) * sin(uTime * 0.61 + 1.7)
      + emitter(vUv, driftC, 0.033) * sin(uTime * 0.44 + 3.4);
    next += ambient * uAmbient;

    // Semi-Lagrangian self advection keeps the flow smeared along its own path.
    vec2 advected = fetch(vUv - velocity * uDelta * 0.55).rg;
    velocity = mix(velocity, advected, 0.82);
    vec2 direction = vUv - uPointer;
    float len = max(length(direction), 1e-4);
    velocity += (direction / len) * touch * uPointerStrength * 0.16;
    velocity += uPointerVelocity * touch * 0.70;
    velocity += vec2(right - left, up - down) * 0.12;
    velocity *= 0.9685;

    gl_FragColor = vec4(clamp(velocity, -1.6, 1.6), clamp(next, -1.4, 1.4), height);
  }
`;

const displayVertex = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/*
 * `LIQUID_SIM` is a compile-time switch, not a strength of zero.
 *
 * When the simulation is off there is no state to read, and the version of this
 * shader that read it anyway and multiplied by `uSimStrength = 0` was wrong in a
 * way that only showed up on other people's hardware. Two reasons, and the
 * second is the one that reached a screen:
 *
 *   - `0.0 * x` is not 0 for every x. It is NaN for NaN and for Inf, and a
 *     half-float target that has never been rendered into holds undefined
 *     memory, which decodes to both. The NaN then propagates through `field()`,
 *     and `max(colour, 0.0)` does not remove it — GLSL leaves `max` with a NaN
 *     operand implementation-defined. What arrived on an iPad was a flat
 *     saturated green backdrop behind the entire hero.
 *   - Even where the numbers behave, five texture fetches per pixel of a
 *     full-screen plate is real fragment cost paid for a term that is known to
 *     be zero — on exactly the devices that turned the simulation off to save
 *     that cost.
 *
 * Compiling it out answers both, and means the sim targets do not have to exist
 * at all in that mode.
 */
const displayFragment = /* glsl */ `
  precision highp float;
  #ifdef LIQUID_SIM
  uniform sampler2D uSim;
  uniform vec2 uSimTexel;
  #endif
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uSimStrength;
  uniform vec3 uMist;
  uniform vec3 uPrimary;
  uniform vec3 uSecondary;
  uniform vec3 uAccent;
  uniform vec3 uDeep;
  uniform float uVignette;

  float mass(vec2 p, vec2 center, float radius, float blur) {
    return 1.0 - smoothstep(radius - blur, radius + blur, length(p - center));
  }

  // Two-octave sine warp. Cheaper than noise, and the low frequency reads as
  // slow-moving liquid rather than as a scrolling texture.
  vec2 warp(vec2 p, float t) {
    float a = sin(p.y * 1.35 + t * 0.11) * 0.055 + sin(p.y * 2.7 - t * 0.07) * 0.022;
    float b = cos(p.x * 1.22 - t * 0.09) * 0.05 + cos(p.x * 2.45 + t * 0.06) * 0.02;
    return p + vec2(a, b);
  }

  vec3 field(vec2 p, float t) {
    vec2 w = warp(p, t);
    float drift = t * 0.045;
    float m1 = mass(w, vec2(0.34 + sin(drift) * 0.05, 0.20 + cos(drift * 0.8) * 0.04), 0.60, 0.40);
    float m2 = mass(w, vec2(-0.46 + cos(drift * 1.1) * 0.05, -0.06 + sin(drift * 0.9) * 0.05), 0.52, 0.36);
    float m3 = mass(w, vec2(0.10 + sin(drift * 1.4) * 0.04, -0.50), 0.46, 0.33);
    float m4 = mass(w, vec2(-0.22 + cos(drift * 0.7) * 0.06, 0.42), 0.34, 0.30);
    vec3 color = uMist;
    color = mix(color, uPrimary, m1 * 0.30);
    color = mix(color, uSecondary, m2 * 0.26);
    color = mix(color, uAccent, m3 * 0.20);
    color = mix(color, uDeep, m4 * 0.11);
    return color;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

    vec2 gradient = vec2(0.0);
    vec2 flow = vec2(0.0);
    float height = 0.0;
    #ifdef LIQUID_SIM
      vec4 sim = texture2D(uSim, uv);
      float left = texture2D(uSim, uv - vec2(uSimTexel.x, 0.0)).b;
      float right = texture2D(uSim, uv + vec2(uSimTexel.x, 0.0)).b;
      float down = texture2D(uSim, uv - vec2(0.0, uSimTexel.y)).b;
      float up = texture2D(uSim, uv + vec2(0.0, uSimTexel.y)).b;
      gradient = vec2(right - left, up - down) * uSimStrength;
      flow = sim.rg * uSimStrength;
      height = sim.b * uSimStrength;
    #endif

    vec3 color;
    #ifdef LIQUID_SIM
      // Refraction through the surface, with a slight per-channel spread so the
      // crests break into colour the way thin water does. Three evaluations,
      // because the three channels are sampled at three different points — that
      // separation IS the dispersion.
      vec2 offset = gradient * 0.13 + flow * 0.006;
      color.r = field(p + offset * 1.05, uTime).r;
      color.g = field(p + offset, uTime).g;
      color.b = field(p + offset * 0.95, uTime).b;
    #else
      /*
       * One evaluation, and it is not an approximation of the three above — it
       * is the same answer.
       *
       * With no simulation there is no offset, so all three calls were being
       * handed an identical p and their results thrown away down to one channel
       * each. field() is twelve mass lobes over a two-octave sine warp, on a
       * plate that covers the viewport and is drawn up to three times a frame
       * (the canvas, the bee's refraction capture, and the same capture again in
       * the foreground context). Paying for it three times per pixel to keep one
       * channel of each was the largest avoidable fragment cost in the hero on
       * the devices that turn the simulation off — which are the phones.
       */
      color = field(p, uTime);
    #endif

    vec3 normal = normalize(vec3(-gradient * 6.0, 1.0));
    vec3 view = normalize(vec3(p * 0.35, 1.0));
    vec3 lightDir = normalize(vec3(-0.44, 0.72, 0.54));
    vec3 halfDir = normalize(lightDir + view);
    float sheen = pow(max(dot(normal, halfDir), 0.0), 10.0);

    color += sheen * vec3(1.0, 0.99, 1.0) * 0.014;
    color += max(height, 0.0) * uSecondary * 0.022;
    color -= max(-height, 0.0) * vec3(0.014, 0.013, 0.011);

    float vignette = 1.0 - uVignette * dot(p, p) * 0.12;
    color *= vignette;
    color += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.0035;
    gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
  }
`;

export type LiquidPalette = {
  mist: THREE.Color;
  primary: THREE.Color;
  secondary: THREE.Color;
  accent: THREE.Color;
  deep: THREE.Color;
};

export function liquidPalette(
  mist: number,
  primary: number,
  secondary: number,
  accent: number,
  deep: number,
): LiquidPalette {
  return {
    mist: new THREE.Color(mist),
    primary: new THREE.Color(primary),
    secondary: new THREE.Color(secondary),
    accent: new THREE.Color(accent),
    deep: new THREE.Color(deep),
  };
}

export type LiquidSurface = {
  mesh: THREE.Mesh;
  palette: {
    uMist: { value: THREE.Color };
    uPrimary: { value: THREE.Color };
    uSecondary: { value: THREE.Color };
    uAccent: { value: THREE.Color };
    uDeep: { value: THREE.Color };
  };
  setSize: (width: number, height: number, pixelRatio: number) => void;
  step: (
    renderer: THREE.WebGLRenderer,
    delta: number,
    elapsed: number,
    pointer: THREE.Vector2,
    pointerVelocity: THREE.Vector2,
    strength: number,
  ) => void;
  dispose: () => void;
};

export function createLiquidSurface(options: {
  palette: LiquidPalette;
  simScale: number;
  simulate: boolean;
  planeWidth: number;
  planeHeight: number;
  /**
   * Colour type for the two simulation targets.
   *
   * Half-float by default, because the state is a signed velocity field that
   * eight bits cannot carry. `lib/three/hdrTarget.ts` decides whether this GPU
   * can be given one; where it cannot, the caller passes `UnsignedByteType` and
   * the surface loses direction in its flow rather than the whole page losing
   * its backdrop.
   */
  targetType?: THREE.TextureDataType;
}): LiquidSurface {
  const { palette, simScale, simulate } = options;

  const targetOptions = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: options.targetType ?? THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  } as const;
  /*
   * Allocated only when they will be written.
   *
   * Nothing samples these unless `LIQUID_SIM` is defined on the display
   * material, so in the still mode they would be two half-float buffers held
   * for the life of the page and read by nobody — and, before the shader was
   * given that switch, read by everybody. See `displayFragment`.
   */
  const targets = simulate
    ? [
        new THREE.WebGLRenderTarget(4, 4, targetOptions),
        new THREE.WebGLRenderTarget(4, 4, targetOptions),
      ]
    : [];
  for (const target of targets) target.texture.colorSpace = THREE.NoColorSpace;
  let readIndex = 0;

  const simUniforms = {
    uPrev: { value: targets[0]?.texture ?? null },
    uTexel: { value: new THREE.Vector2(0.25, 0.25) },
    uPointer: { value: new THREE.Vector2(0.5, 0.5) },
    uPointerVelocity: { value: new THREE.Vector2() },
    uPointerStrength: { value: 0 },
    uAspect: { value: 1 },
    uTime: { value: 0 },
    uDelta: { value: 1 / 60 },
    uAmbient: { value: 0.0011 },
  };
  const simMaterial = new THREE.RawShaderMaterial({
    vertexShader: simVertex,
    fragmentShader: simFragment,
    uniforms: simUniforms,
    depthTest: false,
    depthWrite: false,
  });
  const simScene = new THREE.Scene();
  const simQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMaterial);
  simQuad.frustumCulled = false;
  simScene.add(simQuad);
  const simCamera = new THREE.Camera();

  const displayUniforms = {
    uSim: { value: targets[0]?.texture ?? null },
    uSimTexel: { value: new THREE.Vector2(0.25, 0.25) },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uSimStrength: { value: simulate ? 1 : 0 },
    uMist: { value: palette.mist.clone() },
    uPrimary: { value: palette.primary.clone() },
    uSecondary: { value: palette.secondary.clone() },
    uAccent: { value: palette.accent.clone() },
    uDeep: { value: palette.deep.clone() },
    uVignette: { value: 1 },
  };
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(options.planeWidth, options.planeHeight),
    new THREE.ShaderMaterial({
      defines: simulate ? { LIQUID_SIM: '' } : {},
      vertexShader: displayVertex,
      fragmentShader: displayFragment,
      uniforms: displayUniforms,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    }),
  );
  mesh.frustumCulled = false;
  let seeded = false;

  const setSize = (width: number, height: number, pixelRatio: number) => {
    const renderWidth = Math.max(1, Math.floor(width * pixelRatio));
    const renderHeight = Math.max(1, Math.floor(height * pixelRatio));
    displayUniforms.uResolution.value.set(renderWidth, renderHeight);
    const simWidth = Math.max(48, Math.min(340, Math.floor(width * simScale)));
    const simHeight = Math.max(48, Math.min(340, Math.floor(height * simScale)));
    for (const target of targets) target.setSize(simWidth, simHeight);
    simUniforms.uTexel.value.set(1 / simWidth, 1 / simHeight);
    simUniforms.uAspect.value = simWidth / simHeight;
    displayUniforms.uSimTexel.value.set(1 / simWidth, 1 / simHeight);
    seeded = false;
  };

  const clearColor = new THREE.Color();
  const step: LiquidSurface['step'] = (renderer, delta, elapsed, pointer, pointerVelocity, strength) => {
    displayUniforms.uTime.value = elapsed;
    if (!simulate) return;
    const previousTarget = renderer.getRenderTarget();
    if (!seeded) {
      // A freshly sized half-float target holds undefined memory; clear both
      // sides before the first simulation pass so NaNs never enter the state.
      renderer.getClearColor(clearColor);
      const clearAlpha = renderer.getClearAlpha();
      renderer.setClearColor(0x000000, 0);
      for (const target of targets) {
        renderer.setRenderTarget(target);
        renderer.clear(true, false, false);
      }
      renderer.setClearColor(clearColor, clearAlpha);
      seeded = true;
    }
    simUniforms.uPrev.value = targets[readIndex].texture;
    simUniforms.uPointer.value.copy(pointer);
    simUniforms.uPointerVelocity.value.copy(pointerVelocity);
    simUniforms.uPointerStrength.value = strength;
    simUniforms.uTime.value = elapsed;
    simUniforms.uDelta.value = Math.min(delta, 1 / 30);
    const writeIndex = readIndex ^ 1;
    renderer.setRenderTarget(targets[writeIndex]);
    renderer.render(simScene, simCamera);
    renderer.setRenderTarget(previousTarget);
    readIndex = writeIndex;
    displayUniforms.uSim.value = targets[readIndex].texture;
  };

  return {
    mesh,
    palette: displayUniforms,
    setSize,
    step,
    dispose: () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      simQuad.geometry.dispose();
      simMaterial.dispose();
      for (const target of targets) target.dispose();
    },
  };
}
