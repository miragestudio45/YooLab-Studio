import * as THREE from 'three';

/**
 * Procedural studio environment shared by every Explore/Studio renderer.
 *
 * The site never ships an HDRI, but physical materials need a real environment
 * to read as glass instead of tinted plastic: without it every specular
 * highlight collapses to the three analytic lights and transmission has nothing
 * to refract. This bakes a small PMREM from a gradient dome plus a handful of
 * emissive panels, which is enough to give the ruby shell, the opal jellyfish
 * and the Formula paint a believable falloff at ~1 ms of startup cost.
 */
export type EnvironmentPalette = {
  zenith: THREE.ColorRepresentation;
  horizon: THREE.ColorRepresentation;
  ground: THREE.ColorRepresentation;
  keyColor: THREE.ColorRepresentation;
  keyStrength: number;
  rimColor: THREE.ColorRepresentation;
  rimStrength: number;
  fillColor: THREE.ColorRepresentation;
  fillStrength: number;
};

export const exploreEnvironmentPalette: EnvironmentPalette = {
  zenith: 0xfbf9ff,
  horizon: 0xe9f1ff,
  ground: 0xfaeff7,
  keyColor: 0xfff9f6,
  keyStrength: 5.0,
  rimColor: 0xbfeeff,
  rimStrength: 2.0,
  fillColor: 0xffdcec,
  fillStrength: 1.3,
};

/*
 * The ocean box.
 *
 * The reef's own three lights model the scene; this is what its *materials*
 * reflect, and it has to be a body of water rather than a room: bright cyan
 * overhead where the sun comes through the surface, deep blue below, and one
 * strong panel high and slightly behind the subject so a wet flank has something
 * to throw a highlight from. Handing the fish the ivory studio dome instead is
 * what would put a white room in every specular on an animal that is forty feet
 * down — the exact tell that reads as "3D model composited onto a background".
 */
export const oceanEnvironmentPalette: EnvironmentPalette = {
  /*
   * A dark ocean dome with one bright surface aperture.
   *
   * The previous palette was evenly cyan from zenith to ground, so every wet
   * material reflected the same broad blue room. That flattened the fish and
   * made the jellyfish look like translucent plastic. Peach's HAR proves the
   * useful opposite: a near-black world plus a small, high-energy HDR source.
   * The material then has a dark side, a readable midtone and one controlled
   * highlight instead of one value everywhere.
   */
  zenith: 0x42b8e8,
  horizon: 0x05042c,
  ground: 0x000014,
  keyColor: 0xd9f8ff,
  keyStrength: 5.4,
  rimColor: 0x469fe8,
  rimStrength: 2.8,
  fillColor: 0x451a68,
  fillStrength: 1.15,
};

/**
 * A small neutral/magenta reflection room used only by Fish and Jellyfish.
 *
 * The water still reflects the ocean dome, but a hero specimen needs the same
 * controlled studio sources Peach uses: neutral white carries the fish texture,
 * cyan traces wet edges and magenta returns colour to fins and jelly tissue.
 * Keeping the dome nearly black prevents those panels from becoming a uniform
 * cyan wash over every surface normal.
 */
export const specimenEnvironmentPalette: EnvironmentPalette = {
  zenith: 0x11102e,
  horizon: 0x020018,
  ground: 0x07000e,
  keyColor: 0xffffff,
  keyStrength: 7.2,
  rimColor: 0x35c8ff,
  rimStrength: 4.1,
  fillColor: 0xff4ba8,
  fillStrength: 2.5,
};

/* Light studio box. The editor viewport is a white room now, so the environment
   the glass in it reflects has to be a white room too — a dark dome behind a
   light stage puts black in every highlight and instantly reads as plastic. */
export const studioEnvironmentPalette: EnvironmentPalette = {
  zenith: 0xffffff,
  horizon: 0xeaf0fb,
  ground: 0xdfe6f2,
  keyColor: 0xfffaf4,
  keyStrength: 5.0,
  rimColor: 0xbfeeff,
  rimStrength: 2.0,
  fillColor: 0xffd9ea,
  fillStrength: 1.2,
};

const domeVertex = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const domeFragment = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  varying vec3 vDirection;
  void main() {
    float h = normalize(vDirection).y;
    vec3 color = mix(uHorizon, uZenith, smoothstep(0.0, 0.85, h));
    color = mix(color, uGround, smoothstep(0.0, -0.7, h));
    gl_FragColor = vec4(color, 1.0);
  }
`;

function emissivePanel(
  color: THREE.ColorRepresentation,
  intensity: number,
  width: number,
  height: number,
  position: THREE.Vector3,
) {
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
  );
  panel.position.copy(position);
  panel.lookAt(0, 0, 0);
  return panel;
}

export type ProceduralEnvironment = {
  texture: THREE.Texture;
  dispose: () => void;
};

export function createProceduralEnvironment(
  renderer: THREE.WebGLRenderer,
  palette: EnvironmentPalette,
): ProceduralEnvironment {
  const envScene = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(30, 32, 24),
    new THREE.ShaderMaterial({
      vertexShader: domeVertex,
      fragmentShader: domeFragment,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: new THREE.Color(palette.zenith) },
        uHorizon: { value: new THREE.Color(palette.horizon) },
        uGround: { value: new THREE.Color(palette.ground) },
      },
    }),
  );
  envScene.add(dome);
  const panels = [
    emissivePanel(palette.keyColor, palette.keyStrength, 16, 11, new THREE.Vector3(-11, 13, 12)),
    emissivePanel(palette.rimColor, palette.rimStrength, 13, 20, new THREE.Vector3(16, 2, -8)),
    emissivePanel(palette.fillColor, palette.fillStrength, 14, 10, new THREE.Vector3(-9, -6, -12)),
    emissivePanel(palette.keyColor, palette.keyStrength * 0.32, 7, 7, new THREE.Vector3(5, 16, -3)),
  ];
  for (const panel of panels) envScene.add(panel);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const target = pmrem.fromScene(envScene, 0.04, 0.1, 90);
  pmrem.dispose();

  dome.geometry.dispose();
  (dome.material as THREE.Material).dispose();
  for (const panel of panels) {
    panel.geometry.dispose();
    (panel.material as THREE.Material).dispose();
  }

  return {
    texture: target.texture,
    dispose: () => target.dispose(),
  };
}
