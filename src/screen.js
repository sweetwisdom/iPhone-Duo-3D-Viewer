import * as THREE from 'three';

const vertexDeclarations = `
uniform mat4 modelMatrixInverse;
varying vec3 vLocalPosition;
varying vec3 vLocalCameraPosition;
varying mat3 vRotationMatrixInverse;
uniform vec3 emissiveLocalPos;
uniform vec3 rotation;
varying vec3 p0;
varying vec3 p1;
varying vec3 p2;
vec3 rotateAxis(vec3 p, vec3 axis, float angle) {
  return mix(dot(axis, p) * axis, p, cos(angle)) + cross(axis, p) * sin(angle);
}
`;

export function bindScreen(mesh, material, key, wallpaper) {
  const outer = key === 'outer';
  const uniforms = {
    modelMatrixInverse: { value: new THREE.Matrix4() },
    emissiveLocalPos: { value: new THREE.Vector3(...(outer ? [4.1, .8, 0] : [0, 0, 0])) },
    rotation: { value: new THREE.Vector3(-Math.PI / 2, 0, 0) },
    wipeAmount: { value: 0 }, wipePosition: { value: outer ? 0 : 1 },
    minShading: { value: 0 }, offset: { value: outer ? .24 : 0 },
    scale: { value: outer ? .9894 : 1.9816 }, brightness: { value: 1 },
    shadeBounds: { value: new THREE.Vector2(outer ? 0 : .5, 1) },
    zoom: { value: outer ? 7.68 : 7.95 }, transitionToCameraRest: { value: 0 },
    wallpaperUvScale: { value: new THREE.Vector2(1, 1) }, enableFraming: { value: true },
    cameraPos: { value: new THREE.Vector2(2035, 127) }, cameraRadius: { value: 83 },
    cameraDarkness: { value: .95 }, maxViewingAngle: { value: 90 },
  };
  material.emissiveMap = wallpaper.screens[key].framed.texture;
  material.emissive.setRGB(1, 1, 1);
  material.toneMapped = false;
  material.defines = { ...material.defines, USE_UV: '' };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + vertexDeclarations);
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + wallpaper.modules.wipeVertex.default);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + wallpaper.modules.wipeVars.default);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', wallpaper.modules.wipeFragment.default);
  };
  material.customProgramCacheKey = () => 'apple-original-wipe';
  mesh.onBeforeRender = () => uniforms.modelMatrixInverse.value.copy(mesh.matrixWorld).invert();
  material.needsUpdate = true;
  return progress => {
    uniforms.wipeAmount.value = outer ? Math.min(progress, 1 - progress) : THREE.MathUtils.clamp(1.2 - progress * 1.2, 0, 1);
    uniforms.transitionToCameraRest.value = outer ? THREE.MathUtils.smoothstep(progress, .45, 1) : 0;
  };
}
