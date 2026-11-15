import type { GameConfig } from './config';
import type { BakeLoadId, IngredientId, Item, Pack } from './types';

// 熱湯で温めてから使うパック（カルボナーラ・コーンスープ・クック編 C8 のスープ2品）。熱湯に浸けた累計秒数が規定を超えると温まる（余温め）。
// 熱湯に浸けるパックの種類を増やすときは PACKS に足す（パックの id で分岐しない）。

type PackConfig = Pick<
  GameConfig,
  'carbonaraWarmTime' | 'cornSoupWarmTime' | 'cornSoupStackMax' | 'carbonaraStackMax' | 'zuppaWarmTime' | 'minestroneWarmTime' | 'cookSoupStackMax'
>;
type PackWarmKey = 'carbonaraWarmTime' | 'cornSoupWarmTime' | 'zuppaWarmTime' | 'minestroneWarmTime';
type PackStackKey = 'cornSoupStackMax' | 'carbonaraStackMax' | 'cookSoupStackMax';

// パックの表。warm = 温める秒数の設定値（config.ts）の名前、stack = 一度に手に持てる数の設定値の名前（省略 = 1つ）、
// load = 作業枠の焼き皿に入れたときの中身（bake.ts の表の、のせる物。クック編 C8。省略 = 焼き皿には入れない）
export const PACKS: Partial<Record<IngredientId, { warm: PackWarmKey; stack?: PackStackKey; load?: BakeLoadId }>> = {
  carbonaraSauce: { warm: 'carbonaraWarmTime', stack: 'carbonaraStackMax' },
  cornSoup: { warm: 'cornSoupWarmTime', stack: 'cornSoupStackMax' },
  zuppa: { warm: 'zuppaWarmTime', stack: 'cookSoupStackMax', load: 'zuppa' },
  minestrone: { warm: 'minestroneWarmTime', stack: 'cookSoupStackMax', load: 'minestrone' },
};

// 温めが必要なパックなら必要秒数、そうでなければ null（普通の具材）
export function warmTime(id: IngredientId, cfg: PackConfig): number | null {
  const p = PACKS[id];
  return p ? cfg[p.warm] : null;
}

// 一度に手に持てる数。コーンスープは最大5つ、カルボナーラは最大3つ、スープ2品は最大3つ（仮）。ほかのパックは1つ
export function stackLimit(id: IngredientId, cfg: PackConfig): number {
  const key = PACKS[id]?.stack;
  return key ? cfg[key] : 1;
}

// パックを作業枠の焼き皿に入れたときの中身（入れないパックは null）
export function packLoad(id: IngredientId): BakeLoadId | null {
  return PACKS[id]?.load ?? null;
}

// その中身になるパック（なければ null）
export function packOfLoad(load: BakeLoadId): IngredientId | null {
  return (Object.keys(PACKS) as IngredientId[]).find((id) => PACKS[id]?.load === load) ?? null;
}

export function createPack(id: IngredientId): Pack {
  return { id, soak: 0, warm: false };
}

// 冷蔵庫や台の「取り出し元」をクリックしたときに手に持つ物
export function stockItem(id: IngredientId, cfg: PackConfig): Item {
  if (id === 'saladBase') return { kind: 'plate', contents: ['saladBase'] }; // お皿にサラダが入ったもの
  if (id === 'penne') return { kind: 'rawNoodle', id: 'penne' };
  return warmTime(id, cfg) === null ? { kind: 'ingredient', id } : { kind: 'pack', packs: [createPack(id)] };
}

// いま手に持っているパックの山に、同じ種類のパックをもう1つ重ねられるか
export function canStackPack(hand: Item | null, id: IngredientId, cfg: PackConfig): hand is Extract<Item, { kind: 'pack' }> {
  return (
    hand?.kind === 'pack' &&
    stackLimit(id, cfg) > 1 &&
    hand.packs.every((p) => p.id === id) &&
    hand.packs.length < stackLimit(id, cfg)
  );
}

// 温まったパックのうち、最初の1つの位置（なければ -1）。id を指定すると、その種類だけ探す
export function findWarmPack(packs: readonly Pack[], id?: IngredientId): number {
  return packs.findIndex((p) => p.warm && (id === undefined || p.id === id));
}

// 熱湯に浸かっている間だけ呼ぶ
export function soakPack(pack: Pack, dt: number, cfg: PackConfig): void {
  pack.soak += dt;
  const need = warmTime(pack.id, cfg);
  if (need !== null && pack.soak >= need) pack.warm = true;
}
