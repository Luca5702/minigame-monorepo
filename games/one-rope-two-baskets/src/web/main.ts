import {
  getSafeAreaInsets,
  loadJsonData,
  saveJsonData,
  SoundSynth,
  triggerHaptic,
} from '@minigame/platform-sdk';
import {
  analyzePosition,
  BasketId,
  compareGrades,
  computeHintGesture,
  createGameState,
  evaluateState,
  EvaluationSummary,
  Floor,
  GameState,
  getAutoUnloadItems,
  getBasketFloor,
  getItemsInBasket,
  getItemsOnFloor,
  getLevelById,
  HintGestureAction,
  isSolvableWithout2FOps,
  ItemSpec,
  LEVELS,
  LevelSpec,
  loadItemToBasket,
  moveBaskets,
  MoveDirection,
  SaveProfile,
  settleTargetItemFromBasket,
  transferItemBetweenBasketsAt2F,
  undoLastAction,
  unloadItemFromBasket,
} from '../core/index';
import {
  renderBasketBridleSvg,
  renderBrassDialGaugeHtml,
  renderPulleyClevisSvg,
  renderStandardCargoSvg,
  renderTutorialHandSvg,
  renderWoodPalletPlinthSvg,
  UI_ICONS,
} from './icons';

const STORAGE_KEY = 'minigame_one_rope_two_baskets_v1';

type ModalKind = 'none' | 'levels' | 'help' | 'lab' | 'result';

interface AppRuntime {
  profile: SaveProfile;
  customLevel: LevelSpec | null;
  state: GameState;
  modal: ModalKind;
  settledGrade: 'excellent' | 'pass' | null;
  toastOverride: { kind: 'warn' | 'hint'; text: string } | null;
  deadlockDismissed: boolean;
  hintActive: boolean;
  pending2FFloorItemId: string | null;
  pulleyAngle: number;
  strainAnim: { upBasket: BasketId; downBasket: BasketId } | null;
  isUserDragging: boolean;
  isAutoSettling: boolean;
  inFlightIds: Set<string>;
  settledPopIds: Set<string>;
  replayTutorial: boolean;
  labDraft: {
    basketCapacity: number;
    items: Array<{ name: string; weight: number; startFloor: Floor; targetFloor: Floor | null }>;
    auditNote: string;
  };
}

interface SkeletonRefs {
  topBar: HTMLElement;
  floatingToast: HTMLElement;
  hoistFrame: HTMLElement;
  stageBody: HTMLElement;
  tutorialLayer: HTMLElement;
  wheelLeft: HTMLElement;
  wheelRight: HTMLElement;
  seesawWidget: HTMLElement;
  ropeLeft: HTMLElement;
  ropeRight: HTMLElement;
  basketLeft: HTMLElement;
  basketRight: HTMLElement;
  platforms: Record<Floor, HTMLElement>;
  utilityRow: HTMLElement;
  modalLayer: HTMLElement;
}

const sound = new SoundSynth();

function createDefaultProfile(): SaveProfile {
  return {
    version: 1,
    currentLevelId: LEVELS[0].id,
    muted: false,
    records: {},
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getActiveLevel(rt: AppRuntime): LevelSpec {
  if (rt.customLevel && rt.state.levelId === rt.customLevel.id) {
    return rt.customLevel;
  }
  return getLevelById(rt.state.levelId);
}

function clampTier(weight: number): 1 | 2 | 3 {
  if (weight <= 1) return 1;
  if (weight === 2) return 2;
  return 3;
}

/**
 * 货物归位/到位印章（未到位时由麻袋自身的彩绳与三横杠肚贴自然编码目标楼层，无需额外顶帽）
 */
function renderCargoDoneSeal(item: ItemSpec, isReadyOrDone: boolean): string {
  if (item.targetFloor === null || !isReadyOrDone) {
    return '';
  }
  return `<span class="cargo-done-seal" aria-hidden="true">${UI_ICONS.check}</span>`;
}

function renderPhysicalCargoBlock(
  item: ItemSpec,
  opts: {
    inCradle: boolean;
    deliveredOnFloor: boolean;
    atTargetInBasket: boolean;
    selected2F: boolean;
    coachPulse: boolean;
    noBasketHere: boolean;
    inFlightHidden?: boolean;
    justSettledPop?: boolean;
    actionName: 'tap-floor-item' | 'unload-item';
    swapBtnHtml?: string;
  }
): string {
  const tier = clampTier(item.weight);
  const isIron = item.targetFloor === null;
  const cls = [
    'physical-cargo',
    `w-tier-${tier}`,
    opts.inCradle ? 'in-cradle-cargo' : '',
    isIron ? 'iron-ballast' : '',
    opts.deliveredOnFloor ? 'delivered' : '',
    opts.selected2F ? 'selected-2f' : '',
    opts.atTargetInBasket ? 'ready-unload-glow' : opts.coachPulse ? 'coach-pulse' : '',
    opts.noBasketHere ? 'no-basket-here' : '',
    opts.inFlightHidden ? 'in-flight-hidden' : '',
    opts.justSettledPop ? 'just-settled-pop' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return `<div role="button" tabindex="0" class="${cls}" aria-label="${escapeHtml(item.name)}" data-action="${opts.actionName}" data-item-id="${item.id}" data-drag-item="${item.id}">
    ${renderCargoDoneSeal(item, opts.deliveredOnFloor || opts.atTargetInBasket)}
    <div class="cargo-art-wrap">
      ${renderStandardCargoSvg(tier, item.targetFloor, false)}
    </div>
    <div class="cargo-pallet-wrap">
      ${renderWoodPalletPlinthSvg(tier, isIron)}
    </div>
    ${opts.swapBtnHtml || ''}
  </div>`;
}

function renderSilhouetteSocket(item: ItemSpec, floor: Floor): string {
  const tier = clampTier(item.weight);
  const pips: string[] = [];
  for (let i = 0; i < tier; i++) {
    pips.push('<span class="socket-unit-pip"></span>');
  }
  return `<div class="silhouette-socket w-tier-${tier} socket-${floor}" data-socket-item="${item.id}">
    <div class="socket-ghost-wrap">
      ${renderStandardCargoSvg(tier, floor, true)}
    </div>
    <div class="socket-base-hint mass-grid-${tier}">
      ${pips.join('')}
    </div>
  </div>`;
}

/**
 * 统一手势引导与锦囊状态计算：
 * - 第 1 关首通前（或主动重播引导时）全程自动显示手指滑动示意；
 * - 任意关卡点击底部 💡 按钮后（rt.hintActive），同样以零文字手指滑动示意引导当前一步升降！
 */
function resolveActiveGesture(level: LevelSpec, rt: AppRuntime): HintGestureAction | null {
  if (rt.isAutoSettling) {
    return null;
  }
  const isLv1Onboarding =
    level.id === 'lv01' && (rt.profile.records['lv01']?.bestGrade !== 'excellent' || rt.replayTutorial);
  if (!isLv1Onboarding && !rt.hintActive) {
    return null;
  }
  return computeHintGesture(level, rt.state);
}

function recordCompletion(rt: AppRuntime, level: LevelSpec, grade: 'excellent' | 'pass'): void {
  rt.hintActive = false;
  if (level.id === 'lv01' && grade === 'excellent') {
    rt.replayTutorial = false;
  }
  if (level.id === 'custom') return;
  const prev = rt.profile.records[level.id];
  const nextBestGrade = !prev || compareGrades(grade, prev.bestGrade) > 0 ? grade : prev.bestGrade;
  let nextBestMoves = prev ? prev.bestRopeMoves : null;
  let nextBestSteps = prev ? prev.bestTotalSteps : null;

  if (grade === 'excellent') {
    if (nextBestMoves === null || rt.state.ropeMoves < nextBestMoves || prev?.bestGrade !== 'excellent') {
      nextBestMoves = rt.state.ropeMoves;
      nextBestSteps = rt.state.totalSteps;
    }
  } else if (!prev) {
    nextBestMoves = rt.state.ropeMoves;
    nextBestSteps = rt.state.totalSteps;
  }

  rt.profile.records[level.id] = {
    bestGrade: nextBestGrade,
    bestRopeMoves: nextBestMoves,
    bestTotalSteps: nextBestSteps,
  };
  void saveJsonData(STORAGE_KEY, rt.profile);
}

function mountSkeleton(root: HTMLElement): SkeletonRefs {
  root.innerHTML = `
    <header class="top-bar" id="sk-top-bar"></header>
    <div class="floating-toast hidden" id="sk-floating-toast"></div>

    <main class="hoist-frame" id="sk-hoist-frame">
      <div class="pulley-rig">
        <div class="attic-oak-beam"></div>
        <div class="top-horizontal-rope"></div>
        <div class="pulley-bridge-rope pulley-bridge-left"></div>
        <div class="pulley-bridge-rope pulley-bridge-right"></div>
        <div class="pulley-mount pulley-mount-left" id="sk-mount-left">${renderPulleyClevisSvg('sk-wheel-left')}</div>
        <div class="seesaw-widget" id="sk-seesaw"></div>
        <div class="pulley-mount pulley-mount-right" id="sk-mount-right">${renderPulleyClevisSvg('sk-wheel-right')}</div>
      </div>

      <div class="stage-body" id="sk-stage-body">
        <div class="rope-strand rope-strand-left" id="sk-rope-left"></div>
        <div class="rope-strand rope-strand-right" id="sk-rope-right"></div>

        <div class="basket-carriage basket-carriage-left" id="sk-basket-left" data-drop-basket="A"></div>
        <div class="basket-carriage basket-carriage-right" id="sk-basket-right" data-drop-basket="B"></div>

        <div class="floors-backdrop">
          <section class="floor-band floor-band-3" data-floor-band="3">
            <div class="shaft-bg-col shaft-bg-left"><span class="shaft-corbel"></span></div>
            <div class="platform-zone" id="sk-plat-3" data-drop-floor="3"></div>
            <div class="shaft-bg-col shaft-bg-right"><span class="shaft-corbel"></span></div>
          </section>
          <section class="floor-band floor-band-2" data-floor-band="2">
            <div class="shaft-bg-col shaft-bg-left"><span class="shaft-corbel"></span></div>
            <div class="platform-zone" id="sk-plat-2" data-drop-floor="2"></div>
            <div class="shaft-bg-col shaft-bg-right"><span class="shaft-corbel"></span></div>
          </section>
          <section class="floor-band floor-band-1" data-floor-band="1">
            <div class="shaft-bg-col shaft-bg-left"><span class="shaft-corbel"></span></div>
            <div class="platform-zone" id="sk-plat-1" data-drop-floor="1"></div>
            <div class="shaft-bg-col shaft-bg-right"><span class="shaft-corbel"></span></div>
          </section>
        </div>
      </div>

      <div class="tutorial-layer hidden" id="sk-tutorial-layer"></div>
    </main>

    <footer class="control-dock">
      <div class="utility-row" id="sk-utility-row"></div>
    </footer>

    <div id="sk-modal-layer"></div>
  `;

  return {
    topBar: root.querySelector('#sk-top-bar') as HTMLElement,
    floatingToast: root.querySelector('#sk-floating-toast') as HTMLElement,
    hoistFrame: root.querySelector('#sk-hoist-frame') as HTMLElement,
    stageBody: root.querySelector('#sk-stage-body') as HTMLElement,
    tutorialLayer: root.querySelector('#sk-tutorial-layer') as HTMLElement,
    wheelLeft: root.querySelector('#sk-wheel-left') as HTMLElement,
    wheelRight: root.querySelector('#sk-wheel-right') as HTMLElement,
    seesawWidget: root.querySelector('#sk-seesaw') as HTMLElement,
    ropeLeft: root.querySelector('#sk-rope-left') as HTMLElement,
    ropeRight: root.querySelector('#sk-rope-right') as HTMLElement,
    basketLeft: root.querySelector('#sk-basket-left') as HTMLElement,
    basketRight: root.querySelector('#sk-basket-right') as HTMLElement,
    platforms: {
      3: root.querySelector('#sk-plat-3') as HTMLElement,
      2: root.querySelector('#sk-plat-2') as HTMLElement,
      1: root.querySelector('#sk-plat-1') as HTMLElement,
    },
    utilityRow: root.querySelector('#sk-utility-row') as HTMLElement,
    modalLayer: root.querySelector('#sk-modal-layer') as HTMLElement,
  };
}

function renderBasketInterior(
  level: LevelSpec,
  rt: AppRuntime,
  ev: EvaluationSummary,
  basket: BasketId,
  floor: Floor,
  pulseIds: Set<string>
): string {
  const items = getItemsInBasket(level, rt.state, basket);
  const weight = items.reduce((s, i) => s + i.weight, 0);
  const is2FMeeting = rt.state.floorA === 2;
  const otherBasket: BasketId = basket === 'A' ? 'B' : 'A';
  const otherHasRoom = getItemsInBasket(level, rt.state, otherBasket).length < level.basketCapacity;

  const canMoveUp = basket === 'A' ? ev.canMoveAUp : ev.canMoveADown;
  const canMoveDown = basket === 'A' ? ev.canMoveADown : ev.canMoveAUp;
  const canPullAny = (ev.weightA > 0 || ev.weightB > 0) && (canMoveUp || canMoveDown);

  let dirIcon = '↕';
  if (floor === 1) dirIcon = '↑';
  else if (floor === 3) dirIcon = '↓';
  else if (canMoveDown && !canMoveUp) dirIcon = '↓';
  else if (canMoveUp && !canMoveDown) dirIcon = '↑';

  const maxGaugeCells = Math.max(5, weight);
  const cellsHtml: string[] = [];
  for (let c = 0; c < maxGaugeCells; c++) {
    cellsHtml.push(`<span class="mass-cell ${c < weight ? 'lit' : ''}"></span>`);
  }

  const cradlesHtml: string[] = [];
  for (let s = 0; s < level.basketCapacity; s++) {
    const it = items[s];
    if (it) {
      const atTarget = it.targetFloor === floor;
      const swapBtnHtml =
        is2FMeeting && otherHasRoom
          ? `<button type="button" class="floating-swap-btn" data-action="swap-2f" data-item-id="${it.id}" title="换筐">⇄</button>`
          : '';
      cradlesHtml.push(`
        <div class="basket-cradle">
          ${renderPhysicalCargoBlock(it, {
            inCradle: true,
            deliveredOnFloor: false,
            atTargetInBasket: atTarget,
            selected2F: false,
            coachPulse: pulseIds.has(it.id),
            noBasketHere: false,
            actionName: 'unload-item',
            swapBtnHtml,
          })}
        </div>
      `);
    } else if (is2FMeeting && rt.pending2FFloorItemId !== null) {
      cradlesHtml.push(`
        <div class="basket-cradle pickable-cradle" data-action="confirm-2f-basket" data-basket="${basket}">+</div>
      `);
    } else {
      cradlesHtml.push(`<div class="basket-cradle empty-cradle"></div>`);
    }
  }

  return `
    <div class="basket-bridle-wrap">${renderBasketBridleSvg()}</div>
    <div class="basket-wood-box">
      <div class="basket-mass-header">
        <span class="basket-dir-tag ${canPullAny ? 'can-pull' : ''}">${dirIcon}</span>
        <span class="mass-bar-cells">${cellsHtml.join('')}</span>
      </div>
      <div class="basket-slots-stack">
        ${cradlesHtml.join('')}
      </div>
      <div class="basket-grip-bar" aria-hidden="true">
        <span class="grip-notch"></span>
        <span class="grip-notch"></span>
      </div>
    </div>
  `;
}

function renderPlatformInterior(
  level: LevelSpec,
  rt: AppRuntime,
  ev: EvaluationSummary,
  floor: Floor,
  pulseIds: Set<string>
): string {
  const floorItems = getItemsOnFloor(level, rt.state, floor);
  const is2FActive = floor === 2 && ev.floorA === 2;
  const hasAnyBasketHere = ev.floorA === floor || ev.floorB === floor;

  const itemBlocks = floorItems.map((it) =>
    renderPhysicalCargoBlock(it, {
      inCradle: false,
      deliveredOnFloor: it.targetFloor === floor,
      atTargetInBasket: false,
      selected2F: rt.pending2FFloorItemId === it.id,
      coachPulse: pulseIds.has(it.id),
      noBasketHere: !hasAnyBasketHere && it.targetFloor !== floor,
      inFlightHidden: rt.inFlightIds.has(it.id),
      justSettledPop: rt.settledPopIds.has(it.id),
      actionName: 'tap-floor-item',
    })
  );

  const missingTargets = level.items.filter((it) => {
    if (it.targetFloor !== floor) return false;
    if (rt.inFlightIds.has(it.id)) return true;
    const loc = rt.state.locations[it.id];
    return !(loc.kind === 'floor' && loc.floor === floor);
  });

  const sockets = missingTargets.map((it) => renderSilhouetteSocket(it, floor));

  return `
    <div class="platform-top-row">
      <span class="floor-watermark">${floor}F</span>
      ${is2FActive ? `<span class="meeting-mark">⇄</span>` : ''}
    </div>
    ${sockets.length > 0 ? `<div class="wall-target-niches">${sockets.join('')}</div>` : '<div class="wall-target-spacer"></div>'}
    <div class="floor-plank-stage">
      ${itemBlocks.join('')}
    </div>
    <div class="timber-floor-plank" aria-hidden="true">
      <span class="iron-strap"></span>
      <span class="iron-strap"></span>
    </div>
  `;
}

/**
 * 渲染无文字手指滑动示意（同时驱动第 1 关新手引导与全关卡 💡 锦囊手势提示）
 */
function renderTutorialOverlay(
  refs: SkeletonRefs,
  rt: AppRuntime,
  gesture: HintGestureAction | null
): void {
  if (!gesture || rt.isUserDragging || rt.isAutoSettling || rt.modal !== 'none') {
    refs.tutorialLayer.className = 'tutorial-layer hidden';
    refs.tutorialLayer.innerHTML = '';
    return;
  }

  const frameRect = refs.hoistFrame.getBoundingClientRect();
  const stageRect = refs.stageBody.getBoundingClientRect();
  if (frameRect.width <= 0 || stageRect.height <= 0) {
    refs.tutorialLayer.className = 'tutorial-layer hidden';
    return;
  }

  const stageOffsetTop = stageRect.top - frameRect.top;
  const oneFloorH = stageRect.height / 3;
  const shaftW = refs.basketLeft.offsetWidth + 8 || 112;

  const basketCenterX = (b: BasketId) => (b === 'A' ? shaftW * 0.5 : frameRect.width - shaftW * 0.5);
  const floorCenterY = (f: Floor) => stageOffsetTop + (3 - f + 0.54) * oneFloorH;

  let x0 = 0;
  let y0 = 0;
  let x1 = 0;
  let y1 = 0;

  if (gesture.type === 'drag-basket') {
    x0 = basketCenterX(gesture.basket);
    x1 = x0;
    y0 = floorCenterY(gesture.fromFloor);
    y1 = floorCenterY(gesture.toFloor);
  } else if (gesture.type === 'item-to-basket') {
    const itemEl = refs.stageBody.querySelector<HTMLElement>(`[data-item-id="${gesture.itemId}"]`);
    if (!itemEl) {
      refs.tutorialLayer.className = 'tutorial-layer hidden';
      return;
    }
    const r = itemEl.getBoundingClientRect();
    x0 = r.left - frameRect.left + r.width * 0.5;
    y0 = r.top - frameRect.top + r.height * 0.55;
    const targetBasketFloor = getBasketFloor(rt.state, gesture.basket);
    x1 = basketCenterX(gesture.basket);
    y1 = floorCenterY(targetBasketFloor);
  } else if (gesture.type === 'unload-from-basket') {
    const { basket, floor, itemId } = gesture;
    const lv = getActiveLevel(rt);
    const inBasket = getItemsInBasket(lv, rt.state, basket);
    const slotIdx = Math.max(0, inBasket.findIndex((i) => i.id === itemId));
    const slotFrac = lv.basketCapacity <= 1 ? 0.54 : slotIdx === 0 ? 0.42 : 0.78;
    x0 = basketCenterX(basket);
    y0 = stageOffsetTop + (3 - floor + slotFrac) * oneFloorH;
    const socketEl = refs.platforms[floor].querySelector<HTMLElement>(`[data-socket-item="${itemId}"]`);
    if (socketEl) {
      const sr = socketEl.getBoundingClientRect();
      x1 = sr.left - frameRect.left + sr.width * 0.5;
      y1 = sr.top - frameRect.top + sr.height * 0.55;
    } else {
      x1 = frameRect.width * 0.5;
      y1 = stageOffsetTop + (3 - floor + 0.78) * oneFloorH;
    }
  } else if (gesture.type === 'basket-to-basket') {
    const lv = getActiveLevel(rt);
    const inBasket = getItemsInBasket(lv, rt.state, gesture.fromBasket);
    const slotIdx = Math.max(0, inBasket.findIndex((i) => i.id === gesture.itemId));
    const slotFrac = lv.basketCapacity <= 1 ? 0.54 : slotIdx === 0 ? 0.42 : 0.78;
    x0 = basketCenterX(gesture.fromBasket);
    y0 = stageOffsetTop + (3 - 2 + slotFrac) * oneFloorH;
    x1 = basketCenterX(gesture.toBasket);
    y1 = floorCenterY(2);
  }

  const dx = Math.round(x1 - x0);
  const dy = Math.round(y1 - y0);

  refs.tutorialLayer.className = 'tutorial-layer';
  refs.tutorialLayer.innerHTML = `
    <div class="tut-hand-anchor mode-glide" style="left:${Math.round(x0)}px;top:${Math.round(y0)}px;--dx:${dx}px;--dy:${dy}px;">
      ${renderTutorialHandSvg()}
    </div>
  `;
}

function renderModalLayer(level: LevelSpec, rt: AppRuntime, ev: EvaluationSummary): string {
  if (rt.modal === 'none') return '';

  if (rt.modal === 'result' && rt.settledGrade) {
    const isExc = rt.settledGrade === 'excellent';
    const nextIdx = LEVELS.findIndex((l) => l.id === level.id) + 1;
    const hasNext = level.id !== 'custom' && nextIdx > 0 && nextIdx < LEVELS.length;

    const sealLabel = isExc
      ? ev.isParPerfect
        ? '★★★ 优秀 · 最优通关'
        : '★★★ 优秀'
      : '★★☆ 达标';

    return `<div class="modal-backdrop" data-action="close-modal-backdrop">
      <div class="modal-card" style="text-align:center;">
        <span class="grade-seal ${isExc ? 'excellent' : 'pass'}">${sealLabel}</span>
        <h2 class="modal-title">${level.index}. ${escapeHtml(level.title)}</h2>
        <div class="modal-stats">
          <div class="stat-box">
            <div class="stat-label">滑轮升降</div>
            <div class="stat-value">${rt.state.ropeMoves} <span style="font-size:12px;color:var(--ink-muted);">/ ${level.parRopeMoves}</span></div>
          </div>
          <div class="stat-box">
            <div class="stat-label">归位货物</div>
            <div class="stat-value">${ev.deliveredCargo} / ${ev.totalCargo}</div>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary-btn" data-action="restart-level">${UI_ICONS.reset} 重玩</button>
          ${
            hasNext
              ? `<button type="button" class="primary-btn" data-action="select-level" data-level-id="${LEVELS[nextIdx].id}">下一关 →</button>`
              : `<button type="button" class="primary-btn" data-action="open-modal" data-modal="levels">选关</button>`
          }
        </div>
      </div>
    </div>`;
  }

  if (rt.modal === 'levels') {
    const ch1 = LEVELS.filter((l) => l.chapter === 1);
    const ch2 = LEVELS.filter((l) => l.chapter === 2);

    const renderCards = (arr: LevelSpec[]) =>
      arr
        .map((lv) => {
          const rec = rt.profile.records[lv.id];
          let badge = '<span style="color:var(--ink-muted);font-weight:700;">—</span>';
          if (rec?.bestGrade === 'excellent') {
            const star = rec.bestRopeMoves !== null && rec.bestRopeMoves <= lv.parRopeMoves ? '★★★' : '★★☆';
            badge = `<span style="color:var(--fl1-color);">${star}</span>`;
          } else if (rec?.bestGrade === 'pass') {
            badge = `<span style="color:var(--fl2-color);">★☆☆</span>`;
          }
          return `<button type="button" class="level-card-btn ${lv.id === level.id ? 'active' : ''}" data-action="select-level" data-level-id="${lv.id}">
            <div class="level-card-top">
              <span>${lv.index}. ${escapeHtml(lv.title)}</span>
              ${badge}
            </div>
          </button>`;
        })
        .join('');

    return `<div class="modal-backdrop" data-action="close-modal-backdrop">
      <div class="modal-card">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h2 class="modal-title" style="margin:0;">选择关卡</h2>
          <button type="button" class="secondary-btn" style="flex:0;padding:4px 10px;font-size:12px;" data-action="open-modal" data-modal="lab">工坊</button>
        </div>
        <div class="chapter-heading">第一章 · 初试绳机</div>
        <div class="level-grid">${renderCards(ch1)}</div>
        <div class="chapter-heading">第二章 · 秤砣与四件货</div>
        <div class="level-grid">${renderCards(ch2)}</div>
        <div class="modal-actions">
          <button type="button" class="primary-btn" data-action="close-modal">继续</button>
        </div>
      </div>
    </div>`;
  }

  if (rt.modal === 'help') {
    return `<div class="modal-backdrop" data-action="close-modal-backdrop">
      <div class="modal-card">
        <h2 class="modal-title">图解玩法</h2>
        <div class="visual-rules-grid">
          <div class="visual-rule-item">
            <span class="vr-icon" style="font-weight:900;">1 + 2 = 3</span>
            <div><strong>袋数即重量</strong>：下坠筐总袋数 ≥ 上升筐总袋数才能拉动；彩绳代表目标楼层。</div>
          </div>
          <div class="visual-rule-item">
            <span class="vr-icon" style="font-weight:900;">↕</span>
            <div><strong>直接拖吊筐</strong>：上下拖动任一吊筐，两筐反向联动升降。</div>
          </div>
          <div class="visual-rule-item">
            <span class="vr-icon" style="font-weight:900;">⇄</span>
            <div><strong>二楼中途卸</strong>：交汇在中间层时卸货归位，或点 <code>⇄</code> 换筐。</div>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary-btn" data-action="replay-tutorial">${UI_ICONS.handReplay} 手势引导</button>
          <button type="button" class="primary-btn" data-action="close-modal">知道了</button>
        </div>
      </div>
    </div>`;
  }

  const rowsHtml = rt.labDraft.items
    .map(
      (it, idx) => `<div class="lab-row">
      <input class="lab-input" type="text" value="${escapeHtml(it.name)}" data-lab-field="name" data-idx="${idx}" />
      <select class="lab-select" data-lab-field="weight" data-idx="${idx}">
        ${[1, 2, 3].map((w) => `<option value="${w}" ${it.weight === w ? 'selected' : ''}>${w}袋</option>`).join('')}
      </select>
      <select class="lab-select" data-lab-field="start" data-idx="${idx}">
        ${[1, 2, 3].map((f) => `<option value="${f}" ${it.startFloor === f ? 'selected' : ''}>起${f}F</option>`).join('')}
      </select>
      <select class="lab-select" data-lab-field="target" data-idx="${idx}">
        <option value="0" ${it.targetFloor === null ? 'selected' : ''}>秤砣</option>
        ${[1, 2, 3].map((f) => `<option value="${f}" ${it.targetFloor === f ? 'selected' : ''}>至${f}F</option>`).join('')}
      </select>
      <button type="button" class="inline-pill-btn" data-action="lab-remove-item" data-idx="${idx}">✕</button>
    </div>`
    )
    .join('');

  return `<div class="modal-backdrop" data-action="close-modal-backdrop">
    <div class="modal-card">
      <h2 class="modal-title">参数校准工坊</h2>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;font-size:12px;font-weight:800;">
        <span>筐容量：</span>
        <select class="lab-select" style="width:92px;" id="lab-capacity-select">
          ${[1, 2, 3].map((c) => `<option value="${c}" ${rt.labDraft.basketCapacity === c ? 'selected' : ''}>${c} 件</option>`).join('')}
        </select>
        <button type="button" class="secondary-btn" style="flex:0;padding:4px 8px;font-size:12px;" data-action="lab-add-item">+ 货物</button>
      </div>
      <div>${rowsHtml}</div>
      ${
        rt.labDraft.auditNote
          ? `<div style="margin:8px 0;padding:7px 9px;border-radius:6px;background:rgba(255,255,255,0.65);font-size:12px;">${escapeHtml(rt.labDraft.auditNote)}</div>`
          : ''
      }
      <div class="modal-actions">
        <button type="button" class="secondary-btn" data-action="close-modal">取消</button>
        <button type="button" class="primary-btn" data-action="lab-apply">校验并试玩</button>
      </div>
    </div>
  </div>`;
}

function syncDom(refs: SkeletonRefs, rt: AppRuntime): void {
  const level = getActiveLevel(rt);
  const ev = evaluateState(level, rt.state);
  const solverInfo = analyzePosition(level, rt.state);
  const gesture = resolveActiveGesture(level, rt);
  const pulseIds = gesture ? new Set<string>(gesture.pulseItemIds) : new Set<string>();

  // 1. 极简无字感顶部栏（飞行途中的货物落地瞬间才点亮进度圆点，反馈更精准）
  const visibleDelivered = Math.max(0, ev.deliveredCargo - rt.inFlightIds.size);
  const goalDots: string[] = [];
  for (let i = 0; i < ev.totalCargo; i++) {
    goalDots.push(`<span class="goal-dot ${i < visibleDelivered ? 'done' : ''}"></span>`);
  }

  refs.topBar.innerHTML = `
    <button type="button" id="btn-open-levels" class="brand-level-btn" data-action="open-modal" data-modal="levels">
      <span class="chapter-tag">${level.id === 'custom' ? '工坊' : `${level.index}/10`}</span>
      <span>${escapeHtml(level.title)} ▾</span>
    </button>
    <div class="top-metrics">
      <span class="goal-dots-chip" title="${visibleDelivered}/${ev.totalCargo}">${goalDots.join('')}</span>
      <span class="metric-chip" title="滑轮次数">${UI_ICONS.pulleyMini} <strong>${rt.state.ropeMoves}</strong>/${level.parRopeMoves}</span>
      <button type="button" id="btn-toggle-sound" class="icon-btn" data-action="toggle-sound" aria-label="音效">${rt.profile.muted ? UI_ICONS.soundOff : UI_ICONS.soundOn}</button>
      <button type="button" id="btn-open-help" class="icon-btn" data-action="open-modal" data-modal="help" aria-label="引导">?</button>
    </div>
  `;

  // 2. 屏幕居中轻提示卡片（右上角带关闭按钮，不遮挡顶部滑轮天平；关闭死局提示后不再反复打扰）
  if (solverInfo.canReachExcellent) {
    rt.deadlockDismissed = false;
  }

  if (rt.toastOverride) {
    refs.floatingToast.className = `floating-toast ${rt.toastOverride.kind}`;
    refs.floatingToast.innerHTML = `
      <button type="button" class="toast-close-btn" data-action="dismiss-toast" aria-label="关闭">✕</button>
      <div class="toast-body-text">${escapeHtml(rt.toastOverride.text)}</div>
    `;
  } else if (!solverInfo.canReachExcellent && ev.grade !== 'excellent' && !rt.deadlockDismissed) {
    refs.floatingToast.className = 'floating-toast warn';
    refs.floatingToast.innerHTML = `
      <button type="button" class="toast-close-btn" data-action="dismiss-toast" aria-label="关闭">✕</button>
      <div class="toast-body-text">${ev.grade === 'pass' ? `配重已用尽（已达标 ${ev.deliveredCargo}/${ev.totalCargo}）` : '高处配重已耗尽，请退回一步'}</div>
      ${rt.state.history.length > 0 ? `<div class="toast-actions"><button type="button" class="inline-pill-btn" data-action="undo">${UI_ICONS.undo} 退回一步</button></div>` : ''}
    `;
  } else {
    refs.floatingToast.className = 'floating-toast hidden';
    refs.floatingToast.innerHTML = '';
  }

  // 3. 滑轮、黄铜天平与双筐位置
  refs.wheelLeft.style.transform = `rotate(${rt.pulleyAngle}deg)`;
  refs.wheelRight.style.transform = `rotate(${rt.pulleyAngle}deg)`;

  refs.seesawWidget.className = `seesaw-widget ${rt.strainAnim ? 'flash-blocked' : ''}`;
  refs.seesawWidget.innerHTML = renderBrassDialGaugeHtml(ev.weightA, ev.weightB);

  const rowIdxA = 3 - ev.floorA;
  const rowIdxB = 3 - ev.floorB;

  refs.ropeLeft.style.height = `calc(${rowIdxA * 33.3333}% + 6px)`;
  refs.ropeRight.style.height = `calc(${rowIdxB * 33.3333}% + 6px)`;

  refs.basketLeft.style.top = `calc(${rowIdxA * 33.3333}% + 3px)`;
  refs.basketRight.style.top = `calc(${rowIdxB * 33.3333}% + 3px)`;

  const leftStrain =
    rt.strainAnim?.downBasket === 'A' ? 'strain-down' : rt.strainAnim?.upBasket === 'A' ? 'strain-up' : '';
  const rightStrain =
    rt.strainAnim?.downBasket === 'B' ? 'strain-down' : rt.strainAnim?.upBasket === 'B' ? 'strain-up' : '';

  const nonEmpty = ev.weightA > 0 || ev.weightB > 0;
  const leftPullCls = nonEmpty && ev.canMoveADown ? 'pullable-down' : nonEmpty && ev.canMoveAUp ? 'pullable-up' : '';
  const rightPullCls = nonEmpty && ev.canMoveAUp ? 'pullable-down' : nonEmpty && ev.canMoveADown ? 'pullable-up' : '';

  refs.basketLeft.className = `basket-carriage basket-carriage-left ${leftPullCls} ${leftStrain}`;
  refs.basketRight.className = `basket-carriage basket-carriage-right ${rightPullCls} ${rightStrain}`;

  refs.basketLeft.innerHTML = renderBasketInterior(level, rt, ev, 'A', ev.floorA, pulseIds);
  refs.basketRight.innerHTML = renderBasketInterior(level, rt, ev, 'B', ev.floorB, pulseIds);

  // 4. 三层房间与橡木楼板
  for (const fl of [3, 2, 1] as Floor[]) {
    refs.platforms[fl].innerHTML = renderPlatformInterior(level, rt, ev, fl, pulseIds);
  }

  // 5. 极简纯图标底部栏
  const canSettlePass = ev.grade === 'pass';
  refs.utilityRow.innerHTML = `
    <button type="button" id="btn-undo" class="util-btn" title="撤销" aria-label="撤销" data-action="undo" ${rt.state.history.length === 0 ? 'disabled' : ''}>${UI_ICONS.undo}</button>
    <button type="button" id="btn-reset" class="util-btn" title="重置" aria-label="重置" data-action="restart-level">${UI_ICONS.reset}</button>
    <button type="button" id="btn-hint" class="util-btn ${rt.hintActive ? 'hint-active' : ''}" title="手势提示" aria-label="手势提示" data-action="show-hint">${UI_ICONS.bulb}</button>
    <button type="button" id="btn-settle-pass" class="util-btn ${canSettlePass ? 'pass-settle' : ''}" title="达标结算" aria-label="达标结算" data-action="settle-pass" ${canSettlePass ? '' : 'disabled'}>${UI_ICONS.flag}${canSettlePass ? `<span>${ev.deliveredCargo}/${ev.totalCargo}</span>` : ''}</button>
  `;

  // 6. 弹窗层
  refs.modalLayer.innerHTML = renderModalLayer(level, rt, ev);

  // 7. 无文字小手新手引导层
  requestAnimationFrame(() => {
    renderTutorialOverlay(refs, rt, gesture);
  });
}

/**
 * 统一手势引擎：
 * - 垂直拖动左/右吊筐或竖井绳索 → 实时双筐反向联动升降（配重不足时呈现橡皮筋绷紧回弹阻力！）
 * - 水平拖动或轻点货块 → 装筐 / 卸货 / 2F 换筐
 */
function bindUnifiedStageGestures(
  root: HTMLElement,
  refs: SkeletonRefs,
  rt: AppRuntime,
  callbacks: {
    onCargoDrop: (itemId: string, target: { basket?: BasketId; floor?: Floor }) => void;
    onElevatorMove: (dir: MoveDirection, draggedRatio?: number) => void;
    onBlockedPull: (downBasket: BasketId, upBasket: BasketId) => void;
    rerender: () => void;
  }
): void {
  let activePointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let dragItemId: string | null = null;
  let basketSide: BasketId | null = null;
  let gestureMode: 'none' | 'undecided' | 'elevator' | 'cargo' = 'none';
  let lastRawDeltaA = 0;
  let lastEffectiveDeltaA = 0;
  let ghostEl: HTMLElement | null = null;
  let activeDropEl: HTMLElement | null = null;
  let suppressNextClick = false;

  const cleanupGesture = () => {
    if (ghostEl && ghostEl.parentNode) {
      ghostEl.parentNode.removeChild(ghostEl);
    }
    if (activeDropEl) {
      activeDropEl.classList.remove('drop-highlight');
    }
    refs.hoistFrame.classList.remove('is-dragging-rope');
    rt.isUserDragging = false;
    activePointerId = null;
    dragItemId = null;
    basketSide = null;
    gestureMode = 'none';
    lastRawDeltaA = 0;
    lastEffectiveDeltaA = 0;
    ghostEl = null;
    activeDropEl = null;
  };

  root.addEventListener(
    'click',
    (e) => {
      if (suppressNextClick) {
        e.stopPropagation();
        e.preventDefault();
        suppressNextClick = false;
      }
    },
    true
  );

  refs.stageBody.addEventListener('pointerdown', (e) => {
    if (rt.modal !== 'none' || rt.isAutoSettling || activePointerId !== null) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('[data-action="swap-2f"], [data-action="confirm-2f-basket"]')) return;

    const card = target.closest<HTMLElement>('[data-drag-item]');
    const inLeftShaft = Boolean(target.closest('#sk-basket-left, .shaft-bg-left'));
    const inRightShaft = Boolean(target.closest('#sk-basket-right, .shaft-bg-right'));

    dragItemId = card?.dataset.dragItem || null;
    basketSide = inLeftShaft ? 'A' : inRightShaft ? 'B' : null;

    if (!dragItemId && !basketSide) return;

    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    gestureMode = 'undecided';
    lastRawDeltaA = 0;
    lastEffectiveDeltaA = 0;
  });

  window.addEventListener('pointermove', (e) => {
    if (activePointerId === null || e.pointerId !== activePointerId) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (gestureMode === 'undecided' && dx * dx + dy * dy > 64) {
      // 垂直拉动井道或吊筐 → 触发滑轮升降手势；水平拖动货件 → 触发货物搬运手势
      if (basketSide !== null && (!dragItemId || Math.abs(dy) > Math.abs(dx) * 1.15)) {
        gestureMode = 'elevator';
        rt.isUserDragging = true;
        refs.hoistFrame.classList.add('is-dragging-rope');
        refs.tutorialLayer.classList.add('hidden');
      } else if (dragItemId !== null) {
        gestureMode = 'cargo';
        rt.isUserDragging = true;
        refs.tutorialLayer.classList.add('hidden');
        const lv = getActiveLevel(rt);
        const item = lv.items.find((i) => i.id === dragItemId);
        if (item) {
          const tier = clampTier(item.weight);
          const isIron = item.targetFloor === null;
          ghostEl = document.createElement('div');
          ghostEl.className = `physical-cargo w-tier-${tier} drag-ghost`;
          ghostEl.innerHTML = `
            <div class="cargo-art-wrap">${renderStandardCargoSvg(tier, item.targetFloor, false)}</div>
            <div class="cargo-pallet-wrap">${renderWoodPalletPlinthSvg(tier, isIron)}</div>
          `;
          document.body.appendChild(ghostEl);
        }
      } else {
        cleanupGesture();
        return;
      }
    }

    if (gestureMode === 'elevator' && basketSide !== null) {
      const stageH = refs.stageBody.getBoundingClientRect().height || 480;
      const oneFloorPx = stageH / 3;
      const rawDeltaA = basketSide === 'A' ? dy : -dy;
      lastRawDeltaA = rawDeltaA;

      const lv = getActiveLevel(rt);
      const ev = evaluateState(lv, rt.state);

      let effDeltaA = 0;
      let straining = false;

      if (rawDeltaA < 0) {
        // 试图让左筐(A)上升、右筐(B)下降
        if (ev.floorA >= 3) {
          effDeltaA = -Math.tanh(-rawDeltaA / 28) * 6;
        } else if (!ev.canMoveAUp) {
          effDeltaA = -Math.tanh(-rawDeltaA / 40) * 16;
          straining = -rawDeltaA > 14;
        } else {
          effDeltaA = Math.max(-oneFloorPx, rawDeltaA);
        }
      } else {
        // 试图让左筐(A)下降、右筐(B)上升
        if (ev.floorA <= 1) {
          effDeltaA = Math.tanh(rawDeltaA / 28) * 6;
        } else if (!ev.canMoveADown) {
          effDeltaA = Math.tanh(rawDeltaA / 40) * 16;
          straining = rawDeltaA > 14;
        } else {
          effDeltaA = Math.min(oneFloorPx, rawDeltaA);
        }
      }

      lastEffectiveDeltaA = effDeltaA;

      const baseTopA = (3 - ev.floorA) * oneFloorPx + 3;
      const baseTopB = (3 - ev.floorB) * oneFloorPx + 3;

      refs.basketLeft.style.top = `${baseTopA + effDeltaA}px`;
      refs.basketRight.style.top = `${baseTopB - effDeltaA}px`;
      refs.ropeLeft.style.height = `${baseTopA + effDeltaA + 3}px`;
      refs.ropeRight.style.height = `${baseTopB - effDeltaA + 3}px`;

      const liveAngle = rt.pulleyAngle + (effDeltaA / oneFloorPx) * 120;
      refs.wheelLeft.style.transform = `rotate(${liveAngle}deg)`;
      refs.wheelRight.style.transform = `rotate(${liveAngle}deg)`;
      refs.seesawWidget.classList.toggle('flash-blocked', straining);
      return;
    }

    if (gestureMode === 'cargo' && ghostEl) {
      ghostEl.style.left = `${e.clientX}px`;
      ghostEl.style.top = `${e.clientY}px`;

      const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const dropZone = hit?.closest<HTMLElement>('[data-drop-basket], [data-drop-floor]') || null;
      if (activeDropEl && activeDropEl !== dropZone) {
        activeDropEl.classList.remove('drop-highlight');
      }
      if (dropZone) {
        dropZone.classList.add('drop-highlight');
      }
      activeDropEl = dropZone;
    }
  });

  const finishGesture = (e: PointerEvent) => {
    if (activePointerId === null || e.pointerId !== activePointerId) return;

    if (gestureMode === 'elevator') {
      suppressNextClick = true;
      const stageH = refs.stageBody.getBoundingClientRect().height || 480;
      const oneFloorPx = Math.max(1, stageH / 3);
      const threshold = oneFloorPx * 0.24;
      const raw = lastRawDeltaA;
      const eff = lastEffectiveDeltaA;
      const draggedRatio = Math.min(1, Math.abs(eff) / oneFloorPx);

      const lv = getActiveLevel(rt);
      const ev = evaluateState(lv, rt.state);

      cleanupGesture();

      if (eff <= -threshold && ev.canMoveAUp) {
        callbacks.onElevatorMove('A_UP', draggedRatio);
      } else if (eff >= threshold && ev.canMoveADown) {
        callbacks.onElevatorMove('A_DOWN', draggedRatio);
      } else if (raw < -18 && ev.floorA < 3 && !ev.canMoveAUp) {
        callbacks.onBlockedPull('B', 'A');
      } else if (raw > 18 && ev.floorA > 1 && !ev.canMoveADown) {
        callbacks.onBlockedPull('A', 'B');
      } else {
        callbacks.rerender();
      }
      return;
    }

    if (gestureMode === 'cargo' && dragItemId) {
      suppressNextClick = true;
      const id = dragItemId;
      const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const basketZone = hit?.closest<HTMLElement>('[data-drop-basket]');
      const floorZone = hit?.closest<HTMLElement>('[data-drop-floor]');
      cleanupGesture();

      if (basketZone?.dataset.dropBasket) {
        callbacks.onCargoDrop(id, { basket: basketZone.dataset.dropBasket as BasketId });
      } else if (floorZone?.dataset.dropFloor) {
        callbacks.onCargoDrop(id, { floor: Number(floorZone.dataset.dropFloor) as Floor });
      } else {
        callbacks.rerender();
      }
      return;
    }

    cleanupGesture();
  };

  window.addEventListener('pointerup', finishGesture);
  window.addEventListener('pointercancel', cleanupGesture);
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;

  const insets = await getSafeAreaInsets();
  document.documentElement.style.setProperty('--safe-top', `${insets.top}px`);
  document.documentElement.style.setProperty('--safe-bottom', `${insets.bottom}px`);
  document.documentElement.style.setProperty('--capsule-right', `${insets.capsuleRightReserve}px`);

  const profile = await loadJsonData<SaveProfile>(STORAGE_KEY, createDefaultProfile());
  sound.setMuted(Boolean(profile.muted));

  const startLevel = getLevelById(profile.currentLevelId);

  const rt: AppRuntime = {
    profile,
    customLevel: null,
    state: createGameState(startLevel),
    modal: 'none',
    settledGrade: null,
    toastOverride: null,
    deadlockDismissed: false,
    hintActive: false,
    pending2FFloorItemId: null,
    pulleyAngle: 0,
    strainAnim: null,
    isUserDragging: false,
    isAutoSettling: false,
    inFlightIds: new Set(),
    settledPopIds: new Set(),
    replayTutorial: false,
    labDraft: {
      basketCapacity: 2,
      items: startLevel.items.map((it) => ({
        name: it.name,
        weight: clampTier(it.weight),
        startFloor: it.startFloor,
        targetFloor: it.targetFloor,
      })),
      auditNote: '',
    },
  };

  const refs = mountSkeleton(root);
  const rerender = () => syncDom(refs, rt);

  let autoTimers: number[] = [];
  let autoRafs: number[] = [];
  let autoClones: HTMLElement[] = [];

  const cancelAutoSettle = () => {
    for (const tid of autoTimers) window.clearTimeout(tid);
    for (const rid of autoRafs) window.cancelAnimationFrame(rid);
    for (const el of autoClones) {
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    autoTimers = [];
    autoRafs = [];
    autoClones = [];
    rt.isAutoSettling = false;
    rt.inFlightIds.clear();
    rt.settledPopIds.clear();
  };

  const checkAutoWin = () => {
    const lv = getActiveLevel(rt);
    const ev = evaluateState(lv, rt.state);
    if (ev.grade === 'excellent') {
      recordCompletion(rt, lv, 'excellent');
      rt.settledGrade = 'excellent';
      rt.modal = 'result';
      sound.playWinChime(true);
      void triggerHaptic('heavy');
    }
  };

  const animateCargoFlightToFloor = (
    item: ItemSpec,
    fromRect: DOMRect | null,
    toRect: DOMRect | null,
    durationMs: number,
    onLanded: () => void
  ) => {
    if (!fromRect || !toRect || fromRect.width <= 0 || toRect.width <= 0) {
      const tid = window.setTimeout(onLanded, 110);
      autoTimers.push(tid);
      return;
    }

    const tier = clampTier(item.weight);
    const isIron = item.targetFloor === null;
    const clone = document.createElement('div');
    clone.className = `physical-cargo w-tier-${tier} auto-fly-clone`;
    clone.style.left = `${fromRect.left}px`;
    clone.style.top = `${fromRect.top}px`;
    clone.style.width = `${fromRect.width}px`;
    clone.innerHTML = `
      <div class="cargo-art-wrap">${renderStandardCargoSvg(tier, item.targetFloor, false)}</div>
      <div class="cargo-pallet-wrap">${renderWoodPalletPlinthSvg(tier, isIron)}</div>
    `;
    document.body.appendChild(clone);
    autoClones.push(clone);

    const dx = toRect.left + (toRect.width - fromRect.width) * 0.5 - fromRect.left;
    const dy = toRect.top + (toRect.height - fromRect.height) * 0.5 - fromRect.top;
    const bankSign = dx >= 0 ? 1 : -1;
    const startTs = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - startTs) / durationMs));
      const ease = 1 - Math.pow(1 - t, 3);
      const arcY = -Math.sin(Math.PI * t) * 28;
      const tiltDeg = Math.sin(Math.PI * t) * 7 * bankSign;
      const scale = 1 + Math.sin(Math.PI * t) * 0.08;
      clone.style.transform = `translate3d(${(dx * ease).toFixed(1)}px, ${(dy * ease + arcY).toFixed(1)}px, 0) rotate(${tiltDeg.toFixed(1)}deg) scale(${scale.toFixed(3)})`;

      if (t < 1) {
        const rid = window.requestAnimationFrame(step);
        autoRafs.push(rid);
      } else {
        if (clone.parentNode) clone.parentNode.removeChild(clone);
        autoClones = autoClones.filter((c) => c !== clone);
        onLanded();
      }
    };

    const rid = window.requestAnimationFrame(step);
    autoRafs.push(rid);
  };

  /**
   * 【边界 A 自动归位演出】：
   * 滑轮停稳后，已抵达目标楼层的筐内货物按自上而下顺序跃出吊筐、沿抛物线落回楼板归位，全部落定后弹出过关结算。
   */
  const runAutoSettleSequence = (lv: LevelSpec, queue: ItemSpec[], initialDelayMs: number) => {
    const staggerMs = 175;
    const flightMs = 330;

    queue.forEach((item, idx) => {
      const launchTid = window.setTimeout(() => {
        const sourceEl = refs.stageBody.querySelector<HTMLElement>(`[data-item-id="${item.id}"]`);
        const fromRect = sourceEl ? sourceEl.getBoundingClientRect() : null;

        rt.inFlightIds.add(item.id);
        rt.state = settleTargetItemFromBasket(lv, rt.state, item.id);
        rerender();

        const destEl = refs.stageBody.querySelector<HTMLElement>(`[data-item-id="${item.id}"]`);
        const toRect = destEl ? destEl.getBoundingClientRect() : null;

        animateCargoFlightToFloor(item, fromRect, toRect, flightMs, () => {
          rt.inFlightIds.delete(item.id);
          rt.settledPopIds.add(item.id);
          sound.playWoodTap(1.06 + idx * 0.12);
          void triggerHaptic('light');
          rerender();
        });
      }, initialDelayMs + idx * staggerMs);
      autoTimers.push(launchTid);
    });

    const settleDoneMs = initialDelayMs + (queue.length - 1) * staggerMs + flightMs + 260;
    const finalTid = window.setTimeout(() => {
      rt.isAutoSettling = false;
      rt.settledPopIds.clear();
      checkAutoWin();
      rerender();
    }, settleDoneMs);
    autoTimers.push(finalTid);
  };

  const executeElevatorMove = (dir: MoveDirection, draggedRatio = 0) => {
    const lv = getActiveLevel(rt);
    rt.pending2FFloorItemId = null;
    const res = moveBaskets(lv, rt.state, dir);
    if (res.ok) {
      rt.state = res.state;
      rt.toastOverride = null;
      rt.hintActive = false;
      rt.pulleyAngle += dir === 'A_UP' ? -120 : 120;
      sound.playPulleyHoist();
      void triggerHaptic('medium');

      const autoQueue = getAutoUnloadItems(lv, rt.state);
      if (autoQueue.length > 0) {
        cancelAutoSettle();
        rt.isAutoSettling = true;
        rerender();
        const arriveDelayMs = Math.round(130 + (1 - Math.max(0, Math.min(1, draggedRatio))) * 290);
        runAutoSettleSequence(lv, autoQueue, arriveDelayMs);
      } else {
        rerender();
      }
    } else {
      const downSide: BasketId = dir === 'A_UP' ? 'B' : 'A';
      const upSide: BasketId = dir === 'A_UP' ? 'A' : 'B';
      triggerBlockedFeedback(downSide, upSide);
    }
  };

  const triggerBlockedFeedback = (downBasket: BasketId, upBasket: BasketId) => {
    rt.strainAnim = { downBasket, upBasket };
    sound.playBlockedTug();
    void triggerHaptic('heavy');
    rerender();
    window.setTimeout(() => {
      rt.strainAnim = null;
      rerender();
    }, 420);
  };

  const syncLabInputsFromDom = () => {
    const capEl = root.querySelector('#lab-capacity-select') as HTMLSelectElement | null;
    if (capEl) {
      rt.labDraft.basketCapacity = Number(capEl.value) || 2;
    }
    root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-lab-field]').forEach((el) => {
      const idx = Number(el.dataset.idx);
      const field = el.dataset.labField;
      const item = rt.labDraft.items[idx];
      if (!item) return;
      if (field === 'name') item.name = el.value.trim() || `货${idx + 1}`;
      if (field === 'weight') item.weight = clampTier(Number(el.value) || 1);
      if (field === 'start') item.startFloor = (Number(el.value) || 1) as Floor;
      if (field === 'target') {
        const v = Number(el.value);
        item.targetFloor = v === 0 ? null : (v as Floor);
      }
    });
  };

  bindUnifiedStageGestures(root, refs, rt, {
    rerender,
    onElevatorMove: executeElevatorMove,
    onBlockedPull: triggerBlockedFeedback,
    onCargoDrop: (itemId, target) => {
      const lv = getActiveLevel(rt);
      const loc = rt.state.locations[itemId];
      if (!loc) return;
      rt.pending2FFloorItemId = null;

      if (target.basket) {
        if (loc.kind === 'floor') {
          const res = loadItemToBasket(lv, rt.state, itemId, target.basket);
          if (res.ok) {
            rt.state = res.state;
            rt.toastOverride = null;
            sound.playWoodTap(0.95);
            void triggerHaptic('light');
          } else {
            sound.playBlockedTug();
          }
        } else if (loc.kind === 'basket' && loc.basket !== target.basket) {
          const res = transferItemBetweenBasketsAt2F(lv, rt.state, itemId);
          if (res.ok) {
            rt.state = res.state;
            rt.toastOverride = null;
            sound.playWoodTap(1.12);
            void triggerHaptic('light');
          } else {
            sound.playBlockedTug();
          }
        }
        rerender();
        return;
      }

      if (target.floor && loc.kind === 'basket') {
        const basketFloor = getBasketFloor(rt.state, loc.basket);
        if (basketFloor === target.floor) {
          const res = unloadItemFromBasket(lv, rt.state, itemId);
          if (res.ok) {
            rt.state = res.state;
            rt.toastOverride = null;
            sound.playWoodTap(1.08);
            void triggerHaptic('light');
            checkAutoWin();
          }
        } else {
          sound.playBlockedTug();
        }
        rerender();
      }
    },
  });

  // 支持桌面键盘上下键快捷升降
  window.addEventListener('keydown', (e) => {
    if (rt.modal !== 'none' || rt.isAutoSettling) return;
    if (e.key === 'ArrowUp' || e.key === 'w') {
      e.preventDefault();
      executeElevatorMove('A_UP', 0);
    } else if (e.key === 'ArrowDown' || e.key === 's') {
      e.preventDefault();
      executeElevatorMove('A_DOWN', 0);
    }
  });

  window.addEventListener('resize', () => {
    rerender();
  });

  root.addEventListener('click', (evt) => {
    if (rt.isAutoSettling) return;
    const target = (evt.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const lv = getActiveLevel(rt);

    if (action === 'dismiss-toast') {
      rt.toastOverride = null;
      rt.deadlockDismissed = true;
      sound.playWoodTap(0.95);
      rerender();
      return;
    }

    if (action === 'replay-tutorial') {
      cancelAutoSettle();
      const lv1 = getLevelById('lv01');
      rt.customLevel = null;
      rt.profile.currentLevelId = 'lv01';
      rt.state = createGameState(lv1);
      rt.pending2FFloorItemId = null;
      rt.modal = 'none';
      rt.settledGrade = null;
      rt.toastOverride = null;
      rt.deadlockDismissed = false;
      rt.replayTutorial = true;
      sound.playWoodTap(1.05);
      rerender();
      return;
    }

    if (action === 'confirm-2f-basket') {
      const basket = (target.dataset.basket === 'B' ? 'B' : 'A') as BasketId;
      const itemId = rt.pending2FFloorItemId;
      rt.pending2FFloorItemId = null;
      if (!itemId) {
        rerender();
        return;
      }
      const res = loadItemToBasket(lv, rt.state, itemId, basket);
      if (res.ok) {
        rt.state = res.state;
        rt.toastOverride = null;
        sound.playWoodTap(0.96);
        void triggerHaptic('light');
      } else {
        sound.playBlockedTug();
      }
      rerender();
      return;
    }

    if (action === 'swap-2f') {
      evt.stopPropagation();
      rt.pending2FFloorItemId = null;
      const itemId = target.dataset.itemId || '';
      const res = transferItemBetweenBasketsAt2F(lv, rt.state, itemId);
      if (res.ok) {
        rt.state = res.state;
        rt.toastOverride = null;
        sound.playWoodTap(1.12);
        void triggerHaptic('light');
      } else {
        sound.playBlockedTug();
      }
      rerender();
      return;
    }

    if (action === 'tap-floor-item') {
      const itemId = target.dataset.itemId || '';
      const loc = rt.state.locations[itemId];
      if (!loc || loc.kind !== 'floor') return;

      if (rt.state.floorA === 2 && loc.floor === 2) {
        const countA = getItemsInBasket(lv, rt.state, 'A').length;
        const countB = getItemsInBasket(lv, rt.state, 'B').length;
        if (countA < lv.basketCapacity && countB < lv.basketCapacity) {
          rt.pending2FFloorItemId = rt.pending2FFloorItemId === itemId ? null : itemId;
          rt.toastOverride = null;
          sound.playWoodTap(1.15);
          rerender();
          return;
        }
      }

      rt.pending2FFloorItemId = null;
      const res = loadItemToBasket(lv, rt.state, itemId);
      if (res.ok) {
        rt.state = res.state;
        rt.toastOverride = null;
        sound.playWoodTap(0.95);
        void triggerHaptic('light');
      } else {
        sound.playBlockedTug();
        void triggerHaptic('medium');
      }
      rerender();
      return;
    }

    if (action === 'unload-item') {
      rt.pending2FFloorItemId = null;
      const itemId = target.dataset.itemId || '';
      const res = unloadItemFromBasket(lv, rt.state, itemId);
      if (res.ok) {
        rt.state = res.state;
        rt.toastOverride = null;
        sound.playWoodTap(1.08);
        void triggerHaptic('light');
        checkAutoWin();
      } else {
        sound.playBlockedTug();
      }
      rerender();
      return;
    }

    if (action === 'undo') {
      rt.pending2FFloorItemId = null;
      rt.hintActive = false;
      const res = undoLastAction(rt.state);
      if (res.ok) {
        const prevFloorA = rt.state.floorA;
        rt.state = res.state;
        if (rt.state.floorA !== prevFloorA) {
          rt.pulleyAngle += rt.state.floorA > prevFloorA ? -120 : 120;
        }
        rt.toastOverride = null;
        sound.playWoodTap(0.88);
        void triggerHaptic('light');
      }
      rerender();
      return;
    }

    if (action === 'restart-level') {
      cancelAutoSettle();
      rt.pending2FFloorItemId = null;
      rt.state = createGameState(lv);
      rt.modal = 'none';
      rt.settledGrade = null;
      rt.toastOverride = null;
      rt.deadlockDismissed = false;
      rt.hintActive = false;
      sound.playWoodTap(0.9);
      rerender();
      return;
    }

    if (action === 'show-hint') {
      rt.pending2FFloorItemId = null;
      const analysis = analyzePosition(lv, rt.state);
      if (!analysis.canReachExcellent) {
        rt.hintActive = false;
        rt.deadlockDismissed = false;
        sound.playBlockedTug();
      } else {
        rt.toastOverride = null;
        rt.hintActive = !rt.hintActive;
        sound.playWoodTap(1.25);
      }
      rerender();
      return;
    }

    if (action === 'settle-pass') {
      const ev = evaluateState(lv, rt.state);
      if (ev.grade === 'pass') {
        recordCompletion(rt, lv, 'pass');
        rt.settledGrade = 'pass';
        rt.modal = 'result';
        sound.playWinChime(false);
        void triggerHaptic('medium');
        rerender();
      }
      return;
    }

    if (action === 'toggle-sound') {
      rt.profile.muted = !rt.profile.muted;
      sound.setMuted(rt.profile.muted);
      if (!rt.profile.muted) sound.playWoodTap(1.1);
      void saveJsonData(STORAGE_KEY, rt.profile);
      rerender();
      return;
    }

    if (action === 'open-modal') {
      const m = target.dataset.modal as ModalKind;
      if (m === 'lab') {
        const cur = getActiveLevel(rt);
        rt.labDraft = {
          basketCapacity: cur.basketCapacity,
          items: cur.items.map((it) => ({
            name: it.name,
            weight: clampTier(it.weight),
            startFloor: it.startFloor,
            targetFloor: it.targetFloor,
          })),
          auditNote: '',
        };
      }
      rt.modal = m;
      rerender();
      return;
    }

    if (action === 'close-modal') {
      rt.modal = 'none';
      rerender();
      return;
    }

    if (action === 'close-modal-backdrop') {
      if (evt.target === target) {
        rt.modal = 'none';
        rerender();
      }
      return;
    }

    if (action === 'select-level') {
      cancelAutoSettle();
      const id = target.dataset.levelId || LEVELS[0].id;
      const nextLv = getLevelById(id);
      rt.customLevel = null;
      rt.profile.currentLevelId = nextLv.id;
      rt.state = createGameState(nextLv);
      rt.pending2FFloorItemId = null;
      rt.modal = 'none';
      rt.settledGrade = null;
      rt.toastOverride = null;
      rt.deadlockDismissed = false;
      rt.hintActive = false;
      void saveJsonData(STORAGE_KEY, rt.profile);
      sound.playWoodTap(1.0);
      rerender();
      return;
    }

    if (action === 'lab-add-item') {
      syncLabInputsFromDom();
      if (rt.labDraft.items.length < 6) {
        rt.labDraft.items.push({
          name: `新货${rt.labDraft.items.length + 1}`,
          weight: 1,
          startFloor: 1,
          targetFloor: 2,
        });
      }
      rerender();
      return;
    }

    if (action === 'lab-remove-item') {
      syncLabInputsFromDom();
      const idx = Number(target.dataset.idx);
      if (rt.labDraft.items.length > 2) {
        rt.labDraft.items.splice(idx, 1);
      }
      rerender();
      return;
    }

    if (action === 'lab-apply') {
      syncLabInputsFromDom();
      const cargoCount = rt.labDraft.items.filter((i) => i.targetFloor !== null && i.targetFloor !== i.startFloor).length;
      if (cargoCount < 1) {
        rt.labDraft.auditNote = '至少配置 1 件起点与终点不同的货物。';
        rerender();
        return;
      }

      const candidate: LevelSpec = {
        id: 'custom',
        index: 0,
        chapter: 2,
        title: '试玩工坊',
        subtitle: '',
        briefing: '',
        basketCapacity: rt.labDraft.basketCapacity,
        startFloorA: 1,
        parRopeMoves: 2,
        parTotalSteps: 6,
        items: rt.labDraft.items.map((it, idx) => {
          const w = clampTier(it.weight);
          const visual =
            it.targetFloor === null
              ? w === 1
                ? 'iron_1'
                : w === 2
                  ? 'iron_2'
                  : 'iron_3'
              : w === 1
                ? 'sack_1'
                : w === 2
                  ? 'sack_2'
                  : 'sack_3';
          return {
            id: `custom_${idx}`,
            name: it.name,
            weight: w,
            startFloor: it.startFloor,
            targetFloor: it.targetFloor,
            visual,
          };
        }),
      };

      const testState = createGameState(candidate);
      const check = analyzePosition(candidate, testState);
      if (!check.canReachExcellent || check.remainingRopeMoves === null) {
        rt.labDraft.auditNote = '无解：当前配重不足以送达全部货物。';
        sound.playBlockedTug();
        rerender();
        return;
      }

      const bypass2F = isSolvableWithout2FOps(candidate);
      candidate.parRopeMoves = check.remainingRopeMoves;
      rt.customLevel = candidate;
      rt.state = createGameState(candidate);
      rt.pending2FFloorItemId = null;
      rt.modal = 'none';
      rt.settledGrade = null;
      rt.toastOverride = {
        kind: bypass2F ? 'warn' : 'hint',
        text: bypass2F
          ? `最优 ${check.remainingRopeMoves} 次（注意：不经 2F 也能过）`
          : `✓ 校验通过 · 最优 ${check.remainingRopeMoves} 次`,
      };
      sound.playWinChime(false);
      rerender();
    }
  });

  rerender();
}

void bootstrap();
