#!/usr/bin/env node
/**
 * 打包并校验小红书小工具 (xhs-minitool.zip) 与 Bilibili Toy (bilibili-toy.zip) 产物
 * 校验项遵循小红书小工具容器能力清单 §2.2 / §2.6 与 Bilibili Toy 离线静态包规范：
 * 1. 仅包含白名单扩展名，且根目录有且仅有一个 index.html
 * 2. 严禁内联 <script> 代码块、严禁行内 on*= 事件属性
 * 3. 严禁外部 http(s):// 资源引用、eval()、new Function()
 * 4. 转换 Vite 生成的 module script 标签为经典 <script defer src="./app.js">，兼容 Chrome 61+ WebView
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ALLOWED_EXTS = new Set([
  '.html',
  '.css',
  '.js',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.woff',
  '.woff2',
  '.json',
]);

function walkFiles(dir, baseDir = dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, baseDir, acc);
    } else {
      acc.push(path.relative(baseDir, full));
    }
  }
  return acc;
}

function normalizeHtmlForClassicScript(htmlPath) {
  let html = fs.readFileSync(htmlPath, 'utf8');
  // Convert <script type="module" crossorigin src="./app.js"></script> -> <script defer src="./app.js"></script>
  html = html.replace(
    /<script\b[^>]*\bsrc=(["'])([^"']+)\1[^>]*>\s*<\/script>/gi,
    '<script defer src="$2"></script>'
  );
  // Strip crossorigin attributes on <link rel="stylesheet" ...> for sandboxed WebViews
  html = html.replace(/(<link\b[^>]*?)\s+crossorigin(?:=(["'])[^"']*\2)?/gi, '$1');
  fs.writeFileSync(htmlPath, html, 'utf8');
}

function auditWebBundle(webDir) {
  const errors = [];
  const relFiles = walkFiles(webDir);

  const htmlFiles = relFiles.filter((f) => path.extname(f).toLowerCase() === '.html');
  if (htmlFiles.length !== 1 || htmlFiles[0] !== 'index.html') {
    errors.push(`包内必须有且仅有一个入口 index.html，当前检测到: ${htmlFiles.join(', ') || '无'}`);
  }

  for (const rel of relFiles) {
    const ext = path.extname(rel).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      errors.push(`不允许的文件类型: ${rel}`);
    }
  }

  const indexHtmlPath = path.join(webDir, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    const html = fs.readFileSync(indexHtmlPath, 'utf8');
    const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    for (const m of scriptTags) {
      const attrs = m[1] || '';
      const body = (m[2] || '').trim();
      if (!/\bsrc\s*=/.test(attrs) || body.length > 0) {
        errors.push('index.html 存在内联 <script>，小红书小工具容器禁止内联脚本');
      }
      if (/\btype\s*=\s*["']module["']/i.test(attrs)) {
        errors.push('index.html 仍包含 type="module"，须转为经典外置脚本兼容 Chrome 61');
      }
    }
    if (/\son[a-z]+\s*=\s*["']/i.test(html)) {
      errors.push('index.html 存在行内事件处理器 (如 onclick=)，违反容器 CSP 规范');
    }
    if (/https?:\/\//i.test(html)) {
      errors.push('index.html 包含外部网络地址 (http/https)，离线包禁止访问外网资源');
    }
  }

  for (const rel of relFiles) {
    if (rel.endsWith('.js') || rel.endsWith('.css')) {
      const content = fs.readFileSync(path.join(webDir, rel), 'utf8');
      // Ignore standard SVG namespace URI http://www.w3.org/2000/svg
      const stripped = content
        .replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '')
        .replace(/http:\/\/www\.w3\.org\/1999\/xlink/g, '');
      if (/https?:\/\//i.test(stripped)) {
        errors.push(`${rel} 包含外部 http(s):// 链接，违反纯离线规范`);
      }
      if (rel.endsWith('.js') && /\beval\s*\(|new\s+Function\s*\(/.test(content)) {
        errors.push(`${rel} 包含 eval() 或 new Function()，违反沙箱 CSP 规范`);
      }
    }
  }

  return { ok: errors.length === 0, errors, files: relFiles };
}

const gameDir = process.cwd();
const webDir = path.resolve(gameDir, 'dist/web');
if (!fs.existsSync(webDir)) {
  console.error(`[pack-minitool] 未找到构建目录: ${webDir}，请先执行 vite build`);
  process.exit(1);
}

const indexHtmlPath = path.join(webDir, 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  normalizeHtmlForClassicScript(indexHtmlPath);
}

const audit = auditWebBundle(webDir);
if (!audit.ok) {
  console.error('[pack-minitool] ❌ 平台沙箱合规校验未通过：');
  for (const err of audit.errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

const xhsZip = path.resolve(gameDir, 'dist/xhs-minitool.zip');
const biliZip = path.resolve(gameDir, 'dist/bilibili-toy.zip');
for (const z of [xhsZip, biliZip]) {
  if (fs.existsSync(z)) fs.unlinkSync(z);
}

execFileSync('zip', ['-r', '-q', xhsZip, '.'], { cwd: webDir });
fs.copyFileSync(xhsZip, biliZip);

const sizeKb = (fs.statSync(xhsZip).size / 1024).toFixed(1);
console.log(`[pack-minitool] ✅ 合规校验通过 (${audit.files.length} 个文件, ${sizeKb} KB)`);
console.log(`  📦 小红书小工具上传包: ${path.relative(gameDir, xhsZip)}`);
console.log(`  📦 Bilibili Toy 上传包: ${path.relative(gameDir, biliZip)}`);
