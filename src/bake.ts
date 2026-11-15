import type { GameConfig } from './config';
import { MOZZ_TOTAL, PIZZA_TOPS, pizzaName, sauceCheesePizza } from './pizza';
import { MENU, formOf, oldestTicket, type MenuItem } from './recipe';
import type {
  BakeBase,
  BakeCare,
  BakeFinishId,
  BakeLoad,
  BakeLoadId,
  BakeProgress,
  BakeState,
  BakeStyle,
  Item,
  PizzaBuild,
  PrepStockId,
  Ticket,
} from './types';

// 焼き物の表と「段階焼き」（クック編設計書 4.1 / C1）。
//
// 1品 = 段階の並び ＋ 仕上げ。1つの段階は、
//   ①流す前にのせる物（種類・数・のせる位置。前の段階までにのせた物に足す）
//   ②流す前に必要な手入れ（ヘラではがす、など）
//   ③必要な焼き時間（U = 上段1周 の何倍か。整数）
// を持つ。焼け具合は段階ごとに数える。いまの段階で焼いた秒数が、必要な時間ちょうどで「焼き上がり」、足りなければ「生焼け」、
// BURN_RATIO 倍を超えたら「焦げ」。焼き上がった段階のあとに次の段階があれば、流すときに秒数を 0 に戻して次の段階へ進む。
//
// 流すとき・取るとき・提供するときは、器の種類・中身・段階から、当てはまる品をこの表から探す（品の名前で分岐しない）。
// 品を足すときは、recipe.ts の MENU に form: 'bake' の品を足し、この表に同じ id の行を足す。
// 表の値の決まり（同じ中身・同じ段階なら必要な時間が同じ、など）は tableProblems で調べ、テスト（bake.test.ts）で縛る。

type OvenTimes = Pick<GameConfig, 'ovenUpperTime' | 'ovenLowerTime'>;

// 焼いた秒数が、必要な秒数のこの倍を超えると焦げる（焦げたあとは戻らない）
export const BURN_RATIO = 1.25;
const EPS = 1e-6;

export const BAKE_STATE_NAME: Record<BakeState, string> = { raw: '焼く前', half: '生焼け', baked: '焼き上がり', burnt: '焦げた' };

// --- 表の型 ---

// のせる位置（見た目用。位置は表で決まり、自動で入る）
// upper = 上（奥）のまん中、upperLeft・upperRight = 左上・右上、lowerCenter = 下（手前）のまん中（クック編 C7 の鉄板の盛り付け）
export type LoadSpot = 'all' | 'ring' | 'center' | 'left' | 'right' | 'upper' | 'upperLeft' | 'upperRight' | 'lowerCenter' | 'side';
// on = 下敷き（この物がそろってのっている上にだけ、のせられる。例：辛味チキンは脂取りシートの上、たらこソースは逆さまのフォッカチオの上。クック編 C6）
export type LoadSpec = { id: BakeLoadId; count: number; at?: LoadSpot; on?: BakeLoadId };

export type BakeStage = {
  load: LoadSpec[]; // この段階を流す前にのせる物（前の段階までの物に足す）。これが「そろった」中身で、器に入る上限にもなる
  minLoad?: LoadSpec[]; // 流せる最低限（省略 = load のすべて）。足りないまま焼いた品は、提供のときに「材料がそろっていない」になる
  care?: BakeCare[]; // この段階を流す前に必要な手入れ
  need: number; // 必要な焼き時間（U = 上段1周 の何倍か。整数）
};

export type BakeFinish = {
  base: BakeBase; // 受け台
  extras?: BakeFinishId[]; // ソース・振る物・のせる物（受け台のほか）
  at?: Partial<Record<BakeFinishId, LoadSpot>>; // 仕上げの位置（見た目用。省略 = FINISH_SPOT の位置。クック編 C7：目玉焼きは右上、ミックスグリルのデミグラスはハンバーグの上）
};

// 下調理（伝票に出ない）の焼き上がりを、ストック容器に空けたときに増える数。per = その数の設定値（config.ts）の名前
export type PrepYieldKey = 'potatoPerLargePad';
export type PrepYield = { stock: PrepStockId; per: PrepYieldKey };

export type BakeDish = {
  id: string; // メニューの id（recipe.ts の MENU と同じ）。下調理の行は、下調理の id
  name?: string; // 名前（メニューにない行 = 下調理だけ。メニューの品は recipe.ts の名前）
  vessel: BakeStyle; // 器
  stock?: boolean; // 焼く前の中身が入った山から取る品（ドリアなど）。器の山から取った空の器（blank）からは作れない。
  // 品ごとに別の山があり、取った皿は、どの山から取ったか（BakeProgress の stock）を覚えている。同じ器の stock の品は、山で区別する
  stages: BakeStage[]; // 段階（1つ以上）
  finish: BakeFinish; // 仕上げ
  prep?: PrepYield; // 下調理の行（PREP_TABLE）だけ：焼き上がりを空けるストックと、増える数
};

// --- 表 ---
// クック編 C3 のピザ3品の段階：生地 → ソース → チーズ → 4番目の具1杯（仮）→ U
const pizzaTopStage = (top: keyof typeof PIZZA_TOPS): BakeStage => ({
  load: [
    { id: 'dough', count: 1, at: 'all' },
    { id: 'pizzaSauce', count: 1, at: 'all' },
    { id: 'pizzaCheese', count: 1, at: 'all' },
    { id: PIZZA_TOPS[top].load, count: 1, at: 'all' }, // レードル1杯（仮）
  ],
  minLoad: [{ id: 'dough', count: 1 }], // バッファローピザと同じ（生地さえあれば流せる。足りないまま焼いたピザは、提供で「そろっていない」）
  need: 1,
});
// クック編 C7 の鉄板焼きの段階。付け合わせ（途中にのせる物）は、コーン1杯（上）・ポテト1個（左）（仮）
const GARNISH: LoadSpec[] = [
  { id: 'corn', count: 1, at: 'upper' },
  { id: 'potato', count: 1, at: 'left' },
];
// チーズソースの小さい容器（ピザソース1杯・ピザチーズ1杯（仮）を入れた物）。2回目に流す前の鉄板の空き（右）にのせる
const CHEESE_CUP: LoadSpec = { id: 'cheeseCup', count: 1, at: 'right' };
// ハンバーグ：パティ（中央）→ U → ヘラではがす → 付け合わせ（＋ extra）→ U
const hamburgStages = (extra: LoadSpec[] = []): BakeStage[] => [
  { load: [{ id: 'patty', count: 1, at: 'center' }], need: 1 },
  { load: [...GARNISH, ...extra], care: ['scrape'], need: 1 },
];
// チキン：チキン（中央）→ L → ヘラではがす → 付け合わせ（＋ extra）→ U
const chickenStages = (extra: LoadSpec[] = []): BakeStage[] => [
  { load: [{ id: 'chicken', count: 1, at: 'center' }], need: 2 },
  { load: [...GARNISH, ...extra], care: ['scrape'], need: 1 },
];
// 4.0 のメニュー一覧のうち、いま実装している8品（既存の2品 ＋ クック編 C3 の6品。C3 の6品は 2026-11-14 に末尾へ足して有効化）。
// 既存の2品の値は既存の動き（ドリア = 下段1周、ピザ = 上段1周）と同じ。
export const BAKE_TABLE: readonly BakeDish[] = [
  // ミラノドリア：ドリアスタックから取った皿（中身はそのまま）を、L（下段1周 = 上段2周）→ 下駄に乗せる
  { id: 'milanoDoria', vessel: 'doria', stock: true, stages: [{ load: [], need: 2 }], finish: { base: 'geta' } },
  // バッファローピザ：生地 → ピザソース1杯 → ピザチーズ1杯 → モッツァレラ2個（6つ）を、U → お皿に移す。
  // 既存の動きのまま、生地さえのっていれば流せる（材料が足りないまま焼いたピザは、提供で「そろっていない」）
  {
    id: 'buffaloPizza',
    vessel: 'pizza',
    stages: [
      {
        load: [
          { id: 'dough', count: 1, at: 'all' },
          { id: 'pizzaSauce', count: 1, at: 'all' },
          { id: 'pizzaCheese', count: 1, at: 'all' },
          { id: 'mozzarella', count: MOZZ_TOTAL, at: 'ring' },
        ],
        minLoad: [{ id: 'dough', count: 1 }],
        need: 1,
      },
    ],
    finish: { base: 'pizzaPlate' },
  },
  // 焼きチーズミラノドリア：専用の山（仮：ミラノドリアとは別の山）→ L → 下駄に乗せ、パセリを振る
  { id: 'cheeseMilanoDoria', vessel: 'doria', stock: true, stages: [{ load: [], need: 2 }], finish: { base: 'geta', extras: ['parsley'] } },
  // たらこのドリア：専用の山（たらこソース・シュリンプ3つ・グランモラビアがのった状態）→ L → 下駄
  { id: 'tarakoDoria', vessel: 'doria', stock: true, stages: [{ load: [], need: 2 }], finish: { base: 'geta' } },
  // たらこのグラタン：専用の山（仮：パセリは最初からのっている）→ L → 下駄
  { id: 'tarakoGratin', vessel: 'doria', stock: true, stages: [{ load: [], need: 2 }], finish: { base: 'geta' } },
  // ピザ3品：生地 → ソース → チーズ → 具（野菜ときのこ・ソーセージ・コーン）1杯（仮）→ U → お皿に移す
  { id: 'vegMushroomPizza', vessel: 'pizza', stages: [pizzaTopStage('vegMushroom')], finish: { base: 'pizzaPlate' } },
  { id: 'sausagePizza', vessel: 'pizza', stages: [pizzaTopStage('sausage')], finish: { base: 'pizzaPlate' } },
  { id: 'cornPizza', vessel: 'pizza', stages: [pizzaTopStage('corn')], finish: { base: 'pizzaPlate' } },
  // --- クック編 C6：前菜4品・フォッカチオ5品（4.0 の「前菜」「焼きたてパン」の表。末尾に足した）---
  // ポップコーンシュリンプ：焼成パッドにシュリンプ9つ → U → 小皿に移す（仮）
  { id: 'popcornShrimp', vessel: 'bakingPad', stages: [{ load: [{ id: 'shrimp', count: 9, at: 'all' }], need: 1 }], finish: { base: 'smallPlate' } },
  // ポテトのグリル：ドリア皿に下調理したポテト8個（横4 × 縦2）→ U（仮：上段1周）→ 下駄に乗せる（仮）
  { id: 'potatoGrill', vessel: 'doria', stages: [{ load: [{ id: 'potato', count: 8, at: 'all' }], need: 1 }], finish: { base: 'geta' } },
  // チョリソー：ドリア皿（仮）にソーセージ5本（縦向きで横に並べる）、その横にポテト2個 → U → 下駄に乗せる（仮）
  {
    id: 'chorizo',
    vessel: 'doria',
    stages: [{ load: [{ id: 'sausage', count: 5, at: 'left' }, { id: 'potato', count: 2, at: 'right' }], need: 1 }],
    finish: { base: 'geta' },
  },
  // 辛味チキン：グラタン皿（ドリア皿と同じ器）に、茶色の脂取りシート → 辛味チキン4つ（シートの上にだけ入る）→ L → 下駄に乗せる（仮）
  {
    id: 'spicyChicken',
    vessel: 'doria',
    stages: [{ load: [{ id: 'oilSheet', count: 1, at: 'all' }, { id: 'spicyChicken', count: 4, at: 'all', on: 'oilSheet' }], need: 2 }],
    finish: { base: 'geta' },
  },
  // フォッカチオ3品：焼成パッドに入れる → U → 小皿に移す（仮）→ 仕上げ（なし・シナモンパウダー・ガーリックソース）
  { id: 'focaccia', vessel: 'bakingPad', stages: [{ load: [{ id: 'focaccia', count: 1, at: 'center' }], need: 1 }], finish: { base: 'smallPlate' } },
  { id: 'cinnamonFocaccia', vessel: 'bakingPad', stages: [{ load: [{ id: 'focaccia', count: 1, at: 'center' }], need: 1 }], finish: { base: 'smallPlate', extras: ['cinnamon'] } },
  { id: 'garlicFocaccia', vessel: 'bakingPad', stages: [{ load: [{ id: 'focaccia', count: 1, at: 'center' }], need: 1 }], finish: { base: 'smallPlate', extras: ['garlicSauce'] } },
  // たらこのフォッカチオ：逆さまに入れる → 平らな面にたらこソース → グランモラビア → U → 小皿に移す（仮）
  {
    id: 'tarakoFocaccia',
    vessel: 'bakingPad',
    stages: [
      {
        load: [
          { id: 'focacciaFlipped', count: 1, at: 'center' },
          { id: 'tarakoSauce', count: 1, at: 'center', on: 'focacciaFlipped' },
          { id: 'granMoravia', count: 1, at: 'center', on: 'tarakoSauce' },
        ],
        need: 1,
      },
    ],
    finish: { base: 'smallPlate' },
  },
  // チーズフォッカチオ：逆さまに入れる → 平らな面にピザチーズ1/2杯 → グランモラビア → U → 小皿に移す（仮）
  {
    id: 'cheeseFocaccia',
    vessel: 'bakingPad',
    stages: [
      {
        load: [
          { id: 'focacciaFlipped', count: 1, at: 'center' },
          { id: 'halfCheese', count: 1, at: 'center', on: 'focacciaFlipped' },
          { id: 'granMoravia', count: 1, at: 'center', on: 'halfCheese' },
        ],
        need: 1,
      },
    ],
    finish: { base: 'smallPlate' },
  },
  // --- クック編 C7：鉄板焼き6品（4.0 の「肉料理」の表。器はハンバーグの鉄板、受け台は木の板。末尾に足した）---
  // ハンバーグ3品：鉄板にパティ → U → ヘラではがす → コーン1杯・ポテト1個（仮）→ U → 板 → 仕上げ。1回目と途中は同じで、品は2回目の前（チーズソースの容器）と仕上げで決まる
  { id: 'hamburg', vessel: 'hamburgPan', stages: hamburgStages(), finish: { base: 'board', extras: ['demiglace', 'friedEgg'], at: { demiglace: 'all', friedEgg: 'upperRight' } } },
  { id: 'italianHamburg', vessel: 'hamburgPan', stages: hamburgStages([CHEESE_CUP]), finish: { base: 'board', extras: ['cheeseSauce'], at: { cheeseSauce: 'center' } } },
  // ディアボラ風ハンバーグ：仕上げは野菜ペースト → 目玉焼き（仮：のせる）
  { id: 'diavolaHamburg', vessel: 'hamburgPan', stages: hamburgStages(), finish: { base: 'board', extras: ['vegetablePaste', 'friedEgg'], at: { vegetablePaste: 'center', friedEgg: 'upperRight' } } },
  // ミックスグリル：パティ（下中央）・辛味チキン2つ（左）・シュリンプ5つ（右）・ポテト2個（左上）・コーン1杯（右上）→ L（1回だけ）→ 板 → デミグラスソースをハンバーグに
  {
    id: 'mixedGrill',
    vessel: 'hamburgPan',
    stages: [
      {
        load: [
          { id: 'patty', count: 1, at: 'lowerCenter' },
          { id: 'spicyChicken', count: 2, at: 'left' },
          { id: 'shrimp', count: 5, at: 'right' },
          { id: 'potato', count: 2, at: 'upperLeft' },
          { id: 'corn', count: 1, at: 'upperRight' },
        ],
        need: 2,
      },
    ],
    finish: { base: 'board', extras: ['demiglace'], at: { demiglace: 'lowerCenter' } },
  },
  // チキン2品：鉄板にチキン → L → ヘラではがす → コーン1杯・ポテト1個（仮）→ U → 板 → 仕上げ（若鶏 = 野菜ペースト（仮）、チーズ焼き = 容器のチーズソース）
  { id: 'chickenDiavola', vessel: 'hamburgPan', stages: chickenStages(), finish: { base: 'board', extras: ['vegetablePaste'], at: { vegetablePaste: 'center' } } },
  { id: 'chickenCheese', vessel: 'hamburgPan', stages: chickenStages([CHEESE_CUP]), finish: { base: 'board', extras: ['cheeseSauce'], at: { cheeseSauce: 'center' } } },
  // --- クック編 C8：スープ2品（4.0 の「スープ」の表。末尾に足した）---
  // 鉄のスープ皿に、湯煎器で温めたパックの中身を入れる（温まっていないパックは入らない。pack.ts の PACKS）→ U → 板（仮）
  { id: 'zuppa', vessel: 'soupBowl', stages: [{ load: [{ id: 'zuppa', count: 1, at: 'all' }], need: 1 }], finish: { base: 'board' } },
  { id: 'minestrone', vessel: 'soupBowl', stages: [{ load: [{ id: 'minestrone', count: 1, at: 'all' }], need: 1 }], finish: { base: 'board' } },
];

// 付け合わせの表（クック編 C7。伝票には出ない。焼いた器に残したまま、ほかの品の仕上げに使う）。流す・焼け具合・器に入る数は、品の表と同じ決まりで調べる（flowRows）
// 目玉焼き：目玉焼き鉄板（くぼみ2つ）に卵2個 → U。焼けた目玉焼きは鉄板に残り、ヘラで1つずつすくう（SCOOP_LOADS）
export const SIDE_TABLE: readonly BakeDish[] = [
  { id: 'friedEgg', name: '目玉焼き', vessel: 'eggPan', stages: [{ load: [{ id: 'egg', count: 2, at: 'all' }], need: 1 }], finish: { base: 'scoop' } },
];

// 下調理の表（クック編設計書 4.0「下調理」・4.5 / C5）。伝票には出ないので、品の表（BAKE_TABLE）には入れない。
// 流す・焼け具合・器に入る数は、品の表と同じ決まりで調べる（flowRows）。焼き上がりは、受け台の代わりにストック容器（prepStock）に空ける
// ポテト：冷凍の袋の1/4 を大きめの焼成パッドに入れて → L（下段1周）→ ストック容器へ（パッド1つで potatoPerLargePad 個）
export const PREP_TABLE: readonly BakeDish[] = [
  {
    id: 'potatoPrep',
    name: 'ポテトの下調理',
    vessel: 'largePad',
    stages: [{ load: [{ id: 'frozenPotato', count: 1, at: 'all' }], need: 2 }],
    finish: { base: 'prepStock' },
    prep: { stock: 'potato', per: 'potatoPerLargePad' },
  },
];

// 伝票に出ない行（下調理・付け合わせ）
const EXTRA_ROWS: readonly BakeDish[] = [...PREP_TABLE, ...SIDE_TABLE];
// 流す・焼け具合・器に入る数を調べるときの表（品の表に、下調理・付け合わせの表を足す）
const flowRows = (table: readonly BakeDish[]): readonly BakeDish[] => (EXTRA_ROWS.every((p) => table.includes(p)) ? table : [...table, ...EXTRA_ROWS.filter((p) => !table.includes(p))]);

// --- 名前（案内用）---

// how = 下敷き（LoadSpec の on）にする物の、のせ方の案内（「辛味チキンは、脂取りシートの上にのせる（先に脂取りシートを1枚敷く）」）
export const BAKE_LOAD_NAME: Record<BakeLoadId, { name: string; unit: string; how?: string }> = {
  dough: { name: 'ピザ生地', unit: '枚' },
  pizzaSauce: { name: 'ピザソース', unit: '杯' },
  pizzaCheese: { name: 'ピザチーズ', unit: '杯' },
  mozzarella: { name: 'モッツァレラ', unit: 'つ' },
  patty: { name: 'パティ', unit: '枚' },
  chicken: { name: 'チキン', unit: '枚' },
  shrimp: { name: 'シュリンプ', unit: 'つ' },
  potato: { name: 'ポテト', unit: '個' },
  frozenPotato: { name: '冷凍ポテト（袋の1/4）', unit: '回分' },
  spicyChicken: { name: '辛味チキン', unit: 'つ' },
  corn: { name: 'コーン', unit: '杯' },
  sausage: { name: 'ソーセージ', unit: '本' },
  vegMushroom: { name: '野菜ときのこ', unit: '杯' },
  slicedSausage: { name: 'ソーセージ（輪切り）', unit: '杯' },
  focaccia: { name: 'フォッカチオ', unit: 'つ' },
  focacciaFlipped: { name: '逆さまのフォッカチオ', unit: 'つ', how: 'フォッカチオを持って、作業枠のパッドを右クリックすると逆さまに入る' },
  oilSheet: { name: '脂取りシート', unit: '枚', how: '先に脂取りシートを1枚敷く' },
  tarakoSauce: { name: 'たらこソース', unit: '杯', how: '先にたらこソースをのせる' },
  halfCheese: { name: 'ピザチーズ（1/2杯）', unit: '回分', how: '先にピザチーズを1/2杯のせる。ピザチーズの容器を右クリックで半分取る' },
  granMoravia: { name: 'グランモラビア', unit: '回' },
  egg: { name: '卵', unit: '個' },
  cheeseCup: { name: 'チーズソースの容器', unit: 'つ', how: '小さい容器にピザソース・ピザチーズを入れて、鉄板の空きにのせる' },
  zuppa: { name: 'たまねぎのズッパ', unit: 'パック' },
  minestrone: { name: 'ミネストローネ', unit: 'パック' },
};

// name = 案内の「→ ヘラではがす」、before = 「ヘラではがしてから流す」
export const BAKE_CARE_NAME: Record<BakeCare, { name: string; before: string }> = {
  scrape: { name: 'ヘラではがす', before: 'ヘラではがしてから' },
};

export const BAKE_FINISH_NAME: Record<BakeFinishId, string> = {
  demiglace: 'デミグラスソース',
  cheeseSauce: 'チーズソース',
  vegetablePaste: '野菜ペースト',
  parsley: 'パセリ',
  cinnamon: 'シナモンパウダー',
  garlicSauce: 'ガーリックソース',
  friedEgg: '目玉焼き',
};

// 受け台。hint = 受け台に乗せる前に提供台に出そうとしたときの案内。
// moveFrom = 中身を移す受け台（ピザのお皿）のとき、移す前の器（手に持つ物は受け台の側になる）
export const BAKE_BASES: Record<BakeBase, { name: string; hint: string; moveFrom?: BakeStyle }> = {
  geta: { name: '下駄', hint: '下駄に乗せてから出す（提供台の左の下駄の山をクリック）' },
  pizzaPlate: { name: 'ピザのお皿', hint: 'お皿に入れてから出す（提供台の左のピザのお皿を台に置いて、ピザを入れる）', moveFrom: 'pizza' },
  board: { name: '板', hint: '板に乗せてから出す（提供台の左の板の山をクリック）' },
  prepStock: { name: 'ストック容器', hint: '下調理は提供しない（1台目の具材台のストック容器に空ける）' },
  smallPlate: { name: '小皿', hint: '小皿に移してから出す（提供台の左の小皿の山から小皿を取って作業枠に置き、焼き上がった器から移す）' },
  scoop: { name: 'ヘラ', hint: '付け合わせは提供しない（ヘラで1つずつすくって、仕上げ中の料理にのせる）' },
};

// 器ごとの決まり。pizzaBuild = 中身を既存の PizzaBuild（生地・ソース・チーズ・モッツァレラ）でも数える器
// （pizza を持たない皿は、生地・ソース・チーズがのった見た目 = 既存の決まり）。
// sizzle = 焼けて出口から取ったあと、油のはねる器（鉄板。見た目だけ。秒数は config の sizzleSeconds。クック編 C7）
export const BAKE_VESSELS: Record<BakeStyle, { pizzaBuild: boolean; sizzle?: boolean }> = {
  doria: { pizzaBuild: false },
  pizza: { pizzaBuild: true },
  bakingPad: { pizzaBuild: false },
  largePad: { pizzaBuild: false },
  hamburgPan: { pizzaBuild: false, sizzle: true },
  eggPan: { pizzaBuild: false, sizzle: true },
  soupBowl: { pizzaBuild: false },
};

// 品の名前（メニューにない id はそのまま。テスト用の表など）
export const dishName = (id: string): string =>
  MENU.find((m) => m.id === id)?.name ?? EXTRA_ROWS.find((d) => d.id === id)?.name ?? id;

export function getBakeDish(id: string, table: readonly BakeDish[] = BAKE_TABLE): BakeDish | null {
  return table.find((d) => d.id === id) ?? null;
}

// --- 中身の計算 ---

const LOAD_IDS = Object.keys(BAKE_LOAD_NAME) as BakeLoadId[];
const countOf = (load: BakeLoad, id: BakeLoadId): number => load[id] ?? 0;

function addSpecs(load: BakeLoad, specs: readonly LoadSpec[]): BakeLoad {
  const out: BakeLoad = { ...load };
  for (const s of specs) out[s.id] = countOf(out, s.id) + s.count;
  return out;
}

// 中身の範囲（その段階を流せる最低限 min と、そろった中身 max）
export type LoadRange = { min: BakeLoad; max: BakeLoad };

// 品の i 番目の段階を流す前の中身の範囲（前の段階までの物を含む）
export function stageRange(dish: BakeDish, i: number): LoadRange {
  let before: BakeLoad = {};
  for (let k = 0; k < i; k++) before = addSpecs(before, dish.stages[k].load);
  const stage = dish.stages[i];
  return { min: addSpecs(before, stage.minLoad ?? stage.load), max: addSpecs(before, stage.load) };
}

// 品のそろった中身（最後の段階まで）
export const fullLoad = (dish: BakeDish): BakeLoad => stageRange(dish, dish.stages.length - 1).max;

const fits = (load: BakeLoad, r: LoadRange): boolean =>
  LOAD_IDS.every((id) => countOf(load, id) >= countOf(r.min, id) && countOf(load, id) <= countOf(r.max, id));
const within = (load: BakeLoad, max: BakeLoad): boolean => LOAD_IDS.every((id) => countOf(load, id) <= countOf(max, id));
const sameLoad = (a: BakeLoad, b: BakeLoad): boolean => LOAD_IDS.every((id) => countOf(a, id) === countOf(b, id));
const rangesOverlap = (a: LoadRange, b: LoadRange): boolean =>
  LOAD_IDS.every((id) => Math.max(countOf(a.min, id), countOf(b.min, id)) <= Math.min(countOf(a.max, id), countOf(b.max, id)));

// 足りない物（min に対して）
function missingOf(load: BakeLoad, min: BakeLoad): [BakeLoadId, number][] {
  return LOAD_IDS.map((id): [BakeLoadId, number] => [id, countOf(min, id) - countOf(load, id)]).filter(([, n]) => n > 0);
}
const loadText = (list: [BakeLoadId, number][]): string =>
  list.map(([id, n]) => (n > 1 ? `${BAKE_LOAD_NAME[id].name}あと${n}${BAKE_LOAD_NAME[id].unit}` : BAKE_LOAD_NAME[id].name)).join('・');

// 品の i 番目の段階までに必要な手入れ
function caresUpTo(dish: BakeDish, i: number): BakeCare[] {
  return dish.stages.slice(0, i + 1).flatMap((s) => s.care ?? []);
}
const hasAll = <T>(done: readonly T[], need: readonly T[]): boolean => need.every((c) => done.includes(c));
function sameMulti<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  const rest = [...b];
  return a.every((x) => {
    const i = rest.indexOf(x);
    if (i < 0) return false;
    rest.splice(i, 1);
    return true;
  });
}

// 既存のピザの中身（生地・ソース・チーズ・モッツァレラ）を、のせた物と数にする
export function pizzaLoad(p: PizzaBuild): BakeLoad {
  const out: BakeLoad = {};
  if (p.dough) out.dough = 1;
  if (p.sauce) out.pizzaSauce = 1;
  if (p.cheese) out.pizzaCheese = 1;
  if (p.mozz > 0) out.mozzarella = p.mozz;
  if (p.top) out[PIZZA_TOPS[p.top].load] = 1;
  return out;
}

// ピザの名前（表の品のそろった中身と同じなら、その品名。そうでなければ、のっている物で決まる名前 = pizza.ts の pizzaName）
export function pizzaTitle(p: PizzaBuild, table: readonly BakeDish[] = BAKE_TABLE): string {
  const load = pizzaLoad(p);
  const d = table.find((x) => BAKE_VESSELS[x.vessel].pizzaBuild && sameLoad(load, fullLoad(x)));
  return d ? dishName(d.id) : pizzaName(p);
}

// --- 焼き皿の見方 ---

// 焼き皿（手に持つ皿・ベルトの上の皿・お皿に移した中身）を、表と比べられる形にしたもの
// blank = 器の山から取った空の器（焼く前の中身が入った山の品 stock には当てはまらない）
// stock = どの品の山から取った皿か（省略 = その器の、表の最初の山の品）
export type BakeView = { vessel: BakeStyle; loaded: BakeLoad; stage: number; cares: readonly BakeCare[]; finishes: readonly BakeFinishId[]; blank?: boolean; stock?: string };
type ProgressLike = { style: BakeStyle; pizza?: PizzaBuild } & BakeProgress;

export function viewOf(x: ProgressLike): BakeView {
  const pizza = x.pizza ?? (BAKE_VESSELS[x.style].pizzaBuild ? sauceCheesePizza() : null);
  let loaded: BakeLoad = pizza ? pizzaLoad(pizza) : {};
  if (x.loaded) for (const id of LOAD_IDS) if (countOf(x.loaded, id) > 0) loaded = { ...loaded, [id]: countOf(loaded, id) + countOf(x.loaded, id) };
  return {
    vessel: x.style,
    loaded,
    stage: x.stage ?? 0,
    cares: x.cares ?? [],
    finishes: x.finishes ?? [],
    ...(x.blank ? { blank: true } : {}),
    ...(x.stock ? { stock: x.stock } : {}),
  };
}

// 進み具合のうち、何かあるものだけ（何もない項目は持たせない。既存の2品の皿は、いままでと同じ形になる）
export function progressOf(x: BakeProgress): BakeProgress {
  const out: BakeProgress = {};
  if (x.loaded && LOAD_IDS.some((id) => countOf(x.loaded!, id) > 0)) out.loaded = { ...x.loaded };
  if (x.stage) out.stage = x.stage;
  if (x.cares?.length) out.cares = [...x.cares];
  if (x.finishes?.length) out.finishes = [...x.finishes];
  if (x.blank) out.blank = true;
  if (x.stock) out.stock = x.stock;
  return out;
}

// 見た目の違い（段階・中身・手入れ・仕上げ）を区別する文字列（描き直しが要るか調べるため）
export function progressSignature(x: BakeProgress): string {
  const loaded = LOAD_IDS.filter((id) => countOf(x.loaded ?? {}, id) > 0).map((id) => `${id}${countOf(x.loaded!, id)}`);
  return `${x.stage ?? 0}|${loaded.join(',')}|${(x.cares ?? []).join(',')}|${[...(x.finishes ?? [])].sort().join(',')}${x.blank ? '|blank' : ''}${x.stock ? `|stock:${x.stock}` : ''}`;
}

// --- 中身の入った山（ドリア4品）---

// その器の、表の最初の山の品（山の指定を省略した皿は、この品。既存のドリアの山 = ミラノドリア）。山の品がない器は null
export function defaultStock(vessel: BakeStyle, table: readonly BakeDish[] = BAKE_TABLE): string | null {
  return table.find((d) => d.vessel === vessel && d.stock)?.id ?? null;
}

// 皿がどの品の山から取った物か（省略 = その器の最初の山の品）
const stockOf = (view: BakeView, table: readonly BakeDish[]): string | null => view.stock ?? defaultStock(view.vessel, table);

// 山（dish = どの品の山か。省略 = 最初の山）から取った皿の進み具合。最初の山の品は、何も持たせない（既存のミラノドリアの皿と同じ形）
export function stockProgress(vessel: BakeStyle, dish: string | undefined, table: readonly BakeDish[] = BAKE_TABLE): BakeProgress {
  return dish && dish !== defaultStock(vessel, table) ? { stock: dish } : {};
}

// 空の器・別の山の皿は、その山の品には当てはまらない。
// 逆に、中身の入った山から取った皿（空の器の印がなく、その器に山の品がある）は、空の器から作る品（stock でない品）には当てはまらない
// （ミラノドリアの皿にポテトを入れても、ポテトのグリルにはならない。クック編 C6）
const stockMismatch = (dish: BakeDish, view: BakeView, table: readonly BakeDish[]): boolean =>
  dish.stock === true
    ? view.blank === true || stockOf(view, table) !== dish.id
    : view.blank !== true && defaultStock(view.vessel, table) !== null;

// その品の i 番目の段階に、この皿が当てはまるか（器・中身・手入れ）。空の器の山から取った器は、中身の入った山から取る品（stock）には当てはまらない
export function matchesAt(dish: BakeDish, view: BakeView, i: number, table: readonly BakeDish[] = BAKE_TABLE): boolean {
  if (stockMismatch(dish, view, table)) return false;
  return dish.vessel === view.vessel && i < dish.stages.length && fits(view.loaded, stageRange(dish, i)) && hasAll(view.cares, caresUpTo(dish, i));
}

// i 番目の段階に当てはまる品（複数あれば、必要な時間は同じ。tableProblems で縛っている）
// 下調理の表（PREP_TABLE）の行も含む
export function candidatesAt(view: BakeView, i: number, table: readonly BakeDish[] = BAKE_TABLE): BakeDish[] {
  return flowRows(table).filter((d) => matchesAt(d, view, i, table));
}

export const needSeconds = (stage: BakeStage, cfg: OvenTimes): number => stage.need * cfg.ovenUpperTime;

// いまの段階の必要な秒数（当てはまる品がなければ null）
export function currentNeed(view: BakeView, cfg: OvenTimes, table: readonly BakeDish[] = BAKE_TABLE): number | null {
  const dish = candidatesAt(view, view.stage, table)[0];
  return dish ? needSeconds(dish.stages[view.stage], cfg) : null;
}

// いまの段階で焼いた秒数（cooked）からわかる焼け具合。当てはまる品がない皿（ふつうは流せない）は、焼いていれば生焼けとする
export function stateFor(view: BakeView, cooked: number, cfg: OvenTimes, table: readonly BakeDish[] = BAKE_TABLE): BakeState {
  if (cooked <= EPS) return 'raw';
  const need = currentNeed(view, cfg, table);
  if (need === null || cooked < need - EPS) return 'half';
  return cooked <= need * BURN_RATIO + EPS ? 'baked' : 'burnt';
}

// 品の一覧の名前（同じ中身で当てはまる品が複数あるときは並べる）。2段階以上の品は「n回目」を付ける
export function dishTitle(dishes: readonly BakeDish[], stage: number): string {
  if (dishes.length === 0) return '';
  const names = dishes.length <= 2 ? dishes.map((d) => dishName(d.id)).join('・') : `${dishName(dishes[0].id)}など${dishes.length}品`;
  return dishes[0].stages.length > 1 ? `${names} ${stage + 1}回目` : names;
}

// 次の段階の前にすること（「ヘラではがす」「コーン・ポテトをのせる」）
function nextStepText(dish: BakeDish, stage: number): string {
  const next = dish.stages[stage + 1];
  if (!next) return '';
  const parts = (next.care ?? []).map((c) => BAKE_CARE_NAME[c].name);
  const loads = next.load.map((s): [BakeLoadId, number] => [s.id, s.count]);
  if (loads.length) parts.push(`${loadText(loads)}をのせる`);
  parts.push('流す');
  return parts.join(' → ');
}

// --- 流す ---

export type FlowPlan = { ok: true; stage: number; cooked: number; dishes: BakeDish[] } | { ok: false; reason: string };
type BakeDishLike = ProgressLike & { cooked: number; state: BakeState };

// 入口に流すとしたら、どの段階を、いくつの秒数から焼くか。流せないときは、その理由。
// 焼く前・生焼け = いまの段階の続き（秒数は合計）。焼き上がり = 次の段階があれば、秒数を 0 に戻して次の段階へ。焦げ = 流せない
export function flowPlan(item: BakeDishLike, table: readonly BakeDish[] = BAKE_TABLE): FlowPlan {
  if (item.state === 'burnt') return { ok: false, reason: '焦げている（入口には流せない。右クリックで捨てる）' };
  const view = viewOf(item);
  const next = item.state === 'baked';
  const stage = view.stage + (next ? 1 : 0);
  const dishes = candidatesAt(view, stage, table);
  if (dishes.length > 0) return { ok: true, stage, cooked: next ? 0 : item.cooked, dishes };

  // 流せない理由。この皿が向かっている品（中身が、その段階のそろった中身を超えていない品）のうち、最初のものに足りない物・手入れを出す
  const toward = flowRows(table).filter(
    (d) =>
      d.vessel === view.vessel &&
      !stockMismatch(d, view, table) &&
      stage < d.stages.length &&
      within(view.loaded, stageRange(d, stage).max) &&
      (!next || matchesAt(d, { ...view, loaded: clampLoad(view.loaded, stageRange(d, view.stage).max) }, view.stage, table)),
  );
  if (toward.length === 0) return { ok: false, reason: next ? 'もう焼けている（入口には流せない）' : 'この中身の料理はない（流せない）' };
  const d = toward[0];
  const cares = caresUpTo(d, stage).filter((c) => !view.cares.includes(c));
  if (cares.length) return { ok: false, reason: `${cares.map((c) => BAKE_CARE_NAME[c].before).join('、')}流す` };
  const missing = missingOf(view.loaded, stageRange(d, stage).min);
  return { ok: false, reason: `${loadText(missing)}をのせてから流す` };
}

// 中身のうち、max に入る分だけ（次の段階の物を足し始めた皿が、前の段階の品だったかを調べるため）
function clampLoad(load: BakeLoad, max: BakeLoad): BakeLoad {
  const out: BakeLoad = {};
  for (const id of LOAD_IDS) if (countOf(load, id) > 0) out[id] = Math.min(countOf(load, id), countOf(max, id));
  return out;
}

// --- 入れすぎの防止 ---

// 器に入る数の上限（その器を使う、どの品（下調理も含む）のそろった中身よりも多くは入らない）
export function vesselCapacity(vessel: BakeStyle, id: BakeLoadId, table: readonly BakeDish[] = BAKE_TABLE): number {
  return Math.max(0, ...flowRows(table).filter((d) => d.vessel === vessel).map((d) => countOf(fullLoad(d), id)));
}

// この皿に、もう1つのせられるか
export function canLoad(view: BakeView, id: BakeLoadId, table: readonly BakeDish[] = BAKE_TABLE): boolean {
  return countOf(view.loaded, id) < vesselCapacity(view.vessel, id, table);
}

// --- のせる順と組み合わせ（クック編 C6）---

// 品の、その物ののせ方（表の LoadSpec。なければ undefined）
const specOf = (dish: BakeDish, id: BakeLoadId): LoadSpec | undefined => dish.stages.flatMap((st) => st.load).find((x) => x.id === id);

// その品で、この物の下敷き（on）が、もうそろってのっているか（下敷きのない物は、いつでもよい）
function underlayReady(dish: BakeDish, loaded: BakeLoad, id: BakeLoadId): boolean {
  const on = specOf(dish, id)?.on;
  return !on || countOf(loaded, on) >= countOf(fullLoad(dish), on);
}

// 次にのせる段階（クック編 C7）：焼き上がった器は次の段階、それ以外（焼く前・生焼け）は、いまの段階。state を省略 = いまの段階（焼く前の器）
const loadStageOf = (view: BakeView, state?: BakeState): number => view.stage + (state === 'baked' ? 1 : 0);

// この皿に足せる品の候補と、次にのせる段階のそろった中身（max）・その段階までの手入れが済んでいるか（caresOk）。
// 器が同じで、山の決まりに合い、いまの中身がその段階のそろった中身を超えていない品（下調理・付け合わせも含む）。
// 焼き上がった器は、いまの段階でその品だった（流したときの中身が、その品のいまの段階に当てはまる）品の、次の段階に向けて足す
// （1回目が焼けたハンバーグの鉄板に、ミックスグリルの具は足せない。最後の段階まで焼けた器には、もう足せない）
type Room = { dish: BakeDish; stage: number; max: BakeLoad; caresOk: boolean };
function roomRows(view: BakeView, table: readonly BakeDish[], state?: BakeState): Room[] {
  const next = state === 'baked';
  const i = loadStageOf(view, state);
  return flowRows(table)
    .filter(
      (d) =>
        d.vessel === view.vessel &&
        !stockMismatch(d, view, table) &&
        i < d.stages.length &&
        within(view.loaded, stageRange(d, i).max) &&
        (!next || matchesAt(d, { ...view, loaded: clampLoad(view.loaded, stageRange(d, view.stage).max) }, view.stage, table)),
    )
    .map((d) => ({ dish: d, stage: i, max: stageRange(d, i).max, caresOk: hasAll(view.cares, caresUpTo(d, i)) }));
}

// この皿に、この物をあといくつのせられるか。足したあとも、どれかの品の（次に流す段階の）そろった中身を超えず、その品の下敷きがそろっている品について、残りの数の最大。
// 1種類ずつの上限は vesselCapacity と同じ（器には、その器を使うどの品よりも多くは入らない）。そのうえで、
// 別の品の物を混ぜられない（シュリンプを入れたパッドにフォッカチオは入らない）・下敷きの上にだけのせる（シートを敷く前に辛味チキンは入らない）・
// 次の段階の手入れが済んでから（はがす前の鉄板に、付け合わせはのせられない。クック編 C7）。
// state = 皿の焼け具合（省略 = 焼く前と同じ扱い。焼き上がった器は、次の段階に向けて数える）
export function loadRoom(view: BakeView, id: BakeLoadId, table: readonly BakeDish[] = BAKE_TABLE, state?: BakeState): number {
  let best = 0;
  for (const r of roomRows(view, table, state)) {
    if (!r.caresOk || !underlayReady(r.dish, view.loaded, id)) continue;
    best = Math.max(best, countOf(r.max, id) - countOf(view.loaded, id));
  }
  return best;
}

// 器の中の物の置き場所（見た目用。表の LoadSpec の at）。いまの段階に当てはまる品、なければ中身が向かっている品の、表の位置。
// 同じ物でも品によって位置が違う（ポテトは、ポテトのグリルでは全体、チョリソーでは右側、ハンバーグでは左）
export function loadLayout(x: ProgressLike & { state?: BakeState }, table: readonly BakeDish[] = BAKE_TABLE): Partial<Record<BakeLoadId, LoadSpot>> {
  const view = viewOf(x);
  const row = candidatesAt(view, view.stage, table)[0] ?? roomRows(view, table, x.state)[0]?.dish ?? roomRows(view, table)[0]?.dish;
  const out: Partial<Record<BakeLoadId, LoadSpot>> = {};
  for (const spec of row?.stages.flatMap((st) => st.load) ?? []) if (spec.at && out[spec.id] === undefined) out[spec.id] = spec.at;
  return out;
}

// 仕上げの位置の決まり（表の finish.at に書いていない仕上げ）。ソースは全体・中央、目玉焼きは右上
export const FINISH_SPOT: Record<BakeFinishId, LoadSpot> = {
  demiglace: 'all',
  cheeseSauce: 'center',
  vegetablePaste: 'center',
  parsley: 'all',
  cinnamon: 'all',
  garlicSauce: 'all',
  friedEgg: 'upperRight',
};

// 仕上げの置き場所（見た目用）。いまの段階に当てはまる品のうち、済ませた仕上げをいちばん多く使う品の、表の位置（finish.at）
export function finishLayout(x: ProgressLike, table: readonly BakeDish[] = BAKE_TABLE): Record<BakeFinishId, LoadSpot> {
  const view = viewOf(x);
  const used = (d: BakeDish) => view.finishes.filter((f) => (d.finish.extras ?? []).includes(f)).length;
  const row = candidatesAt(view, view.stage, table).reduce<BakeDish | null>((best, d) => (!best || used(d) > used(best) ? d : best), null);
  return { ...FINISH_SPOT, ...(row?.finish.at ?? {}) };
}

// この物をのせられない理由（のせられるなら null）。state は loadRoom と同じ
export function whyNotLoad(view: BakeView, id: BakeLoadId, table: readonly BakeDish[] = BAKE_TABLE, state?: BakeState): string | null {
  if (loadRoom(view, id, table, state) > 0) return null;
  const name = BAKE_LOAD_NAME[id];
  const uses = flowRows(table).filter((d) => d.vessel === view.vessel && !stockMismatch(d, view, table) && countOf(fullLoad(d), id) > 0);
  if (uses.length === 0) return `${name.name}は、この器には入れない`;
  const rooms = roomRows(view, table, state).filter((r) => countOf(r.max, id) > countOf(view.loaded, id));
  // 次の段階の手入れ（ヘラではがす）が済んでいない（クック編 C7）
  const care = rooms.find((r) => !r.caresOk);
  if (care) {
    const left = caresUpTo(care.dish, care.stage).filter((c) => !view.cares.includes(c));
    return `${left.map((c) => BAKE_CARE_NAME[c].before).join('、')}${name.name}をのせる`;
  }
  if (state === 'baked' && roomRows(view, table, state).length === 0) return `焼き上がっている（${name.name}は、もうのせられない）`;
  const onText = (on: BakeLoadId) => `${name.name}は、${BAKE_LOAD_NAME[on].name}の上にのせる${BAKE_LOAD_NAME[on].how ? `（${BAKE_LOAD_NAME[on].how}）` : ''}`;
  const fit = roomRows(view, table, state)
    .map((r) => r.dish)
    .filter((d) => uses.includes(d));
  const waiting = fit.find((d) => !underlayReady(d, view.loaded, id));
  if (waiting) return onText(specOf(waiting, id)!.on!);
  if (fit.length === 0) {
    // いまの中身が、この物を使うどの品にも合わない（ふつうの向きのフォッカチオに、たらこソース など）
    const on = uses.map((d) => specOf(d, id)?.on).find((x): x is BakeLoadId => x !== undefined);
    return on ? onText(on) : `${name.name}は、いまの中身には足せない（別の料理の物が入っている）`;
  }
  const i = loadStageOf(view, state);
  const cap = Math.max(...fit.map((d) => countOf(stageRange(d, i).max, id)));
  return `もう入らない（${name.name}は${cap}${name.unit}まで）`;
}

// --- チーズソースの小さい容器（クック編 C7）---

// 器にのせて一緒に焼き、焼けたあと板の上でかける物と、かけたときの仕上げ（チーズソースの容器 → チーズソース）。
// 容器は中身（loaded）に残し（焼いたときの中身の記録。提供の判定は表のそろった中身と比べる）、かけた回数は仕上げ（finishes）で数える。かけたあとは容器を描かない
export const CUP_FINISHES: Partial<Record<BakeLoadId, BakeFinishId>> = { cheeseCup: 'cheeseSauce' };

// のせた容器のうち、まだかけていない数
export function unpouredCups(x: BakeProgress, id: BakeLoadId): number {
  const finish = CUP_FINISHES[id];
  if (!finish) return 0;
  return Math.max(0, countOf(x.loaded ?? {}, id) - (x.finishes ?? []).filter((f) => f === finish).length);
}

// 板に乗せた焼き上がりの器で、のせて焼いた容器のソースをかけられるなら、その容器と仕上げ（なければ null）
export function cupPourOf(
  item: Item | null,
  cfg: Pick<GameConfig, 'maxBakeFinishes'>,
  table: readonly BakeDish[] = BAKE_TABLE,
): { load: BakeLoadId; finish: BakeFinishId } | null {
  if (item?.kind !== 'bakeDish') return null;
  for (const id of LOAD_IDS) {
    const finish = CUP_FINISHES[id];
    if (finish && unpouredCups(item, id) > 0 && canFinishWith(item, finish, cfg, table)) return { load: id, finish };
  }
  return null;
}

// --- 案内（出口の皿・入口のヒント）---

// 焼き皿のラベル：品名・段階・焼け具合（と、焼き上がりで次の段階があれば、次にすること）。
// 例：「ミラノドリア 焼き上がり」「ハンバーグ 1回目 焼き上がり → ヘラではがす → コーン・ポテトをのせる → 流す」
export function bakeLabel(item: BakeDishLike, table: readonly BakeDish[] = BAKE_TABLE): string {
  const view = viewOf(item);
  const dishes = candidatesAt(view, view.stage, table);
  const state = BAKE_STATE_NAME[item.state];
  if (dishes.length === 0) return state;
  const text = `${dishTitle(dishes, view.stage)} ${state}`;
  const next = item.state === 'baked' ? nextStepText(dishes[0], view.stage) : '';
  return next ? `${text} → ${next}` : text;
}

// --- 提供 ---

// 焼き皿が乗せてある受け台（下駄・板。なければ null）
export function baseOf(item: Pick<Extract<Item, { kind: 'bakeDish' }>, 'geta' | 'board'>): BakeBase | null {
  return item.geta ? 'geta' : item.board ? 'board' : null;
}

// 提供台に出そうとしている物を、表と比べられる形にしたもの（base = 乗せてある受け台。なければ null）
type Served = { view: BakeView; state: BakeState; base: BakeBase | null };

function servedOf(item: Item | null): Served | null {
  if (!item) return null;
  if (item.kind === 'bakeDish') return { view: viewOf(item), state: item.state, base: baseOf(item) };
  if (item.kind === 'bakePlate') return { view: viewOf({ ...item, style: item.from }), state: item.state, base: 'smallPlate' };
  if (item.kind === 'pizzaPlate' && item.dish && BAKE_BASES.pizzaPlate.moveFrom) {
    return { view: viewOf({ ...item.dish, style: BAKE_BASES.pizzaPlate.moveFrom }), state: item.dish.state, base: 'pizzaPlate' };
  }
  return null;
}

// 最後の段階まで焼き上がっている品（中身はその段階を流せる範囲。そろっているか、仕上げ・受け台は、まだ見ない）
function finishedCandidates(s: Served, table: readonly BakeDish[]): BakeDish[] {
  if (s.state !== 'baked') return [];
  return candidatesAt(s.view, s.view.stage, table).filter((d) => d.stages.length === s.view.stage + 1);
}

// 手に持った物が提供できる焼き物なら、その品。最後の段階が焼き上がりで、中身がそろっていて、受け台と仕上げがそろっているもの
export function servableDish(item: Item | null, table: readonly BakeDish[] = BAKE_TABLE): BakeDish | null {
  const s = servedOf(item);
  if (!s) return null;
  return (
    finishedCandidates(s, table).find(
      (d) => d.finish.base === s.base && sameLoad(s.view.loaded, fullLoad(d)) && sameMulti(s.view.finishes, d.finish.extras ?? []),
    ) ?? null
  );
}

// 仕上げを振りすぎた（かけすぎた）品。受け台・中身はそろっていて、その品の仕上げをすべて含むうえに、余計な仕上げがある物。
// 提供はできるが、注文ミスになる（ヒートの皿にボトルを2回振ったのと同じ決まり）。当てはまらなければ null
export function overFinishedDish(item: Item | null, table: readonly BakeDish[] = BAKE_TABLE): BakeDish | null {
  const s = servedOf(item);
  if (!s || servableDish(item, table)) return null;
  // 仕上げだけが違う品（フォッカチオ・シナモンフォッカチオ）があるときは、含んでいる仕上げのいちばん多い品（シナモンを2回振った物は、シナモンフォッカチオの振りすぎ）
  const over = finishedCandidates(s, table).filter(
    (d) => d.finish.base === s.base && sameLoad(s.view.loaded, fullLoad(d)) && containsMulti(s.view.finishes, d.finish.extras ?? []),
  );
  return over.reduce<BakeDish | null>((best, d) => (!best || (d.finish.extras ?? []).length > (best.finish.extras ?? []).length ? d : best), null);
}

// a が b をすべて含むか（個数も。順序は問わない）
function containsMulti<T>(a: readonly T[], b: readonly T[]): boolean {
  const rest = [...a];
  return b.every((x) => {
    const i = rest.indexOf(x);
    if (i < 0) return false;
    rest.splice(i, 1);
    return true;
  });
}

// ボトルで振る（かける）と、焼き物の仕上げになる物（bottle.ts の BOTTLE_BAKE_FINISH）を、この焼き皿に振れるか。
// 受け台に乗せた焼き上がりの器（小皿に移した焼き物も）で、その器の品のどれかが、その仕上げを使うとき（表にない仕上げは振れない）。回数は cfg の上限まで
export function canFinishWith(
  item: Item | null,
  finish: BakeFinishId | undefined,
  cfg: Pick<GameConfig, 'maxBakeFinishes'>,
  table: readonly BakeDish[] = BAKE_TABLE,
): boolean {
  if (!finish || (item?.kind !== 'bakeDish' && item?.kind !== 'bakePlate')) return false;
  const s = servedOf(item);
  if (!s || s.base === null || s.state !== 'baked') return false;
  if (s.view.finishes.length >= cfg.maxBakeFinishes) return false;
  return table.some((d) => d.vessel === s.view.vessel && (d.finish.extras ?? []).includes(finish));
}

// --- 道具の手（クック編 C4）---

// 油のはねる器か（見た目だけ。クック編 C7）：油のはねる器（BAKE_VESSELS の sizzle。鉄板）を出口から取ってから、sizzleSeconds 秒の間
export function isSizzling(item: Item | null, time: number, cfg: Pick<GameConfig, 'sizzleSeconds'>): boolean {
  return item?.kind === 'bakeDish' && BAKE_VESSELS[item.style].sizzle === true && item.outAt !== undefined && time - item.outAt < cfg.sizzleSeconds;
}

// 熱い器か：一度でもオーブンを通った器（焼け具合が「焼く前」でない、または2回目以降の段階）。受け台に乗せた器は、受け台ごと素手で持てるので熱くない。
// 中身を移して空になった器・山から取った器は、焼く前なので冷めている
export function isHot(item: Item | null): item is Extract<Item, { kind: 'bakeDish' }> {
  return item?.kind === 'bakeDish' && baseOf(item) === null && (item.state !== 'raw' || (item.stage ?? 0) > 0);
}

// 焼けたあと、ヘラで1つずつすくえる物と、すくってのせたときの仕上げ（目玉焼き鉄板の卵 → 目玉焼き。使う品は C7 で表に入る）
export const SCOOP_LOADS: Partial<Record<BakeLoadId, BakeFinishId>> = { egg: 'friedEgg' };

// ヘラですくえる物（焼き上がった、受け台に乗せていない器に、すくえる物が残っているとき）。なければ null
export function scoopOf(item: Item | null): { load: BakeLoadId; finish: BakeFinishId } | null {
  if (item?.kind !== 'bakeDish' || item.state !== 'baked' || baseOf(item) !== null) return null;
  for (const id of LOAD_IDS) {
    const finish = SCOOP_LOADS[id];
    if (finish && countOf(item.loaded ?? {}, id) > 0) return { load: id, finish };
  }
  return null;
}

// 次の段階の前に、この手入れ（ヘラではがす）が要るか。焼き上がった器で、いまの段階に当てはまる品の次の段階がそれを求めていて、まだ済ませていないとき
export function needsCare(item: Item | null, care: BakeCare, table: readonly BakeDish[] = BAKE_TABLE): item is Extract<Item, { kind: 'bakeDish' }> {
  if (item?.kind !== 'bakeDish' || item.state !== 'baked' || (item.cares ?? []).includes(care)) return false;
  const view = viewOf(item);
  return candidatesAt(view, view.stage, table).some((d) => (d.stages[view.stage + 1]?.care ?? []).includes(care));
}

// 仕上げを1回足した焼き皿・小皿（元の item は書き換えない）
export function withFinish<T extends Extract<Item, { kind: 'bakeDish' | 'bakePlate' }>>(item: T, finish: BakeFinishId): T {
  return { ...item, finishes: [...(item.finishes ?? []), finish] };
}

// 手に持った焼き皿を、その受け台に乗せられる・移せるか（最後の段階が焼き上がりで、受け台がそれの品）
export function canTakeBase(item: Item | null, base: BakeBase, table: readonly BakeDish[] = BAKE_TABLE): boolean {
  if (item?.kind !== 'bakeDish' || baseOf(item) !== null) return false;
  const s = servedOf(item);
  return s !== null && finishedCandidates(s, table).some((d) => d.finish.base === base);
}

// 提供台に視点を合わせたときの案内（焼き物でなければ null）
export function serveHint(item: Item | null, table: readonly BakeDish[] = BAKE_TABLE): string | null {
  const s = servedOf(item);
  if (!s) return null;
  const ready = servableDish(item, table) ?? overFinishedDish(item, table); // 振りすぎも、出せる（ヒートの皿と同じく、出すと注文ミス）
  if (ready) return `左クリック：${dishName(ready.id)}を提供台に出す`;
  if (s.state === 'burnt') return '焦げていて提供できない（右クリックで捨てる）';
  if (s.state === 'half') return '生焼けで提供できない（もう一度、入口に流して焼く）';
  if (s.state === 'raw') return '焼き上がっていない皿は出せない';
  const finished = finishedCandidates(s, table);
  if (finished.length === 0) {
    const now = candidatesAt(s.view, s.view.stage, table)[0];
    return now ? `まだ途中（${nextStepText(now, s.view.stage)}）` : 'この中身の料理はない（提供できない）';
  }
  const d = finished.find((x) => x.finish.base === s.base) ?? finished[0];
  if (d.finish.base !== s.base) return s.base === null ? BAKE_BASES[d.finish.base].hint : `${BAKE_BASES[s.base].name}では出せない`;
  const missing = missingOf(s.view.loaded, fullLoad(d));
  if (missing.length) return `${dishName(d.id)}の材料がそろっていない（${loadText(missing)}）`;
  const extras = (d.finish.extras ?? []).filter((f) => !s.view.finishes.includes(f));
  if (extras.length) return `仕上げが足りない（${extras.map((f) => BAKE_FINISH_NAME[f]).join('・')}）`;
  return 'この仕上げの料理はない（提供できない）';
}

// その品の伝票のうち、最も古いもの（なければ null = 注文ミス）
export function findBakedTicket(dishId: string, tickets: readonly Ticket[]): Ticket | null {
  return oldestTicket(tickets.filter((t) => t.menuId === dishId));
}

// 焼き物の品（形が「焼き物」の品）
export function bakedMenus(menus: readonly MenuItem[] = MENU): MenuItem[] {
  return menus.filter((m) => formOf(m) === 'bake');
}

// --- 焼き方の要約（iPad の一覧のカードの一言。クック編設計書 4.9）---

// 1つの段階の段と周回。必要な時間（U の倍数）が偶数なら下段（下段1周 = 上段2周）、奇数なら上段で数える
export function stagePass(stage: BakeStage): string {
  return stage.need % 2 === 0 ? `下段${stage.need / 2}周` : `上段${stage.need}周`;
}

// 品の焼き方の要約（例：「下段1周 → 下駄」「上段1周 → ピザのお皿」「下段1周 → 下駄 → パセリ」）。
// 段階ごとに、流す前の手入れ（ヘラではがす）と段・周回を並べ、最後に受け台と仕上げを足す
export function bakeSummary(dish: BakeDish): string {
  const parts: string[] = [];
  for (const stage of dish.stages) {
    for (const care of stage.care ?? []) parts.push(BAKE_CARE_NAME[care].name);
    parts.push(stagePass(stage));
  }
  parts.push(BAKE_BASES[dish.finish.base].name);
  for (const extra of dish.finish.extras ?? []) parts.push(BAKE_FINISH_NAME[extra]);
  return parts.join(' → ');
}

// --- 表の整合性 ---
// 守れていない決まりの一覧（空なら OK）。テストで BAKE_TABLE が空になることを確かめる
//   ① 同じ器・同じ中身・同じ段階で当てはまる品どうしは、必要な時間が同じ
//   ② 必要な時間は U の整数倍（1以上）
//   ③ ある品の流す前の中身（1回目）が、同じ器の別の品（同じ品も含む）の途中（2回目以降）の中身と区別できる
//   ④ 流せる最低限は、そろった中身を超えない
//   ⑤ 器・段階・仕上げがまったく同じ品は、2つ置かない（提供のときに区別できない。中身の入った山から取る品どうしは、山で区別できるのでよい）
//   ⑥ id が重複しない
export function tableProblems(table: readonly BakeDish[] = BAKE_TABLE): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const d of table) {
    if (ids.has(d.id)) out.push(`⑥ ${d.id}：id が重複している`);
    ids.add(d.id);
    if (d.stages.length === 0) out.push(`${d.id}：段階がない`);
    d.stages.forEach((st, i) => {
      if (!Number.isInteger(st.need) || st.need < 1) out.push(`② ${d.id} ${i + 1}回目：必要な時間 ${st.need} が U の整数倍ではない`);
      const r = stageRange(d, i);
      if (!within(r.min, r.max)) out.push(`④ ${d.id} ${i + 1}回目：流せる最低限が、そろった中身を超えている`);
    });
  }
  for (const a of table) {
    for (const b of table) {
      if (a.vessel !== b.vessel) continue;
      const n = Math.min(a.stages.length, b.stages.length);
      if (a !== b) {
        for (let i = 0; i < n; i++) {
          if (rangesOverlap(stageRange(a, i), stageRange(b, i)) && a.stages[i].need !== b.stages[i].need) {
            out.push(`① ${a.id} と ${b.id}：${i + 1}回目の中身が同じなのに、必要な時間が違う`);
          }
        }
        // 中身の入った山から取る品（stock）どうしは、山で区別できる（皿がどの山から取ったかを覚えている）ので、同じでもよい
        if (a.id < b.id && !(a.stock && b.stock) && JSON.stringify([a.stages, a.finish]) === JSON.stringify([b.stages, b.finish])) {
          out.push(`⑤ ${a.id} と ${b.id}：段階と仕上げがまったく同じ`);
        }
      }
      if (a.stages.length === 0) continue;
      for (let j = 1; j < b.stages.length; j++) {
        if (rangesOverlap(stageRange(a, 0), stageRange(b, j))) out.push(`③ ${a.id} の1回目の中身が、${b.id} の${j + 1}回目の中身と区別できない`);
      }
    }
  }
  return out;
}
