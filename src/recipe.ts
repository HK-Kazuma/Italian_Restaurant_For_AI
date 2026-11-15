import type { IngredientId, Station, Ticket } from './types';

// 完成の形。plate = 皿（中身の具材で判定する）、bake = 焼き物（ジェットオーブンで焼く品。どの品かは bake.ts の表を id で引き、提供の判定もその表で行う）
export type MenuForm = 'plate' | 'bake';

export type MenuItem = {
  id: string;
  name: string;
  station: Station;
  category: MenuCategory; // 分類（iPad のレシピ・チュートリアルの一覧のタブ。分類の表は MENU_CATEGORIES）
  no?: string; // 番号（4桁。省略可。実際の番号に合わせるかは未定のため、いまはどの品も省略）
  note?: string; // 一言（一覧のカードに出す。省略すると、焼き物は bake.ts の表から焼き方の要約を作る）
  form?: MenuForm; // 完成の形（省略 = plate）
  ingredients: IngredientId[]; // 完成品の中身（順序なし。同じ物は個数分並べる）。焼き物（form が bake）は空（中身は bake.ts の表）
  ticketItems?: string[]; // 伝票に出す材料名の並び（焼き物用。皿の品は ingredients から作る）
  sauce?: IngredientId[]; // このうち、鍋に入れて加熱する分（既定のソース）。鍋がこの中身になったら、IHで加熱が始まる
  steps: string[]; // 作り方（iPad のレシピに出す）
  basePoints: number;
  enabled: boolean; // false の間は伝票に出ない（必要な設備が未実装）
};

// 分類（クック編設計書 4.9）。クック：前菜 / 肉料理 / ピザ / ドリア＆グラタン / スープ / 焼きたてパン、ヒート：パスタ / サラダ・前菜 / スープ。
// スープはヒートとクックで別の分類（heatSoup・cookSoup）。どの分類をどのポジションの一覧に出すかは、分類の品の station で決める（menuList.ts）
export type MenuCategory = 'pasta' | 'heatStarter' | 'heatSoup' | 'cookStarter' | 'meat' | 'pizza' | 'doriaGratin' | 'cookSoup' | 'bread';

export type MenuCategoryDef = {
  id: MenuCategory;
  name: string; // 見出し・タブの名前
  en: string; // 見出しの小さな英字
  color: string; // サムネのプレースホルダ（色の四角）の色
};

// 一覧に出す順（ヒート → クック）
export const MENU_CATEGORIES: readonly MenuCategoryDef[] = [
  { id: 'pasta', name: 'パスタ', en: 'PASTA', color: '#d9824b' },
  { id: 'heatStarter', name: 'サラダ・前菜', en: 'SALAD & STARTER', color: '#7fae5a' },
  { id: 'heatSoup', name: 'スープ', en: 'SOUP', color: '#e3b84f' },
  { id: 'cookStarter', name: '前菜', en: 'STARTER', color: '#c9a36b' },
  { id: 'meat', name: '肉料理', en: 'GRILL', color: '#9a5a3c' },
  { id: 'pizza', name: 'ピザ', en: 'PIZZA', color: '#d65a3f' },
  { id: 'doriaGratin', name: 'ドリア＆グラタン', en: 'DORIA & GRATIN', color: '#e0a64a' },
  { id: 'cookSoup', name: 'スープ', en: 'SOUP', color: '#e8c86a' },
  { id: 'bread', name: '焼きたてパン', en: 'BAKERY', color: '#c8955a' },
];

// 要件定義書「メニューとレシピ」の品（enabled: false にすると、その品は伝票に出ない）
export const MENU: MenuItem[] = [
  {
    id: 'tarako',
    name: 'たらこのパスタ',
    station: 'pasta',
    category: 'pasta',
    ingredients: ['noodle', 'tarakoSauce', 'nori'],
    steps: [
      "皿に、茹で上がった麺を盛る",
      "たらこソースのパックを麺にかける",
      "刻みのりをかける",
      "提供台へ（鍋・IHは使いません）",
    ],
    basePoints: 30,
    enabled: true,
  },
  {
    id: 'meat',
    name: 'ミートパスタ',
    station: 'pasta',
    category: 'pasta',
    ingredients: ['noodle', 'meatSauce', 'meatSauce', 'cheese', 'parsley'],
    sauce: ['meatSauce', 'meatSauce'],
    steps: [
      "冷蔵庫のミートソース缶から、お玉2杯を鍋に入れる",
      "鍋をIHにセットして加熱",
      "麺が上がったら、加熱した鍋に麺を入れて混ぜる",
      "皿に盛り、粉チーズ1杯とパセリを振る",
    ],
    basePoints: 50,
    enabled: true,
  },
  {
    id: 'parma',
    name: 'パルマ風パスタ',
    station: 'pasta',
    category: 'pasta',
    ingredients: ['noodle', 'tomatoSauce', 'pancetta', 'cheese'],
    sauce: ['tomatoSauce', 'pancetta'],
    steps: [
      "冷蔵庫からパンチェッタのトレーを出して、サラダ台のトレー置き場に置く",
      "冷蔵庫のトマトソースのパック1つと、パンチェッタ1掴みを鍋に入れる",
      "鍋をIHにセットして加熱",
      "麺が上がったら、加熱した鍋に麺を入れて混ぜる",
      "皿に盛り、粉チーズ1杯を振る",
    ],
    basePoints: 50,
    enabled: true,
  },
  {
    id: 'peperoncino',
    name: 'ペペロンチーノ',
    station: 'pasta',
    category: 'pasta',
    ingredients: ['noodle', 'saltOilSauce', 'garlic', 'chili', 'parsley'],
    sauce: ['saltOilSauce', 'garlic', 'chili'],
    steps: [
      "冷蔵庫から塩オイルソースのケースを出して、サラダ台に置く",
      "塩オイルソース1杯、ガーリック1杯、唐辛子1杯を鍋に入れる",
      "鍋をIHにセットして加熱",
      "麺が上がったら、皿に麺を盛る",
      "鍋のソースをかけ、パセリを振る",
    ],
    basePoints: 50,
    enabled: true,
  },
  {
    id: 'carbonara',
    name: 'カルボナーラ',
    station: 'pasta',
    category: 'pasta',
    ingredients: ['noodle', 'carbonaraSauce', 'cheese', 'blackPepper'],
    sauce: ['carbonaraSauce'],
    steps: [
      "冷蔵庫からカルボナーラのパックを取る",
      "茹で麺器の左の熱湯に3秒以上つけて、余温めする",
      "余温めしたパックを鍋に入れて、IHで加熱",
      "麺が上がったら、皿に麺を盛る",
      "鍋のソースをかけ、粉チーズ1杯とブラックペッパーを振る",
    ],
    basePoints: 50,
    enabled: true,
  },
  {
    id: 'penne',
    name: 'ペンネアラビアータ',
    station: 'pasta',
    category: 'pasta',
    ingredients: ['penne', 'tomatoSauce', 'garlic', 'chili', 'parsley'],
    sauce: ['tomatoSauce', 'garlic', 'chili'],
    steps: [
      "冷蔵庫からペンネを取り、茹で麺器に麺と同じようにセットして茹でる",
      "鍋にトマトソース1杯、ガーリック1杯、唐辛子1杯を入れる",
      "鍋をIHにセットして加熱",
      "ペンネが上がったら、加熱した鍋に入れて混ぜる",
      "皿に盛り、パセリを振る",
    ],
    basePoints: 50,
    enabled: true,
  },
  {
    id: 'squidInk',
    name: 'イカスミのパスタ',
    station: 'pasta',
    category: 'pasta',
    ingredients: ['noodle', 'squidInkSauce', 'squid', 'parsley'],
    sauce: ['squidInkSauce', 'squid'],
    steps: [
      "右側の冷蔵庫の中から、イカ墨ソースのパック1つと、イカ1掴み（トング）を、そのまま取って鍋に入れる",
      "鍋をIHにセットして加熱",
      "麺が上がったら、加熱した鍋に麺を入れて混ぜる",
      "皿に盛り、パセリを振る",
    ],
    basePoints: 50,
    enabled: true,
  },
  {
    id: 'mushroomCream',
    name: 'きのこのクリームパスタ',
    station: 'pasta',
    category: 'pasta',
    ingredients: ['noodle', 'whiteSauce', 'spinach', 'pancetta', 'mushroom', 'saltOilSauce', 'cheese', 'blackPepper'],
    sauce: ['whiteSauce', 'spinach', 'pancetta', 'mushroom', 'saltOilSauce'],
    steps: [
      "右側の冷蔵庫のホワイトソース缶から、お玉1杯を鍋に入れる",
      "ほうれん草・パンチェッタ・きのこを1掴みずつ、塩オイルソースを1杯、鍋に入れる（トレー・ケースは冷蔵庫から出して、サラダ台に置く）",
      "鍋をIHにセットして加熱",
      "麺が上がったら、皿に麺を盛る",
      "鍋のソースをかけ、粉チーズ1杯とブラックペッパーを振る",
    ],
    basePoints: 50,
    enabled: true,
  },
  {
    id: 'spinach',
    name: 'ほうれん草のソテー',
    station: 'pasta',
    category: 'heatStarter',
    ingredients: ['spinach', 'spinach', 'pancetta', 'sauteSauce'],
    sauce: ['spinach', 'spinach', 'pancetta', 'sauteSauce'],
    steps: [
      "冷蔵庫からほうれん草のトレー、パンチェッタのトレー、ソテーソースのケースを取り、サラダ台の置き場に置く",
      "トングでほうれん草を2掴み、鍋に入れる",
      "パンチェッタ1掴みと、ソテーソースのパックを鍋に入れる",
      "鍋をIHにセットして加熱",
      "加熱が終わったら混ぜる",
      "パスタ皿の横にある小さめの皿に盛る",
    ],
    basePoints: 30,
    enabled: true,
  },
  {
    id: 'shrimpSalad',
    name: '小エビのサラダ',
    station: 'salad',
    category: 'heatStarter',
    ingredients: ['saladBase', 'shrimp', 'dressing', 'paprika'],
    steps: [
      "冷蔵庫からサラダベースを取り、サラダ台に置く",
      "冷蔵庫から小エビのトレーを出して、サラダ台のトレー置き場に置く",
      "トレーの小エビをお玉1杯、サラダに盛る",
      "ドレッシングをかける",
      "パプリカパウダーを振る",
    ],
    basePoints: 10,
    enabled: true,
  },
  {
    id: 'chickenSalad',
    name: 'チキンのサラダ',
    station: 'salad',
    category: 'heatStarter',
    ingredients: ['saladBase', 'chicken', 'dressing', 'paprika'],
    steps: [
      "冷蔵庫からサラダベースを取り、サラダ台に置く",
      "冷蔵庫からサラダチキンのトレーを出して、サラダ台のトレー置き場に置く",
      "トレーのサラダチキンをトング1掴み、サラダに盛る",
      "ドレッシングをかける",
      "パプリカパウダーを振る",
    ],
    basePoints: 10,
    enabled: true,
  },
  {
    id: 'wakameSalad',
    name: 'わかめのサラダ',
    station: 'salad',
    category: 'heatStarter',
    ingredients: ['saladBase', 'wakame', 'wakame', 'dressing', 'paprika'],
    steps: [
      "冷蔵庫からサラダベースを取り、サラダ台に置く",
      "右側の冷蔵庫からわかめのトレーを出して、サラダ台のトレー置き場に置く",
      "トレーのわかめをトング2掴み、サラダに盛る",
      "ドレッシングをかける",
      "パプリカパウダーを振る",
    ],
    basePoints: 10,
    enabled: true,
  },
  {
    id: 'shrimpCocktail',
    name: '小エビのカクテル',
    station: 'salad',
    category: 'heatStarter',
    ingredients: ['wakame', 'shrimp', 'shrimp', 'dressing', 'paprika'],
    steps: [
      "リム小皿をサラダ台に置く",
      "冷蔵庫から小エビのトレー、右側の冷蔵庫からわかめのトレーを出して、サラダ台のトレー置き場に置く",
      "トレーのわかめをトング1掴み、小皿に入れる",
      "小エビをお玉2杯、盛る",
      "ドレッシングをかける",
      "パプリカパウダーを振る",
    ],
    basePoints: 20,
    enabled: true,
  },
  {
    id: 'steamedChicken',
    name: '蒸し鶏の香味ソース',
    station: 'salad',
    category: 'heatStarter',
    ingredients: ['wakame', 'chicken', 'chicken', 'vegetablePaste', 'garum'],
    steps: [
      "リム小皿をサラダ台に置く",
      "右側の冷蔵庫からわかめのトレー・野菜ペーストのケースを、冷蔵庫からサラダチキンのトレーを出して、サラダ台のトレー置き場に置く",
      "トレーのわかめをトング1掴み、小皿に入れる",
      "サラダチキンをトング2掴み、盛る",
      "野菜ペーストをお玉1杯、かける",
      "ガルムソースをかける",
    ],
    basePoints: 20,
    enabled: true,
  },
  {
    id: 'cornSoup',
    name: 'コーンスープ',
    station: 'salad',
    category: 'heatSoup',
    ingredients: ['cornSoup'],
    steps: [
      "冷蔵庫からコーンスープのパックを取る（クリックした回数だけ、最大5つ持てる）",
      "茹で麺器の左の熱湯に5秒以上つけて温める",
      "サラダ台の上のスープ皿を取り、サラダ台に置く",
      "温めたパックをスープ皿に入れて完成",
    ],
    basePoints: 10,
    enabled: true,
  },
  // --- クック（ジェットオーブンの焼き物）。段階・中身・仕上げと完成の判定は bake.ts の表（同じ id の行）---
  {
    id: 'milanoDoria',
    name: 'ミラノドリア',
    station: 'cook',
    category: 'doriaGratin',
    form: 'bake',
    ingredients: [],
    ticketItems: ['ドリア（下段で焼き上げ）', '下駄'],
    steps: [
      "具材台の棚のドリアスタックから、ドリアの皿を1枚取る",
      "ジェットオーブンの下段の入口に流す（上段では生焼けになる）",
      "提供台の左の下駄の山から下駄を1枚取り、出口に出てきたドリアに左クリックで乗せる",
      "下駄に乗ったドリアを提供台へ（生焼け・焦げ・下駄なしは出せない）",
    ],
    basePoints: 30,
    enabled: true,
  },
  {
    id: 'buffaloPizza',
    name: 'バッファローピザ',
    station: 'cook',
    category: 'pizza',
    form: 'bake',
    ingredients: [],
    ticketItems: ['ピザ生地', 'ピザソース', 'ピザチーズ', 'モッツァレラ×2'],
    steps: [
      "提供台の左のピザのお皿を1枚取り、台の上に置いておく",
      "ピザ生地を1枚取り、ピザの鉄板のスタックをクリックして鉄板にのせ、組み立て台に置く",
      "ピザソース1杯 → ピザチーズ1杯 → モッツァレラチーズ2個（1個で3つ分）の順にのせる",
      "鉄板を持ち上げて、ジェットオーブンの上段の入口に流す",
      "出口から焼き上がったピザを取り、台の上のお皿に入れる（鉄板はスタックに戻す）",
      "ピザの入ったお皿を持ち上げて、提供台へ",
    ],
    basePoints: 50,
    enabled: true,
  },
  // --- クック編 C3 の6品（2026-11-14 に有効化。既存品の並びは変えず、末尾に足した）---
  {
    id: 'cheeseMilanoDoria',
    name: '焼きチーズミラノドリア',
    station: 'cook',
    category: 'doriaGratin',
    form: 'bake',
    ingredients: [],
    ticketItems: ['ドリア（下段で焼き上げ）', '下駄', 'パセリ'],
    steps: [
      "具材台の棚の「焼きチーズミラノドリア」の山から、皿を1枚取る（ラベルを見て取る）",
      "ジェットオーブンの下段の入口に流す（上段では生焼けになる）",
      "提供台の左の下駄の山から下駄を1枚取り、出口に出てきたドリアに左クリックで乗せる",
      "下駄に乗ったドリアを作業枠に置き、パセリのボトルを取って右クリックで1回振る（2回以上振ると注文ミス）",
      "下駄に乗ったドリアを提供台へ（生焼け・焦げ・下駄なしは出せない）",
    ],
    basePoints: 30,
    enabled: true,
  },
  {
    id: 'tarakoDoria',
    name: 'たらこのドリア',
    station: 'cook',
    category: 'doriaGratin',
    form: 'bake',
    ingredients: [],
    ticketItems: ['ドリア（下段で焼き上げ）', '下駄'],
    steps: [
      "具材台の棚の「たらこのドリア」の山から、皿を1枚取る（ラベルを見て取る）",
      "ジェットオーブンの下段の入口に流す（上段では生焼けになる）",
      "提供台の左の下駄の山から下駄を1枚取り、出口に出てきたドリアに左クリックで乗せる",
      "下駄に乗ったドリアを提供台へ（生焼け・焦げ・下駄なしは出せない）",
    ],
    basePoints: 30,
    enabled: true,
  },
  {
    id: 'tarakoGratin',
    name: 'たらこのグラタン',
    station: 'cook',
    category: 'doriaGratin',
    form: 'bake',
    ingredients: [],
    ticketItems: ['ドリア（下段で焼き上げ）', '下駄'],
    steps: [
      "具材台の棚の「たらこのグラタン」の山から、皿を1枚取る（ラベルを見て取る）",
      "ジェットオーブンの下段の入口に流す（上段では生焼けになる）",
      "提供台の左の下駄の山から下駄を1枚取り、出口に出てきたドリアに左クリックで乗せる",
      "下駄に乗ったドリアを提供台へ（生焼け・焦げ・下駄なしは出せない）",
    ],
    basePoints: 30,
    enabled: true,
  },
  {
    id: 'vegMushroomPizza',
    name: '野菜ときのこのピザ',
    station: 'cook',
    category: 'pizza',
    form: 'bake',
    ingredients: [],
    ticketItems: ['ピザ生地', 'ピザソース', 'ピザチーズ', '野菜ときのこ'],
    steps: [
      "提供台の左のピザのお皿を1枚取り、台の上に置いておく",
      "ピザ生地を1枚取り、ピザの鉄板のスタックをクリックして鉄板にのせ、組み立て台に置く",
      "ピザソース1杯 → ピザチーズ1杯 → 野菜ときのこ1杯（モッツァレラの隣の容器）の順にのせる（具は1種類だけ）",
      "鉄板を持ち上げて、ジェットオーブンの上段の入口に流す",
      "出口から焼き上がったピザを取り、台の上のお皿に入れる（鉄板はスタックに戻す）",
      "ピザの入ったお皿を持ち上げて、提供台へ",
    ],
    basePoints: 50,
    enabled: true,
  },
  {
    id: 'sausagePizza',
    name: 'ソーセージピザ',
    station: 'cook',
    category: 'pizza',
    form: 'bake',
    ingredients: [],
    ticketItems: ['ピザ生地', 'ピザソース', 'ピザチーズ', 'ソーセージ'],
    steps: [
      "提供台の左のピザのお皿を1枚取り、台の上に置いておく",
      "ピザ生地を1枚取り、ピザの鉄板のスタックをクリックして鉄板にのせ、組み立て台に置く",
      "ピザソース1杯 → ピザチーズ1杯 → ソーセージ1杯（モッツァレラの隣の容器）の順にのせる（具は1種類だけ）",
      "鉄板を持ち上げて、ジェットオーブンの上段の入口に流す",
      "出口から焼き上がったピザを取り、台の上のお皿に入れる（鉄板はスタックに戻す）",
      "ピザの入ったお皿を持ち上げて、提供台へ",
    ],
    basePoints: 50,
    enabled: true,
  },
  {
    id: 'cornPizza',
    name: 'コーンピザ',
    station: 'cook',
    category: 'pizza',
    form: 'bake',
    ingredients: [],
    ticketItems: ['ピザ生地', 'ピザソース', 'ピザチーズ', 'コーン'],
    steps: [
      "提供台の左のピザのお皿を1枚取り、台の上に置いておく",
      "ピザ生地を1枚取り、ピザの鉄板のスタックをクリックして鉄板にのせ、組み立て台に置く",
      "ピザソース1杯 → ピザチーズ1杯 → コーン1杯（モッツァレラの隣の容器）の順にのせる（具は1種類だけ）",
      "鉄板を持ち上げて、ジェットオーブンの上段の入口に流す",
      "出口から焼き上がったピザを取り、台の上のお皿に入れる（鉄板はスタックに戻す）",
      "ピザの入ったお皿を持ち上げて、提供台へ",
    ],
    basePoints: 50,
    enabled: true,
  },  // --- クック編 C6：前菜4品・フォッカチオ5品（2026-11-14。既存品の並びは変えず、末尾に足した。手順・仕上げは bake.ts の表）---
  {
    id: 'popcornShrimp',
    name: 'ポップコーンシュリンプ',
    station: 'cook',
    category: 'cookStarter',
    form: 'bake',
    ingredients: [],
    ticketItems: ['シュリンプ×9（焼成パッド）', '上段1周', '小皿'],
    steps: [
      "具材台の棚から焼成パッドを1枚取り、1台目の具材台の作業枠に置く",
      "吊り棚のポップコーンシュリンプの袋を9回クリックして9つ持ち、作業枠のパッドに入れる",
      "パッドを持ち上げて、ジェットオーブンの上段の入口に流す",
      "出口から取ったパッドを、作業枠に置いた小皿（提供台の左の小皿の山から取る）に左クリックで移す（空いたパッドは棚に戻す）",
      "小皿を持ち上げて、提供台へ",
    ],
    basePoints: 30,
    enabled: true,
  },
  {
    id: 'potatoGrill',
    name: 'ポテトのグリル',
    station: 'cook',
    category: 'cookStarter',
    form: 'bake',
    ingredients: [],
    ticketItems: ['ポテト×8（ドリア皿）', '上段1周', '下駄'],
    steps: [
      "具材台の棚から空のドリア皿を1枚取り、1台目の具材台の作業枠に置く",
      "ストック容器の下調理したポテトを8個取り（8回クリック）、作業枠の皿に入れる（横4 × 縦2に並ぶ）",
      "皿を持ち上げて、ジェットオーブンの上段の入口に流す",
      "下駄を取り、出口に出てきた皿に左クリックで乗せる",
      "下駄に乗った皿を提供台へ",
    ],
    basePoints: 30,
    enabled: true,
  },
  {
    id: 'chorizo',
    name: 'チョリソー',
    station: 'cook',
    category: 'cookStarter',
    form: 'bake',
    ingredients: [],
    ticketItems: ['ソーセージ×5・ポテト×2（ドリア皿）', '上段1周', '下駄'],
    steps: [
      "具材台の棚から空のドリア皿を1枚取り、1台目の具材台の作業枠に置く",
      "吊り棚のチョリソーの袋を5回クリックして、作業枠の皿に入れる（縦向きで横に並ぶ）",
      "ストック容器の下調理したポテトを2個取り、皿に入れる（ソーセージの横に並ぶ）",
      "皿を持ち上げて、ジェットオーブンの上段の入口に流す",
      "下駄を取り、出口に出てきた皿に左クリックで乗せる",
      "下駄に乗った皿を提供台へ",
    ],
    basePoints: 30,
    enabled: true,
  },
  {
    id: 'spicyChicken',
    name: '辛味チキン',
    station: 'cook',
    category: 'cookStarter',
    form: 'bake',
    ingredients: [],
    ticketItems: ['脂取りシート・辛味チキン×4（グラタン皿）', '下段1周', '下駄'],
    steps: [
      "具材台の棚から空のドリア皿（グラタン皿）を1枚取り、1台目の具材台の作業枠に置く",
      "ストック容器の脂取りシートを1枚取り、作業枠の皿に敷く（シートなしではチキンは入らない）",
      "吊り棚の辛味チキンの袋を4回クリックして、シートの上に入れる",
      "皿を持ち上げて、ジェットオーブンの下段の入口に流す",
      "下駄を取り、出口に出てきた皿に左クリックで乗せる",
      "下駄に乗った皿を提供台へ",
    ],
    basePoints: 30,
    enabled: true,
  },
  {
    id: 'focaccia',
    name: 'フォッカチオ',
    station: 'cook',
    category: 'bread',
    form: 'bake',
    ingredients: [],
    ticketItems: ['フォッカチオ（焼成パッド）', '上段1周', '小皿'],
    steps: [
      "具材台の棚から焼成パッドを1枚取り、1台目の具材台の作業枠に置く",
      "ストック容器のフォッカチオを1つ取り、作業枠のパッドに左クリックで入れる（ふつうの向き）",
      "パッドを持ち上げて、ジェットオーブンの上段の入口に流す",
      "出口から取ったパッドを、作業枠に置いた小皿（提供台の左の小皿の山から取る）に左クリックで移す（空いたパッドは棚に戻す）",
      "小皿を持ち上げて、提供台へ",
    ],
    basePoints: 20,
    enabled: true,
  },
  {
    id: 'cinnamonFocaccia',
    name: 'シナモンフォッカチオ',
    station: 'cook',
    category: 'bread',
    form: 'bake',
    ingredients: [],
    ticketItems: ['フォッカチオ（焼成パッド）', '上段1周', '小皿', 'シナモンパウダー'],
    steps: [
      "具材台の棚から焼成パッドを1枚取り、1台目の具材台の作業枠に置く",
      "ストック容器のフォッカチオを1つ取り、作業枠のパッドに左クリックで入れる（ふつうの向き）",
      "パッドを持ち上げて、ジェットオーブンの上段の入口に流す",
      "出口から取ったパッドを、作業枠に置いた小皿（提供台の左の小皿の山から取る）に左クリックで移す（空いたパッドは棚に戻す）",
      "作業台のシナモンパウダーのボトルを取り、作業枠の小皿に右クリックで1回振る（2回以上振ると注文ミス）。ボトルは作業台に戻す",
      "小皿を持ち上げて、提供台へ",
    ],
    basePoints: 20,
    enabled: true,
  },
  {
    id: 'garlicFocaccia',
    name: 'ガーリックフォッカチオ',
    station: 'cook',
    category: 'bread',
    form: 'bake',
    ingredients: [],
    ticketItems: ['フォッカチオ（焼成パッド）', '上段1周', '小皿', 'ガーリックソース'],
    steps: [
      "具材台の棚から焼成パッドを1枚取り、1台目の具材台の作業枠に置く",
      "ストック容器のフォッカチオを1つ取り、作業枠のパッドに左クリックで入れる（ふつうの向き）",
      "パッドを持ち上げて、ジェットオーブンの上段の入口に流す",
      "出口から取ったパッドを、作業枠に置いた小皿（提供台の左の小皿の山から取る）に左クリックで移す（空いたパッドは棚に戻す）",
      "作業台のガーリックソースのボトルを取り、作業枠の小皿に右クリックで1回かける（2回以上かけると注文ミス）。ボトルは作業台に戻す",
      "小皿を持ち上げて、提供台へ",
    ],
    basePoints: 20,
    enabled: true,
  },
  {
    id: 'tarakoFocaccia',
    name: 'たらこのフォッカチオ',
    station: 'cook',
    category: 'bread',
    form: 'bake',
    ingredients: [],
    ticketItems: ['逆さまのフォッカチオ', 'たらこソース', 'グランモラビア', '上段1周', '小皿'],
    steps: [
      "具材台の棚から焼成パッドを1枚取り、1台目の具材台の作業枠に置く",
      "ストック容器のフォッカチオを1つ取り、作業枠のパッドを右クリックして逆さまに入れる（平らな面が上。左クリックだと、ふつうの向きになり、具をのせられない）",
      "1台目の具材台のたらこソースの容器（クック用）から1杯取り、平らな面にのせる",
      "作業台のグランモラビアのボトルを取り、作業枠のパッドに右クリックで1回振る。ボトルは作業台に戻す",
      "パッドを持ち上げて、ジェットオーブンの上段の入口に流す",
      "出口から取ったパッドを、作業枠に置いた小皿（提供台の左の小皿の山から取る）に左クリックで移す（空いたパッドは棚に戻す）",
      "小皿を持ち上げて、提供台へ",
    ],
    basePoints: 20,
    enabled: true,
  },
  {
    id: 'cheeseFocaccia',
    name: 'チーズフォッカチオ',
    station: 'cook',
    category: 'bread',
    form: 'bake',
    ingredients: [],
    ticketItems: ['逆さまのフォッカチオ', 'ピザチーズ1/2杯', 'グランモラビア', '上段1周', '小皿'],
    steps: [
      "具材台の棚から焼成パッドを1枚取り、1台目の具材台の作業枠に置く",
      "ストック容器のフォッカチオを1つ取り、作業枠のパッドを右クリックして逆さまに入れる（平らな面が上。左クリックだと、ふつうの向きになり、具をのせられない）",
      "ピザチーズの容器を右クリックしてレードル半分（1/2杯）を取り、平らな面にのせる（左クリックの1杯はのらない）",
      "作業台のグランモラビアのボトルを取り、作業枠のパッドに右クリックで1回振る。ボトルは作業台に戻す",
      "パッドを持ち上げて、ジェットオーブンの上段の入口に流す",
      "出口から取ったパッドを、作業枠に置いた小皿（提供台の左の小皿の山から取る）に左クリックで移す（空いたパッドは棚に戻す）",
      "小皿を持ち上げて、提供台へ",
    ],
    basePoints: 20,
    enabled: true,
  },
  // --- クック編 C7：鉄板焼き6品（2026-11-15。既存品の並びは変えず、末尾に足した。手順・仕上げは bake.ts の表。点数は C10 の仮の値）---
  {
    id: 'hamburg',
    name: 'ハンバーグ',
    station: 'cook',
    category: 'meat',
    form: 'bake',
    ingredients: [],
    ticketItems: ['パティ（上段1周）', 'はがす', 'コーン・ポテト（上段1周）', '板', 'デミグラスソース', '目玉焼き'],
    steps: [
      "目玉焼き：目玉焼き鉄板を作業枠に置き、卵を2つ入れて上段に流す（ハンバーグと同時に流せる）。焼けたら、やっとこで作業枠か3台目の置き場へ",
      "具材台の棚からハンバーグの鉄板を1枚取り、1台目の具材台の作業枠に置く",
      "ストック容器のパティを1枚取り、鉄板にのせる",
      "鉄板を持ち上げて、ジェットオーブンの上段の入口に流す（1回目）",
      "出口の鉄板をやっとこ（F）でつかみ、作業枠に置く。ヘラに持ち替えて（F）、鉄板をはがす（F。トライアルは手が空の左クリック）",
      "コーン1杯・ポテト1個を鉄板にのせる（はがす前はのせられない）",
      "やっとこに持ち替えて鉄板をつかみ、上段の入口に流す（2回目）",
      "提供台の左の板の山から板を1枚取り、左手に持ったまま、出口の鉄板をやっとこでつかむと板に乗る。作業枠に置く",
      "デミグラスソースの容器からレードルで1杯取り、作業枠の鉄板にかける",
      "ヘラで目玉焼きを1つすくい（F）、鉄板の右上にのせる（F）",
      "板ごと持ち上げて、提供台へ",
    ],
    basePoints: 70,
    enabled: true,
  },
  {
    id: 'italianHamburg',
    name: 'イタリアンハンバーグ',
    station: 'cook',
    category: 'meat',
    form: 'bake',
    ingredients: [],
    ticketItems: ['パティ（上段1周）', 'はがす', 'コーン・ポテト・チーズソースの容器（上段1周）', '板', 'チーズソース'],
    steps: [
      "具材台の棚からハンバーグの鉄板を1枚取り、1台目の具材台の作業枠に置く",
      "ストック容器のパティを1枚取り、鉄板にのせる",
      "鉄板を持ち上げて、ジェットオーブンの上段の入口に流す（1回目）",
      "出口の鉄板をやっとこ（F）でつかみ、作業枠に置く。ヘラに持ち替えて（F）、鉄板をはがす（F。トライアルは手が空の左クリック）",
      "コーン1杯・ポテト1個を鉄板にのせる（はがす前はのせられない）",
      "チーズソースの容器から小さい容器を1つ取り、ピザソース1杯・ピザチーズ1杯を入れて、鉄板の空きにのせる",
      "やっとこに持ち替えて鉄板をつかみ、上段の入口に流す（2回目）",
      "提供台の左の板の山から板を1枚取り、左手に持ったまま、出口の鉄板をやっとこでつかむと板に乗る。作業枠に置く",
      "作業枠の鉄板を左クリックして、容器のチーズソースをかける（目玉焼きはのせない）",
      "板ごと持ち上げて、提供台へ",
    ],
    basePoints: 70,
    enabled: true,
  },
  {
    id: 'diavolaHamburg',
    name: 'ディアボラ風ハンバーグ',
    station: 'cook',
    category: 'meat',
    form: 'bake',
    ingredients: [],
    ticketItems: ['パティ（上段1周）', 'はがす', 'コーン・ポテト（上段1周）', '板', '野菜ペースト', '目玉焼き'],
    steps: [
      "目玉焼き：目玉焼き鉄板を作業枠に置き、卵を2つ入れて上段に流す（ハンバーグと同時に流せる）。焼けたら、やっとこで作業枠か3台目の置き場へ",
      "具材台の棚からハンバーグの鉄板を1枚取り、1台目の具材台の作業枠に置く",
      "ストック容器のパティを1枚取り、鉄板にのせる",
      "鉄板を持ち上げて、ジェットオーブンの上段の入口に流す（1回目）",
      "出口の鉄板をやっとこ（F）でつかみ、作業枠に置く。ヘラに持ち替えて（F）、鉄板をはがす（F。トライアルは手が空の左クリック）",
      "コーン1杯・ポテト1個を鉄板にのせる（はがす前はのせられない）",
      "やっとこに持ち替えて鉄板をつかみ、上段の入口に流す（2回目）",
      "提供台の左の板の山から板を1枚取り、左手に持ったまま、出口の鉄板をやっとこでつかむと板に乗る。作業枠に置く",
      "野菜ペーストの容器からレードルで1杯取り、作業枠の鉄板にかける",
      "ヘラで目玉焼きを1つすくい（F）、鉄板の右上にのせる（F）",
      "板ごと持ち上げて、提供台へ",
    ],
    basePoints: 70,
    enabled: true,
  },
  {
    id: 'mixedGrill',
    name: 'ミックスグリル',
    station: 'cook',
    category: 'meat',
    form: 'bake',
    ingredients: [],
    ticketItems: ['パティ', '辛味チキン×2', 'シュリンプ×5', 'ポテト×2', 'コーン（下段1周）', '板', 'デミグラスソース'],
    steps: [
      "具材台の棚からハンバーグの鉄板を1枚取り、1台目の具材台の作業枠に置く",
      "パティ1枚・辛味チキン2つ・シュリンプ5つ・ポテト2個・コーン1杯を鉄板にのせる（順番は自由。位置は自動で決まる）",
      "鉄板を持ち上げて、ジェットオーブンの下段の入口に流す（1回だけ。はがさない）",
      "提供台の左の板の山から板を1枚取り、左手に持ったまま、出口の鉄板をやっとこでつかむと板に乗る。作業枠に置く",
      "デミグラスソースの容器からレードルで1杯取り、作業枠の鉄板のハンバーグにかける",
      "板ごと持ち上げて、提供台へ",
    ],
    basePoints: 80,
    enabled: true,
  },
  {
    id: 'chickenDiavola',
    name: '若鶏のディアボラ風',
    station: 'cook',
    category: 'meat',
    form: 'bake',
    ingredients: [],
    ticketItems: ['チキン（下段1周）', 'はがす', 'コーン・ポテト（上段1周）', '板', '野菜ペースト'],
    steps: [
      "具材台の棚からハンバーグの鉄板を1枚取り、1台目の具材台の作業枠に置く",
      "ストック容器のチキンを1枚取り、鉄板にのせる",
      "鉄板を持ち上げて、ジェットオーブンの下段の入口に流す（1回目）",
      "出口の鉄板をやっとこ（F）でつかみ、作業枠に置く。ヘラに持ち替えて（F）、鉄板をはがす（F。トライアルは手が空の左クリック）",
      "コーン1杯・ポテト1個を鉄板にのせる（はがす前はのせられない）",
      "やっとこに持ち替えて鉄板をつかみ、上段の入口に流す（2回目）",
      "提供台の左の板の山から板を1枚取り、左手に持ったまま、出口の鉄板をやっとこでつかむと板に乗る。作業枠に置く",
      "野菜ペーストの容器からレードルで1杯取り、作業枠の鉄板にかける",
      "板ごと持ち上げて、提供台へ",
    ],
    basePoints: 70,
    enabled: true,
  },
  {
    id: 'chickenCheese',
    name: '柔らかチキンのチーズ焼き',
    station: 'cook',
    category: 'meat',
    form: 'bake',
    ingredients: [],
    ticketItems: ['チキン（下段1周）', 'はがす', 'コーン・ポテト・チーズソースの容器（上段1周）', '板', 'チーズソース'],
    steps: [
      "具材台の棚からハンバーグの鉄板を1枚取り、1台目の具材台の作業枠に置く",
      "ストック容器のチキンを1枚取り、鉄板にのせる",
      "鉄板を持ち上げて、ジェットオーブンの下段の入口に流す（1回目）",
      "出口の鉄板をやっとこ（F）でつかみ、作業枠に置く。ヘラに持ち替えて（F）、鉄板をはがす（F。トライアルは手が空の左クリック）",
      "コーン1杯・ポテト1個を鉄板にのせる（はがす前はのせられない）",
      "チーズソースの容器から小さい容器を1つ取り、ピザソース1杯・ピザチーズ1杯を入れて、鉄板の空きにのせる",
      "やっとこに持ち替えて鉄板をつかみ、上段の入口に流す（2回目）",
      "提供台の左の板の山から板を1枚取り、左手に持ったまま、出口の鉄板をやっとこでつかむと板に乗る。作業枠に置く",
      "作業枠の鉄板を左クリックして、容器のチーズソースをかける",
      "板ごと持ち上げて、提供台へ",
    ],
    basePoints: 70,
    enabled: true,
  },
];

// 完成の形（省略 = 皿）
export const formOf = (menu: Pick<MenuItem, 'form'>): MenuForm => menu.form ?? 'plate';

export function getMenu(id: string): MenuItem {
  const menu = MENU.find((m) => m.id === id);
  if (!menu) throw new Error(`unknown menu: ${id}`);
  return menu;
}

// --- 鍋で作るソース（既定の組み合わせ）---

function sameItems(a: readonly IngredientId[], b: readonly IngredientId[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((id, i) => id === y[i]);
}

// 鍋の中身が、既定のソースと一致していれば、そのメニューを返す（入れた順序は問わない）。
// 一致したらIHで加熱が始まる。あるソースの材料が、別のソースの材料の一部になる組み合わせは作らないこと
// （作ると、入れている途中で先に一致して、加熱が始まってしまう）
export function findSauceRecipe(contents: readonly IngredientId[], menus: readonly MenuItem[] = MENU): MenuItem | null {
  return menus.find((m) => m.enabled && m.sauce && sameItems(contents, m.sauce)) ?? null;
}

// 入れている途中（既定のソースの材料の一部）かどうか。false なら、どのソースにもならない組み合わせ
export function isSaucePartial(contents: readonly IngredientId[], menus: readonly MenuItem[] = MENU): boolean {
  return menus.some((m) => {
    if (!m.enabled || !m.sauce) return false;
    const rest = [...m.sauce];
    for (const id of contents) {
      const i = rest.indexOf(id);
      if (i < 0) return false;
      rest.splice(i, 1);
    }
    return true;
  });
}

// 皿の中身とレシピが一致するか（順序は問わず、個数まで一致）。
// 焼き物（form が bake）は中身を空にしてあるので、皿とは一致させない（空の皿が焼き物の伝票に当たらないように）
export function judge(contents: readonly IngredientId[], menu: MenuItem): boolean {
  if (formOf(menu) !== 'plate') return false;
  if (contents.length !== menu.ingredients.length) return false;
  const a = [...contents].sort();
  const b = [...menu.ingredients].sort();
  return a.every((id, i) => id === b[i]);
}

// 提供した皿に合う伝票のうち、最も古いものを返す
export function findMatchingTicket(
  contents: readonly IngredientId[],
  tickets: readonly Ticket[],
): Ticket | null {
  return oldestTicket(tickets.filter((t) => judge(contents, getMenu(t.menuId))));
}

// 伝票のうち、最も古いもの（なければ null）。同じ品の伝票が複数あれば、古いものから消す
export function oldestTicket(tickets: readonly Ticket[]): Ticket | null {
  if (tickets.length === 0) return null;
  return tickets.reduce((oldest, t) => (t.arrivedAt < oldest.arrivedAt ? t : oldest));
}
