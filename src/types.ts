import type { Difficulty } from './difficulty';

export type IngredientId =
  | 'noodle' // 茹で上がった麺
  | 'penne'
  | 'tarakoSauce'
  | 'nori'
  | 'meatSauce'
  | 'cheese'
  | 'parsley'
  | 'tomatoSauce'
  | 'pancetta'
  | 'carbonaraSauce'
  | 'blackPepper'
  | 'garlic'
  | 'chili'
  | 'spinach'
  | 'sauteSauce'
  | 'saltOilSauce' // 塩オイルソース（ペペロンチーノ）
  | 'whiteSauce' // ホワイトソース（きのこのクリームパスタ）
  | 'squidInkSauce' // イカ墨ソース（イカスミのパスタ）
  | 'wakame'
  | 'garum' // ガルムソース（ボトル。蒸し鶏の香味ソース）
  | 'vegetablePaste' // 野菜ペースト（蒸し鶏の香味ソース）
  | 'squid'
  | 'mushroom'
  | 'saladBase'
  | 'shrimp'
  | 'chicken'
  | 'dressing'
  | 'paprika'
  | 'cornSoup';

// 手に持って、皿にかける・振るボトル。決まった台の上に自由に置ける（置ける台は bottle.ts）
export type BottleId = Extract<IngredientId, 'dressing' | 'paprika' | 'garum' | 'parsley' | 'blackPepper'>;

// 最初は冷蔵庫にしまってあるボトル（取り出してから、台の上に置く）
export type FridgeBottleId = Extract<BottleId, 'dressing' | 'paprika' | 'garum'>;

// 物を置ける台。salad = 右のサラダ台、left = IHの左の台、hotWater = 湯煎器の奥と右の台、prep = 作業台（オーブンの入口の先に並ぶ3台の具材台の天板。1つの面として扱う。ピザのお皿・鉄板だけが置ける）
export type SurfaceId = 'salad' | 'left' | 'hotWater' | 'prep';

// 台の上の置き場所。台の中心からの相対位置（x: 右、z: 手前）
export type TableSpot = { surface: SurfaceId; x: number; z: number };

// ボトルの置き場所。null = 台の上にない（手に持っている、または冷蔵庫にしまってある）
export type BottleSpot = TableSpot | null;

// 手に持ったボトル（または、台の上のどこにでも置ける容器）を、いま視点が合っている場所に置こうとしたときの様子（置く前の見せ方に使う）。
// valid = false のとき、reason は置けない理由（gap: ほかの物に近すぎる、surface: この台には置けない）
export type BottlePreview = {
  id: BottleId | FreeTrayId;
  surface: SurfaceId;
  x: number;
  z: number;
  valid: boolean;
  reason?: 'gap' | 'surface';
};

// 茹で麺器に入れる麺の種類（茹で上がると、同じ id の具材になる）
export type NoodleKind = Extract<IngredientId, 'noodle' | 'penne'>;

// 皿の種類。plate = パスタ・サラダの皿、small = ほうれん草のソテーの小皿、bowl = コーンスープのスープ皿、rim = 小エビのカクテル・蒸し鶏の香味ソースのリム小皿（茶色のふちの浅い皿）。
// 見た目の違いと、スープ皿にだけパックを入れられる、という違いだけ。提供の判定は中身だけで決まる
export type PlateStyle = 'plate' | 'small' | 'bowl' | 'rim';

// 冷蔵庫から取ってサラダ台に置くトレー・ケース。spinach = ほうれん草のトレー、saltOil = 塩オイルソースのパックが入ったケース、
// shrimp / chicken / pancetta / mushroom / wakame = 小エビ・サラダチキン・パンチェッタ・きのこ・わかめのトレー、vegPaste = 野菜ペーストのケース、sauteSauce / tomatoSauce = ソテーソース・トマトソースのパックが入ったケース。
// どれを置けるかは置き場の区画（TrayZone）で決まる（種類と区画の対応は tray.ts）
// garlic / chili = ガーリック・唐辛子のステンレスの容器。置き場（区画）はなく、ボトルと同じように台の上のどこにでも置ける（FreeTrayId）
export type TrayId =
  | 'spinach'
  | 'saltOil'
  | 'shrimp'
  | 'chicken'
  | 'pancetta'
  | 'mushroom'
  | 'wakame'
  | 'vegPaste'
  | 'sauteSauce'
  | 'tomatoSauce'
  | 'garlic'
  | 'chili';

// 台の上のどこにでも置ける容器（置き場の区画を持たないトレー・ケース）。置き場所は state.freeTraySpot
export type FreeTrayId = Extract<TrayId, 'garlic' | 'chili'>;

// トレー置き場の区画。spinach = ほうれん草のトレー専用の置き場、topping = ほうれん草以外のトレー・ケース（塩オイルソース・小エビ・チキン・パンチェッタ・きのこ・ソテーソース・トマトソース）のどれでも置ける置き場（縦2×横5の10か所）
export type TrayZone = 'spinach' | 'topping';

// 冷蔵庫の中の物（右クリックで持ち上げて、棚の好きな場所に置き直せる）。名前・大きさ・最初の置き場所は fridge.ts
export type FridgeItemId =
  | 'saladBase'
  | 'spinachTray'
  | 'meatSauce'
  | 'tomatoSauceCase'
  | 'carbonaraSauce'
  | 'penne'
  | 'cornSoup'
  | 'saltOilCase'
  | 'shrimpTray'
  | 'chickenTray'
  | 'pancettaTray'
  | 'squid' // イカ（冷蔵庫の中から直接取る。トレー置き場には置かない）
  | 'mushroomTray'
  | 'wakameTray'
  | 'vegPasteCase'
  | 'whiteSauce'
  | 'squidInkSauce'
  | 'sauteSauceCase'
  | 'garlicBin'
  | 'chiliBin'
  | 'dressingBottle'
  | 'paprikaBottle'
  | 'garumBottle';

// 冷蔵庫の棚の番号。0 = 最下段、1 = 下段、2 = 中段、3 = 上段
export type FridgeShelf = 0 | 1 | 2 | 3;

// 冷蔵庫は3台ある。0 = 最初からある冷蔵庫（物が入っている）、1 = 隣に増やした冷蔵庫、2 = さらに隣に増やした冷蔵庫（最初は空）。どれも同じ大きさで、棚の段数も同じ
export type FridgeUnit = 0 | 1 | 2;

// 冷蔵庫の中の置き場所。unit = どちらの冷蔵庫か。x, z は、その冷蔵庫の基準点（前面の中央）からの相対（x: 奥行き、z: 幅）
export type FridgeSpot = { unit: FridgeUnit; shelf: FridgeShelf; x: number; z: number };

// 持ち上げた物を、いま視点が合っている棚に置くとしたときの様子（置く前の見せ方に使う）
export type FridgePreview = { item: FridgeItemId; unit: FridgeUnit; shelf: FridgeShelf; x: number; z: number; valid: boolean };

export type BoilerState = 'empty' | 'set' | 'boiling' | 'lifted' | 'overdue' | 'shortBoil';

export type Boiler = {
  state: BoilerState;
  timer: number; // boiling/shortBoil: 残り茹で時間、lifted: 残り猶予
  noodle: NoodleKind; // かごに入れた麺の種類
};

// 熱湯に浸けて温めるパック（カルボナーラ・コーンスープ）。soak は浸けた累計秒数、一定時間を超えたら warm
export type Pack = {
  id: IngredientId;
  soak: number;
  warm: boolean;
};

export type PotHeat = 'cold' | 'heating' | 'ready'; // 未加熱 / 加熱中 / 加熱完了（焦げは未実装）

export type Pot = {
  contents: IngredientId[];
  heat: PotHeat;
  heatTimer: number; // heating: 残り加熱時間（秒）
  dirty: boolean; // 使用済み（具材を入れた）。洗浄機で洗うまで鍋置き場に戻せない
  mixCount: number; // 麺を入れたあと、混ぜたクリック数
  mixNeed: number; // 混ぜ終わるのに必要なクリック数（3回）
};

// 右クリックで投げた鍋。床や台に落ちて止まるまで動く。止まったら、左クリックで手に拾える。
// x, y, z は鍋の底の中心（y = 0 が床）。yaw は回転（rad）
export type ThrownPot = {
  id: number;
  pot: Pot;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  spin: number; // yaw の回転の速さ（rad/s）
  resting: boolean; // 止まっている
};

// 鍋洗浄機は1台・1個ずつ。dirty な鍋が入っている間が洗浄中、洗い終わると dirty が false になる
export type Washer = {
  pot: Pot | null;
  timer: number; // 洗浄の残り時間（秒）
};

// ジェットオーブン（ベルトコンベア式）の段。upper = 上段（短い時間で出てくる）、lower = 下段
export type OvenDeck = 'upper' | 'lower';

// 焼き皿（器）の種類。doria = ドリア皿（グラタン皿。長方形）、pizza = ピザの鉄板（丸い）、bakingPad = 焼成パッド（浅いステンレスの角バット）、
// largePad = 大きめの焼成パッド、hamburgPan = ハンバーグの鉄板（黒い楕円）、eggPan = 目玉焼き鉄板（黒い長方形にくぼみ2つ）、soupBowl = 鉄のスープ皿（黒い深い丸）。
// 寸法は「3列系」（ベルトに 流れの向きに2つ × 横に3つ）と「2列系」（2つ × 2つ）の2通りだけ。どの器がどちらかは layout.ts の BAKE_DISHES
export type BakeStyle = 'doria' | 'pizza' | 'bakingPad' | 'largePad' | 'hamburgPan' | 'eggPan' | 'soupBowl';

// 器の寸法の系統。three = 3列系、two = 2列系。ベルトのレーン・置き場の計算は、器の種類ではなく、この系統で決まる
export type BakeSeries = 'three' | 'two';

// 焼き皿の焼け具合。raw = 焼く前、half = 生焼け（もう一度焼けば焼き上がる）、baked = 焼き上がり（提供できる）、burnt = 焦げた（提供できない）。
// どれになるかは、いまの段階で焼いた秒数（cooked）と、品の表（bake.ts）のその段階の必要な時間で決まる（oven.ts の bakeState / bake.ts の stateFor）
export type BakeState = 'raw' | 'half' | 'baked' | 'burnt';

// --- 段階焼き（クック編設計書 4.1。品ごとの決まりは bake.ts の表）---
// 焼き皿にのせる物（新しい品の「中身」。ピザの生地・ソース・チーズ・モッツァレラは、既存の PizzaBuild から数える）
export type BakeLoadId =
  | 'dough' // ピザ生地
  | 'pizzaSauce' // ピザソース（1杯）
  | 'pizzaCheese' // ピザチーズ（1杯）
  | 'mozzarella' // モッツァレラ（1個を3つに分けた1つ分）
  | 'patty' // ハンバーグのパティ
  | 'chicken' // チキン
  | 'shrimp' // ポップコーンシュリンプ（1つ）
  | 'potato' // 下調理したポテト（1個）
  | 'corn' // コーン（1杯）
  | 'sausage'; // ソーセージ（1本）
// のせた物と数（省略・0 = のっていない）
export type BakeLoad = Partial<Record<BakeLoadId, number>>;
// 流す前に必要な手入れ。scrape = ヘラではがす
export type BakeCare = 'scrape';
// 焼いたあとの受け台。geta = 下駄（器ごと乗せる）、pizzaPlate = ピザのお皿（中身を移す）、board = 木の板（鉄板・スープ皿を器ごと乗せる）
export type BakeBase = 'geta' | 'pizzaPlate' | 'board';
// 焼いたあとの仕上げ（受け台のほか。ソースをかける・振る・のせる）
export type BakeFinishId = 'demiglace' | 'cheeseSauce' | 'vegetablePaste' | 'parsley' | 'cinnamon' | 'garlicSauce' | 'friedEgg';
// 焼き皿の進み具合。loaded = 中身（のせた物と数）、stage = いまの段階の番号（省略 = 0。1回目）、cares = 済ませた手入れ、finishes = 済ませた仕上げ（受け台のほか）。
// blank = 器の山から取った、空の器（焼く前の中身が入った山から取る品（ドリアなど）には当てはまらない。bake.ts の BakeDish.stock）。
// どれも省略 = まだ何もない（既存の2品は、どれも持たない）
export type BakeProgress = { loaded?: BakeLoad; stage?: number; cares?: BakeCare[]; finishes?: BakeFinishId[]; blank?: boolean };

// ベルトに乗っている皿。x = ベルトの中心から皿の中心までの横のずれ（m）、s = 入口の端から皿の中心までの距離（m）。
// cooked = いまの段階で、流す前までに焼いた秒数の合計（省略 = 0。今回の1周で出てくるまでの秒数は、まだ含まない）。
// 段階の進み具合（中身・段階・手入れ・仕上げ）は BakeProgress（省略 = 1回目で、何も足していない）
export type OvenDish = { id: number; style: BakeStyle; x: number; s: number; cooked?: number; pizza?: PizzaBuild } & BakeProgress;

// ピザ系の皿（鉄板）にのっている物。dough = ピザ生地、sauce = ピザソース（1杯）、cheese = ピザチーズ（1杯）、mozz = のっているモッツァレラチーズの数（0〜6。1個を3つ分に分けるので、2個で6つ）。
// 鉄板だけ（dough = false）から、生地 → ソース → チーズ → モッツァレラ の順に重ねる（pizza.ts）
export type PizzaBuild = { dough: boolean; sauce: boolean; cheese: boolean; mozz: number };

// ピザのお皿に入っている、焼き上がったピザ（鉄板は含まない）
// 段階の進み具合（BakeProgress）は、鉄板から移すときに引き継ぐ（既存のバッファローピザは持たない）
export type PlateDish = { pizza: PizzaBuild; state: BakeState } & BakeProgress;

// 台の上に置いたピザのお皿。spot = 置き場所、dish = 入っているピザ（空なら null）
export type PizzaPlate = { id: number; spot: TableSpot; dish: PlateDish | null };

// 台の上に積んだ、鉄板の山（使い終わった鉄板は、使う前の鉄板と同じ物）。spot = 置き場所、count = 枚数
export type PanPile = { spot: TableSpot; count: number };

// 手に持った物（ピザのお皿・空の鉄板・その山）を、台の上に置こうとしたときの様子（置く前の見せ方に使う）。
// x, z は台の中心からの相対位置、r は丸い物の半径。valid = false のとき、reason は置けない理由
// （gap: ほかの物に近すぎる、surface: この台には置けない、pile: 鉄板の山はもうある。そこに積む）
export type PropPreview = { what: 'plate' | 'pan' | 'panPile'; surface: SurfaceId; x: number; z: number; r: number; valid: boolean; reason?: 'gap' | 'surface' | 'pile' };

// ピザの具の取り出し元（作業台の容器）。sauce = 正方形の容器のピザソース、cheese = 長方形の容器のピザチーズ（どちらもレードルで1杯）、mozzarella = プラスチックの容器のモッツァレラチーズ（1個）
export type PizzaTopping = 'sauce' | 'cheese' | 'mozzarella';

export type Oven = {
  decks: Record<OvenDeck, OvenDish[]>;
  nextId: number;
};

// 手に持った焼き皿を入口のベルトに置こうとしたときの様子（置く前の見せ方に使う）。x, s は置かれる位置（ベルトの内側に収めたあと）。
// valid = false のとき、ほかの皿に重なるので置けない
export type OvenPreview = { deck: OvenDeck; style: BakeStyle; x: number; s: number; valid: boolean };

// 下駄の山を置き直そうとしたときの様子（置く前の見せ方に使う）。x, z は台の中心からの相対位置。
// valid = false のとき、reason は置けない理由（gap: ボトル・容器に近すぎる、surface: この台には置けない）
export type GetaPreview = { surface: SurfaceId; x: number; z: number; valid: boolean; reason?: 'gap' | 'surface' };

// 伝票の担当。pasta = パスタ台、salad = サラダ台、cook = クック（ジェットオーブンの焼き物：ドリア・ピザ）
export type Station = 'pasta' | 'salad' | 'cook';

// ゲームで選ぶポジション（担当する station の組み合わせ。表は position.ts）。heat = ヒート（パスタ・サラダ）、cook = クック（焼き物だけ）、all = 通し（全部）。
// 練習キッチンは常に all
export type Position = 'heat' | 'cook' | 'all';

export type Ticket = {
  id: number; // レール上の識別用
  menuId: string;
  arrivedAt: number; // ゲーム内時刻（秒）
  station: Station;
};

// 手に持てるのは1つだけ。中身リストを持つ器は皿（鍋・サラダ器は今後追加）
export type Item =
  | { kind: 'rawNoodle'; id: NoodleKind } // 生麺（スパゲッティ）か、ペンネ
  | { kind: 'ingredient'; id: IngredientId }
  | { kind: 'plate'; contents: IngredientId[]; style?: PlateStyle } // style 省略 = plate
  | { kind: 'pack'; packs: Pack[] } // 熱湯で温めてから使うパック。同じ種類を重ねて持てる（コーンスープは最大5つ）
  | { kind: 'tray'; id: TrayId } // 冷蔵庫から取ったトレー・ケース（ほうれん草・塩オイルソース・小エビ・チキン・パンチェッタ・イカ・きのこ・ソテーソース）
  | { kind: 'bottle'; id: BottleId } // ドレッシング・パプリカパウダー・パセリ。右クリックで皿にかける・振る（なくならない）
  | { kind: 'pot'; pot: Pot }
  | { kind: 'ipad' } // 練習キッチンの壁にかかっている iPad。右クリックで画面を開く（ゲーム開始・レシピ）
  | ({ kind: 'bakeDish'; style: BakeStyle; cooked: number; state: BakeState; geta?: boolean; board?: boolean; pizza?: PizzaBuild } & BakeProgress) // ジェットオーブンで焼く皿（ドリア系 = 長方形、ピザ系 = 丸）。cooked = いまの段階で焼いた秒数の合計、state = その焼け具合（oven.ts の bakeItem で作る）。geta = 下駄（木の台）に乗せてある（受け台が下駄の品の焼き上がりだけ。提供できる形）。中身・段階・手入れ・仕上げは BakeProgress（bake.ts）
  | { kind: 'geta' } // ドリアの下にひく下駄（木の台）1枚。焼き上がったドリアに左クリックで、ドリアを乗せられる
  | { kind: 'board' } // 鉄板・スープ皿の下にひく木の板1枚（受け台。下駄と同じく、焼き上がった器を器ごと乗せる。board = true の焼き皿になる）
  | { kind: 'pizzaDough' } // ピザ生地1枚。ピザの鉄板にセットする
  | { kind: 'pizzaTopping'; id: PizzaTopping } // ピザソース・ピザチーズ（レードル1杯）、モッツァレラチーズ（1個）。ピザ組み立て台の鉄板にのせる
  | { kind: 'pizzaPlate'; dish?: PlateDish } // ピザのお皿1枚（焼き上がったピザが入っていることもある）。台に置いて、焼き上がったピザを入れる。ピザの入ったお皿は、提供台に出せる
  | { kind: 'panPile'; count: number }; // 右クリックで持ち上げた、積んだ鉄板の山。台に置き直す・作業台の鉄板のスタックに戻す

// 作業枠に置ける物：3列系の焼き皿（受け台に乗せた物も）・下駄・板・小皿（どれが置けるかの決まりは game.ts の fitsWorkFrame）
export type WorkFrameItem = Extract<Item, { kind: 'bakeDish' | 'geta' | 'board' | 'plate' }>;

// 視点の先にあるクリック可能な設備
export type Target =
  | { kind: 'noodleRack' }
  | { kind: 'plateStack'; style?: PlateStyle } // 皿の山。style 省略 = plate（小皿・スープ皿の山もある）
  | { kind: 'stock'; id: IngredientId; inFridge?: boolean } // クリックで手に取れる取り出し元（缶・パック・トッピングなど）。inFridge は冷蔵庫の中（扉が開いている間だけ取れる）
  | { kind: 'fridgeDoor'; unit?: FridgeUnit } // 冷蔵庫（扉・本体）。右クリックで開閉。unit 省略 = 0（最初からある冷蔵庫）
  | { kind: 'fridgeShelf'; unit?: FridgeUnit; shelf: FridgeShelf; x: number; z: number } // 冷蔵庫の棚板。x, z は視点が合っている点（その冷蔵庫の基準点からの相対）。物を置き直す場所を選ぶ。unit 省略 = 0
  | { kind: 'fridgeTray'; id: TrayId } // 冷蔵庫の中のトレー・ケース（扉が開いている間だけ取れる）
  | { kind: 'traySlot'; id: TrayZone; spot?: number } // サラダ台の上のトレー置き場。置いたものから、中身を1回分ずつ取れる。同じ区画の置き場が複数ある（id = 区画、spot = その番号、省略 = 0）
  | { kind: 'fridgeBottle'; id: FridgeBottleId } // 冷蔵庫の中のボトル（ドレッシング・パプリカパウダー。扉が開いている間だけ取れる）
  | { kind: 'tableTray'; id: FreeTrayId } // 台の上に置いた容器（ガーリック・唐辛子）。左クリックで1杯すくう、右クリックで持ち上げる
  | { kind: 'boilerBasket'; index: number }
  | { kind: 'boilerButton'; index: number }
  | { kind: 'plateSlot'; index: number }
  | { kind: 'servePass' }
  | { kind: 'potSlot'; index: number } // 鍋置き場の1か所
  | { kind: 'thrownPot'; id: number } // 投げて床・台に落ちている鍋（左クリックで拾う）
  | { kind: 'ihBurner'; index: number }
  | { kind: 'hotWaterSlot'; index: number } // 熱湯に浸けるパックの置き場所
  | { kind: 'ovenStock'; style: BakeStyle; dish?: string } // 具材台の焼き皿の山（クリックで手に取る）。doria = ドリアの山（焼く前のドリア。dish = どの品の山か。省略 = ミラノドリア）、pizza = 開発時だけ出す、テスト用のピザ系の皿の山
  | { kind: 'vesselStack'; style: BakeStyle } // 具材台の下の棚の、空の器の山（空のドリア皿・焼成パッド・鉄板・スープ皿など。左クリックで1枚取る、同じ空の器を持っていれば戻す）
  | { kind: 'workFrame'; index: number } // 1台目の具材台の作業枠（3つ）。3列系の器・受け台（下駄・板）・小皿を置いて、盛り付け・仕上げをする
  | { kind: 'boardStack' } // 提供台の左の、木の板（鉄板用の受け台）の山（左クリックで1枚取る）
  | { kind: 'pizzaDoughStack' } // 作業台のピザ生地のスタック（左クリックで1枚取る）
  | { kind: 'pizzaPanStack' } // 作業台のピザの鉄板のスタック（左クリックで1枚取る。生地を持っていれば、生地をのせた鉄板になる）
  | { kind: 'pizzaSource'; id: PizzaTopping } // ピザソース・ピザチーズ・モッツァレラチーズの容器（左クリックで取る）
  | { kind: 'pizzaPlateStack' } // 提供台の左のピザのお皿の山（左クリックで1枚取る）
  | { kind: 'pizzaPlate'; id: number } // 台の上に置いたピザのお皿（左クリックで、焼き上がったピザを入れる・持ち上げる）
  | { kind: 'panPile' } // 台の上の、使い終わった鉄板の山（左クリックで鉄板を積む、右クリックで山ごと持ち上げる）
  | { kind: 'pizzaSlot'; index: number } // ピザ組み立て台（鉄板を置いて、生地・ソース・チーズ・モッツァレラをのせる）
  | { kind: 'getaStack' } // 提供台の左の下駄の山（左クリックで1枚取る、右クリックで持ち上げて置き直す）
  | { kind: 'ovenInlet'; deck: OvenDeck; x: number; s: number } // ジェットオーブンの入口のベルト（段）。x, s は視点が合っている点（x: ベルトの中心からの横のずれ、s: 入口の端からの距離）。皿を置くと流れていく
  | { kind: 'ovenOutlet'; deck: OvenDeck; lane: number } // ジェットオーブンの出口。出てきた皿を取る
  | { kind: 'bottle'; id: BottleId } // 台の上のボトル
  | { kind: 'tableTop'; surface: SurfaceId; x: number; z: number } // 台の天板。x, z は視点が合っている点（台の中心からの相対）
  | { kind: 'washer' }
  | { kind: 'ipadWall' }; // 後ろの壁にかかっている iPad（練習中だけ。左クリックで手に取る・壁に戻す）

// ready = ゲーム開始前の操作説明（クリックで始まる。時間は進まない）
export type Phase = 'title' | 'ready' | 'playing' | 'paused' | 'result';

export type Toast = {
  text: string;
  kind: 'good' | 'bad' | 'info';
  expiresAt: number; // ゲーム内時刻
};

// practice = 練習キッチン（時間制限なし。操作を覚える・気軽に料理する）、game = 本番（5分間のタイムアタック）
export type Mode = 'practice' | 'game';

// チュートリアルの進み具合。step = いま取り組んでいる工程の番号（total になったら完了）。工程の中身は tutorial.ts
export type TutorialProgress = { menuId: string; step: number; total: number };

export type GameState = {
  phase: Phase;
  mode: Mode;
  difficulty: Difficulty | null; // ゲームの難易度（iPad で選ぶ）。練習キッチンは null
  position: Position; // ポジション（iPad で選ぶ。届く伝票の担当が決まる）。ゲームの既定は heat、練習キッチンは常に all
  ipadOpen: boolean; // iPad の画面を開いている間（マウスのカーソルが出て、視点は動かせない）
  tutorial: TutorialProgress | null; // チュートリアル中（練習キッチンで、選んだメニューを作り方の案内つきで作る）。なければ null
  time: number; // 経過時間（秒）
  hand: Item | null;
  boilers: Boiler[];
  plateSlots: (IngredientId[] | null)[]; // 皿の置き場。左の台（plateSlotCount 個）→ サラダ台（saladSlotCount 個）の順。null = 皿なし
  plateStyles: PlateStyle[]; // plateSlots と同じ並び。置いてある皿の種類
  trays: Record<TrayId, 'fridge' | 'hand' | 'table'>; // トレー・ケースの場所（冷蔵庫 / 手 / サラダ台）
  traySpot: Record<TrayId, number>; // サラダ台に置いてあるとき、その区画の何番目の置き場か（同じ区画の置き場が複数ある）
  freeTraySpot: Record<FreeTrayId, TableSpot>; // 台の上のどこにでも置ける容器の置き場所（trays が 'table' のときだけ意味がある）
  fridgeOpen: [boolean, boolean, boolean]; // 冷蔵庫の扉（添字 = FridgeUnit。最初はどれも閉まっている）
  fridgeItems: Record<FridgeItemId, FridgeSpot>; // 冷蔵庫の中の物の置き場所（トレー・ケースは、取ったあとは使わない）
  moving: FridgeItemId | null; // 右クリックで持ち上げている最中の物（手とは別。棚に右クリックで置く）
  pizzaPanStock: number; // 作業台の鉄板のスタックの残り枚数（最初は config の pizzaPanCount。0 になったら、使い終わった鉄板を戻せる）
  panPile: PanPile | null; // 台の上に積んだ、使い終わった鉄板の山
  pizzaPlates: PizzaPlate[]; // 台の上に置いたピザのお皿
  pizzaSlots: (Extract<Item, { kind: 'bakeDish' }> | null)[]; // ピザ組み立て台（作業台）に置いた鉄板。null = 空き
  getaSpot: TableSpot; // 下駄の山の置き場所（提供台の左）
  getaMoving: boolean; // 下駄の山を右クリックで持ち上げている最中（手とは別。台に右クリックで置く）
  workFrames: (WorkFrameItem | null)[]; // 1台目の具材台の作業枠（3つ。layout.ts の WORK_FRAMES）。置いてある物、null = 空き
  bottles: Record<BottleId, BottleSpot>; // 台の上のボトル
  bottleShakeAt: number | null; // 手に持ったボトルを最後に振った（かけた）ゲーム内時刻。振る動きの表示に使う
  hotWater: (Pack | null)[]; // 熱湯に浸けているパック（3×3の9か所、左上から横に数える）。null = 空き
  potSlots: (Pot | null)[]; // 鍋置き場。null = 空き
  ihBurners: (Pot | null)[];
  thrownPots: ThrownPot[]; // 投げた鍋（飛んでいる最中、または床・台に落ちている）
  washer: Washer;
  oven: Oven; // ジェットオーブン（ベルトに乗っている皿）
  tickets: Ticket[];
  nextTicketAt: number;
  nextTicketId: number;
  score: number;
  combo: number;
  maxCombo: number;
  served: number;
  mistakes: number;
  toast: Toast | null;
};
