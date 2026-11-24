import { triggerHaptic, type TactileAudio } from '@minigame/xhs-mini-sdk';
import { appendJigsawEdge, drawEmbossedSeamGrid } from './jigsaw.ts';
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

interface FallingBody {
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

/**
 * Runs the 3-act ritual cutting & falling choreography (~3.9s):
 * 1. Settle photo on upper frame + progressive style finish bloom + interlocking blade cuts
 * 2. Satisfying die-press pop & separation revealing the recessed empty puzzle board underneath
 * 3. Gravity cascade fall: pieces peel off row-by-row, tumble down, and bounce into the lower tray
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
  const viewH = 560;
  stageCanvas.width = Math.round(viewW * dpr);
  stageCanvas.height = Math.round(viewH * dpr);
  const ctx = stageCanvas.getContext('2d')!;

  const gridSize = edgeMatrix.length;
  const horizCount = gridSize - 1;
  const vertCount = gridSize - 1;
  const totalCuts = horizCount + vertCount;

  // Upper puzzle board geometry (matches gameplay layout visually!)
  const cardW = 252;
  const cardH = 336;
  const cardX = (viewW - cardW) * 0.5;
  const cardY = 20;
  const cellW = cardW / gridSize;
  const cellH = cardH / gridSize;
  const tabSize = Math.min(cellW, cellH) * 0.215;

  // Lower catch-tray geometry
  const trayX = 14;
  const trayY = 418;
  const trayW = viewW - 28;
  const trayH = 124;

  // Pre-render the recessed empty guide board so it's revealed underneath falling pieces
  const guideOffscreen = document.createElement('canvas');
  guideOffscreen.width = Math.round(cardW * 2);
  guideOffscreen.height = Math.round(cardH * 2);
  {
    const gctx = guideOffscreen.getContext('2d')!;
    gctx.scale(2, 2);
    gctx.fillStyle = '#EAE3D9';
    gctx.fillRect(0, 0, cardW, cardH);
    gctx.save();
    gctx.globalAlpha = 0.22;
    gctx.drawImage(styledPhoto, 0, 0, cardW, cardH);
    gctx.restore();
    drawEmbossedSeamGrid(gctx, 0, 0, cardW, cardH, edgeMatrix, {
      shadowColor: 'rgba(42, 28, 20, 0.20)',
      highlightColor: 'rgba(255, 255, 255, 0.48)',
      lineWidth: 1.4,
    });
  }

  // Deterministic pseudo-random helper for repeatable organic motion
  let rngState = 20261124;
  const rand = (min: number, max: number) => {
    rngState = (rngState * 16807) % 2147483647;
    const t = (rngState - 1) / 2147483646;
    return min + t * (max - min);
  };

  const bodies: FallingBody[] = pieces.map((p, idx) => {
    const startCx = cardX + (p.col + 0.5) * cellW;
    const startCy = cardY + (p.row + 0.5) * cellH;
    const normX = (p.col + 0.5) / gridSize - 0.5;
    const normY = (p.row + 0.5) / gridSize - 0.5;

    // Pop outward offsets
    const popDx = normX * 22 + rand(-3, 3);
    const popDy = normY * 22 + rand(-3, 3);
    const popRot = rand(-0.08, 0.08);

    // Bottom rows detach first, cascading upward like domino tiles
    const rowFromBottom = gridSize - 1 - p.row;
    const releaseDelayMs = rowFromBottom * 82 + rand(0, 95);

    // Spread landing positions across the width of the lower tray
    const slotSpreadX =
      trayX + 46 + ((idx * 7 + p.col * 3) % pieces.length) * ((trayW - 92) / Math.max(1, pieces.length - 1));
    const driftVx = (slotSpreadX - (startCx + popDx)) * 1.45 + rand(-28, 28);

    return {
      x: startCx,
      y: startCy,
      vx: driftVx,
      vy: rand(-95, -25), // lively little upward hop as it peels off the board!
      rot: 0,
      omega: rand(-3.1, 3.1),
      scale: 1,
      popDx,
      popDy,
      popRot,
      releaseDelayMs,
      released: false,
      floorY: trayY + trayH * 0.56 + rand(-14, 16),
      bounceCount: 0,
    };
  });

  // Draw order during fall so lower/later pieces layer naturally
  const drawOrder = pieces.map((_, i) => i);

  const SETTLE_END = 260;
  const CUTS_END = 2020;
  const POP_END = 2360;
  const TOTAL_END = 4350;
  const GRAVITY = 1760; // px/s^2

  let rafId = 0;
  let cancelled = false;
  let lastTriggeredCut = -1;
  let popTriggered = false;
  let fallStatusTriggered = false;
  let lastLandSoundAt = 0;
  const startTime = performance.now();
  let prevTime = startTime;

  const drawBladeNib = (bx: number, by: number, angleRad: number) => {
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(angleRad);

    const glint = ctx.createRadialGradient(0, 0, 1, 0, 0, 18);
    glint.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
    glint.addColorStop(0.45, 'rgba(255, 218, 224, 0.58)');
    glint.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glint;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();

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

  const drawBoardFrame = (scale = 1) => {
    ctx.save();
    ctx.translate(cardX + cardW * 0.5, cardY + cardH * 0.5);
    ctx.scale(scale, scale);
    ctx.translate(-(cardX + cardW * 0.5), -(cardY + cardH * 0.5));

    // Outer white gallery frame
    ctx.save();
    ctx.shadowColor = 'rgba(28, 18, 12, 0.13)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(cardX - 8, cardY - 8, cardW + 16, cardH + 16, 15);
    ctx.fill();
    ctx.restore();

    // Recessed empty puzzle guide underneath
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 9);
    ctx.clip();
    ctx.drawImage(guideOffscreen, cardX, cardY, cardW, cardH);
    ctx.restore();

    ctx.restore();
  };

  const drawCatchTray = (alpha: number) => {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.fillStyle = 'rgba(237, 230, 220, 0.92)';
    ctx.strokeStyle = 'rgba(46, 34, 28, 0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(trayX, trayY, trayW, trayH, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(92, 76, 68, 0.55)';
    ctx.font = '500 11px "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('散落拼图池', trayX + 14, trayY + 20);

    ctx.restore();
  };

  const renderFrame = (now: number) => {
    if (cancelled) return;
    const elapsed = now - startTime;
    const dt = Math.min(0.034, Math.max(0.001, (now - prevTime) / 1000));
    prevTime = now;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, viewW, viewH);

    // Tray fades in during late slicing so pieces have a physical home to fall into
    const trayAlpha = Math.max(0, Math.min(1, (elapsed - 1200) / 650));
    drawCatchTray(trayAlpha);

    if (elapsed < CUTS_END) {
      // Act 1: Slicing across the framed photo
      const settleT = Math.min(1, elapsed / SETTLE_END);
      const scale = 0.96 + 0.04 * easeOutCubic(settleT);
      drawBoardFrame(scale);

      ctx.save();
      ctx.translate(cardX + cardW * 0.5, cardY + cardH * 0.5);
      ctx.scale(scale, scale);
      ctx.translate(-(cardX + cardW * 0.5), -(cardY + cardH * 0.5));

      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, 9);
      ctx.clip();

      ctx.drawImage(rawPhoto, cardX, cardY, cardW, cardH);

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

      let bladeTip: { x: number; y: number; angle: number } | null = null;

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

        for (let k = 0; k <= activeCutIdx; k++) {
          const frac = k < activeCutIdx ? 1 : easeOutCubic(activeCutFrac);
          const isHoriz = k < horizCount;

          ctx.save();
          if (isHoriz) {
            const r = k;
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
            ctx.lineWidth = 2.0;
            ctx.stroke();

            ctx.translate(0, 1);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
            ctx.lineWidth = 1.1;
            ctx.stroke();

            if (k === activeCutIdx && frac < 0.99) {
              bladeTip = { x: cardX + clipW, y: sy, angle: 0 };
            }
          } else {
            const c = k - horizCount;
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
            ctx.lineWidth = 2.0;
            ctx.stroke();

            ctx.translate(1, 0);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
            ctx.lineWidth = 1.1;
            ctx.stroke();

            if (k === activeCutIdx && frac < 0.99) {
              bladeTip = { x: sx, y: cardY + clipH, angle: Math.PI * 0.5 };
            }
          }
          ctx.restore();
        }
      }

      ctx.restore(); // end photo clip & scale

      if (bladeTip) {
        drawBladeNib(bladeTip.x, bladeTip.y, bladeTip.angle);
      }
    } else {
      // Act 2 & Act 3: Pop detach + Gravity cascade fall into lower tray!
      drawBoardFrame(1);

      if (!popTriggered) {
        popTriggered = true;
        audio.playScatter(pieces.length);
        triggerHaptic('medium');
        onStatusText?.('咔嚓！拼图块已分离…');
      }

      const popRaw = Math.min(1, (elapsed - CUTS_END) / (POP_END - CUTS_END));
      const popSpring = easeOutBack(popRaw);
      const fallElapsed = elapsed - POP_END;

      if (fallElapsed > 0 && !fallStatusTriggered) {
        fallStatusTriggered = true;
        onStatusText?.('哗啦啦～拼图掉落散开，准备开拼！');
      }

      for (const idx of drawOrder) {
        const p = pieces[idx];
        const b = bodies[idx];
        const startCx = cardX + (p.col + 0.5) * cellW;
        const startCy = cardY + (p.row + 0.5) * cellH;

        let drawCx: number;
        let drawCy: number;
        let drawRot: number;
        let drawScale: number;
        let shadowElevation: number;

        if (fallElapsed < b.releaseDelayMs) {
          // Still in popped-out hover pose waiting for its cascade turn
          drawCx = startCx + b.popDx * popSpring;
          drawCy = startCy + b.popDy * popSpring;
          drawRot = b.popRot * popSpring;
          drawScale = 1 + 0.035 * popSpring;
          shadowElevation = 10 * popRaw + 3;
        } else {
          if (!b.released) {
            b.released = true;
            b.x = startCx + b.popDx;
            b.y = startCy + b.popDy;
            b.rot = b.popRot;
            b.scale = 1.035;
          }

          // Integrate gravity & air motion
          b.vy += GRAVITY * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.rot += b.omega * dt;

          // Gently scale piece to match tray slot proportions as it descends
          const fallRatio = Math.max(
            0,
            Math.min(1, (b.y - startCy) / Math.max(1, b.floorY - startCy))
          );
          const targetTrayScale = Math.min(0.92, 54 / Math.max(cellW, cellH));
          b.scale = 1.035 + (targetTrayScale - 1.035) * fallRatio;

          // Tray side boundaries
          const minX = trayX + 38;
          const maxX = trayX + trayW - 38;
          if (b.x < minX) {
            b.x = minX;
            b.vx = Math.abs(b.vx) * 0.55;
          } else if (b.x > maxX) {
            b.x = maxX;
            b.vx = -Math.abs(b.vx) * 0.55;
          }

          // Tray floor collision & damped cardboard bounce
          if (b.y >= b.floorY && b.vy > 0) {
            b.y = b.floorY;
            const impactSpeed = b.vy;
            if (impactSpeed > 115 && now - lastLandSoundAt > 44) {
              lastLandSoundAt = now;
              const intensity = Math.min(1, impactSpeed / 780);
              const pitchJitter = ((idx * 17) % 10) / 10 - 0.4;
              audio.playPieceLand(intensity, pitchJitter);
              if (b.bounceCount === 0 && idx % 3 === 0) {
                triggerHaptic('light');
              }
            }

            b.bounceCount += 1;
            if (impactSpeed > 90 && b.bounceCount <= 2) {
              b.vy = -impactSpeed * 0.34;
              b.vx *= 0.65;
              b.omega *= 0.52;
            } else {
              b.vy = 0;
              b.vx *= 0.78;
              b.omega *= 0.65;
            }
          }

          drawCx = b.x;
          drawCy = b.y;
          drawRot = b.rot;
          drawScale = b.scale;
          shadowElevation = b.y >= b.floorY - 2 && Math.abs(b.vy) < 40 ? 5 : 14;
        }

        const padW = cellW * p.padRatio;
        const padH = cellH * p.padRatio;
        const drawW = cellW + padW * 2;
        const drawH = cellH + padH * 2;

        ctx.save();
        ctx.translate(drawCx, drawCy);
        ctx.rotate(drawRot);
        ctx.scale(drawScale, drawScale);
        ctx.shadowColor = 'rgba(24, 16, 12, 0.25)';
        ctx.shadowBlur = shadowElevation;
        ctx.shadowOffsetY = shadowElevation * 0.45;
        ctx.drawImage(p.canvas, -drawW * 0.5, -drawH * 0.5, drawW, drawH);
        ctx.restore();
      }
    }

    ctx.restore();

    if (elapsed >= TOTAL_END) {
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
