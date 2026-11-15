import { createBoiler, pressButton, returnNoodle, setNoodle, startShortBoil, takeNoodle, updateBoiler } from './boiler';
import { DEFAULT_CONFIG, type GameConfig } from './config';
import { DEFAULT_DIFFICULTY, configFor, getDifficulty, type Difficulty } from './difficulty';
import { INGREDIENTS } from './ingredients';
import {
  addIngredient,
  canAddIngredient,
  canInsert,
  canPour,
  canMix,
  createPot,
  createWasher,
  insertPot,
  isWashing,
  mixPot,
  pourOnto,
  startHeating,
  takeWashedPot,
  updateHeat,
  updateWasher,
} from './pot';
import { BAKE_STATE_NAME, OVEN_DECK_NAME, bakeItem, bakeTime, canTakeDish, createOven, itemFromOven, ovenDishItem, peekDish, placeDish, resolvePlacement, takeDish, timeToEmerge, updateOven } from './oven';
import { canStackPack, createPack, findWarmPack, soakPack, stockItem } from './pack';
import { BAG_IDS, CUP_FILLS, FROZEN_BAGS, PREP_STOCKS, SOURCE_RIGHT_TAKE, bagClick, bagHint, binHint, cupFillWith, cupNext, emptyYield, flipLoadOf, initialPrepStock, isPourHand, pourHint, pourInto, rightTakeOf, takeFromBin, whyNotPour } from './cookStock';
import { findMatchingTicket, findSauceRecipe, getMenu } from './recipe';
import { PIZZA_TOPPING_NAME, PIZZA_TOPS, addTopping, canAddTopping, emptyPan, isPizzaTop, pizzaOf, whyNotTopping } from './pizza';
import { serveScore } from './score';
import { BAKE_BASES, BAKE_FINISH_NAME, BAKE_LOAD_NAME, BAKE_VESSELS, baseOf, cupPourOf, isHot, needsCare, scoopOf, dishName, bakeLabel, canFinishWith, canTakeBase, candidatesAt, dishTitle, findBakedTicket, flowPlan, getBakeDish, loadRoom, overFinishedDish, pizzaTitle, progressOf, serveHint, servableDish, stockProgress, vesselCapacity, viewOf, whyNotLoad, withFinish, type BakeDish } from './bake';
import { DEFAULT_POSITION, PRACTICE_POSITION, menusFor } from './position';
import { createTicket, nextTicketInterval, pickMenu } from './tickets';
import { tutorialSteps, type GuideAt, type TutorialStep, type TutorialView } from './tutorial';
import { BOTTLE_ACTION, BOTTLE_BAKE_FINISH, BOTTLE_BAKE_LOAD, BOTTLE_FRIDGE_ITEM, BOTTLE_IDS, BOTTLE_PLATE, BOTTLE_SURFACES, BOTTLE_VERB, bottleOfFridgeItem, isFridgeBottle } from './bottle';
import { FRIDGE_HOME, FRIDGE_ITEM_IDS, FRIDGE_ITEM_NAME, BAG_FRIDGE_ITEM, bagOfFridgeItem, clampOnShelf, fitsOnShelf, fridgeItemOf, returnToFridge } from './fridge';
import { BAKE_DISHES, BOTTLE_HOME, OVEN_STOCK_NAME, FREE_TRAY_HOME, GETA, GETA_HOME, GETA_RANGE, PIZZA_COUNTER, PIZZA_PLATE_R, PIZZA_PLATE_STACK, SHELF_STACKS, SURFACES, REST_DISH, TOOL_HOME, TOOL_REST, WORK_FRAMES, legacyBagSpot, overlapsLeftFixture, overlapsPrepFixture, overlapsServePass, overlapsShelfFixture, flatRange, propRange, toolRestRange } from './layout';
import { OPEN_WORLD, launchPot, stepThrownPot, type ThrowAim } from './throw';
import type { World } from './world';
import { CASE_TRAY_IDS, FREE_TRAY_IDS, TRAY_CONTENT, TRAY_FRIDGE_ITEM, TRAY_IDS, TRAY_NAME, TRAY_ZONE, caseOfTarget, isCaseTray, isFreeTray, trayAt, trayOfFridgeItem } from './tray';
import type { BakeBase, BakeFinishId, BakeStyle, BottleId, CookBinId, PlateDish, ToolHand, ToolId, BottlePreview, GetaPreview, OvenPreview, PropPreview, BottleSpot, FreeTrayId, FridgeItemId, FridgePreview, FridgeSpot, FridgeUnit, BagId, GameState, IngredientId, Item, Mode, Phase, Position, Pot, TableSpot, Target, Ticket, Toast, RestPreview, ToolPreview, TrayId, WorkFrameItem } from './types';

// クリックしたら起きること。null = 今の手持ちではこの設備に何もできない
type Action = () => void;

// F（道具の手）でできること。label = 案内の文（「F：」のあと）、run = 実行。null = 今の道具ではこの設備に何もできない（クック編 C4）
export type ToolPlan = { label: string; run: Action };
// 焼き皿の決まりを、どちらの手が持っている物について使うか。left = 左手（state.hand。左クリック）、tongs = やっとこ（state.tool。F）
type HandRef = 'left' | 'tongs';

// 熱い器を素手で取ろうとしたときの理由（クック編 C4）
const HOT_TONGS = '熱い！ やっとこでつかむ（F）';

// 道具の名前と、フックから取ったときの道具の手
export const TOOL_NAME: Record<ToolId, string> = { tongs: 'やっとこ', spatula: 'ヘラ' };
const newTool = (id: ToolId): ToolHand => (id === 'tongs' ? { kind: 'tongs', dish: null } : { kind: 'spatula', scoop: null });
const toolEmpty = (t: ToolHand): boolean => (t.kind === 'tongs' ? t.dish === null : t.scoop === null);

// 次の状態（練習 ⇄ ゲーム・チュートリアル）に引き継ぐ配置
type CarriedLayout = {
  fridge: GameState['fridgeItems']; // 冷蔵庫の中の物の置き場所
  trays: GameState['trays']; // トレー・ケースの場所（冷蔵庫 / サラダ台）。手に持っていたものは冷蔵庫に戻してある
  traySpot: GameState['traySpot']; // サラダ台に置いたトレー・ケースの置き場の番号
  freeTraySpot: GameState['freeTraySpot']; // 台の上のどこにでも置ける容器（ガーリック・唐辛子）の置き場所
  bottles: GameState['bottles']; // ボトルの置き場所
  getaSpot: GameState['getaSpot']; // 下駄の山の置き場所
};

const TOAST_SECONDS = 2.5;

// 空の鉄板（スタックから取った物も、ピザを皿に移したあとの物も、同じ）
const newPan = (cfg: GameConfig) => bakeItem('pizza', 0, cfg, emptyPan());

// 生地がのっていない、空の鉄板か（ピザ系の焼き皿のうち、pizza を持ち、焼く前のもの）
const isEmptyPan = (item: Item): item is Extract<Item, { kind: 'bakeDish' }> =>
  item.kind === 'bakeDish' && item.style === 'pizza' && item.state === 'raw' && item.pizza !== undefined && !item.pizza.dough;

type BakeDishItem = Extract<Item, { kind: 'bakeDish' }>;

// 作業枠に置ける物か：3列系の焼き皿（受け台に乗せた物も）・下駄・板・小皿（焼き物を移した小皿も）（決まりは layout.ts の WORK_FRAMES）
const fitsWorkFrame = (item: Item): item is WorkFrameItem =>
  (item.kind === 'bakeDish' && BAKE_DISHES[item.style].series === WORK_FRAMES.series) ||
  item.kind === 'geta' ||
  item.kind === 'board' ||
  item.kind === 'bakePlate' ||
  (item.kind === 'plate' && WORK_FRAMES.plateStyles.includes(item.style ?? 'plate'));

// 焼き物を移せる、空の小皿か（受け台 smallPlate。クック編 C6）
const isEmptySmallPlate = (item: Item | null): item is Extract<Item, { kind: 'plate' }> =>
  item?.kind === 'plate' && item.style === 'small' && item.contents.length === 0;

// 焼き上がった器の中身を、小皿に移したもの（中身・段階・仕上げは器のまま引き継ぐ）
const toSmallPlate = (dish: BakeDishItem): Extract<Item, { kind: 'bakePlate' }> => ({ kind: 'bakePlate', from: dish.style, state: dish.state, ...progressOf(dish) });

// 焼き上がったピザを、ピザのお皿に入れたときの中身（鉄板は含まない。段階の進み具合は引き継ぐ）
const plateDishOf = (dish: BakeDishItem): PlateDish => ({ pizza: pizzaOf(dish), state: 'baked', ...progressOf(dish) });

// 受け台（下駄・板）そのものを手に持つ物か。持っている受け台の種類（なければ null）
const baseItemOf = (item: Item | null): Extract<BakeBase, 'geta' | 'board'> | null => (item?.kind === 'geta' || item?.kind === 'board' ? item.kind : null);

// 受け台に乗せた焼き皿（受け台の種類の項目を立てる）
const onBase = (dish: BakeDishItem, base: Extract<BakeBase, 'geta' | 'board'>): BakeDishItem => ({ ...dish, [base]: true });

// 器の山から取った、空の器（焼く前で、何ものっていない・受け台にも乗っていない）
const blankVessel = (style: BakeStyle, cfg: GameConfig): BakeDishItem => bakeItem(style, 0, cfg, undefined, { blank: true });
const isBlankVessel = (item: Item | null, style: BakeStyle): boolean =>
  item?.kind === 'bakeDish' && item.style === style && item.blank === true && item.state === 'raw' && !item.loaded && !item.stage && baseOf(item) === null;

// ピザ組み立て台に置ける焼き皿か（焼く前の2列系の器。ピザの鉄板・大きめの焼成パッド）
const fitsPizzaSlot = (item: Item | null): item is BakeDishItem =>
  item?.kind === 'bakeDish' && BAKE_DISHES[item.style].series === PIZZA_COUNTER.slotSeries && item.state === 'raw' && baseOf(item) === null;

// 棚のドリアの山のうち、その品がまだ表（bake.ts）にない山か（取れない。品を表に足すと取れるようになる）
const unbakeableStock = (target: Extract<Target, { kind: 'ovenStock' }>): boolean => target.dish !== undefined && getBakeDish(target.dish) === null;
// ピザの4番目の具の容器のうち、その具を使う品がまだ表（bake.ts）にない容器か（取れない。品を表に足すと取れるようになる）
const unusedPizzaSource = (target: Extract<Target, { kind: 'pizzaSource' }>): boolean =>
  isPizzaTop(target.id) && vesselCapacity('pizza', PIZZA_TOPS[target.id].load) === 0;
const shelfLabel = (dish: string | undefined): string | undefined => SHELF_STACKS.find((x) => x.dish === dish)?.label;

const copySpot = (spot: BottleSpot): BottleSpot => (spot ? { ...spot } : null);

// ボトルをサラダ台の上に置くときの決まり
// 冷蔵庫から出した、パック（冷凍の袋・モッツァレラの袋）の大きさ（作業台の上。x = 厚み、z = 幅。上から見た大きさ）
const BAG_REST = { w: 0.1, d: 0.26 };
const BAG_FRIDGE_ITEM_OF = (id: BagId): FridgeItemId => BAG_FRIDGE_ITEM[id];
const BOTTLE_EDGE = 0.06; // 天板の縁から、これだけ内側までしか置けない
const BOTTLE_GAP = 0.14; // ボトルどうしの最小の間隔

// ガーリック・唐辛子の容器（半径 0.17 の丸い容器）を台の上に置くときの決まり
const FREE_TRAY_EDGE = 0.2; // 天板の縁から、これだけ内側までしか置けない（容器が台からはみ出さない）
const FREE_TRAY_GAP = 0.4; // 容器どうしの最小の間隔（中心どうし）
const FREE_TRAY_BOTTLE_GAP = 0.26; // 容器とボトルの最小の間隔（中心どうし）

export class Game {
  state: GameState;
  // 投げた鍋が当たる床・台・壁。厨房を作ったら main.ts が渡す（なければ、床だけの広い空間）
  world: World = OPEN_WORLD;
  private nextThrownId = 1;
  private nextPlateId = 1;
  private nextRestId = 1;

  constructor(
    readonly cfg: GameConfig = DEFAULT_CONFIG,
    private rng: () => number = Math.random,
  ) {
    this.state = this.initialState('title', 'practice');
  }

  // layout: 引き継ぐ食材・ボトルなどの配置（練習で置き直した配置を、ゲームにも反映する）。省略 = 最初の配置
  // position: ゲームのポジション（練習キッチンは常に通し）
  private initialState(phase: Phase, mode: Mode, layout?: CarriedLayout, difficulty: Difficulty | null = null, position: Position = DEFAULT_POSITION): GameState {
    const fridge = layout?.fridge;
    return {
      phase,
      mode,
      difficulty,
      position: mode === 'practice' ? PRACTICE_POSITION : position,
      ipadOpen: false,
      tutorial: null,
      time: 0,
      hand: null,
      tool: null, // 道具は、毎回フックに掛かった状態から（練習からゲームに入るときも、フックに戻る）
      // やっとこ・ヘラは、本番では作業台の上（オーブン側の端）に置いてある。そうでなければフック
      toolSpots: this.cfg.fridgeCookSetup ? { tongs: { ...TOOL_HOME.tongs }, spatula: { ...TOOL_HOME.spatula } } : { tongs: null, spatula: null },
      // パック（冷凍の袋4種類とモッツァレラ）は、本番では冷蔵庫の中、そうでなければ作業台の上
      bags: Object.fromEntries(BAG_IDS.map((id, i) => [id, this.cfg.fridgeCookSetup ? { at: 'fridge' } : { at: 'table', spot: legacyBagSpot(i) }])) as GameState['bags'],
      boilers: Array.from({ length: this.cfg.boilerCount }, createBoiler),
      plateSlots: Array.from({ length: this.cfg.plateSlotCount + this.cfg.saladSlotCount }, () => null),
      plateStyles: Array.from({ length: this.cfg.plateSlotCount + this.cfg.saladSlotCount }, () => 'plate' as const),
      // クックの具材のケースは、本番（fridgeCookSetup）では冷蔵庫の中、そうでなければ作業台のトレー置き場（CASE_TRAY_IDS の順）に置いてある
      trays: Object.fromEntries(TRAY_IDS.map((id) => [id, layout?.trays[id] ?? (isCaseTray(id) && !this.cfg.fridgeCookSetup ? 'table' : 'fridge')])) as GameState['trays'],
      traySpot: Object.fromEntries(TRAY_IDS.map((id) => [id, layout?.traySpot[id] ?? (isCaseTray(id) ? CASE_TRAY_IDS.indexOf(id) : 0)])) as GameState['traySpot'],
      freeTraySpot: Object.fromEntries(FREE_TRAY_IDS.map((id) => [id, { ...(layout?.freeTraySpot[id] ?? FREE_TRAY_HOME[id]) }])) as Record<FreeTrayId, TableSpot>,
      fridgeOpen: [false, false, false],
      fridgeItems: Object.fromEntries(FRIDGE_ITEM_IDS.map((id) => [id, { ...(fridge ?? FRIDGE_HOME)[id] }])) as Record<FridgeItemId, FridgeSpot>,
      moving: null,
      pizzaPanStock: this.cfg.pizzaPanCount,
      panPile: null,
      pizzaPlates: [],
      pizzaSlots: Array.from({ length: this.cfg.pizzaSlotCount }, () => null),
      getaSpot: { ...(layout?.getaSpot ?? GETA_HOME) },
      getaMoving: false,
      prepStock: initialPrepStock(this.cfg), // 下調理のストック（ポテト）。チュートリアルも、この十分な数から始まる
      workFrames: WORK_FRAMES.slots.map(() => null),
      restDishes: [], // 台の上に置いた使い終わった器（クック編 C7）。毎回、空から
      // 引き継ぎがなければ、冷蔵庫にしまってあるボトル（null）以外は、もとの場所の台の上
      bottles: Object.fromEntries(
        BOTTLE_IDS.map((id) => [id, layout ? copySpot(layout.bottles[id]) : isFridgeBottle(id) ? null : { ...BOTTLE_HOME[id] }]),
      ) as Record<BottleId, BottleSpot>,
      bottleShakeAt: null,
      hotWater: Array.from({ length: this.cfg.hotWaterSlotCount }, () => null),
      potSlots: Array.from({ length: this.cfg.potCount }, () => createPot(this.cfg.mixClicks)),
      ihBurners: Array.from({ length: this.cfg.ihBurnerCount }, () => null),
      thrownPots: [],
      washer: createWasher(),
      oven: createOven(),
      tickets: [],
      nextTicketAt: configFor(this.cfg, difficulty).firstTicketAt,
      nextTicketId: 1,
      score: 0,
      combo: 0,
      maxCombo: 0,
      served: 0,
      mistakes: 0,
      toast: null,
    };
  }

  // 次の状態に引き継ぐ配置。練習で置き直した、冷蔵庫の中の物・サラダ台に置いたトレー・ケース・ボトルの位置を残す
  // （鍋・皿・熱湯のパック・伝票などは、毎回最初に戻る。冷蔵庫の扉も閉まる）。
  //  - 手に持っていたトレー・ケースは冷蔵庫に戻る。もとの場所にほかの物が置かれていたら、冷蔵庫の中の空いている場所に置く
  //  - 手に持っていたボトルは、もとの場所（layout.ts）に戻る。冷蔵庫にしまってあるボトル（ドレッシング・パプリカ）は、冷蔵庫に戻る
  // 最初（引き継ぐ物がない）は undefined
  private carriedLayout(): CarriedLayout | undefined {
    const prev = this.state;
    if (!prev) return undefined;
    const inHand = TRAY_IDS.filter((id) => prev.trays[id] === 'hand');
    return {
      fridge: returnToFridge(prev.fridgeItems, inHand.map((id) => TRAY_FRIDGE_ITEM[id])),
      trays: Object.fromEntries(TRAY_IDS.map((id) => [id, prev.trays[id] === 'hand' ? 'fridge' : prev.trays[id]])) as GameState['trays'],
      traySpot: { ...prev.traySpot },
      freeTraySpot: Object.fromEntries(FREE_TRAY_IDS.map((id) => [id, { ...prev.freeTraySpot[id] }])) as Record<FreeTrayId, TableSpot>,
      bottles: Object.fromEntries(
        BOTTLE_IDS.map((id) => [id, prev.bottles[id] ? { ...prev.bottles[id] } : isFridgeBottle(id) ? null : { ...BOTTLE_HOME[id] }]),
      ) as Record<BottleId, BottleSpot>,
      getaSpot: { ...prev.getaSpot },
    };
  }

  // 練習キッチンを始める（時間制限なし）。練習で置いた食材・ボトル・冷蔵庫の中の配置は引き継ぐ
  startPractice(): void {
    this.state = this.initialState('playing', 'practice', this.carriedLayout());
  }

  // ゲーム（5分間のタイムアタック）を始める。練習で置いた食材・ボトル・冷蔵庫の中の配置は、そのまま引き継ぐ。それ以外は最初から
  // position: ポジション（届く伝票の担当）。省略 = ヒート
  start(difficulty: Difficulty = DEFAULT_DIFFICULTY, position: Position = DEFAULT_POSITION): void {
    this.state = this.initialState('playing', 'game', this.carriedLayout(), difficulty, position);
  }

  // ゲームの準備（iPad から）：状態を最初に戻して、操作説明を出す。時間は進まず、begin() で始まる。
  // difficulty で伝票の量と出てくる料理が、position で届く伝票の担当（ヒート / クック / 通し）が決まる
  getReady(difficulty: Difficulty = DEFAULT_DIFFICULTY, position: Position = DEFAULT_POSITION): void {
    this.state = this.initialState('ready', 'game', this.carriedLayout(), difficulty, position);
  }

  // 操作説明を読み終えて、ゲームを始める
  begin(): void {
    if (this.state.phase === 'ready') this.state.phase = 'playing';
  }

  // iPad の画面を閉じる（手には iPad を持ったまま）
  closeIpad(): void {
    this.state.ipadOpen = false;
  }

  // --- チュートリアル（練習キッチンで、選んだメニューを案内つきで作る）---

  // チュートリアルを最後までやり遂げたときに呼ばれる（途中でやめたときは呼ばれない）。ミッションの達成の記録に使う
  onTutorialComplete: ((menuId: string) => void) | null = null;

  private tutorialCache = new Map<string, TutorialStep[] | null>();

  private stepsOf(menuId: string): TutorialStep[] | null {
    if (!this.tutorialCache.has(menuId)) this.tutorialCache.set(menuId, tutorialSteps(menuId, this.cfg));
    return this.tutorialCache.get(menuId) ?? null;
  }

  // チュートリアルを始める。鍋・皿などは最初の状態に戻り（置いた食材・ボトル・冷蔵庫の配置は引き継ぐ）、伝票はこのメニューの1枚だけ届いている。
  // 手に持っていた iPad も壁に戻る。チュートリアルがないメニューなら何もせず false
  startTutorial(menuId: string): boolean {
    const steps = this.stepsOf(menuId);
    if (!steps) return false;
    this.state = this.initialState('playing', 'practice', this.carriedLayout());
    const s = this.state;
    s.tickets = [createTicket(s.nextTicketId++, getMenu(menuId), s.time)];
    s.nextTicketAt = Infinity; // ほかの伝票は届かない
    s.tutorial = { menuId, step: 0, total: steps.length };
    return true;
  }

  // チュートリアルをやめる（最後まで終わったときも、これで終わる）。厨房はそのまま、練習キッチンに戻る（伝票も、また届くようになる）
  stopTutorial(): void {
    const s = this.state;
    if (!s.tutorial) return;
    s.tutorial = null;
    s.nextTicketAt = s.time + this.cfg.practiceTicketInterval;
  }

  // 終わった工程から次へ進める（戻らない）。いくつか続けて終わっていれば、まとめて進む。
  // 最後の工程まで終わったら、「完了」と知らせて、チュートリアルを自動で終える（矢印と工程の一覧は消える）
  private advanceTutorial(): void {
    const t = this.state.tutorial;
    const steps = t && this.stepsOf(t.menuId);
    if (!t || !steps) return;
    while (t.step < steps.length && steps[t.step].done(this.state)) t.step++;
    if (t.step < steps.length) return;
    this.say(`${getMenu(t.menuId).name}のチュートリアル完了！`, 'good');
    this.stopTutorial();
    this.onTutorialComplete?.(t.menuId);
  }

  // 3D の矢印が指す先と、その一言（なければ null）。iPad を持っているときは、まず壁に戻すよう案内する
  tutorialGuide(): { at: GuideAt; text: string } | null {
    const s = this.state;
    const t = s.tutorial;
    const steps = t && this.stepsOf(t.menuId);
    if (!t || !steps || s.phase !== 'playing') return null;
    if (s.hand?.kind === 'ipad') return { at: { kind: 'ipadWall' }, text: 'iPadを壁に戻す（壁に向けて左クリック）' };
    const step = steps[t.step];
    const at = step.at(s);
    if (!at) return null;
    const progress = step.progress?.(s);
    return { at, text: step.hint?.(s) || (progress ? `${step.label}（${progress}）` : step.label) };
  }

  // HUD の工程の一覧に出す内容（チュートリアル中でなければ null）
  tutorialView(): TutorialView | null {
    const s = this.state;
    const t = s.tutorial;
    const steps = t && this.stepsOf(t.menuId);
    if (!t || !steps) return null;
    const hint = s.hand?.kind === 'ipad' ? 'iPadを壁に戻す（壁に向けて左クリック）' : (steps[t.step].hint?.(s) ?? null);
    const progress = steps[t.step].progress?.(s) ?? null;
    return { menuName: getMenu(t.menuId).name, labels: steps.map((x) => x.label), step: t.step, hint, progress };
  }

  pause(): void {
    if (this.state.phase === 'playing') this.state.phase = 'paused';
  }

  resume(): void {
    if (this.state.phase === 'paused') this.state.phase = 'playing';
  }

  update(dt: number): void {
    const s = this.state;
    if (s.phase !== 'playing') return;

    s.time += dt;
    for (const b of s.boilers) updateBoiler(b, dt, this.cfg);
    updateWasher(s.washer, dt);
    updateOven(s.oven, dt, this.cfg);
    for (const pack of s.hotWater) if (pack) soakPack(pack, dt, this.cfg); // 熱湯に浸かっている間だけ温まる
    for (const pot of s.ihBurners) if (pot) updateHeat(pot, dt); // 加熱が進むのはIHに載っている間だけ
    for (const thrown of s.thrownPots) stepThrownPot(thrown, dt, this.world);
    this.spawnTickets();
    this.advanceTutorial();

    if (s.mode === 'game' && s.time >= this.cfg.gameDuration) {
      s.time = this.cfg.gameDuration;
      s.phase = 'result';
    }
  }

  private spawnTickets(): void {
    const s = this.state;
    if (s.time < s.nextTicketAt) return;
    // 練習キッチン：一定の間隔で、上限（5枚）に達していない間だけ届く。ゲーム：だんだん間隔が短くなる
    // （間隔・上限・出てくる料理は、選んだ難易度で変わる。品は、選んだポジションが担当する品だけに絞ってから選ぶ）
    const practice = s.mode === 'practice';
    const cfg = configFor(this.cfg, s.difficulty);
    const weights = s.difficulty ? getDifficulty(s.difficulty).menuWeights : undefined;
    const max = practice ? cfg.practiceMaxTickets : cfg.maxOpenTickets;
    if (s.tickets.length < max) {
      s.tickets.push(createTicket(s.nextTicketId++, pickMenu(menusFor(s.position), this.rng, weights), s.time));
    }
    const progress = s.time / cfg.gameDuration;
    s.nextTicketAt = s.time + (practice ? cfg.practiceTicketInterval : nextTicketInterval(progress, cfg, this.rng));
  }

  // --- 操作 ---

  // 視点の先の設備を左クリック
  interact(target: Target): void {
    const action = this.planInteract(target);
    if (!action) return;
    action();
    this.combineHands();
  }

  // --- 道具の手（クック編 C4）---

  // 熱い器の決まりが効いているか（この難易度の設定。トライアルはオフ。チュートリアル中は、素手の手順で案内しているのでオフ）
  hotHandling(): boolean {
    const s = this.state;
    return configFor(this.cfg, s.difficulty).hotHandling && !s.tutorial;
  }

  // その手が持っている物（やっとこは、つかんでいる器）
  private held(h: HandRef): Item | null {
    const t = this.state.tool;
    return h === 'left' ? this.state.hand : t?.kind === 'tongs' ? t.dish : null;
  }

  // その手に持たせる（やっとこがつかめるのは器だけ。器でない物は渡さない）
  private setHeld(h: HandRef, item: Item | null): void {
    if (h === 'left') {
      this.state.hand = item;
      return;
    }
    if (this.state.tool?.kind === 'tongs') this.state.tool = { kind: 'tongs', dish: item?.kind === 'bakeDish' ? item : null };
  }

  // F：視点の先の物に、道具の手でできることをする（できなければ何もしない）。そのあと、手元で合わせる
  useTool(target: Target): void {
    const plan = this.planTool(target);
    if (!plan) return;
    plan.run();
    this.combineHands();
  }

  // F でできること（planInteract と同じく、実行せずに「できるか」を知るため。ハイライトと案内にも使う）。できなければ null
  //  - 道具のフック：取る・戻す・持ち替える（持っている道具が空のときだけ）
  //  - 台の天板：持っている空の道具をべた置きする。台に置いた道具：取る・持ち替える（作業台・提供台のまわり）
  //  - やっとこ：出口の器・作業枠の熱い器をつかむ。つかんだ器を、作業枠・作業枠の受け台・入口のベルト・器の山・ピザのお皿・ストック容器に置く
  //  - ヘラ：作業枠の器をはがす。焼けた器から1つすくい、作業枠の仕上げ中の焼き物にのせる
  planTool(target: Target): ToolPlan | null {
    const s = this.state;
    if (s.phase !== 'playing' || s.moving || s.getaMoving || !this.reachable(target)) return null;
    if (target.kind === 'toolHook') return this.planHook(target.id);
    if (target.kind === 'placedTool') return this.planPlacedTool(target.id);
    if (target.kind === 'tableTop') return this.planToolDown(target);
    const t = s.tool;
    if (t?.kind === 'tongs') return this.planTongs(target);
    if (t?.kind === 'spatula') return this.planSpatula(target, t.scoop);
    return null;
  }

  // F の案内（「F：やっとこでつかむ」）。できることがなければ、フックでは戻せない理由、それ以外は空
  toolHint(target: Target | null): string {
    const s = this.state;
    if (!target || s.phase !== 'playing') return '';
    const plan = this.planTool(target);
    if (plan) return `F：${plan.label}`;
    if (target.kind === 'toolHook' && s.toolSpots[target.id] && s.tool?.kind !== target.id) return `${TOOL_NAME[target.id]}は台の上に置いてある`;
    if ((target.kind === 'toolHook' || target.kind === 'placedTool') && s.tool && !toolEmpty(s.tool)) {
      const where = target.kind === 'toolHook' ? 'フックに戻す' : '持ち替える';
      return s.tool.kind === 'tongs' ? `やっとこの器を置いてから、${where}` : `ヘラの上の物をのせてから、${where}`;
    }
    if (target.kind === 'tableTop' && s.tool?.kind === 'tongs' && s.tool.dish) return this.previewRest('tongs', target)?.reason === 'gap' ? 'ここには置けない（ほかの物に近すぎる）' : '';
    if (target.kind === 'tableTop' && this.previewTool(target)?.reason === 'gap') return `${TOOL_NAME[s.tool!.kind]}はここには置けない（ほかの物に近すぎる）`;
    return '';
  }

  private planHook(id: ToolId): ToolPlan | null {
    const s = this.state;
    const t = s.tool;
    if (s.toolSpots[id] && t?.kind !== id) return null; // その道具は台の上に置いてある（フックは空）
    if (!t) return { label: `${TOOL_NAME[id]}を取る`, run: () => (s.tool = newTool(id)) };
    if (!toolEmpty(t)) return null;
    if (t.kind === id) return { label: `${TOOL_NAME[id]}をフックに戻す`, run: () => (s.tool = null) };
    return { label: `${TOOL_NAME[id]}に持ち替える`, run: () => (s.tool = newTool(id)) };
  }

  // 台の上にべた置きした道具：取る（何も持っていないとき）・持ち替える（持っている道具が空なら、それを同じ場所に置く）
  private planPlacedTool(id: ToolId): ToolPlan | null {
    const s = this.state;
    const spot = s.toolSpots[id];
    const t = s.tool;
    if (!spot) return null;
    if (!t) {
      return {
        label: `${TOOL_NAME[id]}を取る`,
        run: () => {
          s.toolSpots[id] = null;
          s.tool = newTool(id);
        },
      };
    }
    if (!toolEmpty(t) || t.kind === id) return null;
    const other = t.kind;
    return {
      label: `${TOOL_NAME[id]}に持ち替える（${TOOL_NAME[other]}はここに置く）`,
      run: () => {
        s.toolSpots[other] = { ...spot };
        s.toolSpots[id] = null;
        s.tool = newTool(id);
      },
    };
  }

  // 冷蔵庫の中・手の中にあるケース・パックは、作業台の上では使えない（そのケース・パックが台の上に出ているときだけ、中身を取れる）
  private reachable(target: Target): boolean {
    const s = this.state;
    const c = caseOfTarget(target);
    if (c) return s.trays[c] === 'table';
    const bag = this.bagOfTarget(target);
    return !bag || s.bags[bag].at === 'table';
  }

  // 台の上に置いたパックに視点が合っているときの、そのパック（冷凍の袋・モッツァレラの袋。なければ null）
  private bagOfTarget(target: Target | null): BagId | null {
    if (target?.kind === 'frozenBag') return target.id;
    if (target?.kind === 'pizzaSource' && target.id === 'mozzarella') return 'mozzarella';
    return null;
  }

  // 持っている空の道具を、視点が合っている台の天板にべた置きする（置ける場所のときだけ）
  private planToolDown(target: Extract<Target, { kind: 'tableTop' }>): ToolPlan | null {
    const s = this.state;
    if (s.tool?.kind === 'tongs' && s.tool.dish) return this.planRestPlace('tongs', target); // つかんだ器を、台の上に置く
    const p = this.previewTool(target);
    if (!p?.valid) return null;
    return {
      label: `${TOOL_NAME[p.id]}をここに置く`,
      run: () => {
        s.toolSpots[p.id] = { surface: p.surface, x: p.x, z: p.z };
        s.tool = null;
      },
    };
  }

  // 手に持った空の道具を、視点が合っている台の天板に置くとしたら、どこにどう置かれるか（置く前の見せ方にも使う）。
  // 置けるのは、作業台と、左の台の提供台のまわり（layout.ts の toolRestRange）。位置はその範囲に収める。ほかの物に近すぎる場所では valid = false。
  // 道具を持っていない・道具に物が乗っている・台に視点が合っていないときは null
  previewTool(target: Target | null): ToolPreview | null {
    const s = this.state;
    const t = s.tool;
    if (s.phase !== 'playing' || s.moving || s.getaMoving || !t || !toolEmpty(t) || target?.kind !== 'tableTop') return null;
    const { surface } = target;
    const range = toolRestRange(surface);
    if (!range) return { id: t.kind, surface, x: target.x, z: target.z, valid: false, reason: 'surface' };
    const x = Math.min(range.maxX, Math.max(range.minX, target.x));
    const z = Math.min(range.maxZ, Math.max(range.minZ, target.z));
    const blocked = this.flatBlocked(surface, x, z, TOOL_REST.w / 2, TOOL_REST.d / 2, t.kind);
    return { id: t.kind, surface, x, z, valid: !blocked, ...(blocked ? { reason: 'gap' as const } : {}) };
  }

  // 台の上にべた置きした道具（except は除く）が、中心 (x, z)・半分の大きさ (hx, hz) の長方形にかかっているか
  private toolNear(surface: string, x: number, z: number, hx: number, hz: number, except?: ToolId): boolean {
    return (['tongs', 'spatula'] as const).some((id) => {
      const spot = this.state.toolSpots[id];
      return id !== except && spot?.surface === surface && Math.abs(spot.x - x) < TOOL_REST.w / 2 + hx && Math.abs(spot.z - z) < TOOL_REST.d / 2 + hz;
    });
  }

  private planTongs(target: Target): ToolPlan | null {
    const s = this.state;
    switch (target.kind) {
      case 'ovenOutlet': {
        const plan = this.planOutletTake('tongs', target);
        const front = peekDish(s.oven, target.deck, target.lane);
        return plan && front ? { label: `やっとこでつかむ${this.combineNote(itemFromOven(front, target.deck, this.cfg))}`, run: plan.run } : null;
      }
      case 'ovenInlet':
        return this.planInletPlace('tongs', target);
      case 'workFrame': {
        const take = this.planFrameTake('tongs', target.index);
        const frame = s.workFrames[target.index];
        if (take && frame?.kind === 'bakeDish') return { label: `やっとこでつかむ${this.combineNote(frame)}`, run: take };
        return this.planHeldOnFrame('tongs', target.index);
      }
      case 'vesselStack':
      case 'pizzaPanStack':
      case 'panPile':
        return this.planStackReturn('tongs', target);
      case 'pizzaPlate':
        return this.planPizzaPlate('tongs', target.id);
      case 'cookBin':
        return this.planBinEmpty('tongs', target.id);
      case 'restDish': {
        // 台の上に置いた器（クック編 C7）：熱い器をつかむ
        const take = this.planRestTake('tongs', target.id);
        const rest = s.restDishes.find((r) => r.id === target.id);
        return take && rest ? { label: `やっとこでつかむ${this.combineNote(rest.dish)}`, run: take } : null;
      }
    }
    return null;
  }

  // やっとこで器をつかんだら、左手の受け台に乗るか（案内に足す文）
  private combineNote(dish: Item): string {
    const r = this.combineResult(dish, this.state.hand);
    return r ? `（${r.note}）` : '';
  }

  private planSpatula(target: Target, scoop: BakeFinishId | null): ToolPlan | null {
    const s = this.state;
    // 台の上に置いた器からも、すくえる（クック編 C7。のせるのは作業枠の仕上げ中の焼き物だけ）
    if (target.kind === 'restDish') {
      const rest = s.restDishes.find((r) => r.id === target.id);
      return scoop === null && rest ? this.planScoop(rest.dish, (next) => (rest.dish = next)) : null;
    }
    if (target.kind !== 'workFrame') return null;
    const i = target.index;
    const frame = s.workFrames[i];
    if (!frame) return null;
    if (scoop === null) {
      const scrape = this.planScrape(i);
      if (scrape) return scrape;
      return this.planScoop(frame, (next) => (s.workFrames[i] = next));
    }
    if ((frame.kind !== 'bakeDish' && frame.kind !== 'bakePlate') || !canFinishWith(frame, scoop, this.cfg)) return null;
    return {
      label: `${BAKE_FINISH_NAME[scoop]}をのせる`,
      run: () => {
        s.workFrames[i] = withFinish(frame, scoop);
        s.tool = { kind: 'spatula', scoop: null };
        this.say(`${BAKE_FINISH_NAME[scoop]}をのせた`, 'info');
      },
    };
  }

  // 焼けた器から、ヘラで1つすくう（すくえる物は bake.ts の SCOOP_LOADS）。put = 器のあとの形を置き場に戻す
  private planScoop(dish: Item, put: (next: BakeDishItem) => void): ToolPlan | null {
    const s = this.state;
    const sc = scoopOf(dish);
    if (!sc || dish.kind !== 'bakeDish') return null;
    return {
      label: `${BAKE_FINISH_NAME[sc.finish]}を1つすくう`,
      run: () => {
        const rest = { ...(dish.loaded ?? {}), [sc.load]: (dish.loaded?.[sc.load] ?? 0) - 1 };
        const left = Object.values(rest).some((n) => (n ?? 0) > 0);
        // すくい終わって空になった器は、冷めた空の器（左手で持って、棚の山に戻す）
        put(left ? { ...dish, loaded: Object.fromEntries(Object.entries(rest).filter(([, n]) => (n ?? 0) > 0)) } : blankVessel(dish.style, this.cfg));
        s.tool = { kind: 'spatula', scoop: sc.finish };
      },
    };
  }

  // 作業枠の器を、ヘラではがす（1回。次の段階の前に「はがす」が要る器だけ）。F のヘラと、トライアルの素手の左クリックが、同じ決まりを通る
  private planScrape(index: number): ToolPlan | null {
    const s = this.state;
    const frame = s.workFrames[index];
    if (!needsCare(frame, 'scrape')) return null;
    return {
      label: 'ヘラではがす',
      run: () => {
        s.workFrames[index] = { ...frame, cares: [...(frame.cares ?? []), 'scrape'] };
        this.say('はがした', 'info');
      },
    };
  }

  // 作業枠の、板に乗せた焼き上がりに、のせて焼いた容器のソースをかける（bake.ts の CUP_FINISHES。容器は描かなくなる。クック編 C7）
  private planCupPour(index: number): ToolPlan | null {
    const s = this.state;
    const frame = s.workFrames[index];
    if (frame?.kind !== 'bakeDish') return null;
    const cup = cupPourOf(frame, this.cfg);
    if (!cup) return null;
    const name = BAKE_FINISH_NAME[cup.finish];
    return {
      label: `容器の${name}をかける`,
      run: () => {
        s.workFrames[index] = withFinish(frame, cup.finish);
        this.say(`${name}をかけた`, 'info');
      },
    };
  }

  // 手に持ったレードルのソースを、作業枠の板に乗せた焼き上がりにかける（その器の品のどれかが、そのソースを使うとき。canFinishWith。クック編 C7）
  private planLadle(index: number): ToolPlan | null {
    const s = this.state;
    const frame = s.workFrames[index];
    const hand = s.hand;
    if (hand?.kind !== 'sauceLadle' || (frame?.kind !== 'bakeDish' && frame?.kind !== 'bakePlate') || !canFinishWith(frame, hand.id, this.cfg)) return null;
    const name = BAKE_FINISH_NAME[hand.id];
    return {
      label: `${name}をかける`,
      run: () => {
        s.workFrames[index] = withFinish(frame, hand.id);
        s.hand = null;
        this.say(`${name}をかけた`, 'info');
      },
    };
  }

  // 手元で合わせる：やっとこの器と、左手の受け台が合えば、器が受け台に乗る（順番はどちらが先でもよい）。合わなければ null
  //  - 下駄・板：左手が「受け台に乗った器」になり、やっとこは空になる
  //  - ピザのお皿：左手が「ピザの入ったお皿」になり、やっとこに空の鉄板が残る
  //  - 空の小皿：左手が「料理ののった小皿」になり、やっとこに空の器が残る
  // 途中の段階の器は、どれにも乗らない（canTakeBase が、最後の段階の焼き上がりだけを通す）
  private combineResult(dish: Item | null, left: Item | null): { left: Item; tongs: BakeDishItem | null; note: string; done: string } | null {
    if (dish?.kind !== 'bakeDish') return null;
    const base = baseItemOf(left);
    if (base && canTakeBase(dish, base)) {
      const name = BAKE_BASES[base].name;
      return { left: onBase(dish, base), tongs: null, note: `左手の${name}に乗せる`, done: `${name}に乗せた` };
    }
    if (left?.kind === 'pizzaPlate' && !left.dish && canTakeBase(dish, 'pizzaPlate')) {
      const name = BAKE_BASES.pizzaPlate.name;
      return { left: { kind: 'pizzaPlate', dish: plateDishOf(dish) }, tongs: newPan(this.cfg), note: `左手の${name}に移す`, done: `${name}に移した（空の鉄板はやっとこに残る）` };
    }
    if (isEmptySmallPlate(left) && canTakeBase(dish, 'smallPlate')) {
      const name = BAKE_BASES.smallPlate.name;
      return { left: toSmallPlate(dish), tongs: blankVessel(dish.style, this.cfg), note: `左手の${name}に移す`, done: `${name}に移した（空いた${BAKE_DISHES[dish.style].name}はやっとこに残る）` };
    }
    return null;
  }

  private combineHands(): void {
    const s = this.state;
    if (s.tool?.kind !== 'tongs' || !s.tool.dish) return;
    const name = this.finishedName(s.tool.dish);
    const r = this.combineResult(s.tool.dish, s.hand);
    if (!r) return;
    s.hand = r.left;
    s.tool = { kind: 'tongs', dish: r.tongs };
    this.say(`${name}を${r.done}`, 'info');
  }

  // --- 焼き皿の決まり（どちらの手が持っているかを引数に取る。左クリックと F の両方から呼ぶ）---

  // 出口に出てきた皿を、いちばん先のものから1枚取る。この1周ぶんを足した、焼け具合の皿になる（生焼け・焦げもある）
  private planOutletTake(h: HandRef, target: Extract<Target, { kind: 'ovenOutlet' }>): ToolPlan | null {
    const s = this.state;
    if (this.held(h) || !canTakeDish(s.oven, target.deck, target.lane)) return null;
    return {
      label: '出口の器を取る',
      run: () => {
        const dish = takeDish(s.oven, target.deck, target.lane);
        if (!dish) return;
        const item = this.fromOutlet(itemFromOven(dish, target.deck, this.cfg));
        this.setHeld(h, item);
        if (item.state === 'burnt') this.say('焦げた！ 提供できない（右クリックで捨てる）', 'bad');
        else if (item.state === 'half') this.say('生焼け（もう一度、入口に流して焼く）', 'info');
      },
    };
  }

  // 出口から取った器。油のはねる器（鉄板）は、取った時刻を覚える（油のはねる演出だけに使う。bake.ts の isSizzling。クック編 C7）
  private fromOutlet(item: BakeDishItem): BakeDishItem {
    return BAKE_VESSELS[item.style].sizzle ? { ...item, outAt: this.state.time } : item;
  }

  // 台の上に置いた器（クック編 C7）を持ち上げる（その手が空のとき）。やっとこでつかめるのは、熱い器だけ。
  // 熱い器の決まりがオンのとき、熱い器は素手では持てない（planInteract が理由を出す）
  private planRestTake(h: HandRef, id: number): Action | null {
    const s = this.state;
    const rest = s.restDishes.find((r) => r.id === id);
    if (!rest || this.held(h)) return null;
    if (h === 'tongs' && !isHot(rest.dish)) return null;
    return () => {
      this.setHeld(h, rest.dish);
      s.restDishes = s.restDishes.filter((r) => r !== rest);
    };
  }

  // その手の器を、視点が合っている台の天板に置く（置ける場所のとき。作業枠に置ける3列系の器で、受け台に乗せていない物）
  private planRestPlace(h: HandRef, target: Target | null): ToolPlan | null {
    const s = this.state;
    const p = this.previewRest(h, target);
    const item = this.held(h);
    if (!p?.valid || item?.kind !== 'bakeDish') return null;
    return {
      label: '器をここに置く',
      run: () => {
        s.restDishes.push({ id: this.nextRestId++, spot: { surface: p.surface, x: p.x, z: p.z }, dish: item });
        this.setHeld(h, null);
      },
    };
  }

  // その手に持った器を、視点が合っている台の天板に置くとしたら、どこにどう置かれるか。置けるのは作業台と、左の台の提供台のまわり（layout.ts の flatRange）。
  // 持っているのが置ける器でない・台に視点が合っていないときは null
  previewRest(h: HandRef, target: Target | null): RestPreview | null {
    const s = this.state;
    const item = this.held(h);
    if (s.phase !== 'playing' || s.moving || s.getaMoving || target?.kind !== 'tableTop') return null;
    if (item?.kind !== 'bakeDish' || baseOf(item) !== null || !fitsWorkFrame(item)) return null;
    const { surface } = target;
    const hx = REST_DISH.w / 2;
    const hz = REST_DISH.d / 2;
    const range = flatRange(surface, hx, hz);
    if (!range) return { surface, x: target.x, z: target.z, valid: false, reason: 'surface' };
    const x = Math.min(range.maxX, Math.max(range.minX, target.x));
    const z = Math.min(range.maxZ, Math.max(range.minZ, target.z));
    return this.flatBlocked(surface, x, z, hx, hz) ? { surface, x, z, valid: false, reason: 'gap' } : { surface, x, z, valid: true };
  }

  // 台の上に平たく置く物（中心 (x, z)、半分の大きさ (hx, hz)）が、ほかの置き物・もとからある物にかかるか（exceptTool = 置こうとしている道具は除く）
  private flatBlocked(surface: string, x: number, z: number, hx: number, hz: number, exceptTool?: ToolId): boolean {
    const s = this.state;
    const near = (spot: TableSpot | null, ox: number, oz: number) => spot?.surface === surface && Math.abs(spot.x - x) < ox + hx && Math.abs(spot.z - z) < oz + hz;
    return (
      BOTTLE_IDS.some((id) => near(s.bottles[id], 0.06, 0.06)) ||
      FREE_TRAY_IDS.some((id) => s.trays[id] === 'table' && near(s.freeTraySpot[id], 0.17, 0.17)) ||
      (!s.getaMoving && near(s.getaSpot, GETA.d / 2, GETA.w / 2)) ||
      this.propNearRect(surface, x, z, hx, hz) ||
      this.toolNear(surface, x, z, hx, hz, exceptTool) ||
      this.restNear(surface, x, z, hx, hz) ||
      this.bagNear(surface, x, z, hx, hz) ||
      (surface === 'left' && (overlapsLeftFixture(x, z, hx, hz) || overlapsServePass(x, z, hx, hz))) ||
      (surface === 'prep' && overlapsPrepFixture(x, z, hx, hz))
    );
  }

  // 手に持ったパックを、視点が合っている作業台の天板に置くとしたら、どこにどう置かれるか。作業台のトレー置き場・作業枠・組み立て台・ほかの置き物には重ねられない
  previewBag(target: Target | null): RestPreview | null {
    const s = this.state;
    if (s.phase !== 'playing' || s.hand?.kind !== 'packBag' || target?.kind !== 'tableTop') return null;
    const { surface } = target;
    const range = surface === 'prep' ? flatRange(surface, BAG_REST.w / 2, BAG_REST.d / 2) : null;
    if (!range) return { surface, x: target.x, z: target.z, valid: false, reason: 'surface', size: { ...BAG_REST } };
    const x = Math.min(range.maxX, Math.max(range.minX, target.x));
    const z = Math.min(range.maxZ, Math.max(range.minZ, target.z));
    const size = { ...BAG_REST };
    return this.flatBlocked(surface, x, z, BAG_REST.w / 2, BAG_REST.d / 2) ? { surface, x, z, valid: false, reason: 'gap', size } : { surface, x, z, valid: true, size };
  }

  // 台の上に置いたパックが、中心 (x, z)・半分の大きさ (hx, hz) の長方形にかかっているか
  private bagNear(surface: string, x: number, z: number, hx: number, hz: number): boolean {
    return BAG_IDS.some((id) => {
      const p = this.state.bags[id];
      return p.at === 'table' && p.spot.surface === surface && Math.abs(p.spot.x - x) < BAG_REST.w / 2 + hx && Math.abs(p.spot.z - z) < BAG_REST.d / 2 + hz;
    });
  }

  // 台の上に置いた器が、中心 (x, z)・半分の大きさ (hx, hz) の長方形にかかっているか
  private restNear(surface: string, x: number, z: number, hx: number, hz: number): boolean {
    return this.state.restDishes.some((r) => r.spot.surface === surface && Math.abs(r.spot.x - x) < REST_DISH.w / 2 + hx && Math.abs(r.spot.z - z) < REST_DISH.d / 2 + hz);
  }

  // 焼く前の皿を、入口のベルトの視点が合っている場所に置く（ほかの皿に重ならないとき）。置くと、ベルトで流れていく
  // 段階焼き：焼く前・生焼けは、いまの段階の続き（秒数は合計）。焼き上がりで次の段階がある皿は、秒数を 0 に戻して次の段階へ（bake.ts の flowPlan）
  private planInletPlace(h: HandRef, target: Extract<Target, { kind: 'ovenInlet' }>): ToolPlan | null {
    const s = this.state;
    const item = this.held(h);
    const p = this.previewOvenOf(h, target);
    if (item?.kind !== 'bakeDish' || !p?.valid) return null;
    const plan = flowPlan(item);
    if (!plan.ok) return null;
    return {
      label: `ここに流す（${OVEN_DECK_NAME[target.deck]}）`,
      run: () => {
        placeDish(s.oven, target.deck, item.style, p, plan.cooked, item.pizza, { ...item, stage: plan.stage });
        this.setHeld(h, null);
        this.say(`${OVEN_DECK_NAME[target.deck]}に流した（${dishTitle(plan.dishes, plan.stage)}。ジェットに入る手前から ${bakeTime(target.deck, this.cfg)}秒）`, 'info');
      },
    };
  }

  // 作業枠の物を持ち上げる（その手が空のとき）。やっとこでつかめるのは、熱い器だけ
  private planFrameTake(h: HandRef, index: number): Action | null {
    const s = this.state;
    const frame = s.workFrames[index];
    if (!frame || this.held(h)) return null;
    if (h === 'tongs' && !isHot(frame)) return null;
    return () => {
      this.setHeld(h, frame);
      s.workFrames[index] = null;
    };
  }

  // 手の物を作業枠に置く・枠の物と合わせる：空いた枠に置く、焼き上がった器の中身を小皿に移す、焼き上がった器を受け台に乗せる（枠の上に残る）
  private planHeldOnFrame(h: HandRef, index: number): ToolPlan | null {
    const s = this.state;
    const frame = s.workFrames[index];
    const item = this.held(h);
    if (frame === undefined || !item) return null;
    if (!frame) {
      if (!fitsWorkFrame(item)) return null;
      return {
        label: '作業枠に置く',
        run: () => {
          s.workFrames[index] = item;
          this.setHeld(h, null);
        },
      };
    }
    // 焼き上がった器の中身を、小皿に移す（小皿が枠にあっても、器が枠にあってもよい。器は空になって手に残る。クック編 C6）
    const moved = this.framePlatePlan(frame, item);
    if (moved) {
      return {
        label: `${this.finishedName(moved.from)}を${BAKE_BASES.smallPlate.name}に移す`,
        run: () => {
          s.workFrames[index] = toSmallPlate(moved.from);
          this.setHeld(h, blankVessel(moved.from.style, this.cfg));
          this.say(`${this.finishedName(moved.from)}を${BAKE_BASES.smallPlate.name}に移した（空いた${BAKE_DISHES[moved.from.style].name}は棚に戻す）`, 'info');
        },
      };
    }
    const plan = this.frameBasePlan(frame, item);
    if (!plan) return null;
    return {
      label: `${this.finishedName(plan.dish)}を${BAKE_BASES[plan.base].name}に乗せる`,
      run: () => {
        s.workFrames[index] = onBase(plan.dish, plan.base);
        this.setHeld(h, null);
      },
    };
  }

  // 空の器を山に戻す：棚の空の器の山（同じ器）、ピザの鉄板のスタック（空きがあるとき）、台の上の鉄板の山（積む）
  private planStackReturn(h: HandRef, target: Target): ToolPlan | null {
    const s = this.state;
    const item = this.held(h);
    if (!item) return null;
    const back = (label: string, after?: Action): ToolPlan => ({
      label,
      run: () => {
        after?.();
        this.setHeld(h, null);
      },
    });
    if (target.kind === 'vesselStack') return isBlankVessel(item, target.style) ? back(`${BAKE_DISHES[target.style].name}を山に戻す`) : null;
    const pan = isEmptyPan(item) && !item.pizza?.dough;
    if (target.kind === 'pizzaPanStack') return pan && s.pizzaPanStock < this.cfg.pizzaPanCount ? back('鉄板をスタックに戻す', () => s.pizzaPanStock++) : null;
    if (target.kind === 'panPile') {
      if (!s.panPile || !pan || s.panPile.count >= this.cfg.pizzaPanCount) return null;
      return back('鉄板を積む', () => {
        if (s.panPile) s.panPile.count++;
      });
    }
    return null;
  }

  // 台の上のピザのお皿に、焼き上がったピザを入れる（鉄板だけが手に残る）
  private planPizzaPlate(h: HandRef, plateId: number): ToolPlan | null {
    const s = this.state;
    const item = this.held(h);
    const plate = s.pizzaPlates.find((p) => p.id === plateId);
    if (!plate || plate.dish || item?.kind !== 'bakeDish' || !canTakeBase(item, 'pizzaPlate')) return null;
    return {
      label: 'ピザをお皿に移す',
      run: () => {
        plate.dish = plateDishOf(item);
        this.setHeld(h, newPan(this.cfg));
        this.say(`ピザをお皿に入れた（鉄板は、台に積むか、そのままピザに使える）`, 'info');
      },
    };
  }

  // 下調理の焼き上がりを、ストック容器に空ける（手には空の器が残る。設計書 4.5 の本来の形は、やっとこで F。素手の左クリックは、熱い器を素手で持てるとき（トライアルなど）の代用）
  private planBinEmpty(h: HandRef, id: CookBinId): ToolPlan | null {
    const s = this.state;
    const item = this.held(h);
    const y = emptyYield(item, id, this.cfg);
    if (!y || item?.kind !== 'bakeDish') return null;
    return {
      label: `${PREP_STOCKS[y.stock].name}を容器に空ける（+${y.add}）`,
      run: () => {
        s.prepStock[y.stock] += y.add;
        this.setHeld(h, blankVessel(item.style, this.cfg));
        this.say(`${PREP_STOCKS[y.stock].name}をストックに空けた（+${y.add}。${PREP_STOCKS[y.stock].name} ${s.prepStock[y.stock]}）`, 'good');
      },
    };
  }

  // 茹で麺器をダブルクリック（のびかけ → ショート茹で）
  doubleClick(target: Target): void {
    this.planDoubleClick(target)?.();
  }

  // 右クリック：
  //  - 冷蔵庫の中の物を持ち上げている最中：棚に視点が合っていればそこに置く。それ以外ならやめる
  //  - 手が空で、サラダ台のトレー置き場に置いたトレー・ケース（台の上に置いたガーリック・唐辛子の容器も）に視点が合っていれば、それを手に持ち上げる（左クリックで別の置き場・場所に置き直せる）
  //  - 下駄の山を持ち上げている最中：台に視点が合っていればそこに置く。それ以外ならやめる
  //  - 手が空で、下駄の山に視点が合っていれば、山ごと持ち上げる
  //  - 扉が開いていて、冷蔵庫の中の物に視点が合っていれば、その物を持ち上げる（棚の好きな場所に置き直せる）
  //  - 冷蔵庫の扉・棚・本体に視点が合っていれば、扉を開閉する
  //  - iPad を持っていれば、画面を開く（ゲーム開始・レシピ）
  //  - 鍋を持っていれば、視線の向きに投げる（aim があるとき）。落ちた鍋は左クリックで拾える
  //  - ボトルを持っていれば、皿にかける。それ以外は、手に持っている物を捨てる
  // aim: 視点の位置と向き（投げる向き）。省略すると、鍋は投げられない
  rightClick(target: Target | null, aim: ThrowAim | null = null): void {
    const s = this.state;
    if (s.phase !== 'playing') return;
    if (s.moving) {
      this.placeMoving(target);
      return;
    }
    if (s.getaMoving) {
      this.placeGeta(target);
      return;
    }
    if (s.hand?.kind === 'ipad') {
      s.ipadOpen = true;
      return;
    }
    if (s.hand?.kind === 'pot' && aim) {
      s.thrownPots.push(launchPot(this.nextThrownId++, s.hand.pot, aim));
      s.hand = null;
      return;
    }
    // サラダ台に置いたトレー・ケースを、手が空なら持ち上げる（別の置き場に置き直せる）
    const placed = this.placedTrayOf(target);
    // （ピザチーズのケースは、右クリックで1/2杯を取る操作が先。ケースごと持ち上げる操作は、手が空でないときにはない）
    if (!s.hand && placed && !(caseOfTarget(target) && this.planRightClick(target))) {
      s.hand = { kind: 'tray', id: placed };
      s.trays[placed] = 'hand';
      const where = isFreeTray(placed) ? '台の上に視点を合わせて左クリックで置く' : '置き場に視点を合わせて左クリックで置く';
      this.say(`${TRAY_NAME[placed]}を持ち上げた（${where}）`, 'info');
      return;
    }
    // 台の上に置いたパックを、手が空なら持ち上げる（別の場所に置き直せる）
    const placedBag = this.bagOfTarget(target);
    if (!s.hand && placedBag && s.bags[placedBag].at === 'table') {
      s.hand = { kind: 'packBag', id: placedBag };
      s.bags[placedBag] = { at: 'hand' };
      this.say(`${FRIDGE_ITEM_NAME[BAG_FRIDGE_ITEM_OF(placedBag)]}を持ち上げた（作業台に視点を合わせて左クリックで置く）`, 'info');
      return;
    }
    // 手が空で、使い終わった鉄板の山に視点が合っていれば、山ごと持ち上げる（台に置き直す・ストックが0のとき作業台の鉄板のスタックに戻す）
    if (!s.hand && target?.kind === 'panPile' && s.panPile) {
      s.hand = { kind: 'panPile', count: s.panPile.count };
      s.panPile = null;
      this.say(`使い終わった鉄板を${s.hand.count}枚持ち上げた（台に置く／鉄板のスタックが0枚なら、戻して再利用できる）`, 'info');
      return;
    }
    // 手が空で、下駄の山に視点が合っていれば、山ごと持ち上げる（台に右クリックで置き直せる）
    if (!s.hand && target?.kind === 'getaStack') {
      s.getaMoving = true;
      this.say('下駄を持ち上げた（台に視点を合わせて右クリックで置く）', 'info');
      return;
    }
    const item = fridgeItemOf(target);
    if (item && this.isInFridge(item) && s.fridgeOpen[s.fridgeItems[item].unit]) {
      s.moving = item;
      this.say(`${FRIDGE_ITEM_NAME[item]}を持ち上げた（棚に視点を合わせて右クリックで置く）`, 'info');
      return;
    }
    const unit = this.fridgeUnitOf(target);
    if (unit !== null) {
      s.fridgeOpen[unit] = !s.fridgeOpen[unit];
      return;
    }
    // 逆さまに入れる物（cookStock.ts の FLIP_LOADS）を持って作業枠の器 → 逆さまに入れる。手が空でピザチーズの容器 → 1/2杯取る（クック編 C6）
    const special = this.planRightClick(target);
    if (special) {
      special();
      return;
    }
    // 作業枠の器に視点が合っていて、逆さまに入れられないときは、捨てずに理由を出す（右クリックは捨てる操作でもあるため）
    const flip = flipLoadOf(s.hand);
    const frame = target?.kind === 'workFrame' ? s.workFrames[target.index] : null;
    if (flip && frame?.kind === 'bakeDish' && isPourHand(s.hand)) {
      this.say(`逆さまに入れられない（${whyNotPour(frame, s.hand, flip)}）`, 'bad');
      return;
    }
    if (this.state.hand?.kind === 'bottle') {
      this.useBottle(target);
      return;
    }
    this.discard();
  }

  // 右クリックでできる、クックの操作（クック編 C6）。できなければ null（ほかの右クリックの決まりへ）。
  //  - 逆さまに入れる物（cookStock.ts の FLIP_LOADS）を持って、作業枠の器に視点が合っている：逆さまに入れる（左クリックは、ふつうの向き）
  //  - 手が空で、ピザチーズの容器（SOURCE_RIGHT_TAKE の容器）に視点が合っている：レードル半分を取る（左クリックは1杯）
  planRightClick(target: Target | null): Action | null {
    const s = this.state;
    if (s.phase !== 'playing' || !target || s.moving || s.getaMoving) return null;
    const hand = s.hand;
    const flip = flipLoadOf(hand);
    if (flip && target.kind === 'workFrame') {
      const frame = s.workFrames[target.index];
      if (frame?.kind !== 'bakeDish') return null;
      const poured = pourInto(frame, hand, flip);
      if (!poured) return null;
      return () => {
        s.workFrames[target.index] = poured.dish;
        s.hand = poured.hand;
        this.say(`${BAKE_LOAD_NAME[flip].name}を入れた（平らな面が上）`, 'info');
      };
    }
    if (target.kind === 'pizzaSource' && !hand) {
      const load = rightTakeOf(target.id);
      if (!load) return null;
      return () => (s.hand = { kind: 'loadStack', id: load, count: 1 });
    }
    return null;
  }

  // 視点が合っているものが、どちらの冷蔵庫か（扉・棚板・中の物。冷蔵庫でなければ null）。扉の開閉の対象を決める
  fridgeUnitOf(target: Target | null): FridgeUnit | null {
    if (!target) return null;
    if (target.kind === 'fridgeDoor' || target.kind === 'fridgeShelf') return target.unit ?? 0;
    const item = fridgeItemOf(target);
    return item ? this.state.fridgeItems[item].unit : null; // 取ったトレー・ケースは、最後にあった冷蔵庫
  }

  // 冷蔵庫の中の物（stock / fridgeTray）が入っている冷蔵庫の扉が開いているか
  private fridgeDoorOpenFor(target: Target): boolean {
    const item = fridgeItemOf(target);
    return item ? this.state.fridgeOpen[this.state.fridgeItems[item].unit] : false;
  }

  // 冷蔵庫の中にある物か（トレー・ケースは、取ったあとは冷蔵庫にない）
  private isInFridge(id: FridgeItemId): boolean {
    const tray = trayOfFridgeItem(id);
    if (tray) return this.state.trays[tray] === 'fridge';
    const bag = bagOfFridgeItem(id);
    if (bag) return this.state.bags[bag].at === 'fridge';
    const bottle = bottleOfFridgeItem(id);
    return bottle ? this.bottleInFridge(bottle) : true;
  }

  // 冷蔵庫にしまってあるボトルが、いま冷蔵庫の中にあるか（台の上にも、手の中にもない）
  private bottleInFridge(id: BottleId): boolean {
    const { hand, bottles } = this.state;
    return id in BOTTLE_FRIDGE_ITEM && bottles[id] === null && !(hand?.kind === 'bottle' && hand.id === id);
  }

  // 視点が合っているトレー置き場に置いてあるトレー・ケース（なければ null。HUD の案内に使う）
  trayAtSlot(target: Target | null): TrayId | null {
    return target?.kind === 'traySlot' ? trayAt(this.state, target.id, target.spot ?? 0) : null;
  }

  // 視点が合っている、台に置いてあるトレー・ケース（置き場に置いた物も、台の上のどこかに置いた容器も。なければ null）
  placedTrayOf(target: Target | null): TrayId | null {
    if (target?.kind === 'tableTray') return this.state.trays[target.id] === 'table' ? target.id : null;
    const c = caseOfTarget(target);
    if (c) return this.state.trays[c] === 'table' ? c : null; // 作業台に置いたケース
    return this.trayAtSlot(target);
  }

  // 持ち上げた物を、視点が合っている棚に置くとしたら、どこにどう置かれるか。
  // 位置は棚板の内側に収める。同じ棚のほかの物に重なると valid = false
  previewFridge(target: Target | null): FridgePreview | null {
    const s = this.state;
    if (s.phase !== 'playing' || !s.moving) return null;
    const at = this.shelfPointOf(target);
    if (!at) return null;
    const item = s.moving;
    const { x, z } = clampOnShelf(item, at.x, at.z);
    const spot: FridgeSpot = { unit: at.unit, shelf: at.shelf, x, z };
    const others = FRIDGE_ITEM_IDS.filter((id) => this.isInFridge(id)).map((id) => ({ id, spot: s.fridgeItems[id] }));
    return { item, unit: at.unit, shelf: at.shelf, x, z, valid: fitsOnShelf(item, spot, others) };
  }

  // 視点が合っている物を、棚の上の点として読む。棚板ならその点、別の物ならその物の位置（＝重なるので置けない）。それ以外は null
  private shelfPointOf(target: Target | null): FridgeSpot | null {
    if (target?.kind === 'fridgeShelf') return { unit: target.unit ?? 0, shelf: target.shelf, x: target.x, z: target.z };
    const other = fridgeItemOf(target);
    return other && other !== this.state.moving && this.isInFridge(other) ? this.state.fridgeItems[other] : null;
  }

  // 持ち上げている物を置く（棚に視点が合っていて、置ける場所のとき）。それ以外の右クリックは、置き直しをやめる
  private placeMoving(target: Target | null): void {
    const s = this.state;
    const item = s.moving;
    if (!item) return;
    if (this.shelfPointOf(target)) {
      const p = this.previewFridge(target);
      if (p?.valid) {
        s.fridgeItems[item] = { unit: p.unit, shelf: p.shelf, x: p.x, z: p.z };
        s.moving = null;
        this.say(`${FRIDGE_ITEM_NAME[item]}を置いた`, 'info');
      } else {
        this.say('ここには置けない（ほかの物に重なる）', 'bad');
      }
      return;
    }
    s.moving = null; // 棚以外への右クリック：もとの場所に戻す
    this.say('置き直しをやめた', 'info');
  }

  // 下駄の山（台の上）が、点（surface, x, z）から pad だけ離れた範囲にかかっているか。持ち上げている間は、台の上にないので false
  private getaNear(surface: string, x: number, z: number, pad: number): boolean {
    const { getaSpot, getaMoving } = this.state;
    if (getaMoving || getaSpot.surface !== surface) return false;
    return Math.abs(getaSpot.x - x) < GETA.d / 2 + pad && Math.abs(getaSpot.z - z) < GETA.w / 2 + pad;
  }

  // ピザのお皿・使い終わった鉄板の山・ピザのお皿の山（丸い物。半径 PIZZA_PLATE_R）が、点（surface, x, z）から r だけ離れた範囲にかかっているか
  private propNear(surface: string, x: number, z: number, r: number): boolean {
    const s = this.state;
    const spots = [...s.pizzaPlates.map((p) => p.spot), ...(s.panPile ? [s.panPile.spot] : []), PIZZA_PLATE_STACK];
    return spots.some((c) => c.surface === surface && Math.hypot(c.x - x, c.z - z) < PIZZA_PLATE_R + r);
  }

  // 同じく、中心が (x, z)、半分の大きさが (hx, hz) の長方形（下駄の山）にかかっているか
  private propNearRect(surface: string, x: number, z: number, hx: number, hz: number): boolean {
    const s = this.state;
    const spots = [...s.pizzaPlates.map((p) => p.spot), ...(s.panPile ? [s.panPile.spot] : []), PIZZA_PLATE_STACK];
    return spots.some((c) => c.surface === surface && Math.abs(c.x - x) < PIZZA_PLATE_R + hx && Math.abs(c.z - z) < PIZZA_PLATE_R + hz);
  }

  // 手に持ったピザのお皿・空の鉄板（またはその山）を、視点が合っている台の天板に置くとしたら、どこにどう置かれるか。
  // 置けるのは、左の台の、提供台の左のあき地と、作業台（具材台の天板。layout.ts の propRange）。位置はその範囲に収める。
  // ほかの物（作業台にもとから置いてある物も）に近すぎる場所では valid = false。鉄板の山は1つだけ（もうあるときは、その山に積む）
  previewProp(target: Target | null): PropPreview | null {
    const s = this.state;
    const hand = s.hand;
    if (s.phase !== 'playing' || target?.kind !== 'tableTop') return null;
    const what = hand?.kind === 'pizzaPlate' ? 'plate' : hand && isEmptyPan(hand) && !hand.pizza?.dough ? 'pan' : hand?.kind === 'panPile' ? 'panPile' : null;
    if (!what) return null;
    const r = PIZZA_PLATE_R;
    const { surface } = target;
    const range = propRange(surface);
    if (!range) return { what, surface, x: target.x, z: target.z, r, valid: false, reason: 'surface' };
    const x = Math.min(range.maxX, Math.max(range.minX, target.x));
    const z = Math.min(range.maxZ, Math.max(range.minZ, target.z));
    if (what === 'pan' && s.panPile) return { what, surface, x, z, r, valid: false, reason: 'pile' };
    const blocked =
      BOTTLE_IDS.some((id) => {
        const spot = s.bottles[id];
        return spot?.surface === surface && Math.hypot(spot.x - x, spot.z - z) < r + 0.07;
      }) ||
      FREE_TRAY_IDS.some((id) => {
        const spot = s.freeTraySpot[id];
        return s.trays[id] === 'table' && spot.surface === surface && Math.hypot(spot.x - x, spot.z - z) < r + 0.17;
      }) ||
      this.getaNear(surface, x, z, r) ||
      this.propNear(surface, x, z, r) ||
      this.toolNear(surface, x, z, r, r) ||
      this.restNear(surface, x, z, r, r) ||
      this.bagNear(surface, x, z, r, r) ||
      (surface === 'left' && overlapsLeftFixture(x, z, r, r, true)) ||
      (surface === 'prep' && overlapsPrepFixture(x, z, r));
    return { what, surface, x, z, r, valid: !blocked, ...(blocked ? { reason: 'gap' as const } : {}) };
  }

  // 持ち上げた下駄の山を、視点が合っている台の天板に置くとしたら、どこにどう置かれるか。
  // 位置は置ける範囲（layout.ts の GETA_RANGE）に収める。左の台以外や、ボトル・容器に近すぎる場所では valid = false
  previewGeta(target: Target | null): GetaPreview | null {
    const s = this.state;
    if (s.phase !== 'playing' || !s.getaMoving || target?.kind !== 'tableTop') return null;
    const { surface } = target;
    const x = Math.min(GETA_RANGE.maxX, Math.max(GETA_RANGE.minX, target.x));
    const z = Math.min(GETA_RANGE.maxZ, Math.max(GETA_RANGE.minZ, target.z));
    if (surface !== GETA_HOME.surface) return { surface, x, z, valid: false, reason: 'surface' };
    const hx = GETA.d / 2;
    const hz = GETA.w / 2;
    const blocked =
      BOTTLE_IDS.some((id) => {
        const spot = s.bottles[id];
        return spot?.surface === surface && Math.abs(spot.x - x) < hx + 0.06 && Math.abs(spot.z - z) < hz + 0.06;
      }) ||
      this.propNearRect(surface, x, z, hx, hz) ||
      this.toolNear(surface, x, z, hx, hz) ||
      this.restNear(surface, x, z, hx, hz) ||
      overlapsLeftFixture(x, z, hx, hz) ||
      FREE_TRAY_IDS.some((id) => {
        const spot = s.freeTraySpot[id];
        return s.trays[id] === 'table' && spot.surface === surface && Math.abs(spot.x - x) < hx + 0.19 && Math.abs(spot.z - z) < hz + 0.19;
      });
    return blocked ? { surface, x, z, valid: false, reason: 'gap' } : { surface, x, z, valid: true };
  }

  // 持ち上げている下駄の山を置く（台に視点が合っていて、置ける場所のとき）。それ以外の右クリックは、置き直しをやめる
  private placeGeta(target: Target | null): void {
    const s = this.state;
    if (target?.kind === 'tableTop') {
      const p = this.previewGeta(target);
      if (p?.valid) {
        s.getaSpot = { surface: p.surface, x: p.x, z: p.z };
        s.getaMoving = false;
        this.say('下駄を置いた', 'info');
      } else {
        this.say(p?.reason === 'surface' ? 'ここには置けない（提供台の左の台にだけ置ける）' : 'ここには置けない（ボトル・容器に近すぎる）', 'bad');
      }
      return;
    }
    s.getaMoving = false;
    this.say('置き直しをやめた', 'info');
  }

  // ピザの材料・鉄板・組み立て台に視点が合っているときの案内（HUD 用）。関係なければ null
  pizzaHint(target: Target | null): string | null {
    const { hand, pizzaSlots } = this.state;
    switch (target?.kind) {
      case 'pizzaDoughStack':
        if (!hand) return '左クリック：ピザ生地を取る';
        if (hand.kind === 'pizzaDough') return '左クリック：ピザ生地を戻す（鉄板のスタックに生地をのせてもよい）';
        if (isEmptyPan(hand)) return '左クリック：鉄板にピザ生地をセットする';
        return null;
      case 'pizzaPanStack': {
        const left = this.state.pizzaPanStock;
        if (!hand) return left > 0 ? `左クリック：ピザの鉄板を取る（残り${left}枚）` : '鉄板がない（積んだ鉄板の山を右クリックで持ち上げて、ここに戻す）';
        if (hand.kind === 'pizzaDough') return left > 0 ? `左クリック：鉄板の上にピザ生地をセットする（鉄板 残り${left}枚）` : '鉄板がない（積んだ鉄板を戻す）';
        if (isEmptyPan(hand) && !hand.pizza?.dough) return left < this.cfg.pizzaPanCount ? '左クリック：鉄板を戻す' : null;
        if (hand.kind === 'panPile') return left < this.cfg.pizzaPanCount ? `左クリック：鉄板を戻す（再利用。残り${left}枚 → 最大${this.cfg.pizzaPanCount}枚）` : `スタックはいっぱい（${this.cfg.pizzaPanCount}枚）`;
        return null;
      }
      case 'pizzaPlateStack':
        if (!hand) return '左クリック：ピザのお皿を1枚取る（台のどこかに置く）';
        if (hand.kind === 'pizzaPlate' && !hand.dish) return '左クリック：お皿を戻す';
        return null;
      case 'pizzaPlate': {
        const plate = this.state.pizzaPlates.find((p) => p.id === target.id);
        if (!plate) return null;
        if (!hand) return plate.dish ? `ピザのお皿（${pizzaTitle(plate.dish.pizza)}）　左クリック：持ち上げる（提供台へ）` : 'ピザのお皿（空）　左クリック：持ち上げる';
        if (hand.kind === 'bakeDish' && hand.style === 'pizza') {
          if (plate.dish) return 'もうピザが入っている';
          if (canTakeBase(hand, 'pizzaPlate')) return '左クリック：焼き上がったピザをお皿に入れる（鉄板は手に残る）';
          return hand.state === 'burnt' ? '焦げているので、お皿には入れられない（右クリックで捨てる）' : '焼き上がったピザだけ、お皿に入れられる';
        }
        return null;
      }
      case 'panPile':
        if (hand && isEmptyPan(hand) && !hand.pizza?.dough) return '左クリック：鉄板を積む';
        if (!hand) return `積んだ鉄板（${this.state.panPile?.count ?? 0}枚）　右クリック：山ごと持ち上げる`;
        return null;
      case 'tableTop': {
        const p = this.previewProp(target);
        if (!p) {
          const r = this.previewRest('left', target);
          if (!r) return null;
          if (r.valid) return `左クリック：${describeItem(hand)}をここに置く`;
          return r.reason === 'surface' ? 'ここには置けない（提供台の左の台か、作業台の上にだけ置ける）' : 'ここには置けない（ほかの物に近すぎる）';
        }
        const name = p.what === 'plate' ? 'お皿' : p.what === 'pan' ? '鉄板' : '鉄板の山';
        if (p.valid) return p.what === 'pan' ? '左クリック：ここに置く（鉄板の山になる）' : `左クリック：${name}をここに置く`;
        if (p.reason === 'surface') return 'ここには置けない（提供台の左の台か、作業台の上にだけ置ける）';
        if (p.reason === 'pile') return '鉄板の山がもうある（山に視点を合わせて積む）';
        return 'ここには置けない（ほかの物に近すぎる）';
      }
      case 'pizzaSource': {
        const name = PIZZA_TOPPING_NAME[target.id];
        const unit = target.id === 'mozzarella' ? '1個' : '1杯';
        if (unusedPizzaSource(target)) return `${name}（準備中。まだ伝票に出ない品の具）`;
        const half = rightTakeOf(target.id); // 右クリックで取る量（ピザチーズ1/2杯。クック編 C6）
        if (!hand) return half ? `左クリック：${name}を${unit}取る　右クリック：${BAKE_LOAD_NAME[half].name}を取る` : `左クリック：${name}を${unit}取る`;
        if (hand.kind === 'pizzaTopping' && hand.id === target.id) return `左クリック：${name}を戻す`;
        if (cupFillWith(hand, target.id)) return `左クリック：小さい容器に${name}を${unit}入れる`;
        if (hand.kind === 'sauceCup') {
          const next = cupNext(hand.fill);
          return next ? `小さい容器には、先に${PIZZA_TOPPING_NAME[next]}を入れる` : '小さい容器は、もう入れ終わった（鉄板の空きにのせる）';
        }
        if (hand.kind === 'loadStack' && hand.id === SOURCE_RIGHT_TAKE[target.id]) return `左クリック：${BAKE_LOAD_NAME[hand.id].name}を戻す`;
        return null;
      }
      case 'pizzaSlot': {
        const slot = pizzaSlots[target.index];
        if (slot === undefined) return null;
        if (!slot) {
          if (fitsPizzaSlot(hand)) return hand.style === 'pizza' ? '左クリック：鉄板をここに置く' : `左クリック：${BAKE_DISHES[hand.style].name}をここに置く`;
          return hand ? 'ピザ組み立て台（空き。焼く前の鉄板を置く）' : 'ピザ組み立て台（空き）。鉄板を取って、ここに置く';
        }
        if (isPourHand(hand)) return pourHint(slot, hand);
        if (!BAKE_VESSELS[slot.style].pizzaBuild) return hand ? null : `${describeItem(slot)}　左クリック：持ち上げる`;
        const p = pizzaOf(slot);
        if (hand?.kind === 'pizzaDough') return p.dough ? 'もう生地がのっている' : '左クリック：ピザ生地をのせる';
        if (hand?.kind === 'pizzaTopping') {
          const why = whyNotTopping(p, hand.id);
          if (why) return `のせられない（${why}）`;
          if (isPizzaTop(hand.id)) return `左クリック：${PIZZA_TOPS[hand.id].verb}`;
          return hand.id === 'mozzarella' ? '左クリック：モッツァレラを3つ分に分けて、周囲にのせる' : hand.id === 'sauce' ? '左クリック：ピザソースを塗る' : '左クリック：ピザチーズを広げる';
        }
        if (!hand) return `${pizzaTitle(p)}　左クリック：持ち上げる`;
        return null;
      }
    }
    return null;
  }

  // 冷凍の袋・ストック容器に視点が合っているときの案内（HUD 用。クック編 C5）。関係なければ null
  stockHint(target: Target | null): string | null {
    const { hand, prepStock, difficulty } = this.state;
    if (target?.kind === 'frozenBag') return bagHint(hand, target.id, this.cfg);
    if (target?.kind === 'cookBin') return binHint(hand, target.id, prepStock, configFor(this.cfg, difficulty));
    return null;
  }

  // 下駄・焼き上がったドリアに関する案内（HUD 用）。関係なければ null
  getaHint(target: Target | null): string | null {
    const { hand, getaMoving } = this.state;
    if (getaMoving) {
      const p = this.previewGeta(target);
      if (p?.valid) return '右クリック：ここに置く';
      if (p?.reason === 'surface') return 'ここには置けない（提供台の左の台にだけ置ける）';
      if (p) return 'ここには置けない（ボトル・容器に近すぎる）';
      return '台の上に視点を合わせて右クリックで置く（それ以外で右クリックすると、やめる）';
    }
    if (target?.kind === 'getaStack') {
      if (!hand) return '左クリック：下駄を取る　右クリック：持ち上げて、置き直す';
      if (hand.kind === 'geta') return '左クリック：下駄を戻す';
      if (hand.kind === 'bakeDish' && canTakeBase(hand, 'geta')) return `左クリック：${this.finishedName(hand)}を${BAKE_BASES.geta.name}に乗せる`;
      return null;
    }
    if (target?.kind === 'boardStack') {
      if (!hand) return `左クリック：${BAKE_BASES.board.name}を取る`;
      if (hand.kind === 'board') return `左クリック：${BAKE_BASES.board.name}を戻す`;
      if (hand.kind === 'bakeDish' && canTakeBase(hand, 'board')) return `左クリック：${this.finishedName(hand)}を${BAKE_BASES.board.name}に乗せる`;
      return null;
    }
    if (target?.kind === 'workFrame') return this.workFrameHint(target.index);
    if (target?.kind === 'restDish') return this.restDishHint(target.id);
    // 焼き物を提供台に出すときの案内（品・段階・受け台・仕上げの決まりは bake.ts の表）
    if (target?.kind === 'servePass' && hand?.kind === 'pizzaPlate' && !hand.dish) return 'ピザが入っていないお皿は出せない';
    if (target?.kind === 'servePass') return serveHint(hand);
    return null;
  }

  // 台の上に置いた器に視点が合っているときの案内（クック編 C7）
  private restDishHint(id: number): string | null {
    const { hand } = this.state;
    const rest = this.state.restDishes.find((r) => r.id === id);
    if (!rest) return null;
    if (hand) return describeItem(rest.dish);
    if (isHot(rest.dish) && this.hotHandling()) return `${describeItem(rest.dish)}　${HOT_TONGS}`;
    return `${describeItem(rest.dish)}　左クリック：持ち上げる`;
  }

  // 作業枠に視点が合っているときの案内
  private workFrameHint(index: number): string | null {
    const { hand, workFrames } = this.state;
    const frame = workFrames[index];
    if (frame === undefined) return null;
    if (!frame) {
      if (hand && fitsWorkFrame(hand)) return `左クリック：${describeItem(hand)}を作業枠に置く`;
      return hand ? '作業枠（空き。3列系の器・下駄・板・小皿を置ける）' : '作業枠（空き）。器・受け台（下駄・板）・小皿を置いて、盛り付け・仕上げをする';
    }
    if (!hand) {
      if (!this.hotHandling() && this.planScrape(index)) return `${describeItem(frame)}　左クリック：ヘラではがす`;
      const cup = this.planCupPour(index);
      if (cup) return `${describeItem(frame)}　左クリック：${cup.label}`;
      if (isHot(frame) && this.hotHandling()) return `${describeItem(frame)}　${HOT_TONGS}`;
      return `${describeItem(frame)}　左クリック：持ち上げる`;
    }
    if (hand.kind === 'sauceLadle') {
      const ladle = this.planLadle(index);
      if (ladle) return `左クリック：${ladle.label}`;
      const name = BAKE_FINISH_NAME[hand.id];
      return frame.kind === 'bakeDish' && baseOf(frame) === null ? `${name}は、板に乗せてからかける` : `${name}は、この料理にはかけられない`;
    }
    if (hand.kind === 'sauceCup' && CUP_FILLS[hand.fill].load === undefined) {
      const next = cupNext(hand.fill);
      return next ? `先に${PIZZA_TOPPING_NAME[next]}を容器に入れる（ピザの具の容器を左クリック）` : null;
    }
    if (isPourHand(hand) && frame.kind === 'bakeDish') return pourHint(frame, hand);
    if (hand.kind === 'bottle' && this.bakeBottlePlan(hand.id, { kind: 'workFrame', index })) return `右クリック：${BOTTLE_ACTION[hand.id]}`;
    // 焼く前の器に振るボトル（グランモラビア）が、いまは振れない理由
    const bottleLoad = hand.kind === 'bottle' ? BOTTLE_BAKE_LOAD[hand.id] : undefined;
    if (bottleLoad && frame.kind === 'bakeDish' && frame.state === 'raw') return `${BOTTLE_ACTION[(hand as Extract<Item, { kind: 'bottle' }>).id]}ことはできない（${whyNotLoad(viewOf(frame), bottleLoad, undefined, frame.state)}）`;
    // 容器を右クリックで取る量（ピザチーズ1/2杯）を使う器に、1杯を持ってきた
    const rightLoad = hand.kind === 'pizzaTopping' ? SOURCE_RIGHT_TAKE[hand.id] : undefined;
    if (rightLoad && frame.kind === 'bakeDish' && loadRoom(viewOf(frame), rightLoad, undefined, frame.state) > 0) {
      return `この器には${BAKE_LOAD_NAME[rightLoad].name}をのせる（${PIZZA_TOPPING_NAME[(hand as Extract<Item, { kind: 'pizzaTopping' }>).id]}の容器を右クリックで取る。1杯は容器に戻す）`;
    }
    const moved = this.framePlatePlan(frame, hand);
    if (moved) return `左クリック：${this.finishedName(moved.from)}を${BAKE_BASES.smallPlate.name}に移す`;
    const plan = this.frameBasePlan(frame, hand);
    if (plan) return `左クリック：${this.finishedName(plan.dish)}を${BAKE_BASES[plan.base].name}に乗せる`;
    return '作業枠は使用中（空いている枠に置く）';
  }

  // 作業枠の物と手の物で、焼き上がった器の中身を小皿に移せるなら、移す元の器（どちらかが器、もう一方が空の小皿）と、どちらが枠にあるか
  private framePlatePlan(frame: WorkFrameItem, hand: Item): { from: BakeDishItem; dishInFrame: boolean } | null {
    if (isEmptySmallPlate(frame) && hand.kind === 'bakeDish' && canTakeBase(hand, 'smallPlate')) return { from: hand, dishInFrame: false };
    if (isEmptySmallPlate(hand) && frame.kind === 'bakeDish' && canTakeBase(frame, 'smallPlate')) return { from: frame, dishInFrame: true };
    return null;
  }

  // 作業枠の物と手の物で、焼き皿を受け台に乗せられるなら、乗せる焼き皿と受け台（どちらかが焼き皿、もう一方が受け台）
  private frameBasePlan(frame: WorkFrameItem, hand: Item): { dish: BakeDishItem; base: Extract<BakeBase, 'geta' | 'board'> } | null {
    const frameBase = baseItemOf(frame);
    if (frameBase && hand.kind === 'bakeDish' && canTakeBase(hand, frameBase)) return { dish: hand, base: frameBase };
    const handBase = baseItemOf(hand);
    if (handBase && frame.kind === 'bakeDish' && canTakeBase(frame, handBase)) return { dish: frame, base: handBase };
    return null;
  }

  // ボトルを持っているとき、右クリックでサラダの皿にかける・振る。ボトルは手に残る
  private useBottle(target: Target | null): void {
    const hand = this.state.hand;
    if (hand?.kind !== 'bottle') return;
    const onBake = this.bakeBottlePlan(hand.id, target);
    if (onBake) {
      onBake();
      return;
    }
    const plate = this.plateForBottle(hand.id, target);
    if (!plate) {
      const where = { salad: 'サラダの皿', pasta: 'パスタの皿', bake: '作業枠の焼き物' }[BOTTLE_PLATE[hand.id]];
      this.say(`${where}に視点を合わせて右クリック`, 'info');
      return;
    }
    plate.push(hand.id);
    this.state.bottleShakeAt = this.state.time;
    this.say(`${INGREDIENTS[hand.id].name}を${BOTTLE_VERB[hand.id]}`, 'info');
  }

  // 作業枠の、受け台に乗せた焼き上がりの器（小皿に移した焼き物も）に、このボトルを振る（焼き物の仕上げ。bottle.ts の BOTTLE_BAKE_FINISH・bake.ts の canFinishWith）。
  // 焼く前の器に振ってのせる物になるボトル（グランモラビア。bottle.ts の BOTTLE_BAKE_LOAD）は、器に具を入れるのと同じ決まりでのせる（クック編 C6）。
  // できなければ null。右クリックと案内（canUseBottleAt）が、同じ決まりを通る
  private bakeBottlePlan(id: BottleId, target: Target | null): Action | null {
    const s = this.state;
    if (target?.kind !== 'workFrame') return null;
    const frame = s.workFrames[target.index];
    const load = BOTTLE_BAKE_LOAD[id];
    if (load && frame?.kind === 'bakeDish') {
      const poured = pourInto(frame, { kind: 'loadStack', id: load, count: 1 });
      if (!poured) return null;
      return () => {
        s.workFrames[target.index] = poured.dish;
        s.bottleShakeAt = s.time;
        this.say(`${INGREDIENTS[id].name}を${BOTTLE_VERB[id]}`, 'info');
      };
    }
    const finish = BOTTLE_BAKE_FINISH[id];
    if (!frame || (frame.kind !== 'bakeDish' && frame.kind !== 'bakePlate') || !finish || !canFinishWith(frame, finish, this.cfg)) return null;
    return () => {
      s.workFrames[target.index] = withFinish(frame, finish);
      s.bottleShakeAt = s.time;
      this.say(`${BAKE_FINISH_NAME[finish]}を${BOTTLE_VERB[id]}`, 'info');
    };
  }

  // 視点が合っている皿のうち、このボトルをかけられるもの（サラダの皿 / パスタの皿。中身を増やせる間だけ）。なければ null
  private plateForBottle(id: BottleId, target: Target | null): IngredientId[] | null {
    if (target?.kind !== 'plateSlot' || BOTTLE_PLATE[id] === 'bake') return null; // クック用のボトルは、ヒートの皿にはかけない
    const isSaladSlot = target.index >= this.cfg.plateSlotCount;
    if (isSaladSlot !== (BOTTLE_PLATE[id] === 'salad')) return null;
    const plate = this.state.plateSlots[target.index];
    return plate && plate.length < this.cfg.maxPlateContents ? plate : null;
  }

  // IHの鍋に視点が合っていて、いま混ぜられるなら、その進み具合（HUD の案内に使う）。なければ null
  mixProgressAt(target: Target | null): { done: number; need: number } | null {
    const s = this.state;
    if (s.phase !== 'playing' || s.hand || target?.kind !== 'ihBurner') return null;
    const pot = s.ihBurners[target.index];
    return pot && canMix(pot) ? { done: pot.mixCount, need: pot.mixNeed } : null;
  }

  // 手に持ったボトルを右クリックでかけられる場所か（HUD の案内に使う）
  canUseBottleAt(target: Target | null): boolean {
    const hand = this.state.hand;
    return (
      this.state.phase === 'playing' &&
      hand?.kind === 'bottle' &&
      (this.plateForBottle(hand.id, target) !== null || this.bakeBottlePlan(hand.id, target) !== null)
    );
  }

  // 手に持ったボトルを、視点が合っている台の天板に置くとしたら、どこにどう置かれるか。
  // 位置は天板の内側に収める。置けない台や、ほかのボトルに近すぎる場所では valid = false（reason に理由）
  previewBottle(target: Target | null): BottlePreview | null {
    const s = this.state;
    const hand = s.hand;
    if (s.phase !== 'playing' || hand?.kind !== 'bottle' || target?.kind !== 'tableTop') return null;
    const { surface } = target;
    const size = SURFACES[surface];
    const halfW = size.width / 2 - BOTTLE_EDGE;
    const halfD = size.depth / 2 - BOTTLE_EDGE;
    const x = Math.min(halfW, Math.max(-halfW, target.x));
    const z = Math.min(halfD, Math.max(-halfD, target.z));

    if (!BOTTLE_SURFACES[hand.id].includes(surface)) return { id: hand.id, surface, x, z, valid: false, reason: 'surface' };
    const tooClose =
      BOTTLE_IDS.some((id) => {
        const spot = s.bottles[id];
        return id !== hand.id && spot?.surface === surface && Math.hypot(spot.x - x, spot.z - z) < BOTTLE_GAP;
      }) ||
      FREE_TRAY_IDS.some((id) => {
        const spot = s.freeTraySpot[id];
        return s.trays[id] === 'table' && spot.surface === surface && Math.hypot(spot.x - x, spot.z - z) < FREE_TRAY_BOTTLE_GAP;
      }) ||
      this.getaNear(surface, x, z, 0.06) || // 下駄の山の上には置かない
      this.propNear(surface, x, z, 0.06) || // ピザのお皿・鉄板の山の上にも置かない
      this.toolNear(surface, x, z, 0.06, 0.06) || // 台に置いた道具の上にも置かない
      this.restNear(surface, x, z, 0.06, 0.06) || // 台に置いた器の上にも置かない
      this.bagNear(surface, x, z, 0.06, 0.06) || // 台に置いたパックの上にも置かない
      (surface === 'left' && overlapsLeftFixture(x, z, 0.06, 0.06, true)) || // 板・小皿の山の上にも置かない
      (surface === 'prep' && overlapsPrepFixture(x, z, 0.06)) || // 作業台の、作業枠・容器・組み立て台の上にも置かない（クック用のボトル）
      (surface === 'shelf' && overlapsShelfFixture(x, z, 0.06)); // 棚の、ピザ生地・鉄板・容器の上にも置かない
    return tooClose
      ? { id: hand.id, surface, x, z, valid: false, reason: 'gap' }
      : { id: hand.id, surface, x, z, valid: true };
  }

  // 手に持ったガーリック・唐辛子の容器を、視点が合っている台の天板に置くとしたら、どこにどう置かれるか（ボトルと同じ。どの台にも置ける）。
  // 位置は天板の内側に収める。ほかの容器・ボトルに近すぎる場所では valid = false（reason = 'gap'）
  previewFreeTray(target: Target | null): BottlePreview | null {
    const s = this.state;
    const hand = s.hand;
    if (s.phase !== 'playing' || hand?.kind !== 'tray' || !isFreeTray(hand.id) || target?.kind !== 'tableTop') return null;
    const id = hand.id;
    const { surface } = target;
    const size = SURFACES[surface];
    const halfW = size.width / 2 - FREE_TRAY_EDGE;
    const halfD = size.depth / 2 - FREE_TRAY_EDGE;
    const x = Math.min(halfW, Math.max(-halfW, target.x));
    const z = Math.min(halfD, Math.max(-halfD, target.z));
    if (surface === 'prep' || surface === 'shelf') return { id, surface, x, z, valid: false, reason: 'surface' }; // 作業台には、ピザの置き物がある。容器はほかの台に置く
    const tooClose =
      FREE_TRAY_IDS.some((other) => {
        const spot = s.freeTraySpot[other];
        return other !== id && s.trays[other] === 'table' && spot.surface === surface && Math.hypot(spot.x - x, spot.z - z) < FREE_TRAY_GAP;
      }) ||
      BOTTLE_IDS.some((b) => {
        const spot = s.bottles[b];
        return spot?.surface === surface && Math.hypot(spot.x - x, spot.z - z) < FREE_TRAY_BOTTLE_GAP;
      }) ||
      this.getaNear(surface, x, z, 0.19) || // 下駄の山の上には置かない（容器の半径ぶん離す）
      this.propNear(surface, x, z, 0.17) || // ピザのお皿・鉄板の山の上にも置かない
      this.toolNear(surface, x, z, 0.17, 0.17) || // 台に置いた道具の上にも置かない
      this.restNear(surface, x, z, 0.17, 0.17) || // 台に置いた器の上にも置かない
      (surface === 'left' && overlapsLeftFixture(x, z, 0.17, 0.17, true)); // 板・小皿の山の上にも置かない
    return tooClose ? { id, surface, x, z, valid: false, reason: 'gap' } : { id, surface, x, z, valid: true };
  }

  // 手に持った物（ボトル、またはガーリック・唐辛子の容器）を台の上に置くとしたときの様子（置く前の見せ方に使う）。どちらでもなければ null
  previewPlacement(target: Target | null): BottlePreview | null {
    return this.previewBottle(target) ?? this.previewFreeTray(target);
  }

  // 手に持った焼き皿を、視点が合っている入口のベルトに置くとしたら、どこに置かれるか（縦は好きな位置、横は近い置き場にそろう）。
  // 重なるときは valid = false。焼く前か生焼けの焼き皿（もう一度焼ける皿）を持っていて、入口に視点が合っているとき以外は null
  // 左手の器を先に見て、なければやっとこの器（クック編 C4）
  previewOven(target: Target | null): OvenPreview | null {
    return this.previewOvenOf('left', target) ?? this.previewOvenOf('tongs', target);
  }

  private previewOvenOf(h: HandRef, target: Target | null): OvenPreview | null {
    const s = this.state;
    const hand = this.held(h);
    if (s.phase !== 'playing' || hand?.kind !== 'bakeDish' || target?.kind !== 'ovenInlet') return null;
    if (!flowPlan(hand).ok) return null; // 当てはまる品がない中身・焼き上がり（次の段階がない）・焦げは流せない（bake.ts の表）
    const p = resolvePlacement(s.oven, target.deck, hand.style, target);
    return { deck: target.deck, style: hand.style, x: p.x, s: p.s, valid: p.valid };
  }

  // ジェットオーブンに視点が合っているときの案内（HUD 用）。オーブンに関係なければ null
  ovenHint(target: Target | null): string | null {
    const { hand, oven } = this.state;
    if (target?.kind === 'ovenStock') {
      const name = shelfLabel(target.dish) ?? OVEN_STOCK_NAME[target.style];
      if (unbakeableStock(target)) return `${name}（準備中。まだ伝票に出ない品）`;
      return hand ? null : `左クリック：${name}から1枚取る`;
    }
    if (target?.kind === 'vesselStack') {
      const name = OVEN_STOCK_NAME[target.style];
      if (!hand) return `左クリック：${name}から1枚取る`;
      return isBlankVessel(hand, target.style) ? `左クリック：${BAKE_DISHES[target.style].name}を戻す` : null;
    }
    if (target?.kind === 'ovenInlet') {
      const name = `${OVEN_DECK_NAME[target.deck]}（${bakeTime(target.deck, this.cfg)}秒）`;
      if (hand?.kind !== 'bakeDish') return `ジェットオーブンの入口：${name}（ジェットに入る手前に置いた皿が、この秒数で出てくる）`;
      const plan = flowPlan(hand);
      if (!plan.ok) return plan.reason;
      const p = this.previewOven(target);
      if (!p?.valid) return 'ここには置けない（ほかの皿に重なる）';
      // この1周で出てきたときの焼け具合（その段階の、流す前までの秒数 + この段の1周）
      const after = ovenDishItem({ ...hand, stage: plan.stage }, plan.cooked + bakeTime(target.deck, this.cfg), this.cfg);
      return `左クリック：ここに流す（${name}。${dishTitle(plan.dishes, plan.stage)}。約${Math.ceil(timeToEmerge(p.deck, p.style, p.s, this.cfg))}秒で出てくる → ${BAKE_STATE_NAME[after.state]}）`;
    }
    if (target?.kind === 'ovenOutlet') {
      const base = baseItemOf(hand);
      const hot = this.hotHandling();
      if (base) {
        const dish = peekDish(oven, target.deck, target.lane);
        if (!dish) return 'ジェットオーブンの出口：まだ出てきていない';
        const item = itemFromOven(dish, target.deck, this.cfg);
        const name = BAKE_BASES[base].name;
        if (hot) return `${HOT_TONGS}　${name}を持ったまま、やっとこでつかむと${name}に乗る`;
        if (canTakeBase(item, base)) return `左クリック：焼けた${this.finishedName(item)}を${name}に乗せる`;
        if (item.state === 'burnt') return `焦げている（${name}に乗せても提供できない）`;
        if (item.state === 'half') return `生焼け（もう一度焼いてから、${name}に乗せる）`;
        return `${name}に乗せる品ではない（${bakeLabel(item)}）`;
      }
      if (hand) return '手がふさがっている';
      const front = peekDish(oven, target.deck, target.lane);
      if (!front) return 'ジェットオーブンの出口：まだ出てきていない';
      if (hot) return `${HOT_TONGS}（${bakeLabel(itemFromOven(front, target.deck, this.cfg))}）`;
      return `左クリック：皿を取る（${bakeLabel(itemFromOven(front, target.deck, this.cfg))}）`;
    }
    return null;
  }

  // 手に持っている物を捨てる
  discard(): void {
    const s = this.state;
    if (s.phase !== 'playing') return;
    if (!s.hand) {
      // 左手が空なら、やっとこの器を捨てる。道具そのものは捨てられない（クック編 C4）
      if (s.tool?.kind === 'tongs' && s.tool.dish) this.discardHeld('tongs');
      else if (s.tool) this.say(`${TOOL_NAME[s.tool.kind]}は捨てられない（フックに視点を合わせて F で戻す）`, 'info');
      return;
    }
    if (s.hand.kind === 'bottle') {
      this.say('ボトルは捨てられない（台の上に置く）', 'info');
      return;
    }
    if (s.hand.kind === 'tray') {
      this.say(isFreeTray(s.hand.id) ? '容器は捨てられない（台の上に置く）' : 'トレー・ケースは捨てられない（サラダ台の置き場に置く）', 'info');
      return;
    }
    if (s.hand.kind === 'packBag') {
      this.say('パックは捨てられない（作業台に置く）', 'info');
      return;
    }
    if (s.hand.kind === 'ipad') {
      this.say('iPadは捨てられない（壁に向けて左クリックで戻す）', 'info');
      return;
    }
    if (s.hand.kind === 'pot') {
      // 鍋は総数が決まっているので、捨てると循環から消えてしまう
      this.say('鍋は捨てられない', 'info');
      return;
    }
    if (s.hand.kind === 'panPile') {
      this.say('鉄板の山は捨てられない（台の上に置く）', 'info');
      return;
    }
    this.discardHeld('left');
  }

  // その手の物（左手の物、またはやっとこの器）を捨てる。
  // 鉄板は枚数が決まっているので、ピザを捨てても鉄板は残る。焼く前の鉄板（まだ使っていない）はスタックに戻り、焼いたあとの鉄板は手（やっとこ）に残る
  private discardHeld(h: HandRef): void {
    const s = this.state;
    const item = this.held(h);
    if (!item) return;
    if (item.kind === 'bakeDish' && item.style === 'pizza') {
      if (item.state === 'raw') {
        s.pizzaPanStock = Math.min(this.cfg.pizzaPanCount, s.pizzaPanStock + 1);
        this.setHeld(h, null);
        this.say('ピザを捨てた（鉄板はスタックに戻した）', 'info');
      } else {
        this.setHeld(h, newPan(this.cfg));
        this.say(h === 'left' ? 'ピザを捨てた（鉄板は手に残る。台に積むか、そのまま使う）' : 'ピザを捨てた（鉄板はやっとこに残る。山に戻すか、そのまま使う）', 'info');
      }
      return;
    }
    this.setHeld(h, null);
    this.say('捨てた', 'info');
  }

  // 実行せずに「できるか」を知るため、操作はクロージャとして返す（ハイライトにも使う）
  planInteract(target: Target): Action | null {
    const s = this.state;
    if (s.phase !== 'playing' || !this.reachable(target)) return null;
    const hand = s.hand;

    switch (target.kind) {
      case 'noodleRack':
        if (hand) return null;
        return () => (s.hand = { kind: 'rawNoodle', id: 'noodle' });

      case 'plateStack':
        if (hand) return null;
        return () => (s.hand = { kind: 'plate', contents: [], style: target.style ?? 'plate' });

      case 'stock':
        if (target.inFridge && !this.fridgeDoorOpenFor(target)) return null; // 扉が閉まっていると取れない
        if (s.moving && fridgeItemOf(target) === s.moving) return null; // 持ち上げ中の物は取れない
        if (!hand) return () => (s.hand = stockItem(target.id, this.cfg)); // お玉1杯・パック1つ・1掴みなど
        // コーンスープのパックだけ、クリックした回数だけ重ねて持てる（最大5つ）
        if (canStackPack(hand, target.id, this.cfg)) return () => hand.packs.push(createPack(target.id));
        return null;

      case 'fridgeTray':
        // 冷蔵庫の中のトレー・ケース。取って、サラダ台の置き場に置く
        if (hand || !this.fridgeDoorOpenFor(target) || s.trays[target.id] !== 'fridge') return null;
        if (s.moving && fridgeItemOf(target) === s.moving) return null; // 持ち上げ中の物は取れない
        return () => {
          s.hand = { kind: 'tray', id: target.id };
          s.trays[target.id] = 'hand';
        };

      case 'fridgeBottle':
        // 冷蔵庫の中のボトル。取り出して、サラダ台の上に置く
        if (hand || !this.fridgeDoorOpenFor(target) || !this.bottleInFridge(target.id)) return null;
        if (s.moving && fridgeItemOf(target) === s.moving) return null; // 持ち上げ中の物は取れない
        return () => (s.hand = { kind: 'bottle', id: target.id });

      case 'fridgeBag':
        // 冷蔵庫の中のパック。取り出して、作業台のどこにでも置く
        if (hand || !this.fridgeDoorOpenFor(target) || s.bags[target.id].at !== 'fridge') return null;
        if (s.moving && fridgeItemOf(target) === s.moving) return null; // 持ち上げ中の物は取れない
        return () => {
          s.hand = { kind: 'packBag', id: target.id };
          s.bags[target.id] = { at: 'hand' };
        };

      case 'traySlot': {
        const spot = target.spot ?? 0;
        const here = trayAt(s, target.id, spot);
        // 同じ区画の、空いている置き場にだけ置ける（トッピングの区画は、4種類のどれでもよい）
        if (hand?.kind === 'tray' && TRAY_ZONE[hand.id] === target.id && !here) {
          return () => {
            s.trays[hand.id] = 'table';
            s.traySpot[hand.id] = spot;
            s.hand = null;
          };
        }
        // 置いたものから1回分を取る：ほうれん草・チキン・パンチェッタ（トングで1掴み）、塩オイルソース・小エビ（お玉1杯）、ソテーソース（パック1つ）。
        // 置いた置き場からだけ取れる。置き直すときは右クリックで持ち上げる
        if (!hand && here && !isCaseTray(here)) {
          return () => (s.hand = { kind: 'ingredient', id: TRAY_CONTENT[here] });
        }
        return null;
      }

      case 'tableTray':
        // 台の上に置いた容器（ガーリック・唐辛子）から、お玉1杯をすくう。置き直すときは右クリックで持ち上げる
        if (hand || s.trays[target.id] !== 'table') return null;
        return () => (s.hand = { kind: 'ingredient', id: TRAY_CONTENT[target.id] });

      case 'ipadWall':
        // 練習キッチンだけ。手が空なら取る、iPad を持っていれば壁に戻す
        if (s.mode !== 'practice') return null;
        if (!hand) return () => (s.hand = { kind: 'ipad' });
        if (hand.kind === 'ipad') return () => (s.hand = null);
        return null;

      case 'fridgeShelf':
        return null; // 棚板は、右クリックで持ち上げた物を置く場所（左クリックでは何も起きない）

      case 'fridgeDoor':
        // 左クリックでは開かない（右クリックで開閉）。閉まっている間だけ案内を出す
        if (s.fridgeOpen[target.unit ?? 0]) return null;
        return () => this.say('右クリックで冷蔵庫を開ける', 'info');

      case 'bottle': {
        if (hand || !s.bottles[target.id]) return null;
        return () => {
          s.hand = { kind: 'bottle', id: target.id };
          s.bottles[target.id] = null;
        };
      }

      case 'tableTop': {
        // ピザのお皿・使い終わった鉄板（の山）を、台の上に置く
        const prop = this.previewProp(target);
        if (prop) {
          if (!prop.valid || !hand) return null;
          return () => {
            const spot: TableSpot = { surface: prop.surface, x: prop.x, z: prop.z };
            if (hand.kind === 'pizzaPlate') s.pizzaPlates.push({ id: this.nextPlateId++, spot, dish: hand.dish ?? null });
            else if (hand.kind === 'bakeDish') s.panPile = { spot, count: 1 };
            else if (hand.kind === 'panPile') s.panPile = { spot, count: hand.count };
            s.hand = null;
          };
        }
        const restPlan = this.planRestPlace('left', target);
        if (restPlan) return restPlan.run;
        // 手に持ったパックを、作業台の空いている所に置く
        if (hand?.kind === 'packBag') {
          const b = this.previewBag(target);
          if (!b?.valid) return null;
          return () => {
            s.bags[hand.id] = { at: 'table', spot: { surface: b.surface, x: b.x, z: b.z } };
            s.hand = null;
          };
        }
        const p = this.previewPlacement(target);
        if (!p?.valid) return null;
        return () => {
          const spot: TableSpot = { surface: p.surface, x: p.x, z: p.z };
          if (isFreeTray(p.id)) {
            s.trays[p.id] = 'table';
            s.freeTraySpot[p.id] = spot;
          } else {
            s.bottles[p.id] = spot;
          }
          s.hand = null;
        };
      }

      case 'boilerBasket': {
        const b = s.boilers[target.index];
        if (b.state === 'empty' && hand?.kind === 'rawNoodle') {
          return () => {
            setNoodle(b, hand.id);
            s.hand = null;
          };
        }
        // 取り出した茹で上がりの麺は、空のかごに戻せる。戻した麺は、のびた麺と同じ扱い（ダブルクリックでショート茹で）
        if (b.state === 'empty' && hand?.kind === 'ingredient' && (hand.id === 'noodle' || hand.id === 'penne')) {
          const noodle = hand.id;
          return () => {
            returnNoodle(b, noodle);
            s.hand = null;
            this.say('のびかけ！ダブルクリックでショート茹で', 'info');
          };
        }
        if (b.state === 'lifted' && !hand) {
          return () => {
            const noodle = takeNoodle(b);
            if (noodle) s.hand = { kind: 'ingredient', id: noodle };
          };
        }
        if (b.state === 'overdue') {
          return () => this.say('のびかけ！ダブルクリックでショート茹で', 'info');
        }
        return null;
      }

      case 'boilerButton': {
        const b = s.boilers[target.index];
        if (b.state !== 'set') return null;
        return () => pressButton(b, this.cfg);
      }

      case 'plateSlot': {
        const slot = s.plateSlots[target.index];
        if (!hand && slot) {
          return () => {
            s.hand = { kind: 'plate', contents: slot, style: s.plateStyles[target.index] };
            s.plateSlots[target.index] = null;
          };
        }
        if (hand?.kind === 'plate' && !slot) {
          return () => {
            s.plateSlots[target.index] = hand.contents;
            s.plateStyles[target.index] = hand.style ?? 'plate';
            s.hand = null;
          };
        }
        // 温まったコーンスープのパックを、空のスープ皿に入れる（1皿に1つ）
        if (hand?.kind === 'pack' && slot && s.plateStyles[target.index] === 'bowl' && slot.length === 0) {
          const i = findWarmPack(hand.packs, 'cornSoup');
          if (i >= 0) {
            return () => {
              slot.push('cornSoup');
              hand.packs.splice(i, 1);
              if (hand.packs.length === 0) s.hand = null;
            };
          }
        }
        if (hand?.kind === 'ingredient' && slot && slot.length < this.cfg.maxPlateContents) {
          return () => {
            slot.push(hand.id);
            s.hand = null;
          };
        }
        // 加熱し終えた鍋の中身（ソース、または麺とソース）を皿にかける。鍋は手に残る
        if (hand?.kind === 'pot' && slot && canPour(hand.pot, slot, this.cfg.maxPlateContents)) {
          return () => pourOnto(hand.pot, slot);
        }
        return null;
      }

      case 'servePass': {
        // 提供できる焼き物（最後の段階が焼き上がりで、中身・受け台・仕上げがそろった物。決まりは bake.ts の表）は、その品の伝票で採点する
        const baked = servableDish(hand);
        if (baked) return () => this.serveBaked(baked);
        // 仕上げを振りすぎた焼き物は、出せるが注文ミス（ヒートの皿にボトルを振りすぎたのと同じ）
        if (overFinishedDish(hand)) return () => this.serveBaked(null);
        if (hand?.kind !== 'plate') return null;
        return () => this.serve(hand);
      }

      case 'potSlot': {
        const pot = s.potSlots[target.index];
        if (!hand && pot) {
          return () => {
            s.hand = { kind: 'pot', pot };
            s.potSlots[target.index] = null;
          };
        }
        // 戻せるのは洗い済みの鍋だけ
        if (hand?.kind === 'pot' && !hand.pot.dirty && !pot) {
          return () => {
            s.potSlots[target.index] = hand.pot;
            s.hand = null;
          };
        }
        return null;
      }

      case 'thrownPot': {
        // 投げた鍋は、手が空なら拾える（飛んでいる最中でも受け止められる）
        const thrown = s.thrownPots.find((t) => t.id === target.id);
        if (hand || !thrown) return null;
        return () => {
          s.hand = { kind: 'pot', pot: thrown.pot };
          s.thrownPots = s.thrownPots.filter((t) => t !== thrown);
        };
      }

      case 'ihBurner': {
        const pot = s.ihBurners[target.index];
        // 麺を入れた鍋は、混ぜ終わるまで持ち上げられない。手が空のクリックで混ぜる（3回）
        if (!hand && pot && canMix(pot)) {
          return () => {
            mixPot(pot);
            this.say(pot.mixCount >= pot.mixNeed ? 'よく混ざった！' : `混ぜる ${pot.mixCount}/${pot.mixNeed}`, 'info');
          };
        }
        if (!hand && pot) {
          return () => {
            s.hand = { kind: 'pot', pot };
            s.ihBurners[target.index] = null;
          };
        }
        if (hand?.kind === 'pot' && !pot) {
          return () => {
            s.ihBurners[target.index] = hand.pot;
            s.hand = null;
            this.tryAutoHeat(hand.pot);
          };
        }
        // 載せた鍋に、ソース（加熱前）や麺（加熱完了後）を入れる
        if (hand?.kind === 'ingredient' && pot && canAddIngredient(pot, hand.id, this.cfg.maxPotContents)) {
          return () => {
            addIngredient(pot, hand.id);
            s.hand = null;
            this.tryAutoHeat(pot);
          };
        }
        // 熱湯で温まったパック（カルボナーラ）は、加熱前の鍋に入れられる
        if (hand?.kind === 'pack' && pot) {
          const i = hand.packs.findIndex((p) => p.warm && canAddIngredient(pot, p.id, this.cfg.maxPotContents));
          if (i >= 0) {
            return () => {
              addIngredient(pot, hand.packs[i].id);
              hand.packs.splice(i, 1);
              if (hand.packs.length === 0) s.hand = null;
              this.tryAutoHeat(pot);
            };
          }
        }
        return null;
      }

      case 'hotWaterSlot': {
        const cell = s.hotWater[target.index];
        // 手に持っているパックを、空いている場所に1つ浸ける
        if (hand?.kind === 'pack' && !cell) {
          return () => {
            s.hotWater[target.index] = hand.packs.pop()!;
            if (hand.packs.length === 0) s.hand = null;
          };
        }
        // 浸けているパックを取る。手が空いているか、同じ種類のパックを持っていて、まだ持てるときだけ
        if (cell && (!hand || canStackPack(hand, cell.id, this.cfg))) {
          return () => {
            if (hand) hand.packs.push(cell);
            else s.hand = { kind: 'pack', packs: [cell] };
            s.hotWater[target.index] = null;
          };
        }
        return null;
      }

      case 'ovenStock':
        // 具材台のドリアの山（焼く前のドリア）・開発用のピザ系の皿の山。手が空なら1枚取る。品がまだ表にない山は取れない
        // 取った皿は、どの品の山から取ったかを覚えている（最初の山の皿は、いままでと同じ形）
        if (hand || unbakeableStock(target)) return null;
        return () => (s.hand = bakeItem(target.style, 0, this.cfg, undefined, stockProgress(target.style, target.dish)));

      case 'vesselStack':
        // 棚の空の器の山（なくならない）。手が空なら1枚取る。同じ空の器を持っていれば戻す
        if (!hand) return () => (s.hand = blankVessel(target.style, this.cfg));
        return this.planStackReturn('left', target)?.run ?? null;

      case 'boardStack':
        // 提供台の左の板の山（なくならない）。手が空なら1枚取る。板を持っていれば戻す。焼き上がった器を持っていれば、板に乗せる
        if (!hand) return () => (s.hand = { kind: 'board' });
        if (hand.kind === 'board') return () => (s.hand = null);
        if (hand.kind === 'bakeDish' && canTakeBase(hand, 'board')) return () => (s.hand = onBase(hand, 'board'));
        return null;

      case 'workFrame': {
        // 作業枠：3列系の器・受け台（下駄・板）・小皿を置く／持ち上げる。受け台と焼き上がった器がそろえば、器を受け台に乗せる（枠の上に残る）
        // （置く・小皿に移す・受け台に乗せるは、やっとこ（F）と同じ決まり。planHeldOnFrame）
        const frame = s.workFrames[target.index];
        if (frame === undefined) return null;
        if (!frame) return this.planHeldOnFrame('left', target.index)?.run ?? null;
        if (!hand) {
          // ヘラの作業（はがす）は、熱い器の決まりがオフ（トライアル）のとき、手が空の左クリックでもできる（クック編 C4）
          const scrape = this.hotHandling() ? null : this.planScrape(target.index);
          if (scrape) return scrape.run;
          // 板に乗せた焼き上がりに、のせて焼いた容器のソースをかける（容器は消える。クック編 C7）
          const cup = this.planCupPour(target.index);
          if (cup) return cup.run;
          // 熱い器は、素手では持てない（やっとこでつかむ）
          if (isHot(frame) && this.hotHandling()) return () => this.say(HOT_TONGS, 'bad');
          return this.planFrameTake('left', target.index);
        }
        // レードルのソース：板に乗せた焼き上がりにかける（クック編 C7）
        if (hand.kind === 'sauceLadle') return this.planLadle(target.index)?.run ?? null;
        // 重ねて持つ具・冷凍の袋・入れ終わったチーズソースの容器：枠の器に、入るだけ入れる（cookStock.ts）
        if (isPourHand(hand)) {
          const poured = frame.kind === 'bakeDish' ? pourInto(frame, hand) : null;
          if (!poured) return null;
          const cracked = hand.kind === 'loadStack' && hand.id === 'egg' ? poured.moved : 0;
          return () => {
            s.workFrames[target.index] = poured.dish;
            s.hand = poured.hand;
            if (cracked > 0) this.say(`卵を割って${cracked}つ落とした`, 'info');
          };
        }
        return this.planHeldOnFrame('left', target.index)?.run ?? null;
      }

      case 'pizzaDoughStack':
        // ピザ生地のスタック。手が空なら1枚取る。鉄板を持っていれば、生地をセットする。生地を持っていれば戻す
        if (!hand) return () => (s.hand = { kind: 'pizzaDough' });
        if (hand.kind === 'pizzaDough') return () => (s.hand = null);
        if (isEmptyPan(hand)) return () => (s.hand = { ...hand, pizza: { ...emptyPan(), dough: true } });
        return null;

      case 'pizzaPanStack':
        // ピザの鉄板のスタック（枚数は決まっていて、取ると減る）。手が空なら1枚取る。生地を持っていれば、鉄板の上に生地をセットする。空の鉄板（使い終わった鉄板も同じ）を持っていれば戻す。
        // 積んだ鉄板の山を持っていれば、スタックに空きがあるぶんだけ戻して、再利用できる（入りきらない分は手に残る）
        if (!hand) {
          if (s.pizzaPanStock <= 0) return null;
          return () => {
            s.pizzaPanStock--;
            s.hand = bakeItem('pizza', 0, this.cfg, emptyPan());
          };
        }
        if (hand.kind === 'pizzaDough') {
          if (s.pizzaPanStock <= 0) return null;
          return () => {
            s.pizzaPanStock--;
            s.hand = bakeItem('pizza', 0, this.cfg, { ...emptyPan(), dough: true });
          };
        }
        const back = this.planStackReturn('left', target);
        if (back) return back.run;
        if (hand.kind === 'panPile' && s.pizzaPanStock < this.cfg.pizzaPanCount) {
          return () => {
            const back = Math.min(hand.count, this.cfg.pizzaPanCount - s.pizzaPanStock);
            s.pizzaPanStock += back;
            s.hand = hand.count > back ? { kind: 'panPile', count: hand.count - back } : null;
            this.say(`鉄板を${back}枚、スタックに戻した（また使える）`, 'info');
          };
        }
        return null;

      case 'pizzaPlateStack':
        // 提供台の左のピザのお皿の山（なくならない）。手が空なら1枚取る。空のお皿を持っていれば戻す
        if (!hand) return () => (s.hand = { kind: 'pizzaPlate' });
        if (hand.kind === 'pizzaPlate' && !hand.dish) return () => (s.hand = null);
        return null;

      case 'pizzaPlate': {
        // 台の上のピザのお皿。焼き上がったピザを持っていれば、お皿に入れる（鉄板だけが手に残る）。手が空なら、お皿を持ち上げる（ピザが入っていれば、そのまま提供台へ）
        const plate = s.pizzaPlates.find((p) => p.id === target.id);
        if (!plate) return null;
        if (!hand) {
          return () => {
            s.hand = plate.dish ? { kind: 'pizzaPlate', dish: plate.dish } : { kind: 'pizzaPlate' };
            s.pizzaPlates = s.pizzaPlates.filter((p) => p !== plate);
          };
        }
        return this.planPizzaPlate('left', target.id)?.run ?? null;
      }

      case 'panPile':
        // 台の上の、鉄板の山。空の鉄板を持っていれば、積む（右クリックで山ごと持ち上げる）
        return this.planStackReturn('left', target)?.run ?? null;

      case 'pizzaSource':
        // ピザソース・ピザチーズ（レードル1杯）、モッツァレラチーズ（1個）の容器。手が空なら取る。同じ物を持っていれば戻す
        if (unusedPizzaSource(target)) return null;
        if (!hand) return () => (s.hand = { kind: 'pizzaTopping', id: target.id });
        // チーズソースの小さい容器を持っていれば、容器に入れる（ピザソース1杯 → ピザチーズ1杯。cookStock.ts の CUP_FILLS。クック編 C7）
        {
          const fill = cupFillWith(hand, target.id);
          if (fill) return () => (s.hand = { kind: 'sauceCup', fill });
        }
        if (hand.kind === 'pizzaTopping' && hand.id === target.id) return () => (s.hand = null);
        // 右クリックで取った量（ピザチーズ1/2杯）も、同じ容器に戻せる（クック編 C6）
        if (hand.kind === 'loadStack' && hand.id === SOURCE_RIGHT_TAKE[target.id]) return () => (s.hand = null);
        return null;

      case 'pizzaSlot': {
        // ピザ組み立て台。焼く前の鉄板（ピザ系）を置く／持ち上げる。置いた鉄板に、生地 → ソース → チーズ → モッツァレラ の順にのせる
        const slot = s.pizzaSlots[target.index];
        if (slot === undefined) return null;
        if (!hand && slot) {
          return () => {
            s.hand = slot;
            s.pizzaSlots[target.index] = null;
          };
        }
        if (fitsPizzaSlot(hand) && !slot) {
          return () => {
            s.pizzaSlots[target.index] = hand;
            s.hand = null;
          };
        }
        // 重ねて持つ具・冷凍の袋：置いた器（大きめの焼成パッド）に入れる（ピザの鉄板には入れない。cookStock.ts）
        if (slot && isPourHand(hand)) {
          const poured = pourInto(slot, hand);
          if (!poured) return null;
          return () => {
            s.pizzaSlots[target.index] = poured.dish;
            s.hand = poured.hand;
          };
        }
        if (!slot || !BAKE_VESSELS[slot.style].pizzaBuild) return null; // 生地・具をのせられるのは、ピザの鉄板だけ
        if (hand?.kind === 'pizzaDough' && !pizzaOf(slot).dough) {
          return () => {
            s.pizzaSlots[target.index] = { ...slot, pizza: { ...pizzaOf(slot), dough: true } };
            s.hand = null;
          };
        }
        if (hand?.kind === 'pizzaTopping' && canAddTopping(pizzaOf(slot), hand.id)) {
          const id = hand.id;
          return () => {
            s.pizzaSlots[target.index] = { ...slot, pizza: addTopping(pizzaOf(slot), id) };
            s.hand = null;
          };
        }
        return null;
      }

      case 'getaStack':
        // 下駄の山（持ち上げている間は取れない）。手が空なら1枚取る。下駄を持っていれば戻す。焼き上がったドリアを持っていれば、下駄に乗せる
        if (s.getaMoving) return null;
        if (!hand) return () => (s.hand = { kind: 'geta' });
        if (hand.kind === 'geta') return () => (s.hand = null);
        if (hand.kind === 'bakeDish' && canTakeBase(hand, 'geta')) return () => (s.hand = { ...hand, geta: true });
        return null;

      case 'ovenInlet': {
        // 焼く前の皿を、入口のベルトの視点が合っている場所に置く（ほかの皿に重ならないとき）。置くと、ベルトで流れていく
        // 段階焼き：焼く前・生焼けは、いまの段階の続き（秒数は合計）。焼き上がりで次の段階がある皿は、秒数を 0 に戻して次の段階へ（bake.ts の flowPlan）
        return this.planInletPlace('left', target)?.run ?? null;
      }

      case 'ovenOutlet': {
        // 熱い器の決まりがオンのときは、出口の器は素手では取れない（受け台を持っていても。やっとこでつかむと、左手の受け台に乗る。クック編 C4）
        const hot = this.hotHandling();
        // 受け台（下駄・板）を持っていれば、出てきた焼き上がりの器を受け台に乗せて取る（受け台がそれの品で、ちょうど焼き上がっているときだけ。生焼け・焦げは乗せられない）
        if (baseItemOf(hand)) {
          const base = baseItemOf(hand)!;
          const front = peekDish(s.oven, target.deck, target.lane);
          if (front && hot) return () => this.say(HOT_TONGS, 'bad');
          if (!front || !canTakeBase(itemFromOven(front, target.deck, this.cfg), base)) return null;
          return () => {
            const dish = takeDish(s.oven, target.deck, target.lane);
            if (dish) s.hand = onBase(this.fromOutlet(itemFromOven(dish, target.deck, this.cfg)), base);
          };
        }
        if (hand || !canTakeDish(s.oven, target.deck, target.lane)) return null;
        if (hot) return () => this.say(HOT_TONGS, 'bad');
        return this.planOutletTake('left', target)?.run ?? null;
      }

      case 'frozenBag': {
        // 吊り棚の冷凍の袋（なくならない）。1つずつ重ねて持つ袋と、袋ごと持つ袋（ポテト）がある（cookStock.ts の表）
        const next = bagClick(hand, target.id, this.cfg);
        if (!next) return null;
        return () => (s.hand = next === 'return' ? null : next);
      }

      case 'cookBin': {
        // 具材台の天板のストック容器。下調理の焼き上がりを持っていれば、空ける（手には空の器が残る。本来の形は、やっとこで F（planTool）。
        // 素手の左クリックは、熱い器を素手で持てるとき（熱い器の決まりがオフ = トライアル・既存のテスト）の代用として残す。決まりは planBinEmpty で共通）。
        // 手が空か、同じ具を持っていれば、1つ取る（下調理のストックは減る。トライアルは減らない）
        const empty = this.planBinEmpty('left', target.id);
        if (empty) return empty.run;
        const t = takeFromBin(hand, target.id, s.prepStock, configFor(this.cfg, s.difficulty));
        if (!t) return null;
        return () => {
          s.hand = t.hand;
          s.prepStock = t.stock;
        };
      }

      case 'restDish': {
        // 台の上に置いた器（クック編 C7）：持ち上げる。熱い器は、熱い器の決まりがオンのとき素手では持てない（やっとこ）
        const rest = s.restDishes.find((r) => r.id === target.id);
        if (!rest || hand) return null;
        if (isHot(rest.dish) && this.hotHandling()) return () => this.say(HOT_TONGS, 'bad');
        return this.planRestTake('left', target.id);
      }

      case 'toolHook':
      case 'placedTool':
        return null; // 道具のフック・台に置いた道具は、F で道具を取る・戻す（左クリックでは何も起きない）

      case 'washer': {
        const w = s.washer;
        if (hand?.kind === 'pot' && canInsert(w, hand.pot)) {
          return () => {
            insertPot(w, hand.pot, this.cfg);
            s.hand = null;
          };
        }
        if (!hand && w.pot && !isWashing(w)) {
          return () => {
            const pot = takeWashedPot(w);
            if (pot) s.hand = { kind: 'pot', pot };
          };
        }
        return null;
      }
    }
  }

  planDoubleClick(target: Target): Action | null {
    if (this.state.phase !== 'playing') return null;
    if (target.kind !== 'boilerBasket' && target.kind !== 'boilerButton') return null;
    const b = this.state.boilers[target.index];
    if (b.state !== 'overdue') return null;
    return () => startShortBoil(b, this.cfg);
  }

  // IHに載っている鍋の中身が既定のソース（recipe.ts の sauce）になったら、ボタンなしで加熱を始める
  private tryAutoHeat(pot: Pot): void {
    if (pot.heat !== 'cold') return;
    const recipe = findSauceRecipe(pot.contents);
    if (recipe && startHeating(pot, this.cfg)) this.say(`${recipe.name}のソース 加熱開始`, 'info');
  }

  // 提供：皿の中身と一致する最も古い伝票を消してスコア加算。なければ注文ミス
  private serve(plate: Extract<Item, { kind: 'plate' }>): void {
    const s = this.state;
    s.hand = null;

    if (plate.contents.length === 0) {
      this.say('空の皿は出せない', 'info');
      return;
    }

    this.settle(findMatchingTicket(plate.contents, s.tickets));
  }

  // 焼き物の提供：その品の、最も古い伝票を消してスコア加算。なければ注文ミス（皿の提供と同じ決まり）
  // dish = null は、伝票に合わない焼き物（仕上げの振りすぎ）。必ず注文ミス
  private serveBaked(dish: BakeDish | null): void {
    this.state.hand = null;
    this.settle(dish ? findBakedTicket(dish.id, this.state.tickets) : null);
  }

  // 焼き上がった焼き皿の品名（案内用。表から引く）
  private finishedName(item: Extract<Item, { kind: 'bakeDish' }>): string {
    return dishTitle(candidatesAt(viewOf(item), item.stage ?? 0), item.stage ?? 0) || '焼き皿';
  }

  // 提供した品に合う伝票（なければ null = 注文ミス）で、得点・コンボ・提供数を進める
  private settle(ticket: Ticket | null): void {
    const s = this.state;
    if (!ticket) {
      s.score = Math.max(0, s.score - this.cfg.orderMissPenalty);
      s.combo = 0;
      s.mistakes++;
      this.say(`注文ミス！ −${this.cfg.orderMissPenalty}`, 'bad');
      return;
    }

    const menu = getMenu(ticket.menuId);
    const result = serveScore(menu, s.time - ticket.arrivedAt, s.combo, this.cfg);
    s.tickets = s.tickets.filter((t) => t.id !== ticket.id);
    s.score += result.total;
    s.combo++;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    s.served++;
    this.say(`${menu.name} +${result.total}（×${result.multiplier.toFixed(1)}）`, 'good');
  }

  private say(text: string, kind: Toast['kind']): void {
    this.state.toast = { text, kind, expiresAt: this.state.time + TOAST_SECONDS };
  }
}

// 道具の手の表示（「やっとこ（品名・焼け具合）」「ヘラ（目玉焼き）」。持っていなければ空）
export function describeTool(tool: ToolHand | null): string {
  if (!tool) return '';
  if (tool.kind === 'spatula') return tool.scoop ? `${TOOL_NAME.spatula}（${BAKE_FINISH_NAME[tool.scoop]}）` : TOOL_NAME.spatula;
  const d = tool.dish;
  if (!d) return TOOL_NAME.tongs;
  if (d.blank && d.state === 'raw' && !d.loaded) return `${TOOL_NAME.tongs}（${BAKE_DISHES[d.style].name}（空））`;
  const name = d.style === 'pizza' ? pizzaTitle(pizzaOf(d)) : dishTitle(candidatesAt(viewOf(d), d.stage ?? 0), d.stage ?? 0) || BAKE_DISHES[d.style].name;
  return `${TOOL_NAME.tongs}（${name}・${BAKE_STATE_NAME[d.state]}）`;
}

export function describeItem(item: Item | null): string {
  if (!item) return '';
  switch (item.kind) {
    case 'rawNoodle':
      return item.id === 'penne' ? 'ペンネ' : '生麺';
    case 'ingredient':
      return INGREDIENTS[item.id].name;
    case 'pack': {
      const name = INGREDIENTS[item.packs[0].id].name;
      const warm = item.packs.filter((p) => p.warm).length;
      if (item.packs.length === 1) return `${name}パック（${warm ? '温まった' : '冷たい'}）`;
      return `${name}パック×${item.packs.length}（温まった ${warm}）`;
    }
    case 'tray':
      return TRAY_NAME[item.id];
    case 'bottle':
      return `${INGREDIENTS[item.id].name}（ボトル）`;
    case 'packBag':
      return `${FRIDGE_ITEM_NAME[BAG_FRIDGE_ITEM_OF(item.id)]}の袋`;
    case 'ipad':
      return 'iPad';
    case 'geta':
      return '下駄';
    case 'board':
      return BAKE_BASES.board.name;
    case 'pizzaDough':
      return 'ピザ生地';
    case 'pizzaPlate':
      return item.dish ? `ピザのお皿（${pizzaTitle(item.dish.pizza)}）` : 'ピザのお皿（空）';
    case 'panPile':
      return `使い終わった鉄板（${item.count}枚）`;
    case 'loadStack':
      return `${BAKE_LOAD_NAME[item.id].name} ×${item.count}`; // 例：「シュリンプ ×7」
    case 'sauceCup':
      return `チーズソースの容器（${CUP_FILLS[item.fill].name}）`;
    case 'sauceLadle':
      return `${BAKE_FINISH_NAME[item.id]}（レードル1杯）`;
    case 'frozenBag': {
      const bag = FROZEN_BAGS[item.id];
      return `${bag.name}の冷凍の袋（残り ${item.left}/${bag.whole ?? 1}）`;
    }
    case 'pizzaTopping':
      return item.id === 'mozzarella' ? 'モッツァレラチーズ（1個）' : `${PIZZA_TOPPING_NAME[item.id]}（1杯）`;
    case 'bakeDish': {
      // どの山から取った皿か・済ませた仕上げ（あるときだけ。既存の言い方は変えない）
      const note = [...(item.stock ? [dishName(item.stock)] : []), ...(item.finishes ?? []).map((f) => BAKE_FINISH_NAME[f])].map((x) => `・${x}`).join('');
      if (item.geta) return `${BAKE_DISHES[item.style].name}（${BAKE_STATE_NAME[item.state]}・下駄つき${note}）`;
      if (item.board) return `${BAKE_DISHES[item.style].name}（${BAKE_STATE_NAME[item.state]}・板つき${note}）`;
      if (item.blank && item.state === 'raw' && !item.loaded) return `${BAKE_DISHES[item.style].name}（空）`;
      if (item.style === 'pizza') return `${pizzaTitle(pizzaOf(item))}（${BAKE_STATE_NAME[item.state]}）`;
      return `焼き皿（${BAKE_DISHES[item.style].name}・${BAKE_STATE_NAME[item.state]}${note}）`;
    }
    case 'bakePlate': {
      // 小皿に移した焼き物（品名・焼け具合・済ませた仕上げ）
      const view = viewOf({ ...item, style: item.from });
      const name = dishTitle(candidatesAt(view, view.stage), view.stage) || '焼き物';
      const note = (item.finishes ?? []).map((f) => `・${BAKE_FINISH_NAME[f]}`).join('');
      return `${BAKE_BASES.smallPlate.name}（${name}・${BAKE_STATE_NAME[item.state]}${note}）`;
    }
    case 'pot': {
      const { pot } = item;
      if (pot.contents.length === 0) return pot.dirty ? '鍋（使用済み）' : '鍋';
      const heat = { cold: '未加熱', heating: '加熱中', ready: '完成' }[pot.heat];
      return `鍋（${heat}：${pot.contents.map((id) => INGREDIENTS[id].name).join('・')}）`;
    }
    case 'plate': {
      const kind = { plate: '皿', small: '小皿', bowl: 'スープ皿', rim: 'リム小皿' }[item.style ?? 'plate'];
      return item.contents.length === 0
        ? `${kind}（空）`
        : `${kind}（${item.contents.map((id) => INGREDIENTS[id].name).join('・')}）`;
    }
  }
}
