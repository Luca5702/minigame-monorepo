import { getBasketFloor, getItemEffectiveFloor, getItemsInBasket, oppositeFloor } from './engine';
import { BasketId, Floor, GameSnapshot, LevelSpec, MoveDirection } from './types';

export interface SolverAnalysis {
  /** 从当前局面是否仍有可能达成【优秀（全数送达）】 */
  canReachExcellent: boolean;
  /** 从当前局面达成全数送达所需的最少剩余升降次数（不可达则为 null） */
  remainingRopeMoves: number | null;
  /** 下一步锦囊建议（不剧透全流程，只提示当前关键动作） */
  nextHint: string;
  /** 若已死锁无法拿优秀，给出死锁成因说明 */
  deadlockReason: string | null;
  /** 最优下一步宏动作（供可视化手势引导使用） */
  firstStep: {
    nextFloorA: Floor;
    upIndices: number[];
    downIndices: number[];
  } | null;
}

export type HintGestureAction =
  | { type: 'item-to-basket'; itemId: string; basket: BasketId; pulseItemIds: string[] }
  | { type: 'unload-from-basket'; itemId: string; basket: BasketId; floor: Floor; pulseItemIds: string[] }
  | { type: 'basket-to-basket'; itemId: string; fromBasket: BasketId; toBasket: BasketId; pulseItemIds: string[] }
  | {
      type: 'drag-basket';
      basket: BasketId;
      fromFloor: Floor;
      toFloor: Floor;
      moveDir: MoveDirection;
      pulseItemIds: string[];
    };

interface MacroStep {
  nextKey: string;
  nextFloorA: Floor;
  nextFloors: Floor[];
  upIndices: number[];
  downIndices: number[];
}

function subsetsUpTo<T>(arr: T[], maxLen: number): T[][] {
  const res: T[][] = [[]];
  for (const item of arr) {
    const currentLen = res.length;
    for (let i = 0; i < currentLen; i++) {
      if (res[i].length < maxLen) {
        res.push([...res[i], item]);
      }
    }
  }
  return res;
}

function encodeMacroState(floorA: Floor, floors: Floor[]): string {
  return `${floorA}:${floors.join(',')}`;
}

/**
 * 轻量级精确宏状态 BFS 求解器（运行耗时 < 2ms，纯离线运行）
 */
export function analyzePosition(level: LevelSpec, state: GameSnapshot): SolverAnalysis {
  const n = level.items.length;
  const cap = level.basketCapacity;
  const cargoIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (level.items[i].targetFloor !== null) {
      cargoIndices.push(i);
    }
  }

  const startFloors: Floor[] = level.items.map((it) => getItemEffectiveFloor(state, state.locations[it.id]));
  const startKey = encodeMacroState(state.floorA, startFloors);

  const isGoal = (floors: Floor[]): boolean =>
    cargoIndices.every((idx) => floors[idx] === level.items[idx].targetFloor);

  if (isGoal(startFloors)) {
    const stillInBasket = cargoIndices.filter((idx) => state.locations[level.items[idx].id].kind === 'basket');
    if (stillInBasket.length > 0) {
      const names = stillInBasket.map((idx) => `【${level.items[idx].name}】`).join('、');
      return {
        canReachExcellent: true,
        remainingRopeMoves: 0,
        nextHint: `${names} 已到达目标楼层吊筐内，点击货物卸到楼板即可完美通关！`,
        deadlockReason: null,
        firstStep: null,
      };
    }
    return {
      canReachExcellent: true,
      remainingRopeMoves: 0,
      nextHint: '所有货物均已送达目标楼层！',
      deadlockReason: null,
      firstStep: null,
    };
  }

  const visited = new Map<string, number>();
  const parent = new Map<string, { prevKey: string; step: MacroStep }>();
  const stateData = new Map<string, { floorA: Floor; floors: Floor[] }>();

  const queue: string[] = [startKey];
  visited.set(startKey, 0);
  stateData.set(startKey, { floorA: state.floorA, floors: startFloors });

  let foundGoalKey: string | null = null;
  let head = 0;

  while (head < queue.length) {
    const curKey = queue[head++];
    const curDist = visited.get(curKey)!;
    const cur = stateData.get(curKey)!;

    if (isGoal(cur.floors)) {
      foundGoalKey = curKey;
      break;
    }

    const neighbors = expandMacroNeighbors(level, cur.floorA, cur.floors, cap);
    for (const step of neighbors) {
      if (!visited.has(step.nextKey)) {
        visited.set(step.nextKey, curDist + 1);
        stateData.set(step.nextKey, { floorA: step.nextFloorA, floors: step.nextFloors });
        parent.set(step.nextKey, { prevKey: curKey, step });
        queue.push(step.nextKey);
      }
    }
  }

  if (foundGoalKey === null) {
    const strandedUp = cargoIndices
      .filter((idx) => startFloors[idx] < (level.items[idx].targetFloor as number))
      .map((idx) => `【${level.items[idx].name}】(${startFloors[idx]}楼→${level.items[idx].targetFloor}楼)`);

    const reason =
      strandedUp.length > 0
        ? `高处可用配重已不足，${strandedUp.join('、')} 无法再被拉起。`
        : '当前势能与配重分布已无法让全部货物归位。';

    return {
      canReachExcellent: false,
      remainingRopeMoves: null,
      nextHint: '当前配重已透支，建议点击【撤销】退回分岔步，或【重开】调整中途卸货时机。',
      deadlockReason: reason,
      firstStep: null,
    };
  }

  const totalRemainingMoves = visited.get(foundGoalKey)!;
  let cursor = foundGoalKey;
  let firstStep: MacroStep | null = null;
  while (parent.has(cursor)) {
    const entry = parent.get(cursor)!;
    if (entry.prevKey === startKey) {
      firstStep = entry.step;
      break;
    }
    cursor = entry.prevKey;
  }

  let nextHint = '观察上下行两侧配重，准备拉绳升降。';
  if (firstStep) {
    const upNames = firstStep.upIndices.map((i) => `【${level.items[i].name}】`).join('+');
    const downNames = firstStep.downIndices.map((i) => `【${level.items[i].name}】`).join('+');
    const curB = oppositeFloor(state.floorA);
    if (firstStep.upIndices.length === 0 && firstStep.downIndices.length === 0) {
      nextHint = `锦囊：本步无需装货，直接让两只空筐等重交汇至 ${firstStep.nextFloorA} 楼！`;
    } else {
      const upSide = firstStep.nextFloorA > state.floorA ? `A筐(${state.floorA}楼)` : `B筐(${curB}楼)`;
      const downSide = firstStep.nextFloorA > state.floorA ? `B筐(${curB}楼)` : `A筐(${state.floorA}楼)`;
      const upDesc = upNames ? `${upSide}装 ${upNames}` : `${upSide}保持空筐`;
      const downDesc = downNames ? `${downSide}装 ${downNames}` : `${downSide}保持空筐`;
      nextHint = `锦囊：试试让${downDesc}下行，带动${upDesc}上行一层。`;
    }
  }

  return {
    canReachExcellent: true,
    remainingRopeMoves: totalRemainingMoves,
    nextHint,
    deadlockReason: null,
    firstStep: firstStep
      ? {
          nextFloorA: firstStep.nextFloorA,
          upIndices: firstStep.upIndices,
          downIndices: firstStep.downIndices,
        }
      : null,
  };
}

/**
 * 将 BFS 求解出的最优宏步骤拆解为当前这一刻精确的「单步手指滑动动作」：
 * 既用于第 1 关新手引导，也用于任意关卡点击 💡 锦囊按钮时的零文字手指滑动提示！
 */
export function computeHintGesture(level: LevelSpec, state: GameSnapshot): HintGestureAction | null {
  const analysis = analyzePosition(level, state);
  if (!analysis.canReachExcellent) return null;

  // 若所有目标货已抵达对应楼层（仅剩筐内货物待卸到楼板）
  if (analysis.remainingRopeMoves === 0) {
    for (const it of level.items) {
      if (it.targetFloor === null) continue;
      const loc = state.locations[it.id];
      if (loc && loc.kind === 'basket' && getBasketFloor(state, loc.basket) === it.targetFloor) {
        return {
          type: 'unload-from-basket',
          itemId: it.id,
          basket: loc.basket,
          floor: it.targetFloor,
          pulseItemIds: [it.id],
        };
      }
    }
    return null;
  }

  if (!analysis.firstStep) return null;
  const { upIndices, downIndices } = analysis.firstStep;
  const upSet = new Set(upIndices.map((idx) => level.items[idx].id));
  const downSet = new Set(downIndices.map((idx) => level.items[idx].id));

  const curA = getItemsInBasket(level, state, 'A').map((i) => i.id);
  const curB = getItemsInBasket(level, state, 'B').map((i) => i.id);

  let desiredA = upSet;
  let desiredB = downSet;
  let moveDir: MoveDirection = 'A_UP';

  if (state.floorA === 1) {
    desiredA = upSet;
    desiredB = downSet;
    moveDir = 'A_UP';
  } else if (state.floorA === 3) {
    desiredA = downSet;
    desiredB = upSet;
    moveDir = 'A_DOWN';
  } else {
    // 2 楼两筐对称相遇：选择与当前筐内已有货物重合度更高的一侧，避免多余倒腾
    const scoreAUp = curA.filter((id) => upSet.has(id)).length + curB.filter((id) => downSet.has(id)).length;
    const scoreADown = curA.filter((id) => downSet.has(id)).length + curB.filter((id) => upSet.has(id)).length;
    if (scoreADown > scoreAUp) {
      desiredA = downSet;
      desiredB = upSet;
      moveDir = 'A_DOWN';
    } else {
      desiredA = upSet;
      desiredB = downSet;
      moveDir = 'A_UP';
    }
  }

  const floorB = oppositeFloor(state.floorA);

  // 1. 先卸下留在当层、不随本次升降走的多余筐内货物
  for (const id of curA) {
    if (!desiredA.has(id) && !desiredB.has(id)) {
      return { type: 'unload-from-basket', itemId: id, basket: 'A', floor: state.floorA, pulseItemIds: [id] };
    }
  }
  for (const id of curB) {
    if (!desiredA.has(id) && !desiredB.has(id)) {
      return { type: 'unload-from-basket', itemId: id, basket: 'B', floor: floorB, pulseItemIds: [id] };
    }
  }

  // 2. 2 楼交汇时若有货物在对侧筐里，优先跨筐移交（若对筐已满则先卸回 2 楼台面腾位）
  if (state.floorA === 2) {
    for (const id of curA) {
      if (desiredB.has(id)) {
        if (curB.length < level.basketCapacity) {
          return { type: 'basket-to-basket', itemId: id, fromBasket: 'A', toBasket: 'B', pulseItemIds: [id] };
        }
        return { type: 'unload-from-basket', itemId: id, basket: 'A', floor: 2, pulseItemIds: [id] };
      }
    }
    for (const id of curB) {
      if (desiredA.has(id)) {
        if (curA.length < level.basketCapacity) {
          return { type: 'basket-to-basket', itemId: id, fromBasket: 'B', toBasket: 'A', pulseItemIds: [id] };
        }
        return { type: 'unload-from-basket', itemId: id, basket: 'B', floor: 2, pulseItemIds: [id] };
      }
    }
  }

  // 3. 将楼板上的待运货物装入对应吊筐
  for (const it of level.items) {
    if (desiredA.has(it.id) && state.locations[it.id].kind === 'floor') {
      return { type: 'item-to-basket', itemId: it.id, basket: 'A', pulseItemIds: [it.id] };
    }
  }
  for (const it of level.items) {
    if (desiredB.has(it.id) && state.locations[it.id].kind === 'floor') {
      return { type: 'item-to-basket', itemId: it.id, basket: 'B', pulseItemIds: [it.id] };
    }
  }

  // 4. 配重装妥，向下拖动下坠侧吊筐升降一层
  if (moveDir === 'A_UP') {
    return {
      type: 'drag-basket',
      basket: 'B',
      fromFloor: floorB,
      toFloor: (floorB - 1) as Floor,
      moveDir: 'A_UP',
      pulseItemIds: [],
    };
  }
  return {
    type: 'drag-basket',
    basket: 'A',
    fromFloor: state.floorA,
    toFloor: (state.floorA - 1) as Floor,
    moveDir: 'A_DOWN',
    pulseItemIds: [],
  };
}

function expandMacroNeighbors(level: LevelSpec, floorA: Floor, floors: Floor[], cap: number): MacroStep[] {
  const n = level.items.length;
  const floorB = oppositeFloor(floorA);
  const steps: MacroStep[] = [];

  if (floorA === 1 || floorA === 3) {
    const idxA: number[] = [];
    const idxB: number[] = [];
    for (let i = 0; i < n; i++) {
      if (floors[i] === floorA) idxA.push(i);
      else if (floors[i] === floorB) idxB.push(i);
    }
    const subsA = subsetsUpTo(idxA, cap);
    const subsB = subsetsUpTo(idxB, cap);
    for (const sA of subsA) {
      const wA = sA.reduce((s, idx) => s + level.items[idx].weight, 0);
      for (const sB of subsB) {
        const wB = sB.reduce((s, idx) => s + level.items[idx].weight, 0);
        const valid = floorA === 1 ? wB >= wA : wA >= wB;
        if (!valid) continue;
        const nextFloors = [...floors] as Floor[];
        for (const idx of sA) nextFloors[idx] = 2;
        for (const idx of sB) nextFloors[idx] = 2;
        steps.push({
          nextKey: encodeMacroState(2, nextFloors),
          nextFloorA: 2,
          nextFloors,
          upIndices: floorA === 1 ? sA : sB,
          downIndices: floorA === 1 ? sB : sA,
        });
      }
    }
  } else {
    // floorA === 2 && floorB === 2
    const idx2: number[] = [];
    for (let i = 0; i < n; i++) {
      if (floors[i] === 2) idx2.push(i);
    }
    const subsUp = subsetsUpTo(idx2, cap);
    for (const sUp of subsUp) {
      const wUp = sUp.reduce((s, idx) => s + level.items[idx].weight, 0);
      const rem = idx2.filter((idx) => !sUp.includes(idx));
      const subsDn = subsetsUpTo(rem, cap);
      for (const sDn of subsDn) {
        const wDn = sDn.reduce((s, idx) => s + level.items[idx].weight, 0);
        if (wDn < wUp) continue;
        const nextFloors = [...floors] as Floor[];
        for (const idx of sUp) nextFloors[idx] = 3;
        for (const idx of sDn) nextFloors[idx] = 1;

        steps.push({
          nextKey: encodeMacroState(3, nextFloors),
          nextFloorA: 3,
          nextFloors,
          upIndices: sUp,
          downIndices: sDn,
        });
        steps.push({
          nextKey: encodeMacroState(1, nextFloors),
          nextFloorA: 1,
          nextFloors,
          upIndices: sUp,
          downIndices: sDn,
        });
      }
    }
  }

  return steps;
}

/**
 * 供自动化测试调用：检验关卡能否在不做任何 2 楼装卸的前提下直接对开过关（防退化校验）
 */
export function isSolvableWithout2FOps(level: LevelSpec): boolean {
  const n = level.items.length;
  const cap = level.basketCapacity;
  const cargoIndices = level.items.map((_, i) => i).filter((i) => level.items[i].targetFloor !== null);

  // 原子状态编码: floorA | item0Loc,item1Loc,... (1,2,3=floor, 4=A, 5=B)
  const initLocs = level.items.map((it) => it.startFloor as number);
  const encode = (fA: Floor, locs: number[]) => `${fA}:${locs.join(',')}`;
  const start = encode(level.startFloorA, initLocs);
  const visited = new Set<string>([start]);
  const queue: Array<{ fA: Floor; locs: number[] }> = [{ fA: level.startFloorA, locs: initLocs }];

  let head = 0;
  while (head < queue.length) {
    const { fA, locs } = queue[head++];
    const fB = getBasketFloor({ floorA: fA, locations: {}, ropeMoves: 0, totalSteps: 0, lastActionLabel: '' }, 'B');

    if (cargoIndices.every((i) => locs[i] === level.items[i].targetFloor)) {
      return true;
    }

    const inA = locs.map((v, i) => (v === 4 ? i : -1)).filter((i) => i >= 0);
    const inB = locs.map((v, i) => (v === 5 ? i : -1)).filter((i) => i >= 0);
    const wA = inA.reduce((s, i) => s + level.items[i].weight, 0);
    const wB = inB.reduce((s, i) => s + level.items[i].weight, 0);

    // 禁止在 2 楼做任何装卸
    if (fA !== 2) {
      for (const i of inA) {
        const nl = [...locs];
        nl[i] = fA;
        const k = encode(fA, nl);
        if (!visited.has(k)) {
          visited.add(k);
          queue.push({ fA, locs: nl });
        }
      }
      for (const i of inB) {
        const nl = [...locs];
        nl[i] = fB;
        const k = encode(fA, nl);
        if (!visited.has(k)) {
          visited.add(k);
          queue.push({ fA, locs: nl });
        }
      }
      if (inA.length < cap) {
        for (let i = 0; i < n; i++) {
          if (locs[i] === fA) {
            const nl = [...locs];
            nl[i] = 4;
            const k = encode(fA, nl);
            if (!visited.has(k)) {
              visited.add(k);
              queue.push({ fA, locs: nl });
            }
          }
        }
      }
      if (inB.length < cap) {
        for (let i = 0; i < n; i++) {
          if (locs[i] === fB) {
            const nl = [...locs];
            nl[i] = 5;
            const k = encode(fA, nl);
            if (!visited.has(k)) {
              visited.add(k);
              queue.push({ fA, locs: nl });
            }
          }
        }
      }
    }

    if (fA < 3 && wB >= wA) {
      const nf = (fA + 1) as Floor;
      const k = encode(nf, locs);
      if (!visited.has(k)) {
        visited.add(k);
        queue.push({ fA: nf, locs });
      }
    }
    if (fA > 1 && wA >= wB) {
      const nf = (fA - 1) as Floor;
      const k = encode(nf, locs);
      if (!visited.has(k)) {
        visited.add(k);
        queue.push({ fA: nf, locs });
      }
    }
  }
  return false;
}
