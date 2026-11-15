import { describe, expect, it } from 'vitest';
import gameSource from './game.ts?raw';
import { BAKE_TABLE, bakeSummary, bakedMenus, dishName, getBakeDish, loadLayout, loadRoom, overFinishedDish, progressSignature, servableDish, serveHint, tableProblems, viewOf, whyNotLoad } from './bake';
import { BOTTLE_BAKE_FINISH, BOTTLE_BAKE_LOAD, BOTTLE_IDS, BOTTLE_SURFACES, COOK_BOTTLE_IDS } from './bottle';
import { DEFAULT_CONFIG as cfg } from './config';
import { COOK_BINS, FLIP_LOADS, SOURCE_RIGHT_TAKE, pourInto } from './cookStock';
import { Game, describeItem } from './game';
import { BOTTLE_HOME, COOK_BIN, COOK_BIN_SPOTS, FROZEN_SHELF, OVEN_COUNTER, OVEN_COUNTER_ROW, OVEN_COUNTER_ZS, PREP_FIXTURES, SHELF_FIXTURES, SURFACES, overlapsShelfFixture } from './layout';
import { bakeItem, frontS } from './oven';
import { menusFor } from './position';
import { MENU, getMenu } from './recipe';
import { serveScore } from './score';
import { createTicket } from './tickets';
import { hasTutorial, matchesTarget, tutorialSteps, type GuideAt } from './tutorial';
import { TUTORIAL_PENDING_C10, followPrep } from './testShared';
import type { BakeStyle, BottleId, CookBinId, FrozenBagId, Item, Target, Ticket } from './types';

// クック編設計書 4.6（C6）：前菜4品・フォッカチオ5品。
// 4.0 の「前菜」「焼きたてパン」の表どおりに BAKE_TABLE（bake.ts）・MENU（recipe.ts）の末尾へ登録し、クックの伝票は17品になる。

const STARTERS = ['popcornShrimp', 'potatoGrill', 'chorizo', 'spicyChicken'] as const;
const BREADS = ['focaccia', 'cinnamonFocaccia', 'garlicFocaccia', 'tarakoFocaccia', 'cheeseFocaccia'] as const;
const C6_IDS: string[] = [...STARTERS, ...BREADS];
const C3_AND_BEFORE = ['milanoDoria', 'buffaloPizza', 'cheeseMilanoDoria', 'tarakoDoria', 'tarakoGratin', 'vegMushroomPizza', 'sausagePizza', 'cornPizza'];
// C7（ステップJ）で鉄板焼き6品が、C6 の9品のさらに後ろ（末尾）に登録された（C7 の6品登録による。2026-11-15 承認）。クックの伝票は23品
const C7_IDS = ['hamburg', 'italianHamburg', 'diavolaHamburg', 'mixedGrill', 'chickenDiavola', 'chickenCheese'];
const ALL_COOK = [...C3_AND_BEFORE, ...C6_IDS, ...C7_IDS];

type Dish = Extract<Item, { kind: 'bakeDish' }>;

// --- 設備 ---
const pass: Target = { kind: 'servePass' };
const getaStack: Target = { kind: 'getaStack' };
const smallStack: Target = { kind: 'plateStack', style: 'small' };
const frame = (index: number): Target => ({ kind: 'workFrame', index });
const vessel = (style: BakeStyle): Target => ({ kind: 'vesselStack', style });
const bag = (id: FrozenBagId): Target => ({ kind: 'frozenBag', id });
const bin = (id: CookBinId): Target => ({ kind: 'cookBin', id });
const bottle = (id: BottleId): Target => ({ kind: 'bottle', id });
const bottleBack = (id: BottleId): Target => ({ kind: 'tableTop', surface: BOTTLE_HOME[id].surface, x: BOTTLE_HOME[id].x, z: BOTTLE_HOME[id].z });
const cheeseSource: Target = { kind: 'pizzaSource', id: 'cheese' };
const inlet = (deck: 'upper' | 'lower', style: BakeStyle): Target => ({ kind: 'ovenInlet', deck, x: 0, s: frontS(style) });
const outlet = (deck: 'upper' | 'lower'): Target => ({ kind: 'ovenOutlet', deck, lane: 1 }); // 3列系の器を x = 0 に流すと、まん中のレーン

const ticket = (id: number, menuId: string, arrivedAt = 0): Ticket => createTicket(id, getMenu(menuId), arrivedAt);

function cookGame(tickets: Ticket[] = []): Game {
  const g = new Game(cfg, () => 0);
  g.start('leading', 'cook');
  g.state.nextTicketAt = Infinity;
  g.state.tickets = tickets;
  return g;
}
const frameDish = (g: Game, i = 0): Dish => g.state.workFrames[i] as Dish;

// 台本の1手：左クリック / 右クリック / 時間を進める / 矢印が指さない場所への左クリック（ボトルを台に戻す）
type Act = Target | { right: Target } | { wait: number } | { free: Target };
const wait = (seconds: number): Act => ({ wait: seconds });
const times = (t: Target, n: number): Act[] => Array.from({ length: n }, () => t);

// 焼成パッドの品：パッドを作業枠に置く → 具 → 上段 → 焼いている間に小皿を作業枠へ → 出口から取って小皿に移す → パッドを棚へ →（仕上げ）→ 提供
const padDish = (loads: Act[], finish: Act[] = []): Act[] => [
  vessel('bakingPad'), frame(0), ...loads, frame(0), inlet('upper', 'bakingPad'),
  smallStack, frame(0), wait(cfg.ovenUpperTime + 1),
  outlet('upper'), frame(0), vessel('bakingPad'),
  ...finish, frame(0), pass,
];
// ドリア皿の品：空のドリア皿を作業枠に置く → 具 → 流す → 下駄を取って出口の皿に乗せる → 提供
const doriaDish = (loads: Act[], deck: 'upper' | 'lower'): Act[] => [
  vessel('doria'), frame(0), ...loads, frame(0), inlet(deck, 'doria'),
  wait((deck === 'upper' ? cfg.ovenUpperTime : cfg.ovenLowerTime) + 1),
  getaStack, outlet(deck), pass,
];
const shake = (id: BottleId): Act[] => [bottle(id), { right: frame(0) }, { free: bottleBack(id) }];

// 上手な人の手順（チュートリアルの矢印も、この順に指す）
const SCRIPTS: Record<string, Act[]> = {
  popcornShrimp: padDish([...times(bag('popcornShrimp'), 9), frame(0)]),
  potatoGrill: doriaDish([...times(bin('potato'), 8), frame(0)], 'upper'),
  chorizo: doriaDish([...times(bag('chorizo'), 5), frame(0), ...times(bin('potato'), 2), frame(0)], 'upper'),
  spicyChicken: doriaDish([bin('oilSheet'), frame(0), ...times(bag('spicyChicken'), 4), frame(0)], 'lower'),
  focaccia: padDish([bin('focaccia'), frame(0)]),
  cinnamonFocaccia: padDish([bin('focaccia'), frame(0)], shake('cinnamon')),
  garlicFocaccia: padDish([bin('focaccia'), frame(0)], shake('garlicSauce')),
  tarakoFocaccia: padDish([bin('focaccia'), { right: frame(0) }, bin('tarakoSauce'), frame(0), ...shake('granMoravia')]),
  cheeseFocaccia: padDish([bin('focaccia'), { right: frame(0) }, { right: cheeseSource }, frame(0), ...shake('granMoravia')]),
};

// 台本どおりに操作する（矢印は確かめない）
function playActs(g: Game, acts: Act[]): void {
  for (const act of acts) {
    if ('wait' in act) g.update(act.wait);
    else if ('right' in act) g.rightClick(act.right);
    else if ('free' in act) g.interact(act.free);
    else g.interact(act);
  }
}
// 台本の途中まで（provide の手前 = 最後の提供台を除く）
const untilServe = (id: string): Act[] => SCRIPTS[id].slice(0, -1);

// ===================== 表とメニュー =====================

describe('C6 の9品の登録（表の行とメニュー）', () => {
  it('表とメニューの末尾に、9品がこの並びで載る。既存の8品の並びは変わらない。クックの伝票は17品', () => {
    // C7 の6品登録による（2026-11-15 承認）：C7 の6品が後ろに足されたため、「末尾の9行」ではなく C6 の9品の位置で比べる
    // （表の9〜17番目。メニューはコーンピザのすぐ後の9行 = クックの品の9〜17番目）。表・焼き物の品の全体は C7 の6品を足した23品
    expect(BAKE_TABLE.map((d) => d.id)).toEqual(ALL_COOK);
    expect(BAKE_TABLE.slice(C3_AND_BEFORE.length, C3_AND_BEFORE.length + C6_IDS.length).map((d) => d.id)).toEqual(C6_IDS);
    const after = MENU.findIndex((m) => m.id === 'cornPizza') + 1;
    expect(after).toBeGreaterThan(0);
    expect(MENU.slice(after, after + C6_IDS.length).map((m) => m.id)).toEqual(C6_IDS);
    expect(menusFor('cook').slice(C3_AND_BEFORE.length, C3_AND_BEFORE.length + C6_IDS.length).map((m) => m.id)).toEqual(C6_IDS);
    expect(MENU[0].id).toBe('tarako');
    expect(bakedMenus().map((m) => m.id)).toEqual(ALL_COOK);
    expect(menusFor('cook')).toHaveLength(23); // C7 の6品登録による（2026-11-15 承認）。17 → 23
    expect(menusFor('heat')).toHaveLength(15);
    expect(tableProblems()).toEqual([]);
  });

  it('メニュー：前菜4品 = 30点（分類：前菜）、フォッカチオ5品 = 20点（分類：焼きたてパン）。どれもクックの焼き物', () => {
    for (const id of STARTERS) expect(getMenu(id)).toMatchObject({ station: 'cook', form: 'bake', category: 'cookStarter', basePoints: 30, enabled: true, ingredients: [] });
    for (const id of BREADS) expect(getMenu(id)).toMatchObject({ station: 'cook', form: 'bake', category: 'bread', basePoints: 20, enabled: true, ingredients: [] });
    for (const id of C6_IDS) expect(getMenu(id).ticketItems!.length).toBeGreaterThan(0);
    expect(dishName('chorizo')).toBe('チョリソー');
  });

  it('4.0 の表のとおり：器・焼く前・焼き・仕上げ（焼き方の要約）', () => {
    const summary = Object.fromEntries(C6_IDS.map((id) => [id, bakeSummary(getBakeDish(id)!)]));
    expect(summary).toEqual({
      popcornShrimp: '上段1周 → 小皿',
      potatoGrill: '上段1周 → 下駄', // 確認事項1の仮の値：上段1周
      chorizo: '上段1周 → 下駄',
      spicyChicken: '下段1周 → 下駄',
      focaccia: '上段1周 → 小皿',
      cinnamonFocaccia: '上段1周 → 小皿 → シナモンパウダー',
      garlicFocaccia: '上段1周 → 小皿 → ガーリックソース',
      tarakoFocaccia: '上段1周 → 小皿',
      cheeseFocaccia: '上段1周 → 小皿',
    });
    const vessels = Object.fromEntries(C6_IDS.map((id) => [id, getBakeDish(id)!.vessel]));
    expect(vessels).toEqual({
      popcornShrimp: 'bakingPad', potatoGrill: 'doria', chorizo: 'doria', spicyChicken: 'doria',
      focaccia: 'bakingPad', cinnamonFocaccia: 'bakingPad', garlicFocaccia: 'bakingPad', tarakoFocaccia: 'bakingPad', cheeseFocaccia: 'bakingPad',
    });
    const loads = (id: string) => getBakeDish(id)!.stages[0].load.map((l) => [l.id, l.count, l.on ?? null]);
    expect(loads('popcornShrimp')).toEqual([['shrimp', 9, null]]);
    expect(loads('potatoGrill')).toEqual([['potato', 8, null]]);
    expect(loads('chorizo')).toEqual([['sausage', 5, null], ['potato', 2, null]]);
    expect(loads('spicyChicken')).toEqual([['oilSheet', 1, null], ['spicyChicken', 4, 'oilSheet']]);
    expect(loads('focaccia')).toEqual([['focaccia', 1, null]]);
    expect(loads('tarakoFocaccia')).toEqual([['focacciaFlipped', 1, null], ['tarakoSauce', 1, 'focacciaFlipped'], ['granMoravia', 1, 'tarakoSauce']]);
    expect(loads('cheeseFocaccia')).toEqual([['focacciaFlipped', 1, null], ['halfCheese', 1, 'focacciaFlipped'], ['granMoravia', 1, 'halfCheese']]);
  });

  it('game.ts に、品の id・品名が出てこない（品の決まりは表から引く）', () => {
    for (const id of C6_IDS) {
      expect(gameSource).not.toContain(`'${id}'`);
      expect(gameSource).not.toContain(dishName(id));
    }
  });
});

// ===================== 受け入れ条件 =====================

describe('受け入れ条件（設計書 4.6）', () => {
  it('9品すべてが、クックの伝票に出る（クックの17品すべて）', () => {
    let seed = 11;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const g = new Game(cfg, rng);
    g.start('leading', 'cook');
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      g.state.nextTicketAt = 0;
      g.state.tickets = [];
      g.update(0.001);
      for (const t of g.state.tickets) seen.add(t.menuId);
    }
    // C7 の6品登録による（2026-11-15 承認）：クックの伝票は23品
    expect([...seen].sort()).toEqual([...ALL_COOK].sort());
  });

  for (const id of C6_IDS) {
    it(`${dishName(id)}：表の手順で作って提供すると、採点される`, () => {
      const g = cookGame([ticket(1, id)]);
      playActs(g, untilServe(id));
      expect(servableDish(g.state.hand)?.id, describeItem(g.state.hand)).toBe(id);
      expect(g.getaHint(pass)).toBe(`左クリック：${getMenu(id).name}を提供台に出す`);
      const expected = serveScore(getMenu(id), g.state.time, 0, cfg).total;
      g.interact(pass);
      expect(g.state.score).toBe(expected);
      expect(g.state.served).toBe(1);
      expect(g.state.mistakes).toBe(0);
      expect(g.state.tickets).toHaveLength(0);
    });
  }

  it('たらこのフォッカチオ：ふつうの向きで入れると、たらこソースをのせられない（理由が出る）', () => {
    const g = cookGame();
    playActs(g, [vessel('bakingPad'), frame(0), bin('focaccia'), frame(0), bin('tarakoSauce')]);
    expect(frameDish(g).loaded).toEqual({ focaccia: 1 });
    expect(g.planInteract(frame(0))).toBeNull();
    expect(g.getaHint(frame(0))).toContain('たらこソースは、逆さまのフォッカチオの上にのせる');
    expect(g.getaHint(frame(0))).toContain('右クリック');
    // 逆さまに入れたパッドには、のせられる
    const h = cookGame();
    playActs(h, [vessel('bakingPad'), frame(0), bin('focaccia'), { right: frame(0) }, bin('tarakoSauce')]);
    expect(frameDish(h).loaded).toEqual({ focacciaFlipped: 1 });
    expect(h.planInteract(frame(0))).not.toBeNull();
    h.interact(frame(0));
    expect(frameDish(h).loaded).toEqual({ focacciaFlipped: 1, tarakoSauce: 1 });
  });

  it('辛味チキン：脂取りシートを敷かずには入れられない（理由が出る）。敷いたら4つ入る', () => {
    const g = cookGame();
    playActs(g, [vessel('doria'), frame(0), ...times(bag('spicyChicken'), 4)]);
    expect(g.planInteract(frame(0))).toBeNull();
    expect(g.getaHint(frame(0))).toContain('辛味チキンは、脂取りシートの上にのせる');
    g.state.hand = null;
    playActs(g, [bin('oilSheet'), frame(0), ...times(bag('spicyChicken'), 5), frame(0)]);
    expect(frameDish(g).loaded).toEqual({ oilSheet: 1, spicyChicken: 4 });
    expect(g.state.hand).toEqual({ kind: 'loadStack', id: 'spicyChicken', count: 1 }); // 入りきらない分は手に残る
    // シートは1枚だけ
    expect(whyNotLoad(viewOf(frameDish(g)), 'oilSheet')).toContain('もう入らない');
  });
});

// ===================== 逆さまのフォッカチオ（右クリック）=====================

describe('逆さまのフォッカチオ：作業枠のパッドに視点が合っているときだけ、右クリックで逆さまに入る', () => {
  it('表：フォッカチオを右クリックで入れると、逆さまのフォッカチオになる', () => {
    expect(FLIP_LOADS.focaccia?.load).toBe('focacciaFlipped');
    expect(COOK_BINS.focaccia.gives).toBe('focaccia');
  });

  it('作業枠のパッドに右クリックで逆さまに入り、左クリックではふつうの向き。ヒントに右クリックが必ず出る', () => {
    const g = cookGame();
    playActs(g, [vessel('bakingPad'), frame(0), bin('focaccia')]);
    const hint = g.getaHint(frame(0))!;
    expect(hint).toContain('左クリック：フォッカチオを1つ入れる（ふつうの向き）');
    expect(hint).toContain('右クリック：フォッカチオを逆さまに入れる');
    expect(g.planRightClick(frame(0))).not.toBeNull();
    g.rightClick(frame(0));
    expect(g.state.hand).toBeNull();
    expect(frameDish(g).loaded).toEqual({ focacciaFlipped: 1 });
    // 2つ目は入らない（逆さまでも、ふつうでも）。右クリックしても捨てない
    g.interact(bin('focaccia'));
    expect(g.planInteract(frame(0))).toBeNull();
    expect(g.planRightClick(frame(0))).toBeNull();
    g.rightClick(frame(0));
    expect(g.state.hand).toEqual({ kind: 'loadStack', id: 'focaccia', count: 1 });
    expect(g.state.toast?.text).toContain('逆さまに入れられない');
  });

  it('作業枠のパッド以外に視点が合っているときの右クリックは、今までどおり捨てる', () => {
    const g = cookGame();
    g.interact(bin('focaccia'));
    expect(g.planRightClick(pass)).toBeNull();
    g.rightClick(pass);
    expect(g.state.hand).toBeNull();
    expect(g.state.toast?.text).toBe('捨てた');
    // 空いた作業枠（器がない）でも捨てる
    g.interact(bin('focaccia'));
    g.rightClick(frame(2));
    expect(g.state.hand).toBeNull();
    // 視点の先がない
    g.interact(bin('focaccia'));
    g.rightClick(null);
    expect(g.state.hand).toBeNull();
  });

  it('逆さまのときだけ、たらこソース・ピザチーズ・グランモラビアをのせられる（ふつうの向きには、どれものらない）', () => {
    const normal = viewOf(bakeItem('bakingPad', 0, cfg, undefined, { blank: true, loaded: { focaccia: 1 } }));
    const flipped = viewOf(bakeItem('bakingPad', 0, cfg, undefined, { blank: true, loaded: { focacciaFlipped: 1 } }));
    for (const id of ['tarakoSauce', 'halfCheese'] as const) {
      expect(loadRoom(normal, id)).toBe(0);
      expect(loadRoom(flipped, id)).toBe(1);
    }
    expect(loadRoom(normal, 'granMoravia')).toBe(0);
    expect(loadRoom(flipped, 'granMoravia')).toBe(0); // グランモラビアは、ソース・チーズのあと
    expect(whyNotLoad(flipped, 'granMoravia')).toContain('の上にのせる');
    expect(loadRoom(viewOf(bakeItem('bakingPad', 0, cfg, undefined, { blank: true, loaded: { focacciaFlipped: 1, halfCheese: 1 } })), 'granMoravia')).toBe(1);
    // たらこソースとピザチーズは、同じ品にはのらない（どちらか1つ）
    expect(loadRoom(viewOf(bakeItem('bakingPad', 0, cfg, undefined, { blank: true, loaded: { focacciaFlipped: 1, tarakoSauce: 1 } })), 'halfCheese')).toBe(0);
  });

  it('見た目の文字列（progressSignature）で、ふつうの向きと逆さまを区別する。器に並べる位置は表から引く', () => {
    expect(progressSignature({ loaded: { focaccia: 1 } })).not.toBe(progressSignature({ loaded: { focacciaFlipped: 1 } }));
    expect(loadLayout({ style: 'doria', blank: true, loaded: { sausage: 5, potato: 2 } })).toEqual({ sausage: 'left', potato: 'right' });
    expect(loadLayout({ style: 'doria', blank: true, loaded: { potato: 8 } })).toEqual({ potato: 'all' });
  });
});

// ===================== ピザチーズ1/2杯 =====================

describe('ピザチーズ1/2杯：ピザチーズの容器を右クリックすると、レードル半分を取る（仮の操作）', () => {
  it('表：右クリックで取る量は SOURCE_RIGHT_TAKE（ピザチーズ → 1/2杯）', () => {
    expect(SOURCE_RIGHT_TAKE.cheese).toBe('halfCheese');
  });

  it('右クリックで1/2杯、左クリックで1杯。どちらも容器に戻せる。手がふさがっていれば取れない', () => {
    const g = cookGame();
    expect(g.pizzaHint(cheeseSource)).toContain('右クリック：ピザチーズ（1/2杯）を取る');
    g.rightClick(cheeseSource);
    expect(g.state.hand).toEqual({ kind: 'loadStack', id: 'halfCheese', count: 1 });
    expect(g.pizzaHint(cheeseSource)).toContain('戻す');
    g.interact(cheeseSource);
    expect(g.state.hand).toBeNull();
    g.interact(cheeseSource);
    expect(g.state.hand).toEqual({ kind: 'pizzaTopping', id: 'cheese' });
    expect(g.planRightClick(cheeseSource)).toBeNull();
    // ほかの容器（ピザソース）の右クリックは、今までどおり（手が空なら何も起きない）
    g.state.hand = null;
    expect(g.planRightClick({ kind: 'pizzaSource', id: 'sauce' })).toBeNull();
  });

  it('1/2杯は逆さまのフォッカチオにのる。1杯（左クリック）はのらず、右クリックで取るよう案内する。ピザの鉄板には1/2杯はのらない', () => {
    const g = cookGame();
    playActs(g, [vessel('bakingPad'), frame(0), bin('focaccia'), { right: frame(0) }, cheeseSource]);
    expect(g.planInteract(frame(0))).toBeNull();
    expect(g.getaHint(frame(0))).toContain('容器を右クリックで取る');
    playActs(g, [cheeseSource, { right: cheeseSource }, frame(0)]);
    expect(frameDish(g).loaded).toEqual({ focacciaFlipped: 1, halfCheese: 1 });
    expect(pourInto(bakeItem('pizza', 0, cfg), { kind: 'loadStack', id: 'halfCheese', count: 1 })).toBeNull();
  });
});

// ===================== ボトル =====================

describe('クック用のボトル（グランモラビア・シナモンパウダー・ガーリックソース）', () => {
  it('BottleId に3種類。作業台と壁の棚にだけ置ける（最初から壁の棚の上）。ヒートのボトルは、今までどおり作業台に置けない', () => {
    expect(BOTTLE_IDS.slice(-3)).toEqual(['granMoravia', 'cinnamon', 'garlicSauce']);
    expect(COOK_BOTTLE_IDS).toEqual(['granMoravia', 'cinnamon', 'garlicSauce']);
    for (const id of BOTTLE_IDS) {
      expect(BOTTLE_SURFACES[id].includes('prep')).toBe(COOK_BOTTLE_IDS.includes(id));
    }
    expect(BOTTLE_BAKE_LOAD.granMoravia).toBe('granMoravia');
    expect(BOTTLE_BAKE_FINISH.cinnamon).toBe('cinnamon');
    expect(BOTTLE_BAKE_FINISH.garlicSauce).toBe('garlicSauce');
    const g = cookGame();
    for (const id of COOK_BOTTLE_IDS) {
      expect(g.state.bottles[id]).toEqual(BOTTLE_HOME[id]);
      expect(BOTTLE_HOME[id].surface).toBe('shelf');
      expect(BOTTLE_SURFACES[id]).toEqual(['prep', 'shelf']);
    }
  });

  it('左クリックで持ち、作業台に置き直せる。左の台・サラダ台には置けない。作業台の置き物の上にも置けない', () => {
    const g = cookGame();
    g.interact(bottle('cinnamon'));
    expect(g.state.hand).toEqual({ kind: 'bottle', id: 'cinnamon' });
    expect(g.state.bottles.cinnamon).toBeNull();
    expect(g.previewBottle({ kind: 'tableTop', surface: 'left', x: 0, z: 2 })).toMatchObject({ valid: false, reason: 'surface' });
    expect(g.previewBottle({ kind: 'tableTop', surface: 'salad', x: 0, z: 0 })).toMatchObject({ valid: false, reason: 'surface' });
    const at = COOK_BIN_SPOTS.focaccia;
    expect(g.previewBottle({ kind: 'tableTop', surface: 'prep', x: at.xr, z: OVEN_COUNTER_ZS[at.counter] - OVEN_COUNTER_ROW.z + at.zr })).toMatchObject({ valid: false, reason: 'gap' });
    g.interact(bottleBack('cinnamon'));
    expect(g.state.hand).toBeNull();
    expect(g.state.bottles.cinnamon).toEqual({ ...BOTTLE_HOME.cinnamon });
    // ヒートのボトル（パセリ）は、作業台に置けない
    g.state.hand = { kind: 'bottle', id: 'parsley' };
    g.state.bottles.parsley = null;
    expect(g.previewBottle(bottleBack('cinnamon'))).toMatchObject({ valid: false, reason: 'surface' });
  });

  it('壁の棚の上にも置き直せる（ピザ生地・鉄板・容器の上には置けない）。ガーリックの容器やヒートのボトルは置けない', () => {
    const g = cookGame();
    g.interact(bottle('cinnamon'));
    const home = BOTTLE_HOME.granMoravia;
    expect(g.previewBottle({ kind: 'tableTop', surface: 'shelf', x: 0, z: BOTTLE_HOME.cinnamon.z })?.valid).toBe(true); // 持ち上げたボトルのもとの場所（あき）
    expect(g.previewBottle({ kind: 'tableTop', surface: 'shelf', x: 0, z: home.z })).toMatchObject({ valid: false, reason: 'gap' }); // ほかのボトルの上
    const [dough] = [SHELF_FIXTURES[0]];
    expect(g.previewBottle({ kind: 'tableTop', surface: 'shelf', x: dough.x, z: dough.z })).toMatchObject({ valid: false, reason: 'gap' });
    g.state.hand = { kind: 'tray', id: 'garlic' };
    expect(g.previewFreeTray({ kind: 'tableTop', surface: 'shelf', x: 0, z: BOTTLE_HOME.cinnamon.z })).toMatchObject({ valid: false, reason: 'surface' });
  });

  it('クック用のボトルは、ヒートの皿にはかけない', () => {
    const g = cookGame();
    g.state.plateSlots[0] = ['noodle'];
    g.state.hand = { kind: 'bottle', id: 'garlicSauce' };
    expect(g.canUseBottleAt({ kind: 'plateSlot', index: 0 })).toBe(false);
    g.rightClick({ kind: 'plateSlot', index: 0 });
    expect(g.state.plateSlots[0]).toEqual(['noodle']);
    expect(g.state.toast?.text).toContain('作業枠の焼き物');
  });

  it('グランモラビアは、焼く前の器に振る（たらこソースの上）。振りすぎは、のらない', () => {
    const g = cookGame();
    playActs(g, [vessel('bakingPad'), frame(0), bin('focaccia'), { right: frame(0) }, bottle('granMoravia')]);
    expect(g.canUseBottleAt(frame(0))).toBe(false); // まだソースがない
    expect(g.getaHint(frame(0))).toContain('たらこソース');
    g.interact(bottleBack('granMoravia'));
    playActs(g, [bin('tarakoSauce'), frame(0), bottle('granMoravia')]);
    expect(g.canUseBottleAt(frame(0))).toBe(true);
    g.rightClick(frame(0));
    g.rightClick(frame(0));
    expect(frameDish(g).loaded).toEqual({ focacciaFlipped: 1, tarakoSauce: 1, granMoravia: 1 });
  });

  it('シナモン：小皿に移した焼き上がりにだけ振れる。振りすぎ・いらない品に振ると注文ミス。振らないと出せない', () => {
    // 振らない
    const g = cookGame([ticket(1, 'cinnamonFocaccia')]);
    playActs(g, padDish([bin('focaccia'), frame(0)]).slice(0, -2));
    expect(g.state.workFrames[0]).toMatchObject({ kind: 'bakePlate', from: 'bakingPad', state: 'baked' });
    g.interact(frame(0));
    expect(servableDish(g.state.hand)?.id).toBe('focaccia');
    g.interact(pass);
    expect(g.state.mistakes).toBe(1); // フォッカチオの伝票ではない
    // 2回振る
    const h = cookGame([ticket(1, 'cinnamonFocaccia')]);
    playActs(h, padDish([bin('focaccia'), frame(0)], [bottle('cinnamon'), { right: frame(0) }, { right: frame(0) }, { free: bottleBack('cinnamon') }]).slice(0, -1));
    expect(servableDish(h.state.hand)).toBeNull();
    expect(overFinishedDish(h.state.hand)?.id).toBe('cinnamonFocaccia');
    h.interact(pass);
    expect(h.state.mistakes).toBe(1);
    expect(h.state.tickets).toHaveLength(1);
    // 焼く前のパッドには振れない
    const k = cookGame();
    playActs(k, [vessel('bakingPad'), frame(0), bin('focaccia'), frame(0), bottle('cinnamon')]);
    expect(k.canUseBottleAt(frame(0))).toBe(false);
  });
});

// ===================== 小皿・器の決まり =====================

describe('小皿に移す（受け台 smallPlate）と、器に入れる決まり', () => {
  it('焼き上がったパッドを、作業枠の小皿に移せる（小皿が枠でも、パッドが枠でもよい）。空いたパッドは棚に戻せる', () => {
    const baked = bakeItem('bakingPad', cfg.ovenUpperTime, cfg, undefined, { blank: true, loaded: { shrimp: 9 } });
    const g = cookGame();
    g.state.workFrames[1] = { kind: 'plate', contents: [], style: 'small' };
    g.state.hand = baked;
    expect(g.getaHint(frame(1))).toBe('左クリック：ポップコーンシュリンプを小皿に移す');
    g.interact(frame(1));
    expect(g.state.workFrames[1]).toMatchObject({ kind: 'bakePlate', from: 'bakingPad', state: 'baked', loaded: { shrimp: 9 } });
    expect(g.state.hand).toEqual({ kind: 'bakeDish', style: 'bakingPad', cooked: 0, state: 'raw', blank: true });
    g.interact(vessel('bakingPad'));
    expect(g.state.hand).toBeNull();
    expect(describeItem(g.state.workFrames[1])).toBe('小皿（ポップコーンシュリンプ・焼き上がり）');

    const h = cookGame();
    h.state.workFrames[0] = baked;
    h.state.hand = { kind: 'plate', contents: [], style: 'small' };
    h.interact(frame(0));
    expect(h.state.workFrames[0]).toMatchObject({ kind: 'bakePlate', loaded: { shrimp: 9 } });
    expect(h.state.hand).toMatchObject({ kind: 'bakeDish', style: 'bakingPad', blank: true });
  });

  it('小皿に移す前は出せない（小皿の案内）。生焼けは小皿に移せない', () => {
    const g = cookGame();
    g.state.hand = bakeItem('bakingPad', cfg.ovenUpperTime, cfg, undefined, { blank: true, loaded: { shrimp: 9 } });
    expect(serveHint(g.state.hand)).toContain('小皿に移してから出す');
    g.state.workFrames[0] = { kind: 'plate', contents: [], style: 'small' };
    g.state.hand = bakeItem('bakingPad', cfg.ovenUpperTime / 2, cfg, undefined, { blank: true, loaded: { shrimp: 9 } });
    expect(g.planInteract(frame(0))).toBeNull();
  });

  it('別の品の物は混ぜられない（シュリンプを入れたパッドに、フォッカチオは入らない）', () => {
    const g = cookGame();
    playActs(g, [vessel('bakingPad'), frame(0), ...times(bag('popcornShrimp'), 3), frame(0), bin('focaccia')]);
    expect(g.planInteract(frame(0))).toBeNull();
    expect(g.getaHint(frame(0))).toContain('別の料理の物が入っている');
  });

  it('中身の入った山の皿（ミラノドリア）には、ポテトを入れられない。空のドリア皿には入る', () => {
    const potato: Item = { kind: 'loadStack', id: 'potato', count: 8 };
    expect(pourInto(bakeItem('doria', 0, cfg), potato)).toBeNull();
    expect(pourInto(bakeItem('doria', 0, cfg, undefined, { blank: true }), potato)?.moved).toBe(8);
  });

  it('ポテトのグリルは8個まで、チョリソーはソーセージ5本・ポテト2個。足りないと流せない', () => {
    const g = cookGame();
    playActs(g, [vessel('doria'), frame(0), ...times(bin('potato'), 9), frame(0)]);
    expect(frameDish(g).loaded).toEqual({ potato: 8 });
    expect(g.state.hand).toEqual({ kind: 'loadStack', id: 'potato', count: 1 });
    g.state.hand = null;
    playActs(g, [vessel('doria'), frame(1), ...times(bag('chorizo'), 5), frame(1), ...times(bin('potato'), 1), frame(1), frame(1)]);
    expect(g.ovenHint(inlet('upper', 'doria'))).toContain('ポテトをのせてから流す');
    expect(g.planInteract(inlet('upper', 'doria'))).toBeNull();
  });

  it('クック用のたらこソースの容器は、1台目の天板の上（作業台の置き物に登録）', () => {
    const at = COOK_BIN_SPOTS.tarakoSauce;
    expect(at.counter).toBe(0);
    const z = OVEN_COUNTER_ZS[at.counter] - OVEN_COUNTER_ROW.z + at.zr;
    expect(PREP_FIXTURES.some((p) => Math.abs(p.x - at.xr) < 1e-9 && Math.abs(p.z - z) < 1e-9)).toBe(true);
    expect(Math.abs(at.zr) + COOK_BIN.d / 2).toBeLessThanOrEqual(OVEN_COUNTER.depth / 2);
    expect(COOK_BINS.tarakoSauce.gives).toBe('tarakoSauce');
    // ボトルの最初の置き場所は、壁の棚の上で、棚の置き物と重ならず、棚の中
    for (const id of COOK_BOTTLE_IDS) {
      const b = BOTTLE_HOME[id];
      expect(b.surface).toBe('shelf');
      expect(overlapsShelfFixture(b.x, b.z, 0.06), id).toBe(false);
      expect(Math.abs(b.x)).toBeLessThan(SURFACES.shelf.width / 2);
      expect(Math.abs(b.z)).toBeLessThan(SURFACES.shelf.depth / 2);
    }
    // 卵の容器も、壁の棚の上（ボトルと重ならない）
    expect(COOK_BIN_SPOTS.egg.y).toBe(FROZEN_SHELF.y);
  });
});

// ===================== チュートリアル（表から作る）=====================

describe('チュートリアル：9品とも、表から工程を作り、最後まで作れる', () => {
  it('提供できる品すべてに工程がある', () => {
    // C7 の6品（鉄板焼き）は、C10 の自動生成が入るまで対象外（TUTORIAL_PENDING_C10。2026-11-15 承認）。それ以外の品は今までどおり全件
    for (const m of MENU.filter((x) => x.enabled && !TUTORIAL_PENDING_C10.includes(x.id))) {
      expect(hasTutorial(m.id), m.id).toBe(true);
      expect(tutorialSteps(m.id, cfg)!.length, m.id).toBeGreaterThan(0);
    }
  });

  it('工程は表から作る（仕上げのボトル・逆さまに入れる・小皿が、表どおりに並ぶ）', () => {
    const labels = (id: string) => tutorialSteps(id, cfg)!.map((s) => s.label);
    expect(labels('cinnamonFocaccia').some((l) => l.includes('シナモンパウダーを振る'))).toBe(true);
    expect(labels('focaccia').some((l) => l.includes('シナモン'))).toBe(false);
    expect(labels('tarakoFocaccia').some((l) => l.includes('右クリックで逆さまに入れる'))).toBe(true);
    expect(labels('popcornShrimp').some((l) => l.includes('小皿'))).toBe(true);
    expect(labels('spicyChicken').some((l) => l.includes('下段'))).toBe(true);
    expect(labels('potatoGrill').some((l) => l.includes('下駄'))).toBe(true);
  });

  it('先頭に、使うケース・パックを冷蔵庫から出す「準備：」の工程が付く（使わない品には付かない）', () => {
    const labels = (id: string) => tutorialSteps(id, cfg)!.map((s) => s.label);
    const prep = labels('cheeseFocaccia').filter((l) => l.startsWith('準備：'));
    expect(prep.some((l) => l.includes('フォッカチオ'))).toBe(true);
    expect(prep.some((l) => l.includes('ピザチーズ'))).toBe(true);
    expect(labels('cheeseFocaccia').slice(0, prep.length).every((l) => l.startsWith('準備：'))).toBe(true); // 準備は、先頭にまとまっている
    expect(labels('spicyChicken').some((l) => l.startsWith('準備：') && l.includes('辛味チキン') && l.includes('袋'))).toBe(true); // パックは、袋を取って作業台に置く
    expect(labels('tarako').some((l) => l.startsWith('準備：'))).toBe(false);
    // 本番の最初の状態では、まず冷蔵庫の扉を指す
    const g = new Game({ ...cfg, fridgeCookSetup: true }, () => 0);
    g.startPractice();
    g.startTutorial('spicyChicken');
    expect(g.tutorialGuide()!.at).toMatchObject({ kind: 'fridgeDoor' });
  });

  for (const id of C6_IDS) {
    it(`${dishName(id)}：矢印のとおりに作ると、提供できて、チュートリアルが完了する`, () => {
      const g = new Game({ ...cfg, fridgeCookSetup: true }, () => 0);
      g.startPractice();
      expect(g.startTutorial(id)).toBe(true);
      followPrep(g); // 先頭の「準備：」（冷蔵庫からケース・パックを出す）
      let lastStep = 0;
      const expectArrowAt = (target: Target) => {
        const guide = g.tutorialGuide();
        const step = (g.state.tutorial?.step ?? -1) + 1;
        expect(guide, `${id} 工程${step}: 矢印が出ていない`).not.toBeNull();
        expect(matchesTarget(target, guide!.at as GuideAt), `${id} 工程${step}: 矢印が ${JSON.stringify(guide!.at)}（操作は ${JSON.stringify(target)}）`).toBe(true);
      };
      for (const act of SCRIPTS[id]) {
        if ('wait' in act) g.update(act.wait);
        else if ('right' in act) {
          expectArrowAt(act.right);
          g.rightClick(act.right);
        } else if ('free' in act) g.interact(act.free);
        else {
          expectArrowAt(act);
          g.interact(act);
        }
        g.update(0.01);
        const step = g.state.tutorial?.step ?? Infinity;
        expect(step).toBeGreaterThanOrEqual(lastStep);
        lastStep = step;
      }
      expect(g.state.served).toBe(1);
      expect(g.state.mistakes).toBe(0);
      expect(g.state.toast?.text).toBe(`${getMenu(id).name}のチュートリアル完了！`);
      expect(g.state.tutorial).toBeNull();
    });
  }
});
