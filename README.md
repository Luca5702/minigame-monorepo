# Minigame Monorepo · 单机轻量小游戏合集

面向 **小红书小工具**、**Bilibili Toy**、**微信小程序** 与 **GitHub Pages 纯静态 H5** 的离线单机小游戏研发 Monorepo。

## 在线试玩 (GitHub Pages)

- **合集展厅首页**：https://luca5702.github.io/minigame-monorepo/
- **《一绳两筐》直达**：https://luca5702.github.io/minigame-monorepo/one-rope-two-baskets/
- **《照片拼图卡 · 心动拼图》直达**：https://luca5702.github.io/minigame-monorepo/puzzle-card/

---

## 仓库结构

```text
minigame-monorepo/
├── games/
│   ├── one-rope-two-baskets/     # 《一绳两筐》：对向配重与中途卸货物理谜题（10关数学验证 + 调参工坊）
│   └── puzzle-card/              # 《照片拼图卡 · 心动拼图》：刀片切割、重力落盘与双面明信片拼图工坊
├── packages/
│   ├── platform-sdk/             # @minigame/platform-sdk：多端存储、振动、安全区避让与离线合成音效适配层
│   ├── build-tools/              # @minigame/build-tools：小红书/B站离线包合规审计打包器 & 新游戏脚手架
│   └── xhs-mini-sdk/             # @minigame/xhs-mini-sdk：小红书小工具图片保存/音频合成与打包桥接包
├── scripts/
│   └── build-pages.mjs           # 自动聚合全部 games/* 构建产物与合集展厅首页至 _site/
└── docs/
    ├── games/
    │   └── one-rope-two-baskets-gdd.md  # 《一绳两筐》完整设计文档与势能守恒数值表
    └── platform-publishing.md           # 小红书小工具 / Bilibili Toy / 微信小程序发布指南
```

---

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 类型检查与全量单元测试
pnpm typecheck
pnpm test

# 3. 本地开发预览
pnpm dev:one-rope       # 启动《一绳两筐》
pnpm dev:puzzle-card    # 启动《照片拼图卡》

# 4. 构建全部平台产物与 GitHub Pages 站点 (_site/)
pnpm build:pages
```

## 新增下一款小游戏

```bash
pnpm new-game <kebab-case-slug> <中文游戏名>
# 示例：
pnpm new-game lantern-balance 提灯走索
```
