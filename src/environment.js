import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

export async function createEnvironments(renderer, assets) {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(request => {
    const name = request.split('/').pop();
    if (/\.(png|jpg)$/.test(name)) {
      try { return assets.url(name.replace(/\.(png|jpg)$/, '.avif')); } catch { /* Captured PNGs stay PNGs. */ }
    }
    return request;
  });
  const specs = [
    ['lxfmQjvBiFmqVSB.gltf', 'EiQJJOWWiRyvPQA.lsd'],
    ['HIBNFTIRMmbKPzu.gltf', 'QNpouDPhjifWoVJ.lsd'],
    ['aPBhICIQRrndUTh.gltf', 'cegZRPVOZLfnvlZ.lsd'],
  ];
  const models = await Promise.all(specs.map(async ([model, variant]) => ({
    gltf: await new GLTFLoader(manager).loadAsync(assets.url(model)),
    variants: await assets.json(variant),
  })));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const layers = new Map();
  for (let index = 0; index < models.length; index++) {
    const { gltf, variants } = models[index];
    const state = variants.find(v => v['@states'].includes('PT_SliderLanding'));
    const privateScene = new THREE.Scene();
    privateScene.background = new THREE.Color(0);
    privateScene.add(gltf.scene);
    gltf.scene.traverse(object => {
      const props = state?.[object.name];
      if (props) {
        for (const [group, property] of [['position', 'position'], ['scale', 'scale'], ['rotation', 'rotation']]) {
          for (const axis of ['x', 'y', 'z']) {
            const value = props[property + axis.toUpperCase()];
            if (value !== undefined) object[group][axis] = value;
          }
        }
      }
      if (object.isMesh) {
        object.frustumCulled = false;
        const original = object.material;
        const values = state?.[original.name];
        if (values?.emissiveIntensity !== undefined) original.emissiveIntensity = values.emissiveIntensity;
        // Lotus light cards are emissive textures. Basic material reproduces that in the cubemap.
        object.material = new THREE.MeshBasicMaterial({
          color: original.emissive.clone().multiplyScalar(original.emissiveIntensity),
          map: original.map, transparent: original.transparent, opacity: original.opacity,
          side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
        });
      }
    });
    privateScene.updateMatrixWorld(true);
    layers.set(index, pmrem.fromScene(privateScene, 0, .1, 1000));
  }
  for (const [layer, file] of [[4, 'ADsFgCxkeKZYiww.exr'], [5, 'SfFEyQuyjAgUwjH.exr']]) {
    const texture = await new EXRLoader().loadAsync(assets.url(file));
    texture.mapping = THREE.EquirectangularReflectionMapping;
    layers.set(layer, pmrem.fromEquirectangular(texture));
    texture.dispose();
  }
  pmrem.dispose();
  return layers;
}

export async function applyMaterialConfiguration(gltf, assets, environments) {
  let config;
  function find(node) {
    if (node.materials) config = node.materials;
    node.children?.forEach(find);
  }
  assets.scene.children.forEach(find);
  const tasks = [];
  const seen = new Set();
  gltf.scene.traverse(object => {
    if (!object.isMesh || seen.has(object.material)) return;
    const material = object.material;
    seen.add(material);
    const definition = config[material.name];
    if (!definition) return;
    const chunks = definition.chunks;
    material.envMap = environments.get(definition.layer)?.texture || environments.get(5).texture;
    material.envMapRotation.set(0, 0, 0);
    if (definition.layer === 4) material.envMapRotation.set(1, .6, 0);
    if (definition.layer === 5) material.envMapRotation.set(0, 2.09, 0);
    if (chunks.Transparency) {
      material.opacity = chunks.Transparency.opacity;
      material.transparent = chunks.Transparency.transparent;
      material.depthWrite = !material.transparent;
    }
    if (chunks.BlendMode) {
      const { blending, blendSrc, blendDst, blendEquation } = chunks.BlendMode;
      Object.assign(material, { blending, blendSrc, blendDst, blendEquation });
    }
    if (chunks.AoMap?.aoMap) {
      tasks.push(assets.getAssetPromise(chunks.AoMap.aoMap).then(texture => {
        material.aoMap = texture;
        material.aoMapIntensity = chunks.AoMap.aoMapIntensity;
      }));
    }
    material.needsUpdate = true;
  });
  await Promise.all(tasks);
  // The captured environment variants target Lotus' per-angle renderer. Calibrate the
  // broad pearl surfaces against the supplied white-back reference in stock Three.js.
  gltf.scene.traverse(object => {
    if (!object.isMesh) return;
    const material = object.material;
    if (['MZiYIrcFSqDDBWG', 'ZoizrWFccovSVQl', 'qJbGiREHXwRMmQc', 'dLDrceZOOgIrzrK'].includes(material.name)) {
      material.envMap = environments.get(5).texture;
      material.envMapIntensity = 1.2;
      material.envMapRotation.set(0, 2.09, 0);
      material.color.setRGB(1, 1, 1);
      material.metalness = .025;
      material.roughness = .48;
    }
    if (object.name === 'LDcHeENovRXWVxD') {
      object.material = material.clone();
      Object.assign(object.material, { blending:THREE.NormalBlending, transparent:false, opacity:1, metalness:.08, roughness:.4, envMap:environments.get(5).texture, envMapIntensity:.75 });
      object.material.color.set('#bfc0c0');
      object.material.envMapRotation.set(0, 2.09, 0);
    }
  });
  return config;
}
