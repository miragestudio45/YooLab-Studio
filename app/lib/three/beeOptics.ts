import * as THREE from 'three';

/**
 * Optical glass bee.
 *
 * Rebuilt against the reference implementation recovered from
 * `reference-audit/har/bee.har` (`demoBee.C948SwLj.js`). The three things that
 * made the previous pass read as red resin instead of gem glass were all
 * structural, not a matter of tuning:
 *
 *   1. the shell was tinted ruby and absorbed hard (Beer-Lambert over a fake
 *      thickness), so the body became a dense red slab. In the reference the
 *      shell is *colourless* — `u_baseColor` is white — and every bit of red in
 *      the frame comes from the inner body seen *through* clear glass.
 *   2. the volume tint is cool, not warm: `#d0e8ff` mixed in by
 *      `exp(-density * thickness)`. That is what puts pale blue in the thick
 *      grazing areas and lets the red core stay clean where you look straight
 *      at it. A warm absorption curve cannot produce that.
 *   3. the inner shell was inset by ~1.1% of the model diagonal — roughly 30x
 *      the reference — so it detached from the silhouette and read as a second
 *      object. The reference insets by exactly one geometry unit
 *      (`position - normal`, ~0.07% here) and leans on polygon offset instead.
 *
 * Everything else follows the reference: world-space `refract()` per channel
 * with a dispersion split, a mip-blurred screen sample for refraction
 * roughness, GGX specular weighted by Fresnel, a coral edge tint at
 * `pow(1 - NdotV, 4)`, and derivative-space normal mapping at 2x strength.
 *
 * Three skinned meshes share the one geometry and the one skeleton:
 *   - core: the same surface, barely inset, shaded as a flat lit red body with
 *     amber thorax and segmented abdomen. It is what the shell refracts.
 *   - shell: colourless optical glass over it.
 *   - wings: thin membrane, near-clear, thin-film iridescence.
 */

export type BeeParts = {
  attributes: {
    aPart: THREE.BufferAttribute;
    aBody: THREE.BufferAttribute;
  };
};

type PartIndex = 0 | 1 | 2 | 3 | 4;

const PART_WING: PartIndex = 0;
const PART_THORAX: PartIndex = 1;
const PART_ABDOMEN: PartIndex = 2;
const PART_HEAD: PartIndex = 3;
const PART_LIMB: PartIndex = 4;

function classifyJoint(name: string): PartIndex {
  const lower = name.toLowerCase();
  if (lower.includes('wing')) return PART_WING;
  if (lower.includes('thorax')) return PART_THORAX;
  if (lower.includes('abdomen')) return PART_ABDOMEN;
  if (
    lower.includes('head')
    || lower.includes('mandib')
    || lower.includes('antenna')
    || lower.includes('labrum')
  ) return PART_HEAD;
  if (lower.includes('leg') || lower.includes('middle')) return PART_LIMB;
  return PART_THORAX;
}

/**
 * Builds the anatomy attributes for a skinned bee mesh.
 *
 * The shipped GLB is a single skinned mesh with one empty material, so there is
 * no authored split between wing, thorax, abdomen and head. Each vertex is
 * classified by the joints that actually influence it instead, and the distance
 * from the vertex to its weighted joint origin becomes a local limb radius.
 *
 * `aPart` carries the wing / thorax / abdomen / head weights (limb weight is the
 * remainder). `aBody` carries x = normalised limb radius, y = normalised head to
 * abdomen axis position, z = abdomen segment phase for the interior banding.
 */
export function buildBeeAnatomy(mesh: THREE.SkinnedMesh): BeeParts {
  const geometry = mesh.geometry;
  const skinIndex = geometry.getAttribute('skinIndex');
  const skinWeight = geometry.getAttribute('skinWeight');
  const position = geometry.getAttribute('position');
  const count = position.count;
  const bones = mesh.skeleton.bones;

  const jointPart = new Uint8Array(bones.length);
  const jointOrigin = new Float32Array(bones.length * 3);
  const abdomenOrder = new Float32Array(bones.length);
  const inverse = new THREE.Matrix4();
  const origin = new THREE.Vector3();
  let abdomenCount = 0;
  for (let index = 0; index < bones.length; index += 1) {
    const name = bones[index].name ?? '';
    jointPart[index] = classifyJoint(name);
    inverse.copy(mesh.skeleton.boneInverses[index]).invert();
    origin.setFromMatrixPosition(inverse);
    jointOrigin[index * 3] = origin.x;
    jointOrigin[index * 3 + 1] = origin.y;
    jointOrigin[index * 3 + 2] = origin.z;
    if (jointPart[index] === PART_ABDOMEN) {
      const match = /(\d+)/.exec(name.replace(/\.\d+$/, ''));
      abdomenOrder[index] = match ? Number(match[1]) : 0;
      abdomenCount += 1;
    }
  }
  let abdomenMax = 1;
  if (abdomenCount) {
    for (let index = 0; index < bones.length; index += 1) {
      if (jointPart[index] === PART_ABDOMEN) abdomenMax = Math.max(abdomenMax, abdomenOrder[index]);
    }
  }

  const part = new Float32Array(count * 4);
  const body = new Float32Array(count * 3);
  const radii = new Float32Array(count);
  const axisValues = new Float32Array(count);
  // Joint origins recovered from the inverse bind matrices live in skinning
  // space, while `position` is geometry space. glTF hands the loader a non
  // identity bind matrix here, so vertices have to be lifted into the same
  // space or every distance below is meaningless.
  const toSkinSpace = mesh.bindMatrix.clone();
  const skinned = new Float32Array(count * 3);
  const lift = new THREE.Vector3();
  const bounds = new THREE.Box3();
  for (let index = 0; index < count; index += 1) {
    lift.fromBufferAttribute(position as THREE.BufferAttribute, index).applyMatrix4(toSkinSpace);
    skinned[index * 3] = lift.x;
    skinned[index * 3 + 1] = lift.y;
    skinned[index * 3 + 2] = lift.z;
    bounds.expandByPoint(lift);
  }
  const size = bounds.getSize(new THREE.Vector3());
  // The bee is authored lying along its longest horizontal axis; use it as the
  // head to abdomen parameter so the banding follows the body, not the viewport.
  const axis = size.x >= size.z ? 0 : 2;
  const axisMin = axis === 0 ? bounds.min.x : bounds.min.z;
  const axisSpan = Math.max(1e-5, axis === 0 ? size.x : size.z);

  let radiusMax = 1e-5;
  const vertex = new THREE.Vector3();
  const weighted = new THREE.Vector3();
  for (let index = 0; index < count; index += 1) {
    vertex.set(skinned[index * 3], skinned[index * 3 + 1], skinned[index * 3 + 2]);
    weighted.set(0, 0, 0);
    let totalWeight = 0;
    let wing = 0;
    let thorax = 0;
    let abdomen = 0;
    let head = 0;
    let segment = 0;
    for (let slot = 0; slot < 4; slot += 1) {
      const weight = skinWeight.getComponent(index, slot);
      if (weight <= 0) continue;
      const joint = skinIndex.getComponent(index, slot);
      if (joint < 0 || joint >= bones.length) continue;
      totalWeight += weight;
      weighted.x += jointOrigin[joint * 3] * weight;
      weighted.y += jointOrigin[joint * 3 + 1] * weight;
      weighted.z += jointOrigin[joint * 3 + 2] * weight;
      switch (jointPart[joint]) {
        case PART_WING: wing += weight; break;
        case PART_THORAX: thorax += weight; break;
        case PART_ABDOMEN:
          abdomen += weight;
          segment += (abdomenOrder[joint] / abdomenMax) * weight;
          break;
        case PART_HEAD: head += weight; break;
        default: break;
      }
    }
    if (totalWeight > 1e-5) {
      weighted.divideScalar(totalWeight);
      wing /= totalWeight;
      thorax /= totalWeight;
      abdomen /= totalWeight;
      head /= totalWeight;
      segment = abdomen > 1e-4 ? segment / totalWeight / Math.max(abdomen, 1e-4) : 0;
    } else {
      weighted.copy(vertex);
    }
    part[index * 4] = wing;
    part[index * 4 + 1] = thorax;
    part[index * 4 + 2] = abdomen;
    part[index * 4 + 3] = head;
    const radius = vertex.distanceTo(weighted);
    radii[index] = radius;
    if (radius > radiusMax) radiusMax = radius;
    axisValues[index] = ((axis === 0 ? vertex.x : vertex.z) - axisMin) / axisSpan;
    body[index * 3 + 2] = Math.min(1, Math.max(0, segment));
  }
  // Normalise against a high percentile rather than the absolute maximum: a
  // handful of antenna tips otherwise squash the whole body into a thin band.
  const sorted = Float32Array.from(radii).sort();
  const reference = Math.max(1e-5, sorted[Math.floor(sorted.length * 0.86)] ?? radiusMax);
  for (let index = 0; index < count; index += 1) {
    body[index * 3] = Math.min(1, radii[index] / reference);
    body[index * 3 + 1] = axisValues[index];
  }

  const aPart = new THREE.BufferAttribute(part, 4);
  const aBody = new THREE.BufferAttribute(body, 3);
  geometry.setAttribute('aPart', aPart);
  geometry.setAttribute('aBody', aBody);
  return { attributes: { aPart, aBody } };
}

/* -------------------------------------------------------------------------- */

/**
 * One vertex program for all three layers. `uInset` pushes the surface along
 * its own object-space normal *before* skinning, which is how the reference
 * keeps the inner body registered to the silhouette.
 */
const beeVertex = /* glsl */ `
  #include <common>
  attribute vec4 aPart;
  attribute vec3 aBody;
  uniform float uInset;
  varying vec4 vPart;
  varying vec3 vBody;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  #include <skinning_pars_vertex>
  void main() {
    vPart = aPart;
    vBody = aBody;
    vUv = uv;
    vec3 objectNormal = normal;
    vec3 transformed = position - normal * uInset;
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <skinning_vertex>
    vec4 worldPos = modelMatrix * vec4( transformed, 1.0 );
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize( ( modelMatrix * vec4( objectNormal, 0.0 ) ).xyz );
    vViewDir = normalize( cameraPosition - worldPos.xyz );
    gl_Position = projectionMatrix * modelViewMatrix * vec4( transformed, 1.0 );
  }
`;

const beeVaryings = /* glsl */ `
  varying vec4 vPart;
  varying vec3 vBody;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
`;

/** Derivative-space TBN. No tangent attribute ships with this GLB. */
const perturbNormal = /* glsl */ `
  vec3 perturbNormal( vec3 N, vec3 worldPos, vec2 uv, float strength ) {
    vec3 dp1 = dFdx( worldPos );
    vec3 dp2 = dFdy( worldPos );
    vec2 duv1 = dFdx( uv );
    vec2 duv2 = dFdy( uv );
    vec3 dp2perp = cross( dp2, N );
    vec3 dp1perp = cross( N, dp1 );
    vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
    vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
    float invmax = inversesqrt( max( dot( T, T ), dot( B, B ) ) );
    mat3 TBN = mat3( T * invmax, B * invmax, N );
    vec3 mapN = texture2D( uNormalMap, uv ).rgb * 2.0 - 1.0;
    mapN.xy *= strength;
    return normalize( TBN * mapN );
  }
`;

/* ---------------------------------------------------------------- core --- */
const coreFragment = /* glsl */ `
  uniform sampler2D uOrmMap;
  uniform vec3 uInnerColor;
  uniform vec3 uThoraxTint;
  uniform vec3 uLightDir;
  uniform float uAo;
  uniform float uPresence;
  ${beeVaryings}
  void main() {
    // The wings are carried by the dedicated membrane pass; an opaque red wing
    // is the single most plastic-looking thing this model can do.
    if ( vPart.x > 0.34 ) discard;
    // Antennae and the six legs have to read as clear glass rods, so they get
    // no inner mass at all.
    if ( vBody.x < 0.26 ) discard;

    vec3 N = normalize( vWorldNormal );
    vec3 L = normalize( uLightDir );
    float NdotL = max( dot( N, L ), 0.0 );
    // Wrapped lambert, exactly as the reference: the inner body is a shape read
    // through glass, not a surface that needs its own specular story.
    float diffuse = mix( 0.30, 1.0, NdotL );
    float ao = mix( 1.0, texture2D( uOrmMap, vUv ).g, uAo );

    vec3 tint = uInnerColor;
    // Segmented abdomen straight off the joint order. Balanced around 1.0 so it
    // reads as segmentation rather than as an overall darkening of the body.
    float band = cos( vBody.z * 26.0 );
    tint *= 1.0 + clamp( vPart.z, 0.0, 1.0 ) * band * 0.13;
    // Amber flight muscle in the thorax.
    tint = mix( tint, uThoraxTint, clamp( vPart.y, 0.0, 1.0 ) * 0.30 );
    // Head reads a little denser than the body, which gives the eyes mass.
    tint = mix( tint, tint * 0.80, clamp( vPart.w, 0.0, 1.0 ) * 0.5 );

    gl_FragColor = vec4( tint * diffuse * ao, uPresence );
  }
`;

/* --------------------------------------------------------------- shell --- */
const shellFragment = /* glsl */ `
  uniform sampler2D uScene;
  uniform sampler2D uNormalMap;
  uniform sampler2D uOrmMap;
  uniform vec2 uSceneResolution;
  uniform vec3 uBaseColor;
  uniform float uIor;
  uniform float uRefraction;
  uniform float uReflection;
  uniform float uRefractionRoughness;
  uniform float uReflectionRoughness;
  uniform float uNormalStrength;
  uniform float uSaturation;
  uniform float uFresnelPower;
  uniform float uSpecular;
  uniform vec3 uVolumeColor;
  uniform float uVolumeDensity;
  uniform float uDispersion;
  uniform vec3 uEdgeTint;
  uniform float uEdgeTintPower;
  uniform vec3 uRimTint;
  uniform float uRimStrength;
  uniform float uGain;
  uniform float uAo;
  uniform vec3 uLightDir;
  uniform float uPresence;
  ${beeVaryings}
  ${perturbNormal}
  float fresnelTerm( float cosTheta, float power, float f0 ) {
    return f0 + ( 1.0 - f0 ) * pow( 1.0 - cosTheta, power );
  }
  float ggxSpecular( vec3 light, vec3 viewDir, vec3 normal, float roughness ) {
    vec3 lightVec = normalize( -light );
    vec3 halfVec = normalize( viewDir + lightVec );
    float NdotH = max( dot( normal, halfVec ), 0.0 );
    float a2 = max( roughness * roughness, 0.001 );
    float d = NdotH * NdotH * ( a2 - 1.0 ) + 1.0;
    return a2 / ( 3.14159 * d * d );
  }
  vec3 saturateColor( vec3 rgb, float intensity ) {
    vec3 luma = vec3( dot( rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) );
    return mix( luma, rgb, intensity );
  }
  void main() {
    if ( vPart.x > 0.34 ) discard;

    vec3 N = normalize( vWorldNormal );
    vec3 V = normalize( vViewDir );
    vec3 eyeVec = -V;
    vec2 screenUV = gl_FragCoord.xy / max( uSceneResolution, vec2( 1.0 ) );

    vec3 orm = texture2D( uOrmMap, vUv ).rgb;
    float ao = orm.r;
    float texRoughness = orm.b;
    float refrRoughness = texRoughness * uRefractionRoughness;
    float reflRoughness = texRoughness * uReflectionRoughness;

    vec3 perturbedN = perturbNormal( N, vWorldPos, vUv, uNormalStrength );
    float cosTheta = max( dot( V, perturbedN ), 0.0 );

    // Optical path length. The reference blends the geometric term with the
    // baked cavity so thick parts of the body stay thick from every angle; the
    // limb radius from the skin keeps legs and antennae close to clear.
    float geoThickness = clamp( 1.0 - cosTheta, 0.0, 1.0 );
    float thickness = mix( geoThickness, 1.0 - ao, 0.3 );
    // Reference has no limb term. A light one keeps antennae and the six legs
    // from picking up body-weight volume tint while leaving the torso alone.
    thickness *= mix( 0.78, 1.0, clamp( vBody.x, 0.0, 1.0 ) );

    float iorR = 1.0 / ( uIor - uDispersion );
    float iorG = 1.0 / uIor;
    float iorB = 1.0 / ( uIor + uDispersion );

    float maxMip = log2( max( uSceneResolution.x, uSceneResolution.y ) ) * 0.5;
    float refrMip = refrRoughness * maxMip;
    float reflMip = reflRoughness * maxMip;

    vec3 refractG = refract( eyeVec, perturbedN, iorG );
    vec3 reflectDir = reflect( eyeVec, perturbedN );
    vec3 refrColor;
    if ( uDispersion > 0.0 ) {
      vec3 refractR = refract( eyeVec, perturbedN, iorR );
      vec3 refractB = refract( eyeVec, perturbedN, iorB );
      if ( dot( refractR, refractR ) < 0.001 ) refractR = reflectDir;
      if ( dot( refractG, refractG ) < 0.001 ) refractG = reflectDir;
      if ( dot( refractB, refractB ) < 0.001 ) refractB = reflectDir;
      float dispSpread = uDispersion * ( 1.0 - cosTheta );
      refrColor.r = textureLod( uScene, clamp( screenUV + refractR.xy * ( uRefraction - dispSpread ), 0.001, 0.999 ), refrMip ).r;
      refrColor.g = textureLod( uScene, clamp( screenUV + refractG.xy * uRefraction, 0.001, 0.999 ), refrMip ).g;
      refrColor.b = textureLod( uScene, clamp( screenUV + refractB.xy * ( uRefraction + dispSpread ), 0.001, 0.999 ), refrMip ).b;
    } else {
      if ( dot( refractG, refractG ) < 0.001 ) refractG = reflectDir;
      refrColor = textureLod( uScene, clamp( screenUV + refractG.xy * uRefraction, 0.001, 0.999 ), refrMip ).rgb;
    }

    // Colourless glass: uBaseColor is white, so this is a no-op unless the look
    // is deliberately tinted. All of the red in the frame comes from the core.
    refrColor *= exp( log( max( uBaseColor, vec3( 0.001 ) ) ) * thickness );

    if ( uVolumeDensity > 0.0 ) {
      float volumeTransmittance = exp( -uVolumeDensity * thickness );
      refrColor = mix( uVolumeColor, refrColor, volumeTransmittance );
    }
    refrColor = saturateColor( refrColor, uSaturation ) * uGain;

    vec2 reflectedUV = clamp( screenUV + reflectDir.xy * uReflection, 0.001, 0.999 );
    vec3 reflColor = textureLod( uScene, reflectedUV, reflMip ).rgb;

    float f0 = pow( ( 1.0 - uIor ) / ( 1.0 + uIor ), 2.0 );
    float fresnelFactor = fresnelTerm( cosTheta, uFresnelPower, f0 );
    vec3 color = mix( refrColor, reflColor, fresnelFactor );

    float spec = ggxSpecular( uLightDir, V, perturbedN, max( reflRoughness, 0.045 ) );
    color += spec * fresnelFactor * uSpecular;

    // Coral at the extreme rim, then a very light cyan/violet chromatic edge
    // just inside it. Kept low: this is the difference between a cut stone and
    // a neon outline.
    float edgeFactor = pow( 1.0 - cosTheta, uEdgeTintPower );
    color *= mix( vec3( 1.0 ), uEdgeTint, edgeFactor );
    color += uRimTint * pow( 1.0 - cosTheta, 2.4 ) * uRimStrength;

    float aoFinal = mix( 1.0, ao, uAo );
    color = mix( color * aoFinal, color * mix( 1.0, aoFinal, 0.3 ), fresnelFactor );

    gl_FragColor = vec4( color, uPresence );
  }
`;

/* --------------------------------------------------------------- wings --- */
const wingFragment = /* glsl */ `
  uniform sampler2D uScene;
  uniform sampler2D uNormalMap;
  uniform vec2 uSceneResolution;
  uniform float uRefraction;
  uniform float uNormalStrength;
  uniform float uSpecular;
  uniform vec3 uRimTint;
  uniform vec3 uLightDir;
  uniform float uPresence;
  ${beeVaryings}
  ${perturbNormal}
  void main() {
    float wing = smoothstep( 0.24, 0.62, vPart.x );
    if ( wing <= 0.001 ) discard;

    vec3 N = normalize( vWorldNormal );
    vec3 V = normalize( vViewDir );
    vec3 perturbedN = perturbNormal( N, vWorldPos, vUv, uNormalStrength * 0.35 );
    float cosTheta = abs( dot( V, perturbedN ) );
    float fresnel = pow( 1.0 - cosTheta, 3.0 );

    vec2 screenUV = gl_FragCoord.xy / max( uSceneResolution, vec2( 1.0 ) );
    vec3 behind = texture2D( uScene, clamp( screenUV + perturbedN.xy * uRefraction * 0.18, 0.001, 0.999 ) ).rgb;

    // Thin-film interference across the membrane. The film thickness rides the
    // wing span, so the bands sweep as the wing beats.
    float film = 2.1 + vBody.y * 4.4 + ( 1.0 - cosTheta ) * 3.2;
    vec3 iridescence = 0.5 + 0.5 * cos( 6.28318 * ( film + vec3( 0.0, 0.28, 0.56 ) ) );
    // Weighted down hard: a full-strength interference sweep reads as a soap
    // bubble decal, which is the opposite of a thin insect membrane.
    iridescence = mix( vec3( 0.95, 0.97, 1.0 ), iridescence, 0.20 );

    vec3 color = behind * iridescence;
    color += uRimTint * fresnel * 0.26;

    // One tight specular streak along the membrane; a wing with no highlight
    // disappears entirely against a bright background.
    vec3 halfVec = normalize( V + normalize( uLightDir ) );
    color += pow( max( dot( perturbedN, halfVec ), 0.0 ), 96.0 ) * uSpecular * 0.9;

    float alpha = wing * clamp( 0.07 + fresnel * 0.44, 0.0, 0.56 ) * uPresence;
    gl_FragColor = vec4( color, alpha );
  }
`;

export type BeeOpticalUniforms = {
  uScene: { value: THREE.Texture | null };
  uSceneResolution: { value: THREE.Vector2 };
  uLightDir: { value: THREE.Vector3 };
  uTime: { value: number };
  /** Kept for callers that tune the look; matches the reference GUI. */
  uIor: { value: number };
  uRefraction: { value: number };
  uDispersion: { value: number };
  uVolumeColor: { value: THREE.Color };
  uVolumeDensity: { value: number };
  uEdgeTint: { value: THREE.Color };
  uInnerColor: { value: THREE.Color };
  uThoraxTint: { value: THREE.Color };
};

export type BeeMaterialSet = {
  core: THREE.ShaderMaterial;
  shell: THREE.ShaderMaterial;
  wings: THREE.ShaderMaterial;
  optical: BeeOpticalUniforms;
  /** Normal-space inset of the inner core, in geometry units. */
  coreInset: { value: number };
  /** Crossfade weight shared by every layer. */
  presence: { value: number };
  dispose: () => void;
};

export function createBeeMaterials(options: {
  normalMap: THREE.Texture;
  ormMap: THREE.Texture;
  sceneTexture: THREE.Texture;
  resolution: THREE.Vector2;
}): BeeMaterialSet {
  const uScene = { value: options.sceneTexture as THREE.Texture | null };
  const uSceneResolution = { value: options.resolution };
  const uNormalMap = { value: options.normalMap };
  const uOrmMap = { value: options.ormMap };
  const uLightDir = { value: new THREE.Vector3(0.354, 0.866, 0.354) };
  const uTime = { value: 0 };
  const presence = { value: 1 };
  const coreInset = { value: 1 };

  // Reference values, verbatim, except where noted.
  const uIor = { value: 1.5 };
  const uRefraction = { value: 0.025 };
  const uDispersion = { value: 0.006 };
  const uVolumeColor = { value: new THREE.Color(0xd0e8ff) };
  const uVolumeDensity = { value: 1.0 };
  const uEdgeTint = { value: new THREE.Color(0xff9e9e) };
  const uInnerColor = { value: new THREE.Color(0xcc4444) };
  // Not in the reference: a warm flight-muscle tint so the interior reads as
  // anatomy rather than one solid mass.
  const uThoraxTint = { value: new THREE.Color(0xe0913f) };

  const optical: BeeOpticalUniforms = {
    uScene,
    uSceneResolution,
    uLightDir,
    uTime,
    uIor,
    uRefraction,
    uDispersion,
    uVolumeColor,
    uVolumeDensity,
    uEdgeTint,
    uInnerColor,
    uThoraxTint,
  };

  const core = new THREE.ShaderMaterial({
    name: 'bee_core',
    vertexShader: beeVertex,
    fragmentShader: coreFragment,
    uniforms: {
      uInset: coreInset,
      uOrmMap,
      uInnerColor,
      uThoraxTint,
      uLightDir,
      uAo: { value: 0.5 },
      uPresence: presence,
    },
    // The core sits one geometry unit inside a shell that shares its topology,
    // so it needs the same depth nudge the reference uses.
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    side: THREE.FrontSide,
  });

  const shell = new THREE.ShaderMaterial({
    name: 'bee_shell',
    vertexShader: beeVertex,
    fragmentShader: shellFragment,
    uniforms: {
      uInset: { value: 0 },
      uScene,
      uNormalMap,
      uOrmMap,
      uSceneResolution,
      uBaseColor: { value: new THREE.Color(0xffffff) },
      uIor,
      uRefraction,
      uReflection: { value: 0.1 },
      uRefractionRoughness: { value: 0.3 },
      uReflectionRoughness: { value: 0 },
      uNormalStrength: { value: 2 },
      uSaturation: { value: 1.2 },
      uFresnelPower: { value: 1 },
      uSpecular: { value: 1 },
      uVolumeColor,
      uVolumeDensity,
      uDispersion,
      uEdgeTint,
      uEdgeTintPower: { value: 4 },
      uRimTint: { value: new THREE.Color(0x7fd8ff) },
      uRimStrength: { value: 0.085 },
      uGain: { value: 1.3 },
      uAo: { value: 0.75 },
      uLightDir,
      uPresence: presence,
    },
    side: THREE.FrontSide,
  });

  const wings = new THREE.ShaderMaterial({
    name: 'bee_wings',
    vertexShader: beeVertex,
    fragmentShader: wingFragment,
    uniforms: {
      uInset: { value: 0 },
      uScene,
      uNormalMap,
      uSceneResolution,
      uRefraction,
      uNormalStrength: { value: 2 },
      uSpecular: { value: 1 },
      uRimTint: { value: new THREE.Color(0x9fe0ff) },
      uLightDir,
      uPresence: presence,
    },
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });

  return {
    core,
    shell,
    wings,
    optical,
    coreInset,
    presence,
    dispose: () => {
      core.dispose();
      shell.dispose();
      wings.dispose();
    },
  };
}

/**
 * Clones a skinned mesh so it shares the source geometry and skeleton. One
 * mixer drives every layer, which keeps the shells in lock-step and avoids
 * paying for the 107-joint rig three times.
 */
export function shareSkinnedMesh(source: THREE.SkinnedMesh, material: THREE.Material, name: string) {
  const mesh = new THREE.SkinnedMesh(source.geometry, material);
  mesh.name = name;
  mesh.bindMode = source.bindMode;
  mesh.bind(source.skeleton, source.bindMatrix);
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = source.matrixAutoUpdate;
  mesh.position.copy(source.position);
  mesh.quaternion.copy(source.quaternion);
  mesh.scale.copy(source.scale);
  return mesh;
}
