import { describe, expect, it } from 'vitest';
import {
  analyzePosition,
  computeHintGesture,
  createGameState,
  evaluateState,
  getAutoUnloadItems,
  getLevelById,
  isSolvableWithout2FOps,
  LEVELS,
  loadItemToBasket,
  moveBaskets,
  settleTargetItemFromBasket,
  transferItemBetweenBasketsAt2F,
  undoLastAction,
  unloadItemFromBasket,
} from '../src/core/index';

describe('《一绳两筐》核心规则、视觉重量一致性与十关数学验证', () => {
  it('全部 10 个固定关卡均可达成【优秀】，且最优升降次数严格等于 parRopeMoves', () => {
    expect(LEVELS.length).toBe(10);
    for (const level of LEVELS) {
      const init = createGameState(level);
      const analysis = analyzePosition(level, init);
      expect(analysis.canReachExcellent, `${level.id} 必须可解`).toBe(true);
      expect(analysis.remainingRopeMoves, `${level.id} 最优升降次数校验`).toBe(level.parRopeMoves);
    }
  });

  it('视觉直觉约束：所有关卡物品重量严格收敛在 {1, 2, 3} 三档，且同一外观材质绝不跨关改变重量', () => {
    const visualWeightMap = new Map<string, number>();
    for (const level of LEVELS) {
      for (const item of level.items) {
        expect([1, 2, 3]).toContain(item.weight);
        const prev = visualWeightMap.get(item.visual);
        if (prev !== undefined) {
          expect(item.weight, `${item.visual} 在不同关卡重量必须恒定`).toBe(prev);
        } else {
          visualWeightMap.set(item.visual, item.weight);
        }
      }
    }
  });

  it('防退化校验：没有任何一关可以不经 2 楼中途操作“随便对开”直接过关', () => {
    for (const level of LEVELS) {
      expect(isSolvableWithout2FOps(level), `${level.id} 不允许不经2楼直接对开过关`).toBe(false);
    }
  });

  it('沙袋必要性校验：含沙袋关卡（第6、7、10关）一旦移除沙袋则彻底无解', () => {
    const sandbagLevels = LEVELS.filter((lv) => lv.items.some((it) => it.targetFloor === null));
    expect(sandbagLevels.map((l) => l.id)).toEqual(['lv06', 'lv07', 'lv10']);

    for (const lv of sandbagLevels) {
      const stripped = {
        ...lv,
        items: lv.items.filter((it) => it.targetFloor !== null),
      };
      const init = createGameState(stripped);
      expect(analyzePosition(stripped, init).canReachExcellent, `${lv.id} 移除沙袋后应无解`).toBe(false);
    }
  });

  it('第 1 关《顺风搭车》完美还原设计稿稳妥走法（含直接续行与2楼换筐两种等价操作）', () => {
    const lv1 = getLevelById('lv01');

    let st = createGameState(lv1);
    for (const id of ['rice', 'paint', 'parts']) {
      const r = loadItemToBasket(lv1, st, id);
      expect(r.ok).toBe(true);
      if (r.ok) st = r.state;
    }

    let r = moveBaskets(lv1, st, 'A_UP');
    expect(r.ok).toBe(true);
    if (r.ok) st = r.state;

    r = unloadItemFromBasket(lv1, st, 'paint');
    expect(r.ok).toBe(true);
    if (r.ok) st = r.state;

    // 2楼换筐反向走法校验
    let stSwap = st;
    let rs = unloadItemFromBasket(lv1, stSwap, 'rice');
    if (rs.ok) stSwap = rs.state;
    rs = transferItemBetweenBasketsAt2F(lv1, stSwap, 'parts');
    expect(rs.ok).toBe(true);
    if (rs.ok) stSwap = rs.state;
    rs = loadItemToBasket(lv1, stSwap, 'rice', 'B');
    expect(rs.ok).toBe(true);
    if (rs.ok) stSwap = rs.state;
    rs = moveBaskets(lv1, stSwap, 'A_DOWN');
    expect(rs.ok).toBe(true);
    if (rs.ok) stSwap = rs.state;
    rs = unloadItemFromBasket(lv1, stSwap, 'parts');
    if (rs.ok) stSwap = rs.state;
    rs = unloadItemFromBasket(lv1, stSwap, 'rice');
    if (rs.ok) stSwap = rs.state;
    expect(evaluateState(lv1, stSwap).grade).toBe('excellent');
    expect(stSwap.ropeMoves).toBe(2);

    // 直接继续上行校验
    r = moveBaskets(lv1, st, 'A_UP');
    expect(r.ok).toBe(true);
    if (r.ok) st = r.state;
    r = unloadItemFromBasket(lv1, st, 'rice');
    if (r.ok) st = r.state;
    r = unloadItemFromBasket(lv1, st, 'parts');
    if (r.ok) st = r.state;

    const ev = evaluateState(lv1, st);
    expect(ev.grade).toBe('excellent');
    expect(ev.isParPerfect).toBe(true);
    expect(st.ropeMoves).toBe(2);
  });

  it('第 1 关反例验证：若只让米对零件走完全程，油漆滞留 1 楼触发死锁且评级停留在【达标】', () => {
    const lv1 = getLevelById('lv01');
    let st = createGameState(lv1);

    for (const id of ['rice', 'parts']) {
      const r = loadItemToBasket(lv1, st, id);
      if (r.ok) st = r.state;
    }
    for (let i = 0; i < 2; i++) {
      const r = moveBaskets(lv1, st, 'A_UP');
      expect(r.ok).toBe(true);
      if (r.ok) st = r.state;
    }
    for (const id of ['rice', 'parts']) {
      const r = unloadItemFromBasket(lv1, st, id);
      if (r.ok) st = r.state;
    }

    const ev = evaluateState(lv1, st);
    expect(ev.deliveredCargo).toBe(2);
    expect(ev.grade).toBe('pass');

    const analysis = analyzePosition(lv1, st);
    expect(analysis.canReachExcellent).toBe(false);
    expect(analysis.deadlockReason).toContain('橙标单袋');

    const loadPaint = loadItemToBasket(lv1, st, 'paint');
    if (loadPaint.ok) st = loadPaint.state;
    const blockedMove = moveBaskets(lv1, st, 'A_DOWN');
    expect(blockedMove.ok).toBe(false);
    if (!blockedMove.ok) {
      expect(blockedMove.reason).toBe('INSUFFICIENT_COUNTERWEIGHT');
    }

    expect(undoLastAction(st).ok).toBe(true);
  });

  it('手势锦囊全关卡验证：跟随 computeHintGesture 手指滑动动作可在全部 10 关最优步数达成【优秀】', () => {
    for (const lv of LEVELS) {
      let st = createGameState(lv);
      let guard = 0;
      while (evaluateState(lv, st).grade !== 'excellent' && guard < 60) {
        guard += 1;
        const g = computeHintGesture(lv, st);
        expect(g, `${lv.id} 第 ${guard} 步必须给出有效手势`).not.toBeNull();
        if (!g) break;
        if (g.type === 'item-to-basket') {
          const r = loadItemToBasket(lv, st, g.itemId, g.basket);
          expect(r.ok, `${lv.id} 装筐 ${g.itemId}->${g.basket}`).toBe(true);
          if (r.ok) st = r.state;
        } else if (g.type === 'unload-from-basket') {
          const r = unloadItemFromBasket(lv, st, g.itemId);
          expect(r.ok, `${lv.id} 卸货 ${g.itemId}`).toBe(true);
          if (r.ok) st = r.state;
        } else if (g.type === 'basket-to-basket') {
          const r = transferItemBetweenBasketsAt2F(lv, st, g.itemId);
          expect(r.ok, `${lv.id} 换筐 ${g.itemId}`).toBe(true);
          if (r.ok) st = r.state;
        } else if (g.type === 'drag-basket') {
          const r = moveBaskets(lv, st, g.moveDir);
          expect(r.ok, `${lv.id} 拖筐升降 ${g.moveDir}`).toBe(true);
          if (r.ok) st = r.state;
        }
      }
      const finalEv = evaluateState(lv, st);
      expect(finalEv.grade, `${lv.id} 跟随手势锦囊必须达成优秀`).toBe('excellent');
      expect(st.ropeMoves, `${lv.id} 跟随手势锦囊必须是最优拉绳次数`).toBe(lv.parRopeMoves);
    }
  });

  it('边界 A 必胜自动归位验证：全部 10 关在最后一次拉绳到站瞬间精准触发自动出筐归位，不提前抢跑且不污染撤销栈', () => {
    for (const lv of LEVELS) {
      let st = createGameState(lv);
      let guard = 0;
      let triggeredAutoQueueCount = 0;

      while (evaluateState(lv, st).grade !== 'excellent' && guard < 60) {
        // 在到达终点前，任意一步都不应提前触发边界 A
        expect(getAutoUnloadItems(lv, st).length, `${lv.id} 中途不应误触发自动归位`).toBe(0);

        guard += 1;
        const g = computeHintGesture(lv, st);
        expect(g).not.toBeNull();
        if (!g) break;

        if (g.type === 'item-to-basket') {
          const r = loadItemToBasket(lv, st, g.itemId, g.basket);
          if (r.ok) st = r.state;
        } else if (g.type === 'unload-from-basket') {
          const r = unloadItemFromBasket(lv, st, g.itemId);
          if (r.ok) st = r.state;
        } else if (g.type === 'basket-to-basket') {
          const r = transferItemBetweenBasketsAt2F(lv, st, g.itemId);
          if (r.ok) st = r.state;
        } else if (g.type === 'drag-basket') {
          const beforePullFloorA = st.floorA;
          const r = moveBaskets(lv, st, g.moveDir);
          if (r.ok) {
            st = r.state;
            const autoQueue = getAutoUnloadItems(lv, st);
            if (autoQueue.length > 0) {
              triggeredAutoQueueCount = autoQueue.length;
              // 仅含目标货物，绝不误卸纯配重秤砣
              expect(autoQueue.every((it) => it.targetFloor !== null)).toBe(true);
              for (const item of autoQueue) {
                st = settleTargetItemFromBasket(lv, st, item.id);
              }
              expect(evaluateState(lv, st).grade, `${lv.id} 自动出筐后立即达成优秀`).toBe('excellent');
              expect(st.ropeMoves).toBe(lv.parRopeMoves);

              // 单次撤销应直接回到最后一次拉绳前的楼层，不被自动出筐污染撤销栈
              const undoRes = undoLastAction(st);
              expect(undoRes.ok).toBe(true);
              if (undoRes.ok) {
                expect(undoRes.state.floorA).toBe(beforePullFloorA);
                expect(undoRes.state.ropeMoves).toBe(lv.parRopeMoves - 1);
              }
              break;
            }
          }
        }
      }

      expect(triggeredAutoQueueCount, `${lv.id} 最后一次拉绳到站必须触发边界 A 自动归位`).toBeGreaterThan(0);
    }
  });
});

