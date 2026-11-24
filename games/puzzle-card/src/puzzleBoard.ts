import { triggerHaptic, type TactileAudio } from '@minigame/xhs-mini-sdk';
import { appendJigsawEdge, drawEmbossedSeamGrid } from './jigsaw.ts';
import { formatDuration } from './postcardRenderer.ts';
import type { EdgeSides, PieceCount, RenderedPiece, TimerMode } from './types.ts';

export interface PuzzleGameResult {
  elapsedSeconds: number;
  steps: number;
}

export interface PuzzleBoardMountOptions {
  container: HTMLElement;
  rawPhoto: HTMLCanvasElement;
  styledPhoto: HTMLCanvasElement;
  edgeMatrix: EdgeSides[][];
  pieces: RenderedPiece[];
  pieceCount: PieceCount;
  timerMode: TimerMode;
  runCuttingIntro: boolean;
  audio: TactileAudio;
  onSolved: (result: PuzzleGameResult) => void;
}

type PieceLocation =
  | {
      kind: 'box';
      u: number;
      v: number;
      rot: number;
    }
  | {
      kind: 'board';
      slot: number;
      locked: boolean;
      justSnapped?: boolean;
    };

interface StageMetrics {
  arenaW: number;
  arenaH: number;
  boardLeft: number;
  boardTop: number;
  boardW: number;
  boardH: number;
  cellW: number;
  cellH: number;
  boxLeft: number;
  boxTop: number;
  boxW: number;
  boxH: number;
  boxRestScale: number;
}

interface IntroBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  omega: number;
  scale: number;
  popDx: number;
  popDy: number;
  popRot: number;
  releaseDelayMs: number;
  released: boolean;
  settled: boolean;
  floorY: number;
  bounceCount: number;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function mountPuzzleBoard(opts: PuzzleBoardMountOptions): () => void {
  const {
    container,
    rawPhoto,
    styledPhoto,
    edgeMatrix,
    pieces,
    pieceCount,
    timerMode,
    runCuttingIntro,
    audio,
    onSolved,
  } = opts;

  const gridSize = Math.round(Math.sqrt(pieceCount));
  const total = pieces.length;

  let phase: 'intro' | 'playing' = runCuttingIntro ? 'intro' : 'playing';
  let selectedPieceId: number | null = null;
  let steps = 0;
  let elapsedSeconds = 0;
  let solved = false;
  let timerPausedByTimeout = false;
  let peekTimeout: number | null = null;
  let topZ = 10;

  // Build Unified Stage DOM: HUD + Upper Board + Lower Collector Box + Shared Pieces Layer
  container.innerHTML = `
    <div class="play-hud" id="unified-hud"></div>

    <div class="stage-arena" id="stage-arena">
      <div class="board-frame">
        <div class="board-stage" id="puzzle-board-stage">
          <canvas class="board-guide-canvas" id="board-guide-canvas"></canvas>
          <div class="board-cells-layer" id="board-cells-layer" style="grid-template-columns: repeat(${gridSize}, 1fr); grid-template-rows: repeat(${gridSize}, 1fr);"></div>
          <canvas class="board-cutting-canvas" id="board-cutting-canvas"></canvas>
          <div class="board-peek-overlay" id="board-peek-overlay"></div>
        </div>
      </div>

      <div class="collector-box" id="collector-box">
        <div class="collector-box-header">
          <span id="collector-box-title">拼图收集盒 · 直接拖出或点选</span>
          <button type="button" class="collector-shuffle-btn" id="btn-shuffle-box">
            摇一摇整理
          </button>
        </div>
        <div class="collector-empty-watermark" id="collector-empty-msg" style="display:none;">
          收集盒中的碎片已全部移至上方拼板
        </div>
      </div>

      <div class="stage-pieces-layer" id="stage-pieces-layer"></div>
    </div>
  `;

  const hudEl = container.querySelector<HTMLElement>('#unified-hud')!;
  const arenaEl = container.querySelector<HTMLElement>('#stage-arena')!;
  const boardStage = container.querySelector<HTMLElement>('#puzzle-board-stage')!;
  const guideCanvas = container.querySelector<HTMLCanvasElement>('#board-guide-canvas')!;
  const cuttingCanvas = container.querySelector<HTMLCanvasElement>('#board-cutting-canvas')!;
  const cellsLayer = container.querySelector<HTMLElement>('#board-cells-layer')!;
  const peekOverlay = container.querySelector<HTMLElement>('#board-peek-overlay')!;
  const collectorBox = container.querySelector<HTMLElement>('#collector-box')!;
  const collectorTitle = container.querySelector<HTMLElement>('#collector-box-title')!;
  const collectorEmptyMsg = container.querySelector<HTMLElement>('#collector-empty-msg')!;
  const shuffleBtn = container.querySelector<HTMLButtonElement>('#btn-shuffle-box')!;
  const piecesLayer = container.querySelector<HTMLElement>('#stage-pieces-layer')!;

  // Render guide silhouette & embossed jigsaw outlines
  {
    guideCanvas.width = 540;
    guideCanvas.height = 720;
    const gctx = guideCanvas.getContext('2d')!;
    gctx.fillStyle = '#EAE3D9';
    gctx.fillRect(0, 0, 540, 720);
    gctx.save();
    gctx.globalAlpha = 0.22;
    gctx.drawImage(styledPhoto, 0, 0, 540, 720);
    gctx.restore();
    drawEmbossedSeamGrid(gctx, 0, 0, 540, 720, edgeMatrix, {
      shadowColor: 'rgba(42, 28, 20, 0.20)',
      highlightColor: 'rgba(255, 255, 255, 0.48)',
      lineWidth: 1.6,
    });
  }

  // Mount peek reference canvas
  {
    const peekCanvas = document.createElement('canvas');
    peekCanvas.width = 540;
    peekCanvas.height = 720;
    peekCanvas.getContext('2d')!.drawImage(styledPhoto, 0, 0, 540, 720);
    peekOverlay.appendChild(peekCanvas);
  }

  // Create target cells on board for tap-to-place & drop hover highlight
  const cellElements: HTMLElement[] = [];
  for (let slot = 0; slot < total; slot++) {
    const cell = document.createElement('div');
    cell.className = 'board-cell-target';
    cell.dataset.slot = String(slot);
    cell.addEventListener('click', () => {
      if (solved || phase !== 'playing' || selectedPieceId === null) return;
      placePieceOnSlot(selectedPieceId, slot, true);
    });
    cellsLayer.appendChild(cell);
    cellElements.push(cell);
  }

  // Tap empty space inside collector box while a piece is selected -> move piece there!
  collectorBox.addEventListener('click', (e) => {
    if (solved || phase !== 'playing' || selectedPieceId === null) return;
    if ((e.target as HTMLElement).closest('#btn-shuffle-box')) return;
    const m = measureStage();
    const arenaRect = arenaEl.getBoundingClientRect();
    const ax = e.clientX - arenaRect.left;
    const ay = e.clientY - arenaRect.top;
    const { u, v } = arenaToBoxUv(ax, ay, m);
    const tilt = (Math.random() * 16 - 8) * (Math.PI / 180);
    locations.set(selectedPieceId, { kind: 'box', u, v, rot: tilt });
    selectedPieceId = null;
    audio.playPieceLand(0.45, 0);
    syncPiecesToLocations(true);
  });

  // Measure live stage geometry relative to .stage-arena
  function measureStage(): StageMetrics {
    const aRect = arenaEl.getBoundingClientRect();
    const bRect = boardStage.getBoundingClientRect();
    const cRect = collectorBox.getBoundingClientRect();
    const boardW = bRect.width || 254;
    const boardH = bRect.height || 338;
    const cellW = boardW / gridSize;
    const cellH = boardH / gridSize;
    const boxRestScale = Math.min(0.95, Math.max(0.72, 58 / Math.max(cellW, cellH)));

    return {
      arenaW: aRect.width || 350,
      arenaH: aRect.height || 540,
      boardLeft: bRect.left - aRect.left,
      boardTop: bRect.top - aRect.top,
      boardW,
      boardH,
      cellW,
      cellH,
      boxLeft: cRect.left - aRect.left,
      boxTop: cRect.top - aRect.top,
      boxW: cRect.width || 340,
      boxH: cRect.height || 170,
      boxRestScale,
    };
  }

  function getBoxBounds(m: StageMetrics) {
    const padX = Math.max(32, m.cellW * m.boxRestScale * 0.56);
    const padTop = 52;
    const padBottom = Math.max(26, m.cellH * m.boxRestScale * 0.48);
    const minX = m.boxLeft + padX;
    const maxX = Math.max(minX + 10, m.boxLeft + m.boxW - padX);
    const minY = m.boxTop + padTop;
    const maxY = Math.max(minY + 10, m.boxTop + m.boxH - padBottom);
    return { minX, maxX, minY, maxY };
  }

  function boxUvToArena(u: number, v: number, m: StageMetrics): { x: number; y: number } {
    const { minX, maxX, minY, maxY } = getBoxBounds(m);
    return {
      x: minX + u * (maxX - minX),
      y: minY + v * (maxY - minY),
    };
  }

  function arenaToBoxUv(ax: number, ay: number, m: StageMetrics): { u: number; v: number } {
    const { minX, maxX, minY, maxY } = getBoxBounds(m);
    const u = Math.max(0, Math.min(1, (ax - minX) / Math.max(1, maxX - minX)));
    const v = Math.max(0, Math.min(1, (ay - minY) / Math.max(1, maxY - minY)));
    return { u, v };
  }

  // Generate well-spread stratified scatter UV coordinates inside the collector box
  function generateScatteredBoxTargets(count: number): Array<{ u: number; v: number; rot: number }> {
    const cols = count <= 9 ? 5 : count <= 16 ? 6 : 7;
    const rows = Math.ceil(count / cols);
    const cells: Array<{ r: number; c: number }> = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push({ r, c });
      }
    }
    // Fisher-Yates shuffle
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    return Array.from({ length: count }, (_, idx) => {
      const cell = cells[idx % cells.length];
      const baseU = cols > 1 ? (cell.c + 0.5) / cols : 0.5;
      const baseV = rows > 1 ? (cell.r + 0.5) / rows : 0.5;
      const jitterU = (Math.random() - 0.5) * (0.72 / cols);
      const jitterV = (Math.random() - 0.5) * (0.72 / rows);
      return {
        u: Math.max(0.03, Math.min(0.97, baseU + jitterU)),
        v: Math.max(0.05, Math.min(0.95, baseV + jitterV)),
        rot: (Math.random() * 24 - 12) * (Math.PI / 180),
      };
    });
  }

  const initialScatter = generateScatteredBoxTargets(total);
  const locations = new Map<number, PieceLocation>();
  const pieceEls: HTMLElement[] = [];
  const pieceZ = new Map<number, number>();

  for (let i = 0; i < total; i++) {
    const p = pieces[i];
    const t = initialScatter[i];
    locations.set(p.id, { kind: 'box', u: t.u, v: t.v, rot: t.rot });
    pieceZ.set(p.id, ++topZ);

    const el = document.createElement('div');
    el.className = 'stage-piece';
    el.dataset.pieceId = String(p.id);
    if (runCuttingIntro) {
      el.style.opacity = '0';
    }

    const c = document.createElement('canvas');
    c.width = p.canvas.width;
    c.height = p.canvas.height;
    c.getContext('2d')!.drawImage(p.canvas, 0, 0);

    const hit = document.createElement('div');
    hit.className = 'piece-hit-area';

    el.appendChild(c);
    el.appendChild(hit);
    piecesLayer.appendChild(el);
    pieceEls.push(el);
  }

  function positionPieceDom(
    pieceId: number,
    cx: number,
    cy: number,
    rotRad: number,
    scale: number,
    m: StageMetrics
  ): void {
    const p = pieces[pieceId];
    const el = pieceEls[pieceId];
    const domW = m.cellW * (1 + 2 * p.padRatio);
    const domH = m.cellH * (1 + 2 * p.padRatio);
    el.style.width = `${domW}px`;
    el.style.height = `${domH}px`;
    el.style.transform = `translate3d(${cx - domW * 0.5}px, ${
      cy - domH * 0.5
    }px, 0) rotate(${rotRad.toFixed(4)}rad) scale(${scale.toFixed(4)})`;
  }

  // HUD rendering (Intro vs Playing)
  function renderIntroHud(message: string): void {
    hudEl.innerHTML = `
      <span class="hud-cutting-msg" id="hud-cutting-msg">${message}</span>
      <button type="button" class="peek-btn" id="btn-skip-intro">跳过动效 →</button>
    `;
    hudEl.querySelector('#btn-skip-intro')?.addEventListener('click', () => {
      audio.playTap();
      finishIntroImmediately();
    });
  }

  function renderPlayingHud(): void {
    hudEl.innerHTML = `
      <div class="hud-stats">
        <span class="hud-stat" id="hud-time-wrap">
          ${timerMode === 'none' ? '用时' : '剩余'} <strong id="hud-time">00:00</strong>
        </span>
        <span class="hud-stat">步数 <strong id="hud-steps">${steps}</strong></span>
        <span class="hud-stat">进度 <strong id="hud-progress">${getLockedCount()}/${total}</strong></span>
      </div>
      <button type="button" class="peek-btn" id="btn-peek-photo" aria-label="预览原图">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        原图
      </button>
    `;
    updateTimerHud();
    const peekBtn = hudEl.querySelector<HTMLButtonElement>('#btn-peek-photo')!;
    peekBtn.addEventListener('click', () => {
      if (solved) return;
      audio.playTap();
      peekOverlay.classList.add('is-visible');
      peekBtn.classList.add('is-peeking');
      if (peekTimeout !== null) window.clearTimeout(peekTimeout);
      peekTimeout = window.setTimeout(() => {
        peekOverlay.classList.remove('is-visible');
        peekBtn.classList.remove('is-peeking');
      }, 1050);
    });
  }

  function updateTimerHud(): void {
    const timeEl = hudEl.querySelector<HTMLElement>('#hud-time');
    const timeWrapEl = hudEl.querySelector<HTMLElement>('#hud-time-wrap');
    if (!timeEl || !timeWrapEl) return;

    if (timerMode === 'none') {
      timeEl.textContent = formatDuration(elapsedSeconds);
    } else if (!timerPausedByTimeout) {
      const rem = Math.max(0, timerMode - elapsedSeconds);
      timeEl.textContent = formatDuration(rem);
      timeWrapEl.classList.toggle('is-urgent', rem <= 12);
    }
  }

  const timerId = window.setInterval(() => {
    if (solved || phase !== 'playing' || timerPausedByTimeout) return;
    elapsedSeconds += 1;
    updateTimerHud();
    if (timerMode !== 'none' && elapsedSeconds >= timerMode) {
      timerPausedByTimeout = true;
      const timeWrapEl = hudEl.querySelector<HTMLElement>('#hud-time-wrap');
      if (timeWrapEl) {
        timeWrapEl.innerHTML = `已超时 · <strong>继续拼完</strong>`;
      }
    }
  }, 1000);

  function getLockedCount(): number {
    let c = 0;
    for (const loc of locations.values()) {
      if (loc.kind === 'board' && loc.locked) c++;
    }
    return c;
  }

  function getBoxCount(): number {
    let c = 0;
    for (const loc of locations.values()) {
      if (loc.kind === 'box') c++;
    }
    return c;
  }

  function findPieceAtSlot(slot: number): number | null {
    for (const [id, loc] of locations.entries()) {
      if (loc.kind === 'board' && loc.slot === slot) return id;
    }
    return null;
  }

  function syncPiecesToLocations(smooth: boolean): void {
    const m = measureStage();
    const lockedCount = getLockedCount();
    const boxCount = getBoxCount();

    const stepsEl = hudEl.querySelector<HTMLElement>('#hud-steps');
    const progEl = hudEl.querySelector<HTMLElement>('#hud-progress');
    if (stepsEl) stepsEl.textContent = String(steps);
    if (progEl) progEl.textContent = `${lockedCount}/${total}`;

    collectorTitle.textContent =
      lockedCount === total
        ? '拼图收集盒 · 全部归位！'
        : `拼图收集盒 · 盒内剩余 ${boxCount} 块`;
    collectorEmptyMsg.style.display = boxCount === 0 && lockedCount < total ? 'block' : 'none';
    shuffleBtn.style.visibility =
      phase === 'playing' && boxCount > 1 ? 'visible' : 'hidden';

    for (let id = 0; id < total; id++) {
      if (dragState?.isDragging && dragState.pieceId === id) continue;

      const el = pieceEls[id];
      const loc = locations.get(id)!;
      el.style.opacity = '1';
      el.classList.toggle('is-smooth', smooth);
      el.classList.toggle('is-selected', selectedPieceId === id);
      el.classList.remove('is-dragging');

      if (loc.kind === 'board') {
        const r = Math.floor(loc.slot / gridSize);
        const c = loc.slot % gridSize;
        const cx = m.boardLeft + (c + 0.5) * m.cellW;
        const cy = m.boardTop + (r + 0.5) * m.cellH;
        const scale = selectedPieceId === id ? 1.05 : 1;

        el.classList.toggle('is-locked', loc.locked);
        el.classList.toggle('is-just-snapped', Boolean(loc.justSnapped));
        el.style.zIndex = loc.locked ? '2' : String(pieceZ.get(id) ?? 15);
        positionPieceDom(id, cx, cy, 0, scale, m);
      } else {
        el.classList.remove('is-locked', 'is-just-snapped');
        const { x, y } = boxUvToArena(loc.u, loc.v, m);
        const isSel = selectedPieceId === id;
        const scale = isSel ? 1.02 : m.boxRestScale;
        const rot = isSel ? 0 : loc.rot;
        el.style.zIndex = String(pieceZ.get(id) ?? 12);
        positionPieceDom(id, x, y, rot, scale, m);
      }
    }
  }

  // Shuffle ("摇一摇整理") remaining pieces inside collector box!
  shuffleBtn.addEventListener('click', () => {
    if (solved || phase !== 'playing') return;
    const boxIds: number[] = [];
    for (const [id, loc] of locations.entries()) {
      if (loc.kind === 'box') boxIds.push(id);
    }
    if (boxIds.length === 0) return;

    const freshTargets = generateScatteredBoxTargets(boxIds.length);
    boxIds.forEach((id, idx) => {
      const t = freshTargets[idx];
      locations.set(id, { kind: 'box', u: t.u, v: t.v, rot: t.rot });
      pieceZ.set(id, ++topZ);
    });
    selectedPieceId = null;
    audio.playScatter(boxIds.length);
    triggerHaptic('light');
    syncPiecesToLocations(true);
  });

  function placePieceOnSlot(pieceId: number, targetSlot: number, animateSmooth: boolean): void {
    const current = locations.get(pieceId)!;
    if (current.kind === 'board' && current.locked) return;

    const occupantId = findPieceAtSlot(targetSlot);
    if (occupantId === pieceId) {
      selectedPieceId = null;
      syncPiecesToLocations(animateSmooth);
      return;
    }

    if (occupantId !== null) {
      const occLoc = locations.get(occupantId)!;
      if (occLoc.kind === 'board' && occLoc.locked) {
        audio.playTap();
        syncPiecesToLocations(true);
        return;
      }
      // Swap occupant either to dragged piece's previous board slot or smoothly into collector box
      if (current.kind === 'board') {
        const swappedLocks = occupantId === current.slot;
        locations.set(occupantId, {
          kind: 'board',
          slot: current.slot,
          locked: swappedLocks,
          justSnapped: swappedLocks,
        });
      } else {
        locations.set(occupantId, {
          kind: 'box',
          u: current.u,
          v: current.v,
          rot: (Math.random() * 20 - 10) * (Math.PI / 180),
        });
        pieceZ.set(occupantId, ++topZ);
      }
    }

    const isCorrect = pieceId === targetSlot;
    locations.set(pieceId, {
      kind: 'board',
      slot: targetSlot,
      locked: isCorrect,
      justSnapped: isCorrect,
    });
    pieceZ.set(pieceId, ++topZ);

    steps += 1;
    selectedPieceId = null;

    const lockedCount = getLockedCount();
    if (isCorrect) {
      audio.playSnap(lockedCount, total);
      triggerHaptic('medium');
    } else {
      audio.playSoftPlace();
      triggerHaptic('light');
    }

    syncPiecesToLocations(animateSmooth);

    setTimeout(() => {
      const loc = locations.get(pieceId);
      if (loc && loc.kind === 'board' && loc.justSnapped) {
        loc.justSnapped = false;
        pieceEls[pieceId].classList.remove('is-just-snapped');
      }
    }, 380);

    if (lockedCount === total && !solved) {
      solved = true;
      window.clearInterval(timerId);
      setTimeout(() => {
        onSolved({ elapsedSeconds, steps });
      }, 480);
    }
  }

  /* =========================================================
     ACT 1–3: UNIFIED SLICING + GRAVITY FALL INTO COLLECTOR BOX
     ========================================================= */
  let introRaf = 0;
  let introCancelled = false;

  function finishIntroImmediately(): void {
    if (phase === 'playing') return;
    introCancelled = true;
    cancelAnimationFrame(introRaf);
    cuttingCanvas.style.display = 'none';
    phase = 'playing';
    renderPlayingHud();
    syncPiecesToLocations(true);
  }

  function startUnifiedIntro(): void {
    renderIntroHud('安放相纸，准备切割…');
    shuffleBtn.style.visibility = 'hidden';

    // Wait 1 frame so DOM layout rects are finalized
    introRaf = requestAnimationFrame(() => {
      const m = measureStage();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const padMargin = 16;
      const cw = m.boardW + padMargin * 2;
      const ch = m.boardH + padMargin * 2;
      cuttingCanvas.width = Math.round(cw * dpr);
      cuttingCanvas.height = Math.round(ch * dpr);
      const cctx = cuttingCanvas.getContext('2d')!;

      const horizCount = gridSize - 1;
      const vertCount = gridSize - 1;
      const totalCuts = horizCount + vertCount;
      const tabSize = Math.min(m.cellW, m.cellH) * 0.215;

      const SETTLE_END = 220;
      const CUTS_END = 1920;
      const POP_END = 2240;
      const GRAVITY = 1750;

      // Build physics bodies targeting the exact collector-box UV coordinates!
      const bodies: IntroBody[] = pieces.map((p, idx) => {
        const startCx = m.boardLeft + (p.col + 0.5) * m.cellW;
        const startCy = m.boardTop + (p.row + 0.5) * m.cellH;
        const normX = (p.col + 0.5) / gridSize - 0.5;
        const normY = (p.row + 0.5) / gridSize - 0.5;

        const popDx = normX * 20 + (Math.random() * 5 - 2.5);
        const popDy = normY * 20 + (Math.random() * 5 - 2.5);
        const popRot = (Math.random() * 10 - 5) * (Math.PI / 180);

        const targetLoc = locations.get(p.id) as { kind: 'box'; u: number; v: number; rot: number };
        const targetPos = boxUvToArena(targetLoc.u, targetLoc.v, m);

        const vy0 = -(30 + Math.random() * 65);
        const dropDy = Math.max(40, targetPos.y - (startCy + popDy));
        const tImpact = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * GRAVITY * dropDy)) / GRAVITY;
        const vx0 = (targetPos.x - (startCx + popDx)) / Math.max(0.25, tImpact);

        const rowFromBottom = gridSize - 1 - p.row;
        const releaseDelayMs = rowFromBottom * 78 + Math.random() * 88;

        return {
          x: startCx,
          y: startCy,
          vx: vx0,
          vy: vy0,
          rot: 0,
          omega: ((idx % 2 === 0 ? 1 : -1) * (1.2 + Math.random() * 1.8)),
          scale: 1,
          popDx,
          popDy,
          popRot,
          releaseDelayMs,
          released: false,
          settled: false,
          floorY: targetPos.y,
          bounceCount: 0,
        };
      });

      let lastTriggeredCut = -1;
      let popTriggered = false;
      let fallMsgShown = false;
      let lastLandSoundAt = 0;
      let allSettledSince: number | null = null;
      const t0 = performance.now();
      let prevNow = t0;

      const drawBladeNib = (bx: number, by: number, angleRad: number) => {
        cctx.save();
        cctx.translate(bx, by);
        cctx.rotate(angleRad);

        const glint = cctx.createRadialGradient(0, 0, 1, 0, 0, 17);
        glint.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
        glint.addColorStop(0.45, 'rgba(255, 218, 224, 0.58)');
        glint.addColorStop(1, 'rgba(255, 255, 255, 0)');
        cctx.fillStyle = glint;
        cctx.beginPath();
        cctx.arc(0, 0, 17, 0, Math.PI * 2);
        cctx.fill();

        cctx.fillStyle = '#FFFFFF';
        cctx.strokeStyle = 'rgba(40, 28, 24, 0.45)';
        cctx.lineWidth = 1.2;
        cctx.beginPath();
        cctx.moveTo(4, 0);
        cctx.lineTo(-13, -5.5);
        cctx.lineTo(-9.5, 0);
        cctx.lineTo(-13, 5.5);
        cctx.closePath();
        cctx.fill();
        cctx.stroke();

        cctx.restore();
      };

      const stepIntro = (now: number) => {
        if (introCancelled) return;
        const elapsed = now - t0;
        const dt = Math.min(0.034, Math.max(0.001, (now - prevNow) / 1000));
        prevNow = now;

        const liveMetrics = measureStage();

        if (elapsed < CUTS_END) {
          // Act 1: Slicing on cuttingCanvas right inside .board-stage
          cctx.save();
          cctx.scale(dpr, dpr);
          cctx.clearRect(0, 0, cw, ch);

          const ox = padMargin;
          const oy = padMargin;

          cctx.save();
          cctx.beginPath();
          cctx.roundRect(ox, oy, liveMetrics.boardW, liveMetrics.boardH, 10);
          cctx.clip();

          cctx.drawImage(rawPhoto, ox, oy, liveMetrics.boardW, liveMetrics.boardH);

          const cutProg = Math.max(0, Math.min(1, (elapsed - SETTLE_END) / (CUTS_END - SETTLE_END)));
          if (cutProg > 0) {
            cctx.save();
            cctx.globalAlpha = Math.min(1, cutProg * 1.18);
            cctx.drawImage(styledPhoto, ox, oy, liveMetrics.boardW, liveMetrics.boardH);
            cctx.restore();
          }

          let bladeTip: { x: number; y: number; angle: number } | null = null;

          if (elapsed >= SETTLE_END) {
            const cutFloat = cutProg * totalCuts;
            const activeIdx = Math.min(totalCuts - 1, Math.floor(cutFloat));
            const activeFrac = Math.min(1, cutFloat - activeIdx);

            if (activeIdx > lastTriggeredCut) {
              lastTriggeredCut = activeIdx;
              audio.playSlice(activeIdx, totalCuts);
              triggerHaptic('light');
              const msgEl = hudEl.querySelector<HTMLElement>('#hud-cutting-msg');
              if (msgEl) {
                msgEl.textContent = `正在切割拼图 (${activeIdx + 1}/${totalCuts})…`;
              }
            }

            for (let k = 0; k <= activeIdx; k++) {
              const frac = k < activeIdx ? 1 : easeOutCubic(activeFrac);
              const isHoriz = k < horizCount;

              cctx.save();
              if (isHoriz) {
                const r = k;
                const sy = oy + (r + 1) * liveMetrics.cellH;
                const clipW = liveMetrics.boardW * frac;
                cctx.beginPath();
                cctx.rect(ox - 10, sy - tabSize * 1.6, clipW + 20, tabSize * 3.2);
                cctx.clip();

                cctx.beginPath();
                for (let c = 0; c < gridSize; c++) {
                  const sx0 = ox + (c + 1) * liveMetrics.cellW;
                  const sx1 = ox + c * liveMetrics.cellW;
                  cctx.moveTo(sx0, sy);
                  appendJigsawEdge(cctx, sx0, sy, sx1, sy, edgeMatrix[r][c].bottom, tabSize);
                }
                cctx.strokeStyle = 'rgba(26, 16, 12, 0.52)';
                cctx.lineWidth = 2.0;
                cctx.stroke();

                cctx.translate(0, 1);
                cctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
                cctx.lineWidth = 1.1;
                cctx.stroke();

                if (k === activeIdx && frac < 0.99) {
                  bladeTip = { x: ox + clipW, y: sy, angle: 0 };
                }
              } else {
                const c = k - horizCount;
                const sx = ox + (c + 1) * liveMetrics.cellW;
                const clipH = liveMetrics.boardH * frac;
                cctx.beginPath();
                cctx.rect(sx - tabSize * 1.6, oy - 10, tabSize * 3.2, clipH + 20);
                cctx.clip();

                cctx.beginPath();
                for (let r = 0; r < gridSize; r++) {
                  const sy0 = oy + r * liveMetrics.cellH;
                  const sy1 = oy + (r + 1) * liveMetrics.cellH;
                  cctx.moveTo(sx, sy0);
                  appendJigsawEdge(cctx, sx, sy0, sx, sy1, edgeMatrix[r][c].right, tabSize);
                }
                cctx.strokeStyle = 'rgba(26, 16, 12, 0.52)';
                cctx.lineWidth = 2.0;
                cctx.stroke();

                cctx.translate(1, 0);
                cctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
                cctx.lineWidth = 1.1;
                cctx.stroke();

                if (k === activeIdx && frac < 0.99) {
                  bladeTip = { x: sx, y: oy + clipH, angle: Math.PI * 0.5 };
                }
              }
              cctx.restore();
            }
          }

          cctx.restore(); // end board clip
          if (bladeTip) {
            drawBladeNib(bladeTip.x, bladeTip.y, bladeTip.angle);
          }
          cctx.restore();
        } else {
          // Act 2 & 3: Swap cuttingCanvas -> real interactive DOM pieces & fall into collectorBox!
          if (!popTriggered) {
            popTriggered = true;
            cuttingCanvas.style.display = 'none';
            for (const el of pieceEls) {
              el.classList.remove('is-smooth');
              el.style.opacity = '1';
            }
            audio.playScatter(total);
            triggerHaptic('medium');
            const msgEl = hudEl.querySelector<HTMLElement>('#hud-cutting-msg');
            if (msgEl) msgEl.textContent = '咔嚓！拼图已切开，掉入收集盒…';
          }

          const popRaw = Math.min(1, (elapsed - CUTS_END) / (POP_END - CUTS_END));
          const popSpring = easeOutBack(popRaw);
          const fallElapsed = elapsed - POP_END;

          if (fallElapsed > 0 && !fallMsgShown) {
            fallMsgShown = true;
            const msgEl = hudEl.querySelector<HTMLElement>('#hud-cutting-msg');
            if (msgEl) msgEl.textContent = '哗啦啦～掉进下方收集盒，马上开拼！';
          }

          const boxBounds = getBoxBounds(liveMetrics);
          let settledCount = 0;

          for (let i = 0; i < total; i++) {
            const p = pieces[i];
            const b = bodies[i];
            const startCx = liveMetrics.boardLeft + (p.col + 0.5) * liveMetrics.cellW;
            const startCy = liveMetrics.boardTop + (p.row + 0.5) * liveMetrics.cellH;

            if (fallElapsed < b.releaseDelayMs) {
              const cx = startCx + b.popDx * popSpring;
              const cy = startCy + b.popDy * popSpring;
              const rot = b.popRot * popSpring;
              const sc = 1 + 0.035 * popSpring;
              positionPieceDom(i, cx, cy, rot, sc, liveMetrics);
            } else {
              if (!b.released) {
                b.released = true;
                b.x = startCx + b.popDx;
                b.y = startCy + b.popDy;
                b.rot = b.popRot;
                b.scale = 1.035;
              }

              if (!b.settled) {
                b.vy += GRAVITY * dt;
                b.x += b.vx * dt;
                b.y += b.vy * dt;
                b.rot += b.omega * dt;

                const fallProg = Math.max(
                  0,
                  Math.min(1, (b.y - startCy) / Math.max(1, b.floorY - startCy))
                );
                b.scale = 1.035 + (liveMetrics.boxRestScale - 1.035) * fallProg;

                if (b.x < boxBounds.minX) {
                  b.x = boxBounds.minX;
                  b.vx = Math.abs(b.vx) * 0.52;
                } else if (b.x > boxBounds.maxX) {
                  b.x = boxBounds.maxX;
                  b.vx = -Math.abs(b.vx) * 0.52;
                }

                if (b.y >= b.floorY && b.vy > 0) {
                  b.y = b.floorY;
                  const impact = b.vy;
                  if (impact > 110 && now - lastLandSoundAt > 44) {
                    lastLandSoundAt = now;
                    const pitchJitter = ((i * 17) % 10) / 10 - 0.4;
                    audio.playPieceLand(Math.min(1, impact / 780), pitchJitter);
                    if (b.bounceCount === 0 && i % 3 === 0) {
                      triggerHaptic('light');
                    }
                  }

                  b.bounceCount += 1;
                  if (impact > 85 && b.bounceCount <= 2) {
                    b.vy = -impact * 0.32;
                    b.vx *= 0.55;
                    b.omega *= 0.48;
                  } else {
                    b.vy = 0;
                    b.vx = 0;
                    b.omega = 0;
                    b.settled = true;
                    // Clamp final angle to natural tabletop tilt (-16deg..+16deg) & save exact UV!
                    const normAngle = Math.atan2(Math.sin(b.rot), Math.cos(b.rot));
                    b.rot = Math.max(-0.28, Math.min(0.28, normAngle));
                    const exactUv = arenaToBoxUv(b.x, b.y, liveMetrics);
                    const clampedPos = boxUvToArena(exactUv.u, exactUv.v, liveMetrics);
                    b.x = clampedPos.x;
                    b.y = clampedPos.y;
                    b.scale = liveMetrics.boxRestScale;
                    locations.set(i, {
                      kind: 'box',
                      u: exactUv.u,
                      v: exactUv.v,
                      rot: b.rot,
                    });
                  }
                }
              }

              if (b.settled) settledCount++;
              positionPieceDom(i, b.x, b.y, b.rot, b.scale, liveMetrics);
            }
          }

          if (settledCount === total) {
            if (allSettledSince === null) {
              allSettledSince = now;
            } else if (now - allSettledSince >= 180) {
              // Seamless 0-pixel handoff to interactive play!
              phase = 'playing';
              renderPlayingHud();
              syncPiecesToLocations(false);
              return;
            }
          }
        }

        introRaf = requestAnimationFrame(stepIntro);
      };

      introRaf = requestAnimationFrame(stepIntro);
    });
  }

  /* =========================================================
     POINTER DRAG & TAP-TO-SELECT INTERACTION (IN-PLACE!)
     ========================================================= */
  let dragState: {
    pieceId: number;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    grabOffsetX: number;
    grabOffsetY: number;
    touchLiftY: number;
    isDragging: boolean;
  } | null = null;

  function clearHoverCells(): void {
    for (const el of cellElements) el.classList.remove('is-drop-hover');
  }

  function evaluateBoardSlotAtArenaPos(
    arenaX: number,
    arenaY: number,
    pieceId: number,
    m: StageMetrics
  ): { slot: number; magneticLock: boolean } | null {
    // 1. Magnetic snap check (<= 34px to true home cell center)
    const truePiece = pieces[pieceId];
    const trueCx = m.boardLeft + (truePiece.col + 0.5) * m.cellW;
    const trueCy = m.boardTop + (truePiece.row + 0.5) * m.cellH;
    if (Math.hypot(arenaX - trueCx, arenaY - trueCy) <= 34) {
      return { slot: pieceId, magneticLock: true };
    }

    // 2. Otherwise check if inside board bounds over an unlocked cell
    if (
      arenaX >= m.boardLeft - 10 &&
      arenaX <= m.boardLeft + m.boardW + 10 &&
      arenaY >= m.boardTop - 10 &&
      arenaY <= m.boardTop + m.boardH + 10
    ) {
      const col = Math.max(
        0,
        Math.min(gridSize - 1, Math.floor((arenaX - m.boardLeft) / m.cellW))
      );
      const row = Math.max(
        0,
        Math.min(gridSize - 1, Math.floor((arenaY - m.boardTop) / m.cellH))
      );
      const slot = row * gridSize + col;
      const occ = findPieceAtSlot(slot);
      if (occ !== null && occ !== pieceId) {
        const occLoc = locations.get(occ);
        if (occLoc && occLoc.kind === 'board' && occLoc.locked) return null;
      }
      return { slot, magneticLock: slot === pieceId };
    }

    return null;
  }

  pieceEls.forEach((el, pieceId) => {
    const hitArea = el.querySelector<HTMLElement>('.piece-hit-area')!;
    hitArea.addEventListener('pointerdown', (e: PointerEvent) => {
      if (solved || phase !== 'playing') return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const loc = locations.get(pieceId)!;
      if (loc.kind === 'board' && loc.locked) return;

      e.stopPropagation();
      const m = measureStage();
      const arenaRect = arenaEl.getBoundingClientRect();
      const pointerArenaX = e.clientX - arenaRect.left;
      const pointerArenaY = e.clientY - arenaRect.top;

      let curCx: number;
      let curCy: number;
      if (loc.kind === 'board') {
        const r = Math.floor(loc.slot / gridSize);
        const c = loc.slot % gridSize;
        curCx = m.boardLeft + (c + 0.5) * m.cellW;
        curCy = m.boardTop + (r + 0.5) * m.cellH;
      } else {
        const pos = boxUvToArena(loc.u, loc.v, m);
        curCx = pos.x;
        curCy = pos.y;
      }

      // Bring touched piece to the top of the collector pile immediately
      pieceZ.set(pieceId, ++topZ);
      el.style.zIndex = String(topZ);

      dragState = {
        pieceId,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        grabOffsetX: curCx - pointerArenaX,
        grabOffsetY: curCy - pointerArenaY,
        touchLiftY: e.pointerType === 'touch' ? -22 : 0,
        isDragging: false,
      };
    });
  });

  const onWindowPointerMove = (e: PointerEvent) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const dx = e.clientX - dragState.startClientX;
    const dy = e.clientY - dragState.startClientY;

    if (!dragState.isDragging) {
      if (Math.hypot(dx, dy) < 5) return;
      dragState.isDragging = true;
      selectedPieceId = null;
      const el = pieceEls[dragState.pieceId];
      el.classList.remove('is-smooth', 'is-selected');
      el.classList.add('is-dragging');
      el.style.zIndex = '900';
      audio.playPickup();
      triggerHaptic('light');
    }

    const m = measureStage();
    const arenaRect = arenaEl.getBoundingClientRect();
    const cx = e.clientX - arenaRect.left + dragState.grabOffsetX;
    const cy = e.clientY - arenaRect.top + dragState.grabOffsetY + dragState.touchLiftY;

    positionPieceDom(dragState.pieceId, cx, cy, 0, 1.05, m);

    clearHoverCells();
    const hit = evaluateBoardSlotAtArenaPos(cx, cy, dragState.pieceId, m);
    if (hit && cellElements[hit.slot]) {
      cellElements[hit.slot].classList.add('is-drop-hover');
    }
  };

  const onWindowPointerUp = (e: PointerEvent) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const state = dragState;
    dragState = null;
    clearHoverCells();

    const m = measureStage();
    const arenaRect = arenaEl.getBoundingClientRect();

    if (state.isDragging) {
      const cx = e.clientX - arenaRect.left + state.grabOffsetX;
      const cy = e.clientY - arenaRect.top + state.grabOffsetY + state.touchLiftY;

      const boardHit = evaluateBoardSlotAtArenaPos(cx, cy, state.pieceId, m);
      if (boardHit !== null) {
        placePieceOnSlot(state.pieceId, boardHit.slot, true);
      } else {
        // Dropped outside board -> settle right where placed inside collector box!
        const { u, v } = arenaToBoxUv(cx, cy, m);
        const organicTilt = (Math.random() * 18 - 9) * (Math.PI / 180);
        locations.set(state.pieceId, { kind: 'box', u, v, rot: organicTilt });
        pieceZ.set(state.pieceId, ++topZ);
        audio.playPieceLand(0.5, 0);
        syncPiecesToLocations(true);
      }
      return;
    }

    // Short tap (< 5px): Tap-to-Select or Tap-to-Swap!
    const tappedId = state.pieceId;
    const tappedLoc = locations.get(tappedId)!;

    if (selectedPieceId === null) {
      selectedPieceId = tappedId;
      audio.playPickup();
      triggerHaptic('light');
      syncPiecesToLocations(true);
    } else if (selectedPieceId === tappedId) {
      selectedPieceId = null;
      audio.playTap();
      syncPiecesToLocations(true);
    } else if (tappedLoc.kind === 'board' && !tappedLoc.locked) {
      placePieceOnSlot(selectedPieceId, tappedLoc.slot, true);
    } else {
      selectedPieceId = tappedId;
      audio.playPickup();
      syncPiecesToLocations(true);
    }
  };

  const onWindowResize = () => {
    if (phase === 'playing') {
      syncPiecesToLocations(false);
    }
  };

  window.addEventListener('pointermove', onWindowPointerMove, { passive: true });
  window.addEventListener('pointerup', onWindowPointerUp);
  window.addEventListener('pointercancel', onWindowPointerUp);
  window.addEventListener('resize', onWindowResize);

  if (runCuttingIntro) {
    startUnifiedIntro();
  } else {
    cuttingCanvas.style.display = 'none';
    renderPlayingHud();
    requestAnimationFrame(() => syncPiecesToLocations(false));
  }

  return () => {
    introCancelled = true;
    cancelAnimationFrame(introRaf);
    window.clearInterval(timerId);
    if (peekTimeout !== null) window.clearTimeout(peekTimeout);
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp);
    window.removeEventListener('pointercancel', onWindowPointerUp);
    window.removeEventListener('resize', onWindowResize);
  };
}
