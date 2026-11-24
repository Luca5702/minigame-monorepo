import type { PresetPhoto, StyleDefinition } from './types.ts';

export const PRESET_PHOTOS: PresetPhoto[] = [
  {
    id: 'ootd',
    title: '秋冬穿搭',
    tag: 'OOTD',
    src: './presets/ootd.jpg',
    defaultNote: '把今天的温柔穿搭，一块块拼回日常里。',
  },
  {
    id: 'dessert',
    title: '草莓甜品',
    tag: '探店甜点',
    src: './presets/dessert.jpg',
    defaultNote: '生活偶尔细碎，幸好还有一口甜可以拼起来。',
  },
  {
    id: 'coffee',
    title: '晨光拿铁',
    tag: '慢生活',
    src: './presets/coffee.jpg',
    defaultNote: '一杯热拿铁的时间，让心慢慢归位。',
  },
  {
    id: 'sunset',
    title: '橘子海落日',
    tag: '旅行风景',
    src: './presets/sunset.jpg',
    defaultNote: '收集一片橘子海的晚风，寄给今天的自己。',
  },
  {
    id: 'nails',
    title: '腮红猫眼',
    tag: '美甲碎光',
    src: './presets/nails.jpg',
    defaultNote: '指尖藏着细碎极光，每一块都闪闪发亮。',
  },
  {
    id: 'flowers',
    title: '暖阳花束',
    tag: '浪漫日常',
    src: './presets/flowers.jpg',
    defaultNote: '路过街角买了一束光，亲手拼成好心情。',
  },
  {
    id: 'cat',
    title: '窗边奶猫',
    tag: '治愈瞬间',
    src: './presets/cat.jpg',
    defaultNote: '晒太阳的小猫打了个盹，烦恼全被拼好啦。',
  },
];

export const STYLE_DEFINITIONS: StyleDefinition[] = [
  {
    id: 'lustre',
    name: '浮光锦',
    enName: 'Lustre',
    tagline: '丝绸珠光流转',
    paperColor: '#FAF5EF',
    inkColor: '#2B211E',
    accentHex: '#E04F63',
  },
  {
    id: 'soft-pink',
    name: '软粉',
    enName: 'Soft Pink',
    tagline: '小红书奶油粉雾',
    paperColor: '#FFF5F7',
    inkColor: '#3A2328',
    accentHex: '#EC5E82',
  },
  {
    id: 'grain',
    name: '胶片颗粒',
    enName: 'Grain',
    tagline: '暖调银盐质感',
    paperColor: '#F6EFE4',
    inkColor: '#2E241B',
    accentHex: '#C96A2B',
  },
  {
    id: 'matte',
    name: '雾面',
    enName: 'Matte',
    tagline: '美术馆棉纸柔雾',
    paperColor: '#F4F0EA',
    inkColor: '#262320',
    accentHex: '#8C5843',
  },
  {
    id: 'holo',
    name: '全息',
    enName: 'Holo',
    tagline: '幻彩镭射折射',
    paperColor: '#F5F8FA',
    inkColor: '#1E2933',
    accentHex: '#2E8BC0',
  },
];

export const MOOD_QUOTES: string[] = [
  '把细碎的日常，亲手拼成喜欢的生活',
  '今日份小确幸，已全部归位',
  '慢慢来，每一块碎片都算数',
  '把这一刻切碎珍藏，再拼成明信片寄给你',
];
