#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const outDir = path.join(rootDir, '_site');
const puzzleDist = path.join(rootDir, 'games/puzzle-card/dist');

if (!fs.existsSync(puzzleDist)) {
  console.error('[build-pages] Missing games/puzzle-card/dist. Run `pnpm build` first.');
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// Copy puzzle-card as both the default root experience and /puzzle-card/ sub-path
fs.cpSync(puzzleDist, outDir, { recursive: true });
fs.cpSync(puzzleDist, path.join(outDir, 'puzzle-card'), { recursive: true });

// Prevent Jekyll processing on GitHub Pages
fs.writeFileSync(path.join(outDir, '.nojekyll'), '', 'utf8');

console.log(`✓ Assembled GitHub Pages artifact at ${outDir}`);
console.log('  - /               -> @minigame/puzzle-card');
console.log('  - /puzzle-card/   -> @minigame/puzzle-card');
