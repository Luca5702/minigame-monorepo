#!/usr/bin/env node
/**
 * 快速在 monorepo 的 games/<slug> 下创建新单机小游戏骨架
 * 用法: pnpm new-game <slug> [游戏标题]
 */

import fs from 'node:fs';
import path from 'node:path';

const [, , rawSlug, rawTitle] = process.argv;
if (!rawSlug || !/^[a-z0-9-]+$/.test(rawSlug)) {
  console.error('用法: pnpm new-game <kebab-case-slug> [中文游戏名]');
  console.error('示例: pnpm new-game lantern-balance 提灯走索');
  process.exit(1);
}

const title = rawTitle || rawSlug;
const rootDir = process.cwd();
const targetDir = path.join(rootDir, 'games', rawSlug);

if (fs.existsSync(targetDir)) {
  console.error(`目录已存在: games/${rawSlug}`);
  process.exit(1);
}

fs.mkdirSync(path.join(targetDir, 'src/core'), { recursive: true });
fs.mkdirSync(path.join(targetDir, 'src/web'), { recursive: true });
fs.mkdirSync(path.join(targetDir, 'tests'), { recursive: true });

fs.writeFileSync(
  path.join(targetDir, 'package.json'),
  JSON.stringify(
    {
      name: `@minigame/${rawSlug}`,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'vite build && node ../../packages/build-tools/src/pack-minitool.mjs',
        'pack:platforms': 'pnpm build',
        test: 'vitest run',
      },
      dependencies: {
        '@minigame/platform-sdk': 'workspace:*',
      },
    },
    null,
    2
  ) + '\n'
);

fs.writeFileSync(
  path.join(targetDir, 'tsconfig.json'),
  JSON.stringify({ extends: '../../tsconfig.base.json', include: ['src/**/*.ts', 'tests/**/*.ts'] }, null, 2) + '\n'
);

fs.writeFileSync(
  path.join(targetDir, 'vite.config.ts'),
  `import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
    target: 'es2017',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'MiniGameApp',
        entryFileNames: 'app.js',
        assetFileNames: (assetInfo) => (assetInfo.name?.endsWith('.css') ? 'style.css' : 'assets/[name][extname]'),
      },
    },
  },
});
`
);

fs.writeFileSync(
  path.join(targetDir, 'index.html'),
  `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <title>${title}</title>
  <link rel="stylesheet" href="./src/web/styles.css" />
</head>
<body>
  <main id="app"></main>
  <script type="module" src="./src/web/main.ts"></script>
</body>
</html>
`
);

fs.writeFileSync(
  path.join(targetDir, 'src/core/index.ts'),
  `export function createInitialState() {\n  return { title: '${title}', step: 0 };\n}\n`
);

fs.writeFileSync(
  path.join(targetDir, 'src/web/styles.css'),
  `*, *::before, *::after { box-sizing: border-box; }\nbody { margin: 0; font-family: system-ui, -apple-system, sans-serif; }\n`
);

fs.writeFileSync(
  path.join(targetDir, 'src/web/main.ts'),
  `import { detectPlatform } from '@minigame/platform-sdk';
import { createInitialState } from '../core/index';

const app = document.getElementById('app');
if (app) {
  const st = createInitialState();
  app.textContent = st.title + ' (' + detectPlatform() + ')';
}
`
);

fs.writeFileSync(
  path.join(targetDir, 'tests/core.test.ts'),
  `import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/core/index';

describe('${rawSlug}', () => {
  it('initializes state', () => {
    expect(createInitialState().step).toBe(0);
  });
});
`
);

console.log(`✅ 已创建新小游戏骨架: games/${rawSlug} (${title})`);
console.log(`运行 pnpm install && pnpm --filter @minigame/${rawSlug} dev 即可开始开发。`);
