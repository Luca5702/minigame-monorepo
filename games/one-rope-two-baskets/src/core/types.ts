export type Floor = 1 | 2 | 3;
export type BasketId = 'A' | 'B';
export type MoveDirection = 'A_UP' | 'A_DOWN';

export type ItemVisualKind =
  | 'sack_1'
  | 'sack_2'
  | 'sack_3'
  | 'iron_1'
  | 'iron_2'
  | 'iron_3';

export interface ItemSpec {
  id: string;
  name: string;
  weight: number;
  startFloor: Floor;
  /** null 表示无目标楼层的纯配重物（铸铁秤砣） */
  targetFloor: Floor | null;
  visual: ItemVisualKind;
}

export interface LevelSpec {
  id: string;
  index: number;
  chapter: 1 | 2;
  title: string;
  subtitle: string;
  briefing: string;
  basketCapacity: number;
  startFloorA: Floor;
  parRopeMoves: number;
  parTotalSteps: number;
  items: ItemSpec[];
}

export type ItemLocation =
  | { kind: 'floor'; floor: Floor }
  | { kind: 'basket'; basket: BasketId };

export interface GameSnapshot {
  floorA: Floor;
  locations: Record<string, ItemLocation>;
  ropeMoves: number;
  totalSteps: number;
  lastActionLabel: string;
}

export interface GameState extends GameSnapshot {
  levelId: string;
  /** 2 楼双筐交汇时，玩家当前选中的优先装货筐 */
  preferredBasketAt2F: BasketId;
  history: GameSnapshot[];
}

export type GradeKind = 'excellent' | 'pass' | 'none';

export interface EvaluationSummary {
  totalCargo: number;
  deliveredCargo: number;
  inBasketAtTargetCargo: number;
  grade: GradeKind;
  isParPerfect: boolean;
  weightA: number;
  weightB: number;
  countA: number;
  countB: number;
  floorA: Floor;
  floorB: Floor;
  potentialEnergy: number;
  canMoveAUp: boolean;
  canMoveADown: boolean;
}

export type ActionResult =
  | { ok: true; state: GameState; message: string }
  | {
      ok: false;
      reason:
        | 'BASKET_FULL'
        | 'NOT_SAME_FLOOR'
        | 'ALREADY_AT_LIMIT'
        | 'INSUFFICIENT_COUNTERWEIGHT'
        | 'NO_HISTORY'
        | 'INVALID_TARGET';
      message: string;
      downWeight?: number;
      upWeight?: number;
    };

export interface LevelProgressRecord {
  bestGrade: GradeKind;
  bestRopeMoves: number | null;
  bestTotalSteps: number | null;
}

export interface SaveProfile {
  version: 1;
  currentLevelId: string;
  muted: boolean;
  records: Record<string, LevelProgressRecord>;
}
