import { BAKE_TABLE, bakeSummary, getBakeDish, type BakeDish } from './bake';
import { POSITIONS, getPosition } from './position';
import { MENU, MENU_CATEGORIES, formOf, type MenuCategory, type MenuCategoryDef, type MenuItem } from './recipe';
import type { Position, Station } from './types';

// iPad の「レシピ」「チュートリアル」の一覧（クック編設計書 4.9 / C9 の前半）。
// ポジションの切り替え → 分類のタブ → 品のカード（2列）の3段。どの品にも、3回のタップで着く。
// 分類分け・並び・カードの中身は、ここで作る（純関数。描画は hud.ts がこの結果を読むだけ）。品の名前で分岐しない。

export type MenuCard = {
  id: string;
  name: string;
  no?: string; // 番号（省略可）
  station: Station;
  points: number; // 値段の位置に出す点数（basePoints）
  note: string; // 一言（空なら出さない）
  big: boolean; // 分類の先頭の1品だけ、大きいカード
  color: string; // サムネのプレースホルダ（色の四角）の色
};

export type MenuSection = { category: MenuCategoryDef; cards: MenuCard[] };

// カードの一言。品に一言（note）があればそれ、焼き物は表から焼き方の要約、皿の品は鍋で加熱する分があれば「鍋で加熱」
export function cardNote(menu: MenuItem, table: readonly BakeDish[] = BAKE_TABLE): string {
  if (menu.note) return menu.note;
  if (formOf(menu) === 'bake') {
    const dish = getBakeDish(menu.id, table);
    return dish ? bakeSummary(dish) : '';
  }
  return menu.sauce ? '鍋で加熱' : '';
}

// このポジションの一覧に出す品（担当する station の、伝票に出せる品）
function listedMenus(position: Position, menus: readonly MenuItem[]): MenuItem[] {
  const stations: readonly Station[] = getPosition(position).stations;
  return menus.filter((m) => m.enabled && stations.includes(m.station));
}

// ポジションの一覧：分類の表（MENU_CATEGORIES）の順に、品のある分類だけを並べる。分類の中は、メニュー表（MENU）の順。
// まだ品のない分類（肉料理・焼きたてパンなど）は、タブを出さない
export function menuSections(position: Position, menus: readonly MenuItem[] = MENU, table: readonly BakeDish[] = BAKE_TABLE): MenuSection[] {
  const listed = listedMenus(position, menus);
  return MENU_CATEGORIES.map((category) => ({
    category,
    cards: listed
      .filter((m) => m.category === category.id)
      .map((m, i) => ({
        id: m.id,
        name: m.name,
        no: m.no,
        station: m.station,
        points: m.basePoints,
        note: cardNote(m, table),
        big: i === 0,
        color: category.color,
      })),
  })).filter((s) => s.cards.length > 0);
}

// 一覧を開いたとき・ポジションを切り替えたときに選んでおく分類（前に選んでいた分類がそのポジションにもあれば、それを残す）
export function pickCategory(sections: readonly MenuSection[], current: MenuCategory | null): MenuCategory | null {
  if (current && sections.some((s) => s.category.id === current)) return current;
  return sections[0]?.category.id ?? null;
}

// 品に着くまでのタップ：ポジション → 分類のタブ → カード。最初に見つかるポジション（担当が狭い順 = POSITIONS の並び）で返す。
// 一覧に出ない品（伝票に出ない品）は null
export type MenuPath = { position: Position; category: MenuCategory };

export function menuPath(menuId: string, menus: readonly MenuItem[] = MENU, table: readonly BakeDish[] = BAKE_TABLE): MenuPath | null {
  for (const p of POSITIONS) {
    const section = menuSections(p.id, menus, table).find((s) => s.cards.some((c) => c.id === menuId));
    if (section) return { position: p.id, category: section.category.id };
  }
  return null;
}
