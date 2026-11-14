import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BAKE_TABLE, PREP_TABLE, bakedMenus, bakeSummary, dishName, servableDish, serveHint, tableProblems, vesselCapacity, type BakeDish } from './bake';
import { DEFAULT_CONFIG as cfg } from './config';
import { COOK_BINS, COOK_BIN_IDS, FROZEN_BAGS, FROZEN_BAG_IDS, PREP_STOCKS, addToStack, binLabel, binLow, pourInto, takeFromBin } from './cookStock';
import { configFor } from './difficulty';
import { Game, describeItem } from './game';
import { COOK_BIN, COOK_BIN_SPOTS, FROZEN_SHELF, FROZEN_SHELF_SPAN, OVEN_COUNTER, OVEN_COUNTER_ROW, OVEN_COUNTER_ZS, PREP_FIXTURES, ROOM_MIN_X, frozenBagSpot } from './layout';
import { bakeItem, frontS, laneOfOffset } from './oven';
import type { Item, Target } from './types';

// クック編設計書 4.5（C5）：冷凍の袋・重ねて持つ具・ポテトの下調理

const bag = (id: (typeof FROZEN_BAG_IDS)[number]): Target => ({ kind: 'frozenBag', id });
const bin = (id: (typeof COOK_BIN_IDS)[number]): Target => ({ kind: 'cookBin', id });
const frame = (index: number): Target => ({ kind: 'workFrame', index });
const pizzaSlot = (index: number): Target => ({ kind: 'pizzaSlot', index });
const vesselStack = (style: 'bakingPad' | 'largePad'): Target => ({ kind: 'vesselStack', style });
const lowerInlet: Target = { kind: 'ovenInlet', deck: 'lower', x: 0, s: frontS('largePad') };
const upperInlet: Target = { kind: 'ovenInlet', deck: 'upper', x: 0, s: frontS('largePad') };

function cookGame(difficulty: 'trial' | 'leading' = 'leading'): Game {
  const g = new Game(cfg, () => 0);
  g.start(difficulty, 'cook');
  g.state.nextTicketAt = Infinity;
  return g;
}
const handOf = (g: Game): Item | null => g.state.hand; // 代入のあとの型の絞り込みを避けて、いまの手を読む
const run = (g: Game, seconds: number) => {
  for (let t = 0; t < seconds; t++) g.update(1);
};
const click = (g: Game, t: Target, times = 1) => {
  for (let i = 0; i < times; i++) g.interact(t);
};

// 下段（または上段）に流して、出てきた皿を手に取る
function bakeOnce(g: Game, deck: 'lower' | 'upper'): void {
  g.interact(deck === 'lower' ? lowerInlet : upperInlet);
  expect(g.state.hand).toBeNull();
  const dish = g.state.oven.decks[deck][0];
  run(g, (deck === 'lower' ? cfg.ovenLowerTime : cfg.ovenUpperTime) + 2);
  g.interact({ kind: 'ovenOutlet', deck, lane: laneOfOffset(dish.x) });
}

describe('表と設定値', () => {
  it('袋は4種類（辛味チキン・ポップコーンシュリンプ・ポテト・チョリソー）。袋ごと持つのはポテトだけで、4回分', () => {
    expect(FROZEN_BAG_IDS.map((id) => FROZEN_BAGS[id].name)).toEqual(['辛味チキン', 'ポップコーンシュリンプ', 'ポテト', 'チョリソー']);
    expect(FROZEN_BAG_IDS.filter((id) => FROZEN_BAGS[id].whole)).toEqual(['potato']);
    expect(FROZEN_BAGS.potato.whole).toBe(4);
  });

  it('仮の値は config.ts にある（重ねて持てる上限9・パッド1つで16個・開始時16個）', () => {
    expect(cfg.loadStackMax).toBe(9);
    expect(cfg.potatoPerLargePad).toBe(16);
    expect(cfg.potatoStockStart).toBe(16);
  });

  it('下調理の表は、品の表（BAKE_TABLE）とは別。決まりを守っていて、伝票の品にはならない', () => {
    expect(BAKE_TABLE.some((d) => d.id === 'potatoPrep')).toBe(false);
    expect(tableProblems([...BAKE_TABLE, ...PREP_TABLE])).toEqual([]);
    expect(bakedMenus().some((m) => m.id === 'potatoPrep')).toBe(false);
    expect(dishName('potatoPrep')).toBe('ポテトの下調理');
    expect(bakeSummary(PREP_TABLE[0])).toBe('下段1周 → ストック容器');
    // 大きめの焼成パッドに入る冷凍ポテトは、袋の1/4（1回分）だけ
    expect(vesselCapacity('largePad', 'frozenPotato')).toBe(1);
  });

  it('トライアルは、ストックが減らない（difficulty.ts で上書き）。ほかの難易度・練習は減る', () => {
    expect(configFor(cfg, 'trial').prepStockConsume).toBe(false);
    expect(configFor(cfg, 'leading').prepStockConsume).toBe(true);
    expect(configFor(cfg, 'associate').prepStockConsume).toBe(true);
    expect(configFor(cfg, null).prepStockConsume).toBe(true);
  });
});

describe('重ねて持つ具', () => {
  it('同じ種類だけ、上限まで1つずつ重ねられる', () => {
    let hand: Item | null = null;
    for (let i = 1; i <= cfg.loadStackMax; i++) {
      hand = addToStack(hand, 'shrimp', cfg);
      expect(hand).toEqual({ kind: 'loadStack', id: 'shrimp', count: i });
    }
    expect(addToStack(hand, 'shrimp', cfg)).toBeNull(); // 上限
    expect(addToStack({ kind: 'loadStack', id: 'shrimp', count: 1 }, 'sausage', cfg)).toBeNull(); // 別の種類
    expect(addToStack({ kind: 'geta' }, 'shrimp', cfg)).toBeNull(); // 手がふさがっている
  });

  it('手持ちの表示に数が出る（「シュリンプ ×7」）', () => {
    expect(describeItem({ kind: 'loadStack', id: 'shrimp', count: 7 })).toBe('シュリンプ ×7');
    expect(describeItem({ kind: 'frozenBag', id: 'potato', left: 3 })).toContain('残り 3/4');
  });
});

describe('冷凍の袋（吊り棚）', () => {
  it('辛味チキン・シュリンプ・チョリソー：袋を左クリックするたびに1つ増える（上限9。別の種類は取れない）', () => {
    const g = cookGame();
    for (const id of ['spicyChicken', 'popcornShrimp', 'chorizo'] as const) {
      g.state.hand = null;
      click(g, bag(id), 3);
      expect(g.state.hand).toEqual({ kind: 'loadStack', id: FROZEN_BAGS[id].load, count: 3 });
      click(g, bag(id), 10);
      expect(g.state.hand).toMatchObject({ count: cfg.loadStackMax });
      expect(g.planInteract(bag(id))).toBeNull();
      expect(g.stockHint(bag(id))).toContain('これ以上は持てない');
    }
    expect(g.planInteract(bag('spicyChicken'))).toBeNull(); // チョリソーを持っている
  });

  it('ポテト：袋ごと手に取る。同じ袋を持っていれば、吊り棚に戻せる', () => {
    const g = cookGame();
    g.interact(bag('potato'));
    expect(g.state.hand).toEqual({ kind: 'frozenBag', id: 'potato', left: 4 });
    expect(g.planInteract(bag('popcornShrimp'))).toBeNull();
    g.interact(bag('potato'));
    expect(g.state.hand).toBeNull();
  });
});

describe('受け入れ条件：シュリンプ', () => {
  // シュリンプの品（ポップコーンシュリンプ）は C6 で表に入る。ここでは、このファイルの中だけで、焼成パッドにシュリンプ9つの行を足す（c3menu.test.ts と同じやり方）
  const table = BAKE_TABLE as BakeDish[];
  const row: BakeDish = { id: 'testShrimp', vessel: 'bakingPad', stages: [{ load: [{ id: 'shrimp', count: 9 }], need: 1 }], finish: { base: 'geta' } };

  it('表に品がないうちは、焼成パッドにシュリンプは入らない（入らない理由が出る）', () => {
    const g = cookGame();
    g.interact(vesselStack('bakingPad'));
    g.interact(frame(0));
    g.interact(bag('popcornShrimp'));
    expect(g.planInteract(frame(0))).toBeNull();
    expect(g.getaHint(frame(0))).toContain('この器には入れない');
  });

  describe('焼成パッドにシュリンプ9つの品があるとき', () => {
    beforeAll(() => {
      table.push(row);
    });
    afterAll(() => {
      table.splice(table.indexOf(row), 1);
    });

    it('シュリンプの袋を9回クリックして、焼成パッドを1回クリックすると、9つ入る', () => {
      const g = cookGame();
      g.interact(vesselStack('bakingPad'));
      g.interact(frame(0));
      click(g, bag('popcornShrimp'), 9);
      expect(describeItem(g.state.hand)).toBe('シュリンプ ×9');
      expect(g.getaHint(frame(0))).toContain('9つ入れる');
      g.interact(frame(0));
      expect(g.state.hand).toBeNull();
      expect(g.state.workFrames[0]).toMatchObject({ kind: 'bakeDish', style: 'bakingPad', loaded: { shrimp: 9 } });
      // 9つ入った焼成パッドは流せる
      g.interact(frame(0));
      expect(g.ovenHint({ kind: 'ovenInlet', deck: 'upper', x: 0, s: frontS('bakingPad') })).toContain('左クリック：ここに流す');
    });

    it('器の上限を超える分は、手に残る。いっぱいの器には入らない', () => {
      const g = cookGame();
      g.interact(vesselStack('bakingPad'));
      g.interact(frame(1));
      click(g, bag('popcornShrimp'), 5);
      g.interact(frame(1));
      click(g, bag('popcornShrimp'), 7);
      g.interact(frame(1));
      expect(g.state.workFrames[1]).toMatchObject({ loaded: { shrimp: 9 } });
      expect(g.state.hand).toEqual({ kind: 'loadStack', id: 'shrimp', count: 3 });
      expect(g.planInteract(frame(1))).toBeNull();
      expect(g.getaHint(frame(1))).toContain('もう入らない');
    });

    it('焦げた器・受け台に乗せた器・ピザの鉄板には入れない', () => {
      const stack: Item = { kind: 'loadStack', id: 'shrimp', count: 3 };
      const pad = bakeItem('bakingPad', 0, cfg, undefined, { blank: true });
      expect(pourInto(pad, stack)?.moved).toBe(3);
      expect(pourInto({ ...pad, state: 'burnt' }, stack)).toBeNull();
      expect(pourInto({ ...pad, geta: true }, stack)).toBeNull();
      expect(pourInto(bakeItem('pizza', 0, cfg), stack)).toBeNull();
    });
  });
});

describe('受け入れ条件：ポテトの下調理', () => {
  // 大きめの焼成パッドを組み立て台に置いて、手のポテトの袋から1回分入れ、パッドを取り出して数える（袋は手に戻す）
  let padsMade: Item[] = [];
  function fillPad(g: Game): void {
    const potatoBag = g.state.hand;
    g.state.hand = null;
    g.interact(vesselStack('largePad'));
    g.interact(pizzaSlot(0));
    g.state.hand = potatoBag;
    g.interact(pizzaSlot(0));
    const rest = g.state.hand;
    g.state.hand = null;
    g.interact(pizzaSlot(0)); // パッドを持ち上げる
    expect(g.state.hand).toMatchObject({ kind: 'bakeDish', style: 'largePad', loaded: { frozenPotato: 1 } });
    padsMade.push(handOf(g)!);
    g.state.hand = rest;
  }

  it('ポテトの袋1つで、大きめのパッド4つぶんになる（4回で袋が空になり、手から消える）', () => {
    const g = cookGame();
    padsMade = [];
    g.interact(bag('potato'));
    for (let i = 1; i <= 4; i++) {
      fillPad(g);
      if (i < 4) expect(g.state.hand).toEqual({ kind: 'frozenBag', id: 'potato', left: 4 - i });
    }
    expect(g.state.hand).toBeNull();
    expect(padsMade).toHaveLength(4);
  });

  it('1つのパッドには袋の1/4だけ入る（2回目は入らない）', () => {
    const g = cookGame();
    g.interact(vesselStack('largePad'));
    g.interact(pizzaSlot(0));
    g.interact(bag('potato'));
    g.interact(pizzaSlot(0));
    expect(g.state.hand).toEqual({ kind: 'frozenBag', id: 'potato', left: 3 });
    expect(g.planInteract(pizzaSlot(0))).toBeNull();
    expect(g.pizzaHint(pizzaSlot(0))).toContain('もう入らない');
  });

  it('下段を1周させて空けると、ストックが16増える（点は入らない。手には空のパッドが残り、棚に戻せる）', () => {
    const g = cookGame();
    g.interact(vesselStack('largePad'));
    g.interact(pizzaSlot(0));
    g.interact(bag('potato'));
    g.interact(pizzaSlot(0));
    g.state.hand = null;
    g.interact(pizzaSlot(0));
    expect(g.ovenHint(lowerInlet)).toContain('ポテトの下調理');
    bakeOnce(g, 'lower');
    expect(g.state.hand).toMatchObject({ kind: 'bakeDish', style: 'largePad', state: 'baked' });
    const before = g.state.prepStock.potato;
    expect(before).toBe(cfg.potatoStockStart);
    expect(g.stockHint(bin('potato'))).toContain('+16');
    g.interact(bin('potato'));
    expect(g.state.prepStock.potato).toBe(before + cfg.potatoPerLargePad);
    expect(g.state.score).toBe(0);
    expect(g.state.hand).toMatchObject({ kind: 'bakeDish', style: 'largePad', state: 'raw', blank: true });
    g.interact(vesselStack('largePad'));
    expect(g.state.hand).toBeNull();
  });

  it('空のパッドは流せない（冷凍ポテトを入れるよう案内する）', () => {
    const g = cookGame();
    g.interact(vesselStack('largePad'));
    expect(g.planInteract(lowerInlet)).toBeNull();
    expect(g.ovenHint(lowerInlet)).toContain('冷凍ポテト');
  });

  it('生焼けのパッドは、ストックに空けられない。焦げたら空けられない（捨てる）', () => {
    const g = cookGame();
    g.interact(vesselStack('largePad'));
    g.interact(pizzaSlot(0));
    g.interact(bag('potato'));
    g.interact(pizzaSlot(0));
    g.state.hand = null;
    g.interact(pizzaSlot(0));
    bakeOnce(g, 'upper'); // 上段1周 = 生焼け
    expect(g.state.hand).toMatchObject({ state: 'half' });
    expect(g.planInteract(bin('potato'))).toBeNull();
    expect(g.stockHint(bin('potato'))).toContain('生焼け');
    bakeOnce(g, 'lower'); // 合わせて上段3周ぶん = 焦げ
    expect(g.state.hand).toMatchObject({ state: 'burnt' });
    expect(g.planInteract(bin('potato'))).toBeNull();
    expect(g.stockHint(bin('potato'))).toContain('焦げ');
    g.rightClick(null);
    expect(g.state.hand).toBeNull();
    expect(g.state.prepStock.potato).toBe(cfg.potatoStockStart);
  });

  it('焼き上がったポテトのパッドは、提供台には出せない（下調理は伝票に出ない）', () => {
    const baked = bakeItem('largePad', cfg.ovenLowerTime, cfg, undefined, { blank: true, loaded: { frozenPotato: 1 } });
    expect(baked.state).toBe('baked');
    expect(servableDish(baked)).toBeNull();
    expect(serveHint(baked)).toContain('下調理は提供しない');
    const g = cookGame();
    g.state.hand = baked;
    expect(g.planInteract({ kind: 'servePass' })).toBeNull();
  });
});

describe('ポテトのストック容器（1台目の天板）', () => {
  it('ゲーム開始時は16個。左クリックで1個ずつ手に取り（重ねて持てる）、ストックが減る', () => {
    const g = cookGame();
    expect(g.state.prepStock.potato).toBe(16);
    g.interact(bin('potato'));
    g.interact(bin('potato'));
    expect(g.state.hand).toEqual({ kind: 'loadStack', id: 'potato', count: 2 });
    expect(g.state.prepStock.potato).toBe(14);
    expect(describeItem(g.state.hand)).toBe('ポテト ×2');
  });

  it('受け入れ条件：ストックが0のとき、ポテトを取れず、「ポテトがない（下調理する）」と理由が出る', () => {
    const g = cookGame();
    g.state.prepStock.potato = 0;
    expect(g.planInteract(bin('potato'))).toBeNull();
    expect(g.stockHint(bin('potato'))).toBe('ポテトがない（下調理する）');
    g.state.hand = { kind: 'loadStack', id: 'potato', count: 1 };
    expect(g.planInteract(bin('potato'))).toBeNull(); // 持っていても、足せない
    expect(takeFromBin(null, 'potato', { potato: 0 }, cfg)).toBeNull();
  });

  it('トライアルは、取ってもストックが減らない', () => {
    const g = cookGame('trial');
    click(g, bin('potato'), 5);
    expect(g.state.hand).toEqual({ kind: 'loadStack', id: 'potato', count: 5 });
    expect(g.state.prepStock.potato).toBe(cfg.potatoStockStart);
  });

  it('ラベルに残りの数を出し、4個以下で色を変える', () => {
    expect(binLabel('potato', { potato: 12 })).toBe('ポテト 12');
    expect(binLow('potato', { potato: 5 }, cfg)).toBe(false);
    expect(binLow('potato', { potato: 4 }, cfg)).toBe(true);
    expect(binLow('corn', { potato: 0 }, cfg)).toBe(false); // なくならない容器は色を変えない
  });

  it('チュートリアル・練習キッチンも、ストックが十分ある状態から始まる', () => {
    const g = new Game(cfg, () => 0);
    g.startPractice();
    expect(g.state.prepStock.potato).toBe(cfg.potatoStockStart);
    g.state.prepStock.potato = 0;
    expect(g.startTutorial('milanoDoria')).toBe(true);
    expect(g.state.prepStock.potato).toBe(cfg.potatoStockStart);
  });
});

describe('そのほかのストック（土台）', () => {
  it('コーン・パティ・チキンは、なくならない容器から1つずつ取れる。使う品がまだない容器は「準備中」で取れない', () => {
    const g = cookGame();
    for (const id of COOK_BIN_IDS) {
      g.state.hand = null;
      const def = COOK_BINS[id];
      if (def.gives) {
        click(g, bin(id), 3);
        expect(g.state.hand).toEqual({ kind: 'loadStack', id: def.gives, count: 3 });
      } else {
        expect(g.planInteract(bin(id))).toBeNull();
        expect(g.stockHint(bin(id))).toContain('準備中');
      }
    }
    expect(g.state.prepStock.potato).toBe(cfg.potatoStockStart - 3); // 数に限りがあるのは、ポテトだけ
    expect(COOK_BIN_IDS.filter((id) => COOK_BINS[id].stock)).toEqual(['potato']);
    expect(Object.keys(PREP_STOCKS)).toEqual(['potato']);
  });
});

describe('置き場所', () => {
  it('ストック容器は1台目と3台目の天板の上。作業台の置き物（PREP_FIXTURES）に登録され、天板に収まる', () => {
    for (const id of COOK_BIN_IDS) {
      const at = COOK_BIN_SPOTS[id];
      expect([0, 2]).toContain(at.counter);
      const x = at.xr;
      const z = OVEN_COUNTER_ZS[at.counter] - OVEN_COUNTER_ROW.z + at.zr;
      expect(PREP_FIXTURES.some((p) => Math.abs(p.x - x) < 1e-9 && Math.abs(p.z - z) < 1e-9)).toBe(true);
      expect(Math.abs(at.xr) + COOK_BIN.w / 2).toBeLessThanOrEqual(OVEN_COUNTER.width / 2);
      expect(Math.abs(at.zr) + COOK_BIN.d / 2).toBeLessThanOrEqual(OVEN_COUNTER.depth / 2);
    }
    expect(COOK_BIN_SPOTS.potato.counter).toBe(0);
  });

  it('ストック容器の上には、お皿・鉄板を置けない', () => {
    const g = cookGame();
    g.state.hand = { kind: 'pizzaPlate' };
    for (const id of COOK_BIN_IDS) {
      const at = COOK_BIN_SPOTS[id];
      const z = OVEN_COUNTER_ZS[at.counter] - OVEN_COUNTER_ROW.z + at.zr;
      expect(g.previewProp({ kind: 'tableTop', surface: 'prep', x: at.xr, z }), id).toMatchObject({ valid: false, reason: 'gap' });
    }
  });

  it('冷凍の袋は、左の壁の吊り棚（高さ1.45m、2台目〜3台目の上）に並ぶ', () => {
    expect(FROZEN_SHELF.y).toBe(1.45);
    const lo = OVEN_COUNTER_ZS[1] - OVEN_COUNTER.depth / 2;
    const hi = OVEN_COUNTER_ZS[2] + OVEN_COUNTER.depth / 2;
    const spots = FROZEN_BAG_IDS.map((_, i) => frozenBagSpot(i, FROZEN_BAG_IDS.length));
    for (const s of spots) {
      expect(s.y).toBe(FROZEN_SHELF.y);
      expect(s.z - FROZEN_SHELF.bag.w / 2).toBeGreaterThanOrEqual(lo);
      expect(s.z + FROZEN_SHELF.bag.w / 2).toBeLessThanOrEqual(hi);
      expect(s.x - FROZEN_SHELF.bag.d / 2).toBeGreaterThan(ROOM_MIN_X); // 壁の内側
      expect(s.x).toBeCloseTo(FROZEN_SHELF_SPAN.x);
    }
    for (let i = 1; i < spots.length; i++) expect(spots[i].z - spots[i - 1].z).toBeGreaterThan(FROZEN_SHELF.bag.w); // 重ならない
  });
});
