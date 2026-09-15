import * as THREE from 'three';

// Port of setupMasks in the captured page, using explicit passes with stock Three.js.
export async function createMaskPass(gltf, assets) {
  const definitions = await assets.json('CaLsvRCanBQuNQY.lsd');
  const targets = [];
  for (const [index, definition] of definitions.entries()) {
    const bit = 1 << index;
    const mesh = name => {
      const object = gltf.scene.getObjectByName(name);
      if (!object?.isMesh) throw new Error(`Missing stencil mesh: ${name}`);
      // Some materials are shared by footprint and non-footprint geometry.
      object.material = object.material.clone();
      return object;
    };
    for (const name of definition.footprints) {
      const object = mesh(name);
      Object.assign(object.material, { stencilWrite:true, stencilFunc:THREE.AlwaysStencilFunc, stencilFail:THREE.KeepStencilOp, stencilZFail:THREE.ZeroStencilOp, stencilZPass:THREE.ReplaceStencilOp, stencilWriteMask:bit, stencilRef:255 });
    }
    for (const name of definition.blockers) {
      const object = mesh(name);
      Object.assign(object.material, { stencilWrite:true, stencilFunc:THREE.AlwaysStencilFunc, stencilFail:THREE.KeepStencilOp, stencilZFail:THREE.KeepStencilOp, stencilZPass:THREE.ReplaceStencilOp, stencilWriteMask:bit, stencilRef:0 });
    }
    for (const name of definition.targets) {
      const object = mesh(name);
      Object.assign(object.material, { stencilWrite:true, stencilFunc:THREE.AlwaysStencilFunc, stencilFail:THREE.KeepStencilOp, stencilZFail:THREE.KeepStencilOp, stencilZPass:THREE.KeepStencilOp, stencilFuncMask:bit, stencilRef:bit });
      targets.push(object);
    }
  }
  return {
    before() {
      targets.forEach(({material}) => Object.assign(material, { colorWrite:false, depthTest:true, polygonOffset:false, polygonOffsetUnits:0, stencilFunc:THREE.AlwaysStencilFunc }));
    },
    after(renderer, camera) {
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      for (const object of targets) {
        Object.assign(object.material, { colorWrite:true, depthTest:true, polygonOffset:true, polygonOffsetUnits:-1e6, stencilFunc:THREE.EqualStencilFunc });
        renderer.render(object, camera);
      }
      renderer.autoClear = autoClear;
    },
  };
}
