const core = require('./core-bundle.js');

const STORAGE_KEY = 'weapp_one_rope_two_baskets_v1';

function clampTier(w) {
  return w <= 1 ? 1 : w === 2 ? 2 : 3;
}

function decorateItem(it, currentFloor, onFloor, settledMap) {
  const tier = clampTier(it.weight);
  const delivered = onFloor && it.targetFloor === currentFloor;
  const atTarget = !onFloor && it.targetFloor === currentFloor;
  return {
    id: it.id,
    name: it.name,
    tier,
    targetFloor: it.targetFloor,
    units: Array.from({ length: tier }, (_, i) => i),
    isSandbag: it.targetFloor === null,
    delivered,
    atTarget,
    justSettled: Boolean(onFloor && settledMap && settledMap[it.id]),
  };
}

Page({
  data: {
    allLevels: core.LEVELS,
    level: core.LEVELS[0],
    evalInfo: {},
    goalDots: [],
    tiltDeg: 0,
    bricksA: [],
    bricksB: [],
    gaugeA: [],
    gaugeB: [],
    rowIdxA: 2,
    rowIdxB: 0,
    dragDeltaPxA: 0,
    isDragging: false,
    dirA: '↑',
    dirB: '↓',
    slotsA: [],
    slotsB: [],
    floorsView: [],
    pending2FId: null,
    ropeMoves: 0,
    canUndo: false,
    toastKind: '',
    toastText: '',
    tutHintSide: '',
    modal: 'none',
    settledGrade: 'excellent',
  },

  onLoad() {
    let savedLevelId = core.LEVELS[0].id;
    try {
      const raw = wx.getStorageSync(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.currentLevelId) savedLevelId = parsed.currentLevelId;
      }
    } catch (e) {}

    this._level = core.getLevelById(savedLevelId);
    this._state = core.createGameState(this._level);
    this._toastOverride = null;
    this._deadlockDismissed = false;
    this._pending2FId = null;
    this._touchSide = null;
    this._touchStartY = 0;
    this._lastEffPx = 0;
    this._isAutoSettling = false;
    this._settledIds = {};
    this._autoTimers = [];
    this.syncView();
  },

  clearAutoSettle() {
    if (this._autoTimers) {
      for (const t of this._autoTimers) clearTimeout(t);
    }
    this._autoTimers = [];
    this._isAutoSettling = false;
    this._settledIds = {};
  },

  noop() {},

  syncView() {
    const lv = this._level;
    const st = this._state;
    const ev = core.evaluateState(lv, st);
    const solver = core.analyzePosition(lv, st);
    if (solver.canReachExcellent) {
      this._deadlockDismissed = false;
    }

    const itemsA = core.getItemsInBasket(lv, st, 'A');
    const itemsB = core.getItemsInBasket(lv, st, 'B');

    const slotsA = [];
    const slotsB = [];
    for (let s = 0; s < lv.basketCapacity; s++) {
      slotsA.push({ slotIdx: s + 1, cargo: itemsA[s] ? decorateItem(itemsA[s], ev.floorA, false, null) : null });
      slotsB.push({ slotIdx: s + 1, cargo: itemsB[s] ? decorateItem(itemsB[s], ev.floorB, false, null) : null });
    }

    const floorsView = [3, 2, 1].map((fl) => {
      const floorItems = core.getItemsOnFloor(lv, st, fl).map((i) => decorateItem(i, fl, true, this._settledIds));
      const ghostTargets = lv.items
        .filter((it) => {
          if (it.targetFloor !== fl) return false;
          const loc = st.locations[it.id];
          return !(loc.kind === 'floor' && loc.floor === fl);
        })
        .map((it) => {
          const tier = clampTier(it.weight);
          return { id: it.id, name: it.name, tier, units: Array.from({ length: tier }, (_, i) => i) };
        });
      return { floor: fl, floorItems, ghostTargets };
    });

    let toastKind = '';
    let toastText = '';
    if (this._toastOverride) {
      toastKind = this._toastOverride.kind;
      toastText = this._toastOverride.text;
    } else if (!solver.canReachExcellent && ev.grade !== 'excellent' && !this._deadlockDismissed) {
      toastKind = 'warn';
      toastText = '高处配重已耗尽，请退回一步';
    }

    const gesture =
      !this._isAutoSettling && (lv.id === 'lv01' || this._hintActive) ? core.computeHintGesture(lv, st) : null;
    const tutHintSide = gesture && gesture.type === 'drag-basket' ? gesture.basket : '';
    const tutItemId = gesture && 'itemId' in gesture ? gesture.itemId : '';
    const tutDir =
      gesture && gesture.type === 'item-to-basket'
        ? gesture.basket === 'A'
          ? '👈'
          : '👉'
        : gesture && gesture.type === 'unload-from-basket'
          ? gesture.basket === 'A'
            ? '👉'
            : '👈'
          : gesture && gesture.type === 'basket-to-basket'
            ? gesture.toBasket === 'B'
              ? '👉'
              : '👈'
            : '';

    this.setData({
      level: lv,
      evalInfo: ev,
      goalDots: Array.from({ length: ev.totalCargo }, (_, i) => i < ev.deliveredCargo),
      tiltDeg: ev.weightA === ev.weightB ? 0 : ev.weightB > ev.weightA ? 9.5 : -9.5,
      bricksA: Array.from({ length: Math.min(5, ev.weightA) }, (_, i) => i),
      bricksB: Array.from({ length: Math.min(5, ev.weightB) }, (_, i) => i),
      gaugeA: Array.from({ length: 5 }, (_, i) => i < ev.weightA),
      gaugeB: Array.from({ length: 5 }, (_, i) => i < ev.weightB),
      rowIdxA: 3 - ev.floorA,
      rowIdxB: 3 - ev.floorB,
      dragDeltaPxA: 0,
      isDragging: false,
      dirA: ev.floorA === 1 ? '↑' : ev.floorA === 3 ? '↓' : '↕',
      dirB: ev.floorB === 1 ? '↑' : ev.floorB === 3 ? '↓' : '↕',
      slotsA,
      slotsB,
      floorsView,
      pending2FId: this._pending2FId,
      ropeMoves: st.ropeMoves,
      canUndo: st.history.length > 0,
      toastKind,
      toastText,
      tutHintSide,
      tutItemId,
      tutDir,
      hintActive: Boolean(this._hintActive),
    });
  },

  onShaftTouchStart(e) {
    if (this._isAutoSettling || !e.touches || !e.touches[0]) return;
    this._touchSide = e.currentTarget.dataset.side === 'B' ? 'B' : 'A';
    this._touchStartY = e.touches[0].clientY;
    this._lastEffPx = 0;
  },

  onShaftTouchMove(e) {
    if (this._isAutoSettling || !this._touchSide || !e.touches || !e.touches[0]) return;
    const dy = e.touches[0].clientY - this._touchStartY;
    if (Math.abs(dy) < 8) return;

    const rawDeltaA = this._touchSide === 'A' ? dy : -dy;
    const ev = core.evaluateState(this._level, this._state);
    const oneFloorPx = 150;
    let eff = 0;

    if (rawDeltaA < 0) {
      eff = ev.floorA >= 3 ? -5 : !ev.canMoveAUp ? -14 : Math.max(-oneFloorPx, rawDeltaA);
    } else {
      eff = ev.floorA <= 1 ? 5 : !ev.canMoveADown ? 14 : Math.min(oneFloorPx, rawDeltaA);
    }

    this._lastEffPx = eff;
    this.setData({ isDragging: true, dragDeltaPxA: Math.round(eff) });
  },

  runWeappAutoSettle(queue) {
    this.clearAutoSettle();
    this._isAutoSettling = true;
    this.syncView();

    queue.forEach((item, idx) => {
      const tid = setTimeout(() => {
        this._state = core.settleTargetItemFromBasket(this._level, this._state, item.id);
        this._settledIds[item.id] = true;
        if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
        this.syncView();
      }, 220 + idx * 185);
      this._autoTimers.push(tid);
    });

    const doneTid = setTimeout(() => {
      this._isAutoSettling = false;
      this._settledIds = {};
      if (wx.vibrateShort) wx.vibrateShort({ type: 'heavy' });
      this.setData({ modal: 'result', settledGrade: 'excellent' });
      this.syncView();
    }, 220 + (queue.length - 1) * 185 + 320);
    this._autoTimers.push(doneTid);
  },

  onShaftTouchEnd() {
    if (!this._touchSide) return;
    const eff = this._lastEffPx;
    this._touchSide = null;
    this._lastEffPx = 0;

    const ev = core.evaluateState(this._level, this._state);
    let moved = false;
    if (eff <= -36 && ev.canMoveAUp) {
      const res = core.moveBaskets(this._level, this._state, 'A_UP');
      if (res.ok) {
        this._state = res.state;
        this._toastOverride = null;
        this._hintActive = false;
        moved = true;
        if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' });
      }
    } else if (eff >= 36 && ev.canMoveADown) {
      const res = core.moveBaskets(this._level, this._state, 'A_DOWN');
      if (res.ok) {
        this._state = res.state;
        this._toastOverride = null;
        this._hintActive = false;
        moved = true;
        if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' });
      }
    } else if (Math.abs(eff) >= 12 && wx.vibrateShort) {
      wx.vibrateShort({ type: 'heavy' });
    }

    if (moved) {
      const autoQueue = core.getAutoUnloadItems(this._level, this._state);
      if (autoQueue.length > 0) {
        this.runWeappAutoSettle(autoQueue);
        return;
      }
    }

    this.syncView();
  },

  onTapFloorItem(e) {
    if (this._isAutoSettling) return;
    const id = e.currentTarget.dataset.id;
    const loc = this._state.locations[id];
    if (!loc || loc.kind !== 'floor') return;

    if (this._state.floorA === 2 && loc.floor === 2) {
      const cA = core.getItemsInBasket(this._level, this._state, 'A').length;
      const cB = core.getItemsInBasket(this._level, this._state, 'B').length;
      if (cA < this._level.basketCapacity && cB < this._level.basketCapacity) {
        this._pending2FId = this._pending2FId === id ? null : id;
        this.syncView();
        return;
      }
    }

    this._pending2FId = null;
    const res = core.loadItemToBasket(this._level, this._state, id);
    if (res.ok) {
      this._state = res.state;
      this._toastOverride = null;
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    }
    this.syncView();
  },

  onConfirm2FBasket(e) {
    if (this._isAutoSettling) return;
    const basket = e.currentTarget.dataset.basket === 'B' ? 'B' : 'A';
    const id = this._pending2FId;
    this._pending2FId = null;
    if (!id) return;
    const res = core.loadItemToBasket(this._level, this._state, id, basket);
    if (res.ok) {
      this._state = res.state;
      this._toastOverride = null;
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    }
    this.syncView();
  },

  onUnloadItem(e) {
    if (this._isAutoSettling) return;
    this._pending2FId = null;
    const id = e.currentTarget.dataset.id;
    const res = core.unloadItemFromBasket(this._level, this._state, id);
    if (res.ok) {
      this._state = res.state;
      this._toastOverride = null;
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
      if (core.evaluateState(this._level, this._state).grade === 'excellent') {
        this.setData({ modal: 'result', settledGrade: 'excellent' });
      }
    }
    this.syncView();
  },

  onSwap2F(e) {
    if (this._isAutoSettling) return;
    this._pending2FId = null;
    const id = e.currentTarget.dataset.id;
    const res = core.transferItemBetweenBasketsAt2F(this._level, this._state, id);
    if (res.ok) {
      this._state = res.state;
      this._toastOverride = null;
    }
    this.syncView();
  },

  onUndo() {
    if (this._isAutoSettling) return;
    this._pending2FId = null;
    const res = core.undoLastAction(this._state);
    if (res.ok) {
      this._state = res.state;
      this._toastOverride = null;
      this.syncView();
    }
  },

  onReset() {
    this.clearAutoSettle();
    this._pending2FId = null;
    this._state = core.createGameState(this._level);
    this._toastOverride = null;
    this._deadlockDismissed = false;
    this._hintActive = false;
    this.setData({ modal: 'none' });
    this.syncView();
  },

  onHint() {
    if (this._isAutoSettling) return;
    const info = core.analyzePosition(this._level, this._state);
    if (!info.canReachExcellent) {
      this._hintActive = false;
      this._deadlockDismissed = false;
    } else {
      this._toastOverride = null;
      this._hintActive = !this._hintActive;
    }
    this.syncView();
  },

  onDismissToast() {
    this._toastOverride = null;
    this._deadlockDismissed = true;
    this.syncView();
  },

  onSettlePass() {
    if (this._isAutoSettling) return;
    if (core.evaluateState(this._level, this._state).grade === 'pass') {
      this.setData({ modal: 'result', settledGrade: 'pass' });
    }
  },

  onOpenLevels() { if (!this._isAutoSettling) this.setData({ modal: 'levels' }); },
  onCloseModal() { this.setData({ modal: 'none' }); },

  onPickLevel(e) {
    this.clearAutoSettle();
    const id = e.currentTarget.dataset.id;
    this._level = core.getLevelById(id);
    this._state = core.createGameState(this._level);
    this._toastOverride = null;
    this._deadlockDismissed = false;
    this._hintActive = false;
    this._pending2FId = null;
    try { wx.setStorageSync(STORAGE_KEY, JSON.stringify({ currentLevelId: id })); } catch (err) {}
    this.setData({ modal: 'none' });
    this.syncView();
  },

  onNextLevel() {
    const idx = core.LEVELS.findIndex((l) => l.id === this._level.id);
    const next = core.LEVELS[(idx + 1) % core.LEVELS.length];
    this.onPickLevel({ currentTarget: { dataset: { id: next.id } } });
  },
});
