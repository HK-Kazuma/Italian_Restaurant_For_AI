import type { BakeSeries, BakeStyle, BottleId, CookBinId, FreeTrayId, PizzaTop, PlateStyle, SurfaceId, TableSpot } from './types';

// 設備の置き場所。ここの数値を直すと、その設備が動く（保存すると開発サーバーが自動で読み込み直す）。
//
// 座標は上から見たときの位置（単位 m）。プレイヤーが最初に立つ場所が (x=0, z=0)。
//   +x … 右        -x … 左
//   -z … 前（奥）  +z … 手前（プレイヤー側）
//
//            奥（-z）
//      ┌───────────────────────┐
//      │       [ 茹で麺器 ]        │
//      │ [左の台]  [ IH ] [熱湯] [サラダ台] │
//      │                    [冷蔵庫]│
//      │                   [冷蔵庫2]│
//      │         ● プレイヤー (0, 0)   │
//      └───────────────────────┘
//            手前（+z）
//
// 動かせるのは「冷蔵庫」「2台目の冷蔵庫」「3台目の冷蔵庫」「サラダ台」「熱湯」の5つ。位置関係・向きは変えず、基準点だけを動かす。
// 部屋の壁は、これらがはみ出さないよう自動で広がる。

export type Spot = { x: number; z: number };

export type Layout = {
  // 冷蔵庫。基準点は「前面（扉のある面）の中央」。
  //   奥行き 0.8m（+x 方向に伸びる）、幅 2.0m（z 方向）、4段。扉は左右の観音開きで、プレイヤー側（-x）へ開く。
  //   x の範囲 = x 〜 x+0.8、z の範囲 = z-1.0 〜 z+1.0
  fridge: Spot;

  // 2台目の冷蔵庫（最初は空）。大きさ・向き・棚の段数は冷蔵庫と同じで、基準点だけが違う。
  //   冷蔵庫（幅 2.0m）のすぐ手前（+z）側の横に並べる。重ならないよう、z を冷蔵庫より 2.0 以上大きくする
  fridge2: Spot;

  // 3台目の冷蔵庫（最初は空）。大きさ・向き・棚の段数は冷蔵庫と同じ。
  //   2台目の冷蔵庫のさらに手前（+z）側の横に並べる。重ならないよう、z を2台目より 2.0 以上大きくする
  fridge3: Spot;

  // サラダ台。基準点は「天板の中心」。
  //   x 方向 1.5m × z 方向 3.0m。左の列（x-0.45）がサラダを作る台・トレー置き場・ボトル、中・右の列（x+0.1 / x+0.55）が具材コーナー。
  //   x の範囲 = x-0.75 〜 x+0.75、z の範囲 = z-1.5 〜 z+1.5
  saladTable: Spot;

  // 熱湯。基準点は「中心」。
  //   x 方向 0.9m × z 方向 1.0m。
  //   x の範囲 = x-0.45 〜 x+0.45、z の範囲 = z-0.5 〜 z+0.5
  hotWater: Spot;
};

export const LAYOUT: Layout = {
  fridge: { x: 2.25, z: 3.0 },
  fridge2: { x: 2.25, z: 5.0 },
  fridge3: { x: 2.25, z: 7.0 },
  saladTable: { x: 2.20, z: 0.3
   },
  hotWater: { x: 1.95, z: -1.8},
};

// 左の台を手前（+z、ジェットオーブン側）へ広げた長さ。提供台とジェットオーブンのあいだの作業スペース。
// 台の奥の端（z = -2.0）は動かさず、手前だけが伸びる（中心はこの半分だけ手前へずれる）
const LEFT_COUNTER_EXTEND = 1.5;

// ボトルを置ける台（天板）。salad = 右のサラダ台、left = IHの左の台（皿・トッピング・提供台）。
// 大きさは x 方向 × z 方向（m）。見た目・当たり判定・ボトルを置ける範囲が使う
export const SURFACES = {
  salad: { width: 1.5, depth: 3.0 },
  left: { width: 1.4, depth: 3.6 + LEFT_COUNTER_EXTEND },
  hotWater: { width: 1.6, depth: 1.7 }, // 湯煎器の奥と右に回り込むL字の台の、外側の大きさ
  prep: { width: 0, depth: 0 }, // 作業台（3台の具材台の天板をまとめた面）。大きさは、具材台の大きさが決まったあとで入れる（下の OVEN_COUNTER_ROW のすぐ下）
};

// 湯煎器（layout.hotWater）の奥と右の台。湯煎器の中心からの相対位置（x: 右、z: 手前）。天板の高さは 0.9。
// 台の中心 = 外側の矩形の中心（置き場所の x, z はここからの相対）。手前と左は空けてあり、湯煎器の中が見える
export const HOT_WATER_COUNTER = {
  center: { x: 0.35, z: -0.35 },
  // 奥の帯と右の帯（湯煎器の中心からの相対の矩形）
  back: { minX: -0.45, maxX: 1.15, minZ: -1.2, maxZ: -0.5 },
  right: { minX: 0.45, maxX: 1.15, minZ: -0.5, maxZ: 0.5 },
};

// IHの左の台の中心（この台は layout の対象ではなく、位置は固定）。もとの中心 z = -0.2 から、広げた分の半分だけ手前へ
export const LEFT_COUNTER = { x: -2.6, z: -0.2 + LEFT_COUNTER_EXTEND / 2 };

// 提供台（左の台の上の緑の台）。ワールド座標の中心と、一辺の長さ
export const SERVE_PASS = { x: -2.4, z: 1.0, size: 0.7 };

// 下駄（ドリアの下にひく木の台）。w = 長い辺、d = 短い辺、h = 厚み。ドリアの皿（BAKE_DISHES.doria）より、ひと回り大きい。
// 下駄の山は、長い辺を z 方向にそろえて積む（stackHeight 枚）。山の置き場は、左の台の、提供台の左（手前の壁側 = +z）のあき地
export const GETA = { w: 0.52, d: 0.36, h: 0.022, stackHeight: 8 };
const GETA_EDGE = 0.03; // 台の縁から、山までの最小のすき間
const GETA_PASS_GAP = 0.05; // 提供台から、山までの最小のすき間
// 山の中心を置ける範囲（左の台の中心からの相対。x: 右、z: 手前）。左の台の上で、提供台より壁側（+z）のあき地に限る。
// 皿・トッピングの置き場は台の奥（-z）側なので、提供台より手前なら、それらに重ならない
export const GETA_RANGE = {
  minX: -SURFACES.left.width / 2 + GETA.d / 2 + GETA_EDGE,
  maxX: SURFACES.left.width / 2 - GETA.d / 2 - GETA_EDGE,
  minZ: SERVE_PASS.z + SERVE_PASS.size / 2 + GETA_PASS_GAP + GETA.w / 2 - LEFT_COUNTER.z,
  maxZ: SURFACES.left.depth / 2 - GETA_EDGE - GETA.w / 2,
};
// 下駄の山の最初の置き場所（提供台のすぐ左）。台の中心からの相対位置
export const GETA_HOME: TableSpot = {
  surface: 'left',
  x: SERVE_PASS.x - LEFT_COUNTER.x,
  z: GETA_RANGE.minZ + 0.1,
};

// ボトルの最初の置き場所。台の中心からの相対位置（x: 右、z: 手前）。
// パセリは、もとのトッピングの位置（左の台の奥の列）
export const BOTTLE_HOME: Record<BottleId, { surface: SurfaceId; x: number; z: number }> = {
  dressing: { surface: 'salad', x: -0.45, z: -0.9 },
  paprika: { surface: 'salad', x: -0.45, z: -1.25 },
  garum: { surface: 'salad', x: -0.45, z: -1.4 },
  // 台の中心が手前へずれたぶん、相対位置を引いて、台の上の見た目の位置は変えない
  parsley: { surface: 'left', x: -0.4, z: 0.95 - LEFT_COUNTER_EXTEND / 2 },
  blackPepper: { surface: 'left', x: -0.4, z: 1.45 - LEFT_COUNTER_EXTEND / 2 }, // もとのトッピングの位置
};

// ガーリック・唐辛子の容器の、台の上の標準の置き場所（チュートリアルの矢印が指す。台の中心からの相対位置）。
// 置く場所は自由に選べる。サラダ台の具材コーナーはトレー置き場が並ぶので、標準の置き場は湯煎器の奥の台にした
export const FREE_TRAY_HOME: Record<FreeTrayId, { surface: SurfaceId; x: number; z: number }> = {
  garlic: { surface: 'hotWater', x: -0.3, z: -0.5 },
  chili: { surface: 'hotWater', x: 0.3, z: -0.5 },
};

// --- ジェットオーブン（ベルトコンベア式。ドリア・鉄板焼きを焼く） ---
// 左の台（LEFT_COUNTER）の提供台の側から見て、左側に置く。IHコンロを前方に見たときは、提供台の後ろ側（+z 方向、手前の壁寄り）。
// 料理は壁側（+z）から提供台側（-z）へ、z 軸に沿って流れる。
//   壁 | [具材台] → [入口] [オーブン本体] [出口] → [左の台（皿・提供台）]      （左から右へ、+z → -z）
// 上段と下段の2段。段ごとに、入口から出口まで出てくる時間が違う（config.ts の ovenUpperTime / ovenLowerTime）。

// 器の寸法の系統（w = 流れの向き、d = 流れと直角。m）。器の寸法は、この2通りだけ（新しい器は、必ずどちらかを使う）。
//   three（3列系）：長方形で、長い辺を流れの向きにして横向きに置く。入口・出口には 流れの向きに2つ × 横に3つ並ぶ
//   two（2列系）：直径 0.5 の丸（または、それに収まる角）。入口・出口には 流れの向きに2つ × 横に2つ並ぶ
// ベルトのレーン・置き場（oven.ts）は、器の種類ではなく、この系統で決まる
export const BAKE_SERIES: Record<BakeSeries, { w: number; d: number }> = {
  three: { w: 0.42, d: 0.3 },
  two: { w: 0.5, d: 0.5 },
};

// 焼き皿（器）の大きさ。w, d は系統（BAKE_SERIES）のまま、h = 高さ（山に積むときの1枚の厚みにも使う）。round = 丸い器（置く前の印を丸くする）
//   doria = ドリア皿（グラタン皿）・pizza = ピザの鉄板は既存。ほかはクック編設計書 4.2 の表（「仮」の系統は、ここを直すだけで変えられる）
const dishOf = (name: string, series: BakeSeries, h: number, round = false) => ({ name, series, ...BAKE_SERIES[series], h, ...(round ? { round } : {}) });
export const BAKE_DISHES: Record<BakeStyle, { name: string; series: BakeSeries; w: number; d: number; h: number; round?: boolean }> = {
  doria: dishOf('ドリア系', 'three', 0.05),
  pizza: dishOf('ピザ系', 'two', 0.03, true),
  bakingPad: dishOf('焼成パッド', 'three', 0.035),
  largePad: dishOf('大きめの焼成パッド', 'two', 0.04),
  hamburgPan: dishOf('ハンバーグの鉄板', 'three', 0.03), // 仮：3列系
  eggPan: dishOf('目玉焼き鉄板', 'three', 0.03), // 仮：3列系
  soupBowl: dishOf('鉄のスープ皿', 'three', 0.065), // 仮：3列系
};
// 具材台の焼き皿の山の表示名。doria = ドリアスタック（焼く前のドリア。本番でも使う）、pizza = 開発時だけ出す、テスト用のピザ系の皿の山（生地・ソース・チーズがのった状態）。
// ほかは、棚の空の器の山（vesselStack）
export const OVEN_STOCK_NAME: Record<BakeStyle, string> = {
  doria: 'ドリアスタック',
  pizza: 'ピザ系の皿の山（開発用）',
  bakingPad: '焼成パッドの山',
  largePad: '大きめの焼成パッドの山',
  hamburgPan: 'ハンバーグの鉄板の山',
  eggPan: '目玉焼き鉄板の山',
  soupBowl: '鉄のスープ皿の山',
};
// ベルトや入口・出口の大きさの基準にする皿（ドリア系）
export const BAKE_DISH = BAKE_DISHES.doria;

export const OVEN_BELT = {
  lanes: 3, // 流れと直角（x 方向）に並べられる数。ベルトは3レーン
  laneW: BAKE_DISH.d + 0.04, // 1レーンの幅（皿の幅に少し余裕）
  laneGap: 0.02, // レーンの間のすき間
  // 入口・出口の長さ（流れの向き z）。皿が流れの向きに2つ並ぶ長さ + 皿 0.5個分（余白は、入口も出口も、外側の端）
  length: (2 + 0.5) * BAKE_DISH.w,
  margin: 0.5 * BAKE_DISH.w, // 外側の端の余白（皿 0.5個分）
  body: 1.1, // オーブン本体の長さ（z）
  bodyDepth: 1.3, // オーブン本体の幅（x）
};

export const OVEN = {
  x: LEFT_COUNTER.x, // ベルトの中心の x（左の台と同じ列）
  // ベルトの上面の高さ。下段は左の台（0.9）の少し下、上段はその上
  beltY: { upper: 1.28, lower: 0.78 },
};

// オーブンの z 方向の並び（手前の壁側から 入口 → 本体 → 出口）。出口の端は、左の台の手前（+z）の端にほぼ接する
const OVEN_FRONT = LEFT_COUNTER.z + SURFACES.left.depth / 2 + 0.02;
export const OVEN_Z = {
  outlet: { minZ: OVEN_FRONT, maxZ: OVEN_FRONT + OVEN_BELT.length },
  body: { minZ: OVEN_FRONT + OVEN_BELT.length, maxZ: OVEN_FRONT + OVEN_BELT.length + OVEN_BELT.body },
  inlet: {
    minZ: OVEN_FRONT + OVEN_BELT.length + OVEN_BELT.body,
    maxZ: OVEN_FRONT + OVEN_BELT.length * 2 + OVEN_BELT.body,
  },
};

// 部屋の左の壁（中心線）の x。壁の厚みは 0.1 なので、部屋の内側の面はここから 0.05 だけ右
export const ROOM_MIN_X = -3.6;
export const WALL_HALF = 0.05;

// オーブンの入口の先（壁側）の台。ドリア・鉄板焼きの具材を置く具材コーナー（1台目の天板に作業枠、下の棚に器の山）
// 右の端（部屋の中央側）は左の台・オーブンと同じ列の端（OVEN.x + 左の台の幅/2）のまま、左へ伸ばして左の壁の内側の面に接する
const OVEN_COUNTER_D = 1.2;
const OVEN_COUNTER_MAX_X = OVEN.x + SURFACES.left.width / 2; // 右の端（動かさない）
const OVEN_COUNTER_MIN_X = ROOM_MIN_X + WALL_HALF; // 左の端 = 左の壁の内側の面
export const OVEN_COUNTER = {
  width: OVEN_COUNTER_MAX_X - OVEN_COUNTER_MIN_X, // x 方向
  depth: OVEN_COUNTER_D, // z 方向
  x: (OVEN_COUNTER_MAX_X + OVEN_COUNTER_MIN_X) / 2,
  z: OVEN_Z.inlet.maxZ + 0.02 + OVEN_COUNTER_D / 2,
};

// 具材台は全部で3台。OVEN_COUNTER（オーブンの入口の先）を1台目にして、同じ大きさのものを、壁側（+z）へすき間なく横に並べる。
// 3台とも部屋の中央側（+x）が開いた2段の棚で、ドリア系の皿の山が入っている。部屋の手前（+z）の壁は、いちばん奥の台に合わせて広がる
export const OVEN_COUNTER_COUNT = 3;
export const OVEN_COUNTER_ZS: readonly number[] = Array.from({ length: OVEN_COUNTER_COUNT }, (_, i) => OVEN_COUNTER.z + i * OVEN_COUNTER.depth);
// 3台をまとめた広さ（z 方向）と中心
export const OVEN_COUNTER_ROW = {
  depth: OVEN_COUNTER.depth * OVEN_COUNTER_COUNT,
  z: OVEN_COUNTER.z + (OVEN_COUNTER.depth * (OVEN_COUNTER_COUNT - 1)) / 2,
  maxZ: OVEN_COUNTER.z + OVEN_COUNTER.depth * (OVEN_COUNTER_COUNT - 0.5),
};
// 3台の天板は、すき間なく並んでいるので、1つの面 'prep' として扱う（中心 = x: OVEN_COUNTER.x、z: OVEN_COUNTER_ROW.z）
SURFACES.prep.width = OVEN_COUNTER.width;
SURFACES.prep.depth = OVEN_COUNTER_ROW.depth;

// 具材台の下の棚。天板（高さ 0.9）の下が、上下2段の棚になっている。広さは具材台と同じ（x: 壁 〜 部屋の中央側、z: 具材台の奥行き）。
// 部屋の中央側（+x）が開いていて、そこから皿を取る。段ごとに、ドリア系の皿の山を並べる
//   shelfTopY … 各段の棚板の上面の高さ（下段・上段）。天板の下面は 0.9 - topThickness
export const OVEN_COUNTER_SHELF = {
  topThickness: 0.05, // 天板の厚み
  boardThickness: 0.03, // 棚板の厚み
  shelfTopY: [0.1, 0.5] as const, // 下段・上段の棚板の上面の高さ
  stacksPerTier: 2, // 1段に並べる山の数（開いている面の端に、z 方向に並べる。奥は視点の線が天板に遮られて狙えないので、手前の端に寄せる）
  stackHeight: 5, // 1つの山の皿の枚数
};

// 棚の山の割り当て（具材台の下、2段 × 2山 × 3台 = 12か所）。counter = 何台目の具材台か（OVEN_COUNTER_ZS の添字）、tier = 段（0 = 下段、1 = 上段）、
// slot = 段の中の山の番号（0 = オーブン側）。山の中身は、ドリアの山（ovenStock。dish = どの品の山か。label = 棚に出す品名）か、空の器の山（vesselStack）。
// 書いていない場所は空き。並び順は、チュートリアルの矢印が先に見つける順（ミラノドリアを先頭に置く）
export type ShelfStack = { counter: number; tier: 0 | 1; slot: number; style: BakeStyle; dish?: string; label: string };
export const SHELF_STACKS: readonly ShelfStack[] = [
  // 1台目：ドリア4品の山（焼く前の中身が入った皿）
  { counter: 0, tier: 1, slot: 0, style: 'doria', dish: 'milanoDoria', label: 'ミラノドリア' },
  { counter: 0, tier: 1, slot: 1, style: 'doria', dish: 'cheeseMilanoDoria', label: '焼きチーズミラノドリア' },
  { counter: 0, tier: 0, slot: 0, style: 'doria', dish: 'tarakoDoria', label: 'たらこのドリア' },
  { counter: 0, tier: 0, slot: 1, style: 'doria', dish: 'tarakoGratin', label: 'たらこのグラタン' },
  // 2台目：空のドリア皿・焼成パッド・大きめの焼成パッド・鉄のスープ皿
  { counter: 1, tier: 1, slot: 0, style: 'doria', label: '空のドリア皿' },
  { counter: 1, tier: 1, slot: 1, style: 'bakingPad', label: '焼成パッド' },
  { counter: 1, tier: 0, slot: 0, style: 'largePad', label: '大きめの焼成パッド' },
  { counter: 1, tier: 0, slot: 1, style: 'soupBowl', label: '鉄のスープ皿' },
  // 3台目：ハンバーグの鉄板・目玉焼き鉄板（下段の2か所は空き）
  { counter: 2, tier: 1, slot: 0, style: 'hamburgPan', label: 'ハンバーグの鉄板' },
  { counter: 2, tier: 1, slot: 1, style: 'eggPan', label: '目玉焼き鉄板' },
];
// 開発時（npm run dev）だけ出す、テスト用のピザ系の皿の山の置き場（3台目の空き）
export const DEV_PIZZA_SHELF = { counter: 2, tier: 0 as const, slot: 0 };
// 棚の山の、具材台の中心からの相対位置（xr: 部屋の中央側、zr: 壁側）。開いている面（+x）の端に寄せる（奥は視点の線が天板に遮られて狙えない）。
// 器は長い辺を z 方向（オーブンの皿と同じ向き）にして積む
const SHELF_EDGE = 0.03; // 開いている面の端から、山までのすき間
export function shelfStackSpot(style: BakeStyle, slot: number): { xr: number; zr: number } {
  const pitch = OVEN_COUNTER.depth / OVEN_COUNTER_SHELF.stacksPerTier;
  return { xr: OVEN_COUNTER.width / 2 - BAKE_DISHES[style].d / 2 - SHELF_EDGE, zr: (slot - (OVEN_COUNTER_SHELF.stacksPerTier - 1) / 2) * pitch };
}

// 2台目の具材台（OVEN_COUNTER_ZS[1]）の天板の上の、ピザの置き場。位置は、その具材台の中心からの相対（xr: 右 = 部屋の中央側、zr: 手前 = 壁側）。天板は x 方向 約1.65m × z 方向 1.2m。
//   手前（部屋の中央側）に、鉄板を置いて組み立てる場所（組み立て台）を2つ。
//   その奥（壁側）のまん中の列に、ソース・チーズ・モッツァレラの容器（具材）を z 方向に並べる。ソースは正方形、チーズは長方形で、奥（z 方向）に長い向き。
//   いちばん奥（壁側）に、ピザ生地のスタックと、ピザの鉄板のスタック
export const PIZZA_COUNTER = {
  counter: 1, // 何台目の具材台の上か（OVEN_COUNTER_ZS の添字。0 = オーブンに近い1台目）
  sauce: { xr: 0.0, zr: -0.42, w: 0.3, d: 0.3 }, // 正方形の容器（ピザソース）。w = x 方向、d = z 方向
  cheese: { xr: 0.0, zr: 0.0, w: 0.24, d: 0.44 }, // 長方形の容器（ピザチーズ）。z 方向に長い
  mozz: { xr: 0.0, zr: 0.42, w: 0.28, d: 0.28 }, // 上が空いたプラスチックの容器（モッツァレラチーズ）
  slotR: 0.27, // 組み立て台の半径（鉄板 直径 0.5m が収まる）
  slotSeries: 'two' as BakeSeries, // 組み立て台に置ける器の寸法の系統（ピザの鉄板・大きめの焼成パッド）
  slots: [
    { xr: 0.52, zr: -0.3 },
    { xr: 0.52, zr: 0.3 },
  ],
  doughStack: { xr: -0.57, zr: 0.32, count: 6 }, // ピザ生地のスタック（生地の枚数）
  panStack: { xr: -0.56, zr: -0.3 }, // ピザの鉄板のスタック（枚数は config の pizzaPanCount）
};

// ピザの4番目の具（野菜ときのこ・ソーセージ・コーン）の容器（クック編 C3）。モッツァレラの容器の隣（手前 = 壁側）に、x 方向に3つ並べる。
// 2台目の天板はソース・チーズ・モッツァレラ・組み立て台・スタックで埋まっているので、すき間なく続く3台目の天板の、モッツァレラ側の縁に置く
// （位置は PIZZA_COUNTER の具材台の中心からの相対。zr が天板の半分 0.6 を超える = 隣の3台目の上）。大きさはモッツァレラの容器に近い、上が空いた四角い容器
const PIZZA_TOP_TUB = 0.26;
export const PIZZA_TOP_TUBS = {
  w: PIZZA_TOP_TUB,
  d: PIZZA_TOP_TUB,
  spots: {
    vegMushroom: { xr: -0.32, zr: 0.6 + 0.03 + PIZZA_TOP_TUB / 2 },
    sausage: { xr: 0.0, zr: 0.6 + 0.03 + PIZZA_TOP_TUB / 2 },
    corn: { xr: 0.32, zr: 0.6 + 0.03 + PIZZA_TOP_TUB / 2 },
  } satisfies Record<PizzaTop, { xr: number; zr: number }>,
};

// 1台目の具材台（オーブンの入口の隣）の作業枠。部屋の中央側（+x）の縁に、z 方向に3つ並べる。枠は、器の長い辺を左右（x 方向）に向けて置く大きさ。
// 3列系の器・受け台（下駄・板）・小皿を置いて、盛り付け・ヘラではがす・仕上げをする。位置は具材台の中心からの相対（xr: 右、zr: 手前）。
//   w = x 方向（長い辺）、d = z 方向。受け台（下駄・板）がそのまま収まる大きさ
const WORK_FRAME_EDGE = 0.03; // 縁から枠までのすき間
const WORK_FRAME_GAP = 0.03; // 枠どうしのすき間
const WORK_FRAME_W = Math.max(GETA.w, 0.52);
const WORK_FRAME_D = Math.max(GETA.d, 0.36);
export const WORK_FRAMES = {
  counter: 0, // 何台目の具材台の上か（OVEN_COUNTER_ZS の添字）
  series: 'three' as BakeSeries, // 置ける器の寸法の系統（2列系の器は、ピザの組み立て台に置く）
  plateStyles: ['small'] as readonly PlateStyle[], // 置ける皿の種類（小皿）
  w: WORK_FRAME_W,
  d: WORK_FRAME_D,
  slots: [-1, 0, 1].map((k) => ({ xr: OVEN_COUNTER.width / 2 - WORK_FRAME_EDGE - WORK_FRAME_W / 2, zr: k * (WORK_FRAME_D + WORK_FRAME_GAP) })),
};

// 木の板（鉄板・スープ皿の受け台）。w = 長い辺、d = 短い辺、h = 厚み。3列系の器より、ひと回り大きい（作業枠に収まる）
export const BOARD = { w: 0.5, d: 0.34, h: 0.025, stackHeight: 6 };

// 左の台（提供台より壁側のあき地）の、板の山と小皿の山（台の中心からの相対位置）。下駄の山のそばの、ピザのお皿・鉄板の山を置く場所と重ならないところ（小皿 = 下駄の山の右隣、板 = あき地の壁側の端）。
//   board = 板の山（長い辺を x 方向に積む）、small = 小皿の山（半径 r。ほうれん草のソテーの小皿と同じ物）
export const COOK_SIDE_STACKS = {
  board: { surface: 'left' as const, x: -0.42, z: 2.38 },
  small: { surface: 'left' as const, x: 0.55, z: 1.15, r: 0.14, count: 6 },
};
// 左の台の上に、もとから置いてある物（中心の相対位置と、半分の大きさ。r があれば、半径 r の丸）。ボトル・容器・ピザのお皿・下駄の山を重ねて置けない
export const LEFT_FIXTURES: readonly { x: number; z: number; hx: number; hz: number; r?: number }[] = [
  { x: COOK_SIDE_STACKS.board.x, z: COOK_SIDE_STACKS.board.z, hx: BOARD.w / 2, hz: BOARD.d / 2 },
  { x: COOK_SIDE_STACKS.small.x, z: COOK_SIDE_STACKS.small.z, hx: COOK_SIDE_STACKS.small.r, hz: COOK_SIDE_STACKS.small.r, r: COOK_SIDE_STACKS.small.r },
];
// 左の台の、もとから置いてある物に、置こうとしている物が重なるか。置く物は、中心 (x, z)・半分の大きさ (hx, hz) の長方形。
// round = true なら、半径 hx の丸（ピザのお皿・鉄板・ボトル・容器）
export function overlapsLeftFixture(x: number, z: number, hx: number, hz: number, round = false): boolean {
  return LEFT_FIXTURES.some((f) => {
    if (f.r !== undefined && round) return Math.hypot(f.x - x, f.z - z) < f.r + hx; // 丸と丸
    if (f.r !== undefined) return Math.hypot(Math.max(0, Math.abs(f.x - x) - hx), Math.max(0, Math.abs(f.z - z) - hz)) < f.r; // 丸い物と、置く長方形
    if (round) return Math.hypot(Math.max(0, Math.abs(f.x - x) - f.hx), Math.max(0, Math.abs(f.z - z) - f.hz)) < hx; // 長方形の物と、置く丸
    return Math.abs(f.x - x) < f.hx + hx && Math.abs(f.z - z) < f.hz + hz;
  });
}

// ピザのお皿・使い終わった鉄板（どちらも直径 0.5m）の半径
export const PIZZA_PLATE_R = 0.25;

// 提供台の左の、ピザのお皿の山（左の台の中心からの相対位置）。左の台の、提供台より壁側（+z）のあき地にある
export const PIZZA_PLATE_STACK = { surface: 'left' as const, x: -0.42, z: 1.95, count: 6 };

// チュートリアルで、ピザのお皿を置く場所として指す位置（左の台の、ピザのお皿の山の右のあき地。置ける範囲 PROP_RANGE の中）
export const PIZZA_PLATE_GUIDE = { surface: 'left' as const, x: 0.25, z: 1.95 };

// ピザのお皿・鉄板（の山）を、台の上に置ける範囲（台の中心からの相対。丸い物の中心の範囲）。
//   left（左の台）：下駄の山と同じ、提供台より壁側（+z）のあき地に限る（皿・トッピングの置き場に重ならない）
//   prep（作業台）：3台の天板のどこでも（置いてある物には重ねられない。PREP_FIXTURES）
export const PROP_RANGE = {
  minX: -SURFACES.left.width / 2 + PIZZA_PLATE_R + 0.03,
  maxX: SURFACES.left.width / 2 - PIZZA_PLATE_R - 0.03,
  minZ: SERVE_PASS.z + SERVE_PASS.size / 2 + 0.05 + PIZZA_PLATE_R - LEFT_COUNTER.z,
  maxZ: SURFACES.left.depth / 2 - 0.03 - PIZZA_PLATE_R,
};
export const PROP_RANGE_PREP = {
  minX: -SURFACES.prep.width / 2 + PIZZA_PLATE_R + 0.03,
  maxX: SURFACES.prep.width / 2 - PIZZA_PLATE_R - 0.03,
  minZ: -SURFACES.prep.depth / 2 + PIZZA_PLATE_R + 0.03,
  maxZ: SURFACES.prep.depth / 2 - PIZZA_PLATE_R - 0.03,
};

// --- 冷凍の袋の吊り棚とストック容器（クック編 C5）---

// 具材台の上の、左の壁の吊り棚（仮：棚板の上面の高さ 1.45m、2台目〜3台目の上）。冷凍の袋（cookStock.ts の FROZEN_BAG_IDS の順）を z 方向に並べる。
// 視線の判定に入れるのは袋だけ（棚板は入れない）。bag = 袋の大きさ（w: z 方向の幅、h: 高さ、d: x 方向の厚み）
export const FROZEN_SHELF = {
  y: 1.45, // 仮
  counters: [1, 2] as const, // 何台目の具材台の上か（OVEN_COUNTER_ZS の添字。最初と最後）
  depth: 0.3, // 棚板の奥行き（x 方向。壁から）
  thickness: 0.025,
  bag: { w: 0.26, h: 0.34, d: 0.1 },
};
// 吊り棚の範囲（z）と、棚板の中心の x
export const FROZEN_SHELF_SPAN = {
  minZ: OVEN_COUNTER_ZS[FROZEN_SHELF.counters[0]] - OVEN_COUNTER.depth / 2 + 0.05,
  maxZ: OVEN_COUNTER_ZS[FROZEN_SHELF.counters[1]] + OVEN_COUNTER.depth / 2 - 0.05,
  x: ROOM_MIN_X + WALL_HALF + FROZEN_SHELF.depth / 2,
};
// 袋の置き場所（ワールド座標。y = 袋の底）。i = 並びの番号、n = 袋の数。棚の範囲を n 等分した中央に立てる
export function frozenBagSpot(i: number, n: number): { x: number; y: number; z: number } {
  const span = FROZEN_SHELF_SPAN.maxZ - FROZEN_SHELF_SPAN.minZ;
  return { x: FROZEN_SHELF_SPAN.x, y: FROZEN_SHELF.y, z: FROZEN_SHELF_SPAN.minZ + ((i + 0.5) * span) / n };
}

// 具材台の天板のストック容器（仮：1台目と3台目の天板）。counter = 何台目の具材台か、xr・zr = その具材台の中心からの相対（xr: 部屋の中央側、zr: 壁側）。
// 1台目は作業枠（部屋の中央側の縁）より壁寄りのあき地、3台目はピザの具の容器より壁側（手前の端）。下調理したポテトは、作業枠にいちばん近い場所
export const COOK_BIN = { w: 0.24, d: 0.24, h: 0.12 };
export const COOK_BIN_SPOTS: Record<CookBinId, { counter: number; xr: number; zr: number }> = {
  potato: { counter: 0, xr: -0.02, zr: -0.3 },
  corn: { counter: 0, xr: -0.31, zr: -0.3 },
  patty: { counter: 0, xr: -0.6, zr: -0.3 },
  chicken: { counter: 0, xr: -0.02, zr: 0.02 },
  focaccia: { counter: 0, xr: -0.31, zr: 0.02 },
  egg: { counter: 0, xr: -0.6, zr: 0.02 },
  // 3台目は、壁側の端に寄せる（天板のまん中と、部屋の中央側の角は、お皿・鉄板の山を置けるように空けておく）
  oilSheet: { counter: 2, xr: -0.66, zr: 0.45 },
  cheeseSauceCup: { counter: 2, xr: -0.39, zr: 0.45 },
  demiglace: { counter: 2, xr: -0.12, zr: 0.45 },
  vegPaste: { counter: 2, xr: 0.15, zr: 0.45 },
};

// 作業台（prep）の天板に、もとから置いてある物（中心の相対位置と、半分の大きさ）。2台目の具材台のピザの置き場と、1台目の作業枠、ストック容器
const counterZ = (i: number) => OVEN_COUNTER_ZS[i] - OVEN_COUNTER_ROW.z; // 何台目の具材台の中心か（作業台の中心からの相対）
const pizzaAtZ = counterZ(PIZZA_COUNTER.counter);
export const PREP_FIXTURES: readonly { x: number; z: number; hx: number; hz: number }[] = [
  { x: PIZZA_COUNTER.sauce.xr, z: pizzaAtZ + PIZZA_COUNTER.sauce.zr, hx: PIZZA_COUNTER.sauce.w / 2, hz: PIZZA_COUNTER.sauce.d / 2 },
  { x: PIZZA_COUNTER.cheese.xr, z: pizzaAtZ + PIZZA_COUNTER.cheese.zr, hx: PIZZA_COUNTER.cheese.w / 2, hz: PIZZA_COUNTER.cheese.d / 2 },
  { x: PIZZA_COUNTER.mozz.xr, z: pizzaAtZ + PIZZA_COUNTER.mozz.zr, hx: PIZZA_COUNTER.mozz.w / 2, hz: PIZZA_COUNTER.mozz.d / 2 },
  ...Object.values(PIZZA_TOP_TUBS.spots).map((t) => ({ x: t.xr, z: pizzaAtZ + t.zr, hx: PIZZA_TOP_TUBS.w / 2, hz: PIZZA_TOP_TUBS.d / 2 })),
  ...PIZZA_COUNTER.slots.map((s) => ({ x: s.xr, z: pizzaAtZ + s.zr, hx: PIZZA_COUNTER.slotR, hz: PIZZA_COUNTER.slotR })),
  { x: PIZZA_COUNTER.doughStack.xr, z: pizzaAtZ + PIZZA_COUNTER.doughStack.zr, hx: 0.215, hz: 0.215 },
  { x: PIZZA_COUNTER.panStack.xr, z: pizzaAtZ + PIZZA_COUNTER.panStack.zr, hx: 0.26, hz: 0.26 },
  // 1台目の具材台の作業枠（3つ）
  ...WORK_FRAMES.slots.map((f) => ({ x: f.xr, z: counterZ(WORK_FRAMES.counter) + f.zr, hx: WORK_FRAMES.w / 2, hz: WORK_FRAMES.d / 2 })),
  // ストック容器（クック編 C5）
  ...Object.values(COOK_BIN_SPOTS).map((b) => ({ x: b.xr, z: counterZ(b.counter) + b.zr, hx: COOK_BIN.w / 2, hz: COOK_BIN.d / 2 })),
];

// ピザのお皿・鉄板（の山）を置ける台と、その範囲。置けない台（サラダ台・湯煎器の台）は null
export function propRange(surface: SurfaceId): typeof PROP_RANGE | null {
  return surface === 'left' ? PROP_RANGE : surface === 'prep' ? PROP_RANGE_PREP : null;
}

// 作業台（prep）の、もとから置いてある物に、半径 r の丸い物（中心が x, z）が重なるか
export function overlapsPrepFixture(x: number, z: number, r: number): boolean {
  return PREP_FIXTURES.some((f) => Math.abs(f.x - x) < f.hx + r && Math.abs(f.z - z) < f.hz + r);
}
