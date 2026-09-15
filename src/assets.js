import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

export async function createAssets() {
  const manifest = await fetch('/apple/manifest.json').then(r => r.json());
  const url = name => {
    const entry = manifest.find(e => e.file.endsWith('/' + name));
    if (!entry) throw new Error(`HAR 中缺少资源：${name}`);
    return '/' + entry.file.replace(/^public\//, '');
  };
  const json = name => fetch(url(name)).then(r => { if (!r.ok) throw new Error(`资源读取失败：${name}`); return r.json(); });
  const scene = await json('iPhoneDuo_ROW_M_avif.lsd');
  const definitions = [...scene.assets];
  for (const name of ['wallpaper-shader-assets.lsd', 'wallpaper-ui-plates-assets.lsd', 'WHKHHiYQlmPXNEM.lsd']) definitions.push(...await json(name));
  const pending = new Map();
  const getAssetPromise = id => {
    if (pending.has(id)) return pending.get(id);
    const definition = definitions.find(a => a.id === id);
    if (!definition) throw new Error(`Missing asset id: ${id}`);
    const file = definition.path.split('/').pop();
    const promise = (file.endsWith('.exr') ? new EXRLoader() : new THREE.TextureLoader()).loadAsync(url(file)).then(texture => {
      Object.assign(texture, definition.properties || {});
      texture.anisotropy = Math.min(texture.anisotropy || 1, 8);
      return texture;
    });
    pending.set(id, promise);
    return promise;
  };
  return { url, json, scene, getAssetPromise, pending };
}
