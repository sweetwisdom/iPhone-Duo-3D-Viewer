import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createAppleWallpaperModules } from './generated/apple-wallpaper.js';

export async function createWallpaper(renderer, assets) {
  // Minimal adapter for Apple's isolated shader classes; no Lotus runtime or page code.
  class Shader extends THREE.ShaderMaterial {
    constructor({ component, data, ...parameters }) { super(parameters); }
  }
  const modules = createAppleWallpaperModules({
    THREE, Shader, Assets: assets,
    instance: () => ({ shaders: new Map() }),
  });
  const { WallpaperCamera, duneAnchors, ASPECT, NEAR, FAR } = modules.camera;
  const materials = new modules.materials.WallpaperMaterials();
  const gltf = await new GLTFLoader().loadAsync(assets.url('scene-wallpaper.gltf'));
  await Promise.all([...assets.pending.values()]);
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.rotation.x = Math.PI / 2;
  root.add(gltf.scene);
  scene.add(root);
  if (!materials.apply(root)) throw new Error('壁纸五层网格不完整');
  const camera = new THREE.PerspectiveCamera(50, 1, NEAR, FAR);
  camera.matrixAutoUpdate = false;
  const driver = new WallpaperCamera(THREE, 'inner');
  const anchors = duneAnchors(THREE);
  const target = new THREE.WebGLRenderTarget(1600, Math.round(1600 / ASPECT.inner), { type: THREE.HalfFloatType, samples: 4 });
  target.texture.name = 'Apple five-layer wallpaper';
  const uiScene = new THREE.Scene();
  const uiCamera = new THREE.OrthographicCamera(-.5, .5, .5, -.5, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry());
  uiScene.add(quad);
  const screens = {};
  for (const key of ['inner', 'outer']) {
    const plate = await assets.getAssetPromise(key === 'inner' ? 'lockscreenUiInner' : 'lockscreenUiOuter');
    const crop = ASPECT[key] / ASPECT.inner;
    const width = Math.round(target.width * Math.min(crop, 1));
    const height = Math.round(target.height * Math.min(1 / crop, 1));
    const output = new THREE.WebGLRenderTarget(width, height, { depthBuffer: false });
    output.texture.name = `Apple ${key} wallpaper + original UI`;
    const material = new modules.ui.default();
    material.wallpaperMap = target.texture;
    material.uiMap = plate;
    material.wallpaperUvScale.set(Math.min(crop, 1), Math.min(1 / crop, 1));
    const fit = (width / height) / (plate.image.width / plate.image.height);
    material.uiUvScale.set(Math.max(fit, 1) * 1.012, Math.max(1 / fit, 1) * 1.012);
    const framed = new THREE.WebGLRenderTarget(width, height, { depthBuffer:false, generateMipmaps:true, minFilter:THREE.LinearMipmapLinearFilter });
    const scratch = framed.clone();
    const frame = new modules.framing.default();
    frame.map = output.texture;
    frame.toneMapped = false;
    const blur = new modules.blur.default();
    blur.depthTest = false;
    blur.depthWrite = false;
    screens[key] = { target: output, material, framed, scratch, frame, blur };
  }
  let last = -1;
  function update(hinge) {
    // The captured wallpaper has an 11% folded dead zone.
    const fold = THREE.MathUtils.clamp((hinge - modules.constants.FOLD_DEAD_ZONE) / (1 - modules.constants.FOLD_DEAD_ZONE), 0, 1);
    if (Math.abs(last - fold) < .0001) return;
    last = fold;
    materials.setState({ fold, duneCloseMatrix: anchors.close.matrix(fold), duneFarMatrix: anchors.far.matrix(fold) });
    driver.update(fold);
    camera.matrix.copy(driver.worldMatrix());
    camera.matrixWorldNeedsUpdate = true;
    camera.projectionMatrix.copy(driver.projectionMatrix());
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    const previous = renderer.getRenderTarget();
    const color = renderer.getClearColor(new THREE.Color());
    const alpha = renderer.getClearAlpha();
    renderer.setClearColor(0, 0);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    for (const [key, screen] of Object.entries(screens)) {
      quad.material = screen.material;
      renderer.setRenderTarget(screen.target);
      renderer.render(uiScene, uiCamera);
      quad.material = screen.frame;
      renderer.setRenderTarget(screen.framed);
      renderer.render(uiScene, uiCamera);
      quad.material = screen.blur;
      screen.blur.wipeAmount = key === 'inner' ? THREE.MathUtils.clamp(1.2 - hinge * 1.2, 0, 1) : Math.min(hinge, 1 - hinge);
      screen.blur.wipePosition = key === 'inner' ? 1 : 0;
      screen.blur.blurBounds.set(key === 'inner' ? .45 : 0, key === 'inner' ? 1 : .9);
      screen.blur.map = screen.framed.texture;
      renderer.setRenderTarget(screen.scratch);
      renderer.render(uiScene, uiCamera);
      screen.blur.map = screen.scratch.texture;
      renderer.setRenderTarget(screen.framed);
      renderer.render(uiScene, uiCamera);
    }
    renderer.setRenderTarget(previous);
    renderer.setClearColor(color, alpha);
  }
  return { update, screens, scene, materials, target, modules };
}
