#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const cwd = process.cwd();
const distDir = path.resolve(cwd, getArg('--dist', './dist'));
const pkgJson = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
const shortName = pkgJson.name.replace(/^@[^/]+\//, '');
const defaultOut = path.resolve(cwd, '../../releases', `${shortName}-xhs.zip`);
const outZip = path.resolve(cwd, getArg('--out', defaultOut));

if (!fs.existsSync(distDir)) {
  console.error(`[pack-xhs] Error: dist directory not found at ${distDir}`);
  process.exit(1);
}

const indexHtmlPath = path.join(distDir, 'index.html');
if (!fs.existsSync(indexHtmlPath)) {
  console.error('[pack-xhs] Error: index.html must exist at dist root');
  process.exit(1);
}

// Normalize index.html for strict offline WebView & CSP compatibility
let html = fs.readFileSync(indexHtmlPath, 'utf8');
html = html
  .replace(/\s+crossorigin(?:="[^"]*")?/gi, '')
  .replace(/<script\s+type="module"\s+src="([^"]+)"><\/script>/gi, '<script defer src="$1"></script>');
fs.writeFileSync(indexHtmlPath, html, 'utf8');

// Audit all generated files for Xiaohongshu Mini-Tool rules
function walkFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

const allFiles = walkFiles(distDir);
const violations = [];

// 1. Check no inline <script> in HTML
const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let match;
while ((match = scriptRegex.exec(html)) !== null) {
  const attrs = match[1] || '';
  const body = (match[2] || '').trim();
  if (!/\bsrc\s*=\s*["'][^"']+["']/i.test(attrs) || body.length > 0) {
    violations.push('index.html contains an inline <script> tag (forbidden by XHS CSP).');
  }
}

// 2. Check no external network URLs in HTML / CSS / JS
for (const file of allFiles) {
  if (!/\.(html|css|js)$/i.test(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  const urlMatches = content.match(/https?:\/\/[^\s"'`)<>]+/gi) || [];
  const disallowed = urlMatches.filter(
    (u) => !/^http:\/\/www\.w3\.org\/(2000\/svg|1999\/xlink)/i.test(u)
  );
  if (disallowed.length > 0) {
    violations.push(
      `${path.relative(distDir, file)} references external URL(s): ${disallowed.slice(0, 3).join(', ')}`
    );
  }
}

if (violations.length > 0) {
  console.error('[pack-xhs] Compliance check failed:');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(outZip), { recursive: true });
if (fs.existsSync(outZip)) fs.unlinkSync(outZip);

execFileSync('zip', ['-r', '-q', outZip, '.'], { cwd: distDir });

const zipStat = fs.statSync(outZip);
const kb = (zipStat.size / 1024).toFixed(1);

console.log('✓ Xiaohongshu Mini-Tool Compliance Passed:');
console.log('  - Entry file: index.html (at zip root)');
console.log('  - Inline scripts: 0');
console.log('  - External network URLs: 0');
console.log(`  - Total files bundled: ${allFiles.length}`);
console.log(`  - Output package: ${outZip} (${kb} KB)`);
