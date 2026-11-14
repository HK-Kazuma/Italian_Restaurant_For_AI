import { BAKE_LOAD_NAME, BAKE_VESSELS, baseOf, candidatesAt, canTakeBase, vesselCapacity, viewOf, type PrepYieldKey } from './bake';
import type { GameConfig } from './config';
import type { BakeLoadId, CookBinId, FrozenBagId, Item, PrepStockId } from './types';

// 冷凍の袋・ストック容器と、重ねて持つ具（クック編設計書 4.5 / C5）。
//
// - 冷凍の袋（具材台の上の壁の吊り棚。なくならない）：袋を左クリックするたびに、同じ種類の具を1つずつ重ねて持つ（上限 cfg.loadStackMax）。
//   袋ごと持つ袋（whole。ポテト）は、袋のまま手に取り、器を左クリックするたびに 1回分（袋の 1/whole）ずつ入る。
// - 重ねて持つ具は、器を左クリックすると、器に入るだけ入る（入りきらない分は手に残る。入る数は bake.ts の表の、その器の上限）。
// - ストック容器（具材台の天板）：左クリックで1つずつ取る（重ねて持てる）。数に限りがあるのは、下調理のストック（ポテト）だけ。
//   下調理のストックは、下調理の表（bake.ts の PREP_TABLE）の焼き上がりを空けると増える。
// 品の名前で分岐しない。袋・容器の決まりは、この表から引く。

type StockConfig = Pick<GameConfig, 'loadStackMax' | 'prepStockConsume' | PrepYieldKey | 'potatoStockStart'>;

// 冷凍の袋。load = 袋から取る具（器に入る物）。whole = 袋ごと手に取る袋なら、何回に分けて器に入れるか（省略 = 1つずつ重ねて持つ）
export type FrozenBagDef = { name: string; load: BakeLoadId; whole?: number };
export const FROZEN_BAGS: Record<FrozenBagId, FrozenBagDef> = {
  spicyChicken: { name: '辛味チキン', load: 'spicyChicken' },
  popcornShrimp: { name: 'ポップコーンシュリンプ', load: 'shrimp' },
  potato: { name: 'ポテト', load: 'frozenPotato', whole: 4 }, // 袋ごと持つ。大きめの焼成パッド4つぶん
  chorizo: { name: 'チョリソー', load: 'sausage' },
};
// 吊り棚に並べる順（左 = オーブン側から）
export const FROZEN_BAG_IDS: readonly FrozenBagId[] = ['spicyChicken', 'popcornShrimp', 'potato', 'chorizo'];

// 下調理のストック（数に限りがある）。load = 容器から取る具、start = 最初の数の設定値の名前
export const PREP_STOCKS: Record<PrepStockId, { name: string; load: BakeLoadId; start: 'potatoStockStart' }> = {
  potato: { name: 'ポテト', load: 'potato', start: 'potatoStockStart' },
};
export const PREP_STOCK_IDS = Object.keys(PREP_STOCKS) as PrepStockId[];

// 具材台の天板のストック容器。gives = 左クリックで取れる具（省略 = まだ取れない。使う品が C6・C7 で入るまで「準備中」）。
// stock = 数に限りのある、下調理のストック（省略 = なくならない）。empty = ストックが0のときの理由
export type CookBinDef = { name: string; gives?: BakeLoadId; stock?: PrepStockId; empty?: string };
export const COOK_BINS: Record<CookBinId, CookBinDef> = {
  potato: { name: 'ポテト', gives: 'potato', stock: 'potato', empty: 'ポテトがない（下調理する）' },
  corn: { name: 'コーン', gives: 'corn' },
  patty: { name: 'パティ', gives: 'patty' },
  chicken: { name: 'チキン', gives: 'chicken' },
  focaccia: { name: 'フォッカチオ' },
  egg: { name: '卵' },
  oilSheet: { name: '脂取りシート' },
  cheeseSauceCup: { name: 'チーズソースの容器' },
  demiglace: { name: 'デミグラスソース' },
  vegPaste: { name: '野菜ペースト' },
};
export const COOK_BIN_IDS = Object.keys(COOK_BINS) as CookBinId[];

type BakeDishItem = Extract<Item, { kind: 'bakeDish' }>;
type PourHand = Extract<Item, { kind: 'loadStack' | 'frozenBag' }>;

// ゲーム開始時の、下調理のストックの数
export function initialPrepStock(cfg: StockConfig): Record<PrepStockId, number> {
  return Object.fromEntries(PREP_STOCK_IDS.map((id) => [id, cfg[PREP_STOCKS[id].start]])) as Record<PrepStockId, number>;
}

// 手に持った、器に入れる物（重ねて持つ具・袋ごと持った袋）か
export const isPourHand = (hand: Item | null): hand is PourHand => hand?.kind === 'loadStack' || hand?.kind === 'frozenBag';

// 手の物から器に入る具の種類
export const pourLoadOf = (hand: PourHand): BakeLoadId => (hand.kind === 'loadStack' ? hand.id : FROZEN_BAGS[hand.id].load);

// 重ねて持つ具を、もう1つ足した手。足せなければ null（手がふさがっている・別の種類・上限）
export function addToStack(hand: Item | null, load: BakeLoadId, cfg: Pick<GameConfig, 'loadStackMax'>): Item | null {
  if (!hand) return { kind: 'loadStack', id: load, count: 1 };
  if (hand.kind === 'loadStack' && hand.id === load && hand.count < cfg.loadStackMax) return { ...hand, count: hand.count + 1 };
  return null;
}

// --- 冷凍の袋 ---

// 袋を左クリックしたあとの手。できなければ null。袋ごと持つ袋は、手が空のときに取り、同じ袋を持っていれば吊り棚に戻す（'return'。手が空になる）
export function bagClick(hand: Item | null, id: FrozenBagId, cfg: Pick<GameConfig, 'loadStackMax'>): Item | 'return' | null {
  const bag = FROZEN_BAGS[id];
  if (bag.whole) {
    if (!hand) return { kind: 'frozenBag', id, left: bag.whole };
    if (hand.kind === 'frozenBag' && hand.id === id) return 'return';
    return null;
  }
  return addToStack(hand, bag.load, cfg);
}

// 袋に視点を合わせたときの案内
export function bagHint(hand: Item | null, id: FrozenBagId, cfg: Pick<GameConfig, 'loadStackMax'>): string {
  const bag = FROZEN_BAGS[id];
  const r = bagClick(hand, id, cfg);
  if (r === 'return') return `左クリック：${bag.name}の袋を吊り棚に戻す`;
  if (r && bag.whole) return `左クリック：${bag.name}の袋を取る（大きめの焼成パッドに1/${bag.whole}ずつ入れる）`;
  if (r && r.kind === 'loadStack') return `左クリック：${bag.name}を1つ取る（${r.count}つ目。最大${cfg.loadStackMax}）`;
  if (hand?.kind === 'loadStack' && hand.id === bag.load) return `これ以上は持てない（最大${cfg.loadStackMax}）`;
  return `冷凍の${bag.name}（手を空けて取る）`;
}

// --- 器に入れる ---

export type PourResult = { dish: BakeDishItem; hand: Item | null; moved: number };

// 器に入る数の残り（入らない器は 0）。ピザの鉄板（生地・具は既存の決まり）・焦げた器・受け台に乗せた器には入れない
function roomFor(dish: BakeDishItem, load: BakeLoadId): number {
  if (BAKE_VESSELS[dish.style].pizzaBuild || dish.state === 'burnt' || baseOf(dish) !== null) return 0;
  return Math.max(0, vesselCapacity(dish.style, load) - (viewOf(dish).loaded[load] ?? 0));
}

// 手の物を器に入れた結果。重ねて持つ具は入るだけ（残りは手に残る）、袋ごと持った袋は1回分（袋が空になったら手から消える）。入らなければ null
export function pourInto(dish: BakeDishItem, hand: Item | null): PourResult | null {
  if (!isPourHand(hand)) return null;
  const load = pourLoadOf(hand);
  const n = Math.min(roomFor(dish, load), hand.kind === 'loadStack' ? hand.count : 1);
  if (n <= 0) return null;
  const loaded = { ...(dish.loaded ?? {}), [load]: (dish.loaded?.[load] ?? 0) + n };
  let rest: Item | null;
  if (hand.kind === 'loadStack') rest = hand.count > n ? { ...hand, count: hand.count - n } : null;
  else rest = hand.left > 1 ? { ...hand, left: hand.left - 1 } : null;
  return { dish: { ...dish, loaded }, hand: rest, moved: n };
}

// 器に入れられないときの理由（入れられるなら null）
export function whyNotPour(dish: BakeDishItem, hand: PourHand): string | null {
  if (pourInto(dish, hand)) return null;
  const name = BAKE_LOAD_NAME[pourLoadOf(hand)].name;
  if (dish.state === 'burnt') return '焦げている（右クリックで捨てる）';
  if (baseOf(dish) !== null) return '受け台に乗せた器には入れられない';
  const cap = BAKE_VESSELS[dish.style].pizzaBuild ? 0 : vesselCapacity(dish.style, pourLoadOf(hand));
  if (cap === 0) return `${name}は、この器には入れない`;
  return `もう入らない（${name}は${cap}${BAKE_LOAD_NAME[pourLoadOf(hand)].unit}まで）`;
}

// 器に入れるときの案内
export function pourHint(dish: BakeDishItem, hand: PourHand): string {
  const r = pourInto(dish, hand);
  if (!r) return `入れられない（${whyNotPour(dish, hand)}）`;
  const name = BAKE_LOAD_NAME[pourLoadOf(hand)].name;
  if (hand.kind === 'frozenBag') return `左クリック：${FROZEN_BAGS[hand.id].name}の袋の1/${FROZEN_BAGS[hand.id].whole ?? 1}を入れる（袋の残り${hand.left - 1}回分）`;
  return r.hand ? `左クリック：${name}を${r.moved}つ入れる（入りきらない${hand.count - r.moved}つは手に残る）` : `左クリック：${name}を${r.moved}つ入れる`;
}

// --- ストック容器 ---

export type BinTake = { hand: Item; stock: Record<PrepStockId, number> };

// ストック容器を左クリックして、1つ取ったあと（手・ストックの数）。取れなければ null。
// cfg は難易度で上書きしたもの（configFor）。prepStockConsume = false なら、取ってもストックが減らない
export function takeFromBin(hand: Item | null, id: CookBinId, stock: Record<PrepStockId, number>, cfg: Pick<GameConfig, 'loadStackMax' | 'prepStockConsume'>): BinTake | null {
  const bin = COOK_BINS[id];
  if (!bin.gives) return null;
  if (bin.stock && stock[bin.stock] <= 0) return null;
  const next = addToStack(hand, bin.gives, cfg);
  if (!next) return null;
  const out = { ...stock };
  if (bin.stock && cfg.prepStockConsume) out[bin.stock]--;
  return { hand: next, stock: out };
}

// 下調理の焼き上がりを、このストック容器に空けたら増える数（空けられなければ null）。
// 下調理の表の品で、最後の段階がちょうど焼き上がった器だけ（生焼け・焦げは空けられない）
export function emptyYield(hand: Item | null, id: CookBinId, cfg: StockConfig): { stock: PrepStockId; add: number } | null {
  const bin = COOK_BINS[id];
  if (!bin.stock || hand?.kind !== 'bakeDish' || !canTakeBase(hand, 'prepStock')) return null;
  const row = candidatesAt(viewOf(hand), hand.stage ?? 0).find((d) => d.prep?.stock === bin.stock);
  return row?.prep ? { stock: row.prep.stock, add: cfg[row.prep.per] } : null;
}

// ストック容器の表示（「ポテト 12」。なくならない容器は名前だけ）
export function binLabel(id: CookBinId, stock: Record<PrepStockId, number>): string {
  const bin = COOK_BINS[id];
  return bin.stock ? `${bin.name} ${stock[bin.stock]}` : bin.name;
}

// 残りが少ないか（ラベルの色を変える）
export function binLow(id: CookBinId, stock: Record<PrepStockId, number>, cfg: Pick<GameConfig, 'prepStockLowAt'>): boolean {
  const s = COOK_BINS[id].stock;
  return s !== undefined && stock[s] <= cfg.prepStockLowAt;
}

// ストック容器に視点を合わせたときの案内
export function binHint(hand: Item | null, id: CookBinId, stock: Record<PrepStockId, number>, cfg: StockConfig): string {
  const bin = COOK_BINS[id];
  const label = binLabel(id, stock);
  const y = emptyYield(hand, id, cfg);
  if (y) return `左クリック：${PREP_STOCKS[y.stock].name}を容器に空ける（+${y.add}）`;
  if (hand?.kind === 'bakeDish' && bin.stock) {
    if (hand.state === 'half') return '生焼け（もう一度焼いてから空ける）';
    if (hand.state === 'burnt') return '焦げている（空けられない。右クリックで捨てる）';
  }
  if (!bin.gives) return `${bin.name}（準備中。まだ伝票に出ない品の具）`;
  if (bin.stock && stock[bin.stock] <= 0) return bin.empty ?? `${bin.name}がない`;
  const t = takeFromBin(hand, id, stock, cfg);
  if (t?.hand.kind === 'loadStack') return `左クリック：${bin.name}を1つ取る（${t.hand.count}つ目。${label}）`;
  if (hand?.kind === 'loadStack' && hand.id === bin.gives) return `これ以上は持てない（最大${cfg.loadStackMax}）`;
  return label;
}
