export type ScreenId =
  | 'cover'
  | 'select'
  | 'config'
  | 'play'
  | 'celebrate'
  | 'letter'
  | 'postcard';

export type PieceCount = 9 | 16 | 25;

export type StyleId = 'matte' | 'grain' | 'lustre' | 'holo' | 'soft-pink';

export type TimerMode = 'none' | 60 | 90;

export type ExportLayout = 'showcase' | 'front' | 'back';

export interface PresetPhoto {
  id: string;
  title: string;
  tag: string;
  src: string;
  defaultNote: string;
}

export interface StyleDefinition {
  id: StyleId;
  name: string;
  enName: string;
  tagline: string;
  paperColor: string;
  inkColor: string;
  accentHex: string;
}

export interface EdgeSides {
  top: -1 | 0 | 1;
  right: -1 | 0 | 1;
  bottom: -1 | 0 | 1;
  left: -1 | 0 | 1;
}

export interface RenderedPiece {
  id: number;
  row: number;
  col: number;
  edges: EdgeSides;
  canvas: HTMLCanvasElement;
  /** Padding ratio relative to cell width/height around all 4 sides */
  padRatio: number;
}
