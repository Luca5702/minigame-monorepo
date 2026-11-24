#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const outDir = path.join(rootDir, '_site');
const gamesRoot = path.join(rootDir, 'games');

/**
 * 精选展厅卡片元数据（未来通过 `pnpm new-game` 新增的目录也会被自动扫描收录）
 */
const CURATED_META = {
  'one-rope-two-baskets': {
    title: '一绳两筐',
    subtitle: '对向配重与中途卸货 · 绘本木构物理谜题',
    desc: '三层木楼、两筐共一绳始终对向，下行侧够重才能拉起对侧。把握 2 楼交汇卸货与换筐配平的时机，10 道精算关卡零文字直觉上手。',
    tags: ['物理配重解谜', '10 关数学验证', '小红书 / Bilibili / 微信'],
    accent: '#8a5629',
    badgeBg: '#fcebd1',
    badgeColor: '#8c4b0e',
    iconSvg: `<svg viewBox="0 0 64 64" width="52" height="52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="6" width="52" height="9" rx="3" fill="#b87a3d" stroke="#382110" stroke-width="2.4"/>
      <circle cx="19" cy="15" r="5" fill="#e5b54f" stroke="#382110" stroke-width="2.2"/>
      <circle cx="45" cy="15" r="5" fill="#e5b54f" stroke="#382110" stroke-width="2.2"/>
      <line x1="19" y1="20" x2="19" y2="39" stroke="#8c5928" stroke-width="2.6"/>
      <line x1="45" y1="20" x2="45" y2="27" stroke="#8c5928" stroke-width="2.6"/>
      <rect x="10" y="39" width="18" height="18" rx="3" fill="#5c9e98" stroke="#382110" stroke-width="2.3"/>
      <rect x="36" y="27" width="18" height="18" rx="3" fill="#d87a58" stroke="#382110" stroke-width="2.3"/>
      <rect x="14" y="45" width="10" height="8" rx="2.5" fill="#e8cd9a" stroke="#382110" stroke-width="1.8"/>
      <rect x="40" y="33" width="10" height="8" rx="2.5" fill="#e8cd9a" stroke="#382110" stroke-width="1.8"/>
    </svg>`,
  },
  'puzzle-card': {
    title: '照片拼图卡 · 心动拼图',
    subtitle: '刀片切割 · 重力落盘 · 双面明信片工坊',
    desc: '任选内置美学预设或本地照片，叠加 5 款胶片/全息质感滤镜，亲手拉线切割拼图块并在亚麻文具盘内磁吸拼合，支持导出高清双面明信片。',
    tags: ['创意手作拼图', '本地照片滤镜', '小红书小工具'],
    accent: '#c95c76',
    badgeBg: '#fde8ee',
    badgeColor: '#9e3550',
    iconSvg: `<svg viewBox="0 0 64 64" width="52" height="52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="8" width="44" height="48" rx="7" fill="#fff7f9" stroke="#42252d" stroke-width="2.4"/>
      <rect x="15" y="13" width="34" height="29" rx="4" fill="#f7cad6" stroke="#42252d" stroke-width="2"/>
      <path d="M32 13 V42 M15 27.5 H49" stroke="#42252d" stroke-width="2" stroke-dasharray="3 2"/>
      <circle cx="32" cy="21" r="3" fill="#fff7f9" stroke="#42252d" stroke-width="1.8"/>
      <circle cx="24" cy="27.5" r="3" fill="#f7cad6" stroke="#42252d" stroke-width="1.8"/>
      <rect x="18" y="47" width="20" height="3.5" rx="1.75" fill="#c95c76"/>
    </svg>`,
  },
};

function resolveGameDistDir(gameDir) {
  const distWeb = path.join(gameDir, 'dist/web');
  if (fs.existsSync(path.join(distWeb, 'index.html'))) {
    return distWeb;
  }
  const distPlain = path.join(gameDir, 'dist');
  if (fs.existsSync(path.join(distPlain, 'index.html'))) {
    return distPlain;
  }
  return null;
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const entries = fs
  .readdirSync(gamesRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort((a, b) => {
    const order = ['one-rope-two-baskets', 'puzzle-card'];
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

const deployedGames = [];

for (const slug of entries) {
  const gameDir = path.join(gamesRoot, slug);
  const distDir = resolveGameDistDir(gameDir);
  if (!distDir) {
    console.error(`[build-pages] Missing web build output for games/${slug}. Run \`pnpm build\` first.`);
    process.exit(1);
  }

  const pkgPath = path.join(gameDir, 'package.json');
  const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : {};
  const targetSubDir = path.join(outDir, slug);
  fs.cpSync(distDir, targetSubDir, { recursive: true });

  const meta = CURATED_META[slug] || {
    title: slug,
    subtitle: pkg.description || '离线单机互动小游戏',
    desc: pkg.description || '纯前端离线单机小游戏，即点即玩。',
    tags: ['离线单机', 'H5 小游戏'],
    accent: '#5c6b73',
    badgeBg: '#e9eff2',
    badgeColor: '#334650',
    iconSvg: `<svg viewBox="0 0 64 64" width="52" height="52" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="14" width="44" height="36" rx="8" fill="#eef2f5" stroke="#2c3a42" stroke-width="2.4"/><circle cx="24" cy="32" r="5" fill="#5c6b73"/><circle cx="41" cy="29" r="3" fill="#5c6b73"/><circle cx="37" cy="36" r="3" fill="#5c6b73"/></svg>`,
  };

  deployedGames.push({ slug, ...meta });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const cardsHtml = deployedGames
  .map(
    (g) => `
      <a class="game-card" href="./${encodeURIComponent(g.slug)}/" style="--card-accent: ${g.accent};">
        <div class="card-top">
          <div class="card-icon">${g.iconSvg}</div>
          <div class="card-headings">
            <h2 class="card-title">${escapeHtml(g.title)}</h2>
            <p class="card-subtitle">${escapeHtml(g.subtitle)}</p>
          </div>
        </div>
        <p class="card-desc">${escapeHtml(g.desc)}</p>
        <div class="card-footer">
          <div class="tag-list">
            ${g.tags
              .map(
                (t) =>
                  `<span class="tag-pill" style="background:${g.badgeBg};color:${g.badgeColor};">${escapeHtml(t)}</span>`
              )
              .join('')}
          </div>
          <span class="play-cta">开始试玩 →</span>
        </div>
      </a>`
  )
  .join('\n');

const hubHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Minigame Arcade · 离线单机小游戏合集</title>
  <style>
    :root {
      --bg-top: #faf5eb;
      --bg-bot: #efe4d0;
      --ink: #2f1d10;
      --ink-soft: #664a34;
      --card-bg: #fffdf8;
      --border: #382110;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: radial-gradient(circle at 50% 0%, var(--bg-top) 0%, var(--bg-bot) 100%);
      color: var(--ink);
      font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, -apple-system, sans-serif;
      -webkit-font-smoothing: antialiased;
      padding: 36px 18px 56px;
    }
    .container {
      max-width: 780px;
      margin: 0 auto;
    }
    .hero {
      text-align: center;
      margin-bottom: 30px;
    }
    .eyebrow {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 999px;
      background: #e9d9be;
      border: 1.5px solid var(--border);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.04em;
      margin-bottom: 10px;
    }
    .hero h1 {
      margin: 0 0 8px;
      font-size: clamp(24px, 5vw, 32px);
      font-weight: 900;
      letter-spacing: -0.01em;
    }
    .hero p {
      margin: 0 auto;
      max-width: 520px;
      font-size: 14px;
      line-height: 1.6;
      color: var(--ink-soft);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(310px, 1fr));
      gap: 18px;
    }
    .game-card {
      display: flex;
      flex-direction: column;
      text-decoration: none;
      color: inherit;
      background: var(--card-bg);
      border: 2.5px solid var(--border);
      border-radius: 18px;
      padding: 20px;
      box-shadow: 0 6px 0 var(--border), 0 12px 24px rgba(42, 22, 6, 0.08);
      transition: transform 0.14s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.14s ease;
    }
    .game-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 9px 0 var(--border), 0 16px 30px rgba(42, 22, 6, 0.13);
    }
    .game-card:active {
      transform: translateY(2px);
      box-shadow: 0 3px 0 var(--border);
    }
    .card-top {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 12px;
    }
    .card-icon {
      width: 60px;
      height: 60px;
      border-radius: 14px;
      background: #f6efe2;
      border: 2px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .card-title {
      margin: 0 0 3px;
      font-size: 19px;
      font-weight: 900;
    }
    .card-subtitle {
      margin: 0;
      font-size: 12.5px;
      font-weight: 700;
      color: var(--ink-soft);
    }
    .card-desc {
      margin: 0 0 16px;
      font-size: 13.5px;
      line-height: 1.6;
      color: var(--ink-soft);
      flex: 1;
    }
    .card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      padding-top: 12px;
      border-top: 1.5px dashed rgba(56, 33, 16, 0.16);
    }
    .tag-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .tag-pill {
      font-size: 11px;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 6px;
    }
    .play-cta {
      font-size: 13px;
      font-weight: 900;
      color: #fffdf8;
      background: var(--card-accent, #8a5629);
      border: 2px solid var(--border);
      padding: 6px 13px;
      border-radius: 10px;
      box-shadow: 0 2.5px 0 var(--border);
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <main class="container">
    <header class="hero">
      <span class="eyebrow">MINIGAME MONOREPO · OFFLINE FIRST</span>
      <h1>单机轻量小游戏合集</h1>
      <p>纯前端零联网依赖构建，支持网页即点即玩，并同步适配小红书小工具、Bilibili Toy 与微信小程序。</p>
    </header>
    <section class="grid">
      ${cardsHtml}
    </section>
  </main>
</body>
</html>
`;

fs.writeFileSync(path.join(outDir, 'index.html'), hubHtml, 'utf8');
fs.writeFileSync(path.join(outDir, '.nojekyll'), '', 'utf8');

console.log(`✓ Assembled GitHub Pages artifact at ${outDir}`);
console.log('  - /                       -> Minigame Arcade Hub');
for (const g of deployedGames) {
  console.log(`  - /${g.slug}/ -> ${g.title}`);
}
