import * as THREE from 'three';

/**
 * Small HDR bloom pass reserved for the underwater specimen stage.
 *
 * Peach's fish and jellyfish are not brighter because their GLBs are different
 * (the local files are byte-identical to the HAR assets). Their emissive and wet
 * highlights are allowed to spread into the dark background. This pass keeps
 * that behaviour local to the ocean renderer: one quarter-resolution extract,
 * one separable blur, then a linear-light composite before ACES.
 */
export type OceanBloomPass = {
  /** Linear HDR bloom texture, ready for the waterline composite. */
  texture: THREE.Texture;
  setSize(width: number, height: number): void;
  prepare(renderer: THREE.WebGLRenderer, source: THREE.Texture): void;
  render(
    renderer: THREE.WebGLRenderer,
    source: THREE.Texture,
    strength: number,
    exposure: number,
    target: THREE.WebGLRenderTarget | null,
    /* False skips the extract and both blur passes and composites with a
       strength of zero — three half-float targets and three full-screen draws
       that stop happening, which is what makes `?gfx=no-bloom` an elimination
       step rather than a dimmer. */
    enabled?: boolean,
  ): void;
  dispose(): void;
};

const vertexShader = /* glsl */ `
  precision highp float;
  in vec3 position;
  in vec2 uv;
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

function passMaterial(fragmentShader: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.RawShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    glslVersion: THREE.GLSL3,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

export function createOceanBloomPass(
  compact: boolean,
  /* Half-float unless `lib/three/hdrTarget.ts` found this GPU cannot render into
     one. Bloom is the pass with the most to lose from eight bits — its whole job
     is the range above white — so it takes the probe's answer rather than
     assuming, and banded glow beats no glow. */
  targetType: THREE.TextureDataType = THREE.HalfFloatType,
): OceanBloomPass {
  const targetOptions = {
    type: targetType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: false,
  } as const;
  const bloomA = new THREE.WebGLRenderTarget(1, 1, targetOptions);
  const bloomB = new THREE.WebGLRenderTarget(1, 1, targetOptions);
  bloomA.texture.colorSpace = THREE.LinearSRGBColorSpace;
  bloomB.texture.colorSpace = THREE.LinearSRGBColorSpace;

  const extractUniforms = {
    uSource: { value: null as THREE.Texture | null },
  };
  const extract = passMaterial(/* glsl */ `
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;
    uniform sampler2D uSource;
    void main() {
      vec3 color = texture(uSource, vUv).rgb;
      float peak = max(max(color.r, color.g), color.b);
      /* A soft HDR knee keeps white scales and emissive tissue while leaving the
         dark water, text scrim and most of the sand completely untouched. */
      float contribution = smoothstep(0.94, 1.72, peak);
      contribution *= contribution;
      fragColor = vec4(color * contribution, 1.0);
    }
  `, extractUniforms);

  const blurUniforms = {
    uSource: { value: null as THREE.Texture | null },
    uDirection: { value: new THREE.Vector2(1, 0) },
  };
  const blur = passMaterial(/* glsl */ `
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;
    uniform sampler2D uSource;
    uniform vec2 uDirection;
    void main() {
      vec3 color = texture(uSource, vUv).rgb * 0.227027;
      color += texture(uSource, vUv + uDirection * 1.384615).rgb * 0.316216;
      color += texture(uSource, vUv - uDirection * 1.384615).rgb * 0.316216;
      color += texture(uSource, vUv + uDirection * 3.230769).rgb * 0.070270;
      color += texture(uSource, vUv - uDirection * 3.230769).rgb * 0.070270;
      fragColor = vec4(color, 1.0);
    }
  `, blurUniforms);

  const compositeUniforms = {
    uSource: { value: null as THREE.Texture | null },
    uBloom: { value: bloomA.texture },
    uStrength: { value: 1 },
    uExposure: { value: 1 },
  };
  const composite = passMaterial(/* glsl */ `
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;
    uniform sampler2D uSource;
    uniform sampler2D uBloom;
    uniform float uStrength;
    uniform float uExposure;

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
      return clamp(ACESOutputMat * color, 0.0, 1.0);
    }
    vec3 sRGBTransferOETF(vec3 value) {
      return mix(
        pow(value, vec3(0.41666)) * 1.055 - vec3(0.055),
        value * 12.92,
        vec3(lessThanEqual(value, vec3(0.0031308)))
      );
    }
    void main() {
      vec3 radiance = texture(uSource, vUv).rgb;
      radiance += texture(uBloom, vUv).rgb * uStrength;
      fragColor = vec4(sRGBTransferOETF(acesFilmic(max(radiance, 0.0))), 1.0);
    }
  `, compositeUniforms);

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), extract);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let width = 1;
  let height = 1;

  const prepare = (renderer: THREE.WebGLRenderer, source: THREE.Texture) => {
    extractUniforms.uSource.value = source;
    quad.material = extract;
    renderer.setRenderTarget(bloomA);
    renderer.render(scene, camera);

    blurUniforms.uSource.value = bloomA.texture;
    blurUniforms.uDirection.value.set(1 / width, 0);
    quad.material = blur;
    renderer.setRenderTarget(bloomB);
    renderer.render(scene, camera);

    blurUniforms.uSource.value = bloomB.texture;
    blurUniforms.uDirection.value.set(0, 1 / height);
    renderer.setRenderTarget(bloomA);
    renderer.render(scene, camera);
  };

  return {
    texture: bloomA.texture,
    setSize(nextWidth, nextHeight) {
      const scale = compact ? 0.22 : 0.28;
      width = Math.max(1, Math.floor(nextWidth * scale));
      height = Math.max(1, Math.floor(nextHeight * scale));
      bloomA.setSize(width, height);
      bloomB.setSize(width, height);
    },
    prepare,
    render(renderer, source, strength, exposure, target, enabled = true) {
      if (enabled) prepare(renderer, source);
      compositeUniforms.uSource.value = source;
      compositeUniforms.uBloom.value = bloomA.texture;
      compositeUniforms.uStrength.value = strength;
      compositeUniforms.uExposure.value = exposure;
      quad.material = composite;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    },
    dispose() {
      quad.geometry.dispose();
      extract.dispose();
      blur.dispose();
      composite.dispose();
      bloomA.dispose();
      bloomB.dispose();
    },
  };
}
