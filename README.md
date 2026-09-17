# iPhone Duo 3D Viewer

基于 Apple 中国官网 iPhone Duo 页面抓包资源还原的可折叠三维产品展示。项目使用官网提供的 glTF 模型、`Slider` 开合动画、壁纸场景、环境贴图和遮罩定义，在 Three.js 中实现独立运行的交互式展示。

有关还原过程中的技术难点与实现亮点，见 [项目难点与亮点](./docs/PROJECT-NOTES.md)。

![展开状态](./.imgs/image-20260915193513042.png)

![侧面细节](./.imgs/image-20260915193538891.png)

![合拢状态](./.imgs/image-20260915193621740.png)
## 功能

- 真实 iPhone Duo glTF 模型与 81 轨 `Slider` 开合动画
- 拖动旋转视角、滑块连续开合，以及合拢／中间／完全展开预设
- 内外屏壁纸、锁屏 UI、随折叠状态变化的屏幕遮罩与模糊效果
- 从官网环境资源生成的反射光照，校准为珍珠白背板效果
- 复刻官网遮罩关系，避免机身边缘和屏幕叠层错误
- 键盘操作：`←`、`→` 开合，`Home` 合拢，`End` 展开，`R` 重置视角与姿态
- 支持 `prefers-reduced-motion`，加载失败时提供重新载入入口

## 启动

需要 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

终端会输出本地访问地址，默认 `http://localhost:5186`（`vite.config.js` 固定端口，`scripts/inspect.mjs` 依赖该端口）。如需构建生产文件：

```bash
npm run build
npm run preview
```

页面可接受以下查询参数：

```text
?fold=0        # 初始合拢
?fold=0.3333   # 初始中间姿态（默认）
?fold=1        # 初始完全展开
?isolated      # 隐藏顶部、标题与页脚，便于嵌入展示
```

## 交互

在模型区域拖动即可旋转。下方滑块控制开合程度；也可点击“合拢”“可折叠设计”“完全展开”切换预设。右下角的重置按钮会恢复默认镜头和中间姿态。

## 项目结构

```text
├── index.html                 页面结构与控件
├── src/
│   ├── main.js                Three.js 场景、模型动画和交互
│   ├── assets.js              HAR 资源清单与纹理加载
│   ├── wallpaper.js           官网壁纸场景与屏幕渲染目标
│   ├── screen.js              内外屏原始擦除着色逻辑
│   ├── environment.js         环境光照和机身材质配置
│   ├── masking.js             官网遮罩定义的 Three.js 实现
│   ├── style.css              页面样式与响应式规则
│   └── generated/             从官网脚本提取的壁纸模块
├── public/apple/              从 HAR 提取的官网静态资源与 manifest
├── reference/                 原始页面及参考 CSS/JS
├── docs/PROJECT-NOTES.md      项目难点与亮点
├── scripts/
│   ├── extract-assets.mjs     从 HAR 提取静态资源
│   ├── extract-wallpaper.mjs  提取壁纸依赖模块
│   └── inspect.mjs            浏览器截图与场景检查脚本
├── 01.md                      参考效果图
```

## 资源提取与检查

仓库已经包含运行所需资源，日常启动无需执行资源提取。`scripts/inspect.mjs` 会通过 Playwright 打开本地页面，并生成不同开合状态的截图到 `test-results/`。启动开发服务器后，以端口 `5186` 提供页面即可执行：

```bash
node scripts/inspect.mjs
```

## 实现说明

该项目不会运行抓取页面的入口脚本。`extract-wallpaper.mjs` 只抽取壁纸渲染所需模块，运行时由一个最小的 Three.js 适配层提供依赖。产品模型动画、环境、屏幕 UI 和纹理均通过 `public/apple/manifest.json` 按文件名定位。

## 资源说明

本项目用于网页三维渲染研究与界面还原。Apple、iPhone 和相关视觉资产的权利归其各自权利人所有；发布、商用或再次分发前，请自行确认授权与合规要求。
