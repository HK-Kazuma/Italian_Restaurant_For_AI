import type { Difficulty } from './difficulty';
import { MENU, type MenuItem } from './recipe';
import type { Position, Station } from './types';

// ポジション（iPad の「ゲーム開始」で、難易度の前に選ぶ）。選んだポジションが担当する station の品だけが、伝票に届く。
// 表を触れば、担当・名前・ランキングの保存先の付け足しが変わる。

export type PositionDef = {
  id: Position;
  name: string;
  stations: readonly Station[]; // 担当する station（この station の品だけが伝票に出る）
  equipment: string; // 担当する設備（iPad のカードに出す）
  beta: boolean; // 品数が少ないうちは「β」と付ける
  rankSuffix: string; // ランキング・自己ベストの保存先で、難易度の名前の後ろに付ける文字（ヒートは付けない = 今までの保存先のまま）
};

export const POSITIONS: readonly PositionDef[] = [
  { id: 'heat', name: 'ヒート', stations: ['pasta', 'salad'], equipment: '茹で麺器・IH・サラダ台', beta: false, rankSuffix: '' },
  { id: 'cook', name: 'クック', stations: ['cook'], equipment: 'ジェットオーブン・ピザ台', beta: true, rankSuffix: '-cook' },
  { id: 'all', name: '通し', stations: ['pasta', 'salad', 'cook'], equipment: '厨房の全部', beta: true, rankSuffix: '-all' },
];

export const DEFAULT_POSITION: Position = 'heat';
// 練習キッチンは常に通し（どの品の伝票も届く）
export const PRACTICE_POSITION: Position = 'all';

export function getPosition(id: Position): PositionDef {
  const p = POSITIONS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown position: ${id}`);
  return p;
}

export function isPosition(x: string | undefined): x is Position {
  return POSITIONS.some((p) => p.id === x);
}

// このポジションが担当する品（伝票に出せる品）。重み（menuWeights）は、このあとの pickMenu で掛ける
export function menusFor(position: Position, menus: readonly MenuItem[] = MENU): MenuItem[] {
  const { stations } = getPosition(position);
  return menus.filter((m) => stations.includes(m.station));
}

// ランキング・自己ベストの保存先の名前。ヒートは難易度の名前そのまま（過去の記録を残す）、クック・通しは後ろに -cook・-all を付ける
export function rankingBoard(difficulty: Difficulty, position: Position): string {
  return `${difficulty}${getPosition(position).rankSuffix}`;
}

// station の表示名（iPad のレシピ・チュートリアルの札）。伝票の左端の帯の色は style.css の .ticket.st-{station}（パスタ = 赤、サラダ = 緑、クック = 橙）
export const STATION_NAME: Record<Station, string> = { pasta: 'パスタ台', salad: 'サラダ台', cook: 'クック' };
