import * as THREE from 'three';
import {
  createCarLoaders,
  createCarMaterials,
  disposeScene,
  loadCarTextures,
  normalizeModel,
  prepareCarVisual,
  type CarPieceState,
  type MaterialShader,
} from './carRuntime';

/**
 * The Formula workshop's *contents*, independent of the room they stand in.
 *
 * The car, the sprue frame and the seven desk tools were built inline inside
 * `FormulaExperience` — which was correct while the workshop had exactly one
 * home. It now has two: the full-screen overlay, which is a dark studio, and
 * the practice hub's stage, which is the same warm ivory room the Library and
 * the two new labs use. Duplicating four hundred lines of texture-channel
 * conventions to get the car into a second room is how two versions of a model
 * start to drift apart, so what a host actually differs in — camera, lights,
 * floor, chrome — stays with the host, and everything that is *the car* lives
 * here.
 *
 * Every invariant `carRuntime` documents is preserved by going through it
 * rather than around it: the XOR-protected loader, the material-name suffix
 * stripping, the non-standard ORM channel layout and the `uKitProgress` uniform
 * that moves ambient occlusion between the assembled and kit builds.
 */

export type CarWorkshop = {
  /** The assembled car. Position and rotate this; the pieces live inside it. */
  carRoot: THREE.Group;
  /** Desk, sprue frame and tools. Hidden outside the KIT mode. */
  kitRoot: THREE.Group;
  /** Metres, the assembled car's length along its longest axis. */
  carLength: number;
  /**
   * Drives the kit ⇄ assembled blend, 0 = built, 1 = laid out on the bench.
   *
   * Two things move together and must not be split: the piece transforms and
   * the shader uniform that swaps which ORM channel carries the occlusion. A
   * host that lerped the transforms itself and forgot the uniform would get a
   * correctly-assembled car wearing the bench's baked shadows.
   */
  update(kitProgress: number, wheelRoll: number, steering: number): void;
  dispose(): void;
};

/**
 * Builds the workshop into `world`, resolving once every mesh and texture has
 * landed. The group is populated immediately so a host can frame it, but
 * nothing is visible until the promise settles.
 */
export type BenchAppearance = 'studio' | 'ivory';

/**
 * The bench palette, per room.
 *
 * The desk, the cutting mat and the sprue frame were authored for the overlay's
 * dark neon studio, where a near-black desk under a violet mat is exactly right.
 * Dropped into the Library's ivory room the same bench is a hole in the floor —
 * the single largest dark mass on an otherwise warm page, and the reason the
 * hub's first frame looked like two different websites stitched together. The
 * geometry, the UVs and both packed detail textures are untouched; only the
 * three flat tones the shaders mix between move.
 */
const BENCH: Record<BenchAppearance, { desk: number; sprue: number; matLow: string; matHigh: string }> = {
  studio: {
    desk: 0x817789,
    sprue: 0xb3a8d6,
    matLow: 'vec3(.16,.14,.21)',
    matHigh: 'vec3(.28,.23,.40)',
  },
  ivory: {
    /* A pale beech worktop and a light sage mat — the colours a school bench
       and a real cutting mat actually are, which is convenient, because they are
       also the two tones that let the car stay the darkest thing in the frame. */
    desk: 0xded3c2,
    sprue: 0xbdb2d8,
    matLow: 'vec3(.52,.56,.51)',
    matHigh: 'vec3(.64,.68,.62)',
  },
};

export async function createCarWorkshop(
  renderer: THREE.WebGLRenderer,
  world: THREE.Object3D,
  options: { initialKitProgress?: number; bench?: BenchAppearance } = {},
): Promise<CarWorkshop> {
  const bench = BENCH[options.bench ?? 'studio'];
  const loaders = createCarLoaders(renderer);
  const carRoot = new THREE.Group();
  const kitRoot = new THREE.Group();
  world.add(carRoot);
  world.add(kitRoot);

  const kitShaders: MaterialShader[] = [];
  const carPieces: CarPieceState[] = [];
  let kitProgress = options.initialKitProgress ?? 1;

  /**
   * The desk-tool atlas material.
   *
   * Four of the seven tools share one packed atlas and read a different channel
   * out of it, which is why this is a factory rather than four materials: the
   * ruler samples B through a squashed UV, the scissors R, the box cutter G and
   * the screwdriver A, and each needs its own `customProgramCacheKey` or
   * three.js hands all four the first one's compiled program.
   */
  const makeDeskAtlasMaterial = (
    atlas: THREE.Texture,
    channel: 'r' | 'g' | 'b' | 'a',
    color: number,
    uvExpression = 'vMapUv',
  ) => {
    const material = new THREE.MeshStandardMaterial({ map: atlas, color, roughness: 0.58, metalness: 0.28 });
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `vec4 sampledDiffuseColor = texture2D(map, ${uvExpression});\nfloat deskDetail = sampledDiffuseColor.${channel};\ndiffuseColor.rgb *= mix(0.68, 1.18, deskDetail);`,
      );
    };
    material.customProgramCacheKey = () => `desk-${channel}-${uvExpression}`;
    return material;
  };

  const CAR_LENGTH = 4.25;

  const prepareCar = async () => {
    const [gltf, textures] = await Promise.all([
      loaders.loadProtected('formulaCar.glb'),
      loadCarTextures(loaders),
    ]);
    const { materials, shaders } = createCarMaterials(textures, { initialKitProgress: kitProgress });
    kitShaders.push(...shaders);
    const visual = gltf.scene;
    carPieces.push(...prepareCarVisual(visual, materials, CAR_LENGTH));
    carRoot.add(visual);
  };

  const prepareKit = async () => {
    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(9.4, 0.28, 6.4),
      new THREE.MeshStandardMaterial({ color: bench.desk, roughness: 0.68, metalness: 0.05 }),
    );
    desk.position.y = -1.48;
    desk.receiveShadow = true;
    kitRoot.add(desk);

    const textureLoader = new THREE.TextureLoader();
    const [
      sprueGltf, matGltf, paintGltf, eraserGltf, pencilGltf, rulerGltf,
      scissorGltf, cutterGltf, driverGltf,
      spruePacked, cmBase, cmPacked, paintBody, sharedMask, eraserBase,
      atlasFalse, atlasTrue,
    ] = await Promise.all([
      loaders.loadProtected('formulaSprue.glb'), loaders.loadProtected('cuttingMatt.glb'), loaders.loadProtected('paintJar.glb'),
      loaders.loadProtected('eraser.glb'), loaders.loadProtected('pencil.glb'), loaders.loadProtected('ruler.glb'),
      loaders.loadProtected('scissor.glb'), loaders.loadProtected('boxCutter.glb'), loaders.loadProtected('screwdriver.glb'),
      loaders.loadTexture('sprue_packed.webp', false, false), loaders.loadTexture('cm_baseTexture.webp', false, false),
      loaders.loadTexture('cm_packedEffects.webp', false, false), loaders.loadTexture('paintJar_body.webp', true, false),
      textureLoader.loadAsync('/asset/fish/sharedMaskAtlas.webp'), textureLoader.loadAsync('/asset/fish/eraser_baseColor.webp'),
      textureLoader.loadAsync('/asset/fish/deskSupplies_atlas.webp'), textureLoader.loadAsync('/asset/fish/deskSupplies_atlas.webp'),
    ]);
    sharedMask.colorSpace = THREE.NoColorSpace; sharedMask.flipY = false; sharedMask.needsUpdate = true;
    eraserBase.colorSpace = THREE.SRGBColorSpace; eraserBase.flipY = false; eraserBase.needsUpdate = true;
    // The desk atlas needs two instances: ruler and scissor sample it
    // unflipped, box cutter and screwdriver flipped.
    atlasFalse.colorSpace = THREE.NoColorSpace; atlasFalse.flipY = false; atlasFalse.needsUpdate = true;
    atlasTrue.colorSpace = THREE.NoColorSpace; atlasTrue.flipY = true; atlasTrue.needsUpdate = true;
    [sharedMask, eraserBase, atlasFalse, atlasTrue].forEach((texture) => loaders.ownedTextures.add(texture));

    const spruePlastic = new THREE.MeshStandardMaterial({ map: spruePacked, color: bench.sprue, roughness: 0.64, metalness: 0.02 });
    spruePlastic.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        'vec4 sprueData = texture2D(map, vMapUv); diffuseColor.rgb *= mix(0.64, 1.0, sprueData.g);',
      );
    };
    const sprueLabel = new THREE.MeshBasicMaterial({ map: spruePacked, color: 0xf4e9ff, transparent: true, depthWrite: false });
    sprueLabel.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        'vec4 sprueData = texture2D(map, vMapUv); diffuseColor.a *= sprueData.r;',
      );
    };
    sprueGltf.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.material = (object.material as THREE.Material).name.includes('label') ? sprueLabel : spruePlastic;
    });
    normalizeModel(sprueGltf.scene, 2.25);
    const sprueWrapper = new THREE.Group();
    sprueWrapper.add(sprueGltf.scene);
    sprueWrapper.position.set(-2.65, -1.24, 0.45);
    sprueWrapper.rotation.x = -Math.PI / 2;
    kitRoot.add(sprueWrapper);

    const matMaterial = new THREE.ShaderMaterial({
      uniforms: { uBase: { value: cmBase }, uEffects: { value: cmPacked } },
      vertexShader: `varying vec2 vUv; varying vec3 vLocal; void main(){vUv=uv;vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform sampler2D uBase; uniform sampler2D uEffects; varying vec2 vUv; varying vec3 vLocal; void main(){vec2 packUv=vec2(vLocal.x*.5+.5,vLocal.y/1.5+.5);vec4 fx=texture2D(uEffects,packUv);float design=texture2D(uBase,vUv).r;vec3 base=mix(${bench.matLow},${bench.matHigh},design);base+=fx.g*.045-fx.r*.02;gl_FragColor=vec4(base,1.0);}`,
    });
    matGltf.scene.traverse((object) => { if (object instanceof THREE.Mesh) object.material = matMaterial; });
    normalizeModel(matGltf.scene, 5.45);
    const matWrapper = new THREE.Group();
    matWrapper.add(matGltf.scene);
    matWrapper.position.set(0, -1.3, 0);
    kitRoot.add(matWrapper);

    paintGltf.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.geometry.attributes.uv && !object.geometry.attributes.uv1) object.geometry.setAttribute('uv1', object.geometry.attributes.uv);
      object.material = new THREE.MeshStandardMaterial({ map: paintBody, aoMap: sharedMask, aoMapIntensity: 0.7, roughness: 0.45, metalness: 0.08 });
    });
    eraserGltf.scene.traverse((object) => { if (object instanceof THREE.Mesh) object.material = new THREE.MeshStandardMaterial({ map: eraserBase, roughness: 0.74 }); });
    pencilGltf.scene.traverse((object) => { if (object instanceof THREE.Mesh) object.material = new THREE.MeshStandardMaterial({ color: 0xf2b850, roughness: 0.68 }); });
    rulerGltf.scene.traverse((object) => { if (object instanceof THREE.Mesh) object.material = makeDeskAtlasMaterial(atlasFalse, 'b', 0xb6cdf8, 'vec2(vMapUv.x, vMapUv.y * 0.125)'); });
    scissorGltf.scene.traverse((object) => { if (object instanceof THREE.Mesh) object.material = makeDeskAtlasMaterial(atlasFalse, 'r', 0xd33c75); });
    cutterGltf.scene.traverse((object) => { if (object instanceof THREE.Mesh) object.material = makeDeskAtlasMaterial(atlasTrue, 'g', 0x6c68d8); });
    driverGltf.scene.traverse((object) => { if (object instanceof THREE.Mesh) object.material = makeDeskAtlasMaterial(atlasTrue, 'a', 0x3eb6ce); });

    const props = [
      [paintGltf.scene, 0.64, 3.15, -1.18, -1.15, 0],
      [eraserGltf.scene, 0.52, 2.4, -1.25, 1.58, 0.2],
      [pencilGltf.scene, 1.45, -1.1, -1.27, 2.15, -0.18],
      [rulerGltf.scene, 1.55, 0.5, -1.26, -2.2, 0.12],
      [scissorGltf.scene, 1.0, -3.2, -1.2, -1.15, -0.2],
      [cutterGltf.scene, 0.9, 3.35, -1.2, 1.2, 0.24],
      [driverGltf.scene, 1.0, -2.85, -1.18, 1.95, -0.28],
    ] as const;
    for (const [object, size, x, y, z, rotation] of props) {
      normalizeModel(object, size);
      const wrapper = new THREE.Group();
      wrapper.add(object);
      wrapper.position.set(x, y, z);
      wrapper.rotation.y = rotation;
      kitRoot.add(wrapper);
    }
  };

  await Promise.all([prepareCar(), prepareKit()]);

  const rollQuaternion = new THREE.Quaternion();
  const steeringQuaternion = new THREE.Quaternion();
  // The wheel nodes are authored with a 90° Y rotation, so their axle is local
  // X. Rolling around local Z made the tyres yaw and wobble instead of spin.
  const rollAxis = new THREE.Vector3(1, 0, 0);
  const steerAxis = new THREE.Vector3(0, 1, 0);

  return {
    carRoot,
    kitRoot,
    carLength: CAR_LENGTH,
    update(nextKitProgress, wheelRoll, steering) {
      kitProgress = nextKitProgress;
      for (const shader of kitShaders) shader.uniforms.uKitProgress.value = kitProgress;
      rollQuaternion.setFromAxisAngle(rollAxis, wheelRoll);
      steeringQuaternion.setFromAxisAngle(steerAxis, steering);
      for (const piece of carPieces) {
        piece.object.position.lerpVectors(piece.assembledPosition, piece.kitPosition, kitProgress);
        piece.object.quaternion.slerpQuaternions(piece.assembledQuaternion, piece.kitQuaternion, kitProgress);
        // Wheels only spin once the car is actually built; a tyre rotating
        // while it is still lying on the bench is a bench with a live axle.
        if (piece.isWheel && kitProgress < 0.01) {
          piece.object.quaternion.multiply(rollQuaternion);
          if (piece.isFrontWheel) piece.object.quaternion.premultiply(steeringQuaternion);
        }
      }
    },
    dispose() {
      disposeScene(carRoot);
      disposeScene(kitRoot);
      carRoot.removeFromParent();
      kitRoot.removeFromParent();
      loaders.dispose();
    },
  };
}
