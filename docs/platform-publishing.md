# 多平台单机小游戏发布指南（小红书小工具 / Bilibili Toy / 微信小程序）

本仓库中的所有单机小游戏均遵循 **「零外网请求 + 纯核心逻辑分层 + 多端自动打包」** 架构。执行 `pnpm build` 后，每个游戏子包的 `dist/` 目录下会自动生成三端可直接上传的产物。

---

## 1. 小红书小工具 (`dist/xhs-minitool.zip`)

### 已自动满足的容器红线（依据小红书小工具容器能力清单）
1. **外置脚本与零行内事件 (`§2.6`)**：构建脚本 `pack-minitool.mjs` 自动将代码编译为经典 IIFE 外置脚本 `<script defer src="./app.js"></script>`，并严格扫描确保无内联 `<script>`、无 `onclick=` 属性、无 `eval()` / `new Function()`。
2. **ES2017 / Chrome 61 兼容基线 (`§2.2`)**：TypeScript 与 Vite 统一锁定 `target: 'es2017'`，样式采用原生 CSS。
3. **零外部网络请求**：图标全部采用内联矢量 SVG，音效采用 Web Audio 实时合成，无任何外部 CDN 字体、图片或音频引用。
4. **容器原生存储规范 (`§3.6` / `§3.7`)**：`@minigame/platform-sdk` 自动检测 `window.xhs.miniTool` 与 `buildVersion >= 9460`，在小红书容器内严格调用 `miniTool.setStorage / getStorage`，绝不违规回退至 `localStorage`。
5. **胶囊与安全区避让 (`§3.11`)**：自动读取 `getWindowInfo()` 避让右上角原生按钮与刘海屏。

### 上传步骤
1. 运行 `pnpm --filter @minigame/one-rope-two-baskets build`。
2. 登录 **小红书创作服务平台 → Builder Hub → 小工具**。
3. 若后台要求使用最新上传页口令做二次校验，可直接将 `games/one-rope-two-baskets/dist/web` 目录交给口令校验，或直接上传生成的 `dist/xhs-minitool.zip`。

---

## 2. Bilibili Toy (`dist/bilibili-toy.zip`)

### 产物说明
- Bilibili Toy 支持上传纯静态 HTML5 压缩包（以根目录 `index.html` 为入口）。
- `dist/bilibili-toy.zip` 体积不足 **30 KB**，点开即玩、无首屏加载等待，自动使用本地存储记录过关进度与最佳步数。

### 上传步骤
1. 打开 [Bilibili Toy 创作后台](https://www.bilibili.com/toy/intro)，新建互动小玩具。
2. 选择 HTML5 静态包上传，提交 `games/one-rope-two-baskets/dist/bilibili-toy.zip` 即可预览发布。

---

## 3. 微信小程序 (`dist/weapp/`)

### 架构优势
- 微信小程序无浏览器 DOM，因此采用 **共享纯 TypeScript 核心引擎 (`src/core`) + 原生 WXML/WXSS 轻量视图 (`src/weapp`)** 方案。
- 无需引入数 MB 的重型跨端运行时框架，主包体积 **< 50 KB**，个人主体小程序账号亦可直接提审发布（不依赖受限的 `<web-view>`）。

### 导入与发布步骤
1. 运行 `pnpm --filter @minigame/one-rope-two-baskets build`。
2. 打开 **微信开发者工具 → 导入项目**，目录选择 `games/one-rope-two-baskets/dist/weapp`。
3. 将 `project.config.json` 中的 `"appid"` 替换为你自己的小程序 AppID，点击预览或上传提审即可。
