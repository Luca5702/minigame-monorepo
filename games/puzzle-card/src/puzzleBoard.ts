import { triggerHaptic, type TactileAudio } from '@minigame/xhs-mini-sdk';
import { drawEmbossedSeamGrid } from './jigsaw.ts';
import { formatDuration } from './postcardRenderer.ts';
import type { EdgeSides, PieceCount, RenderedPiece, TimerMode } from './types.ts';

export interface PuzzleGameResult {
  elapsedSeconds: number;
  steps: number;
}

export interface PuzzleBoardMountOptions {
  container: HTMLElement;
  styledPhoto: HTMLCanvasElement;
  edgeMatrix: EdgeSides[][];
  pieces: RenderedPiece[];
  pieceCount: PieceCount;
  timerMode: TimerMode;
  audio: TactileAudio;
  onSolved: (result: PuzzleGameResult) => void;
}

type PiecePlacement =
  | { kind: 'tray' }
  | { kind: 'board'; slot: number; locked: boolean; justSnapped?: boolean };

export function mountPuzzleBoard(opts: PuzzleBoardMountOptions): () => void {
  const {
    container,
    styledPhoto,
    edgeMatrix,
    pieces,
    pieceCount,
    timerMode,
    audio,
    onSolved,
  } = opts;

  const gridSize = Math.round(Math.sqrt(pieceCount));
  const total = pieces.length;

  // Shuffled tray order (Fisher-Yates)
  const trayOrder = pieces.map((p) => p.id);
  for (let i = trayOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [trayOrder[i], trayOrder[j]] = [trayOrder[j], trayOrder[i]];
  }

  const placements = new Map<number, PiecePlacement>();
  for (const id of trayOrder) {
    placements.set(id, { kind: 'tray' });
  }

  let selectedPieceId: number | null = null;
  let steps = 0;
  let elapsedSeconds = 0;
  let solved = false;
  let timerPausedByTimeout = false;
  let peekTimeout: number | null = null;

  // Build DOM structure inside container
  container.innerHTML = `
    <div class="play-hud">
      <div class="hud-stats">
        <span class="hud-stat" id="hud-time-wrap">
          ${timerMode === 'none' ? '用时' : '剩余'} <strong id="hud-time">00:00</strong>
        </span>
        <span class="hud-stat">步数 <strong id="hud-steps">0</strong></span>
        <span class="hud-stat">进度 <strong id="hud-progress">0/${total}</strong></span>
      </div>
      <button type="button" class="peek-btn" id="btn-peek-photo" aria-label="预览原图">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        原图
      </button>
    </div>

    <div class="board-frame">
      <div class="board-stage" id="puzzle-board-stage">
        <canvas class="board-guide-canvas" id="board-guide-canvas"></canvas>
        <div class="board-cells-layer" id="board-cells-layer" style="grid-template-columns: repeat(${gridSize}, 1fr); grid-template-rows: repeat(${gridSize}, 1fr);"></div>
        <div class="board-pieces-layer" id="board-pieces-layer"></div>
        <div class="board-peek-overlay" id="board-peek-overlay"></div>
      </div>
    </div>

    <div class="tray-container">
      <div class="tray-header">
        <span>散落拼图池（可拖拽吸附，或点选后点上方格子）</span>
        <span id="tray-remain-text">待拼 ${total} 块</span>
      </div>
      <div class="tray-scroll" id="puzzle-tray-scroll"></div>
    </div>
  `;

  const timeEl = container.querySelector<HTMLElement>('#hud-time')!;
  const timeWrapEl = container.querySelector<HTMLElement>('#hud-time-wrap')!;
  const stepsEl = container.querySelector<HTMLElement>('#hud-steps')!;
  const progressEl = container.querySelector<HTMLElement>('#hud-progress')!;
  const remainTextEl = container.querySelector<HTMLElement>('#tray-remain-text')!;
  const peekBtn = container.querySelector<HTMLButtonElement>('#btn-peek-photo')!;
  const peekOverlay = container.querySelector<HTMLElement>('#board-peek-overlay')!;
  const guideCanvas = container.querySelector<HTMLCanvasElement>('#board-guide-canvas')!;
  const boardStage = container.querySelector<HTMLElement>('#puzzle-board-stage')!;
  const cellsLayer = container.querySelector<HTMLElement>('#board-cells-layer')!;
  const boardPiecesLayer = container.querySelector<HTMLElement>('#board-pieces-layer')!;
  const trayScroll = container.querySelector<HTMLElement>('#puzzle-tray-scroll')!;

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

  // Create target cells
  const cellElements: HTMLElement[] = [];
  for (let slot = 0; slot < total; slot++) {
    const cell = document.createElement('div');
    cell.className = 'board-cell-target';
    cell.dataset.slot = String(slot);
    cell.addEventListener('click', () => {
      if (solved || selectedPieceId === null) return;
      placePieceOnSlot(selectedPieceId, slot);
    });
    cellsLayer.appendChild(cell);
    cellElements.push(cell);
  }

  // Timer tick
  const updateTimerHud = () => {
    if (timerMode === 'none') {
      timeEl.textContent = formatDuration(elapsedSeconds);
    } else {
      const rem = Math.max(0, timerMode - elapsedSeconds);
      timeEl.textContent = formatDuration(rem);
      timeWrapEl.classList.toggle('is-urgent', rem <= 12);
    }
  };
  updateTimerHud();

  const timerId = window.setInterval(() => {
    if (solved || timerPausedByTimeout) return;
    elapsedSeconds += 1;
    updateTimerHud();
    if (timerMode !== 'none' && elapsedSeconds >= timerMode) {
      // Gentle transition to relaxed completion rather than punishing game-over
      timerPausedByTimeout = true;
      timeWrapEl.innerHTML = `已超时 · <strong>继续拼完</strong>`;
    }
  }, 1000);

  // Peek handler (1s glimpse of full styled photo)
  const triggerPeek = () => {
    if (solved) return;
    audio.playTap();
    peekOverlay.classList.add('is-visible');
    peekBtn.classList.add('is-peeking');
    if (peekTimeout !== null) window.clearTimeout(peekTimeout);
    peekTimeout = window.setTimeout(() => {
      peekOverlay.classList.remove('is-visible');
      peekBtn.classList.remove('is-peeking');
    }, 1050);
  };
  peekBtn.addEventListener('click', triggerPeek);

  function getLockedCount(): number {
    let count = 0;
    for (const pl of placements.values()) {
      if (pl.kind === 'board' && pl.locked) count++;
    }
    return count;
  }

  function findPieceAtSlot(slot: number): number | null {
    for (const [id, pl] of placements.entries()) {
      if (pl.kind === 'board' && pl.slot === slot) return id;
    }
    return null;
  }

  function placePieceOnSlot(pieceId: number, targetSlot: number): void {
    const current = placements.get(pieceId)!;
    if (current.kind === 'board' && current.locked) return;

    const occupantId = findPieceAtSlot(targetSlot);
    if (occupantId === pieceId) {
      selectedPieceId = null;
      renderAll();
      return;
    }

    if (occupantId !== null) {
      const occPlacement = placements.get(occupantId)!;
      if (occPlacement.kind === 'board' && occPlacement.locked) {
        // Target slot is already locked; keep piece where it was
        audio.playTap();
        renderAll();
        return;
      }
      // Swap occupant into pieceId's previous location (or back to tray)
      if (current.kind === 'board') {
        const swappedLocks = occupantId === current.slot;
        placements.set(occupantId, {
          kind: 'board',
          slot: current.slot,
          locked: swappedLocks,
          justSnapped: swappedLocks,
        });
      } else {
        placements.set(occupantId, { kind: 'tray' });
      }
    }

    const isCorrect = pieceId === targetSlot;
    placements.set(pieceId, {
      kind: 'board',
      slot: targetSlot,
      locked: isCorrect,
      justSnapped: isCorrect,
    });

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

    renderAll();

    // Clear one-shot snap animation flag after render
    setTimeout(() => {
      const pl = placements.get(pieceId);
      if (pl && pl.kind === 'board' && pl.justSnapped) {
        pl.justSnapped = false;
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

  function returnPieceToTray(pieceId: number): void {
    const pl = placements.get(pieceId);
    if (!pl || (pl.kind === 'board' && pl.locked)) return;
    placements.set(pieceId, { kind: 'tray' });
    selectedPieceId = null;
    audio.playSoftPlace();
    renderAll();
  }

  // Active pointer drag state
  let dragState: {
    pieceId: number;
    pointerId: number;
    startX: number;
    startY: number;
    isDragging: boolean;
    fromTray: boolean;
    touchLiftY: number;
    proxyEl: HTMLElement | null;
  } | null = null;

  function clearHoverCells(): void {
    for (const el of cellElements) el.classList.remove('is-drop-hover');
  }

  function createDragProxy(piece: RenderedPiece, x: number, y: number, liftY: number): HTMLElement {
    const boardRect = boardStage.getBoundingClientRect();
    const cellW = boardRect.width / gridSize;
    const cellH = boardRect.height / gridSize;
    const padW = cellW * piece.padRatio;
    const padH = cellH * piece.padRatio;
    const w = (cellW + padW * 2) * 1.06;
    const h = (cellH + padH * 2) * 1.06;

    const proxy = document.createElement('div');
    proxy.className = 'drag-proxy';
    proxy.style.width = `${w}px`;
    proxy.style.height = `${h}px`;

    const c = document.createElement('canvas');
    c.width = piece.canvas.width;
    c.height = piece.canvas.height;
    c.getContext('2d')!.drawImage(piece.canvas, 0, 0);
    proxy.appendChild(c);

    proxy.style.transform = `translate3d(${x - w * 0.5}px, ${y + liftY - h * 0.5}px, 0)`;
    document.body.appendChild(proxy);
    return proxy;
  }

  function evaluateDropTarget(clientX: number, clientY: number, liftY: number, pieceId: number): number | null {
    const boardRect = boardStage.getBoundingClientRect();
    const cx = clientX;
    const cy = clientY + liftY;

    const cellW = boardRect.width / gridSize;
    const cellH = boardRect.height / gridSize;

    // 1. Check magnetic snap distance (<= 34px per PRD <=30px spec!) to true home slot
    const truePiece = pieces[pieceId];
    const trueCenterX = boardRect.left + (truePiece.col + 0.5) * cellW;
    const trueCenterY = boardRect.top + (truePiece.row + 0.5) * cellH;
    const distToTrue = Math.hypot(cx - trueCenterX, cy - trueCenterY);
    if (distToTrue <= 34) {
      return pieceId;
    }

    // 2. Otherwise check if inside board bounds over an unlocked slot
    if (
      cx >= boardRect.left - 12 &&
      cx <= boardRect.right + 12 &&
      cy >= boardRect.top - 12 &&
      cy <= boardRect.bottom + 12
    ) {
      const col = Math.max(0, Math.min(gridSize - 1, Math.floor((cx - boardRect.left) / cellW)));
      const row = Math.max(0, Math.min(gridSize - 1, Math.floor((cy - boardRect.top) / cellH)));
      const slot = row * gridSize + col;
      const occ = findPieceAtSlot(slot);
      if (occ !== null) {
        const occPl = placements.get(occ);
        if (occPl && occPl.kind === 'board' && occPl.locked) return null;
      }
      return slot;
    }

    return null;
  }

  const onWindowPointerMove = (e: PointerEvent) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const dist = Math.hypot(dx, dy);

    if (!dragState.isDragging) {
      // Allow horizontal touch swipe in tray to scroll tray naturally
      if (
        dragState.fromTray &&
        e.pointerType === 'touch' &&
        Math.abs(dx) > 9 &&
        Math.abs(dx) > Math.abs(dy) * 1.25
      ) {
        dragState = null;
        return;
      }
      if (dist < 6) return;

      dragState.isDragging = true;
      audio.playPickup();
      triggerHaptic('light');
      const piece = pieces[dragState.pieceId];
      dragState.proxyEl = createDragProxy(piece, e.clientX, e.clientY, dragState.touchLiftY);
      renderAll();
    }

    if (dragState.proxyEl) {
      const w = dragState.proxyEl.offsetWidth;
      const h = dragState.proxyEl.offsetHeight;
      dragState.proxyEl.style.transform = `translate3d(${e.clientX - w * 0.5}px, ${
        e.clientY + dragState.touchLiftY - h * 0.5
      }px, 0)`;

      clearHoverCells();
      const targetSlot = evaluateDropTarget(
        e.clientX,
        e.clientY,
        dragState.touchLiftY,
        dragState.pieceId
      );
      if (targetSlot !== null && cellElements[targetSlot]) {
        cellElements[targetSlot].classList.add('is-drop-hover');
      }
    }
  };

  const onWindowPointerUp = (e: PointerEvent) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const state = dragState;
    dragState = null;
    clearHoverCells();

    if (state.proxyEl) {
      state.proxyEl.remove();
    }

    if (state.isDragging) {
      const targetSlot = evaluateDropTarget(
        e.clientX,
        e.clientY,
        state.touchLiftY,
        state.pieceId
      );
      if (targetSlot !== null) {
        placePieceOnSlot(state.pieceId, targetSlot);
      } else if (!state.fromTray) {
        returnPieceToTray(state.pieceId);
      } else {
        renderAll();
      }
      return;
    }

    // Short tap (< 6px): Tap-to-Select / Tap-to-Swap!
    const tappedPieceId = state.pieceId;
    const tappedPl = placements.get(tappedPieceId)!;

    if (selectedPieceId === null) {
      selectedPieceId = tappedPieceId;
      audio.playPickup();
      triggerHaptic('light');
      renderAll();
    } else if (selectedPieceId === tappedPieceId) {
      selectedPieceId = null;
      audio.playTap();
      renderAll();
    } else if (tappedPl.kind === 'board' && !tappedPl.locked) {
      // Swap selected piece onto this board piece's slot!
      placePieceOnSlot(selectedPieceId, tappedPl.slot);
    } else {
      // Switch selection to another tray piece
      selectedPieceId = tappedPieceId;
      audio.playPickup();
      renderAll();
    }
  };

  window.addEventListener('pointermove', onWindowPointerMove, { passive: true });
  window.addEventListener('pointerup', onWindowPointerUp);
  window.addEventListener('pointercancel', onWindowPointerUp);

  function bindPiecePointerDown(el: HTMLElement, pieceId: number, fromTray: boolean): void {
    el.addEventListener('pointerdown', (e: PointerEvent) => {
      if (solved || (e.button !== 0 && e.pointerType === 'mouse')) return;
      dragState = {
        pieceId,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        isDragging: false,
        fromTray,
        touchLiftY: e.pointerType === 'touch' ? -24 : 0,
        proxyEl: null,
      };
    });
  }

  function renderAll(): void {
    const lockedCount = getLockedCount();
    stepsEl.textContent = String(steps);
    progressEl.textContent = `${lockedCount}/${total}`;
    remainTextEl.textContent =
      lockedCount === total ? '全部归位！' : `待归位 ${total - lockedCount} 块`;

    // 1. Render board pieces
    boardPiecesLayer.innerHTML = '';
    const cellPctW = 100 / gridSize;
    const cellPctH = 100 / gridSize;

    for (const [pieceId, pl] of placements.entries()) {
      if (pl.kind !== 'board') continue;
      if (dragState?.isDragging && dragState.pieceId === pieceId) continue;

      const piece = pieces[pieceId];
      const slotRow = Math.floor(pl.slot / gridSize);
      const slotCol = pl.slot % gridSize;

      const padPctW = cellPctW * piece.padRatio;
      const padPctH = cellPctH * piece.padRatio;

      const wrap = document.createElement('div');
      wrap.className = 'placed-piece';
      if (pl.locked) wrap.classList.add('is-locked');
      else wrap.classList.add('is-tentative');
      if (pl.justSnapped) wrap.classList.add('is-just-snapped');
      if (selectedPieceId === pieceId) wrap.classList.add('is-selected');

      wrap.style.left = `${slotCol * cellPctW - padPctW}%`;
      wrap.style.top = `${slotRow * cellPctH - padPctH}%`;
      wrap.style.width = `${cellPctW + padPctW * 2}%`;
      wrap.style.height = `${cellPctH + padPctH * 2}%`;

      const c = document.createElement('canvas');
      c.width = piece.canvas.width;
      c.height = piece.canvas.height;
      c.getContext('2d')!.drawImage(piece.canvas, 0, 0);
      wrap.appendChild(c);

      if (!pl.locked) {
        bindPiecePointerDown(wrap, pieceId, false);
      }

      boardPiecesLayer.appendChild(wrap);
    }

    // 2. Render tray pieces
    trayScroll.innerHTML = '';
    let trayCount = 0;
    for (const id of trayOrder) {
      const pl = placements.get(id)!;
      if (pl.kind !== 'tray') continue;
      if (dragState?.isDragging && dragState.pieceId === id) continue;

      trayCount++;
      const piece = pieces[id];
      const slotEl = document.createElement('div');
      slotEl.className = 'tray-piece-slot';
      if (selectedPieceId === id) slotEl.classList.add('is-selected');

      const c = document.createElement('canvas');
      c.width = piece.canvas.width;
      c.height = piece.canvas.height;
      c.getContext('2d')!.drawImage(piece.canvas, 0, 0);
      // Slight organic tilt in tray for physical charm
      const tilt = ((id * 37) % 11) - 5;
      c.style.transform = `rotate(${tilt}deg)`;
      slotEl.appendChild(c);

      bindPiecePointerDown(slotEl, id, true);
      trayScroll.appendChild(slotEl);
    }

    if (trayCount === 0 && lockedCount < total) {
      const hint = document.createElement('div');
      hint.className = 'tray-empty-hint';
      hint.textContent = '点选或拖动棋盘上未锁定的拼图块调整位置';
      trayScroll.appendChild(hint);
    }
  }

  renderAll();

  return () => {
    window.clearInterval(timerId);
    if (peekTimeout !== null) window.clearTimeout(peekTimeout);
    if (dragState?.proxyEl) dragState.proxyEl.remove();
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp);
    window.removeEventListener('pointercancel', onWindowPointerUp);
  };
}
