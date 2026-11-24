export interface XhsMiniToolBridge {
  saveImage?: (options: {
    dataUrl?: string;
    filePath?: string;
    base64?: string;
    success?: () => void;
    fail?: (err: unknown) => void;
  }) => Promise<void> | void;
  saveImageToPhotosAlbum?: (options: {
    filePath?: string;
    dataUrl?: string;
    base64?: string;
    success?: () => void;
    fail?: (err: unknown) => void;
  }) => Promise<void> | void;
  vibrateShort?: (options?: { type?: 'light' | 'medium' | 'heavy' }) => void;
  showToast?: (options: { title: string; icon?: 'success' | 'none' }) => void;
}

declare global {
  interface Window {
    xhs?: {
      miniTool?: XhsMiniToolBridge;
      saveImageToPhotosAlbum?: XhsMiniToolBridge['saveImageToPhotosAlbum'];
    };
  }
}

export interface SaveCardResult {
  method: 'xhs-bridge' | 'download' | 'preview-modal';
  ok: boolean;
}

/**
 * Detects whether the page is running inside Xiaohongshu WebView / MiniTool container.
 */
export function isXhsEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.xhs?.miniTool || window.xhs?.saveImageToPhotosAlbum) return true;
  return /xhs|xiaohongshu|discover/i.test(navigator.userAgent || '');
}

/**
 * Triggers light physical haptic feedback on supported mobile devices or XHS container.
 */
export function triggerHaptic(type: 'light' | 'medium' | 'heavy' = 'light'): void {
  try {
    if (window.xhs?.miniTool?.vibrateShort) {
      window.xhs.miniTool.vibrateShort({ type });
      return;
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      const ms = type === 'heavy' ? 24 : type === 'medium' ? 14 : 8;
      navigator.vibrate(ms);
    }
  } catch {
    // Ignore unsupported vibration environments
  }
}

/**
 * Saves a rendered Canvas dataURL via Xiaohongshu MiniTool capability if available,
 * falling back to standard local download (and notifying caller if mobile WebView needs long-press preview).
 */
export async function saveCanvasImage(
  canvas: HTMLCanvasElement,
  filename: string
): Promise<SaveCardResult> {
  const dataUrl = canvas.toDataURL('image/png');
  const rawBase64 = dataUrl.replace(/^data:image\/png;base64,/, '');

  const miniTool = window.xhs?.miniTool;
  const saveFn =
    miniTool?.saveImage?.bind(miniTool) ??
    miniTool?.saveImageToPhotosAlbum?.bind(miniTool) ??
    window.xhs?.saveImageToPhotosAlbum?.bind(window.xhs);

  if (saveFn) {
    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const maybePromise = saveFn({
          dataUrl,
          base64: rawBase64,
          filePath: dataUrl,
          success: () => {
            if (!settled) {
              settled = true;
              resolve();
            }
          },
          fail: (err) => {
            if (!settled) {
              settled = true;
              reject(err);
            }
          },
        });
        if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
          (maybePromise as Promise<void>).then(
            () => {
              if (!settled) {
                settled = true;
                resolve();
              }
            },
            (err) => {
              if (!settled) {
                settled = true;
                reject(err);
              }
            }
          );
        } else {
          // Some bridges resolve synchronously without invoking callback
          setTimeout(() => {
            if (!settled) {
              settled = true;
              resolve();
            }
          }, 650);
        }
      });
      return { method: 'xhs-bridge', ok: true };
    } catch {
      // Fall through to browser download / preview modal
    }
  }

  // Browser / desktop download via Blob URL
  try {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    );
    if (blob) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      // Inside embedded mobile WebViews without XHS bridge, <a download> may be ignored;
      // surface preview modal as an extra convenience if inside mobile touch WebView
      if (isXhsEnvironment()) {
        return { method: 'preview-modal', ok: true };
      }
      return { method: 'download', ok: true };
    }
  } catch {
    // Fall back to preview modal
  }

  return { method: 'preview-modal', ok: true };
}

/**
 * Pure local FileReader image loader — zero network uploads.
 */
export function readLocalImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('请选择图片格式文件'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取本地照片失败'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('照片解析异常'));
        return;
      }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('无法解码该图片，请换一张试试'));
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Loads a packaged local image asset cleanly.
 */
export function loadLocalAssetImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`加载内置图片失败: ${src}`));
    img.src = src;
  });
}
