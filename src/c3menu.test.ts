import { describe, expect, it } from 'vitest';
import {
  BAKE_TABLE,
  bakeLabel,
  bakedMenus,
  canFinishWith,
  defaultStock,
  dishName,
  getBakeDish,
  overFinishedDish,
  pizzaLoad,
  pizzaTitle,
  progressSignature,
  servableDish,
  serveHint,
  stockProgress,
  tableProblems,
  type BakeDish,
} from './bake';
import { BOTTLE_BAKE_FINISH } from './bottle';
import { DEFAULT_CONFIG as cfg } from './config';
import { Game } from './game';
import { OVEN_COUNTER, OVEN_COUNTER_ROW, OVEN_COUNTER_ZS, PIZZA_COUNTER, PIZZA_PLATE_GUIDE, PREP_FIXTURES, PIZZA_TOP_TUBS, SHELF_STACKS, SURFACES, WORK_FRAMES } from './layout';
import { bakeItem, frontS } from './oven';
import { PIZZA_TOP_IDS, addTopping, canAddTopping, fourthOf, pizzaSignature, sauceCheesePizza, whyNotTopping } from './pizza';
import { menusFor } from './position';
import { MENU, formOf, getMenu } from './recipe';
import { serveScore } from './score';
import { createTicket } from './tickets';
import { hasTutorial, matchesTarget, tutorialSteps, type GuideAt } from './tutorial';
import type { Item, PizzaTop, Target, Ticket } from './types';

// クック編設計書 4.3（C3）：ドリア4品・ピザ4品。
//
// 6品の表の行とメニューは、はじめ既存のテストの期待値（表・クックの品は既存の2品だけ）に合わせて留め置きにしていたが、
// 2026-11-14 に所有者の承認を得て、BAKE_TABLE（bake.ts）・MENU（recipe.ts）の末尾に、その並びのまま登録した（README の記録）。
// このファイルは、登録済みの本物の表・メニューに対して、6品の表の行・メニューの決まりと、8品が遊べること（受け入れ条件）を確かめる。

const NEW_DORIAS = ['cheeseMilanoDoria', 'tarakoDoria', 'tarakoGratin'] as const;
const NEW_PIZZAS: [string, PizzaTop][] = [
  ['vegMushroomPizza', 'vegMushroom'],
  ['sausagePizza', 'sausage'],
  ['cornPizza', 'corn'],
];
const C3_IDS = [...NEW_DORIAS, ...NEW_PIZZAS.map(([id]) => id)];
const ALL_COOK = ['milanoDoria', 'buffaloPizza', ...C3_IDS];

// --- 設備 ---
const pass: Target = { kind: 'servePass' };
const getaStack: Target = { kind: 'getaStack' };
const lowerInlet: Target = { kind: 'ovenInlet', deck: 'lower', x: 0, s: frontS('doria') };
const lowerOutlet: Target = { kind: 'ovenOutlet', deck: 'lower', lane: 1 };
const pizzaInlet: Target = { kind: 'ovenInlet', deck: 'upper', x: 0, s: frontS('pizza') };
const pizzaOutlet: Target = { kind: 'ovenOutlet', deck: 'upper', lane: 0 };
const pizzaSlot: Target = { kind: 'pizzaSlot', index: 0 };
const stack = (dish: string): Target => ({ kind: 'ovenStock', style: 'doria', dish });
const frame = (index: number): Target => ({ kind: 'workFrame', index });
const parsley: Target = { kind: 'bottle', id: 'parsley' };
const parsleyBack: Target = { kind: 'tableTop', surface: 'left', x: -0.4, z: 0.95 };

const ticket = (id: number, menuId: string, arrivedAt = 0): Ticket => createTicket(id, getMenu(menuId), arrivedAt);

function cookGame(tickets: Ticket[] = []): Game {
  const g = new Game(cfg, () => 0);
  g.start('leading', 'cook');
  g.state.nextTicketAt = Infinity;
  g.state.tickets = tickets;
  return g;
}
const run = (g: Game, seconds: number) => {
  for (let t = 0; t < seconds; t++) g.update(1);
};

// その品の山から取ったドリアを下段で焼いて、下駄に乗せて手に持つ
function makeDoria(g: Game, dish: string): void {
  g.interact(stack(dish));
  g.interact(lowerInlet);
  run(g, cfg.ovenLowerTime + 1);
  g.interact(getaStack);
  g.interact(lowerOutlet);
}

// ピザを焼いて、お皿に入れて、お皿ごと手に持つ（fourth = 4番目の具。モッツァレラは2個）
function makePizza(g: Game, fourth: PizzaTop | 'mozzarella'): void {
  g.interact({ kind: 'pizzaPlateStack' });
  g.interact({ kind: 'tableTop', ...PIZZA_PLATE_GUIDE });
  const plate: Target = { kind: 'pizzaPlate', id: g.state.pizzaPlates[g.state.pizzaPlates.length - 1].id };
  g.interact({ kind: 'pizzaDoughStack' });
  g.interact({ kind: 'pizzaPanStack' });
  g.interact(pizzaSlot);
  for (const id of ['sauce', 'cheese'] as const) {
    g.interact({ kind: 'pizzaSource', id });
    g.interact(pizzaSlot);
  }
  for (let i = 0; i < (fourth === 'mozzarella' ? 2 : 1); i++) {
    g.interact({ kind: 'pizzaSource', id: fourth });
    g.interact(pizzaSlot);
  }
  g.interact(pizzaSlot);
  g.interact(pizzaInlet);
  run(g, cfg.ovenUpperTime + 1);
  g.interact(pizzaOutlet);
  g.interact(plate);
  g.interact({ kind: 'pizzaPanStack' });
  g.interact(plate);
}

// ===================== 6品の表の行とメニュー（登録済み）=====================

describe('C3 の6品の用意（表の行とメニュー）', () => {
  it('表の行とメニューが1対1（どちらも末尾の6行）。ドリア = 30点、ピザ = 50点。どれもクックの焼き物', () => {
    expect(BAKE_TABLE.slice(-C3_IDS.length).map((d) => d.id)).toEqual(C3_IDS);
    expect(MENU.slice(-C3_IDS.length).map((m) => m.id)).toEqual(C3_IDS);
    for (const id of C3_IDS) {
      const m = getMenu(id);
      expect(m).toMatchObject({ station: 'cook', form: 'bake', ingredients: [], enabled: true });
      expect(m.ticketItems!.length).toBeGreaterThan(0);
      expect(m.basePoints).toBe(getBakeDish(m.id)!.vessel === 'doria' ? 30 : 50);
    }
    expect(getMenu('milanoDoria').basePoints).toBe(30); // 同系の既存品と同じ
    expect(getMenu('buffaloPizza').basePoints).toBe(50);
  });

  it('登録した表は、表の決まりをすべて守る（中身の入った山の品どうしは、山で区別できる）', () => {
    expect(tableProblems(BAKE_TABLE)).toEqual([]);
    expect(tableProblems()).toEqual([]);
    // 山の品でなければ、同じ段階・仕上げの品は、いままでどおり見つかる
    const tarako = getBakeDish('tarakoDoria')!;
    const twin: BakeDish = { ...tarako, id: 'twin', stock: undefined };
    expect(tableProblems([...BAKE_TABLE.filter((d) => d !== tarako), { ...tarako, stock: undefined }, twin]).some((p) => p.startsWith('⑤'))).toBe(true);
  });

  it('ドリアは焼き方・下駄が既存のまま（L・下駄）。焼きチーズミラノドリアだけ、パセリを振る', () => {
    const milano = getBakeDish('milanoDoria')!;
    for (const id of NEW_DORIAS) {
      const d = getBakeDish(id)!;
      expect(d.stock).toBe(true);
      expect(d.stages).toEqual(milano.stages);
      expect(d.finish.base).toBe('geta');
    }
    expect(getBakeDish('cheeseMilanoDoria')!.finish.extras).toEqual(['parsley']);
    expect(getBakeDish('tarakoDoria')!.finish.extras).toBeUndefined();
    expect(getBakeDish('tarakoGratin')!.finish.extras).toBeUndefined(); // 仮：パセリは最初からのっている
  });

  it('棚の4つのドリアの山は、どれも品の表に載り、品名のラベルがある', () => {
    const table = BAKE_TABLE;
    const doriaStacks = SHELF_STACKS.filter((s) => s.dish);
    expect(doriaStacks.map((s) => s.dish).sort()).toEqual(['milanoDoria', ...NEW_DORIAS].sort());
    for (const s of doriaStacks) {
      expect(getBakeDish(s.dish!, table)).not.toBeNull();
      expect(s.label).toBe(dishName(s.dish!));
    }
  });

  it('登録した品の山・具の容器は、取れる（準備中ではない）。既存の2品も、いままでどおり', () => {
    const g = cookGame();
    for (const id of NEW_DORIAS) {
      expect(g.planInteract(stack(id))).not.toBeNull();
      expect(g.ovenHint(stack(id))).not.toContain('準備中');
    }
    for (const id of PIZZA_TOP_IDS) {
      const t: Target = { kind: 'pizzaSource', id };
      expect(g.planInteract(t)).not.toBeNull();
      expect(g.pizzaHint(t)).not.toContain('準備中');
    }
    expect(g.planInteract(stack('milanoDoria'))).not.toBeNull();
    expect(g.planInteract({ kind: 'pizzaSource', id: 'mozzarella' })).not.toBeNull();
    // パセリを振れるのは、表にその仕上げを使う品（焼きチーズミラノドリア）がある器だけ。表からその品を除くと振れない
    const done = { ...bakeItem('doria', cfg.ovenLowerTime, cfg, undefined, {}), geta: true };
    expect(canFinishWith(done, 'parsley', cfg)).toBe(true);
    expect(canFinishWith(done, 'parsley', cfg, BAKE_TABLE.filter((d) => d.id !== 'cheeseMilanoDoria'))).toBe(false);
  });
});

describe('ピザの4番目の具（pizza.ts）', () => {
  it('生地 → ソース → チーズまでは共通。4番目は、モッツァレラ・野菜ときのこ・ソーセージ・コーンのどれか1種類だけ', () => {
    const base = sauceCheesePizza();
    for (const top of PIZZA_TOP_IDS) {
      const p = addTopping(base, top);
      expect(p.top).toBe(top);
      expect(fourthOf(p)).toBe(top);
      expect(canAddTopping(p, top)).toBe(false); // 1杯だけ
      expect(canAddTopping(p, 'mozzarella')).toBe(false); // 2種類目はのらない
      expect(whyNotTopping(p, 'mozzarella')).toContain('1種類だけ');
      for (const other of PIZZA_TOP_IDS.filter((x) => x !== top)) expect(canAddTopping(p, other)).toBe(false);
    }
    const mozz = addTopping(base, 'mozzarella');
    expect(fourthOf(mozz)).toBe('mozzarella');
    for (const top of PIZZA_TOP_IDS) expect(canAddTopping(mozz, top)).toBe(false);
    // チーズより前には、のせられない
    expect(canAddTopping({ ...base, cheese: false }, 'corn')).toBe(false);
  });

  it('具の種類は、見た目の文字列（pizzaSignature）と表の中身（pizzaLoad）に必ず入る', () => {
    const base = sauceCheesePizza();
    const sigs = new Set([pizzaSignature(base), ...PIZZA_TOP_IDS.map((t) => pizzaSignature(addTopping(base, t)))]);
    expect(sigs.size).toBe(1 + PIZZA_TOP_IDS.length);
    expect(pizzaLoad(addTopping(base, 'vegMushroom'))).toEqual({ dough: 1, pizzaSauce: 1, pizzaCheese: 1, vegMushroom: 1 });
    expect(pizzaLoad(addTopping(base, 'sausage'))).toEqual({ dough: 1, pizzaSauce: 1, pizzaCheese: 1, slicedSausage: 1 });
    expect(pizzaLoad(addTopping(base, 'corn'))).toEqual({ dough: 1, pizzaSauce: 1, pizzaCheese: 1, corn: 1 });
  });

  it('具の容器3つは、2台目の具材台のモッツァレラの隣。作業台の置き物（PREP_FIXTURES）に登録され、ほかの置き物と重ならない', () => {
    const pizzaAtZ = OVEN_COUNTER_ZS[PIZZA_COUNTER.counter] - OVEN_COUNTER_ROW.z;
    const tubs = PIZZA_TOP_IDS.map((id) => ({ x: PIZZA_TOP_TUBS.spots[id].xr, z: pizzaAtZ + PIZZA_TOP_TUBS.spots[id].zr, hx: PIZZA_TOP_TUBS.w / 2, hz: PIZZA_TOP_TUBS.d / 2 }));
    for (const t of tubs) expect(PREP_FIXTURES.some((p) => Math.abs(p.x - t.x) < 1e-9 && Math.abs(p.z - t.z) < 1e-9)).toBe(true);
    // モッツァレラの容器の、すぐ手前（壁側）
    const mozzEdge = PIZZA_COUNTER.mozz.zr + PIZZA_COUNTER.mozz.d / 2;
    for (const id of PIZZA_TOP_IDS) {
      expect(PIZZA_TOP_TUBS.spots[id].zr - PIZZA_TOP_TUBS.d / 2).toBeGreaterThan(mozzEdge);
      expect(PIZZA_TOP_TUBS.spots[id].zr - PIZZA_TOP_TUBS.d / 2 - mozzEdge).toBeLessThan(0.2);
    }
    // 作業台の天板の中
    for (const t of tubs) {
      expect(Math.abs(t.x) + t.hx).toBeLessThanOrEqual(SURFACES.prep.width / 2);
      expect(Math.abs(t.z) + t.hz).toBeLessThanOrEqual(SURFACES.prep.depth / 2);
    }
    // 重ならない
    for (let i = 0; i < PREP_FIXTURES.length; i++) {
      for (let j = i + 1; j < PREP_FIXTURES.length; j++) {
        const a = PREP_FIXTURES[i];
        const b = PREP_FIXTURES[j];
        expect(Math.abs(a.x - b.x) < a.hx + b.hx - 1e-6 && Math.abs(a.z - b.z) < a.hz + b.hz - 1e-6, `${i} と ${j}`).toBe(false);
      }
    }
    expect(OVEN_COUNTER.width).toBeGreaterThan(0);
    expect(WORK_FRAMES.slots.length).toBe(3);
  });

  it('具の容器の上には、お皿・鉄板を置けない', () => {
    const g = cookGame();
    g.state.hand = { kind: 'panPile', count: 2 };
    const pizzaAtZ = OVEN_COUNTER_ZS[PIZZA_COUNTER.counter] - OVEN_COUNTER_ROW.z;
    for (const id of PIZZA_TOP_IDS) {
      const t = PIZZA_TOP_TUBS.spots[id];
      expect(g.previewProp({ kind: 'tableTop', surface: 'prep', x: t.xr, z: pizzaAtZ + t.zr }), id).toMatchObject({ valid: false, reason: 'gap' });
    }
  });
});

describe('ドリアの山：取った皿は、どの品の山かを覚えている（bake.ts）', () => {
  it('最初の山（ミラノドリア）の皿は、いままでと同じ形。ほかの山の皿は stock を持つ', () => {
    const table = BAKE_TABLE;
    expect(defaultStock('doria', table)).toBe('milanoDoria');
    expect(stockProgress('doria', 'milanoDoria', table)).toEqual({});
    expect(stockProgress('doria', undefined, table)).toEqual({});
    for (const id of NEW_DORIAS) expect(stockProgress('doria', id, table)).toEqual({ stock: id });
  });

  it('山ごとに、見た目の文字列（progressSignature）が違う', () => {
    const sigs = new Set(['milanoDoria', ...NEW_DORIAS].map((id) => progressSignature(stockProgress('doria', id))));
    expect(sigs.size).toBe(4);
    expect(progressSignature({ finishes: ['parsley'] })).not.toBe(progressSignature({}));
  });
});

// ===================== 8品が遊べる（受け入れ条件。登録済みの表・メニュー）=====================

describe('6品を登録した表・メニューで、8品が遊べる（設計書 4.3 の受け入れ条件）', () => {
  it('表と焼き物の品が1対1。既存の品の並びは変わらない（末尾に足してある）', () => {
    expect(bakedMenus().map((m) => m.id)).toEqual(ALL_COOK);
    expect(BAKE_TABLE.map((d) => d.id)).toEqual(ALL_COOK);
    expect(MENU[0].id).toBe('tarako');
    expect(menusFor('cook').map((m) => m.id)).toEqual(ALL_COOK);
    expect(tableProblems()).toEqual([]);
    for (const m of bakedMenus()) expect(formOf(m)).toBe('bake');
  });

  it('8品すべてが、クックの伝票に出る', () => {
    let s = 7;
    const rng = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
    const g = new Game(cfg, rng);
    g.start('leading', 'cook');
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      g.state.nextTicketAt = 0;
      g.state.tickets = [];
      g.update(0.001);
      for (const t of g.state.tickets) seen.add(t.menuId);
    }
    expect([...seen].sort()).toEqual([...ALL_COOK].sort());
  });

  it('ドリア4品：その品の山から取って、下段 → 下駄で提供すると採点される（焼きチーズはパセリを振ってから）', () => {
    for (const id of ['milanoDoria', ...NEW_DORIAS]) {
      const g = cookGame([ticket(1, id)]);
      makeDoria(g, id);
      if (getBakeDish(id)!.finish.extras?.includes('parsley')) {
        expect(g.planInteract(pass), id).toBeNull(); // パセリがまだ
        expect(g.getaHint(pass)).toContain('パセリ');
        g.interact(frame(0)); // 作業枠に置く
        g.interact(parsley);
        expect(g.canUseBottleAt(frame(0))).toBe(true);
        g.rightClick(frame(0)); // 1回振る
        g.interact(parsleyBack);
        g.interact(frame(0)); // 持ち上げる
      }
      expect(g.getaHint(pass), id).toBe(`左クリック：${getMenu(id).name}を提供台に出す`);
      const expected = serveScore(getMenu(id), g.state.time, 0, cfg).total;
      g.interact(pass);
      expect(g.state.score, id).toBe(expected);
      expect(g.state.served, id).toBe(1);
      expect(g.state.mistakes, id).toBe(0);
      expect(g.state.tickets, id).toHaveLength(0);
    }
  });

  it('ピザ4品：4番目の具を変えて焼き、お皿で提供すると採点される', () => {
    for (const [id, fourth] of [['buffaloPizza', 'mozzarella'], ...NEW_PIZZAS] as [string, PizzaTop | 'mozzarella'][]) {
      const g = cookGame([ticket(1, id)]);
      makePizza(g, fourth);
      expect(g.state.hand, id).toMatchObject({ kind: 'pizzaPlate', dish: { state: 'baked' } });
      expect(g.getaHint(pass), id).toBe(`左クリック：${getMenu(id).name}を提供台に出す`);
      const expected = serveScore(getMenu(id), g.state.time, 0, cfg).total;
      g.interact(pass);
      expect(g.state.score, id).toBe(expected);
      expect(g.state.served, id).toBe(1);
      expect(g.state.mistakes, id).toBe(0);
    }
  });

  it('ほかの品の伝票しかなければ、注文ミス（コーンピザを、ソーセージピザの伝票に出す）', () => {
    const g = cookGame([ticket(1, 'sausagePizza')]);
    makePizza(g, 'corn');
    g.interact(pass);
    expect(g.state.mistakes).toBe(1);
    expect(g.state.tickets).toHaveLength(1);
  });

  it('具の容器から取って、組み立て台の鉄板にのせられる。2種類目はのらない', () => {
    const g = cookGame();
    g.interact({ kind: 'pizzaDoughStack' });
    g.interact({ kind: 'pizzaPanStack' });
    g.interact(pizzaSlot);
    for (const id of ['sauce', 'cheese', 'corn'] as const) {
      g.interact({ kind: 'pizzaSource', id });
      g.interact(pizzaSlot);
    }
    expect(g.state.pizzaSlots[0]!.pizza).toMatchObject({ top: 'corn', mozz: 0 });
    expect(g.pizzaHint(pizzaSlot)).toContain('コーンピザ');
    g.interact({ kind: 'pizzaSource', id: 'sausage' });
    expect(g.planInteract(pizzaSlot)).toBeNull();
    expect(g.pizzaHint(pizzaSlot)).toContain('1種類だけ');
    g.interact({ kind: 'pizzaSource', id: 'sausage' }); // 戻す
    g.interact({ kind: 'pizzaSource', id: 'mozzarella' });
    expect(g.planInteract(pizzaSlot)).toBeNull();
  });

  it('焼いたピザの名前は、表の品名（そろっていなければ、のっている物の名前）', () => {
    expect(pizzaTitle(addTopping(sauceCheesePizza(), 'vegMushroom'))).toBe('野菜ときのこのピザ');
    expect(pizzaTitle(addTopping(sauceCheesePizza(), 'sausage'))).toBe('ソーセージピザ');
    expect(pizzaTitle(addTopping(sauceCheesePizza(), 'corn'))).toBe('コーンピザ');
    expect(pizzaTitle({ ...sauceCheesePizza(), sauce: false })).toBe('ピザ生地');
    const baked = bakeItem('pizza', cfg.ovenUpperTime, cfg, addTopping(sauceCheesePizza(), 'corn'));
    expect(bakeLabel(baked)).toBe('コーンピザ 焼き上がり');
  });

  it('焼き上がったドリア4品は、ラベル（品名）と見た目の文字列で区別できる', () => {
    const labels = new Set<string>();
    const sigs = new Set<string>();
    for (const id of ['milanoDoria', ...NEW_DORIAS]) {
      const g = cookGame();
      makeDoria(g, id);
      const hand = g.state.hand as Extract<Item, { kind: 'bakeDish' }>;
      expect(hand.state).toBe('baked');
      const label = bakeLabel(hand);
      expect(label).toBe(`${getMenu(id).name} 焼き上がり`);
      labels.add(label);
      sigs.add(progressSignature(hand));
    }
    expect(labels.size).toBe(4);
    expect(sigs.size).toBe(4);
  });

  it('ドリアの皿は、別の山の品にはならない（たらこのドリアの皿を、たらこのグラタンの伝票に出すと注文ミス）', () => {
    const g = cookGame([ticket(1, 'tarakoGratin')]);
    makeDoria(g, 'tarakoDoria');
    expect(servableDish(g.state.hand)?.id).toBe('tarakoDoria');
    g.interact(pass);
    expect(g.state.mistakes).toBe(1);
    expect(g.state.tickets).toHaveLength(1);
  });

  it('パセリ：作業枠の、下駄に乗せた焼き上がりにだけ振れる。振りすぎ（2回）・いらない品に振ると、出せるが注文ミス', () => {
    expect(BOTTLE_BAKE_FINISH.parsley).toBe('parsley');
    // 2回振った焼きチーズミラノドリア
    const g = cookGame([ticket(1, 'cheeseMilanoDoria')]);
    makeDoria(g, 'cheeseMilanoDoria');
    g.interact(frame(0));
    g.interact(parsley);
    g.rightClick(frame(0));
    g.rightClick(frame(0));
    g.interact(parsleyBack);
    g.interact(frame(0));
    expect(servableDish(g.state.hand)).toBeNull();
    expect(overFinishedDish(g.state.hand)?.id).toBe('cheeseMilanoDoria');
    expect(serveHint(g.state.hand)).toBe('左クリック：焼きチーズミラノドリアを提供台に出す'); // ヒートの皿と同じく、案内は出せることだけ
    expect(g.planInteract(pass)).not.toBeNull();
    g.interact(pass);
    expect(g.state.mistakes).toBe(1);
    expect(g.state.served).toBe(0);
    expect(g.state.tickets).toHaveLength(1);

    // パセリのいらない、たらこのドリアに振る
    const h = cookGame([ticket(1, 'tarakoDoria')]);
    makeDoria(h, 'tarakoDoria');
    h.interact(frame(0));
    h.interact(parsley);
    h.rightClick(frame(0));
    h.interact(parsleyBack);
    h.interact(frame(0));
    h.interact(pass);
    expect(h.state.mistakes).toBe(1);

    // 下駄に乗せる前・焼く前の皿には振れない
    const k = cookGame();
    k.interact(stack('cheeseMilanoDoria'));
    k.interact(frame(0)); // 焼く前の皿を作業枠に置く
    k.interact(parsley);
    expect(k.canUseBottleAt(frame(0))).toBe(false);
    k.rightClick(frame(0));
    expect(k.state.workFrames[0]).toMatchObject({ kind: 'bakeDish', state: 'raw' });
    expect((k.state.workFrames[0] as Extract<Item, { kind: 'bakeDish' }>).finishes).toBeUndefined();
    // 焼き皿でない物（手が空など）には振れない
    expect(canFinishWith(null, 'parsley', cfg)).toBe(false);
  });

  it('振る回数は、設定値の上限まで', () => {
    const d = { ...bakeItem('doria', cfg.ovenLowerTime, cfg, undefined, { stock: 'cheeseMilanoDoria' }), geta: true };
    expect(canFinishWith(d, 'parsley', cfg)).toBe(true);
    const full = { ...d, finishes: Array.from({ length: cfg.maxBakeFinishes }, () => 'parsley' as const) };
    expect(canFinishWith(full, 'parsley', cfg)).toBe(false);
  });

  it('登録した品の山・具の容器は、取れる（準備中ではない）', () => {
    const g = cookGame();
    for (const id of NEW_DORIAS) {
      expect(g.ovenHint(stack(id))).toContain(dishName(id));
      expect(g.ovenHint(stack(id))).not.toContain('準備中');
      expect(g.planInteract(stack(id))).not.toBeNull();
    }
    for (const id of PIZZA_TOP_IDS) expect(g.planInteract({ kind: 'pizzaSource', id })).not.toBeNull();
  });
});

// ===================== チュートリアル（登録済みの6品とも、最後まで作れる）=====================

type Act = Target | { right: Target } | { wait: number } | { free: Target };
const wait = (seconds: number): Act => ({ wait: seconds });
const pizzaSource = (id: 'sauce' | 'cheese' | 'mozzarella' | PizzaTop): Target => ({ kind: 'pizzaSource', id });
const pizzaPlate = (id: number): Target => ({ kind: 'pizzaPlate', id });

const doriaScript = (dish: string): Act[] => [stack(dish), lowerInlet, wait(cfg.ovenLowerTime + 1), getaStack, lowerOutlet, pass];
const pizzaScript = (top: PizzaTop): Act[] => [
  { kind: 'pizzaPlateStack' },
  { free: { kind: 'tableTop', surface: 'left', x: PIZZA_PLATE_GUIDE.x, z: PIZZA_PLATE_GUIDE.z } },
  { kind: 'pizzaDoughStack' },
  { kind: 'pizzaPanStack' },
  pizzaSlot,
  pizzaSource('sauce'),
  pizzaSlot,
  pizzaSource('cheese'),
  pizzaSlot,
  pizzaSource(top),
  pizzaSlot,
  pizzaSlot,
  pizzaInlet,
  wait(cfg.ovenUpperTime + 1),
  pizzaOutlet,
  pizzaPlate(1),
  { kind: 'pizzaPanStack' },
  pizzaPlate(1),
  pass,
];
const SCRIPTS: Record<string, Act[]> = {
  // 焼きチーズミラノドリア：山 → 下段 → 下駄 → 作業枠に置く → パセリを取って1回振り、戻す → 持ち上げて提供
  cheeseMilanoDoria: [
    stack('cheeseMilanoDoria'), lowerInlet, wait(cfg.ovenLowerTime + 1), getaStack, lowerOutlet,
    frame(0), parsley, { right: frame(0) }, { free: parsleyBack }, frame(0), pass,
  ],
  tarakoDoria: doriaScript('tarakoDoria'),
  tarakoGratin: doriaScript('tarakoGratin'),
  vegMushroomPizza: pizzaScript('vegMushroom'),
  sausagePizza: pizzaScript('sausage'),
  cornPizza: pizzaScript('corn'),
};

describe('チュートリアル：C3 の6品', () => {

  it('提供できる品すべてに工程がある', () => {
    for (const m of MENU.filter((x) => x.enabled)) {
      expect(hasTutorial(m.id), m.id).toBe(true);
      expect(tutorialSteps(m.id, cfg)!.length).toBeGreaterThan(0);
    }
  });

  for (const m of C3_IDS.map(getMenu)) {
    it(`${m.name}：矢印のとおりに作ると、提供できて、チュートリアルが完了する`, () => {
      const g = new Game(cfg, () => 0);
      g.startPractice();
      expect(g.startTutorial(m.id)).toBe(true);
      let lastStep = 0;
      const expectArrowAt = (target: Target) => {
        const guide = g.tutorialGuide();
        expect(guide, `${m.id} 工程${(g.state.tutorial?.step ?? -1) + 1}: 矢印が出ていない`).not.toBeNull();
        expect(matchesTarget(target, guide!.at as GuideAt), `${m.id} 工程${(g.state.tutorial?.step ?? -1) + 1}: 矢印が ${JSON.stringify(guide!.at)}（操作は ${JSON.stringify(target)}）`).toBe(true);
      };
      for (const act of SCRIPTS[m.id]) {
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
      expect(g.state.toast?.text).toBe(`${m.name}のチュートリアル完了！`);
      expect(g.state.tutorial).toBeNull();
    });
  }
});
