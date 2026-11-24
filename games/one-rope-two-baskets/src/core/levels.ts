import { LevelSpec } from './types';

/**
 * 全部 10 关采用极低认知负荷的规整化货物视觉体系：
 * - 普通待运货统一为【暖色麻袋】：1袋 = 重1，2并排袋 = 重2，3并排袋 = 重3；
 *   袋口扎绳与肚贴直接染成目标楼层色（蓝标 = 3F，橙标 = 2F，绿标 = 1F）。
 * - 无终点纯配重统一为异材质【铸铁秤砣】（重 2，深灰金属吊环造型，一眼区分于麻袋）。
 */
export const LEVELS: LevelSpec[] = [
  {
    id: 'lv01',
    index: 1,
    chapter: 1,
    title: '顺风搭车',
    subtitle: '单袋配双袋凑满三袋同升二楼，中途卸下单袋',
    briefing:
      '若先只让双袋对三袋走完全程，3 楼只剩空筐，1 楼的橙标单袋就再也上不去了。让单袋搭顺风车在 2 楼中途卸下！',
    basketCapacity: 2,
    startFloorA: 1,
    parRopeMoves: 2,
    parTotalSteps: 8,
    items: [
      { id: 'rice', name: '蓝标双袋', weight: 2, startFloor: 1, targetFloor: 3, visual: 'sack_2' },
      { id: 'paint', name: '橙标单袋', weight: 1, startFloor: 1, targetFloor: 2, visual: 'sack_1' },
      { id: 'parts', name: '绿标三袋', weight: 3, startFloor: 3, targetFloor: 1, visual: 'sack_3' },
    ],
  },
  {
    id: 'lv02',
    index: 2,
    chapter: 1,
    title: '半途拼单',
    subtitle: '二楼待运单袋，须趁交汇合筐带走',
    briefing:
      '2 楼搁着一只去 3 楼的蓝标单袋。若 1 楼与 3 楼直接对开到底，高处三袋落底后，半空的单袋便无人能抬。',
    basketCapacity: 2,
    startFloorA: 1,
    parRopeMoves: 2,
    parTotalSteps: 8,
    items: [
      { id: 'tea', name: '蓝标双袋', weight: 2, startFloor: 1, targetFloor: 3, visual: 'sack_2' },
      { id: 'paint', name: '蓝标单袋', weight: 1, startFloor: 2, targetFloor: 3, visual: 'sack_1' },
      { id: 'parts', name: '绿标三袋', weight: 3, startFloor: 3, targetFloor: 1, visual: 'sack_3' },
    ],
  },
  {
    id: 'lv03',
    index: 3,
    chapter: 1,
    title: '过站借势',
    subtitle: '到站未必急卸，冲上顶楼留重才能拉回同伴',
    briefing:
      '1 楼双袋与单袋都要去 2 楼，但合装 3 袋超过了 3 楼的绿标双袋。让橙标双袋过站冲上 3 楼蓄势，回程再拉起单袋！',
    basketCapacity: 2,
    startFloorA: 1,
    parRopeMoves: 3,
    parTotalSteps: 9,
    items: [
      { id: 'paint', name: '橙标单袋', weight: 1, startFloor: 1, targetFloor: 2, visual: 'sack_1' },
      { id: 'rice', name: '橙标双袋', weight: 2, startFloor: 1, targetFloor: 2, visual: 'sack_2' },
      { id: 'tea', name: '绿标双袋', weight: 2, startFloor: 3, targetFloor: 1, visual: 'sack_2' },
    ],
  },
  {
    id: 'lv04',
    index: 4,
    chapter: 1,
    title: '折返护送',
    subtitle: '先派单袋探底护送，再借双袋接回二楼',
    briefing:
      '3 楼两件货都只下到 2 楼，而 1 楼蓝标单袋要上 3 楼。先用橙标单袋探底护送它登顶，再由橙标双袋下楼接回！',
    basketCapacity: 2,
    startFloorA: 1,
    parRopeMoves: 3,
    parTotalSteps: 9,
    items: [
      { id: 'lantern', name: '蓝标单袋', weight: 1, startFloor: 1, targetFloor: 3, visual: 'sack_1' },
      { id: 'tools', name: '橙标单袋', weight: 1, startFloor: 3, targetFloor: 2, visual: 'sack_1' },
      { id: 'timber', name: '橙标双袋', weight: 2, startFloor: 3, targetFloor: 2, visual: 'sack_2' },
    ],
  },
  {
    id: 'lv05',
    index: 5,
    chapter: 1,
    title: '空筐调渡',
    subtitle: '空筐等重会师二楼，欲上先下借力登顶',
    briefing:
      '1 楼空无一物，两件上行麻袋全在 2 楼。别急着动 3 楼绿标双袋——先让两只空筐在 2 楼汇合！',
    basketCapacity: 2,
    startFloorA: 1,
    parRopeMoves: 4,
    parTotalSteps: 10,
    items: [
      { id: 'paint', name: '蓝标单袋', weight: 1, startFloor: 2, targetFloor: 3, visual: 'sack_1' },
      { id: 'rice', name: '蓝标双袋', weight: 2, startFloor: 2, targetFloor: 3, visual: 'sack_2' },
      { id: 'timber', name: '绿标双袋', weight: 2, startFloor: 3, targetFloor: 1, visual: 'sack_2' },
    ],
  },
  {
    id: 'lv06',
    index: 6,
    chapter: 2,
    title: '压舱秤砣',
    subtitle: '新机制【铸铁秤砣】：无终点要求，纯配重但占筐位',
    briefing:
      '黑铁【铸铁秤砣】没有终点楼层，停在哪一层都不影响过关，但会占 1 个筐位。先空筐去 2 楼用秤砣送蓝标双袋登顶！',
    basketCapacity: 2,
    startFloorA: 1,
    parRopeMoves: 4,
    parTotalSteps: 13,
    items: [
      { id: 'lantern', name: '蓝标单袋', weight: 1, startFloor: 1, targetFloor: 3, visual: 'sack_1' },
      { id: 'tea', name: '蓝标双袋', weight: 2, startFloor: 2, targetFloor: 3, visual: 'sack_2' },
      { id: 'mill', name: '橙标三袋', weight: 3, startFloor: 3, targetFloor: 2, visual: 'sack_3' },
      { id: 'sandbag', name: '铸铁秤砣', weight: 2, startFloor: 2, targetFloor: null, visual: 'iron_2' },
    ],
  },
  {
    id: 'lv07',
    index: 7,
    chapter: 2,
    title: '留种压轴',
    subtitle: '高位秤砣切忌早放，留作后手接应同伴',
    briefing:
      '3 楼的铸铁秤砣一旦过早放到底楼就会耗尽配重。先用橙标三袋将双货提上 2 楼拆筐接力，把秤砣留到最后回程！',
    basketCapacity: 2,
    startFloorA: 1,
    parRopeMoves: 4,
    parTotalSteps: 13,
    items: [
      { id: 'lantern', name: '蓝标单袋', weight: 1, startFloor: 1, targetFloor: 3, visual: 'sack_1' },
      { id: 'rice', name: '蓝标双袋', weight: 2, startFloor: 1, targetFloor: 3, visual: 'sack_2' },
      { id: 'mill', name: '橙标三袋', weight: 3, startFloor: 3, targetFloor: 2, visual: 'sack_3' },
      { id: 'sandbag', name: '铸铁秤砣', weight: 2, startFloor: 3, targetFloor: null, visual: 'iron_2' },
    ],
  },
  {
    id: 'lv08',
    index: 8,
    chapter: 2,
    title: '逆向蓄能',
    subtitle: '四件货登场：下楼双袋借余重反升三楼充能',
    briefing:
      '2 楼绿标双袋明明要去 1 楼，但若在 2 楼借三袋余力先把绿标双袋抬上 3 楼，它就能化身回程配重拉起蓝标双袋！',
    basketCapacity: 2,
    startFloorA: 1,
    parRopeMoves: 4,
    parTotalSteps: 12,
    items: [
      { id: 'rice', name: '蓝标双袋', weight: 2, startFloor: 1, targetFloor: 3, visual: 'sack_2' },
      { id: 'timber', name: '绿标双袋', weight: 2, startFloor: 2, targetFloor: 1, visual: 'sack_2' },
      { id: 'parts', name: '绿标三袋', weight: 3, startFloor: 3, targetFloor: 1, visual: 'sack_3' },
      { id: 'mill', name: '橙标三袋', weight: 3, startFloor: 1, targetFloor: 2, visual: 'sack_3' },
    ],
  },
  {
    id: 'lv09',
    index: 9,
    chapter: 2,
    title: '合纵连横',
    subtitle: '两只单袋二楼合筐下潜，托举双袋先行登顶',
    briefing:
      '先让两只单袋在 2 楼聚首合拼成 2 袋下潜，把 2 楼蓝标双袋托上 3 楼；再借 3 楼橙标三袋一举拉回双轻件！',
    basketCapacity: 2,
    startFloorA: 1,
    parRopeMoves: 4,
    parTotalSteps: 16,
    items: [
      { id: 'lantern', name: '蓝标单袋', weight: 1, startFloor: 1, targetFloor: 3, visual: 'sack_1' },
      { id: 'rice', name: '蓝标双袋', weight: 2, startFloor: 2, targetFloor: 3, visual: 'sack_2' },
      { id: 'tools', name: '绿标单袋', weight: 1, startFloor: 3, targetFloor: 1, visual: 'sack_1' },
      { id: 'parts', name: '橙标三袋', weight: 3, startFloor: 3, targetFloor: 2, visual: 'sack_3' },
    ],
  },
  {
    id: 'lv10',
    index: 10,
    chapter: 2,
    title: '满载天平',
    subtitle: '终章大考：四货一砣，六次拉绳丝丝入扣',
    briefing:
      '空筐会师 → 蓝标双袋逆沉将秤砣抬上 3 楼充能 → 两只单袋顺风升顶 → 底楼合重借橙标三袋反提二楼收官！',
    basketCapacity: 2,
    startFloorA: 1,
    parRopeMoves: 6,
    parTotalSteps: 19,
    items: [
      { id: 'lantern', name: '蓝标单袋', weight: 1, startFloor: 1, targetFloor: 3, visual: 'sack_1' },
      { id: 'paint', name: '橙标单袋', weight: 1, startFloor: 1, targetFloor: 2, visual: 'sack_1' },
      { id: 'tea', name: '蓝标双袋', weight: 2, startFloor: 2, targetFloor: 3, visual: 'sack_2' },
      { id: 'mill', name: '橙标三袋', weight: 3, startFloor: 3, targetFloor: 2, visual: 'sack_3' },
      { id: 'sandbag', name: '铸铁秤砣', weight: 2, startFloor: 2, targetFloor: null, visual: 'iron_2' },
    ],
  },
];

export function getLevelById(id: string): LevelSpec {
  const found = LEVELS.find((lv) => lv.id === id);
  return found || LEVELS[0];
}
