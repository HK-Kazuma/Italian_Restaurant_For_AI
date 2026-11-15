import { describe, expect, it } from 'vitest';
import gameSource from './game.ts?raw';
import {
  BAKE_TABLE,
  SIDE_TABLE,
  bakeLabel,
  bakeSummary,
  candidatesAt,
  dishName,
  finishLayout,
  flowPlan,
  isSizzling,
  loadLayout,
  overFinishedDish,
  scoopOf,
  servableDish,
  serveHint,
  tableProblems,
  viewOf,
} from './bake';
import { DEFAULT_CONFIG, PLAY_CONFIG, type GameConfig } from './config';
import { COOK_BINS, CUP_FILLS } from './cookStock';
import { Game, describeItem } from './game';
import { REST_DISH, SURFACES } from './layout';
import { LANE_OFFSETS, frontS } from './oven';
import { menusFor } from './position';
import { MENU, getMenu } from './recipe';
import { createTicket } from './tickets';
import type { BakeStyle, CookBinId, FrozenBagId, Item, OvenDeck, PizzaTopping, Target, Ticket } from './types';

// クック編設計書 4.7（C7）：鉄板焼き6品（ハンバーグ・チキン・ミックスグリル）と、目玉焼き・チーズソース・「はがす」必須。
// 4.0 の「肉料理」の表どおりに BAKE_TABLE（bake.ts）・MENU（recipe.ts）の末尾へ登録し、クックの伝票は23品になる。

const C7_IDS = ['hamburg', 'italianHamburg', 'diavolaHamburg', 'mixedGrill', 'chickenDiavola', 'chickenCheese'];
const BEFORE = [
  'milanoDoria',
  'buffaloPizza',
  'cheeseMilanoDoria',
  'tarakoDoria',
  'tarakoGratin',
  'vegMushroomPizza',
  'sausagePizza',
  'cornPizza',
  'popcornShrimp',
  'potatoGrill',
  'chorizo',
  'spicyChicken',
  'focaccia',
  'cinnamonFocaccia',
  'garlicFocaccia',
  'tarakoFocaccia',
  'cheeseFocaccia',
];
const U = DEFAULT_CONFIG.ovenUpperTime;
const L = DEFAULT_CONFIG.ovenLowerTime;
const hot: GameConfig = { ...DEFAULT_CONFIG, hotHandling: true }; // 本番と同じ（熱い器はやっとこで）

type Dish = Extract<Item, { kind: 'bakeDish' }>;

// --- 設備 ---
const pass: Target = { kind: 'servePass' };
const boardStack: Target = { kind: 'boardStack' };
const frame = (index: number): Target => ({ kind: 'workFrame', index });
// 台の上に置いた器（いちばん古い1つ）
const rest = (g: Game): Target => ({ kind: 'restDish', id: g.state.restDishes[0]!.id });
// 作業台の、器を置ける空いている場所（その手が持っている器を置く位置）。見つからなければ null
const freeSpot = (g: Game, h: 'left' | 'tongs' = 'left'): Target | null => {
  for (let x = -0.6; x <= 0.6; x += 0.1) {
    for (let z = -1.7; z <= 1.7; z += 0.1) {
      const t: Target = { kind: 'tableTop', surface: 'prep', x, z };
      if (g.previewRest(h, t)?.valid) return t;
    }
  }
  return null;
};
const vessel = (style: BakeStyle): Target => ({ kind: 'vesselStack', style });
const bag = (id: FrozenBagId): Target => ({ kind: 'frozenBag', id });
const bin = (id: CookBinId): Target => ({ kind: 'cookBin', id });
const source = (id: PizzaTopping): Target => ({ kind: 'pizzaSource', id });
const hook = (id: 'tongs' | 'spatula'): Target => ({ kind: 'toolHook', id });
const inlet = (deck: OvenDeck, lane = 1): Target => ({ kind: 'ovenInlet', deck, x: LANE_OFFSETS[lane], s: frontS('hamburgPan') });
const outlet = (deck: OvenDeck, lane = 1): Target => ({ kind: 'ovenOutlet', deck, lane });

const ticket = (id: number, menuId: string): Ticket => createTicket(id, getMenu(menuId), 0);

function cookGame(c: GameConfig, menus: string[] = [], difficulty: 'trial' | 'leading' = 'leading'): Game {
  const g = new Game(c, () => 0);
  g.start(difficulty, 'cook');
  g.state.nextTicketAt = Infinity;
  g.state.tickets = menus.map((m, i) => ticket(i + 1, m));
  return g;
}
const run = (g: Game, seconds: number) => {
  for (let t = 0; t < seconds; t++) g.update(1);
};
const frameDish = (g: Game, i = 0): Dish => g.state.workFrames[i] as Dish;
const click = (g: Game, t: Target, n = 1) => {
  for (let i = 0; i < n; i++) {
    expect(g.planInteract(t), JSON.stringify(t)).not.toBeNull();
    g.interact(t);
  }
};
const useTool = (g: Game, t: Target) => {
  expect(g.planTool(t), JSON.stringify(t)).not.toBeNull();
  g.useTool(t);
};

// --- 道具の手がオンのときの手順（設計書 4.7 の「ハンバーグの流れ」）---

// 作業枠 i に空の鉄板を置き、1回目の具（パティ・チキン）をのせる
function startPan(g: Game, first: 'patty' | 'chicken', i = 0): void {
  click(g, vessel('hamburgPan'));
  click(g, frame(i));
  click(g, bin(first));
  click(g, frame(i));
  expect(frameDish(g, i).loaded).toEqual({ [first]: 1 });
}
// 作業枠 i の焼く前の器を、左手で持って入口へ
function flowRaw(g: Game, i: number, deck: OvenDeck, lane = 1): void {
  click(g, frame(i));
  click(g, inlet(deck, lane));
}
// 出口の器を、やっとこでつかんで作業枠 i に置く
function tongsToFrame(g: Game, deck: OvenDeck, i: number, lane = 1): void {
  if (g.state.tool?.kind !== 'tongs') useTool(g, hook('tongs'));
  useTool(g, outlet(deck, lane));
  useTool(g, frame(i));
}
// 1回目のあと：ヘラではがす → 付け合わせ（コーン1杯・ポテト1個）→（cup：チーズソースの容器）→ やっとこで2回目の入口へ
function midway(g: Game, i: number, cup = false, lane = 1): void {
  useTool(g, hook('spatula'));
  useTool(g, frame(i));
  expect(frameDish(g, i).cares).toEqual(['scrape']);
  click(g, bin('corn'));
  click(g, frame(i));
  click(g, bin('potato'));
  click(g, frame(i));
  if (cup) addCheeseCup(g, i);
  useTool(g, hook('tongs'));
  useTool(g, frame(i));
  useTool(g, inlet('upper', lane));
}
// チーズソースの小さい容器：空の容器 → ピザソース1杯 → ピザチーズ1杯 → 鉄板の空きにのせる
function addCheeseCup(g: Game, i: number): void {
  click(g, bin('cheeseSauceCup'));
  expect(g.state.hand).toEqual({ kind: 'sauceCup', fill: 'empty' });
  click(g, source('sauce'));
  click(g, source('cheese'));
  expect(g.state.hand).toEqual({ kind: 'sauceCup', fill: 'cheese' });
  click(g, frame(i));
  expect(g.state.hand).toBeNull();
  expect(frameDish(g, i).loaded?.cheeseCup).toBe(1);
}
// 2回目（または1回だけの品）が焼けたら、左手に板を持ち、やっとこで出口の鉄板をつかむ → 板に乗る → 作業枠 i に置く
function boardToFrame(g: Game, deck: OvenDeck, i: number, lane = 1): void {
  click(g, boardStack);
  if (g.state.tool?.kind !== 'tongs') useTool(g, hook('tongs'));
  useTool(g, outlet(deck, lane));
  expect(g.state.hand).toMatchObject({ kind: 'bakeDish', style: 'hamburgPan', board: true, state: 'baked' });
  expect(g.state.tool).toEqual({ kind: 'tongs', dish: null });
  click(g, frame(i));
}
// 目玉焼き：目玉焼き鉄板を作業枠 i に置く → 卵を2回入れる
function startEggs(g: Game, i: number): void {
  click(g, vessel('eggPan'));
  click(g, frame(i));
  click(g, bin('egg'));
  click(g, frame(i));
  click(g, bin('egg'));
  click(g, frame(i));
  expect(frameDish(g, i).loaded).toEqual({ egg: 2 });
}
// レードルのソースを、作業枠 i の板に乗せた鉄板にかける
function ladle(g: Game, id: 'demiglace' | 'vegPaste', i: number): void {
  click(g, bin(id));
  expect(g.state.hand?.kind).toBe('sauceLadle');
  click(g, frame(i));
  expect(g.state.hand).toBeNull();
}
// ヘラで目玉焼きを1つすくい（from）、作業枠 i の仕上げ中の鉄板にのせる
function egg(g: Game, from: Target, i: number): void {
  useTool(g, hook('spatula'));
  useTool(g, from);
  expect(g.state.tool).toEqual({ kind: 'spatula', scoop: 'friedEgg' });
  useTool(g, frame(i));
  expect(g.state.tool).toEqual({ kind: 'spatula', scoop: null });
}
// 作業枠 i の板ごと持ち上げて、提供台へ。得点が入れば true
function serve(g: Game, i: number): void {
  click(g, frame(i));
  click(g, pass);
}

// 品ごとの、道具の手がオンのときの手順（最後に板ごと持ち上げる手前まで。仕上げ中の鉄板は作業枠 0）
function makeOnFrame(g: Game, id: string): void {
  const egged = id === 'hamburg' || id === 'diavolaHamburg';
  if (id === 'mixedGrill') {
    click(g, vessel('hamburgPan'));
    click(g, frame(0));
    // のせる順番は自由（ここではコーン → シュリンプ → ポテト → 辛味チキン → パティ）
    click(g, bin('corn'));
    click(g, frame(0));
    click(g, bag('popcornShrimp'), 5);
    click(g, frame(0));
    click(g, bin('potato'), 2);
    click(g, frame(0));
    click(g, bag('spicyChicken'), 2);
    click(g, frame(0));
    click(g, bin('patty'));
    click(g, frame(0));
    expect(frameDish(g).loaded).toEqual({ corn: 1, shrimp: 5, potato: 2, spicyChicken: 2, patty: 1 });
    flowRaw(g, 0, 'lower');
    run(g, L + 1);
    boardToFrame(g, 'lower', 0);
    ladle(g, 'demiglace', 0);
    return;
  }
  const chicken = id === 'chickenDiavola' || id === 'chickenCheese';
  const cup = id === 'italianHamburg' || id === 'chickenCheese';
  startPan(g, chicken ? 'chicken' : 'patty', 0);
  if (egged) startEggs(g, 1);
  flowRaw(g, 0, chicken ? 'lower' : 'upper', 1);
  if (egged) flowRaw(g, 1, 'upper', 0); // ハンバーグと目玉焼きを同時に上段へ
  run(g, (chicken ? L : U) + 1);
  tongsToFrame(g, chicken ? 'lower' : 'upper', 0);
  if (egged) tongsToFrame(g, 'upper', 1, 0);
  midway(g, 0, cup);
  run(g, U + 1);
  boardToFrame(g, 'upper', 0);
  if (cup) click(g, frame(0)); // 容器のチーズソースをかける
  if (id === 'hamburg') ladle(g, 'demiglace', 0);
  if (id === 'diavolaHamburg' || id === 'chickenDiavola') ladle(g, 'vegPaste', 0);
  if (egged) egg(g, frame(1), 0);
}

// ===================== 表とメニュー =====================

describe('C7 の6品の登録（表の行とメニュー）', () => {
  it('表とメニューの末尾に、6品がこの並びで載る。既存の17品の並びは変わらない。クックの伝票は23品', () => {
    expect(BAKE_TABLE.map((d) => d.id)).toEqual([...BEFORE, ...C7_IDS]);
    expect(MENU.slice(-C7_IDS.length).map((m) => m.id)).toEqual(C7_IDS);
    expect(menusFor('cook').map((m) => m.id)).toEqual([...BEFORE, ...C7_IDS]);
    for (const id of C7_IDS) {
      const m = getMenu(id);
      expect(m).toMatchObject({ station: 'cook', category: 'meat', form: 'bake', enabled: true, ingredients: [] });
      expect(m.basePoints).toBe(id === 'mixedGrill' ? 80 : 70); // C10 の仮の値
    }
    expect(dishName('hamburg')).toBe('ハンバーグ');
    expect(dishName('chickenCheese')).toBe('柔らかチキンのチーズ焼き');
  });

  it('表の値は 4.0 の「肉料理」の表どおり（器はハンバーグの鉄板、受け台は木の板）。表の決まりに反しない', () => {
    const row = (id: string) => BAKE_TABLE.find((d) => d.id === id)!;
    for (const id of C7_IDS) expect(row(id)).toMatchObject({ vessel: 'hamburgPan', finish: { base: 'board' } });
    expect(bakeSummary(row('hamburg'))).toBe('上段1周 → ヘラではがす → 上段1周 → 板 → デミグラスソース → 目玉焼き');
    expect(bakeSummary(row('italianHamburg'))).toBe('上段1周 → ヘラではがす → 上段1周 → 板 → チーズソース');
    expect(bakeSummary(row('diavolaHamburg'))).toBe('上段1周 → ヘラではがす → 上段1周 → 板 → 野菜ペースト → 目玉焼き');
    expect(bakeSummary(row('mixedGrill'))).toBe('下段1周 → 板 → デミグラスソース');
    expect(bakeSummary(row('chickenDiavola'))).toBe('下段1周 → ヘラではがす → 上段1周 → 板 → 野菜ペースト');
    expect(bakeSummary(row('chickenCheese'))).toBe('下段1周 → ヘラではがす → 上段1周 → 板 → チーズソース');
    // 付け合わせはコーン1杯・ポテト1個（仮）。イタリアン・チーズ焼きは、さらにチーズソースの容器
    expect(row('hamburg').stages[1].load.map((s) => [s.id, s.count])).toEqual([['corn', 1], ['potato', 1]]);
    expect(row('italianHamburg').stages[1].load.map((s) => [s.id, s.count])).toEqual([['corn', 1], ['potato', 1], ['cheeseCup', 1]]);
    expect(row('mixedGrill').stages[0].load.map((s) => [s.id, s.count, s.at])).toEqual([
      ['patty', 1, 'lowerCenter'],
      ['spicyChicken', 2, 'left'],
      ['shrimp', 5, 'right'],
      ['potato', 2, 'upperLeft'],
      ['corn', 1, 'upperRight'],
    ]);
    expect(tableProblems()).toEqual([]);
    expect(tableProblems([...BAKE_TABLE, ...SIDE_TABLE])).toEqual([]);
  });

  it('目玉焼きは伝票に出ない付け合わせの行（目玉焼き鉄板に卵2個 → U。受け台はヘラ = すくって使う）', () => {
    expect(SIDE_TABLE).toEqual([
      { id: 'friedEgg', name: '目玉焼き', vessel: 'eggPan', stages: [{ load: [{ id: 'egg', count: 2, at: 'all' }], need: 1 }], finish: { base: 'scoop' } },
    ]);
    expect(MENU.some((m) => m.id === 'friedEgg')).toBe(false);
    expect(BAKE_TABLE.some((d) => d.vessel === 'eggPan')).toBe(false);
  });

  it('6品すべてが、クックの伝票に出る（クックの23品すべて）', () => {
    let seed = 7;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const g = new Game(DEFAULT_CONFIG, rng);
    g.start('leading', 'cook');
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      g.state.nextTicketAt = 0;
      g.state.tickets = [];
      g.update(0.001);
      for (const t of g.state.tickets) seen.add(t.menuId);
    }
    expect([...seen].sort()).toEqual([...BEFORE, ...C7_IDS].sort());
  });

  it('game.ts に品の名前で分ける条件がない（段・中身・仕上げは表から引く）', () => {
    for (const id of [...C7_IDS, 'friedEgg']) expect(gameSource.includes(`'${id}'`), id).toBe(false);
    for (const name of ['ハンバーグ', 'ミックスグリル', '若鶏', 'チーズ焼き']) expect(gameSource.includes(name), name).toBe(false);
  });
});

// ===================== 受け入れ条件 =====================

describe('受け入れ条件（設計書 4.7）：6品すべてを、表の手順どおりに作って提供できる', () => {
  for (const id of C7_IDS) {
    it(`${dishName(id)}：道具の手がオン（やっとこ・ヘラ）の手順で作って提供すると、採点される`, () => {
      const g = cookGame(hot, [id]);
      makeOnFrame(g, id);
      expect(servableDish(frameDish(g))?.id, describeItem(frameDish(g))).toBe(id);
      serve(g, 0);
      expect(g.state).toMatchObject({ served: 1, mistakes: 0, tickets: [] });
      expect(g.state.score).toBeGreaterThan(0);
    });
  }

  it('ハンバーグと目玉焼きを同時に上段に流し、両方が出てから仕上げられる', () => {
    const g = cookGame(hot, ['hamburg']);
    startPan(g, 'patty', 0);
    startEggs(g, 1);
    flowRaw(g, 0, 'upper', 1);
    flowRaw(g, 1, 'upper', 0);
    expect(g.state.oven.decks.upper.map((d) => d.style).sort()).toEqual(['eggPan', 'hamburgPan']);
    run(g, U + 1);
    // 両方とも出てきた（やっとこでつかめる）
    expect(g.planTool(outlet('upper', 1))).toBeNull(); // 道具をまだ持っていない
    useTool(g, hook('tongs'));
    expect(g.planTool(outlet('upper', 1))).not.toBeNull();
    expect(g.planTool(outlet('upper', 0))).not.toBeNull();
    tongsToFrame(g, 'upper', 0, 1);
    tongsToFrame(g, 'upper', 1, 0);
    expect(frameDish(g, 1)).toMatchObject({ style: 'eggPan', state: 'baked', loaded: { egg: 2 } });
    expect(scoopOf(frameDish(g, 1))).toEqual({ load: 'egg', finish: 'friedEgg' });
    midway(g, 0);
    run(g, U + 1);
    boardToFrame(g, 'upper', 0);
    ladle(g, 'demiglace', 0);
    egg(g, frame(1), 0);
    expect(frameDish(g, 1).loaded).toEqual({ egg: 1 }); // 目玉焼きは、まだ1つ残っている
    serve(g, 0);
    expect(g.state).toMatchObject({ served: 1, mistakes: 0 });
  });

  it('はがしていない鉄板に、コーン（付け合わせ・チーズソースの容器）をのせられない。理由が出る', () => {
    const g = cookGame(hot);
    startPan(g, 'patty', 0);
    flowRaw(g, 0, 'upper');
    run(g, U + 1);
    tongsToFrame(g, 'upper', 0);
    expect(bakeLabel(frameDish(g))).toContain('1回目 焼き上がり → ヘラではがす → コーン・ポテトをのせる → 流す');
    click(g, bin('corn'));
    expect(g.planInteract(frame(0))).toBeNull();
    expect(g.getaHint(frame(0))).toContain('ヘラではがしてからコーンをのせる');
    g.state.hand = { kind: 'loadStack', id: 'potato', count: 1 };
    expect(g.planInteract(frame(0))).toBeNull();
    g.state.hand = { kind: 'sauceCup', fill: 'cheese' };
    expect(g.planInteract(frame(0))).toBeNull();
    expect(g.getaHint(frame(0))).toContain('ヘラではがしてから');
    // はがすと、のせられる
    g.state.hand = { kind: 'loadStack', id: 'corn', count: 1 };
    useTool(g, hook('spatula'));
    useTool(g, frame(0));
    click(g, frame(0));
    expect(frameDish(g).loaded).toEqual({ patty: 1, corn: 1 });
  });
});

// ===================== 途中での切り替え・仕上げの入れ間違い =====================

describe('途中での切り替え（1回目が同じ3品）と、仕上げの入れ間違い', () => {
  // 2回目まで焼いて板に乗せた鉄板（チーズソースの容器なし／あり）を、作業枠 0 に用意する。目玉焼きは作業枠 1
  function readyPan(g: Game, cup: boolean): void {
    startPan(g, 'patty', 0);
    startEggs(g, 1);
    flowRaw(g, 0, 'upper', 1);
    flowRaw(g, 1, 'upper', 0);
    run(g, U + 1);
    tongsToFrame(g, 'upper', 0, 1);
    tongsToFrame(g, 'upper', 1, 0);
    midway(g, 0, cup);
    run(g, U + 1);
    boardToFrame(g, 'upper', 0);
  }

  it('1回目のあとは、ハンバーグ・イタリアン・ディアボラ風のどれにもなれる（品は2回目の前と仕上げで決まる）', () => {
    const g = cookGame(hot);
    startPan(g, 'patty', 0);
    const plan = flowPlan(frameDish(g));
    expect(plan.ok && plan.dishes.map((d) => d.id)).toEqual(['hamburg', 'italianHamburg', 'diavolaHamburg']);
    flowRaw(g, 0, 'upper');
    run(g, U + 1);
    tongsToFrame(g, 'upper', 0);
    useTool(g, hook('spatula'));
    useTool(g, frame(0));
    click(g, bin('corn'));
    click(g, frame(0));
    click(g, bin('potato'));
    click(g, frame(0));
    const noCup = flowPlan(frameDish(g));
    expect(noCup.ok && noCup.dishes.map((d) => d.id)).toEqual(['hamburg', 'diavolaHamburg']);
    addCheeseCup(g, 0);
    const withCup = flowPlan(frameDish(g));
    expect(withCup.ok && withCup.dishes.map((d) => d.id)).toEqual(['italianHamburg']);
  });

  it('途中まで作った鉄板を、別の伝票の品に切り替えられる（ハンバーグのつもりの鉄板 → ディアボラ風の伝票で出す）', () => {
    const g = cookGame(hot, ['diavolaHamburg']);
    readyPan(g, false);
    ladle(g, 'vegPaste', 0);
    egg(g, frame(1), 0);
    expect(servableDish(frameDish(g))?.id).toBe('diavolaHamburg');
    serve(g, 0);
    expect(g.state).toMatchObject({ served: 1, mistakes: 0, tickets: [] });
  });

  it('仕上げで品が決まる：その中身の伝票がなければ、注文ミス（ハンバーグの仕上げで出したが、伝票はイタリアンだけ）', () => {
    const g = cookGame(hot, ['italianHamburg']);
    readyPan(g, false);
    ladle(g, 'demiglace', 0);
    egg(g, frame(1), 0);
    expect(servableDish(frameDish(g))?.id).toBe('hamburg');
    serve(g, 0);
    expect(g.state).toMatchObject({ served: 0, mistakes: 1 });
    expect(g.state.tickets.map((t) => t.menuId)).toEqual(['italianHamburg']);
  });

  it('イタリアンに目玉焼きをのせると、その中身の品はないので注文ミス（伝票があっても）', () => {
    const g = cookGame(hot, ['italianHamburg']);
    readyPan(g, true);
    click(g, frame(0)); // 容器のチーズソース
    egg(g, frame(1), 0);
    expect(servableDish(frameDish(g))).toBeNull();
    expect(overFinishedDish(frameDish(g))?.id).toBe('italianHamburg');
    expect(serveHint(frameDish(g))).toContain('イタリアンハンバーグを提供台に出す');
    serve(g, 0);
    expect(g.state).toMatchObject({ served: 0, mistakes: 1 });
  });

  it('ハンバーグに野菜ペーストも足すと、その中身の品はないので注文ミス', () => {
    const g = cookGame(hot, ['hamburg', 'diavolaHamburg']);
    readyPan(g, false);
    ladle(g, 'demiglace', 0);
    ladle(g, 'vegPaste', 0);
    egg(g, frame(1), 0);
    expect(servableDish(frameDish(g))).toBeNull();
    serve(g, 0);
    expect(g.state).toMatchObject({ served: 0, mistakes: 1 });
    expect(g.state.tickets).toHaveLength(2);
  });

  it('仕上げが足りない鉄板は、提供台に出せない（理由が出る）', () => {
    const g = cookGame(hot, ['hamburg']);
    readyPan(g, false);
    ladle(g, 'demiglace', 0);
    click(g, frame(0));
    expect(g.planInteract(pass)).toBeNull();
    expect(g.getaHint(pass)).toContain('仕上げが足りない（目玉焼き）');
  });
});

// ===================== 目玉焼き =====================

describe('目玉焼き', () => {
  function bakeEggs(g: Game): void {
    startEggs(g, 1);
    flowRaw(g, 1, 'upper', 0);
    run(g, U + 1);
  }

  it('卵は2個まで（3個目は入らない）。2個そろえば上段に流せる', () => {
    const g = cookGame(hot);
    click(g, vessel('eggPan'));
    click(g, frame(0));
    click(g, bin('egg'), 3);
    click(g, frame(0));
    expect(frameDish(g).loaded).toEqual({ egg: 2 });
    expect(g.state.hand).toEqual({ kind: 'loadStack', id: 'egg', count: 1 });
    const plan = flowPlan(frameDish(g));
    expect(plan.ok && plan.dishes.map((d) => d.id)).toEqual(['friedEgg']);
  });

  it('焼けた目玉焼き鉄板は、出口からやっとこで台の上へ。台の上の熱い器は素手では持てない。ヘラで台の上からすくえる', () => {
    const g = cookGame(hot, ['hamburg']);
    bakeEggs(g);
    useTool(g, hook('tongs'));
    useTool(g, outlet('upper', 0));
    const spot = freeSpot(g, 'tongs')!;
    expect(g.toolHint(spot)).toBe('F：器をここに置く');
    useTool(g, spot);
    expect(g.state.restDishes[0]?.dish).toMatchObject({ style: 'eggPan', state: 'baked', loaded: { egg: 2 } });
    g.interact(rest(g));
    expect(g.state.hand).toBeNull();
    expect(g.state.toast?.text).toContain('熱い');
    expect(g.getaHint(rest(g))).toContain('やっとこでつかむ');
    // 仕上げ中のハンバーグ（板に乗せた最後の段階の焼き上がり）に、置き場からすくってのせる
    startPan(g, 'patty', 0);
    flowRaw(g, 0, 'upper');
    run(g, U + 1);
    tongsToFrame(g, 'upper', 0);
    midway(g, 0);
    run(g, U + 1);
    boardToFrame(g, 'upper', 0);
    ladle(g, 'demiglace', 0);
    egg(g, rest(g), 0);
    expect(g.state.restDishes[0]?.dish.loaded).toEqual({ egg: 1 });
    serve(g, 0);
    expect(g.state.served).toBe(1);
  });

  it('目玉焼きが余ったまま、次のハンバーグに使える。2つとも使うと、目玉焼き鉄板は空の器になり、山に戻せる', () => {
    const g = cookGame(hot, ['hamburg', 'hamburg']);
    bakeEggs(g);
    tongsToFrame(g, 'upper', 2, 0); // 目玉焼きは作業枠 2 に置いておく
    for (let k = 0; k < 2; k++) {
      startPan(g, 'patty', 0);
      flowRaw(g, 0, 'upper');
      run(g, U + 1);
      tongsToFrame(g, 'upper', 0);
      midway(g, 0);
      run(g, U + 1);
      boardToFrame(g, 'upper', 0);
      ladle(g, 'demiglace', 0);
      egg(g, frame(2), 0);
      serve(g, 0);
      expect(g.state.served).toBe(k + 1);
    }
    expect(frameDish(g, 2)).toMatchObject({ kind: 'bakeDish', style: 'eggPan', state: 'raw', blank: true });
    useTool(g, hook('spatula'));
    useTool(g, hook('spatula')); // ヘラをフックに戻す
    click(g, frame(2));
    click(g, vessel('eggPan'));
    expect(g.state.hand).toBeNull();
    expect(g.state.mistakes).toBe(0);
  });

  it('焼けた目玉焼き鉄板（目玉焼きが残っている）は提供できず、卵も足せない', () => {
    const g = cookGame(hot);
    bakeEggs(g);
    tongsToFrame(g, 'upper', 1, 0);
    expect(serveHint(frameDish(g, 1))).toContain('付け合わせは提供しない');
    click(g, bin('egg'));
    expect(g.planInteract(frame(1))).toBeNull();
  });
});

// ===================== チーズソース =====================

describe('チーズソースの小さい容器', () => {
  it('空の容器 → ピザソース → ピザチーズの順にしか入らない。入れ終わるまで鉄板にはのせられない', () => {
    expect(Object.keys(CUP_FILLS)).toEqual(['empty', 'sauce', 'cheese']);
    expect(COOK_BINS.cheeseSauceCup.cup).toBe(true);
    const g = cookGame(hot);
    click(g, bin('cheeseSauceCup'));
    expect(g.planInteract(source('cheese'))).toBeNull(); // 先にピザソース
    expect(g.pizzaHint(source('cheese'))).toContain('先にピザソース');
    click(g, source('sauce'));
    expect(g.planInteract(source('sauce'))).toBeNull();
    expect(describeItem(g.state.hand)).toBe('チーズソースの容器（ピザソース入り）');
    // 入れ終わる前は、鉄板にのせられない
    const g2 = cookGame(hot);
    startPan(g2, 'patty', 0);
    g2.state.hand = { kind: 'sauceCup', fill: 'sauce' };
    expect(g2.planInteract(frame(0))).toBeNull();
    expect(g2.getaHint(frame(0))).toContain('先にピザチーズを容器に入れる');
    // 空の容器は、容器の山に戻せる
    const g3 = cookGame(hot);
    click(g3, bin('cheeseSauceCup'));
    click(g3, bin('cheeseSauceCup'));
    expect(g3.state.hand).toBeNull();
  });

  it('焼けたあと、板に乗せた鉄板を左クリックするとソースがかかる（容器は見えなくなり、2回はかけられない）', () => {
    const g = cookGame(hot, ['chickenCheese']);
    startPan(g, 'chicken', 0);
    flowRaw(g, 0, 'lower');
    run(g, L + 1);
    tongsToFrame(g, 'lower', 0);
    midway(g, 0, true);
    run(g, U + 1);
    boardToFrame(g, 'upper', 0);
    expect(g.getaHint(frame(0))).toContain('左クリック：容器のチーズソースをかける');
    click(g, frame(0));
    expect(frameDish(g).finishes).toEqual(['cheeseSauce']);
    expect(frameDish(g).loaded?.cheeseCup).toBe(1); // 焼いたときの中身の記録は残す（見た目は描かない）
    expect(g.getaHint(frame(0))).toContain('左クリック：持ち上げる'); // 2回目は、かからない（持ち上げる）
    serve(g, 0);
    expect(g.state).toMatchObject({ served: 1, mistakes: 0 });
  });

  it('板に乗せる前（焼けたばかりの熱い鉄板）には、ソースはかからない', () => {
    const g = cookGame(hot);
    startPan(g, 'patty', 0);
    flowRaw(g, 0, 'upper');
    run(g, U + 1);
    tongsToFrame(g, 'upper', 0);
    midway(g, 0, true);
    run(g, U + 1);
    tongsToFrame(g, 'upper', 0);
    expect(frameDish(g)).toMatchObject({ stage: 1, state: 'baked' });
    g.interact(frame(0));
    expect(frameDish(g).finishes).toBeUndefined();
    click(g, bin('demiglace'));
    expect(g.planInteract(frame(0))).toBeNull();
    expect(g.getaHint(frame(0))).toContain('デミグラスソースは、板に乗せてからかける');
  });
});

// ===================== トライアル（素手の手順）=====================

describe('熱い器の決まりがオフ（トライアル）：素手の従来手順で同じ品が作れる', () => {
  it('ハンバーグ：出口は素手で取り、手が空の左クリックではがし、板を持って出口をクリックで乗せる', () => {
    const g = cookGame(PLAY_CONFIG, ['hamburg'], 'trial');
    expect(g.hotHandling()).toBe(false);
    startPan(g, 'patty', 0);
    startEggs(g, 1);
    flowRaw(g, 0, 'upper', 1);
    flowRaw(g, 1, 'upper', 0);
    run(g, U + 1);
    click(g, outlet('upper', 1));
    click(g, frame(0));
    click(g, outlet('upper', 0));
    click(g, frame(1));
    click(g, frame(0)); // はがす（手が空の左クリック）
    expect(frameDish(g).cares).toEqual(['scrape']);
    click(g, bin('corn'));
    click(g, frame(0));
    click(g, bin('potato'));
    click(g, frame(0));
    click(g, frame(0)); // 持ち上げる
    click(g, inlet('upper'));
    run(g, U + 1);
    click(g, boardStack);
    click(g, outlet('upper'));
    expect(g.state.hand).toMatchObject({ board: true, stage: 1, state: 'baked' });
    click(g, frame(0));
    ladle(g, 'demiglace', 0);
    egg(g, frame(1), 0); // 目玉焼きは、トライアルでもヘラ（F）で
    serve(g, 0);
    expect(g.state).toMatchObject({ served: 1, mistakes: 0 });
  });

  it('ミックスグリル：素手で下段に流し、板を持って出口をクリックで乗せる（ヘラは使わない）', () => {
    const g = cookGame(PLAY_CONFIG, ['mixedGrill'], 'trial');
    click(g, vessel('hamburgPan'));
    click(g, frame(0));
    click(g, bin('patty'));
    click(g, frame(0));
    click(g, bag('spicyChicken'), 2);
    click(g, frame(0));
    click(g, bag('popcornShrimp'), 5);
    click(g, frame(0));
    click(g, bin('potato'), 2);
    click(g, frame(0));
    click(g, bin('corn'));
    click(g, frame(0));
    expect(bakeLabel(frameDish(g))).toBe('ミックスグリル 焼く前'); // 1回だけの品（はがさない）
    flowRaw(g, 0, 'lower');
    run(g, L + 1);
    click(g, boardStack);
    click(g, outlet('lower'));
    click(g, frame(0));
    ladle(g, 'demiglace', 0);
    serve(g, 0);
    expect(g.state).toMatchObject({ served: 1, mistakes: 0 });
  });
});

// ===================== 見た目（表から引く位置・油はね）=====================

describe('見た目：盛り付けの位置は表から自動で決まる。焼けた鉄板は油がはねる', () => {
  it('ハンバーグ：左にポテト、上にコーン、中央にパティ、右上に目玉焼き。ミックスグリルは表の位置', () => {
    const g = cookGame(hot, ['hamburg']);
    makeOnFrame(g, 'hamburg');
    const pan = frameDish(g);
    expect(loadLayout(pan)).toMatchObject({ patty: 'center', corn: 'upper', potato: 'left' });
    expect(finishLayout(pan)).toMatchObject({ friedEgg: 'upperRight', demiglace: 'all' });
    const g2 = cookGame(hot, ['mixedGrill']);
    makeOnFrame(g2, 'mixedGrill');
    expect(loadLayout(frameDish(g2))).toEqual({ patty: 'lowerCenter', spicyChicken: 'left', shrimp: 'right', potato: 'upperLeft', corn: 'upperRight' });
    expect(finishLayout(frameDish(g2)).demiglace).toBe('lowerCenter'); // デミグラスソースはハンバーグに
  });

  it('1回目が焼けた鉄板に付け合わせを足している途中も、ハンバーグの位置（ミックスグリルの位置にならない）', () => {
    const g = cookGame(hot);
    startPan(g, 'patty', 0);
    flowRaw(g, 0, 'upper');
    run(g, U + 1);
    tongsToFrame(g, 'upper', 0);
    useTool(g, hook('spatula'));
    useTool(g, frame(0));
    click(g, bin('corn'));
    click(g, frame(0));
    expect(candidatesAt(viewOf(frameDish(g)), 0)).toEqual([]);
    expect(loadLayout(frameDish(g))).toMatchObject({ corn: 'upper', patty: 'center' });
  });

  it('焼けた鉄板（ハンバーグの鉄板・目玉焼き鉄板）は、出口から取ってから5秒間だけ油がはねる。ほかの器ははねない', () => {
    expect(DEFAULT_CONFIG.sizzleSeconds).toBe(5);
    const g = cookGame(hot);
    startPan(g, 'patty', 0);
    flowRaw(g, 0, 'upper');
    run(g, U + 1);
    useTool(g, hook('tongs'));
    useTool(g, outlet('upper'));
    const dish = (g.state.tool as { dish: Dish }).dish;
    expect(dish.outAt).toBe(g.state.time);
    expect(isSizzling(dish, g.state.time, DEFAULT_CONFIG)).toBe(true);
    expect(isSizzling(dish, g.state.time + 4.9, DEFAULT_CONFIG)).toBe(true);
    expect(isSizzling(dish, g.state.time + 5, DEFAULT_CONFIG)).toBe(false);
    // ドリアは、はねない
    const g2 = new Game(DEFAULT_CONFIG, () => 0);
    g2.start('leading', 'cook');
    g2.state.nextTicketAt = Infinity;
    click(g2, { kind: 'ovenStock', style: 'doria' });
    click(g2, { kind: 'ovenInlet', deck: 'lower', x: 0, s: frontS('doria') });
    run(g2, L + 1);
    click(g2, { kind: 'ovenOutlet', deck: 'lower', lane: 1 });
    expect(g2.state.hand).not.toHaveProperty('outAt');
    expect(isSizzling(g2.state.hand, g2.state.time, DEFAULT_CONFIG)).toBe(false);
  });

  it('見た目の違い（はがしたか・中身・ソース・目玉焼き）は、焼き皿の進み具合に入る（描き直しの印 itemSignature の元）', () => {
    const g = cookGame(hot, ['hamburg']);
    makeOnFrame(g, 'hamburg');
    const pan = frameDish(g);
    expect(pan).toMatchObject({ cares: ['scrape'], finishes: ['demiglace', 'friedEgg'], loaded: { patty: 1, corn: 1, potato: 1 } });
  });
});

// ===================== 置き場 =====================

describe('台の上に自由に置く器（使い終わった器・焼けた器）', () => {
  it('冷めた器は左手で作業台に置ける・持ち上げられる。受け台に乗せた器・2列系の器は置けない', () => {
    const g = cookGame(hot);
    click(g, vessel('eggPan'));
    click(g, freeSpot(g)!);
    expect(g.state.restDishes[0]?.dish).toMatchObject({ style: 'eggPan', blank: true });
    click(g, rest(g));
    expect(g.state.hand).toMatchObject({ style: 'eggPan' });
    expect(g.state.restDishes).toEqual([]);
    g.state.hand = { kind: 'board' };
    expect(freeSpot(g)).toBeNull();
    g.state.hand = null;
    click(g, vessel('largePad'));
    expect(freeSpot(g)).toBeNull();
  });

  it('置いた器の上には、ほかの器を重ねて置けない。置ける位置は、台の上の範囲に収まる', () => {
    const g = cookGame(hot);
    click(g, vessel('eggPan'));
    const first = freeSpot(g)!;
    click(g, first);
    click(g, vessel('eggPan'));
    expect(g.previewRest('left', first)?.valid).toBe(false);
    expect(g.planInteract(first)).toBeNull();
    const second = freeSpot(g)!;
    click(g, second);
    expect(g.state.restDishes).toHaveLength(2);
    const [a, b] = g.state.restDishes.map((r) => r.spot);
    expect(Math.abs(a.x - b.x) >= REST_DISH.w || Math.abs(a.z - b.z) >= REST_DISH.d).toBe(true);
    for (const r of g.state.restDishes) {
      expect(Math.abs(r.spot.x) + REST_DISH.w / 2).toBeLessThanOrEqual(SURFACES.prep.width / 2);
      expect(Math.abs(r.spot.z) + REST_DISH.d / 2).toBeLessThanOrEqual(SURFACES.prep.depth / 2);
    }
  });

  it('サラダ台には置けない', () => {
    const g = cookGame(hot);
    click(g, vessel('eggPan'));
    const salad: Target = { kind: 'tableTop', surface: 'salad', x: 0, z: 0 };
    expect(g.previewRest('left', salad)?.reason).toBe('surface');
    expect(g.planInteract(salad)).toBeNull();
  });
});
