import { describe, expect, it } from 'vitest';
import gameSource from './game.ts?raw';
import { BAKE_TABLE, getBakeDish, servableDish, tableProblems } from './bake';
import { DEFAULT_CONFIG as cfg } from './config';
import { Game } from './game';
import { COOK_BIN, COOK_HOT_WATER, COOK_HOT_WATER_AT, COOK_PACK_CASES, LAYOUT, OVEN, OVEN_COUNTER, OVEN_COUNTER_ZS, OVEN_Z, PIZZA_TOP_TUBS, PIZZA_COUNTER, PREP_FIXTURES } from './layout';
import { frontS } from './oven';
import { PACKS, packLoad, packOfLoad, stackLimit, warmTime } from './pack';
import { menusFor } from './position';
import { MENU, getMenu } from './recipe';
import { createTicket } from './tickets';
import { hasTutorial } from './tutorial';
import type { BakeStyle, IngredientId, Item, Target, Ticket } from './types';

// クック編 C8（ステップL）：オーブン側の湯煎器（2台目）とスープ2品（たまねぎのズッパ・ミネストローネ）

const SOUPS = ['zuppa', 'minestrone'] as const;
type Soup = (typeof SOUPS)[number];
const WARM: Record<Soup, number> = { zuppa: cfg.zuppaWarmTime, minestrone: cfg.minestroneWarmTime };

const pass: Target = { kind: 'servePass' };
const boardStack: Target = { kind: 'boardStack' };
const frame = (index: number): Target => ({ kind: 'workFrame', index });
const vessel = (style: BakeStyle): Target => ({ kind: 'vesselStack', style });
const stock = (id: IngredientId): Target => ({ kind: 'stock', id });
const fridgeStock = (id: IngredientId): Target => ({ kind: 'stock', id, inFridge: true });
const hotWater = (index: number): Target => ({ kind: 'hotWaterSlot', index }); // 1台目（unit 省略）
const cookHotWater = (index: number): Target => ({ kind: 'hotWaterSlot', index, unit: 1 }); // 2台目（オーブン側）
const inlet: Target = { kind: 'ovenInlet', deck: 'upper', x: 0, s: frontS('soupBowl') };
const outlet: Target = { kind: 'ovenOutlet', deck: 'upper', lane: 1 }; // 3列系の器を x = 0 に流すと、まん中のレーン

const ticket = (id: number, menuId: string): Ticket => createTicket(id, getMenu(menuId), 0);

function cookGame(tickets: Ticket[] = []): Game {
  const g = new Game(cfg, () => 0);
  g.start('leading', 'cook');
  g.state.nextTicketAt = Infinity;
  g.state.tickets = tickets;
  return g;
}

type Act = Target | { wait: number };
function playActs(g: Game, acts: Act[]): void {
  for (const act of acts) {
    if ('wait' in act) g.update(act.wait);
    else {
      expect(g.planInteract(act), `操作できない：${JSON.stringify(act)}`).not.toBeNull();
      g.interact(act);
    }
  }
}

// オーブンの入口のまわりだけで作る手順：スープ皿を作業枠に置く → 3台目の具材台のケースからパック → 隣の湯煎器に浸ける →
// 温まったら取ってスープ皿に入れる → 上段 → 板に乗せて提供
const soupActs = (id: Soup): Act[] => [
  vessel('soupBowl'), frame(0), stock(id), cookHotWater(0), { wait: WARM[id] + 0.5 }, cookHotWater(0), frame(0),
  frame(0), inlet, { wait: cfg.ovenUpperTime + 1 }, boardStack, outlet, pass,
];

const handPacks = (g: Game) => (g.state.hand?.kind === 'pack' ? g.state.hand.packs : []);
const frameDish = (g: Game, i = 0) => g.state.workFrames[i] as Extract<Item, { kind: 'bakeDish' }>;

describe('C8：スープ2品の登録（表の行とメニュー）', () => {
  it('表とメニューの末尾に2品が載り、クックの伝票は25品。先頭はたらこのまま', () => {
    expect(BAKE_TABLE.slice(-2).map((d) => d.id)).toEqual([...SOUPS]);
    expect(MENU.slice(-2).map((m) => m.id)).toEqual([...SOUPS]);
    expect(MENU[0].id).toBe('tarako');
    expect(menusFor('cook')).toHaveLength(25);
    expect(menusFor('cook').slice(-2).map((m) => m.id)).toEqual([...SOUPS]);
    expect(tableProblems()).toEqual([]);
  });

  it('メニュー：クックの焼き物・分類はクックのスープ。名前はたまねぎのズッパ・ミネストローネ', () => {
    for (const id of SOUPS) expect(getMenu(id)).toMatchObject({ station: 'cook', form: 'bake', category: 'cookSoup', enabled: true, ingredients: [] });
    expect(getMenu('zuppa').name).toBe('たまねぎのズッパ');
    expect(getMenu('minestrone').name).toBe('ミネストローネ');
  });

  it('表：鉄のスープ皿に、パックの中身1つ → 上段1周 → 板', () => {
    for (const id of SOUPS) {
      const dish = getBakeDish(id)!;
      expect(dish.vessel).toBe('soupBowl');
      expect(dish.stages).toEqual([{ load: [{ id, count: 1, at: 'all' }], need: 1 }]);
      expect(dish.finish.base).toBe('board');
    }
  });

  it('パックの表：温める時間（仮 5秒）・重ねて持てる数（仮 3つ）・中身は config と表から引く', () => {
    expect(cfg.zuppaWarmTime).toBe(5);
    expect(cfg.minestroneWarmTime).toBe(5);
    for (const id of SOUPS) {
      expect(warmTime(id, cfg)).toBe(WARM[id]);
      expect(stackLimit(id, cfg)).toBe(3);
      expect(packLoad(id)).toBe(id);
      expect(packOfLoad(id)).toBe(id);
    }
    // 既存のパックは焼き皿に入れない（中身なし）。値も今までどおり
    expect(packLoad('cornSoup')).toBeNull();
    expect(packLoad('carbonaraSauce')).toBeNull();
    expect(warmTime('cornSoup', cfg)).toBe(cfg.cornSoupWarmTime);
    expect(warmTime('carbonaraSauce', cfg)).toBe(cfg.carbonaraWarmTime);
    expect(Object.keys(PACKS).sort()).toEqual(['carbonaraSauce', 'cornSoup', 'minestrone', 'zuppa']);
  });

  it('game.ts は、スープ2品の品名・品IDで分岐しない', () => {
    for (const id of SOUPS) expect(gameSource).not.toMatch(new RegExp(`['"]${id}['"]`));
  });

  it('2品とも、表から作るチュートリアルがある', () => {
    for (const id of SOUPS) expect(hasTutorial(id)).toBe(true);
  });
});

describe('C8：2台目の湯煎器の置き場所（layout.ts）', () => {
  it('3台目の具材台の天板の上。2×2 の4か所（cookHotWaterSlotCount）', () => {
    expect(COOK_HOT_WATER.counter).toBe(2);
    expect(cfg.cookHotWaterSlotCount).toBe(4);
    expect(cfg.cookHotWaterColumns).toBe(2);
    const halfW = OVEN_COUNTER.width / 2;
    const halfD = OVEN_COUNTER.depth / 2;
    expect(Math.abs(COOK_HOT_WATER.xr) + COOK_HOT_WATER.w / 2).toBeLessThanOrEqual(halfW);
    expect(Math.abs(COOK_HOT_WATER.zr) + COOK_HOT_WATER.d / 2).toBeLessThanOrEqual(halfD);
    for (const c of COOK_PACK_CASES) {
      expect(Math.abs(c.xr) + COOK_BIN.w / 2).toBeLessThanOrEqual(halfW);
      expect(Math.abs(c.zr) + COOK_BIN.d / 2).toBeLessThanOrEqual(halfD);
    }
  });

  it('隣のケースはスープ2品のパック。湯煎器・ケース・ピザの具の容器は重ならない', () => {
    expect(COOK_PACK_CASES.map((c) => c.id)).toEqual([...SOUPS]);
    type R = { x: number; z: number; hx: number; hz: number };
    const zOf = (counter: number, zr: number) => OVEN_COUNTER_ZS[counter] + zr;
    const rects: R[] = [
      { x: COOK_HOT_WATER.xr, z: zOf(2, COOK_HOT_WATER.zr), hx: COOK_HOT_WATER.w / 2, hz: COOK_HOT_WATER.d / 2 },
      ...COOK_PACK_CASES.map((c) => ({ x: c.xr, z: zOf(2, c.zr), hx: COOK_BIN.w / 2, hz: COOK_BIN.d / 2 })),
      ...Object.values(PIZZA_TOP_TUBS.spots).map((s) => ({ x: s.xr, z: zOf(PIZZA_COUNTER.counter, s.zr), hx: PIZZA_TOP_TUBS.w / 2, hz: PIZZA_TOP_TUBS.d / 2 })),
    ];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlap = Math.abs(a.x - b.x) < a.hx + b.hx && Math.abs(a.z - b.z) < a.hz + b.hz;
        expect(overlap, `${i} と ${j} が重なる`).toBe(false);
      }
    }
  });

  it('湯煎器とケースは、作業台の置き物（PREP_FIXTURES）に登録されている', () => {
    // 作業台の中心からの相対
    const rowZ = (OVEN_COUNTER_ZS[0] + OVEN_COUNTER_ZS[OVEN_COUNTER_ZS.length - 1]) / 2;
    const has = (xr: number, zr: number) => PREP_FIXTURES.some((p) => Math.abs(p.x - xr) < 1e-9 && Math.abs(p.z - (OVEN_COUNTER_ZS[2] - rowZ + zr)) < 1e-9);
    expect(has(COOK_HOT_WATER.xr, COOK_HOT_WATER.zr)).toBe(true);
    for (const c of COOK_PACK_CASES) expect(has(c.xr, c.zr)).toBe(true);
  });

  it('1台目の湯煎器より、ずっとオーブンの入口に近い', () => {
    const inletAt = { x: OVEN.x, z: (OVEN_Z.inlet.minZ + OVEN_Z.inlet.maxZ) / 2 };
    const dist = (p: { x: number; z: number }) => Math.hypot(p.x - inletAt.x, p.z - inletAt.z);
    expect(dist(COOK_HOT_WATER_AT)).toBeLessThan(4.5); // 3台目の具材台の上（入口から3台分の範囲）
    expect(dist(COOK_HOT_WATER_AT)).toBeLessThan(dist(LAYOUT.hotWater) / 2);
  });
});

describe('C8：2台目の湯煎器の動き', () => {
  it('GameState に2台目の配列（4か所）が増える。1台目（hotWater）の形は変わらない', () => {
    const g = cookGame();
    expect(g.state.cookHotWater).toEqual([null, null, null, null]);
    expect(g.state.hotWater).toHaveLength(cfg.hotWaterSlotCount);
    expect(g.state.hotWater.every((p) => p === null)).toBe(true);
  });

  it('ケースのパックは、同じ種類を3つまで重ねて持てる。別の種類は重ねられない', () => {
    const g = cookGame();
    for (let i = 0; i < 3; i++) g.interact(stock('zuppa'));
    expect(handPacks(g)).toHaveLength(3);
    expect(g.planInteract(stock('zuppa'))).toBeNull(); // 4つ目は持てない
    expect(g.planInteract(stock('minestrone'))).toBeNull(); // 別の種類は持てない
  });

  it('浸けた時間の合計で温まり、冷めない（取り出して戻しても累計）。unit を省略すると1台目', () => {
    const g = cookGame();
    g.interact(stock('minestrone'));
    g.interact(cookHotWater(3));
    expect(g.state.cookHotWater[3]?.id).toBe('minestrone');
    expect(g.state.hotWater.every((p) => p === null)).toBe(true); // 1台目には入らない
    g.update(cfg.minestroneWarmTime - 1);
    expect(g.state.cookHotWater[3]!.warm).toBe(false);
    g.interact(cookHotWater(3)); // 取り出す
    g.update(10); // 手に持っている間は温まらない
    expect(handPacks(g)[0].warm).toBe(false);
    g.interact(cookHotWater(1)); // 別の場所に戻す
    g.update(1.01);
    expect(g.state.cookHotWater[1]!.warm).toBe(true);
    g.update(100);
    expect(g.state.cookHotWater[1]!.warm).toBe(true); // 冷めない
  });

  it('範囲外の置き場は操作できない', () => {
    const g = cookGame();
    g.interact(stock('zuppa'));
    expect(g.planInteract(cookHotWater(cfg.cookHotWaterSlotCount))).toBeNull();
  });

  it('相互互換：コーンスープ・カルボナーラのパックは2台目でも、スープ2品のパックは1台目でも温まる', () => {
    const g = cookGame();
    g.state.hand = { kind: 'pack', packs: [{ id: 'cornSoup', soak: 0, warm: false }] };
    g.interact(cookHotWater(0));
    g.state.hand = { kind: 'pack', packs: [{ id: 'carbonaraSauce', soak: 0, warm: false }] };
    g.interact(cookHotWater(1));
    g.interact(stock('zuppa'));
    g.interact(hotWater(0));
    expect(g.state.hand).toBeNull();
    g.update(Math.max(cfg.cornSoupWarmTime, cfg.carbonaraWarmTime, cfg.zuppaWarmTime) + 0.1);
    expect(g.state.cookHotWater[0]).toMatchObject({ id: 'cornSoup', warm: true });
    expect(g.state.cookHotWater[1]).toMatchObject({ id: 'carbonaraSauce', warm: true });
    expect(g.state.hotWater[0]).toMatchObject({ id: 'zuppa', warm: true });
    // 1台目で温めたズッパのパックも、スープ皿に入れられる
    g.interact(vessel('soupBowl'));
    g.interact(frame(0));
    g.interact(hotWater(0));
    g.interact(frame(0));
    expect(frameDish(g).loaded).toEqual({ zuppa: 1 });
  });
});

describe('C8：パックをスープ皿に入れる', () => {
  it('温まっていないパックは入れられない（案内が出る）。温まったら1つ入る。2つ目は入らない', () => {
    const g = cookGame();
    g.interact(vessel('soupBowl'));
    g.interact(frame(0));
    g.interact(stock('zuppa'));
    g.interact(stock('zuppa'));
    expect(g.planInteract(frame(0))).toBeNull();
    expect(g.getaHint(frame(0))).toContain('温まっていない');
    g.state.hand = { kind: 'pack', packs: handPacks(g).map((p) => ({ ...p, warm: true, soak: 9 })) };
    expect(g.getaHint(frame(0))).toContain('たまねぎのズッパ');
    g.interact(frame(0));
    expect(frameDish(g).loaded).toEqual({ zuppa: 1 });
    expect(handPacks(g)).toHaveLength(1); // 1つだけ減る
    expect(g.planInteract(frame(0))).toBeNull(); // 2つ目は入らない（そろったら上限）
  });

  it('ズッパの入った皿には、ミネストローネは入らない（別の品の物は混ぜない）', () => {
    const g = cookGame();
    g.interact(vessel('soupBowl'));
    g.interact(frame(0));
    g.state.hand = { kind: 'pack', packs: [{ id: 'zuppa', soak: 9, warm: true }] };
    g.interact(frame(0));
    g.state.hand = { kind: 'pack', packs: [{ id: 'minestrone', soak: 9, warm: true }] };
    expect(g.planInteract(frame(0))).toBeNull();
  });

  it('コーンスープ・カルボナーラのパックは、焼き皿には入らない', () => {
    const g = cookGame();
    g.interact(vessel('soupBowl'));
    g.interact(frame(0));
    for (const id of ['cornSoup', 'carbonaraSauce'] as const) {
      g.state.hand = { kind: 'pack', packs: [{ id, soak: 9, warm: true }] };
      expect(g.planInteract(frame(0))).toBeNull();
    }
  });
});

describe('C8：受け入れ条件（オーブンの入口から離れずに、スープ2品を作って提供できる）', () => {
  for (const id of SOUPS) {
    it(`${getMenu(id).name}：作業枠・3台目の具材台の湯煎器・オーブン・板・提供台だけで作れる`, () => {
      const g = cookGame([ticket(1, id)]);
      const acts = soupActs(id);
      // 1台目の湯煎器・冷蔵庫は使わない
      for (const a of acts) {
        if ('wait' in a) continue;
        expect(a.kind === 'hotWaterSlot' && (a.unit ?? 0) === 0).toBe(false);
        expect(a.kind === 'fridgeDoor' || (a.kind === 'stock' && a.inFridge === true)).toBe(false);
      }
      playActs(g, acts.slice(0, -1));
      expect(servableDish(g.state.hand)?.id).toBe(id);
      playActs(g, acts.slice(-1));
      expect(g.state.served).toBe(1);
      expect(g.state.mistakes).toBe(0);
      expect(g.state.tickets).toHaveLength(0);
    });
  }

  it('温め途中のパックでは作れない（焼く前のスープ皿は空のまま）', () => {
    const g = cookGame([ticket(1, 'zuppa')]);
    playActs(g, [vessel('soupBowl'), frame(0), stock('zuppa'), cookHotWater(0), { wait: cfg.zuppaWarmTime - 1 }, cookHotWater(0)]);
    expect(g.planInteract(frame(0))).toBeNull();
    expect(frameDish(g).loaded).toBeUndefined();
  });

  it('冷蔵庫のコーンスープ（ヒート）は、1台目の湯煎器を使う既存の手順のまま', () => {
    // 既存の決まりが変わっていないことの確認（コーンスープは皿の品。冷蔵庫から取って温め、スープ皿へ）
    const g = new Game(cfg, () => 0);
    g.start('leading', 'heat');
    g.state.nextTicketAt = Infinity;
    g.rightClick({ kind: 'fridgeDoor' });
    g.interact(fridgeStock('cornSoup'));
    g.interact(hotWater(0));
    expect(g.state.hotWater[0]?.id).toBe('cornSoup');
  });
});
