import {
  TactileAudio,
  loadLocalAssetImage,
  readLocalImageFile,
  saveCanvasImage,
  triggerHaptic,
} from '@minigame/xhs-mini-sdk';
import {
  drawEmbossedSeamGrid,
  generateEdgeMatrix,
  slicePhotoIntoPieces,
} from './jigsaw.ts';
import { applyStyleFinish, cropImageToPortrait } from './photoStyles.ts';
import { formatDuration, renderExportPostcard } from './postcardRenderer.ts';
import { MOOD_QUOTES, PRESET_PHOTOS, STYLE_DEFINITIONS } from './presets.ts';
import { mountPuzzleBoard } from './puzzleBoard.ts';
import type {
  EdgeSides,
  ExportLayout,
  PieceCount,
  RenderedPiece,
  ScreenId,
  StyleId,
  TimerMode,
} from './types.ts';

interface AppState {
  screen: ScreenId;
  sourceMode: 'preset' | 'upload';
  selectedPresetId: string;
  uploadedDataUrl: string | null;
  uploadedTitle: string;
  rawPhotoCanvas: HTMLCanvasElement | null;
  styledPhotoCanvas: HTMLCanvasElement | null;
  pieceCount: PieceCount;
  styleId: StyleId;
  timerMode: TimerMode;
  edgeMatrix: EdgeSides[][];
  pieces: RenderedPiece[];
  runCuttingIntro: boolean;
  elapsedSeconds: number;
  steps: number;
  noteText: string;
  exportLayout: ExportLayout;
}

const audio = new TactileAudio();
const appRoot = document.getElementById('app')!;

const state: AppState = {
  screen: 'cover',
  sourceMode: 'preset',
  selectedPresetId: PRESET_PHOTOS[0].id,
  uploadedDataUrl: null,
  uploadedTitle: '我的相册照片',
  rawPhotoCanvas: null,
  styledPhotoCanvas: null,
  pieceCount: 9,
  styleId: 'lustre',
  timerMode: 'none',
  edgeMatrix: [],
  pieces: [],
  runCuttingIntro: true,
  elapsedSeconds: 0,
  steps: 0,
  noteText: '',
  exportLayout: 'showcase',
};

let activeCleanup: (() => void) | null = null;
let toastTimer: number | null = null;

// Toast element
const toastEl = document.createElement('div');
toastEl.className = 'toast-banner';
toastEl.id = 'global-toast';
document.body.appendChild(toastEl);

function showToast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.classList.add('is-visible');
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.classList.remove('is-visible');
  }, 2200);
}

function showImagePreviewModal(dataUrl: string): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <strong style="font-size:15px;">长按图片保存到相册</strong>
      <img src="${dataUrl}" alt="拼图明信片" />
      <button type="button" class="btn-secondary" id="btn-close-save-modal">完成</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelector('#btn-close-save-modal')?.addEventListener('click', close);
}

function getCurrentPreviewSrc(): string {
  if (state.sourceMode === 'upload' && state.uploadedDataUrl) {
    return state.uploadedDataUrl;
  }
  const preset =
    PRESET_PHOTOS.find((p) => p.id === state.selectedPresetId) ?? PRESET_PHOTOS[0];
  return preset.src;
}

function getCurrentPhotoLabel(): string {
  if (state.sourceMode === 'upload' && state.uploadedDataUrl) {
    return state.uploadedTitle;
  }
  const preset =
    PRESET_PHOTOS.find((p) => p.id === state.selectedPresetId) ?? PRESET_PHOTOS[0];
  return `${preset.tag} · ${preset.title}`;
}

async function ensureRawPhotoLoaded(): Promise<HTMLCanvasElement> {
  if (state.rawPhotoCanvas) return state.rawPhotoCanvas;
  const img = await loadLocalAssetImage(getCurrentPreviewSrc());
  state.rawPhotoCanvas = cropImageToPortrait(img);
  return state.rawPhotoCanvas;
}

function rebuildStyledPhoto(): HTMLCanvasElement {
  if (!state.rawPhotoCanvas) {
    throw new Error('Raw photo not loaded');
  }
  state.styledPhotoCanvas = applyStyleFinish(state.rawPhotoCanvas, state.styleId);
  return state.styledPhotoCanvas;
}

function navigateTo(next: ScreenId): void {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }
  state.screen = next;
  document.documentElement.dataset.finish = state.styleId;
  renderScreen();
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
}

function renderSoundButtonHtml(): string {
  const on = audio.isEnabled();
  return `
    <button type="button" class="icon-btn" id="btn-toggle-audio" aria-label="${
      on ? '关闭音效' : '开启音效'
    }">
      ${
        on
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
               <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
               <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
             </svg>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
               <line x1="23" y1="9" x2="17" y2="15"></line>
               <line x1="17" y1="9" x2="23" y2="15"></line>
             </svg>`
      }
      <span>${on ? '音效' : '静音'}</span>
    </button>
  `;
}

function bindSoundToggle(): void {
  const btn = appRoot.querySelector<HTMLButtonElement>('#btn-toggle-audio');
  if (!btn) return;
  btn.addEventListener('click', () => {
    audio.toggle();
    btn.outerHTML = renderSoundButtonHtml();
    bindSoundToggle();
  });
}

function renderScreen(): void {
  switch (state.screen) {
    case 'cover':
      renderCoverScreen();
      break;
    case 'select':
      renderSelectScreen();
      break;
    case 'config':
      void renderConfigScreen();
      break;
    case 'play':
      renderPlayScreen();
      break;
    case 'celebrate':
      renderCelebrateScreen();
      break;
    case 'letter':
      renderLetterScreen();
      break;
    case 'postcard':
      renderPostcardScreen();
      break;
  }
}

/* =========================================================
   5.1 启动页 Cover Screen
   ========================================================= */
function renderCoverScreen(): void {
  const heroPreset = PRESET_PHOTOS[0];
  appRoot.innerHTML = `
    <header class="topbar">
      <div class="topbar-left">
        <span class="topbar-step">HEART PUZZLE · 心动拼图</span>
      </div>
      <div class="topbar-right">
        ${renderSoundButtonHtml()}
      </div>
    </header>

    <main class="screen cover-screen">
      <div class="cover-stage">
        <div class="cover-postcard">
          <div class="cover-photo-wrap">
            <img src="${heroPreset.src}" alt="拼图卡片封面示例" />
            <svg class="cover-seam-svg" viewBox="0 0 300 400" preserveAspectRatio="none">
              <path d="M100,0 L100,52 C118,52 118,82 100,82 L100,185 C82,185 82,215 100,215 L100,318 C118,318 118,348 100,348 L100,400"
                fill="none" stroke="rgba(255,255,255,0.52)" stroke-width="1.6"/>
              <path d="M200,0 L200,52 C182,52 182,82 200,82 L200,185 C218,185 218,215 200,215 L200,318 C182,318 182,348 200,348 L200,400"
                fill="none" stroke="rgba(255,255,255,0.52)" stroke-width="1.6"/>
              <path d="M0,133 L38,133 C38,115 62,115 62,133 L138,133 C138,151 162,151 162,133 L238,133 C238,115 262,115 262,133 L300,133"
                fill="none" stroke="rgba(255,255,255,0.52)" stroke-width="1.6"/>
              <path d="M0,266 L38,266 C38,284 62,284 62,266 L138,266 C138,248 162,248 162,266 L238,266 C238,284 262,284 262,266 L300,266"
                fill="none" stroke="rgba(255,255,255,0.52)" stroke-width="1.6"/>
            </svg>
          </div>
        </div>

        <div class="cover-floating-piece" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="var(--accent-primary)" opacity="0.9">
            <path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z"/>
          </svg>
          <span>咔哒归位</span>
        </div>
      </div>

      <div class="cover-copy">
        <h1 class="cover-title">照片拼图卡</h1>
        <p class="cover-subtitle">把生活切碎，再亲手拼回来</p>
      </div>

      <div class="cover-actions">
        <button type="button" class="btn-primary" id="btn-start-game">
          开始拼图
        </button>
        <p class="privacy-note">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          纯本地运行，照片不会上传
        </p>
      </div>
    </main>
  `;

  bindSoundToggle();
  appRoot.querySelector('#btn-start-game')!.addEventListener('click', () => {
    audio.unlock();
    audio.playTap();
    triggerHaptic('light');
    navigateTo('select');
  });
}

/* =========================================================
   5.2 选图页 Photo Selection Screen
   ========================================================= */
function renderSelectScreen(): void {
  const previewSrc = getCurrentPreviewSrc();
  const label = getCurrentPhotoLabel();

  appRoot.innerHTML = `
    <header class="topbar">
      <div class="topbar-left">
        <button type="button" class="icon-btn" id="btn-back-cover">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          返回
        </button>
      </div>
      <span class="topbar-step">STEP 1 / 3 · 选择照片</span>
      <div class="topbar-right">
        ${renderSoundButtonHtml()}
      </div>
    </header>

    <main class="screen">
      <div class="section-header">
        <h1 class="section-title">选一张心动的照片</h1>
        <p class="section-desc">上传今日生活照，或挑选一张内置精选美学图</p>
      </div>

      <div class="select-preview-frame">
        <div class="select-preview-inner">
          <img id="select-preview-img" src="${previewSrc}" alt="已选照片预览" />
          <span class="select-preview-badge" id="select-preview-badge">${label}</span>
        </div>
      </div>

      <input type="file" accept="image/*" id="file-upload-input" class="hidden-file-input" />

      <div class="dual-entry-bar">
        <button type="button" class="entry-card ${
          state.sourceMode === 'upload' ? 'is-active' : ''
        }" id="btn-upload-entry">
          <span class="entry-card-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
          </span>
          <span class="entry-card-text">
            <strong>上传我的照片</strong>
            <span>本地相册读取</span>
          </span>
        </button>

        <button type="button" class="entry-card ${
          state.sourceMode === 'preset' ? 'is-active' : ''
        }" id="btn-preset-entry">
          <span class="entry-card-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
          </span>
          <span class="entry-card-text">
            <strong>使用精选图</strong>
            <span>${PRESET_PHOTOS.length} 张小红书美学图</span>
          </span>
        </button>
      </div>

      <div class="preset-strip-label">
        <span>精选生活图集（左右滑动）</span>
      </div>
      <div class="preset-carousel" id="preset-carousel">
        ${PRESET_PHOTOS.map(
          (p) => `
          <button type="button" class="preset-item ${
            state.sourceMode === 'preset' && state.selectedPresetId === p.id
              ? 'is-selected'
              : ''
          }" data-preset-id="${p.id}">
            <img class="preset-thumb" src="${p.src}" alt="${p.title}" />
            <span class="preset-name">${p.title}</span>
          </button>
        `
        ).join('')}
      </div>

      <div style="margin-top:auto;">
        <button type="button" class="btn-primary" id="btn-confirm-photo">
          确认这张照片
        </button>
      </div>
    </main>
  `;

  bindSoundToggle();
  appRoot.querySelector('#btn-back-cover')!.addEventListener('click', () => {
    audio.playTap();
    navigateTo('cover');
  });

  const fileInput = appRoot.querySelector<HTMLInputElement>('#file-upload-input')!;
  appRoot.querySelector('#btn-upload-entry')!.addEventListener('click', () => {
    audio.playTap();
    fileInput.click();
  });

  appRoot.querySelector('#btn-preset-entry')!.addEventListener('click', () => {
    audio.playTap();
    state.sourceMode = 'preset';
    state.rawPhotoCanvas = null;
    renderSelectScreen();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const img = await readLocalImageFile(file);
      state.rawPhotoCanvas = cropImageToPortrait(img);
      state.uploadedDataUrl = state.rawPhotoCanvas.toDataURL('image/jpeg', 0.9);
      state.uploadedTitle = '我的生活照';
      state.sourceMode = 'upload';
      audio.playSnap(3, 9);
      showToast('已载入本地照片');
      renderSelectScreen();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '读取照片失败');
    }
  });

  appRoot.querySelectorAll<HTMLButtonElement>('[data-preset-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.presetId!;
      state.selectedPresetId = id;
      state.sourceMode = 'preset';
      state.rawPhotoCanvas = null;
      audio.playTap();
      renderSelectScreen();
    });
  });

  appRoot.querySelector('#btn-confirm-photo')!.addEventListener('click', async () => {
    audio.playTap();
    const confirmBtn = appRoot.querySelector<HTMLButtonElement>('#btn-confirm-photo')!;
    confirmBtn.disabled = true;
    confirmBtn.textContent = '准备相纸中…';
    try {
      await ensureRawPhotoLoaded();
      navigateTo('config');
    } catch {
      confirmBtn.disabled = false;
      confirmBtn.textContent = '确认这张照片';
      showToast('图片加载失败，请重试');
    }
  });
}

/* =========================================================
   5.3 参数设置页 Config Screen
   ========================================================= */
async function renderConfigScreen(): Promise<void> {
  await ensureRawPhotoLoaded();
  const styled = rebuildStyledPhoto();

  const shimmerClass =
    state.styleId === 'lustre'
      ? 'is-lustre'
      : state.styleId === 'holo'
        ? 'is-holo'
        : '';

  appRoot.innerHTML = `
    <header class="topbar">
      <div class="topbar-left">
        <button type="button" class="icon-btn" id="btn-back-select">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          换图
        </button>
      </div>
      <span class="topbar-step">STEP 2 / 3 · 定制拼图</span>
      <div class="topbar-right">
        ${renderSoundButtonHtml()}
      </div>
    </header>

    <main class="screen">
      <div class="config-preview-wrap" id="config-preview-card">
        <div class="config-preview-stage" id="config-preview-stage">
          <div class="shimmer-layer ${shimmerClass}" id="config-shimmer-layer"></div>
        </div>
      </div>

      <div class="config-group">
        <div class="config-label">
          选择拼图块数
          <span>滑动或点击切换</span>
        </div>
        <div class="piece-Selector">
          <button type="button" class="piece-option ${
            state.pieceCount === 9 ? 'is-selected' : ''
          }" data-pieces="9">
            <strong>9 块</strong>
            <small>简单 · 推荐新手</small>
          </button>
          <button type="button" class="piece-option ${
            state.pieceCount === 16 ? 'is-selected' : ''
          }" data-pieces="16">
            <strong>16 块</strong>
            <small>标准 · 舒适</small>
          </button>
          <button type="button" class="piece-option ${
            state.pieceCount === 25 ? 'is-selected' : ''
          }" data-pieces="25">
            <strong>25 块</strong>
            <small>挑战 · 沉浸</small>
          </button>
        </div>
      </div>

      <div class="config-group">
        <div class="config-label">
          完成卡面工艺
          <span>共 5 款质感滤镜</span>
        </div>
        <div class="style-carousel">
          ${STYLE_DEFINITIONS.map(
            (s) => `
            <button type="button" class="style-card ${
              state.styleId === s.id ? 'is-selected' : ''
            }" data-style-id="${s.id}">
              <div class="style-swatch style-swatch-${s.id}"></div>
              <strong>${s.name}</strong>
              <small>${s.tagline}</small>
            </button>
          `
          ).join('')}
        </div>
      </div>

      <div class="config-group" style="display:flex; align-items:center; justify-content:space-between;">
        <span style="font-size:13px; font-weight:700;">计时模式</span>
        <div class="timer-pills">
          <button type="button" class="timer-pill ${
            state.timerMode === 'none' ? 'is-selected' : ''
          }" data-timer="none">不限时解压</button>
          <button type="button" class="timer-pill ${
            state.timerMode === 60 ? 'is-selected' : ''
          }" data-timer="60">60秒</button>
          <button type="button" class="timer-pill ${
            state.timerMode === 90 ? 'is-selected' : ''
          }" data-timer="90">90秒</button>
        </div>
      </div>

      <div style="margin-top:auto;">
        <button type="button" class="btn-primary" id="btn-start-cutting">
          开始切割
        </button>
      </div>
    </main>
  `;

  bindSoundToggle();

  // Mount preview canvas with subtle preview seam lines
  const stageEl = appRoot.querySelector<HTMLElement>('#config-preview-stage')!;
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = 450;
  previewCanvas.height = 600;
  const pctx = previewCanvas.getContext('2d')!;
  pctx.drawImage(styled, 0, 0, 450, 600);
  const gridSize = Math.round(Math.sqrt(state.pieceCount));
  const previewMatrix = generateEdgeMatrix(gridSize);
  drawEmbossedSeamGrid(pctx, 0, 0, 450, 600, previewMatrix, {
    shadowColor: 'rgba(26, 16, 12, 0.18)',
    highlightColor: 'rgba(255, 255, 255, 0.36)',
    lineWidth: 1.3,
  });
  stageEl.prepend(previewCanvas);

  // Interactive shimmer tilt on pointer move
  const shimmerEl = appRoot.querySelector<HTMLElement>('#config-shimmer-layer')!;
  stageEl.addEventListener('pointermove', (e) => {
    const r = stageEl.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * 100;
    const py = ((e.clientY - r.top) / r.height) * 100;
    shimmerEl.style.setProperty('--shimmer-x', `${px.toFixed(1)}%`);
    shimmerEl.style.setProperty('--shimmer-y', `${py.toFixed(1)}%`);
  });

  appRoot.querySelector('#btn-back-select')!.addEventListener('click', () => {
    audio.playTap();
    navigateTo('select');
  });

  appRoot.querySelectorAll<HTMLButtonElement>('[data-pieces]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.pieceCount = Number(btn.dataset.pieces) as PieceCount;
      audio.playTap();
      void renderConfigScreen();
    });
  });

  appRoot.querySelectorAll<HTMLButtonElement>('[data-style-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.styleId = btn.dataset.styleId as StyleId;
      document.documentElement.dataset.finish = state.styleId;
      audio.playTap();
      void renderConfigScreen();
    });
  });

  appRoot.querySelectorAll<HTMLButtonElement>('[data-timer]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.timer!;
      state.timerMode = val === 'none' ? 'none' : (Number(val) as 60 | 90);
      audio.playTap();
      void renderConfigScreen();
    });
  });

  appRoot.querySelector('#btn-start-cutting')!.addEventListener('click', () => {
    audio.unlock();
    audio.playTap();
    // Prepare puzzle matrix & 3D beveled pieces, then enter unified cutting + collector-box stage
    const n = Math.round(Math.sqrt(state.pieceCount));
    const seed = Math.floor(Math.random() * 900000) + 100000;
    state.edgeMatrix = generateEdgeMatrix(n, seed);
    const styledCanvas = rebuildStyledPhoto();
    state.pieces = slicePhotoIntoPieces(styledCanvas, state.pieceCount, state.edgeMatrix);
    state.runCuttingIntro = true;
    navigateTo('play');
  });
}

/* =========================================================
   5.4 & 5.5 切割 + 掉落收集盒 + 原地拼图一体化页 Unified Play Screen
   ========================================================= */
function renderPlayScreen(): void {
  appRoot.innerHTML = `
    <header class="topbar">
      <div class="topbar-left">
        <button type="button" class="icon-btn" id="btn-play-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          返回
        </button>
      </div>
      <div class="topbar-right">
        <button type="button" class="icon-btn" id="btn-play-restart">
          重切重开
        </button>
        ${renderSoundButtonHtml()}
      </div>
    </header>

    <main class="screen play-screen" id="play-mount-container"></main>
  `;

  bindSoundToggle();
  appRoot.querySelector('#btn-play-back')!.addEventListener('click', () => {
    audio.playTap();
    navigateTo('config');
  });

  appRoot.querySelector('#btn-play-restart')!.addEventListener('click', () => {
    audio.playTap();
    if (activeCleanup) {
      activeCleanup();
      activeCleanup = null;
    }
    state.runCuttingIntro = true;
    renderPlayScreen();
  });

  const mountEl = appRoot.querySelector<HTMLElement>('#play-mount-container')!;
  const shouldCut = state.runCuttingIntro;
  state.runCuttingIntro = false;

  activeCleanup = mountPuzzleBoard({
    container: mountEl,
    rawPhoto: state.rawPhotoCanvas!,
    styledPhoto: state.styledPhotoCanvas!,
    edgeMatrix: state.edgeMatrix,
    pieces: state.pieces,
    pieceCount: state.pieceCount,
    timerMode: state.timerMode,
    runCuttingIntro: shouldCut,
    audio,
    onSolved: ({ elapsedSeconds, steps }) => {
      state.elapsedSeconds = elapsedSeconds;
      state.steps = steps;
      navigateTo('celebrate');
    },
  });
}

/* =========================================================
   5.6 完成庆祝页 Celebration Screen
   ========================================================= */
function renderCelebrateScreen(): void {
  audio.playCelebrate();
  triggerHaptic('heavy');

  const styleDef =
    STYLE_DEFINITIONS.find((s) => s.id === state.styleId) ?? STYLE_DEFINITIONS[0];

  appRoot.innerHTML = `
    <header class="topbar">
      <div class="topbar-left">
        <span class="topbar-step">COMPLETED · 拼图归位</span>
      </div>
      <div class="topbar-right">
        ${renderSoundButtonHtml()}
      </div>
    </header>

    <main class="screen celebrate-screen">
      <div>
        <h1 class="cover-title" style="font-size:28px;">拼好啦！</h1>
        <div class="celebrate-badge-row">
          <span class="stat-pill">用时 ${formatDuration(state.elapsedSeconds)}</span>
          <span class="stat-pill">${state.steps} 步完成</span>
          <span class="stat-pill">${state.pieceCount} 块 · ${styleDef.name}</span>
        </div>
      </div>

      <div class="celebrate-card-wrap">
        <div class="celebrate-card-inner" id="celebrate-photo-box">
          <div class="celebrate-gleam"></div>
        </div>
      </div>

      <div class="celebrate-actions">
        <button type="button" class="btn-primary" id="btn-go-letter">
          写一句话（背面寄语）
        </button>
        <button type="button" class="btn-secondary" id="btn-skip-to-card">
          直接生成卡片
        </button>
      </div>
    </main>
  `;

  bindSoundToggle();

  const photoBox = appRoot.querySelector<HTMLElement>('#celebrate-photo-box')!;
  const c = document.createElement('canvas');
  c.width = 540;
  c.height = 720;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(state.styledPhotoCanvas!, 0, 0, 540, 720);
  drawEmbossedSeamGrid(ctx, 0, 0, 540, 720, state.edgeMatrix, {
    shadowColor: 'rgba(26, 16, 12, 0.22)',
    highlightColor: 'rgba(255, 255, 255, 0.44)',
    lineWidth: 1.5,
  });
  photoBox.prepend(c);

  appRoot.querySelector('#btn-go-letter')!.addEventListener('click', () => {
    audio.playFlip();
    navigateTo('letter');
  });

  appRoot.querySelector('#btn-skip-to-card')!.addEventListener('click', () => {
    audio.playTap();
    if (!state.noteText.trim() && state.sourceMode === 'preset') {
      const p = PRESET_PHOTOS.find((item) => item.id === state.selectedPresetId);
      if (p) state.noteText = p.defaultNote;
    }
    navigateTo('postcard');
  });
}

/* =========================================================
   5.7 背面写信页 Letter Screen (3D Flip)
   ========================================================= */
function renderLetterScreen(): void {
  const defaultPlaceholder = '写给今天的自己 / 写给这张照片…';

  appRoot.innerHTML = `
    <header class="topbar">
      <div class="topbar-left">
        <button type="button" class="icon-btn" id="btn-back-celebrate">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          返回
        </button>
      </div>
      <span class="topbar-step">明信片背面寄语</span>
      <div class="topbar-right">
        ${renderSoundButtonHtml()}
      </div>
    </header>

    <main class="screen">
      <div class="flip-scene">
        <div class="flip-card" id="letter-flip-card">
          <div class="flip-face flip-face-front" id="letter-front-face"></div>
          <div class="flip-face flip-face-back">
            <div class="postcard-back-top">
              <div class="postcard-postmark">
                HEART PUZZLE<br/>${state.pieceCount} PIECES
              </div>
              <div class="postcard-stamp">
                <span>心动</span>
                <span>拼图</span>
              </div>
            </div>

            <div class="letter-textarea-wrap">
              <textarea
                id="letter-input"
                class="letter-textarea"
                rows="3"
                maxlength="30"
                placeholder="${defaultPlaceholder}"
              >${state.noteText}</textarea>
              <div class="letter-counter"><span id="letter-count">${
                Array.from(state.noteText).length
              }</span> / 30</div>
            </div>

            <div style="font-size:11px; color:var(--ink-muted); text-align:center;">
              亲手拼回于今日 · 用时 ${formatDuration(state.elapsedSeconds)}
            </div>
          </div>
        </div>
      </div>

      <div class="preset-strip-label">
        <span>灵感短句（点击填入，可修改）</span>
      </div>
      <div class="mood-chips">
        ${MOOD_QUOTES.map(
          (q) => `<button type="button" class="mood-chip" data-quote="${q}">${q}</button>`
        ).join('')}
      </div>

      <div style="margin-top:auto; display:flex; flex-direction:column; gap:8px;">
        <button type="button" class="btn-primary" id="btn-finish-letter">
          生成拼图明信片
        </button>
        <button type="button" class="btn-ghost" id="btn-skip-letter">
          跳过寄语，直接生成
        </button>
      </div>
    </main>
  `;

  bindSoundToggle();

  // Front face thumbnail for realistic 3D flip entrance
  const frontFace = appRoot.querySelector<HTMLElement>('#letter-front-face')!;
  const fc = document.createElement('canvas');
  fc.width = 450;
  fc.height = 600;
  fc.style.width = '100%';
  fc.style.height = '100%';
  fc.getContext('2d')!.drawImage(state.styledPhotoCanvas!, 0, 0, 450, 600);
  frontFace.appendChild(fc);

  const flipCard = appRoot.querySelector<HTMLElement>('#letter-flip-card')!;
  const inputEl = appRoot.querySelector<HTMLTextAreaElement>('#letter-input')!;
  const countEl = appRoot.querySelector<HTMLElement>('#letter-count')!;

  // Trigger smooth 3D flip to back on mount
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      flipCard.classList.add('is-flipped');
    });
  });

  const updateNote = (val: string) => {
    const trimmed = Array.from(val).slice(0, 30).join('');
    if (inputEl.value !== trimmed) inputEl.value = trimmed;
    state.noteText = trimmed;
    countEl.textContent = String(Array.from(trimmed).length);
  };

  inputEl.addEventListener('input', () => updateNote(inputEl.value));

  appRoot.querySelectorAll<HTMLButtonElement>('[data-quote]').forEach((chip) => {
    chip.addEventListener('click', () => {
      audio.playTap();
      updateNote(chip.dataset.quote!);
    });
  });

  appRoot.querySelector('#btn-back-celebrate')!.addEventListener('click', () => {
    audio.playTap();
    navigateTo('celebrate');
  });

  appRoot.querySelector('#btn-finish-letter')!.addEventListener('click', () => {
    audio.playTap();
    navigateTo('postcard');
  });

  appRoot.querySelector('#btn-skip-letter')!.addEventListener('click', () => {
    audio.playTap();
    state.noteText = '';
    navigateTo('postcard');
  });
}

/* =========================================================
   5.8 最终卡片页 Final Postcard & Share Screen
   ========================================================= */
function renderPostcardScreen(): void {
  const shareCopy = `把今天的照片切成 ${state.pieceCount} 块拼图，用 ${formatDuration(
    state.elapsedSeconds
  )} 亲手拼回来了 ✨ #心动拼图 #照片拼图卡 #解压小游戏`;

  appRoot.innerHTML = `
    <header class="topbar">
      <div class="topbar-left">
        <button type="button" class="icon-btn" id="btn-edit-letter">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          改写寄语
        </button>
      </div>
      <span class="topbar-step">3:4 笔记封面卡片</span>
      <div class="topbar-right">
        ${renderSoundButtonHtml()}
      </div>
    </header>

    <main class="screen">
      <div style="text-align:center;">
        <div class="export-tabs">
          <button type="button" class="export-tab ${
            state.exportLayout === 'showcase' ? 'is-active' : ''
          }" data-layout="showcase">双面晒图版</button>
          <button type="button" class="export-tab ${
            state.exportLayout === 'front' ? 'is-active' : ''
          }" data-layout="front">正面明信片</button>
          <button type="button" class="export-tab ${
            state.exportLayout === 'back' ? 'is-active' : ''
          }" data-layout="back">背面信笺</button>
        </div>
      </div>

      <div class="final-card-showcase" id="final-card-mount"></div>

      <div class="xhs-copy-box">
        <span class="xhs-copy-text" id="xhs-caption-text">${shareCopy}</span>
        <button type="button" class="copy-mini-btn" id="btn-copy-caption">复制发笔记文案</button>
      </div>

      <div style="margin-top:auto;">
        <button type="button" class="btn-primary" id="btn-save-postcard">
          保存拼图卡片
        </button>
        <div class="final-actions-row">
          <button type="button" class="btn-secondary" id="btn-play-another">
            再拼一张
          </button>
          <button type="button" class="btn-secondary" id="btn-return-home">
            返回首页
          </button>
        </div>
      </div>
    </main>
  `;

  bindSoundToggle();

  const finalMount = appRoot.querySelector<HTMLElement>('#final-card-mount')!;
  const exportCanvas = renderExportPostcard({
    styledPhoto: state.styledPhotoCanvas!,
    edgeMatrix: state.edgeMatrix,
    pieceCount: state.pieceCount,
    styleId: state.styleId,
    elapsedSeconds: state.elapsedSeconds,
    steps: state.steps,
    noteText: state.noteText,
    layout: state.exportLayout,
  });
  finalMount.appendChild(exportCanvas);

  appRoot.querySelectorAll<HTMLButtonElement>('[data-layout]').forEach((tab) => {
    tab.addEventListener('click', () => {
      state.exportLayout = tab.dataset.layout as ExportLayout;
      audio.playFlip();
      renderPostcardScreen();
    });
  });

  appRoot.querySelector('#btn-copy-caption')!.addEventListener('click', async () => {
    audio.playTap();
    try {
      await navigator.clipboard.writeText(shareCopy);
      showToast('已复制小红书笔记文案');
    } catch {
      showToast('文案已准备，截图即可发笔记');
    }
  });

  appRoot.querySelector('#btn-save-postcard')!.addEventListener('click', async () => {
    audio.playSnap(state.pieceCount, state.pieceCount);
    triggerHaptic('medium');
    const filename = `puzzle-card-${state.styleId}-${Date.now()}.png`;
    const res = await saveCanvasImage(exportCanvas, filename);
    if (res.method === 'xhs-bridge') {
      showToast('已保存到手机相册');
    } else if (res.method === 'preview-modal') {
      showImagePreviewModal(exportCanvas.toDataURL('image/png'));
    } else {
      showToast('高清拼图明信片已开始下载');
    }
  });

  appRoot.querySelector('#btn-edit-letter')!.addEventListener('click', () => {
    audio.playFlip();
    navigateTo('letter');
  });

  appRoot.querySelector('#btn-play-another')!.addEventListener('click', () => {
    audio.playTap();
    state.noteText = '';
    navigateTo('select');
  });

  appRoot.querySelector('#btn-return-home')!.addEventListener('click', () => {
    audio.playTap();
    state.noteText = '';
    navigateTo('cover');
  });
}

// Initial boot
document.documentElement.dataset.finish = state.styleId;
renderScreen();
