#!/usr/bin/env node
/**
 * 将共享核心玩法引擎 (src/core/index.ts) 编译为 CommonJS 模块并连同微信小程序原生页面输出至 dist/weapp
 * 产物可直接通过「微信开发者工具 -> 导入项目 -> 选择 dist/weapp」运行与上传发布
 */

import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';

const gameDir = process.cwd();
const srcWeapp = path.resolve(gameDir, 'src/weapp');
const outWeapp = path.resolve(gameDir, 'dist/weapp');

if (fs.existsSync(outWeapp)) {
  fs.rmSync(outWeapp, { recursive: true, force: true });
}
fs.cpSync(srcWeapp, outWeapp, { recursive: true });

await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    outDir: path.join(outWeapp, 'pages/index'),
    emptyOutDir: false,
    target: 'es2017',
    lib: {
      entry: path.resolve(gameDir, 'src/core/index.ts'),
      formats: ['cjs'],
      fileName: () => 'core-bundle.js',
    },
  },
});

console.log('[build-weapp] ✅ 微信小程序工程已生成: dist/weapp (可直接导入微信开发者工具)');
