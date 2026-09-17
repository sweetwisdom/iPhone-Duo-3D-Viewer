# 用 Three.js 还原一个可折叠产品展示：难点与实现

这是一个把 Apple 官网的 iPhone Duo 可折叠产品展示"搬"到独立 Three.js 工程里的项目。它不是官网页面的二次加载，也不是拿一个通用折叠手机模型凑合：模型、81 轨开合动画、壁纸、锁屏 UI、环境光和遮挡关系全部来自真实资源，渲染器则是从头写的独立实现。

这篇文章记录过程中的四个核心难点、对应的实现方式，以及后来把它改造成 React 工程时的取舍。

## 出发点：抓包资源不等于可用工程

最开始面对的资源是网络抓包产物，它有三个让人头疼的特点：

1. **资源按哈希命名**。`vroIlOhiWPzmavg.gltf`、`SfFEyQuyjAgUwjH.exr`、`CaLsvRCanBQuNQY.lsd` —— 从文件名完全看不出内容。
2. **场景与材质配置散落在多个 `.lsd` 文件里**，需要按 id 反查资源路径、按状态名（如 `PT_SliderLanding`）取变换覆盖值。
3. **原始实现依赖 Apple 自家的 Lotus 运行时**，页面入口脚本里还夹着分析代码和大量无关模块。

直接执行官网入口脚本显然不可行。项目的做法是：**建立资源清单，按名字反查资源；只为必需模块提供最小适配层，不执行任何页面入口代码。**

`src/assets.js` 承担了资源定位。它读取抓取时生成的 manifest，按文件名后缀反查 URL，并把四份 `.lsd` 定义合并成一个可按 id 查找的列表：

```js
const url = name => {
  const entry = manifest.find(e => e.file.endsWith('/' + name));
  if (!entry) throw new Error(`HAR 中缺少资源：${name}`);
  return '/' + entry.file.replace(/^public\//, '');
};
```

`getAssetPromise(id)` 则是带缓存的懒加载器，按定义选择 `EXRLoader` 或 `TextureLoader`，并把 `.lsd` 里声明的纹理属性（`wrapS`、`flipY` 等）直接 `Object.assign` 到纹理上，各向异性统一钳到 8。

壁纸部分用了同样的思路。`src/generated/apple-wallpaper.js` 是脚本从官网打包产物里**按依赖图抽取**出来的模块集合（只抽 9 个根节点可达的模块），运行时给它喂一个极小的 Three.js 适配层：

```js
// Minimal adapter for Apple's isolated shader classes; no Lotus runtime or page code.
class Shader extends THREE.ShaderMaterial {
  constructor({ component, data, ...parameters }) { super(parameters); }
}
const modules = createAppleWallpaperModules({ THREE, Shader, Assets: assets, instance: ... });
```

于是官网的 `WallpaperMaterials`、五层 shader、`WallpaperCamera`、以及擦除用的 GLSL 片段都能在标准 Three.js 里跑起来，而不需要引入 Lotus 运行时、页面入口或分析代码。

## 难点一：81 轨 Slider 动画必须"擦洗"而非播放

折叠效果不能靠旋转两块面板糊弄。模型自带的 `Slider` 动画有 **81 条轨道**，铰链、屏幕、机身节点全部由动画时间驱动。这意味着：

- 折叠程度必须是**确定性的**：滑块在 0.6，模型姿态就必须稳定在 0.6，不能靠播放速度猜；
- 滑块值、动画时间、机身位移、屏幕擦除强度、壁纸状态必须同步推进，才能连续过渡。

做法是把动画当成一个可随机访问的"时间轴"：`AnimationMixer` 正常创建，但 action 处于 `paused` 状态，每帧直接写 `action.time`：

```js
if (!clip || clip.tracks.length !== 81) throw new Error('Slider 动画缺失或不完整');
action.setLoop(THREE.LoopOnce, 1);
action.clampWhenFinished = true;
action.paused = true;
// 每帧：
action.time = progress * clip.duration;
mixer.update(0);
rig.position.x = 4 * (1 - progress);   // 展开时机身整体右移
```

这里的 81 轨断言是刻意的：轨道数不对，说明资源或动画不完整，与其渲染出一个静默错误的畸形姿态，不如直接报错。

而 `progress` 本身不是用户直接设定的 `targetProgress`，而是**阻尼插值**的结果，让点击预设时有一个自然的缓动：

```js
if (Math.abs(engine.progress - engine.targetProgress) > .00001) {
  engine.progress = THREE.MathUtils.damp(engine.progress, engine.targetProgress, 10, dt);
  engine.needsRender = true;
}
```

`prefers-reduced-motion` 用户会跳过插值直接吸附到目标值。

## 难点二：屏幕是一帧帧合成出来的，不是一张贴图

这是整个项目里链路最长的一环。屏幕画面依次经过：

1. **渲染五层壁纸场景**（天空、星空、远山、两层沙丘）到 `1600×~` 的 `HalfFloatType` 离屏目标，带 4× MSAA；
2. **叠加锁屏 UI**：内屏、外屏各自的 UI 贴图层，通过正交相机 + 全屏 quad 合成到 `output`；
3. **画框处理**（framing pass）写入 `framed`，带 mipmap；
4. **模糊 ping-pong**：`framed → scratch → framed`，用官网的 blur shader，按开合程度控制擦除量与模糊范围。

关键在于内屏和外屏的参数并不对称 —— 内屏从右侧擦除、外屏在合拢和展开两端都会擦除：

```js
screen.blur.wipeAmount = key === 'inner'
  ? THREE.MathUtils.clamp(1.2 - hinge * 1.2, 0, 1)
  : Math.min(hinge, 1 - hinge);
screen.blur.wipePosition = key === 'inner' ? 1 : 0;
screen.blur.blurBounds.set(key === 'inner' ? .45 : 0, key === 'inner' ? 1 : .9);
```

合成结果作为 `emissiveMap` 贴到屏幕材质上，同时**把官网原始的擦除 GLSL 注入标准 PBR 着色器**（`src/screen.js`）：在 `#include <common>` 后插入顶点声明、在 `#include <worldpos_vertex>` 后插入 `wipeVertex`、把 `#include <emissivemap_fragment>` 整个替换成 `wipeFragment`。这样屏幕的亮度、遮罩与过渡逻辑与官网保持一致，而不是自己另写一套近似效果：

```js
material.onBeforeCompile = shader => {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>',
    '#include <worldpos_vertex>\n' + wallpaper.modules.wipeVertex.default);
  shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
    wallpaper.modules.wipeFragment.default);
};
material.customProgramCacheKey = () => 'apple-original-wipe';
```

还有一个容易忽略的常量：抓包下来的壁纸本身带 **11% 的折叠死区**（`FOLD_DEAD_ZONE`），滑块从 0 到 0.11 时壁纸不动。这个常量必须原样保留，否则屏幕内容和机身姿态会对不上。

## 难点三：环境反射与模板缓冲遮挡

**环境部分**：官网用多组环境资源控制反射。项目把三套 glTF 光卡场景 + 两张 EXR 全景图统一烘焙成 6 层 PMREM 环境贴图（`src/environment.js`）。glTF 场景的处理有两个细节：

- 光卡在 Lotus 里是自发光材质，这里转成 `MeshBasicMaterial`，颜色取 `emissive × emissiveIntensity`，才能在 cubemap 里正确贡献亮度；
- 每个节点的 position/scale/rotation 覆盖值从 `.lsd` 的 `PT_SliderLanding` 状态里读取。

材质层映射之后还有一道**手工校准**：四个珍珠白背板材质被强制指向第 5 层环境，`metalness .025` / `roughness .48` / `envMapIntensity 1.2`，机身另一处节点则使用克隆后单独调参的材质。这类数值没有推导过程，只能对着截图反复比对。

**遮挡部分**更复杂。机身边缘和屏幕叠层如果关系错了，会出现"屏幕盖住边框"或"边框穿透屏幕"的错误。官网用的是遮罩定义，项目用**模板缓冲 + 显式渲染通道**复刻（`src/masking.js`）：

每个遮罩定义包含三类网格，共享一个模板位（`1 << index`）：

- `footprints`：`stencilZFail = ZeroStencilOp`、`stencilZPass = ReplaceStencilOp`、参考值 255 —— 写模板；
- `blockers`：深度遮挡物，写入参考值 0 —— 擦掉不该显示的区域；
- `targets`：最终受控对象，`stencilFuncMask = bit` 且 `stencilRef = bit`。

渲染分两趟：主渲染前把 targets 关掉颜色写入（`before()`），渲染完再逐一对 targets 单独重绘（`after()`），此时切换成 `EqualStencilFunc` 并给一个夸张的多边形偏移把深度拉到最前：

```js
Object.assign(object.material, {
  colorWrite: true, stencilFunc: THREE.EqualStencilFunc,
  polygonOffset: true, polygonOffsetUnits: -1e6,
});
renderer.render(object, camera);   // autoClear 临时关闭
```

注意 materials 在这一步都先 `clone()` 过——官网资源里 footprint 与普通几何共享材质，不克隆会把模板状态污染到别的网格上。

## React 改造：把命令式世界和 UI 世界分开

项目原本是单文件 `main.js`（196 行，是唯一触碰 DOM 的文件）+ 五个框架无关的异步工厂模块。改造的原则是：

- **五个渲染模块零改动**。`assets / wallpaper / screen / environment / masking` 全是纯 Three.js + fetch，直接复用。
- **命令式世界放 ref，UI 世界放 state**。阻尼动画的 `progress`、`needsRender`、所有 Three.js 对象都挂在 `engineRef` 上；React state 只有三个：`status`、`message`、`targetProgress`。
- **动画循环内零 `setState`**。渲染仍然是按需的（`needsRender` 脏标记），重渲染只在用户改折叠目标、加载阶段切换、成功/失败时发生。滑块拖动因此不会引发每帧重渲染。

```js
export function useDuoViewer(initialFold) {
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('正在载入体验');
  const [targetProgress, setTargetProgress] = useState(initialFold);
  const engineRef = useRef({ progress: initialFold, targetProgress: initialFold, needsRender: true, ... });
  // setFold 只写 engine + 同步 UI 镜像，identity 稳定（供 window.duo 调用）
}
```

原先的 `syncControls()` 负责命令式更新滑块 value、`--progress` CSS 变量、`aria-valuetext`、预设按钮的 `aria-pressed`，在 React 里直接变成声明式渲染：

```jsx
<input id="fold" type="range" min="0" max="1" step="0.001"
  value={targetProgress}
  aria-valuetext={`展开 ${Math.round(targetProgress * 100)}%`}
  style={{ '--progress': `${targetProgress * 100}%` }}
  onChange={e => onSetFold(Number(e.target.value), true)} />
```

两处刻意的取舍：

1. **不启用 StrictMode**。它在开发环境双跑 effect，会导致异步 WebGL 初始化执行两次（两个渲染器、两份加载、上下文泄漏）。Hook 内部仍保留 `cancelled` 标志兜底。
2. **拖拽光标用 ref 直接改 `classList`**，不进 state —— 避免每次按下/松开都触发重渲染，也不会和 OrbitControls 自己的指针监听脱节。

改造还保留了 Playwright 检查脚本依赖的兼容契约：`window.duo` 对象（`setFold` / `progress` / `ready` / `camera` / `gltf` / `animation`）、`#load-message` 元素、`?isolated`、`?fold=`，以及 5186 端口。

## 踩到的一个坑：端口打架导致 "React is not defined"

改造完成后第一次跑检查脚本，页面报 `React is not defined`，而 `curl` 拿到的转换结果确实是 `React.createElement(...)`（classic 运行时），根 HTML 里也没有 react-refresh 注入 —— 看起来插件完全没生效，但端口却明明是配置里的 5186。

真凶是**上一个（改造前的）dev server 没被真正杀死**：在 Windows + Git Bash 下，`TaskStop` 只终止了 shell，node 子进程成了孤儿，仍然监听 `[::1]:5186`（IPv6 回环）。而新服务器监听的是 `0.0.0.0:5186`（IPv4）。浏览器和 `curl` 解析 `localhost` 时优先走 `::1`，于是请求一直打到**没有 React 插件的旧服务器**上 —— 旧服务器从磁盘读取的却又是改造后的新文件，于是出现了"新代码 + 旧转换"的诡异组合。

```text
TCP    0.0.0.0:5186    0.0.0.0:0    LISTENING    27676   ← 新（React）
TCP    [::1]:5186      [::]:0       LISTENING    12884   ← 旧（vanilla，孤儿进程）
```

教训：在 Windows 上停 dev server 后，用 `netstat -ano | grep :端口` 确认再启动；清理 `.vite` 依赖缓存也能避免优化器哈希漂移带来的 `504 Outdated Optimize Dep`。

## 如何验证没有改坏

还原类项目的回归很难靠断言，这里用的是**截图基线对比**。`scripts/inspect.mjs` 会用 Playwright（Edge headless）打开 `?isolated` 页面，等 `window.duo.ready`，然后依次截图：初始状态、`fold=0 / 0.6 / 1`、以及把相机移到背部的视角，同时 dump 射线检测结果、`#load-message` 文本、动画轨道数和屏幕网格的 UV 采样。

改造前先存一份 `test-results-baseline/`，改造后逐字节比对。结果：

```text
fold-0:      IDENTICAL
fold-0.6:    IDENTICAL
fold-1:      IDENTICAL
initial:     仅 spinner 动画相位导致的几字节差异
back-before: 抗锯齿噪声导致的十几字节差异
```

射线检测输出（命中网格名、材质名、距离）与 `animation: { name: 'Slider', duration: 2, tracks: 81 }` 也完全一致。控制台零 error、零 PAGE ERROR，唯一的 warning 是检查脚本自己用 `/node_modules/three/...` 导入 three 造成的"多实例"提示，改造前后都存在。

## 还原的边界

最后要说清楚：项目复用的是抓包资源，渲染器是独立实现。不同浏览器、GPU、色彩管理与光照模型会带来轻微的反射、抗锯齿和色彩差异。目标是还原产品展示的**模型、状态、层次与交互**，而不是复制官网的完整运行时。

---

相关文档：[项目难点与亮点](./docs/PROJECT-NOTES.md) · [README](./README.md)
