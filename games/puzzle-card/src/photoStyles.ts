import type { StyleId } from './types.ts';

export const PHOTO_BASE_WIDTH = 720;
export const PHOTO_BASE_HEIGHT = 960;

/**
 * Center-crops any source HTMLImageElement into a clean 3:4 portrait canvas (720x960).
 */
export function cropImageToPortrait(
  img: HTMLImageElement,
  width = PHOTO_BASE_WIDTH,
  height = PHOTO_BASE_HEIGHT
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const targetAspect = width / height;
  const srcAspect = srcW / srcH;

  let sx = 0;
  let sy = 0;
  let sw = srcW;
  let sh = srcH;

  if (srcAspect > targetAspect) {
    sw = srcH * targetAspect;
    sx = (srcW - sw) * 0.5;
  } else {
    sh = srcW / targetAspect;
    sy = (srcH - sh) * 0.5;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  return canvas;
}

/**
 * Applies physical surface grading & micro-texture for the 5 PRD styles:
 * - matte: velvety lifted shadows + fine museum cotton tooth
 * - grain: warm Kodak Portra tone + organic silver-halide film grain + vignette
 * - lustre: silk brocade weave + pearlescent diagonal champagne sheen ("浮光锦")
 * - holo: pastel prism foil iridescence + specular highlights
 * - soft-pink: creamy sakura rose warmth + airy vignette
 */
export function applyStyleFinish(
  rawCanvas: HTMLCanvasElement,
  style: StyleId
): HTMLCanvasElement {
  const w = rawCanvas.width;
  const h = rawCanvas.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;

  ctx.drawImage(rawCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  // Deterministic pseudo-random generator for clean, repeatable film/paper grain
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    if (style === 'matte') {
      // Soft lifted shadow floor + muted velvety highlights
      r = 22 + r * 0.86 + 4;
      g = 20 + g * 0.85 + 2;
      b = 19 + b * 0.84;
      const tooth = (rand() - 0.5) * 6;
      r += tooth;
      g += tooth;
      b += tooth;
    } else if (style === 'grain') {
      // Warm Portra film tone + pronounced organic silver grain
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = r * 1.05 + 8;
      g = g * 1.01 + 3;
      b = b * 0.91 - 2;
      // Grain is strongest in midtones
      const midWeight = 1 - Math.abs(lum / 255 - 0.5) * 1.3;
      const grain = (rand() - 0.5) * 28 * Math.max(0.25, midWeight);
      r += grain;
      g += grain;
      b += grain;
    } else if (style === 'lustre') {
      // Luminous warm pearl contrast
      r = Math.min(255, r * 1.03 + 5);
      g = Math.min(255, g * 1.02 + 4);
      b = Math.min(255, b * 1.01 + 4);
    } else if (style === 'soft-pink') {
      // Creamy sakura pink atmosphere
      r = r * 1.04 + 12;
      g = g * 0.99 + 5;
      b = b * 1.01 + 9;
      // Soft lift
      r = 10 + r * 0.95;
      g = 8 + g * 0.95;
      b = 10 + b * 0.95;
    } else if (style === 'holo') {
      // Crisp bright base for holographic foil overlay
      r = r * 1.02 + 4;
      g = g * 1.03 + 5;
      b = b * 1.04 + 7;
    }

    d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }

  ctx.putImageData(imgData, 0, 0);

  // Surface overlays per style
  if (style === 'lustre') {
    // Subtle silk brocade woven micro-lines + pearlescent diagonal ribbon
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, 'rgba(255, 244, 232, 0.05)');
    grad.addColorStop(0.36, 'rgba(255, 250, 244, 0.42)');
    grad.addColorStop(0.5, 'rgba(255, 224, 232, 0.28)');
    grad.addColorStop(0.68, 'rgba(255, 252, 245, 0.36)');
    grad.addColorStop(1, 'rgba(245, 230, 220, 0.06)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Fine woven brocade silk threads
    ctx.globalCompositeOperation = 'overlay';
    ctx.strokeStyle = 'rgba(255, 252, 246, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 0; y < h; y += 5) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.restore();
  } else if (style === 'holo') {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    const holoGrad = ctx.createLinearGradient(0, h * 0.1, w, h * 0.9);
    holoGrad.addColorStop(0, 'rgba(255, 192, 218, 0.38)');
    holoGrad.addColorStop(0.28, 'rgba(255, 242, 182, 0.34)');
    holoGrad.addColorStop(0.54, 'rgba(176, 244, 238, 0.40)');
    holoGrad.addColorStop(0.78, 'rgba(208, 196, 255, 0.36)');
    holoGrad.addColorStop(1, 'rgba(255, 205, 226, 0.34)');
    ctx.fillStyle = holoGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle specular diagonal foil band
    ctx.globalCompositeOperation = 'screen';
    const sheen = ctx.createLinearGradient(0, 0, w, h * 0.75);
    sheen.addColorStop(0.38, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.49, 'rgba(255,255,255,0.16)');
    sheen.addColorStop(0.58, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  } else if (style === 'grain') {
    // Subtle warm film edge vignette
    ctx.save();
    const vig = ctx.createRadialGradient(
      w * 0.5,
      h * 0.5,
      w * 0.32,
      w * 0.5,
      h * 0.5,
      h * 0.72
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(42, 24, 12, 0.24)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  } else if (style === 'soft-pink') {
    // Dreamy sakura edge glow
    ctx.save();
    const glow = ctx.createRadialGradient(
      w * 0.5,
      h * 0.45,
      w * 0.28,
      w * 0.5,
      h * 0.5,
      h * 0.74
    );
    glow.addColorStop(0, 'rgba(255, 240, 245, 0)');
    glow.addColorStop(1, 'rgba(255, 198, 214, 0.24)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  return out;
}
