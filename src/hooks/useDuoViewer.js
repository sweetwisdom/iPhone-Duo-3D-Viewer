import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createAssets } from '../assets.js';
import { createWallpaper } from '../wallpaper.js';
import { bindScreen } from '../screen.js';
import { createEnvironments, applyMaterialConfiguration } from '../environment.js';
import { createMaskPass } from '../masking.js';

/**
 * Owns the Three.js engine lifecycle. All rendering state (damped progress,
 * needsRender, scene objects) lives in engineRef; React state is limited to
 * UI mirrors (targetProgress, status, message) so the animation loop never
 * triggers re-renders.
 */
export function useDuoViewer(initialFold) {
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('正在载入体验');
  const [targetProgress, setTargetProgress] = useState(initialFold);

  const containerRef = useRef(null);
  const hitAreaRef = useRef(null);
  const reducedRef = useRef(matchMedia('(prefers-reduced-motion: reduce)').matches);
  const engineRef = useRef({
    progress: initialFold,
    targetProgress: initialFold,
    needsRender: true,
    screenUniforms: [],
    renderer: null, scene: null, camera: null, orbit: null, rig: null,
    mixer: null, action: null, clip: null, wallpaper: null, gltf: null,
  });

  const setFold = useCallback((value, immediate = false) => {
    const engine = engineRef.current;
    engine.targetProgress = THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
    if (immediate || reducedRef.current) engine.progress = engine.targetProgress;
    engine.needsRender = true;
    setTargetProgress(engine.targetProgress);
  }, []);

  const reset = useCallback(() => {
    engineRef.current.orbit?.reset();
    setFold(.3333);
  }, [setFold]);

  const handleKeyDown = useCallback(e => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'r', 'R'].includes(e.key)) e.preventDefault();
    const { targetProgress: target } = engineRef.current;
    if (e.key === 'ArrowLeft') setFold(target - .05);
    if (e.key === 'ArrowRight') setFold(target + .05);
    if (e.key === 'Home') setFold(0);
    if (e.key === 'End') setFold(1);
    if (e.key.toLowerCase() === 'r') reset();
  }, [setFold, reset]);

  useEffect(() => {
    let cancelled = false;
    let observer = null;
    const engine = engineRef.current;

    (async () => {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true });
      engine.renderer = renderer;
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setClearColor(0xffffff, 1);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      containerRef.current.append(renderer.domElement);
      const scene = new THREE.Scene();
      engine.scene = scene;
      const camera = new THREE.PerspectiveCamera(32, 1, .1, 300);
      engine.camera = camera;
      camera.position.set(0, 0, -35);
      const orbit = new OrbitControls(camera, hitAreaRef.current);
      engine.orbit = orbit;
      orbit.enablePan = false;
      orbit.enableZoom = false;
      orbit.enableDamping = true;
      orbit.dampingFactor = .095;
      orbit.rotateSpeed = .55;
      orbit.minPolarAngle = Math.PI * .28;
      orbit.maxPolarAngle = Math.PI * .72;
      orbit.addEventListener('change', () => engine.needsRender = true);
      orbit.update();
      orbit.saveState();
      const assets = await createAssets();
      if (cancelled) return;
      setMessage('正在载入模型与壁纸');
      const [gltf, wallpaper, environments] = await Promise.all([
        new GLTFLoader().loadAsync(assets.url('vroIlOhiWPzmavg.gltf')),
        createWallpaper(renderer, assets),
        createEnvironments(renderer, assets),
      ]);
      if (cancelled) return;
      engine.gltf = gltf;
      engine.wallpaper = wallpaper;
      scene.environment = environments.get(5).texture;
      scene.environmentIntensity = 1;
      await applyMaterialConfiguration(gltf, assets, environments);
      const maskPass = await createMaskPass(gltf, assets);
      const rig = new THREE.Group();
      engine.rig = rig;
      // Exact YXZ product-root orientation from hWLllVgYfyjRkBR.lsd.
      rig.rotation.set(1.5708, 3.1416, 0, 'YXZ');
      rig.add(gltf.scene);
      scene.add(rig);
      const mixer = new THREE.AnimationMixer(gltf.scene);
      engine.mixer = mixer;
      const clip = THREE.AnimationClip.findByName(gltf.animations, 'Slider');
      if (!clip || clip.tracks.length !== 81) throw new Error('Slider 动画缺失或不完整');
      engine.clip = clip;
      const action = mixer.clipAction(clip);
      engine.action = action;
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
          if (material.name === 'pkUBCyCvYJYVzTr') engine.screenUniforms.push(bindScreen(object, material, 'inner', wallpaper));
          if (material.name === 'screenTextureOuterDisplay_usd_shd_lts') engine.screenUniforms.push(bindScreen(object, material, 'outer', wallpaper));
        }
      });
      const resize = () => {
        const { width, height } = containerRef.current.getBoundingClientRect();
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.fov = width < 600 ? 39 : 32;
        camera.updateProjectionMatrix();
        engine.needsRender = true;
      };
      observer = new ResizeObserver(resize);
      observer.observe(containerRef.current);
      resize();
      let previous = performance.now();
      renderer.setAnimationLoop(now => {
        if (document.hidden) return;
        const dt = Math.min((now - previous) / 1000, .05);
        previous = now;
        orbit.update();
        if (Math.abs(engine.progress - engine.targetProgress) > .00001) {
          engine.progress = THREE.MathUtils.damp(engine.progress, engine.targetProgress, 10, dt);
          engine.needsRender = true;
        }
        if (!engine.needsRender) return;
        action.time = engine.progress * clip.duration;
        mixer.update(0);
        rig.position.x = 4 * (1 - engine.progress);
        engine.screenUniforms.forEach(update => update(engine.progress));
        wallpaper.update(engine.progress);
        scene.updateMatrixWorld(true);
        maskPass.before();
        renderer.render(scene, camera);
        maskPass.after(renderer, camera);
        engine.needsRender = false;
      });
      // Read-only scene inspection plus deterministic fold control for reproduction checks.
      window.duo = {
        setFold,
        get progress() { return engineRef.current.progress; },
        get ready() { return true; },
        scene, camera, rig, gltf, wallpaper, renderer,
        animation: { name: clip.name, duration: clip.duration, tracks: clip.tracks.length },
      };
      setStatus('loaded');
      renderer.domElement.addEventListener('webglcontextlost', e => {
        e.preventDefault();
        setStatus('failed');
        setMessage('图形上下文已中断，请刷新页面重新载入。');
      });
    })().catch(error => {
      if (cancelled) return;
      console.error(error);
      setStatus('failed');
      setMessage(`无法载入三维展示：${error.message}`);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      const { renderer, orbit } = engineRef.current;
      renderer?.setAnimationLoop(null);
      orbit?.dispose();
      renderer?.domElement?.remove();
      renderer?.dispose();
    };
  }, [setFold]);

  const disabled = status !== 'loaded';
  return { containerRef, hitAreaRef, status, message, targetProgress, setFold, reset, handleKeyDown, disabled };
}
