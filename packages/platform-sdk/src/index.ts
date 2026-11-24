/**
 * @minigame/platform-sdk
 * 跨平台离线单机小游戏运行时适配层
 * 支持：小红书小工具 (window.xhs.miniTool)、微信小程序 (wx)、Bilibili Toy / 标准 H5
 */

export type PlatformKind = 'xhs' | 'weapp' | 'web';

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  capsuleRightReserve: number;
}

interface XhsMiniTool {
  getLaunchOptions?: () => Promise<unknown>;
  setStorage?: (opts: { key: string; data: string }) => Promise<{ errMsg?: string }>;
  getStorage?: (opts: { key: string }) => Promise<{ data?: string | null; errMsg?: string }>;
  removeStorage?: (opts: { key: string }) => Promise<{ errMsg?: string }>;
  vibrateShort?: (opts: { type?: 'heavy' | 'medium' | 'light' }) => Promise<unknown>;
  getWindowInfo?: () => Promise<{
    safeArea?: { top?: number; bottom?: number; height?: number };
    windowHeight?: number;
    capsuleInfo?: { bottom?: number; width?: number };
  }>;
  setKeepScreenOn?: (opts: { keepScreenOn: boolean }) => Promise<unknown>;
}

interface XhsGlobal {
  launchOptions?: unknown;
  miniTool?: XhsMiniTool;
}

declare const wx: undefined | {
  getStorageSync?: (key: string) => unknown;
  setStorageSync?: (key: string, data: string) => void;
  removeStorageSync?: (key: string) => void;
  vibrateShort?: (opts?: { type?: 'heavy' | 'medium' | 'light' }) => void;
  getWindowInfo?: () => {
    safeArea?: { top?: number; bottom?: number };
    screenHeight?: number;
  };
  getMenuButtonBoundingClientRect?: () => { bottom?: number; width?: number };
  createWebAudioContext?: () => AudioContext;
};

function getXhsGlobal(): XhsGlobal | null {
  if (typeof window !== 'undefined') {
    const w = window as unknown as { xhs?: XhsGlobal };
    if (w.xhs && typeof w.xhs === 'object') {
      return w.xhs;
    }
  }
  return null;
}

export function detectPlatform(): PlatformKind {
  if (getXhsGlobal() !== null) {
    return 'xhs';
  }
  if (typeof wx !== 'undefined' && wx !== null && typeof wx.getStorageSync === 'function') {
    return 'weapp';
  }
  return 'web';
}

/**
 * 小红书小工具客户端版本解析（严格遵循官方容器规范 §3.6）
 * buildVersion 末 3 位为编译序号，例如 9462004 -> 9462 (9.46.2)
 */
function parseXhsBuildVersion(launchOptions: unknown): number | null {
  if (!launchOptions || typeof launchOptions !== 'object') return null;
  const env = (launchOptions as { miniToolEnv?: { buildVersion?: unknown } }).miniToolEnv;
  const raw = env && env.buildVersion;
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  const str = String(raw);
  if (!/^[1-9]\d{6,}$/.test(str)) return null;
  const num = Number(str);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}

let cachedXhsBuildVersion: number | null | undefined = undefined;

async function getXhsClientVersion(): Promise<number | null> {
  const xhs = getXhsGlobal();
  if (!xhs) return null;
  if (cachedXhsBuildVersion === undefined) {
    const syncVer = parseXhsBuildVersion(xhs.launchOptions);
    if (syncVer !== null) {
      cachedXhsBuildVersion = syncVer;
    } else if (xhs.miniTool && typeof xhs.miniTool.getLaunchOptions === 'function') {
      try {
        const opts = await xhs.miniTool.getLaunchOptions();
        cachedXhsBuildVersion = parseXhsBuildVersion(opts);
      } catch {
        cachedXhsBuildVersion = null;
      }
    } else {
      cachedXhsBuildVersion = null;
    }
  }
  if (cachedXhsBuildVersion === null || cachedXhsBuildVersion === undefined) return null;
  return Math.floor(cachedXhsBuildVersion / 1000);
}

/**
 * 统一键值存储（含内存镜像，兼顾小红书 §3.7 容器存储规范、微信小程序与纯前端 Web/Bilibili Toy）
 * 注意：在小红书容器内，当版本未知、SDK 缺失或写入失败时，严禁回退到浏览器 localStorage。
 */
const memoryMirror: Record<string, string> = {};

export async function loadJsonData<T>(key: string, fallback: T): Promise<T> {
  const platform = detectPlatform();

  if (platform === 'xhs') {
    const clientVer = await getXhsClientVersion();
    const miniTool = getXhsGlobal()?.miniTool;
    if (clientVer !== null && clientVer >= 9460 && miniTool && typeof miniTool.getStorage === 'function') {
      try {
        const res = await miniTool.getStorage({ key });
        if (res && typeof res.data === 'string' && res.data.length > 0) {
          memoryMirror[key] = res.data;
          return JSON.parse(res.data) as T;
        }
      } catch {
        if (memoryMirror[key]) {
          try {
            return JSON.parse(memoryMirror[key]) as T;
          } catch {
            return fallback;
          }
        }
      }
    }
    if (memoryMirror[key]) {
      try {
        return JSON.parse(memoryMirror[key]) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }

  if (platform === 'weapp' && typeof wx !== 'undefined' && wx?.getStorageSync) {
    try {
      const raw = wx.getStorageSync(key);
      if (typeof raw === 'string' && raw.length > 0) {
        return JSON.parse(raw) as T;
      }
    } catch {
      // ignore storage error
    }
    return fallback;
  }

  // Web / Bilibili Toy
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(key);
      if (typeof raw === 'string' && raw.length > 0) {
        memoryMirror[key] = raw;
        return JSON.parse(raw) as T;
      }
    }
  } catch {
    if (memoryMirror[key]) {
      try {
        return JSON.parse(memoryMirror[key]) as T;
      } catch {
        return fallback;
      }
    }
  }
  return fallback;
}

export async function saveJsonData<T>(key: string, value: T): Promise<boolean> {
  let serialized = '';
  try {
    serialized = JSON.stringify(value);
  } catch {
    return false;
  }
  memoryMirror[key] = serialized;

  const platform = detectPlatform();

  if (platform === 'xhs') {
    const clientVer = await getXhsClientVersion();
    const miniTool = getXhsGlobal()?.miniTool;
    if (clientVer === null || clientVer < 9460 || !miniTool || typeof miniTool.setStorage !== 'function') {
      return false;
    }
    try {
      const res = await miniTool.setStorage({ key, data: serialized });
      return Boolean(res && res.errMsg === 'setStorage:ok');
    } catch {
      return false;
    }
  }

  if (platform === 'weapp' && typeof wx !== 'undefined' && wx?.setStorageSync) {
    try {
      wx.setStorageSync(key, serialized);
      return true;
    } catch {
      return false;
    }
  }

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, serialized);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * 触觉振动反馈
 */
export async function triggerHaptic(level: 'light' | 'medium' | 'heavy' = 'light'): Promise<void> {
  const platform = detectPlatform();
  if (platform === 'xhs') {
    const clientVer = await getXhsClientVersion();
    const miniTool = getXhsGlobal()?.miniTool;
    if (clientVer !== null && clientVer >= 9500 && miniTool && typeof miniTool.vibrateShort === 'function') {
      try {
        await miniTool.vibrateShort({ type: level });
      } catch {
        // ignore
      }
    }
    return;
  }

  if (platform === 'weapp' && typeof wx !== 'undefined' && wx?.vibrateShort) {
    try {
      wx.vibrateShort({ type: level });
    } catch {
      // ignore
    }
    return;
  }

  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(level === 'heavy' ? 28 : level === 'medium' ? 16 : 8);
    } catch {
      // ignore
    }
  }
}

/**
 * 获取顶部胶囊与安全区避让信息（适配小红书容器与微信小程序）
 */
export async function getSafeAreaInsets(): Promise<SafeAreaInsets> {
  const defaults: SafeAreaInsets = { top: 0, bottom: 0, capsuleRightReserve: 0 };
  const platform = detectPlatform();

  if (platform === 'xhs') {
    const clientVer = await getXhsClientVersion();
    const miniTool = getXhsGlobal()?.miniTool;
    if (clientVer !== null && clientVer >= 9490 && miniTool && typeof miniTool.getWindowInfo === 'function') {
      try {
        const info = await miniTool.getWindowInfo();
        const top = Math.max(0, info.capsuleInfo?.bottom ?? info.safeArea?.top ?? 0);
        const bottom =
          info.windowHeight && info.safeArea?.bottom
            ? Math.max(0, info.windowHeight - info.safeArea.bottom)
            : 0;
        const capsuleRightReserve = info.capsuleInfo?.width ? info.capsuleInfo.width + 16 : 0;
        return { top, bottom, capsuleRightReserve };
      } catch {
        return defaults;
      }
    }
  }

  if (platform === 'weapp' && typeof wx !== 'undefined') {
    try {
      const win = wx.getWindowInfo ? wx.getWindowInfo() : undefined;
      const rect = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : undefined;
      const top = Math.max(0, rect?.bottom ?? win?.safeArea?.top ?? 0);
      const bottom =
        win?.screenHeight && win?.safeArea?.bottom ? Math.max(0, win.screenHeight - win.safeArea.bottom) : 0;
      const capsuleRightReserve = rect?.width ? rect.width + 16 : 0;
      return { top, bottom, capsuleRightReserve };
    } catch {
      return defaults;
    }
  }

  return defaults;
}

/**
 * 零外部资源合成音效器（纯离线 Web Audio 机械木滑轮声效）
 */
export class SoundSynth {
  private ctx: AudioContext | null = null;
  private muted = false;

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }
    try {
      if (typeof wx !== 'undefined' && wx && typeof wx.createWebAudioContext === 'function') {
        this.ctx = wx.createWebAudioContext();
        return this.ctx;
      }
      if (typeof window !== 'undefined') {
        const Ctor =
          window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) {
          this.ctx = new Ctor();
          return this.ctx;
        }
      }
    } catch {
      this.ctx = null;
    }
    return null;
  }

  /** 装卸货物的木箱轻叩声 */
  public playWoodTap(pitchFactor = 1): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(190 * pitchFactor, now);
      osc.frequency.exponentialRampToValueAtTime(78 * pitchFactor, now + 0.075);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.085);
    } catch {
      // ignore audio glitches
    }
  }

  /** 绳索滑轮转动升降声 */
  public playPulleyHoist(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const ticks = [0, 0.065, 0.135, 0.21];
      for (let i = 0; i < ticks.length; i++) {
        const t = now + ticks[i];
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(260 + i * 28, t);
        osc.frequency.exponentialRampToValueAtTime(140, t + 0.045);
        gain.gain.setValueAtTime(0.09, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.055);
      }
    } catch {
      // ignore
    }
  }

  /** 配重不足时的紧绷闷响 */
  public playBlockedTug(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(115, now);
      osc.frequency.linearRampToValueAtTime(82, now + 0.14);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.16);
    } catch {
      // ignore
    }
  }

  /** 货物到位或过关时的黄铜铃声 */
  public playWinChime(excellent: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const notes = excellent ? [523.25, 659.25, 783.99, 1046.5] : [440, 554.37, 659.25];
      for (let i = 0; i < notes.length; i++) {
        const t = now + i * 0.085;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(notes[i], t);
        gain.gain.setValueAtTime(0.13, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.38);
      }
    } catch {
      // ignore
    }
  }
}
