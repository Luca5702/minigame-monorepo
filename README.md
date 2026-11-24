# minigame-monorepo · 小红书互动游戏小工具合集

面向小红书小工具规范构建的纯前端离线小游戏 Monorepo。所有打包产物均满足：
- **纯本地离线运行**：无任何外部网络请求，图片通过 `FileReader` 本地读取
- **CSP 合规**：无内联 `<script>`，全部采用外部 `.js` / `.css` 资源
- **开箱即传**：自动打包 `index.html` 位于根目录的 `.zip` 包（含内置精选图与本地合成音效）

---

## 目录结构

```text
minigame-monorepo/
├── games/
│   └── puzzle-card/          # 《照片拼图卡 · 心动拼图》主游戏
│       ├── public/presets/   # 7 张内置 3:4 小红书美学精选图
│       └── src/
│           ├── jigsaw.ts           # 经典凹凸咬合贝塞尔曲线裁切与 3D 纸板倒角渲染
│           ├── photoStyles.ts      # 5 款卡面质感滤镜（浮光锦/软粉/胶片颗粒/雾面/全息）
│           ├── cuttingStage.ts     # 仪式感刀片切割 + 滤镜晕染 + 碎片弹开动效
│           ├── puzzleBoard.ts      # 拖拽磁吸（≤34px）+ 点击交换双交互拼图引擎
│           ├── postcardRenderer.ts # 1080×1440 (3:4) 正反双面拼图明信片导出渲染
│           └── main.ts             # 8 屏主流程状态机与交互编排
├── packages/
│   └── xhs-mini-sdk/         # 小红书小工具通用桥接与打包校验工具包
│       ├── src/xhsBridge.ts  # window.xhs.miniTool 保存图片/震动兼容与降级
│       ├── src/audio.ts      # 纯本地离线 Web Audio 拟音合成器（切割/咔哒吸附/翻面/通关）
│       └── scripts/pack-xhs.mjs # 小红书 CSP & 离线合规校验 + zip 打包脚本
└── releases/
    └── puzzle-card-xhs.zip   # 可直接上传小红书后台的离线压缩包
```

---

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动《照片拼图卡》开发预览服务 (http://localhost:5173)
pnpm dev

# 类型检查
pnpm typecheck

# 构建并打包符合小红书小工具规范的离线 zip 包
pnpm pack:puzzle-card
```

打包完成后，产物位于 `releases/puzzle-card-xhs.zip`。
