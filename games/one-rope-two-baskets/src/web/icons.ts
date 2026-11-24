import { Floor } from '../core/types';

/**
 * 界面功能矢量图标（统一圆润笔触，契合绘本木作质感）
 */
export const UI_ICONS = {
  soundOn: `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="9 4.5 5 8.2 2.2 8.2 2.2 11.8 5 11.8 9 15.5 9 4.5" fill="currentColor"/><path d="M13 7.4a3.9 3.9 0 0 1 0 5.2"/><path d="M15.8 4.8a7.4 7.4 0 0 1 0 10.4"/></svg>`,
  soundOff: `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="9 4.5 5 8.2 2.2 8.2 2.2 11.8 5 11.8 9 15.5 9 4.5" fill="currentColor"/><line x1="17.8" y1="7.2" x2="12.8" y2="12.8"/><line x1="12.8" y1="7.2" x2="17.8" y2="12.8"/></svg>`,
  bulb: `<svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 14h5M7.2 16.2h3.6M9 2a5 5 0 0 0-3 9c.5.4.8 1 .8 1.6h4.4c0-.6.3-1.2.8-1.6a5 5 0 0 0-3-9z" fill="currentColor" fill-opacity="0.18"/></svg>`,
  flag: `<svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 16V3"/><path d="M4 3h10l-2.2 3.5L14 10H4" fill="currentColor" fill-opacity="0.28"/></svg>`,
  undo: `<svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 7.5h7.5a4 4 0 1 1 0 8H8"/><polyline points="6.5 4.5 3.5 7.5 6.5 10.5"/></svg>`,
  reset: `<svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 9a5.5 5.5 0 1 0 1.5-3.8L3.5 6.8"/><polyline points="3.5 3.2 3.5 6.8 7.1 6.8"/></svg>`,
  check: `<svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="2.2 7.2 5.7 10.7 11.8 3.5"/></svg>`,
  pulleyMini: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="8" cy="8" r="5.8"/><circle cx="8" cy="8" r="1.8" fill="currentColor"/><path d="M8 2.2v11.6M2.2 8h11.6"/></svg>`,
  handReplay: `<svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11V4a1.5 1.5 0 0 1 3 0v5h1.2a2 2 0 0 1 2 2.2l-.5 3.3a2 2 0 0 1-2 1.7H8.2a2.5 2.5 0 0 1-2.2-1.3l-1.5-2.8a1.3 1.3 0 0 1 2.2-1.3L9 12"/></svg>`,
};

/**
 * 绘本风奶油手套引导小手（用于无文字动态新手引导：点击 / 拖拽吊筐）
 */
export function renderTutorialHandSvg(): string {
  return `<svg class="tut-hand-svg" viewBox="0 0 44 48" aria-hidden="true">
    <circle class="tut-ripple" cx="15" cy="8" r="7" fill="none" stroke="#ffd86b" stroke-width="2.4"/>
    <g class="tut-hand-body">
      <path d="M12.5 8.5 a3.3 3.3 0 0 1 6.6 0 v10.5 h2.2 a3 3 0 0 1 3 2.5 h1.8 a3 3 0 0 1 3 2.6 h1.5 a3 3 0 0 1 2.9 3.4 l-1.2 8.8 a5.5 5.5 0 0 1 -5.4 4.7 h-8.6 a6.5 6.5 0 0 1 -5.8 -3.6 l-4.2 -7.8 a3.2 3.2 0 0 1 4.6 -4.1 l2.6 2.2 V8.5 z" fill="#fff7e6" stroke="#382110" stroke-width="2.3" stroke-linejoin="round"/>
      <path d="M19.1 19v4.5 M24.3 21.5v4 M29.1 24.1v3.6" stroke="#382110" stroke-width="1.8" stroke-linecap="round"/>
      <rect x="13" y="38.5" width="15.5" height="5" rx="2" fill="#e0ab43" stroke="#382110" stroke-width="1.9"/>
    </g>
  </svg>`;
}

/**
 * 天车黄铜吊耳 + 辐条滑轮总成（带木梁固定铆钉与立体金属切面）
 */
export function renderPulleyClevisSvg(wheelId: string): string {
  return `<svg class="pulley-assembly-svg" viewBox="0 0 48 56" aria-hidden="true">
    <circle cx="24" cy="36" r="16" fill="rgba(32,16,6,0.24)"/>
    <g id="${wheelId}" class="pulley-wheel-group" style="transform-origin: 24px 34px;">
      <circle cx="24" cy="34" r="15.5" fill="#d89b38" stroke="#382110" stroke-width="2.3"/>
      <circle cx="24" cy="34" r="12.2" fill="#8b581c" stroke="#382110" stroke-width="1.6"/>
      <circle cx="24" cy="34" r="9.6" fill="#f0c362"/>
      <path d="M24 19v30M9 34h30M13.4 23.4l21.2 21.2M34.6 23.4L13.4 44.6" stroke="#382110" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="24" cy="34" r="4.8" fill="#d89b38" stroke="#382110" stroke-width="2"/>
    </g>
    <path d="M16 2h16l-2.2 31a5.8 5.8 0 0 1-11.6 0z" fill="#ecc061" stroke="#382110" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M18.2 4h5v26" fill="none" stroke="#fff0b8" stroke-width="1.6" stroke-linecap="round" opacity="0.75"/>
    <circle cx="20.5" cy="7.5" r="1.8" fill="#5c3718"/>
    <circle cx="27.5" cy="7.5" r="1.8" fill="#5c3718"/>
    <circle cx="24" cy="34" r="2.6" fill="#5c3718" stroke="#fff0b8" stroke-width="0.8"/>
  </svg>`;
}

/**
 * 吊筐顶部的双股 V 形麻绳吊索 + 铁吊环
 */
export function renderBasketBridleSvg(): string {
  return `<svg class="basket-bridle-svg" viewBox="0 0 104 22" preserveAspectRatio="none" aria-hidden="true">
    <path d="M52 3 L13 21 M52 3 L91 21" stroke="rgba(35,18,6,0.22)" stroke-width="4.2" stroke-linecap="round"/>
    <path d="M52 2.5 L12 20.5 M52 2.5 L92 20.5" stroke="#4a2c14" stroke-width="4.2" stroke-linecap="round"/>
    <path d="M52 2.5 L12 20.5 M52 2.5 L92 20.5" stroke="#cfa15a" stroke-width="2.2" stroke-dasharray="4 2.5" stroke-linecap="round"/>
    <circle cx="12" cy="20" r="2.8" fill="#d9a441" stroke="#382110" stroke-width="1.6"/>
    <circle cx="92" cy="20" r="2.8" fill="#d9a441" stroke="#382110" stroke-width="1.6"/>
    <rect x="47.5" y="0.5" width="9" height="6" rx="2.5" fill="#e5b54f" stroke="#382110" stroke-width="1.8"/>
  </svg>`;
}

/**
 * 横梁中央的扇形黄铜指针天平仪 + 左右砝码托盘
 */
export function renderBrassDialGaugeHtml(weightA: number, weightB: number): string {
  const diff = weightB - weightA;
  const clampedDiff = Math.max(-3, Math.min(3, diff));
  const needleAngle =
    clampedDiff === 0 ? 0 : clampedDiff > 0 ? 14 + Math.abs(clampedDiff) * 7 : -(14 + Math.abs(clampedDiff) * 7);
  const beamTilt = diff === 0 ? 0 : diff > 0 ? 8 : -8;

  const bricksA =
    weightA === 0
      ? '<span class="dial-empty-pip"></span>'
      : Array.from({ length: Math.min(5, weightA) }, () => '<span class="dial-ingot dial-ingot-a"></span>').join('');
  const bricksB =
    weightB === 0
      ? '<span class="dial-empty-pip"></span>'
      : Array.from({ length: Math.min(5, weightB) }, () => '<span class="dial-ingot dial-ingot-b"></span>').join('');

  return `
    <div class="brass-dial-shell">
      <svg class="brass-fan-svg" viewBox="0 0 132 42" aria-hidden="true">
        <path d="M12 36 A58 58 0 0 1 120 36 L112 40 L20 40 Z" fill="#e0ab43" stroke="#382110" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M21 35 A48 48 0 0 1 111 35 Z" fill="#fbf3df" stroke="#5c3818" stroke-width="1.5"/>
        <line x1="66" y1="8" x2="66" y2="14" stroke="#2d7a53" stroke-width="2.2" stroke-linecap="round"/>
        <line x1="46" y1="11" x2="49" y2="16" stroke="#6e4b2a" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="86" y1="11" x2="83" y2="16" stroke="#6e4b2a" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="30" y1="19" x2="34" y2="23" stroke="#6e4b2a" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="102" y1="19" x2="98" y2="23" stroke="#6e4b2a" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="17" cy="34" r="2" fill="#5c3818"/>
        <circle cx="115" cy="34" r="2" fill="#5c3818"/>
        <g style="transform-origin: 66px 35px; transform: rotate(${needleAngle}deg); transition: transform 0.36s cubic-bezier(0.22, 1, 0.36, 1);">
          <path d="M66 10 L62.5 34 L69.5 34 Z" fill="${diff === 0 ? '#2b8a57' : diff > 0 ? '#c45a3b' : '#2f7678'}" stroke="#382110" stroke-width="1.5" stroke-linejoin="round"/>
        </g>
        <rect x="64" y="36" width="4" height="6" fill="#d89b38" stroke="#382110" stroke-width="1.4"/>
        <circle cx="66" cy="35" r="4.8" fill="#ecc061" stroke="#382110" stroke-width="2"/>
      </svg>
      <div class="dial-pans-bar" style="transform: rotate(${beamTilt}deg);">
        <div class="dial-pan dial-pan-left">${bricksA}</div>
        <span class="dial-center-pin"></span>
        <div class="dial-pan dial-pan-right">${bricksB}</div>
      </div>
    </div>
  `;
}

/**
 * 轻巧低调的 1/2/3 格实木托板底座（弱化存在感，衬托上方的 1/2/3 只麻袋作为绝对视觉主角）
 */
export function renderWoodPalletPlinthSvg(tier: 1 | 2 | 3, isIron = false): string {
  const topFill = isIron ? '#9d8773' : '#cfa06b';
  const bodyFill = isIron ? '#75604e' : '#a16e3c';
  if (tier === 1) {
    return `<svg class="wood-pallet-svg" viewBox="0 0 42 8" preserveAspectRatio="none" aria-hidden="true">
      <rect x="2" y="1" width="38" height="6" rx="2" fill="${bodyFill}" stroke="#382110" stroke-width="1.5"/>
      <line x1="4" y1="2.3" x2="38" y2="2.3" stroke="${topFill}" stroke-width="1.4" stroke-linecap="round"/>
      <circle cx="8" cy="4.3" r="1" fill="#382110"/>
      <circle cx="34" cy="4.3" r="1" fill="#382110"/>
    </svg>`;
  }
  if (tier === 2) {
    return `<svg class="wood-pallet-svg" viewBox="0 0 68 8" preserveAspectRatio="none" aria-hidden="true">
      <rect x="2" y="1" width="64" height="6" rx="2" fill="${bodyFill}" stroke="#382110" stroke-width="1.5"/>
      <line x1="4" y1="2.3" x2="32.5" y2="2.3" stroke="${topFill}" stroke-width="1.4" stroke-linecap="round"/>
      <line x1="35.5" y1="2.3" x2="64" y2="2.3" stroke="${topFill}" stroke-width="1.4" stroke-linecap="round"/>
      <line x1="34" y1="1.2" x2="34" y2="6.8" stroke="#382110" stroke-width="1.6"/>
      <circle cx="8" cy="4.3" r="1" fill="#382110"/>
      <circle cx="60" cy="4.3" r="1" fill="#382110"/>
    </svg>`;
  }
  return `<svg class="wood-pallet-svg" viewBox="0 0 94 8" preserveAspectRatio="none" aria-hidden="true">
    <rect x="2" y="1" width="90" height="6" rx="2" fill="${bodyFill}" stroke="#382110" stroke-width="1.5"/>
    <line x1="4" y1="2.3" x2="30" y2="2.3" stroke="${topFill}" stroke-width="1.4" stroke-linecap="round"/>
    <line x1="33.5" y1="2.3" x2="60.5" y2="2.3" stroke="${topFill}" stroke-width="1.4" stroke-linecap="round"/>
    <line x1="64" y1="2.3" x2="90" y2="2.3" stroke="${topFill}" stroke-width="1.4" stroke-linecap="round"/>
    <line x1="31.8" y1="1.2" x2="31.8" y2="6.8" stroke="#382110" stroke-width="1.6"/>
    <line x1="62.2" y1="1.2" x2="62.2" y2="6.8" stroke="#382110" stroke-width="1.6"/>
    <circle cx="8" cy="4.3" r="1" fill="#382110"/>
    <circle cx="86" cy="4.3" r="1" fill="#382110"/>
  </svg>`;
}

const SACK_FLOOR_THEME: Record<
  Floor,
  { cord: string; cordLight: string; patchBg: string; patchBorder: string }
> = {
  3: { cord: '#2b6f9e', cordLight: '#7ac0f0', patchBg: '#eef7fd', patchBorder: '#245e87' },
  2: { cord: '#c97418', cordLight: '#fabb64', patchBg: '#fef4e3', patchBorder: '#a85d0d' },
  1: { cord: '#2a7c56', cordLight: '#6ed19f', patchBg: '#ebf8f1', patchBorder: '#1f6343' },
};

const BURLAP_SHADES = ['#efd8b2', '#e5c898', '#ebd2a8'];

/**
 * 绘制单只饱满绘本暖麻袋（围绕水平中心 cx），自带目标楼层彩绳扎口 + 三层高横条肚贴布标
 */
function renderSingleBurlapSackUnit(cx: number, targetFloor: Floor, shadeIndex: number): string {
  const th = SACK_FLOOR_THEME[targetFloor];
  const bodyFill = BURLAP_SHADES[shadeIndex % BURLAP_SHADES.length];

  const bar3Active = targetFloor === 3;
  const bar2Active = targetFloor === 2;
  const bar1Active = targetFloor === 1;

  return `<g>
    <!-- 麻袋顶部扎口荷叶边袋耳 -->
    <path d="M ${cx - 8.2} 3.6 C ${cx - 4.5} 6.2, ${cx + 4.5} 6.2, ${cx + 8.2} 3.6 L ${cx + 5.8} 9.2 L ${cx - 5.8} 9.2 Z"
      fill="${bodyFill}" stroke="#382110" stroke-width="2" stroke-linejoin="round"/>
    <path d="M ${cx - 3.2} 4.8 L ${cx - 2} 8.4 M ${cx + 3.2} 4.8 L ${cx + 2} 8.4"
      stroke="#b88c56" stroke-width="1.3" stroke-linecap="round"/>

    <!-- 饱满梨形麻袋肚身 -->
    <path d="M ${cx - 6.6} 9 C ${cx - 13.8} 13.2, ${cx - 15} 26, ${cx - 11} 32.2 C ${cx - 6.8} 34, ${cx + 6.8} 34, ${cx + 11} 32.2 C ${cx + 15} 26, ${cx + 13.8} 13.2, ${cx + 6.6} 9 Z"
      fill="${bodyFill}" stroke="#382110" stroke-width="2.15" stroke-linejoin="round"/>

    <!-- 底部暖棕体积暗部折痕与左肩奶油高光 -->
    <path d="M ${cx - 9.6} 29 Q ${cx} 32 ${cx + 9.6} 29" fill="none" stroke="#cca168" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M ${cx - 9.2} 14.5 Q ${cx - 10.8} 19.5 ${cx - 9.5} 24.5" fill="none" stroke="#fff8e6" stroke-width="1.9" stroke-linecap="round"/>

    <!-- 目标楼层染色扎口粗彩绳 + 绳结 -->
    <rect x="${cx - 7.8}" y="7.4" width="15.6" height="3.9" rx="1.9" fill="${th.cord}" stroke="#382110" stroke-width="1.7"/>
    <line x1="${cx - 5.8}" y1="8.6" x2="${cx + 4.5}" y2="8.6" stroke="${th.cordLight}" stroke-width="1.2" stroke-linecap="round"/>

    <!-- 缝制肚贴布标（直接印有上/中/下三层楼指示横杠，零文字一眼辨别目标楼层） -->
    <rect x="${cx - 7.3}" y="15.2" width="14.6" height="12.2" rx="2.3" fill="${th.patchBg}" stroke="${th.patchBorder}" stroke-width="1.55"/>
    <rect x="${cx - 4.8}" y="17.2" width="9.6" height="${bar3Active ? 2.4 : 1.5}" rx="0.8" fill="${bar3Active ? th.cord : '#cbb99f'}" opacity="${bar3Active ? '1' : '0.55'}"/>
    <rect x="${cx - 4.8}" y="20.5" width="9.6" height="${bar2Active ? 2.4 : 1.5}" rx="0.8" fill="${bar2Active ? th.cord : '#cbb99f'}" opacity="${bar2Active ? '1' : '0.55'}"/>
    <rect x="${cx - 4.8}" y="23.8" width="9.6" height="${bar1Active ? 2.4 : 1.5}" rx="0.8" fill="${bar1Active ? th.cord : '#cbb99f'}" opacity="${bar1Active ? '1' : '0.55'}"/>
  </g>`;
}

/**
 * 绘制单只老式锻造铸铁秤砣（围绕水平中心 cx），用于无终点要求的纯配重物
 */
function renderSingleIronWeightUnit(cx: number, shadeIndex: number): string {
  const bodyFill = shadeIndex % 2 === 0 ? '#53606b' : '#4a5661';
  return `<g>
    <!-- 顶部锻铁圆吊环 -->
    <circle cx="${cx}" cy="7.2" r="4.5" fill="none" stroke="#261a10" stroke-width="3.6"/>
    <circle cx="${cx}" cy="7.2" r="4.5" fill="none" stroke="#8b9ca9" stroke-width="1.5"/>
    <!-- 秤砣束颈台座 -->
    <rect x="${cx - 5.2}" y="10.4" width="10.4" height="3.2" rx="1.2" fill="#6b7a87" stroke="#261a10" stroke-width="1.8"/>
    <!-- 厚重八角梯形铸铁砣身 -->
    <path d="M ${cx - 8.6} 13.4 h 17.2 l 3.6 16.8 a 2.6 2.6 0 0 1 -2.5 3.2 h -19.4 a 2.6 2.6 0 0 1 -2.5 -3.2 z"
      fill="${bodyFill}" stroke="#261a10" stroke-width="2.15" stroke-linejoin="round"/>
    <!-- 底部暗面与左侧金属冷高光 -->
    <path d="M ${cx - 10.6} 29.2 h 21.2 v 2.8 h -21.2 z" fill="#353f47" opacity="0.8"/>
    <line x1="${cx - 6.8}" y1="16" x2="${cx - 9.2}" y2="28" stroke="#93a5b3" stroke-width="1.9" stroke-linecap="round"/>
    <!-- 中央凹刻压舱圆铆印记 -->
    <circle cx="${cx}" cy="22.8" r="3.4" fill="#39434c" stroke="#80919e" stroke-width="1.2"/>
    <circle cx="${cx}" cy="22.8" r="1.2" fill="#9fb0bd"/>
  </g>`;
}

/**
 * 规整化货物插画渲染器：
 * - 普通货物（targetFloor !== null）：按重量直接绘制 1袋 / 2并排袋 / 3并排袋，袋数即重量，彩绳与肚贴即目标楼层！
 * - 纯配重物（targetFloor === null）：按重量绘制铸铁秤砣，异材质冷灰铁器一眼区分于待运麻袋。
 */
export function renderStandardCargoSvg(
  tier: 1 | 2 | 3,
  targetFloor: Floor | null,
  silhouetteOnly = false
): string {
  const cls = silhouetteOnly ? 'cargo-art silhouette-art' : 'cargo-art';
  const vbWidth = tier === 1 ? 42 : tier === 2 ? 68 : 94;
  const centers = tier === 1 ? [21] : tier === 2 ? [19, 49] : [17.5, 47, 76.5];

  const unitsSvg = centers
    .map((cx, idx) =>
      targetFloor === null
        ? renderSingleIronWeightUnit(cx, idx)
        : renderSingleBurlapSackUnit(cx, targetFloor, idx)
    )
    .join('');

  return `<svg viewBox="0 0 ${vbWidth} 35" class="${cls}" aria-hidden="true">
    ${unitsSvg}
  </svg>`;
}
