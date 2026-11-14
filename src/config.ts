// 時間・個数・スコアなどの設定値。リアルモードはこのオブジェクトを差し替えるだけで作る。
export type GameConfig = {
  gameDuration: number; // 制限時間（秒）

  // 茹で麺器
  boilerCount: number; // 口数
  boilTime: number; // 麺の茹で時間（秒）
  penneBoilTime: number; // ペンネの茹で時間（秒）。未決事項（スパゲッティと同じか）
  graceTime: number; // 麺が上がってからの猶予（秒）
  shortBoilTime: number; // ショート茹で（秒）

  // 熱湯（サラダ台とIHの間）
  hotWaterColumns: number; // パックを浸けられる場所の列数（3×3 = 9か所なら 3）
  hotWaterSlotCount: number; // パックを浸けられる数
  carbonaraWarmTime: number; // カルボナーラのパックを余温めする秒数（3秒以上）
  cornSoupWarmTime: number; // コーンスープのパックを温める秒数（5秒以上）
  cornSoupStackMax: number; // コーンスープのパックを一度に手に持てる数
  carbonaraStackMax: number; // カルボナーラのパックを一度に手に持てる数（ほかのパックは1つ）

  // ジェットオーブン（ベルトコンベア式。左の台のさらに左）。皿を入口に置いてから、出口に出てくるまでの秒数
  ovenUpperTime: number; // 上段（ピザ系はこの時間で焼き上がる。ドリア系は、2周すると焼き上がる）
  ovenLowerTime: number; // 下段（ドリア系はこの時間で焼き上がる。ピザ系を流すと焦げる）

  // 鍋とIH
  ihBurnerCount: number; // IHコンロの口数
  potCount: number; // 鍋の総数（未決。6で余裕、4で標準、3以下で洗浄が勝負）
  potWashTime: number; // 鍋の洗浄時間（秒、1個ずつ）
  maxPotContents: number; // 鍋に入れられる中身の上限
  mixClicks: number; // 麺を入れた鍋を混ぜ終わるまでのクリック数（Aパターンのパスタだけ）
  sauceHeatTime: number; // ソースの加熱時間（秒、仮）。麺より短くして、仕掛ける順番に意味を持たせる

  // 左の台
  plateSlotCount: number; // 左の台：パスタの皿を置いて盛り付ける場所の数
  saladSlotCount: number; // サラダ台：サラダを作る場所の数
  maxPlateContents: number; // 皿に載せられる中身の上限
  pizzaSlotCount: number; // 作業台：ピザの鉄板を置いて組み立てる場所の数
  pizzaPanCount: number; // 作業台：ピザの鉄板のスタックの枚数（1山。取ると減り、0になったら使い終わった鉄板を戻して再利用する）
  // 冷凍の袋・ストック（クック編 C5。袋・容器の種類は cookStock.ts の表）
  loadStackMax: number; // 冷凍の袋・ストック容器から、同じ種類の具を重ねて手に持てる数
  potatoPerLargePad: number; // 大きめの焼成パッド1つ（冷凍ポテトの袋の1/4）を下調理すると、できるポテトの数
  potatoStockStart: number; // ゲーム開始時の、下調理したポテトのストックの数
  prepStockConsume: boolean; // ストックから取ると減るか（トライアルは減らない。difficulty.ts で上書きする）
  prepStockLowAt: number; // ストックがこの数以下になったら、容器のラベルの色を変える
  maxBakeFinishes: number; // 焼き物（受け台に乗せた器）に振る・かける仕上げの回数の上限（振りすぎは注文ミス。上限は、押し続けたときに際限なく増えないためだけ）

  // 伝票
  firstTicketAt: number; // 最初の伝票が届く時刻（秒）
  ticketIntervalStart: number; // 開始時の届く間隔（秒）
  ticketIntervalEnd: number; // 終了時の届く間隔（秒）。後半ほど短くする
  ticketIntervalJitter: number; // 間隔のばらつき（0.25 なら ±25%）
  maxOpenTickets: number; // 同時に並ぶ伝票の上限
  practiceTicketInterval: number; // 練習キッチンで伝票が届く間隔（秒、一定）
  practiceMaxTickets: number; // 練習キッチンで同時に並ぶ伝票の上限

  // スコア
  speedBonusMax: number; // 速度ボーナスの最大値
  speedBonusWindow: number; // 速度ボーナスがゼロになるまでの秒数
  comboStep: number; // 連続提供1回ごとの倍率の増分
  comboMax: number; // 倍率の上限
  orderMissPenalty: number; // 注文ミスの減点

  // プレイヤー
  playerRadius: number; // 体の半径（m）。壁や設備にこれ以上は近づけない
  moveSpeed: number; // 移動速度（m/s）
  reach: number; // 手が届く距離（m）
  mouseSensitivity: number; // ラジアン/ピクセル
};

export const DEFAULT_CONFIG: GameConfig = {
  gameDuration: 300,

  boilerCount: 4,
  boilTime: 50,
  penneBoilTime: 50,
  graceTime: 30,
  shortBoilTime: 3,

  hotWaterColumns: 3,
  hotWaterSlotCount: 9,
  carbonaraWarmTime: 3,
  cornSoupWarmTime: 5,
  cornSoupStackMax: 5,
  carbonaraStackMax: 3,

  ovenUpperTime: 30, // 標準の値（5分のゲームに合わせた長さ。40秒は将来のリアルモード用）
  ovenLowerTime: 60, // 標準の値（80秒は将来のリアルモード用）。必ず上段の2倍にする（上段2周 = 下段1周。ドリアはこの時間で焼き上がる）

  ihBurnerCount: 4,
  potCount: 5,
  potWashTime: 5,
  maxPotContents: 8,
  mixClicks: 3,
  sauceHeatTime: 30,

  plateSlotCount: 3,
  saladSlotCount: 2,
  maxPlateContents: 8,
  pizzaSlotCount: 2,
  pizzaPanCount: 10,
  maxBakeFinishes: 4, // 仮

  loadStackMax: 9, // 仮（焼成パッドにシュリンプは9つまで）
  potatoPerLargePad: 16, // 仮
  potatoStockStart: 16, // 仮
  prepStockConsume: true,
  prepStockLowAt: 4, // 仮

  firstTicketAt: 3,
  ticketIntervalStart: 25,
  ticketIntervalEnd: 10,
  ticketIntervalJitter: 0.25,
  maxOpenTickets: 10, // 画面に並べるのは6枚まで（hud.ts の RAIL_VISIBLE_TICKETS）。それを超えた分は6枚目の裏に重ねて「+x枚」と表示する
  practiceTicketInterval: 25,
  practiceMaxTickets: 5,

  speedBonusMax: 20,
  speedBonusWindow: 90,
  comboStep: 0.1,
  comboMax: 2,
  orderMissPenalty: 30,

  playerRadius: 0.3,
  moveSpeed: 2,
  reach: 5,
  mouseSensitivity: 0.0022,
};
