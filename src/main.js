import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createAssets } from './assets.js';
import { createWallpaper } from './wallpaper.js';
import { bindScreen } from './screen.js';
import { createEnvironments, applyMaterialConfiguration } from './environment.js';
import { createMaskPass } from './masking.js';
import './style.css';

const params = new URLSearchParams(location.search);
if (params.has('isolated')) document.body.classList.add('isolated');
const container = document.querySelector('.product-viewer-canvas');
const hitArea = document.querySelector('.viewer-hit-area');
const slider = document.querySelector('#fold');
const loading = document.querySelector('.loading');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let progress = THREE.MathUtils.clamp(Number(params.get('fold') ?? .3333), 0, 1);
if (!Number.isFinite(progress)) progress = .3333;
let targetProgress = progress;
let renderer, scene, camera, orbit, rig, mixer, action, wallpaper;
let needsRender = true;
const screenUniforms = [];
const controls = document.querySelectorAll('button, input');
controls.forEach(el => el.disabled = true);

function syncControls(value) {
  slider.value = value;
  slider.style.setProperty('--progress', `${value * 100}%`);
  slider.setAttribute('aria-valuetext', `展开 ${Math.round(value * 100)}%`);
  document.querySelectorAll('.presets button').forEach(b => b.setAttribute('aria-pressed', Math.abs(Number(b.dataset.fold) - value) < .02));
}
function setFold(value, immediate = false) {
  targetProgress = THREE.MathUtils.clamp(value, 0, 1);
  if (immediate || reduced) progress = targetProgress;
  syncControls(targetProgress);
  needsRender = true;
}
slider.addEventListener('input', () => setFold(Number(slider.value), true));
document.querySelectorAll('[data-fold]').forEach(b => b.addEventListener('click', () => setFold(Number(b.dataset.fold))));
document.querySelector('.reset').addEventListener('click', reset);
function reset() { orbit?.reset(); setFold(.3333); }
hitArea.addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'r', 'R'].includes(e.key)) e.preventDefault();
  if (e.key === 'ArrowLeft') setFold(targetProgress - .05);
  if (e.key === 'ArrowRight') setFold(targetProgress + .05);
  if (e.key === 'Home') setFold(0);
  if (e.key === 'End') setFold(1);
  if (e.key.toLowerCase() === 'r') reset();
});
hitArea.addEventListener('pointerdown', () => hitArea.classList.add('dragging'));
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) hitArea.addEventListener(event, () => hitArea.classList.remove('dragging'));

function configureScreen(material, key) {
  material.emissiveMap = wallpaper.screens[key].target.texture;
  material.emissive.setRGB(1, 1, 1);
  material.toneMapped = false;
  const uniforms = { fold: { value: progress }, outer: { value: key === 'outer' ? 1 : 0 } };
  screenUniforms.push(uniforms);
  // Screen geometry, UVs and skinning are untouched. Only the emissive surface is adapted.
  material.onBeforeCompile = shader => {
    shader.uniforms.uFold = uniforms.fold;
    shader.uniforms.uOuter = uniforms.outer;
    shader.fragmentShader = 'uniform float uFold;\nuniform float uOuter;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
      #ifdef USE_EMISSIVEMAP
        vec2 screenUv = vec2(vEmissiveMapUv.x, 1.0 - vEmissiveMapUv.y);
        float wipe = clamp(1.2 - uFold * 1.2, 0.0, 1.0);
        float left = 1.0 - smoothstep(0.36, 0.56, screenUv.x);
        float shade = uOuter > 0.5 ? 1.0 : 1.0 - left * wipe * 0.78;
        vec2 blur = vec2(0.005 * wipe * left, 0.0);
        vec3 screenColor = texture2D(emissiveMap, screenUv).rgb * 0.4;
        screenColor += texture2D(emissiveMap, screenUv + blur).rgb * 0.24;
        screenColor += texture2D(emissiveMap, screenUv - blur).rgb * 0.24;
        screenColor += texture2D(emissiveMap, screenUv + blur * 2.0).rgb * 0.06;
        screenColor += texture2D(emissiveMap, screenUv - blur * 2.0).rgb * 0.06;
        totalEmissiveRadiance *= screenColor * shade;
      #endif
    `);
  };
  material.customProgramCacheKey = () => 'apple-screen-emissive-v1';
  material.needsUpdate = true;
}

async function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0xffffff, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.append(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, .1, 300);
  camera.position.set(0, 0, -35);
  orbit = new OrbitControls(camera, hitArea);
  orbit.enablePan = false;
  orbit.enableZoom = false;
  orbit.enableDamping = true;
  orbit.dampingFactor = .095;
  orbit.rotateSpeed = .55;
  orbit.minPolarAngle = Math.PI * .28;
  orbit.maxPolarAngle = Math.PI * .72;
  orbit.addEventListener('change', () => needsRender = true);
  orbit.update();
  orbit.saveState();
  const assets = await createAssets();
  document.querySelector('#load-message').textContent = '正在载入模型与壁纸';
  const [gltf, wp, environments] = await Promise.all([
    new GLTFLoader().loadAsync(assets.url('vroIlOhiWPzmavg.gltf')),
    createWallpaper(renderer, assets),
    createEnvironments(renderer, assets),
  ]);
  wallpaper = wp;
  scene.environment = environments.get(5).texture;
  scene.environmentIntensity = 1;
  await applyMaterialConfiguration(gltf, assets, environments);
  const maskPass = await createMaskPass(gltf, assets);
  rig = new THREE.Group();
  // Exact YXZ product-root orientation from hWLllVgYfyjRkBR.lsd.
  rig.rotation.set(1.5708, 3.1416, 0, 'YXZ');
  rig.add(gltf.scene);
  scene.add(rig);
  mixer = new THREE.AnimationMixer(gltf.scene);
  const clip = THREE.AnimationClip.findByName(gltf.animations, 'Slider');
  if (!clip || clip.tracks.length !== 81) throw new Error('Slider 动画缺失或不完整');
  action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  action.paused = true;
  const seen = new Set();
  gltf.scene.traverse(object => {
    if (!object.isMesh) return;
    object.frustumCulled = false;
    for (const material of [object.material].flat()) {
      if (seen.has(material)) continue;
      seen.add(material);
      if (material.name === 'pkUBCyCvYJYVzTr') screenUniforms.push(bindScreen(object, material, 'inner', wallpaper));
      if (material.name === 'screenTextureOuterDisplay_usd_shd_lts') screenUniforms.push(bindScreen(object, material, 'outer', wallpaper));
    }
  });
  syncControls(progress);
  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < 600 ? 39 : 32;
    camera.updateProjectionMatrix();
    needsRender = true;
  };
  new ResizeObserver(resize).observe(container);
  resize();
  controls.forEach(el => el.disabled = false);
  let previous = performance.now();
  renderer.setAnimationLoop(now => {
    if (document.hidden) return;
    const dt = Math.min((now - previous) / 1000, .05);
    previous = now;
    orbit.update();
    if (Math.abs(progress - targetProgress) > .00001) {
      progress = THREE.MathUtils.damp(progress, targetProgress, 10, dt);
      needsRender = true;
    }
    if (!needsRender) return;
    action.time = progress * clip.duration;
    mixer.update(0);
    rig.position.x = 4 * (1 - progress);
    screenUniforms.forEach(update => update(progress));
    wallpaper.update(progress);
    scene.updateMatrixWorld(true);
    maskPass.before();
    renderer.render(scene, camera);
    maskPass.after(renderer, camera);
    needsRender = false;
  });
  // Read-only scene inspection plus deterministic fold control for reproduction checks.
  window.duo = { setFold, get progress() { return progress; }, get ready() { return true; }, scene, camera, rig, gltf, wallpaper, renderer, animation: { name: clip.name, duration: clip.duration, tracks: clip.tracks.length } };
  loading.classList.add('loaded');
  renderer.domElement.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    loading.classList.remove('loaded');
    loading.classList.add('failed');
    document.querySelector('#load-message').textContent = '图形上下文已中断，请刷新页面重新载入。';
  });
}
init().catch(error => {
  console.error(error);
  loading.classList.add('failed');
  loading.querySelector('.spinner')?.remove();
  document.querySelector('#load-message').textContent = `无法载入三维展示：${error.message}`;
  const retry = document.createElement('button');
  retry.textContent = '重新载入';
  retry.onclick = () => location.reload();
  loading.append(retry);
});
