import {
  ActionResult,
  BasketId,
  EvaluationSummary,
  Floor,
  GameSnapshot,
  GameState,
  GradeKind,
  ItemLocation,
  ItemSpec,
  LevelSpec,
  MoveDirection,
} from './types';

export function oppositeFloor(floor: Floor): Floor {
  return (4 - floor) as Floor;
}

export function cloneLocations(locations: Record<string, ItemLocation>): Record<string, ItemLocation> {
  const out: Record<string, ItemLocation> = {};
  for (const key of Object.keys(locations)) {
    const loc = locations[key];
    out[key] = loc.kind === 'floor' ? { kind: 'floor', floor: loc.floor } : { kind: 'basket', basket: loc.basket };
  }
  return out;
}

export function createSnapshot(state: GameSnapshot): GameSnapshot {
  return {
    floorA: state.floorA,
    locations: cloneLocations(state.locations),
    ropeMoves: state.ropeMoves,
    totalSteps: state.totalSteps,
    lastActionLabel: state.lastActionLabel,
  };
}

export function createGameState(level: LevelSpec): GameState {
  const locations: Record<string, ItemLocation> = {};
  for (const item of level.items) {
    locations[item.id] = { kind: 'floor', floor: item.startFloor };
  }
  return {
    levelId: level.id,
    floorA: level.startFloorA,
    locations,
    ropeMoves: 0,
    totalSteps: 0,
    lastActionLabel: '开局就绪',
    preferredBasketAt2F: 'A',
    history: [],
  };
}

export function getBasketFloor(state: GameSnapshot, basket: BasketId): Floor {
  return basket === 'A' ? state.floorA : oppositeFloor(state.floorA);
}

export function getItemsInBasket(level: LevelSpec, state: GameSnapshot, basket: BasketId): ItemSpec[] {
  return level.items.filter((it) => {
    const loc = state.locations[it.id];
    return loc && loc.kind === 'basket' && loc.basket === basket;
  });
}

export function getItemsOnFloor(level: LevelSpec, state: GameSnapshot, floor: Floor): ItemSpec[] {
  return level.items.filter((it) => {
    const loc = state.locations[it.id];
    return loc && loc.kind === 'floor' && loc.floor === floor;
  });
}

export function getBasketWeight(level: LevelSpec, state: GameSnapshot, basket: BasketId): number {
  return getItemsInBasket(level, state, basket).reduce((sum, it) => sum + it.weight, 0);
}

export function getItemEffectiveFloor(state: GameSnapshot, loc: ItemLocation): Floor {
  if (loc.kind === 'floor') return loc.floor;
  return getBasketFloor(state, loc.basket);
}

export function evaluateState(level: LevelSpec, state: GameSnapshot): EvaluationSummary {
  const floorA = state.floorA;
  const floorB = oppositeFloor(floorA);
  const itemsA = getItemsInBasket(level, state, 'A');
  const itemsB = getItemsInBasket(level, state, 'B');
  const weightA = itemsA.reduce((s, i) => s + i.weight, 0);
  const weightB = itemsB.reduce((s, i) => s + i.weight, 0);

  let totalCargo = 0;
  let deliveredCargo = 0;
  let inBasketAtTargetCargo = 0;
  let potentialEnergy = 0;

  for (const item of level.items) {
    const loc = state.locations[item.id];
    const effFloor = getItemEffectiveFloor(state, loc);
    potentialEnergy += item.weight * effFloor;

    if (item.targetFloor !== null) {
      totalCargo += 1;
      if (loc.kind === 'floor' && loc.floor === item.targetFloor) {
        deliveredCargo += 1;
      } else if (loc.kind === 'basket' && effFloor === item.targetFloor) {
        inBasketAtTargetCargo += 1;
      }
    }
  }

  let grade: GradeKind = 'none';
  if (deliveredCargo === totalCargo) {
    grade = 'excellent';
  } else if (deliveredCargo >= Math.max(1, totalCargo - 1)) {
    grade = 'pass';
  }

  const isParPerfect = grade === 'excellent' && state.ropeMoves <= level.parRopeMoves;

  return {
    totalCargo,
    deliveredCargo,
    inBasketAtTargetCargo,
    grade,
    isParPerfect,
    weightA,
    weightB,
    countA: itemsA.length,
    countB: itemsB.length,
    floorA,
    floorB,
    potentialEnergy,
    canMoveAUp: floorA < 3 && weightB >= weightA,
    canMoveADown: floorA > 1 && weightA >= weightB,
  };
}

export function setPreferredBasketAt2F(state: GameState, basket: BasketId): GameState {
  if (state.preferredBasketAt2F === basket) return state;
  return {
    ...state,
    preferredBasketAt2F: basket,
  };
}

/**
 * 将楼层上的货物装入当前同层吊筐
 */
export function loadItemToBasket(
  level: LevelSpec,
  state: GameState,
  itemId: string,
  explicitBasket?: BasketId
): ActionResult {
  const item = level.items.find((it) => it.id === itemId);
  const loc = state.locations[itemId];
  if (!item || !loc || loc.kind !== 'floor') {
    return { ok: false, reason: 'INVALID_TARGET', message: '该货物不在楼层货台上' };
  }

  const floorA = state.floorA;
  const floorB = oppositeFloor(floorA);
  let targetBasket: BasketId | null = null;

  if (explicitBasket) {
    const bf = getBasketFloor(state, explicitBasket);
    if (bf !== loc.floor) {
      return { ok: false, reason: 'NOT_SAME_FLOOR', message: `${explicitBasket} 筐当前不在 ${loc.floor} 楼` };
    }
    targetBasket = explicitBasket;
  } else if (floorA === 2 && floorB === 2 && loc.floor === 2) {
    // 2 楼双筐交汇：优先装入玩家当前选中的筐；若该筐已满而对筐未满则自动装入对筐
    const pref = state.preferredBasketAt2F;
    const alt: BasketId = pref === 'A' ? 'B' : 'A';
    const prefCount = getItemsInBasket(level, state, pref).length;
    const altCount = getItemsInBasket(level, state, alt).length;
    if (prefCount < level.basketCapacity) {
      targetBasket = pref;
    } else if (altCount < level.basketCapacity) {
      targetBasket = alt;
    } else {
      return {
        ok: false,
        reason: 'BASKET_FULL',
        message: `2 楼两只吊筐均已装满（每筐最多 ${level.basketCapacity} 件）`,
      };
    }
  } else if (loc.floor === floorA) {
    targetBasket = 'A';
  } else if (loc.floor === floorB) {
    targetBasket = 'B';
  } else {
    return {
      ok: false,
      reason: 'NOT_SAME_FLOOR',
      message: `${loc.floor} 楼当前没有停靠吊筐，请先升降吊筐至该层`,
    };
  }

  const currentInBasket = getItemsInBasket(level, state, targetBasket);
  if (currentInBasket.length >= level.basketCapacity) {
    return {
      ok: false,
      reason: 'BASKET_FULL',
      message: `${targetBasket} 筐已满（每筐最多 ${level.basketCapacity} 件），请先卸下一件`,
    };
  }

  const nextLocations = cloneLocations(state.locations);
  nextLocations[itemId] = { kind: 'basket', basket: targetBasket };
  const label = `${targetBasket}筐装入【${item.name}】(${loc.floor}楼)`;

  return {
    ok: true,
    message: label,
    state: {
      ...state,
      locations: nextLocations,
      totalSteps: state.totalSteps + 1,
      lastActionLabel: label,
      preferredBasketAt2F: floorA === 2 ? targetBasket : state.preferredBasketAt2F,
      history: [...state.history, createSnapshot(state)],
    },
  };
}

/**
 * 将吊筐内的货物卸到当前所在楼层
 */
export function unloadItemFromBasket(level: LevelSpec, state: GameState, itemId: string): ActionResult {
  const item = level.items.find((it) => it.id === itemId);
  const loc = state.locations[itemId];
  if (!item || !loc || loc.kind !== 'basket') {
    return { ok: false, reason: 'INVALID_TARGET', message: '该货物不在吊筐内' };
  }

  const floor = getBasketFloor(state, loc.basket);
  const nextLocations = cloneLocations(state.locations);
  nextLocations[itemId] = { kind: 'floor', floor };

  const reachedNote = item.targetFloor === floor ? ' · 已到位!' : '';
  const label = `${loc.basket}筐卸下【${item.name}】至 ${floor}楼${reachedNote}`;

  return {
    ok: true,
    message: label,
    state: {
      ...state,
      locations: nextLocations,
      totalSteps: state.totalSteps + 1,
      lastActionLabel: label,
      history: [...state.history, createSnapshot(state)],
    },
  };
}

/**
 * 2 楼双筐交汇时：一键将某件货物移入对向吊筐（等价于卸到2楼再装入对筐的快捷换筐操作）
 */
export function transferItemBetweenBasketsAt2F(level: LevelSpec, state: GameState, itemId: string): ActionResult {
  if (state.floorA !== 2) {
    return { ok: false, reason: 'NOT_SAME_FLOOR', message: '只有两筐在 2 楼相遇时才能直接换筐' };
  }
  const item = level.items.find((it) => it.id === itemId);
  const loc = state.locations[itemId];
  if (!item || !loc || loc.kind !== 'basket') {
    return { ok: false, reason: 'INVALID_TARGET', message: '该货物不在吊筐中' };
  }

  const destBasket: BasketId = loc.basket === 'A' ? 'B' : 'A';
  const destItems = getItemsInBasket(level, state, destBasket);
  if (destItems.length >= level.basketCapacity) {
    return {
      ok: false,
      reason: 'BASKET_FULL',
      message: `${destBasket} 筐已满（最多 ${level.basketCapacity} 件），请先将对筐腾出空位`,
    };
  }

  const nextLocations = cloneLocations(state.locations);
  nextLocations[itemId] = { kind: 'basket', basket: destBasket };
  const label = `2楼换货：【${item.name}】${loc.basket}筐 → ${destBasket}筐`;

  return {
    ok: true,
    message: label,
    state: {
      ...state,
      locations: nextLocations,
      // 换筐在原子规则中等价于“卸2楼+装对筐”两步，但绳索升降次数不变
      totalSteps: state.totalSteps + 2,
      lastActionLabel: label,
      preferredBasketAt2F: destBasket,
      history: [...state.history, createSnapshot(state)],
    },
  };
}

/**
 * 拉动滑轮升降一层（核心物理约束：下行侧总重 >= 上行侧总重）
 */
export function moveBaskets(level: LevelSpec, state: GameState, direction: MoveDirection): ActionResult {
  const floorA = state.floorA;
  const floorB = oppositeFloor(floorA);
  const weightA = getBasketWeight(level, state, 'A');
  const weightB = getBasketWeight(level, state, 'B');

  if (direction === 'A_UP') {
    if (floorA >= 3) {
      return { ok: false, reason: 'ALREADY_AT_LIMIT', message: 'A 筐已在 3 楼顶层，无法继续上升' };
    }
    if (weightB < weightA) {
      return {
        ok: false,
        reason: 'INSUFFICIENT_COUNTERWEIGHT',
        downWeight: weightB,
        upWeight: weightA,
        message: `配重不足：下行 B 筐（重 ${weightB}）轻于上行 A 筐（重 ${weightA}），拉不动！`,
      };
    }
    const nextA = (floorA + 1) as Floor;
    const nextB = oppositeFloor(nextA);
    const label = `升降一层：A筐 ${floorA}→${nextA}楼(重${weightA}) · B筐 ${floorB}→${nextB}楼(重${weightB})`;
    return {
      ok: true,
      message: label,
      state: {
        ...state,
        floorA: nextA,
        ropeMoves: state.ropeMoves + 1,
        totalSteps: state.totalSteps + 1,
        lastActionLabel: label,
        history: [...state.history, createSnapshot(state)],
      },
    };
  } else {
    if (floorA <= 1) {
      return { ok: false, reason: 'ALREADY_AT_LIMIT', message: 'B 筐已在 3 楼顶层，无法继续上升' };
    }
    if (weightA < weightB) {
      return {
        ok: false,
        reason: 'INSUFFICIENT_COUNTERWEIGHT',
        downWeight: weightA,
        upWeight: weightB,
        message: `配重不足：下行 A 筐（重 ${weightA}）轻于上行 B 筐（重 ${weightB}），拉不动！`,
      };
    }
    const nextA = (floorA - 1) as Floor;
    const nextB = oppositeFloor(nextA);
    const label = `升降一层：A筐 ${floorA}→${nextA}楼(重${weightA}) · B筐 ${floorB}→${nextB}楼(重${weightB})`;
    return {
      ok: true,
      message: label,
      state: {
        ...state,
        floorA: nextA,
        ropeMoves: state.ropeMoves + 1,
        totalSteps: state.totalSteps + 1,
        lastActionLabel: label,
        history: [...state.history, createSnapshot(state)],
      },
    };
  }
}

export function undoLastAction(state: GameState): ActionResult {
  if (state.history.length === 0) {
    return { ok: false, reason: 'NO_HISTORY', message: '已经回到开局第一步' };
  }
  const prev = state.history[state.history.length - 1];
  const nextHistory = state.history.slice(0, -1);
  return {
    ok: true,
    message: '已撤销上一步',
    state: {
      ...state,
      floorA: prev.floorA,
      locations: cloneLocations(prev.locations),
      ropeMoves: prev.ropeMoves,
      totalSteps: prev.totalSteps,
      lastActionLabel: prev.lastActionLabel,
      history: nextHistory,
    },
  };
}

export function compareGrades(a: GradeKind, b: GradeKind): number {
  const rank: Record<GradeKind, number> = { none: 0, pass: 1, excellent: 2 };
  return rank[a] - rank[b];
}

/**
 * 【边界 A 必胜判定】：
 * 当所有目标货物均已位于各自的目标楼层（部分已在楼板上、其余刚随吊筐抵达目标楼层筐内，无需再拉绳升降）时，
 * 按「自上而下（3F → 2F → 1F）、先左筐后右筐」的视觉阅读顺序返回待自动出筐归位的目标货物列表。
 */
export function getAutoUnloadItems(level: LevelSpec, state: GameSnapshot): ItemSpec[] {
  const ev = evaluateState(level, state);
  if (
    ev.totalCargo <= 0 ||
    ev.inBasketAtTargetCargo <= 0 ||
    ev.deliveredCargo + ev.inBasketAtTargetCargo !== ev.totalCargo
  ) {
    return [];
  }

  return level.items
    .filter((it) => {
      if (it.targetFloor === null) return false;
      const loc = state.locations[it.id];
      return Boolean(loc && loc.kind === 'basket' && getBasketFloor(state, loc.basket) === it.targetFloor);
    })
    .sort((a, b) => {
      const fa = a.targetFloor ?? 0;
      const fb = b.targetFloor ?? 0;
      if (fb !== fa) return fb - fa;
      const la = state.locations[a.id];
      const lb = state.locations[b.id];
      const ba = la.kind === 'basket' ? la.basket : 'A';
      const bb = lb.kind === 'basket' ? lb.basket : 'A';
      return ba === bb ? 0 : ba === 'A' ? -1 : 1;
    });
}

/**
 * 将已随吊筐抵达目标楼层的单件货物自动落位到楼板上（不额外压入 history，保证撤销一次即可回到拉绳前）。
 */
export function settleTargetItemFromBasket(level: LevelSpec, state: GameState, itemId: string): GameState {
  const item = level.items.find((it) => it.id === itemId);
  const loc = state.locations[itemId];
  if (!item || item.targetFloor === null || !loc || loc.kind !== 'basket') {
    return state;
  }
  const basketFloor = getBasketFloor(state, loc.basket);
  if (basketFloor !== item.targetFloor) {
    return state;
  }
  const nextLocations = cloneLocations(state.locations);
  nextLocations[itemId] = { kind: 'floor', floor: item.targetFloor };
  return {
    ...state,
    locations: nextLocations,
    totalSteps: state.totalSteps + 1,
    lastActionLabel: `到站归位：【${item.name}】落入 ${item.targetFloor} 楼`,
  };
}

