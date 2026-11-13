import { describe, expect, it } from 'vitest';
import { flowPlan, getBakeDish } from './bake';
import { DEFAULT_CONFIG as cfg } from './config';
import { Game } from './game';
import {
  BAKE_DISHES,
  BAKE_SERIES,
  BOARD,
  BOTTLE_HOME,
  COOK_SIDE_STACKS,
  GETA,
  GETA_HOME,
  OVEN_COUNTER,
  OVEN_COUNTER_SHELF,
  OVEN_COUNTER_ZS,
  OVEN_COUNTER_ROW,
  PIZZA_PLATE_R,
  PIZZA_PLATE_STACK,
  PREP_FIXTURES,
  SHELF_STACKS,
  SURFACES,
  WORK_FRAMES,
  overlapsLeftFixture,
  shelfStackSpot,
} from './layout';
import { BAKE_STYLES, SLOT_OFFSETS, bakeItem, createOven, endS, frontS, isEmerged, placeDish, takeDish, updateOven, laneOfOffset } from './oven';
import type { BakeStyle, Item, Target } from './types';

// クック編設計書 4.2（C2）：器の追加と作業枠

const NEW_STYLES: BakeStyle[] = ['bakingPad', 'largePad', 'hamburgPan', 'eggPan', 'soupBowl'];

const newGame = () => {
  const g = new Game(cfg, () => 0);
  g.startPractice();
  g.state.nextTicketAt = Infinity;
  return g;
};

function run(oven: ReturnType<typeof createOven>, total: number, dt = 0.05) {
  for (let t = 0; t < total - 1e-9; t += dt) updateOven(oven, Math.min(dt, total - t), cfg);
}

const frame = (index: number): Target => ({ kind: 'workFrame', index });
const vesselStack = (style: BakeStyle): Target => ({ kind: 'vesselStack', style });

describe('器の寸法は「3列系」と「2列系」の2通りだけ', () => {
  it('7種類の器があり、どれも、どちらかの系統の寸法そのまま', () => {
    expect([...BAKE_STYLES].sort()).toEqual(['bakingPad', 'doria', 'eggPan', 'hamburgPan', 'largePad', 'pizza', 'soupBowl']);
    for (const style of BAKE_STYLES) {
      const d = BAKE_DISHES[style];
      expect(Object.keys(BAKE_SERIES)).toContain(d.series);
      expect({ w: d.w, d: d.d }).toEqual(BAKE_SERIES[d.series]);
    }
  });

  it('系統は設計書 4.2 の表のとおり（焼成パッド・鉄板・スープ皿は3列系、大きめの焼成パッドは2列系）', () => {
    const series = Object.fromEntries(BAKE_STYLES.map((s) => [s, BAKE_DISHES[s].series]));
    expect(series).toEqual({ doria: 'three', pizza: 'two', bakingPad: 'three', largePad: 'two', hamburgPan: 'three', eggPan: 'three', soupBowl: 'three' });
  });

  it('横の置き場は系統で決まる：3列系は3つ、2列系は2つ（同じ系統の器は、同じ置き場）', () => {
    for (const style of BAKE_STYLES) {
      const same = BAKE_STYLES.filter((s) => BAKE_DISHES[s].series === BAKE_DISHES[style].series);
      for (const other of same) expect(SLOT_OFFSETS[style]).toEqual(SLOT_OFFSETS[other]);
      expect(SLOT_OFFSETS[style]).toHaveLength(BAKE_DISHES[style].series === 'three' ? 3 : 2);
    }
  });
});

describe('7種類の器を、入口に置いて流し、出口で取れる', () => {
  for (const style of BAKE_STYLES) {
    it(`${BAKE_DISHES[style].name}：入口に置くと流れて、出口で取れる`, () => {
      const oven = createOven();
      expect(placeDish(oven, 'upper', style, { x: 0, s: frontS(style) })).toBe(true);
      run(oven, cfg.ovenUpperTime * 2); // 出てきたあと、出口の突き当たりまで流れる
      const d = oven.decks.upper[0];
      expect(isEmerged(d)).toBe(true);
      expect(d.s).toBeCloseTo(endS(style));
      const taken = takeDish(oven, 'upper', laneOfOffset(d.x));
      expect(taken?.style).toBe(style);
      expect(oven.decks.upper).toHaveLength(0);
    });
  }

  it('普通の焼成パッドは横に3つ、大きめの焼成パッドは横に2つ並ぶ（それ以上は横に置けない）', () => {
    for (const [style, n] of [['bakingPad', 3], ['largePad', 2]] as const) {
      const oven = createOven();
      for (const x of SLOT_OFFSETS[style]) expect(placeDish(oven, 'lower', style, { x, s: frontS(style) })).toBe(true);
      expect(oven.decks.lower).toHaveLength(n);
      for (const x of SLOT_OFFSETS[style]) expect(placeDish(oven, 'lower', style, { x, s: frontS(style) })).toBe(false);
      run(oven, cfg.ovenLowerTime + 2);
      expect(oven.decks.lower.every(isEmerged)).toBe(true); // 横に並んだまま、全部が出口に出てくる
    }
  });

  it('2列系と3列系の器が同じ段に混ざっても、外接する長方形で重なりを調べ、順に流れて取れる', () => {
    const oven = createOven();
    expect(placeDish(oven, 'upper', 'largePad', { x: SLOT_OFFSETS.largePad[0], s: frontS('largePad') })).toBe(true);
    expect(placeDish(oven, 'upper', 'bakingPad', { x: SLOT_OFFSETS.bakingPad[0], s: frontS('bakingPad') })).toBe(false); // 左の列に重なる
    expect(placeDish(oven, 'upper', 'soupBowl', { x: SLOT_OFFSETS.soupBowl[2], s: frontS('soupBowl') })).toBe(true); // 右の列は空いている
    run(oven, cfg.ovenUpperTime + 2);
    expect(oven.decks.upper.every(isEmerged)).toBe(true);
    expect(takeDish(oven, 'upper', 0)?.style).toBe('largePad');
    expect(takeDish(oven, 'upper', 2)?.style).toBe('soupBowl');
  });
});

describe('棚の割り当て（具材台の下、2段 × 2山 × 3台 = 12か所）', () => {
  it('置き場は重ならず、1台目 = ドリア4品、2台目 = 空のドリア皿・焼成パッド・大きめの焼成パッド・鉄のスープ皿、3台目 = 鉄板2種（空き2か所）', () => {
    const keys = SHELF_STACKS.map((s) => `${s.counter}-${s.tier}-${s.slot}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of SHELF_STACKS) {
      expect(s.counter).toBeLessThan(OVEN_COUNTER_ZS.length);
      expect(s.slot).toBeLessThan(OVEN_COUNTER_SHELF.stacksPerTier);
    }
    const on = (c: number) => SHELF_STACKS.filter((s) => s.counter === c);
    expect(on(0).map((s) => s.dish).sort()).toEqual(['cheeseMilanoDoria', 'milanoDoria', 'tarakoDoria', 'tarakoGratin']);
    expect(on(0).every((s) => s.style === 'doria')).toBe(true);
    expect(on(1).map((s) => s.style).sort()).toEqual(['bakingPad', 'doria', 'largePad', 'soupBowl']);
    expect(on(1).every((s) => s.dish === undefined)).toBe(true);
    expect(on(2).map((s) => s.style).sort()).toEqual(['eggPan', 'hamburgPan']);
    expect(SHELF_STACKS.every((s) => s.label.length > 0)).toBe(true); // 棚の山には品名のラベル
    expect(SHELF_STACKS[0].dish).toBe('milanoDoria'); // チュートリアルの矢印が先に見つける山
  });

  it('山は手前（部屋の中央側）の端に寄せてあり、棚の広さと高さに収まる', () => {
    for (const s of SHELF_STACKS) {
      const at = shelfStackSpot(s.style, s.slot);
      const size = BAKE_DISHES[s.style];
      expect(at.xr + size.d / 2).toBeLessThanOrEqual(OVEN_COUNTER.width / 2); // 開いている面からはみ出さない
      expect(at.xr + size.d / 2).toBeGreaterThan(OVEN_COUNTER.width / 2 - 0.05); // 端に寄せる
      expect(Math.abs(at.zr) + size.w / 2).toBeLessThanOrEqual(OVEN_COUNTER.depth / 2);
      const ceiling = [OVEN_COUNTER_SHELF.shelfTopY[1] - OVEN_COUNTER_SHELF.boardThickness, 0.9 - OVEN_COUNTER_SHELF.topThickness][s.tier];
      expect(OVEN_COUNTER_SHELF.shelfTopY[s.tier] + OVEN_COUNTER_SHELF.stackHeight * size.h).toBeLessThanOrEqual(ceiling + 1e-9);
    }
  });

  it('空の器の山から取ると、その種類の空の器。同じ空の器を持っていれば戻せる', () => {
    for (const style of ['doria', ...NEW_STYLES] as BakeStyle[]) {
      const g = newGame();
      g.interact(vesselStack(style));
      expect(g.state.hand).toEqual({ kind: 'bakeDish', style, cooked: 0, state: 'raw', blank: true });
      expect(g.ovenHint(vesselStack(style))).toContain('戻す');
      g.interact(vesselStack(style));
      expect(g.state.hand).toBeNull();
    }
  });

  it('空のドリア皿は、ミラノドリア（中身の入った山から取る品）にはならず、流せない', () => {
    const g = newGame();
    g.interact(vesselStack('doria'));
    const plan = flowPlan(g.state.hand as Extract<Item, { kind: 'bakeDish' }>);
    expect(plan.ok).toBe(false);
    expect(g.planInteract({ kind: 'ovenInlet', deck: 'lower', x: 0, s: frontS('doria') })).toBeNull();
    // ミラノドリアの山から取った皿は、いままでどおり流せる
    const h = newGame();
    h.interact({ kind: 'ovenStock', style: 'doria', dish: 'milanoDoria' });
    expect(h.state.hand).toEqual(bakeItem('doria', 0, cfg));
    expect(h.planInteract({ kind: 'ovenInlet', deck: 'lower', x: 0, s: frontS('doria') })).not.toBeNull();
  });

  it('品がまだ表にないドリアの山は、ラベルは出るが取れない（品を表に足すと取れる）', () => {
    for (const s of SHELF_STACKS.filter((x) => x.dish && !getBakeDish(x.dish))) {
      const g = newGame();
      const t: Target = { kind: 'ovenStock', style: s.style, dish: s.dish };
      expect(g.planInteract(t)).toBeNull();
      expect(g.ovenHint(t)).toContain(s.label);
    }
  });
});

describe('作業枠（1台目の具材台の、部屋の中央側の縁に3つ）', () => {
  const frameCenters = WORK_FRAMES.slots.map((f) => ({ x: OVEN_COUNTER.x + f.xr, z: OVEN_COUNTER_ZS[WORK_FRAMES.counter] + f.zr }));

  it('枠は3つ。器の長い辺を左右（x）に向けた大きさで、1台目の天板の部屋の中央側の縁に、重ならずに並ぶ', () => {
    expect(WORK_FRAMES.slots).toHaveLength(3);
    expect(WORK_FRAMES.w).toBeGreaterThan(WORK_FRAMES.d);
    expect(WORK_FRAMES.w).toBeGreaterThanOrEqual(Math.max(GETA.w, BOARD.w, BAKE_SERIES.three.w));
    expect(WORK_FRAMES.d).toBeGreaterThanOrEqual(Math.max(GETA.d, BOARD.d, BAKE_SERIES.three.d));
    for (const f of WORK_FRAMES.slots) {
      expect(f.xr + WORK_FRAMES.w / 2).toBeLessThanOrEqual(OVEN_COUNTER.width / 2);
      expect(f.xr + WORK_FRAMES.w / 2).toBeGreaterThan(OVEN_COUNTER.width / 2 - 0.05); // 縁に寄せる
      expect(Math.abs(f.zr) + WORK_FRAMES.d / 2).toBeLessThanOrEqual(OVEN_COUNTER.depth / 2); // 1台目の中
    }
    const zs = WORK_FRAMES.slots.map((f) => f.zr).sort((a, b) => a - b);
    zs.slice(1).forEach((z, i) => expect(z - zs[i]).toBeGreaterThanOrEqual(WORK_FRAMES.d));
  });

  it('作業枠は PREP_FIXTURES に登録してあり、ピザの置き物とは重ならない', () => {
    const rel = WORK_FRAMES.slots.map((f) => ({ x: f.xr, z: OVEN_COUNTER_ZS[WORK_FRAMES.counter] - OVEN_COUNTER_ROW.z + f.zr }));
    for (const r of rel) expect(PREP_FIXTURES.some((p) => Math.abs(p.x - r.x) < 1e-9 && Math.abs(p.z - r.z) < 1e-9)).toBe(true);
    const others = PREP_FIXTURES.filter((p) => !rel.some((r) => Math.abs(p.x - r.x) < 1e-9 && Math.abs(p.z - r.z) < 1e-9));
    for (const r of rel) {
      for (const o of others) {
        const overlap = Math.abs(o.x - r.x) < o.hx + WORK_FRAMES.w / 2 && Math.abs(o.z - r.z) < o.hz + WORK_FRAMES.d / 2;
        expect(overlap).toBe(false);
      }
    }
    // 作業台の天板の上で、ピザのお皿・鉄板の山を、枠の上には置けない
    const g = newGame();
    g.state.hand = { kind: 'pizzaPlate' };
    expect(g.previewProp({ kind: 'tableTop', surface: 'prep', x: rel[1].x, z: rel[1].z })).toMatchObject({ valid: false, reason: 'gap' });
  });

  it('具材台の前の1か所に立てば、3つすべてに手が届く（初期位置から具材台の前まで歩いて、その一歩の場所から狙える）', () => {
    const stand = { x: OVEN_COUNTER.x + OVEN_COUNTER.width / 2 + 0.5, y: 1.6, z: OVEN_COUNTER_ZS[WORK_FRAMES.counter] };
    for (const c of frameCenters) expect(Math.hypot(c.x - stand.x, 0.9 - stand.y, c.z - stand.z)).toBeLessThan(cfg.reach);
  });

  it('作業枠には、3列系の器・下駄・板・小皿を置けて、持ち上げられる', () => {
    const things: Item[] = [
      ...(['doria', 'bakingPad', 'hamburgPan', 'eggPan', 'soupBowl'] as BakeStyle[]).map((style) => bakeItem(style, 0, cfg, undefined, { blank: true })),
      { kind: 'geta' },
      { kind: 'board' },
      { kind: 'plate', contents: [], style: 'small' },
    ];
    for (const item of things) {
      const g = newGame();
      expect(g.state.workFrames).toEqual([null, null, null]);
      for (let i = 0; i < 3; i++) {
        g.state.hand = item;
        expect(g.getaHint(frame(i))).toContain('作業枠に置く');
        g.interact(frame(i));
        expect(g.state.hand).toBeNull();
        expect(g.state.workFrames[i]).toEqual(item);
      }
      g.interact(frame(1));
      expect(g.state.hand).toEqual(item);
      expect(g.state.workFrames[1]).toBeNull();
    }
  });

  it('2列系の器（大きめの焼成パッド・ピザの鉄板）・ふつうの皿は、作業枠に置けない。使用中の枠にも置けない', () => {
    const g = newGame();
    for (const item of [bakeItem('largePad', 0, cfg, undefined, { blank: true }), bakeItem('pizza', 0, cfg), { kind: 'plate', contents: [] } as Item]) {
      g.state.hand = item;
      expect(g.planInteract(frame(0))).toBeNull();
    }
    g.state.hand = { kind: 'geta' };
    g.interact(frame(0));
    g.state.hand = { kind: 'board' };
    expect(g.planInteract(frame(0))).toBeNull();
    expect(g.getaHint(frame(0))).toContain('使用中');
  });

  it('作業枠の下駄に、焼き上がったドリアを乗せられる（逆に、枠のドリアに下駄を持って乗せてもよい）。生焼けは乗せられない', () => {
    const baked = bakeItem('doria', cfg.ovenLowerTime, cfg);
    const g = newGame();
    g.state.hand = { kind: 'geta' };
    g.interact(frame(0));
    g.state.hand = bakeItem('doria', cfg.ovenUpperTime, cfg); // 生焼け
    expect(g.planInteract(frame(0))).toBeNull();
    g.state.hand = baked;
    expect(g.getaHint(frame(0))).toContain('下駄に乗せる');
    g.interact(frame(0));
    expect(g.state.hand).toBeNull();
    expect(g.state.workFrames[0]).toEqual({ ...baked, geta: true });
    g.interact(frame(0)); // 持ち上げて、そのまま提供できる形
    expect(g.state.hand).toEqual({ ...baked, geta: true });

    const h = newGame();
    h.state.hand = baked;
    h.interact(frame(2));
    h.state.hand = { kind: 'geta' };
    h.interact(frame(2));
    expect(h.state.workFrames[2]).toEqual({ ...baked, geta: true });
    // 板は、ドリアの受け台ではない
    const k = newGame();
    k.state.hand = baked;
    k.interact(frame(1));
    k.state.hand = { kind: 'board' };
    expect(k.planInteract(frame(1))).toBeNull();
  });
});

describe('2列系の器はピザの組み立て台に置く', () => {
  it('大きめの焼成パッドを組み立て台に置いて、持ち上げられる（ピザ生地・具はのせられない）', () => {
    const g = newGame();
    g.interact(vesselStack('largePad'));
    const pad = g.state.hand;
    g.interact({ kind: 'pizzaSlot', index: 0 });
    expect(g.state.pizzaSlots[0]).toEqual(pad);
    g.state.hand = { kind: 'pizzaDough' };
    expect(g.planInteract({ kind: 'pizzaSlot', index: 0 })).toBeNull();
    g.state.hand = { kind: 'pizzaTopping', id: 'sauce' };
    expect(g.planInteract({ kind: 'pizzaSlot', index: 0 })).toBeNull();
    g.state.hand = null;
    g.interact({ kind: 'pizzaSlot', index: 0 });
    expect(g.state.hand).toEqual(pad);
  });

  it('3列系の器は、組み立て台に置けない', () => {
    const g = newGame();
    g.interact(vesselStack('bakingPad'));
    expect(g.planInteract({ kind: 'pizzaSlot', index: 0 })).toBeNull();
  });
});

describe('板・小皿の山（左の台の、提供台より壁側）', () => {
  it('板の山から板を取って戻せる。小皿の山から小皿を取れる', () => {
    const g = newGame();
    g.interact({ kind: 'boardStack' });
    expect(g.state.hand).toEqual({ kind: 'board' });
    g.interact({ kind: 'boardStack' });
    expect(g.state.hand).toBeNull();
    g.interact({ kind: 'plateStack', style: 'small' });
    expect(g.state.hand).toEqual({ kind: 'plate', contents: [], style: 'small' });
  });

  it('山は、左の台の提供台より壁側にあり、下駄の山・ピザのお皿の山・ボトルの最初の置き場に重ならない', () => {
    const { board, small } = COOK_SIDE_STACKS;
    for (const s of [board, small]) {
      expect(s.surface).toBe('left');
      expect(Math.abs(s.x)).toBeLessThan(SURFACES.left.width / 2);
    }
    expect(Math.abs(board.x) + BOARD.w / 2).toBeLessThanOrEqual(SURFACES.left.width / 2);
    expect(board.z + BOARD.d / 2).toBeLessThanOrEqual(SURFACES.left.depth / 2);
    expect(Math.abs(small.x) + small.r).toBeLessThanOrEqual(SURFACES.left.width / 2);
    expect(overlapsLeftFixture(GETA_HOME.x, GETA_HOME.z, GETA.d / 2, GETA.w / 2)).toBe(false);
    expect(overlapsLeftFixture(PIZZA_PLATE_STACK.x, PIZZA_PLATE_STACK.z, PIZZA_PLATE_R, PIZZA_PLATE_R, true)).toBe(false);
    for (const b of Object.values(BOTTLE_HOME).filter((b) => b.surface === 'left')) expect(overlapsLeftFixture(b.x, b.z, 0.06, 0.06, true)).toBe(false);
  });

  it('板・小皿の山の上には、ピザのお皿・下駄の山を置けない', () => {
    const { board, small } = COOK_SIDE_STACKS;
    const g = newGame();
    g.state.hand = { kind: 'pizzaPlate' };
    expect(g.previewProp({ kind: 'tableTop', surface: 'left', x: board.x, z: board.z })).toMatchObject({ valid: false, reason: 'gap' });
    expect(g.previewProp({ kind: 'tableTop', surface: 'left', x: small.x, z: small.z })).toMatchObject({ valid: false, reason: 'gap' });
    g.state.hand = null;
    g.rightClick({ kind: 'getaStack' });
    expect(g.previewGeta({ kind: 'tableTop', surface: 'left', x: board.x, z: board.z })).toMatchObject({ valid: false });
  });
});
