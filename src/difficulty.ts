import type { GameConfig } from './config';
import { MENU, type MenuCategory } from './recipe';

// 難易度。iPad の「ゲーム開始」で選ぶ。伝票の量（届く間隔・同時に並ぶ数）と、出てくる料理（品ごとの出やすさ）が変わる。
// 数値を調整するときは、この表だけ触ればよい。
export type Difficulty = 'trial' | 'leading' | 'associate';

type TicketTuning = Pick<
  GameConfig,
  'firstTicketAt' | 'ticketIntervalStart' | 'ticketIntervalEnd' | 'ticketIntervalJitter' | 'maxOpenTickets'
>;

// ストックの決まりのうち、難易度で変える物（クック編 C5。トライアルは、下調理のストックが減らない）
type StockTuning = Pick<GameConfig, 'prepStockConsume'>;

// 道具の手の決まりのうち、難易度で変える物（クック編 C4。トライアルは、熱い器を素手で取れる）
type ToolTuning = Pick<GameConfig, 'hotHandling'>;

export type DifficultyDef = {
  id: Difficulty;
  name: string; // 難易度の名前
  tagline: string; // 一言（どんな人向けか）
  summary: string; // 伝票と料理の特徴（iPad に出す）
  // config.ts の伝票の設定を、この難易度で上書きする分。書かない項目は config.ts のまま
  tickets: Partial<TicketTuning>;
  // config.ts のストックの設定を、この難易度で上書きする分（省略 = config.ts のまま）
  stock?: Partial<StockTuning>;
  // config.ts の道具の手の設定を、この難易度で上書きする分（省略 = config.ts のまま）
  tools?: Partial<ToolTuning>;
  // 品ごとの出やすさ（recipe.ts の id）。0 = 出ない。書いていない品は 1。比率で決まる。
  // 選んだポジションが担当する品だけに絞ってから掛ける（position.ts の menusFor）
  menuWeights: Record<string, number>;
  // 分類ごとの出やすさ（recipe.ts の category。クック編 C10）。menuWeights に書いた品は、そちらが優先。どちらにもない品は 1
  categoryWeights?: Partial<Record<MenuCategory, number>>;
};

export const DIFFICULTIES: readonly DifficultyDef[] = [
  {
    id: 'trial',
    name: 'トライアルクルー',
    tagline: '入りたてのバイトクルー',
    summary: '伝票はゆっくり届き、並ぶのは最大3枚。手順の多いペペロンチーノ・カルボナーラ・ペンネ・きのこのクリームパスタ・小エビのカクテル・蒸し鶏の香味ソースは出ません。',
    tickets: { firstTicketAt: 5, ticketIntervalStart: 40, ticketIntervalEnd: 25, ticketIntervalJitter: 0.15, maxOpenTickets: 3 },
    stock: { prepStockConsume: false }, // 下調理したポテトのストックが減らない
    tools: { hotHandling: false }, // 熱い器も素手（左クリック）で取れる。ヘラの「はがす」は、手が空のとき左クリック
    menuWeights: { tarako: 3, meat: 2, parma: 2, spinach: 1, shrimpSalad: 2, chickenSalad: 2, cornSoup: 2, peperoncino: 0, carbonara: 0, penne: 0, squidInk: 1, mushroomCream: 0, wakameSalad: 2, shrimpCocktail: 0, steamedChicken: 0, milanoDoria: 3, buffaloPizza: 1,
      // クック編 C10：1段階で終わる品だけ（§4.10 の並びが正。表の stages.length では引かない）。ミラノドリア・バッファローピザは上の値のまま
      cheeseMilanoDoria: 1, tarakoDoria: 1, tarakoGratin: 1, focaccia: 1, cinnamonFocaccia: 1, garlicFocaccia: 1, popcornShrimp: 1, spicyChicken: 1 },
    // クックの分類は 0（上の menuWeights に書いた10品だけが出る）。ヒートの分類は触らない
    categoryWeights: { doriaGratin: 0, pizza: 0, cookStarter: 0, bread: 0, meat: 0, cookSoup: 0 },
  },
  {
    id: 'leading',
    name: 'リーディングクルー',
    tagline: '慣れてきたころ合い',
    summary: '伝票は25秒おきから10秒おきへ、最大10枚。全メニューが同じ確率で出ます。',
    tickets: {}, // config.ts の標準値のまま
    menuWeights: { milanoDoria: 1, buffaloPizza: 1 }, // 書いていない品は 1（全部同じ確率）
  },
  {
    id: 'associate',
    name: 'アソシエイトクルー',
    tagline: 'キッチンのプロ。かなりの腕前',
    summary: '伝票は18秒おきから8秒おきへ、最大10枚。ペペロンチーノ・カルボナーラ・ペンネ・きのこのクリームパスタなど、手順の多いパスタや、小エビのカクテル・蒸し鶏の香味ソースが多めに届きます。',
    tickets: { firstTicketAt: 2, ticketIntervalStart: 18, ticketIntervalEnd: 8, ticketIntervalJitter: 0.3, maxOpenTickets: 10 },
    menuWeights: { tarako: 1, meat: 2, parma: 2, peperoncino: 3, carbonara: 3, penne: 3, squidInk: 2, mushroomCream: 3, wakameSalad: 1, shrimpCocktail: 2, steamedChicken: 2, spinach: 2, shrimpSalad: 1, chickenSalad: 1, cornSoup: 1, buffaloPizza: 3 },
    // クック編 C10（仮）：肉料理とスープを多め、ドリアとフォッカチオを少なめ。ピザ・前菜はその間（仕様にない判断）。
    // バッファローピザは、既存の menuWeights の値（テストで固定）のまま。ミラノドリアは他のドリアと同じく分類の 1（2026-11-16 承認）
    categoryWeights: { meat: 3, cookSoup: 3, doriaGratin: 1, bread: 1, pizza: 2, cookStarter: 2 },
  },
];

export const DEFAULT_DIFFICULTY: Difficulty = 'leading';

export function getDifficulty(id: Difficulty): DifficultyDef {
  const d = DIFFICULTIES.find((x) => x.id === id);
  if (!d) throw new Error(`unknown difficulty: ${id}`);
  return d;
}

// この難易度での、品ごとの出やすさ（menuWeights → categoryWeights → 1 の順に引く）。tickets.ts の pickMenu に渡す
export function weightsFor(id: Difficulty): Record<string, number> {
  const d = getDifficulty(id);
  const out: Record<string, number> = {};
  for (const m of MENU) out[m.id] = d.menuWeights[m.id] ?? d.categoryWeights?.[m.category] ?? 1;
  return out;
}

// この難易度での設定。練習（difficulty なし）は config.ts のまま
export function configFor(cfg: GameConfig, difficulty: Difficulty | null): GameConfig {
  if (!difficulty) return cfg;
  const d = getDifficulty(difficulty);
  return { ...cfg, ...d.tickets, ...(d.stock ?? {}), ...(d.tools ?? {}) };
}

export function isDifficulty(x: string | undefined): x is Difficulty {
  return DIFFICULTIES.some((d) => d.id === x);
}
