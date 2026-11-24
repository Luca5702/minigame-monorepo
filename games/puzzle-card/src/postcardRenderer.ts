import { drawEmbossedSeamGrid } from './jigsaw.ts';
import { STYLE_DEFINITIONS } from './presets.ts';
import type { EdgeSides, ExportLayout, PieceCount, StyleId } from './types.ts';

export interface PostcardRenderParams {
  styledPhoto: HTMLCanvasElement;
  edgeMatrix: EdgeSides[][];
  pieceCount: PieceCount;
  styleId: StyleId;
  elapsedSeconds: number;
  steps: number;
  noteText: string;
  layout: ExportLayout;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function formatTodayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const chars = Array.from(text.trim());
  if (chars.length === 0) return [];
  const lines: string[] = [];
  let current = '';
  for (const ch of chars) {
    if (ch === '\n') {
      lines.push(current);
      current = '';
      continue;
    }
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawFrontCardUnit(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  params: PostcardRenderParams,
  showBottomNote: boolean
): void {
  const styleDef =
    STYLE_DEFINITIONS.find((s) => s.id === params.styleId) ?? STYLE_DEFINITIONS[0];

  // Outer card body
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, w * 0.035);
  ctx.fill();

  const pad = w * 0.055;
  const photoW = w - pad * 2;
  const photoH = photoW * (4 / 3);
  const photoX = pad;
  const photoY = pad;

  // Clipped photo + embossed jigsaw seams
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(photoX, photoY, photoW, photoH, w * 0.02);
  ctx.clip();
  ctx.drawImage(params.styledPhoto, photoX, photoY, photoW, photoH);

  drawEmbossedSeamGrid(ctx, photoX, photoY, photoW, photoH, params.edgeMatrix, {
    shadowColor: 'rgba(24, 16, 12, 0.24)',
    highlightColor: 'rgba(255, 255, 255, 0.45)',
    lineWidth: Math.max(1.5, w * 0.0026),
  });
  ctx.restore();

  // Inner subtle border around photo
  ctx.strokeStyle = 'rgba(30, 20, 16, 0.08)';
  ctx.lineWidth = Math.max(1, w * 0.0015);
  ctx.beginPath();
  ctx.roundRect(photoX, photoY, photoW, photoH, w * 0.02);
  ctx.stroke();

  // Bottom margin typography
  const footerTop = photoY + photoH;
  const footerH = h - footerTop;
  const centerY = footerTop + footerH * 0.48;

  const cleanNote = params.noteText.trim();
  if (showBottomNote && cleanNote.length > 0) {
    ctx.fillStyle = styleDef.inkColor;
    ctx.font = `500 ${Math.round(w * 0.036)}px "Songti SC", "STSong", "Noto Serif CJK SC", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = wrapTextLines(ctx, `「 ${cleanNote} 」`, photoW * 0.92);
    const lineH = w * 0.05;
    const startY = centerY - ((lines.length - 1) * lineH) / 2 - footerH * 0.08;
    lines.forEach((ln, idx) => {
      ctx.fillText(ln, w * 0.5, startY + idx * lineH);
    });
  } else {
    ctx.fillStyle = styleDef.inkColor;
    ctx.font = `600 ${Math.round(w * 0.032)}px "Songti SC", "STSong", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('把生活切碎，再亲手拼回来', w * 0.5, centerY - footerH * 0.08);
  }

  // Metadata micro-line at very bottom of card
  ctx.fillStyle = 'rgba(60, 46, 40, 0.52)';
  ctx.font = `500 ${Math.round(w * 0.022)}px ui-monospace, "PingFang SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(
    `${params.pieceCount} PIECES · ${styleDef.name.toUpperCase()} · ${formatDuration(params.elapsedSeconds)} · ${formatTodayStamp()}`,
    w * 0.5,
    h - footerH * 0.2
  );

  ctx.restore();
}

function drawBackCardUnit(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  params: PostcardRenderParams
): void {
  const styleDef =
    STYLE_DEFINITIONS.find((s) => s.id === params.styleId) ?? STYLE_DEFINITIONS[0];

  ctx.save();
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, '#FFFCF7');
  bgGrad.addColorStop(1, '#F6EFE4');
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, w * 0.035);
  ctx.fill();

  const pad = w * 0.085;

  // Postmark top-left
  ctx.fillStyle = 'rgba(54, 40, 34, 0.55)';
  ctx.font = `600 ${Math.round(w * 0.025)}px ui-monospace, monospace`;
  ctx.textAlign = 'left';
  ctx.fillText('HEART PUZZLE POSTCARD', pad, pad + w * 0.03);
  ctx.font = `500 ${Math.round(w * 0.022)}px ui-monospace, monospace`;
  ctx.fillText(`DATE // ${formatTodayStamp()}`, pad, pad + w * 0.068);

  // Stamp top-right with miniature photo inside!
  const stampW = w * 0.16;
  const stampH = stampW * 1.25;
  const stampX = w - pad - stampW;
  const stampY = pad;

  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = styleDef.accentHex;
  ctx.setLineDash([w * 0.008, w * 0.006]);
  ctx.lineWidth = Math.max(1.5, w * 0.003);
  ctx.beginPath();
  ctx.roundRect(stampX, stampY, stampW, stampH, w * 0.01);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);

  const innerM = stampW * 0.1;
  ctx.beginPath();
  ctx.roundRect(
    stampX + innerM,
    stampY + innerM,
    stampW - innerM * 2,
    stampH - innerM * 2,
    w * 0.006
  );
  ctx.clip();
  ctx.drawImage(
    params.styledPhoto,
    stampX + innerM,
    stampY + innerM,
    stampW - innerM * 2,
    stampH - innerM * 2
  );
  ctx.restore();

  // Circular postmark cancellation ring overlapping stamp
  ctx.save();
  ctx.strokeStyle = 'rgba(224, 79, 99, 0.36)';
  ctx.lineWidth = Math.max(1.5, w * 0.0028);
  const ringX = stampX - w * 0.015;
  const ringY = stampY + stampH * 0.72;
  ctx.beginPath();
  ctx.arc(ringX, ringY, w * 0.055, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ringX, ringY, w * 0.042, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Ruled lines in middle
  const lineStartY = h * 0.43;
  const lineGap = h * 0.085;
  ctx.strokeStyle = 'rgba(60, 44, 34, 0.14)';
  ctx.lineWidth = Math.max(1, w * 0.0018);
  ctx.setLineDash([w * 0.008, w * 0.008]);
  for (let i = 0; i < 3; i++) {
    const ly = lineStartY + i * lineGap;
    ctx.beginPath();
    ctx.moveTo(pad, ly);
    ctx.lineTo(w - pad, ly);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Handwritten / serif note text
  const note = params.noteText.trim() || '把细碎的日常，亲手拼成喜欢的生活。';
  ctx.fillStyle = styleDef.inkColor;
  ctx.font = `500 ${Math.round(w * 0.044)}px "Songti SC", "STSong", "Noto Serif CJK SC", serif`;
  ctx.textAlign = 'center';
  const wrapped = wrapTextLines(ctx, note, w - pad * 2.3);
  wrapped.slice(0, 3).forEach((ln, idx) => {
    ctx.fillText(ln, w * 0.5, lineStartY - h * 0.02 + idx * lineGap);
  });

  // Footer achievement badge
  ctx.fillStyle = 'rgba(60, 46, 40, 0.56)';
  ctx.font = `500 ${Math.round(w * 0.025)}px "PingFang SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(
    `亲手拼回 ${params.pieceCount} 块碎片 · 用时 ${formatDuration(params.elapsedSeconds)} · 共 ${params.steps} 步`,
    w * 0.5,
    h - pad * 1.05
  );

  ctx.restore();
}

/**
 * Renders the final 1080x1440 (3:4 Xiaohongshu cover ratio) shareable postcard canvas.
 */
export function renderExportPostcard(params: PostcardRenderParams): HTMLCanvasElement {
  const W = 1080;
  const H = 1440;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const styleDef =
    STYLE_DEFINITIONS.find((s) => s.id === params.styleId) ?? STYLE_DEFINITIONS[0];

  // Studio background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, styleDef.paperColor);
  bg.addColorStop(1, '#EAE2D7');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle ambient warm glow circle
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.42, 60, W * 0.5, H * 0.42, W * 0.65);
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.68)');
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  if (params.layout === 'front') {
    const cardW = 880;
    const cardH = 1240;
    const cx = (W - cardW) * 0.5;
    const cy = (H - cardH) * 0.5;

    ctx.save();
    ctx.shadowColor = 'rgba(28, 18, 12, 0.16)';
    ctx.shadowBlur = 54;
    ctx.shadowOffsetY = 22;
    ctx.translate(cx, cy);
    drawFrontCardUnit(ctx, cardW, cardH, params, true);
    ctx.restore();
  } else if (params.layout === 'back') {
    const cardW = 880;
    const cardH = 1200;
    const cx = (W - cardW) * 0.5;
    const cy = (H - cardH) * 0.5;

    ctx.save();
    ctx.shadowColor = 'rgba(28, 18, 12, 0.16)';
    ctx.shadowBlur = 54;
    ctx.shadowOffsetY = 22;
    ctx.translate(cx, cy);
    drawBackCardUnit(ctx, cardW, cardH, params);
    ctx.restore();
  } else {
    // 'showcase': Dual overlapping front + back cards tailored for Xiaohongshu cover!
    ctx.fillStyle = 'rgba(52, 38, 32, 0.46)';
    ctx.font = '600 24px ui-monospace, "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PUZZLE POSTCARD · 照片拼图卡', W * 0.5, 78);

    // 1. Back card staggered lower-right so stamp, postmark & note peek out clearly
    const backW = 620;
    const backH = 820;
    ctx.save();
    ctx.translate(W * 0.61, H * 0.62);
    ctx.rotate((5.5 * Math.PI) / 180);
    ctx.shadowColor = 'rgba(28, 18, 12, 0.15)';
    ctx.shadowBlur = 44;
    ctx.shadowOffsetY = 18;
    ctx.translate(-backW * 0.5, -backH * 0.5);
    drawBackCardUnit(ctx, backW, backH, params);
    ctx.restore();

    // 2. Front assembled puzzle card upper-left with user's note printed on bottom Polaroid margin
    const frontW = 650;
    const frontH = 930;
    ctx.save();
    ctx.translate(W * 0.39, H * 0.41);
    ctx.rotate((-3.2 * Math.PI) / 180);
    ctx.shadowColor = 'rgba(24, 15, 10, 0.22)';
    ctx.shadowBlur = 56;
    ctx.shadowOffsetY = 24;
    ctx.translate(-frontW * 0.5, -frontH * 0.5);
    drawFrontCardUnit(ctx, frontW, frontH, params, true);
    ctx.restore();

    // Bottom delicate footer caption
    ctx.fillStyle = 'rgba(52, 38, 32, 0.54)';
    ctx.font = '500 23px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `已亲手拼回 ${params.pieceCount} 块拼图 · 表面工艺「${styleDef.name}」`,
      W * 0.5,
      H - 58
    );
  }

  return canvas;
}
