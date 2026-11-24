import type { EdgeSides, PieceCount, RenderedPiece } from './types.ts';

export const PIECE_PAD_RATIO = 0.28;

/**
 * Generates deterministic complementary interlocking edge signs (+1 tab, -1 blank, 0 flat outer border)
 * for an N x N puzzle grid.
 */
export function generateEdgeMatrix(gridSize: number, seed = 202611): EdgeSides[][] {
  let s = seed;
  const nextSign = (): -1 | 1 => {
    s = (s * 48271) % 2147483647;
    return s % 2 === 0 ? 1 : -1;
  };

  // horizSeam[r][c] is the seam between row r-1 and row r (r = 1..gridSize-1)
  // Sign is from the perspective of row r-1's bottom edge (+1 means tab pointing down)
  const horizSeam: (-1 | 1)[][] = Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => nextSign())
  );

  // vertSeam[r][c] is the seam between col c-1 and col c (c = 1..gridSize-1)
  // Sign is from the perspective of col c-1's right edge (+1 means tab pointing right)
  const vertSeam: (-1 | 1)[][] = Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => nextSign())
  );

  const matrix: EdgeSides[][] = [];
  for (let r = 0; r < gridSize; r++) {
    const row: EdgeSides[] = [];
    for (let c = 0; c < gridSize; c++) {
      row.push({
        top: r === 0 ? 0 : (-horizSeam[r][c] as -1 | 1),
        right: c === gridSize - 1 ? 0 : vertSeam[r][c + 1],
        bottom: r === gridSize - 1 ? 0 : horizSeam[r + 1][c],
        left: c === 0 ? 0 : (-vertSeam[r][c] as -1 | 1),
      });
    }
    matrix.push(row);
  }
  return matrix;
}

/**
 * Appends a single symmetric classic Bezier jigsaw edge from (x0, y0) to (x1, y1).
 * Assumes current path point is already at (x0, y0).
 * @param sign +1 = outward tab, -1 = inward blank, 0 = straight border
 * @param tabSize Absolute perpendicular height of the jigsaw tab in pixels
 */
export function appendJigsawEdge(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  sign: -1 | 0 | 1,
  tabSize: number
): void {
  if (sign === 0) {
    ctx.lineTo(x1, y1);
    return;
  }

  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-3) {
    ctx.lineTo(x1, y1);
    return;
  }

  // Forward unit vector u = (ux, uy)
  const ux = dx / len;
  const uy = dy / len;
  // Outward unit normal for clockwise polygon traversal: n = (uy, -ux)
  const nx = uy * sign * tabSize;
  const ny = -ux * sign * tabSize;

  // Helper to convert (alongFraction t in [0,1], normalMultiple h) -> canvas (x, y)
  const pt = (t: number, h: number): [number, number] => [
    x0 + dx * t + nx * h,
    y0 + dy * t + ny * h,
  ];

  // Classic symmetric omega jigsaw tab profile (4 cubic Bezier segments)
  // Segment 1: shoulder lead-in (0.00 -> 0.37, slight dip for neck pinch)
  const [c1x, c1y] = pt(0.20, 0.0);
  const [c2x, c2y] = pt(0.34, -0.12);
  const [p1x, p1y] = pt(0.38, 0.14);
  ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p1x, p1y);

  // Segment 2: left bulb up to crown (0.38 -> 0.50)
  const [c3x, c3y] = pt(0.31, 0.56);
  const [c4x, c4y] = pt(0.37, 1.0);
  const [p2x, p2y] = pt(0.50, 1.0);
  ctx.bezierCurveTo(c3x, c3y, c4x, c4y, p2x, p2y);

  // Segment 3: crown down right bulb (0.50 -> 0.62) — exact mirror of Segment 2
  const [c5x, c5y] = pt(0.63, 1.0);
  const [c6x, c6y] = pt(0.69, 0.56);
  const [p3x, p3y] = pt(0.62, 0.14);
  ctx.bezierCurveTo(c5x, c5y, c6x, c6y, p3x, p3y);

  // Segment 4: right neck back to corner (0.62 -> 1.00) — exact mirror of Segment 1
  const [c7x, c7y] = pt(0.66, -0.12);
  const [c8x, c8y] = pt(0.80, 0.0);
  ctx.bezierCurveTo(c7x, c7y, c8x, c8y, x1, y1);
}

/**
 * Traces a complete closed clockwise jigsaw piece path inside (x, y, w, h)
 * with subtle rounded outer corners when touching the puzzle perimeter.
 */
export function tracePiecePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  edges: EdgeSides,
  outerRadius = 8
): void {
  const tabSize = Math.min(w, h) * 0.215;

  const tlR = edges.top === 0 && edges.left === 0 ? outerRadius : 0;
  const trR = edges.top === 0 && edges.right === 0 ? outerRadius : 0;
  const brR = edges.bottom === 0 && edges.right === 0 ? outerRadius : 0;
  const blR = edges.bottom === 0 && edges.left === 0 ? outerRadius : 0;

  ctx.beginPath();
  ctx.moveTo(x + tlR, y);

  // Top edge: (x + tlR, y) -> (x + w - trR, y)
  if (edges.top === 0) {
    ctx.lineTo(x + w - trR, y);
  } else {
    appendJigsawEdge(ctx, x, y, x + w, y, edges.top, tabSize);
  }
  if (trR > 0) ctx.quadraticCurveTo(x + w, y, x + w, y + trR);

  // Right edge: (x + w, y + trR) -> (x + w, y + h - brR)
  if (edges.right === 0) {
    ctx.lineTo(x + w, y + h - brR);
  } else {
    appendJigsawEdge(ctx, x + w, y, x + w, y + h, edges.right, tabSize);
  }
  if (brR > 0) ctx.quadraticCurveTo(x + w, y + h, x + w - brR, y + h);

  // Bottom edge: (x + w - brR, y + h) -> (x + blR, y + h)
  if (edges.bottom === 0) {
    ctx.lineTo(x + blR, y + h);
  } else {
    appendJigsawEdge(ctx, x + w, y + h, x, y + h, edges.bottom, tabSize);
  }
  if (blR > 0) ctx.quadraticCurveTo(x, y + h, x, y + h - blR);

  // Left edge: (x, y + h - blR) -> (x, y + tlR)
  if (edges.left === 0) {
    ctx.lineTo(x, y + tlR);
  } else {
    appendJigsawEdge(ctx, x, y + h, x, y, edges.left, tabSize);
  }
  if (tlR > 0) ctx.quadraticCurveTo(x, y, x + tlR, y);

  ctx.closePath();
}

/**
 * Draws embossed interlocking puzzle seam lines across a full puzzle rectangle (x, y, w, h).
 * Used on the target board guide, celebration view, and final shareable postcard!
 */
export function drawEmbossedSeamGrid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  edgeMatrix: EdgeSides[][],
  options: {
    shadowColor?: string;
    highlightColor?: string;
    lineWidth?: number;
  } = {}
): void {
  const gridSize = edgeMatrix.length;
  const cellW = w / gridSize;
  const cellH = h / gridSize;
  const tabSize = Math.min(cellW, cellH) * 0.215;

  const shadowColor = options.shadowColor ?? 'rgba(28, 18, 14, 0.24)';
  const highlightColor = options.highlightColor ?? 'rgba(255, 255, 255, 0.42)';
  const lw = options.lineWidth ?? Math.max(1.1, w * 0.0022);

  const traceInternalSeams = () => {
    ctx.beginPath();
    // Horizontal seams (row r = 0..gridSize-2, using bottom edge reversed from right->left or left->right)
    for (let r = 0; r < gridSize - 1; r++) {
      const sy = y + (r + 1) * cellH;
      for (let c = 0; c < gridSize; c++) {
        const sx0 = x + (c + 1) * cellW;
        const sx1 = x + c * cellW;
        ctx.moveTo(sx0, sy);
        appendJigsawEdge(ctx, sx0, sy, sx1, sy, edgeMatrix[r][c].bottom, tabSize);
      }
    }
    // Vertical seams (col c = 0..gridSize-2, using right edge top->bottom)
    for (let c = 0; c < gridSize - 1; c++) {
      const sx = x + (c + 1) * cellW;
      for (let r = 0; r < gridSize; r++) {
        const sy0 = y + r * cellH;
        const sy1 = y + (r + 1) * cellH;
        ctx.moveTo(sx, sy0);
        appendJigsawEdge(ctx, sx, sy0, sx, sy1, edgeMatrix[r][c].right, tabSize);
      }
    }
  };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Recessed shadow line
  traceInternalSeams();
  ctx.strokeStyle = shadowColor;
  ctx.lineWidth = lw;
  ctx.stroke();

  // Subtle specular bevel highlight shifted +0.8px
  ctx.translate(lw * 0.55, lw * 0.55);
  traceInternalSeams();
  ctx.strokeStyle = highlightColor;
  ctx.lineWidth = lw * 0.78;
  ctx.stroke();

  ctx.restore();
}

/**
 * Slices a styled 720x960 photo canvas into N*N pre-rendered 3D beveled jigsaw piece canvases.
 */
export function slicePhotoIntoPieces(
  styledPhoto: HTMLCanvasElement,
  pieceCount: PieceCount,
  edgeMatrix: EdgeSides[][]
): RenderedPiece[] {
  const gridSize = Math.round(Math.sqrt(pieceCount));
  const fullW = styledPhoto.width;
  const fullH = styledPhoto.height;
  const cellW = fullW / gridSize;
  const cellH = fullH / gridSize;

  const padX = Math.ceil(cellW * PIECE_PAD_RATIO);
  const padY = Math.ceil(cellH * PIECE_PAD_RATIO);
  const canvasW = Math.ceil(cellW + padX * 2);
  const canvasH = Math.ceil(cellH + padY * 2);

  const pieces: RenderedPiece[] = [];
  let id = 0;

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const edges = edgeMatrix[r][c];
      const pCanvas = document.createElement('canvas');
      pCanvas.width = canvasW;
      pCanvas.height = canvasH;
      const ctx = pCanvas.getContext('2d')!;

      // Piece cell origin inside pCanvas is (padX, padY)
      ctx.save();
      tracePiecePath(ctx, padX, padY, cellW, cellH, edges, 10);
      ctx.clip();

      // Draw photo shifted so cell (r, c) aligns with (padX, padY)
      ctx.drawImage(styledPhoto, padX - c * cellW, padY - r * cellH);

      // 3D Cardboard Bevel: top-left specular inner highlight
      ctx.save();
      ctx.translate(1.2, 1.2);
      tracePiecePath(ctx, padX, padY, cellW, cellH, edges, 10);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.58)';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.restore();

      // 3D Cardboard Bevel: bottom-right die-cut thickness shadow
      ctx.save();
      ctx.translate(-1.1, -1.1);
      tracePiecePath(ctx, padX, padY, cellW, cellH, edges, 10);
      ctx.strokeStyle = 'rgba(30, 18, 12, 0.34)';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.restore();

      ctx.restore();

      // Crisp hairline outline so light edges never vanish against white backgrounds
      ctx.save();
      tracePiecePath(ctx, padX, padY, cellW, cellH, edges, 10);
      ctx.strokeStyle = 'rgba(36, 24, 18, 0.16)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      pieces.push({
        id: id++,
        row: r,
        col: c,
        edges,
        canvas: pCanvas,
        padRatio: PIECE_PAD_RATIO,
      });
    }
  }

  return pieces;
}
