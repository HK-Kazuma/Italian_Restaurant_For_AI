import type { BakeLoadId, Item, PizzaBuild, PizzaFourth, PizzaTop, PizzaTopping } from './types';

// バッファローピザの組み立て（要件定義書「ピザ枠」）。
//   ピザ生地のスタックから生地を取り、ピザの鉄板にセット → ピザソース1杯 → ピザチーズ1杯 → モッツァレラチーズを2個（1個を3つ分に分けるので、2個で6つ）→ オーブンの上段へ
// 鉄板に置くのは、生地 → ソース → チーズ → モッツァレラ の順。

export const MOZZ_PER_BALL = 3; // モッツァレラ1個を、これだけの数に分けて周囲にのせる
export const MOZZ_BALLS = 2; // バッファローピザに使うモッツァレラの個数
export const MOZZ_TOTAL = MOZZ_PER_BALL * MOZZ_BALLS; // のせる数（6つ）

export const PIZZA_TOPPING_NAME: Record<PizzaTopping, string> = {
  sauce: 'ピザソース',
  cheese: 'ピザチーズ',
  mozzarella: 'モッツァレラチーズ',
  vegMushroom: '野菜ときのこ',
  sausage: 'ソーセージ',
  corn: 'コーン',
};

// 4番目の具のうち、レードル1杯でのせる3種類（クック編 C3）。load = 焼き物の表（bake.ts）で数える物の id、verb = のせるときの言い方
export const PIZZA_TOPS: Record<PizzaTop, { load: BakeLoadId; verb: string }> = {
  vegMushroom: { load: 'vegMushroom', verb: '野菜ときのこを全体に広げる' },
  sausage: { load: 'slicedSausage', verb: '輪切りのソーセージを全体に並べる' },
  corn: { load: 'corn', verb: 'コーンを全体に散らす' },
};
export const PIZZA_TOP_IDS = Object.keys(PIZZA_TOPS) as PizzaTop[];
export const isPizzaTop = (id: PizzaTopping): id is PizzaTop => id in PIZZA_TOPS;

// 4番目の具（モッツァレラ・野菜ときのこ・ソーセージ・コーン）。まだのせていなければ null
export function fourthOf(p: PizzaBuild): PizzaFourth | null {
  if (p.mozz > 0) return 'mozzarella';
  return p.top ?? null;
}

// 鉄板だけ（生地なし）
export function emptyPan(): PizzaBuild {
  return { dough: false, sauce: false, cheese: false, mozz: 0 };
}

// 生地・ソース・チーズがのった状態（モッツァレラはまだ）。pizza を持たない焼き皿は、この見た目と同じ扱い
export function sauceCheesePizza(): PizzaBuild {
  return { dough: true, sauce: true, cheese: true, mozz: 0 };
}

export const pizzaOf = (item: Extract<Item, { kind: 'bakeDish' }>): PizzaBuild => item.pizza ?? sauceCheesePizza();

// バッファローピザの材料がそろっているか（生地・ソース・チーズ・モッツァレラ6つ）
export function isBuffalo(p: PizzaBuild): boolean {
  return p.dough && p.sauce && p.cheese && p.mozz === MOZZ_TOTAL;
}

// 次にのせられる物（のせる順番を守っているか）。のせられないときは、その理由（のせられるなら null）
export function whyNotTopping(p: PizzaBuild, id: PizzaTopping): string | null {
  if (!p.dough) return '先にピザ生地をのせる';
  if (id === 'sauce') return p.sauce ? 'ピザソースはのせてある' : null;
  if (!p.sauce) return '先にピザソースを塗る';
  if (id === 'cheese') return p.cheese ? 'ピザチーズはのせてある' : null;
  if (!p.cheese) return '先にピザチーズを広げる';
  // 4番目の具は1種類だけ（2種類目はのらない）
  const fourth = fourthOf(p);
  if (fourth !== null && fourth !== id) return `具は1種類だけ（もう${PIZZA_TOPPING_NAME[fourth]}がのっている）`;
  if (isPizzaTop(id)) return p.top === id ? `${PIZZA_TOPPING_NAME[id]}はのせてある` : null;
  return p.mozz >= MOZZ_TOTAL ? 'モッツァレラはもう6つのっている' : null;
}

export const canAddTopping = (p: PizzaBuild, id: PizzaTopping): boolean => whyNotTopping(p, id) === null;

// 具をのせたあとの状態（元の p は書き換えない）。のせられないときは p のまま
export function addTopping(p: PizzaBuild, id: PizzaTopping): PizzaBuild {
  if (!canAddTopping(p, id)) return p;
  if (id === 'sauce') return { ...p, sauce: true };
  if (id === 'cheese') return { ...p, cheese: true };
  if (isPizzaTop(id)) return { ...p, top: id };
  return { ...p, mozz: p.mozz + MOZZ_PER_BALL };
}

// 円周に等間隔で並べる6か所（番号 0〜5）のうち、mozz 個ののせ方。1個目の3つは1つおき（0, 2, 4）、2個目の3つがそのあいだ（1, 3, 5）を埋める
export function mozzSpots(mozz: number): number[] {
  const first = [0, 2, 4];
  const second = [1, 3, 5];
  return [...first, ...second].slice(0, Math.max(0, Math.min(MOZZ_TOTAL, mozz)));
}

// 名前（HUD・案内用）
export function pizzaName(p: PizzaBuild): string {
  if (isBuffalo(p)) return 'バッファローピザ';
  if (!p.dough) return 'ピザの鉄板';
  if (!p.sauce) return 'ピザ生地';
  if (!p.cheese) return 'ピザ生地（ソース）';
  if (p.top) return `ピザ（${PIZZA_TOPPING_NAME[p.top]}）`;
  if (p.mozz === 0) return 'ピザ生地（ソース・チーズ）';
  return `ピザ（モッツァレラ ${p.mozz}/${MOZZ_TOTAL}）`;
}

// ピザの見た目の違いを区別する文字列（描き直しが要るか調べるため）。4番目の具の種類も入れる（モッツァレラは数、ほかは top）
export const pizzaSignature = (p: PizzaBuild): string => `${p.dough ? 1 : 0}${p.sauce ? 1 : 0}${p.cheese ? 1 : 0}${p.mozz}${p.top ? `:${p.top}` : ''}`;
