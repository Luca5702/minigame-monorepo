import { triggerHaptic, type TactileAudio } from '@minigame/xhs-mini-sdk';
import { appendJigsawEdge } from './jigsaw.ts';
import type { EdgeSides, RenderedPiece } from './types.ts';

export interface CuttingAnimationOptions {
  stageCanvas: HTMLCanvasElement;
  rawPhoto: HTMLCanvasElement;
  styledPhoto: HTMLCanvasElement;
  edgeMatrix: EdgeSides[][];
  pieces: RenderedPiece[];
  audio: TactileAudio;
  onStatusText?: (text: string) => void;
  onComplete: () => void;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/**
 * Runs the 3.4s ritual cutting animation:
 * 1. Settle photo on craft mat
 * 2. Progressive style finish bloom + interlocking blade cuts with Foley slice audio
 * 3. Satisfying die-press pop & outward scatter of all jigsaw pieces
 */
export function startCuttingAnimation(opts: CuttingAnimationOptions): () => void {
  const {
    stageCanvas,
    rawPhoto,
    styledPhoto,
    edgeMatrix,
    pieces,
    audio,
    onStatusText,
    onComplete,
  } = opts;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewW = 360;
  const viewH = 480;
  stageCanvas.width = Math.round(viewW * dpr);
  stageCanvas.height = Math.round(viewH * dpr);
  const ctx = stageCanvas.getContext('2d')!;

  const gridSize = edgeMatrix.length;
  const horizCount = gridSize - 1;
  const vertCount = gridSize - 1;
  const totalCuts = horizCount + vertCount;

  // Card rect inside view (leaves room around perimeter for pieces to spring outward!)
  const cardW = 264;
  const cardH = 352;
  const cardX = (viewW - cardW) * 0.5;
  const cardY = (viewH - cardH) * 0.5;
  const cellW = cardW / gridSize;
  const cellH = cardH / gridSize;
  const tabSize = Math.min(cellW, cellH) * 0.215;

  // Deterministic organic scatter targets per piece
  const scatterTargets = pieces.map((p, idx) => {
    const normX = (p.col + 0.5) / gridSize - 0.5;
    const normY = (p.row + 0.5) / gridSize - 0.5;
    const jitterAngle = ((idx * 137.5) % 360) * (Math.PI / 180);
    const dx = normX * 42 + Math.cos(jitterAngle) * 7;
    const dy = normY * 46 + Math.sin(jitterAngle) * 7;
    const rot = (((idx * 53) % 15) - 7) * (Math.PI / 180);
    return { dx, dy, rot };
  });

  const SETTLE_END = 320;
  const CUTS_END = 2280;
  const SCATTER_END = 3380;

  let rafId = 0;
  let cancelled = false;
  let lastTriggeredCut = -1;
  let scatterTriggered = false;
  const startTime = performance.now();

  const drawBladeNib = (bx: number, by: number, angleRad: number) => {
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(angleRad);

    // Specular glint halo
    const glint = ctx.createRadialGradient(0, 0, 1, 0, 0, 18);
    glint.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    glint.addColorStop(0.45, 'rgba(255, 218, 224, 0.55)');
    glint.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glint;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();

    // Minimalist precision craft blade silhouette
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = 'rgba(40, 28, 24, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(-14, -6);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-14, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  };

  const renderFrame = (now: number) => {
    if (cancelled) return;
    const elapsed = now - startTime;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, viewW, viewH);

    // Subtle craft mat corner crop marks
    ctx.strokeStyle = 'rgba(42, 30, 24, 0.16)';
    ctx.lineWidth = 1;
    const tick = 10;
    const m = 8;
    ctx.beginPath();
    // TL
    ctx.moveTo(cardX - m, cardY - m + tick);
    ctx.lineTo(cardX - m, cardY - m);
    ctx.lineTo(cardX - m + tick, cardY - m);
    // TR
    ctx.moveTo(cardX + cardW + m - tick, cardY - m);
    ctx.lineTo(cardX + cardW + m, cardY - m);
    ctx.lineTo(cardX + cardW + m, cardY - m + tick);
    // BL
    ctx.moveTo(cardX - m, cardY + cardH + m - tick);
    ctx.lineTo(cardX - m, cardY + cardH + m);
    ctx.lineTo(cardX - m + tick, cardY + cardH + m);
    // BR
    ctx.moveTo(cardX + cardW + m - tick, cardY + cardH + m);
    ctx.lineTo(cardX + cardW + m, cardY + cardH + m);
    ctx.lineTo(cardX + cardW + m, cardY + cardH + m - tick);
    ctx.stroke();

    if (elapsed < CUTS_END) {
      // Phase 1 & 2: Whole card + progressive style filter + live blade carving
      const settleT = Math.min(1, elapsed / SETTLE_END);
      const scale = 0.96 + 0.04 * easeOutCubic(settleT);

      ctx.save();
      ctx.translate(viewW * 0.5, viewH * 0.5);
      ctx.scale(scale, scale);
      ctx.translate(-viewW * 0.5, -viewH * 0.5);

      // White postcard frame shadow
      ctx.save();
      ctx.shadowColor = 'rgba(28, 18, 12, 0.16)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 10;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(cardX - 8, cardY - 8, cardW + 16, cardH + 16, 14);
      ctx.fill();
      ctx.restore();

      // Clip photo area
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, 9);
      ctx.clip();

      // Base raw photo
      ctx.drawImage(rawPhoto, cardX, cardY, cardW, cardH);

      // Style finish bloom wipe during cuts
      const cutPhaseProgress = Math.max(
        0,
        Math.min(1, (elapsed - SETTLE_END) / (CUTS_END - SETTLE_END))
      );
      if (cutPhaseProgress > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, cutPhaseProgress * 1.18);
        ctx.drawImage(styledPhoto, cardX, cardY, cardW, cardH);
        ctx.restore();
      }

      // Draw each completed & active jigsaw cut line
      if (elapsed >= SETTLE_END) {
        const cutFloat = cutPhaseProgress * totalCuts;
        const activeCutIdx = Math.min(totalCuts - 1, Math.floor(cutFloat));
        const activeCutFrac = Math.min(1, cutFloat - activeCutIdx);

        if (activeCutIdx > lastTriggeredCut) {
          lastTriggeredCut = activeCutIdx;
          audio.playSlice(activeCutIdx, totalCuts);
          triggerHaptic('light');
          onStatusText?.(`正在精密切割拼图 (${activeCutIdx + 1}/${totalCuts})…`);
        }

        let bladeTip: { x: number; y: number; angle: number } | null = null;

        for (let k = 0; k <= activeCutIdx; k++) {
          const frac = k < activeCutIdx ? 1 : easeOutCubic(activeCutFrac);
          const isHoriz = k < horizCount;

          ctx.save();
          if (isHoriz) {
            const r = k; // seam below row r
            const sy = cardY + (r + 1) * cellH;
            const clipW = cardW * frac;
            ctx.beginPath();
            ctx.rect(cardX - 10, sy - tabSize * 1.6, clipW + 20, tabSize * 3.2);
            ctx.clip();

            ctx.beginPath();
            for (let c = 0; c < gridSize; c++) {
              const sx0 = cardX + (c + 1) * cellW;
              const sx1 = cardX + c * cellW;
              ctx.moveTo(sx0, sy);
              appendJigsawEdge(ctx, sx0, sy, sx1, sy, edgeMatrix[r][c].bottom, tabSize);
            }
            ctx.strokeStyle = 'rgba(26, 16, 12, 0.52)';
            ctx.lineWidth = 2.1;
            ctx.stroke();

            ctx.translate(0, 1);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            if (k === activeCutIdx && frac < 0.99) {
              bladeTip = { x: cardX + clipW, y: sy, angle: 0 };
            }
          } else {
            const c = k - horizCount; // seam right of col c
            const sx = cardX + (c + 1) * cellW;
            const clipH = cardH * frac;
            ctx.beginPath();
            ctx.rect(sx - tabSize * 1.6, cardY - 10, tabSize * 3.2, clipH + 20);
            ctx.clip();

            ctx.beginPath();
            for (let r = 0; r < gridSize; r++) {
              const sy0 = cardY + r * cellH;
              const sy1 = cardY + (r + 1) * cellH;
              ctx.moveTo(sx, sy0);
              appendJigsawEdge(ctx, sx, sy0, sx, sy1, edgeMatrix[r][c].right, tabSize);
            }
            ctx.strokeStyle = 'rgba(26, 16, 12, 0.52)';
            ctx.lineWidth = 2.1;
            ctx.stroke();

            ctx.translate(1, 0);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            if (k === activeCutIdx && frac < 0.99) {
              bladeTip = { x: sx, y: cardY + clipH, angle: Math.PI * 0.5 };
            }
          }
          ctx.restore();
        }

        ctx.restore(); // end photo clip

        if (bladeTip) {
          drawBladeNib(bladeTip.x, bladeTip.y, bladeTip.angle);
        }
      } else {
        ctx.restore();
      }

      ctx.restore();
    } else {
      // Phase 3: Die-cut pieces pop & spring-scatter outward!
      if (!scatterTriggered) {
        scatterTriggered = true;
        audio.playScatter(pieces.length);
        triggerHaptic('medium');
        onStatusText?.('切割完成！准备亲手拼回…');
      }

      const scatterRaw = Math.min(1, (elapsed - CUTS_END) / 680);
      const springT = easeOutBack(scatterRaw);

      for (let i = 0; i < pieces.length; i++) {
        const p = pieces[i];
        const target = scatterTargets[i];

        const baseCellX = cardX + p.col * cellW;
        const baseCellY = cardY + p.row * cellH;
        const padW = cellW * p.padRatio;
        const padH = cellH * p.padRatio;
        const drawW = cellW + padW * 2;
        const drawH = cellH + padH * 2;

        const cx = baseCellX + cellW * 0.5 + target.dx * springT;
        const cy = baseCellY + cellH * 0.5 + target.dy * springT;
        const rot = target.rot * springT;
        const popScale = 1 + 0.03 * Math.sin(scatterRaw * Math.PI);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        ctx.scale(popScale, popScale);
        ctx.shadowColor = 'rgba(24, 16, 12, 0.24)';
        ctx.shadowBlur = 12 * scatterRaw + 4;
        ctx.shadowOffsetY = 5 * scatterRaw + 2;
        ctx.drawImage(p.canvas, -drawW * 0.5, -drawH * 0.5, drawW, drawH);
        ctx.restore();
      }
    }

    ctx.restore();

    if (elapsed >= SCATTER_END) {
      cancelled = true;
      onComplete();
      return;
    }

    rafId = requestAnimationFrame(renderFrame);
  };

  onStatusText?.('安放相纸，准备切割…');
  rafId = requestAnimationFrame(renderFrame);

  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
  };
}
