import { describe, expect, it } from 'vitest';
import gameSource from './game.ts?raw';
import {
  BAKE_TABLE,
  BURN_RATIO,
  bakeLabel,
  bakedMenus,
  canLoad,
  canTakeBase,
  candidatesAt,
  dishName,
  dishTitle,
  flowPlan,
  serveHint,
  servableDish,
  stageRange,
  tableProblems,
  vesselCapacity,
  viewOf,
  type BakeDish,
} from './bake';
import { DEFAULT_CONFIG as cfg } from './config';
import { bakeItem, bakeTime, createOven, frontS, itemFromOven, placeDish, takeDish, updateOven } from './oven';
import { MOZZ_TOTAL } from './pizza';
import { MENU, formOf } from './recipe';
import type { BakeProgress, Item, OvenDeck } from './types';

type Dish = Extract<Item, { kind: 'bakeDish' }>;

// クック編設計書 4.1：焼き物の表と「段階焼き」

const U = cfg.ovenUpperTime;

// --- 検証用の表（段階焼きの仕組みを、後続ステップの品の形で確かめる。器はいまある2種類を借りる）---
// ハンバーグ系：U → ヘラではがす → コーン・ポテト → U。3品とも1回目は同じ中身（必要な時間も同じ）
// チキン：L → ヘラではがす → コーン・ポテト → U
// シュリンプ：9つで U（入れすぎ・足りないの確かめ）
const hamburgerStages = (extra: BakeDish['stages'][number]['load'] = []): BakeDish['stages'] => [
  { load: [{ id: 'patty', count: 1, at: 'center' }], need: 1 },
  { care: ['scrape'], load: [{ id: 'corn', count: 1, at: 'upperRight' }, { id: 'potato', count: 1, at: 'upperLeft' }, ...extra], need: 1 },
];
const TEST_TABLE: BakeDish[] = [
  { id: 'testHamburg', vessel: 'doria', stages: hamburgerStages(), finish: { base: 'geta', extras: ['demiglace', 'friedEgg'] } },
  { id: 'testItalian', vessel: 'doria', stages: hamburgerStages(), finish: { base: 'geta', extras: ['cheeseSauce'] } },
  { id: 'testDiavola', vessel: 'doria', stages: hamburgerStages(), finish: { base: 'geta', extras: ['vegetablePaste', 'friedEgg'] } },
  {
    id: 'testChicken',
    vessel: 'doria',
    stages: [
      { load: [{ id: 'chicken', count: 1 }], need: 2 },
      { care: ['scrape'], load: [{ id: 'corn', count: 1 }, { id: 'potato', count: 1 }], need: 1 },
    ],
    finish: { base: 'geta' },
  },
  { id: 'testShrimp', vessel: 'pizza', stages: [{ load: [{ id: 'shrimp', count: 9 }], need: 1 }], finish: { base: 'geta' } },
];

const dish = (progress: BakeProgress, cooked = 0, style: Dish['style'] = 'doria'): Dish => bakeItem(style, cooked, cfg, undefined, progress, TEST_TABLE);

// 実際のベルトに流して、出口まで進めて取る（表は検証用）
function runBelt(item: Dish, deck: OvenDeck, table: readonly BakeDish[] = TEST_TABLE): Dish {
  const plan = flowPlan(item, table);
  if (!plan.ok) throw new Error(plan.reason);
  const oven = createOven();
  expect(placeDish(oven, deck, item.style, { x: 0, s: frontS(item.style) }, plan.cooked, item.pizza, { ...item, stage: plan.stage })).toBe(true);
  for (let t = 0; t < bakeTime(deck, cfg) + 1; t++) updateOven(oven, 1, cfg);
  const taken = takeDish(oven, deck, 1) ?? takeDish(oven, deck, 0);
  if (!taken) throw new Error('not emerged');
  return itemFromOven(taken, deck, cfg, table);
}

describe('表（BAKE_TABLE）の中身', () => {
  it('既存の2品が、同じ値で載っている（ドリア = 1段階・L、ピザ = 1段階・U）', () => {
    expect(BAKE_TABLE.map((d) => [d.id, d.vessel, d.stages.map((s) => s.need), d.finish.base])).toEqual([
      ['milanoDoria', 'doria', [cfg.ovenLowerTime / U], 'geta'],
      ['buffaloPizza', 'pizza', [1], 'pizzaPlate'],
    ]);
    expect(stageRange(BAKE_TABLE[1], 0).max).toEqual({ dough: 1, pizzaSauce: 1, pizzaCheese: 1, mozzarella: MOZZ_TOTAL });
  });

  it('焼き物の品（form = bake）と、表の行が1対1。メニューの形は「皿」と「焼き物」の2種類だけ', () => {
    expect(bakedMenus().map((m) => m.id).sort()).toEqual(BAKE_TABLE.map((d) => d.id).sort());
    for (const m of MENU) expect(['plate', 'bake']).toContain(formOf(m));
    for (const m of bakedMenus()) expect(m.station).toBe('cook');
  });

  it('下段は上段の2倍（表の L = U × 2 が、そのまま下段1周になる）', () => {
    expect(cfg.ovenLowerTime).toBe(cfg.ovenUpperTime * 2);
  });
});

describe('表の整合性（tableProblems）', () => {
  it('BAKE_TABLE と検証用の表は、どの決まりも守っている', () => {
    expect(tableProblems()).toEqual([]);
    expect(tableProblems(TEST_TABLE)).toEqual([]);
  });

  it('① 同じ器・同じ中身・同じ段階で当てはまる品どうしは、必要な時間が同じ（違うと見つかる）', () => {
    const broken = TEST_TABLE.map((d) => (d.id === 'testItalian' ? { ...d, stages: [{ ...d.stages[0], need: 2 }, d.stages[1]] } : d));
    expect(tableProblems(broken).some((p) => p.startsWith('①'))).toBe(true);
  });

  it('② 必要な時間は U の整数倍（1.5 や 0 は見つかる）', () => {
    for (const need of [1.5, 0]) {
      const broken: BakeDish[] = [{ id: 'x', vessel: 'doria', stages: [{ load: [{ id: 'corn', count: 1 }], need }], finish: { base: 'geta' } }];
      expect(tableProblems(broken).some((p) => p.startsWith('②'))).toBe(true);
    }
  });

  it('③ ある品の流す前の中身が、同じ器の別の品の途中の中身と区別できる（同じだと見つかる）', () => {
    // パティ・コーン・ポテトをのせて1回目に流す品があると、ハンバーグの2回目と見分けられない
    const broken: BakeDish[] = [
      ...TEST_TABLE,
      { id: 'x', vessel: 'doria', stages: [{ load: [{ id: 'patty', count: 1 }, { id: 'corn', count: 1 }, { id: 'potato', count: 1 }], need: 1 }], finish: { base: 'geta' } },
    ];
    expect(tableProblems(broken).some((p) => p.startsWith('③'))).toBe(true);
    // 器が違えば区別できる
    expect(tableProblems([...TEST_TABLE, { ...broken[broken.length - 1], vessel: 'pizza' }]).filter((p) => p.startsWith('③'))).toEqual([]);
  });

  it('⑤ 段階・仕上げがまったく同じ品が2つあると見つかる（提供のときに区別できない）', () => {
    expect(tableProblems([...TEST_TABLE, { ...TEST_TABLE[0], id: 'copy' }]).some((p) => p.startsWith('⑤'))).toBe(true);
  });
});

describe('段階焼き（検証用の表）', () => {
  it('ハンバーグ：上段1周 → ヘラではがす → コーン・ポテト → 上段1周 で焼き上がり、下駄・仕上げをそろえると提供できる', () => {
    let d = dish({ loaded: { patty: 1 } });
    expect(flowPlan(d, TEST_TABLE)).toMatchObject({ ok: true, stage: 0, cooked: 0 });
    d = runBelt(d, 'upper');
    expect(d).toMatchObject({ cooked: U, state: 'baked' });
    expect(d.stage ?? 0).toBe(0); // 1回目（段階の番号は、0 の間は持たない）
    expect(bakeLabel(d, TEST_TABLE)).toContain('1回目 焼き上がり → ヘラではがす');

    // はがす前・付け合わせの前は流せない（理由が出る）
    expect(flowPlan(d, TEST_TABLE)).toEqual({ ok: false, reason: 'ヘラではがしてから流す' });
    d = { ...d, cares: ['scrape'] };
    expect(flowPlan(d, TEST_TABLE)).toMatchObject({ ok: false, reason: expect.stringContaining('コーン') });
    d = { ...d, loaded: { patty: 1, corn: 1, potato: 1 } };
    // 2回目は、秒数を 0 に戻して流す
    expect(flowPlan(d, TEST_TABLE)).toMatchObject({ ok: true, stage: 1, cooked: 0 });
    d = runBelt(d, 'upper');
    expect(d).toMatchObject({ stage: 1, cooked: U, state: 'baked' });
    expect(flowPlan(d, TEST_TABLE)).toEqual({ ok: false, reason: 'もう焼けている（入口には流せない）' });

    // 下駄に乗せ、仕上げで品が決まる（3品とも中身は同じ）
    expect(canTakeBase(d, 'geta', TEST_TABLE)).toBe(true);
    expect(canTakeBase(d, 'pizzaPlate', TEST_TABLE)).toBe(false);
    expect(serveHint(d, TEST_TABLE)).toContain('下駄に乗せてから');
    const onGeta: Dish = { ...d, geta: true };
    expect(servableDish(onGeta, TEST_TABLE)).toBeNull();
    expect(serveHint(onGeta, TEST_TABLE)).toContain('仕上げが足りない');
    expect(servableDish({ ...onGeta, finishes: ['demiglace', 'friedEgg'] }, TEST_TABLE)?.id).toBe('testHamburg');
    expect(servableDish({ ...onGeta, finishes: ['cheeseSauce'] }, TEST_TABLE)?.id).toBe('testItalian');
    expect(servableDish({ ...onGeta, finishes: ['friedEgg', 'vegetablePaste'] }, TEST_TABLE)?.id).toBe('testDiavola');
    expect(servableDish({ ...onGeta, finishes: ['demiglace'] }, TEST_TABLE)).toBeNull();
  });

  it('ハンバーグの1回目を下段に流すと、必要な時間の1.25倍を超えて焦げる。焦げはどの段階でも流せない', () => {
    const burnt = runBelt(dish({ loaded: { patty: 1 } }), 'lower');
    expect(cfg.ovenLowerTime).toBeGreaterThan(U * BURN_RATIO);
    expect(burnt.state).toBe('burnt');
    expect(flowPlan(burnt, TEST_TABLE)).toMatchObject({ ok: false, reason: expect.stringContaining('焦げ') });

    // 2回目を下段に流しても焦げる
    let d = runBelt(dish({ loaded: { patty: 1 } }), 'upper');
    d = runBelt({ ...d, cares: ['scrape'], loaded: { patty: 1, corn: 1, potato: 1 } }, 'lower');
    expect(d).toMatchObject({ stage: 1, state: 'burnt' });
    expect(flowPlan(d, TEST_TABLE).ok).toBe(false);
  });

  it('チキン：1回目は L。上段2周でも焼き上がる（生焼けで取り出して、もう一度流すと秒数は合計）', () => {
    let d = runBelt(dish({ loaded: { chicken: 1 } }), 'upper');
    expect(d).toMatchObject({ cooked: U, state: 'half' });
    expect(flowPlan(d, TEST_TABLE)).toMatchObject({ ok: true, stage: 0, cooked: U });
    d = runBelt(d, 'upper');
    expect(d).toMatchObject({ cooked: U * 2, state: 'baked' });
    expect(runBelt(dish({ loaded: { chicken: 1 } }), 'lower')).toMatchObject({ state: 'baked' });
    // 2回目は U
    d = runBelt({ ...d, cares: ['scrape'], loaded: { chicken: 1, corn: 1, potato: 1 } }, 'upper');
    expect(d).toMatchObject({ stage: 1, cooked: U, state: 'baked' });
    expect(servableDish({ ...d, geta: true }, TEST_TABLE)?.id).toBe('testChicken');
  });

  it('当てはまる品が複数あり、必要な時間が同じなら、そのまま流せる（案内に品名と何回目かが出る）', () => {
    const plan = flowPlan(dish({ loaded: { patty: 1 } }), TEST_TABLE);
    expect(plan.ok && plan.dishes.map((d) => d.id)).toEqual(['testHamburg', 'testItalian', 'testDiavola']);
    expect(plan.ok && dishTitle(plan.dishes, plan.stage)).toBe('testHamburgなど3品 1回目');
  });

  it('当てはまる品がない中身は流せず、「この中身の料理はない」と出る', () => {
    expect(flowPlan(dish({ loaded: { sausage: 1 } }), TEST_TABLE)).toEqual({ ok: false, reason: 'この中身の料理はない（流せない）' });
    expect(flowPlan(dish({ loaded: { patty: 1, chicken: 1 } }), TEST_TABLE)).toEqual({ ok: false, reason: 'この中身の料理はない（流せない）' });
  });

  it('入れすぎの防止：器には、その器を使うどの品よりも多くは入らない。足りないときは流せない', () => {
    expect(vesselCapacity('pizza', 'shrimp', TEST_TABLE)).toBe(9);
    const v = (n: number) => viewOf({ style: 'pizza', pizza: { dough: false, sauce: false, cheese: false, mozz: 0 }, loaded: { shrimp: n } });
    expect(canLoad(v(8), 'shrimp', TEST_TABLE)).toBe(true);
    expect(canLoad(v(9), 'shrimp', TEST_TABLE)).toBe(false); // 10個目は入らない
    const pad = (n: number): Dish => bakeItem('pizza', 0, cfg, { dough: false, sauce: false, cheese: false, mozz: 0 }, { loaded: { shrimp: n } }, TEST_TABLE);
    expect(flowPlan(pad(8), TEST_TABLE)).toEqual({ ok: false, reason: 'シュリンプをのせてから流す' });
    expect(flowPlan(pad(9), TEST_TABLE).ok).toBe(true);
    // 本物の表：ピザの鉄板のモッツァレラは6つまで（pizza.ts の決まりと同じ）
    expect(vesselCapacity('pizza', 'mozzarella')).toBe(MOZZ_TOTAL);
    expect(vesselCapacity('doria', 'mozzarella')).toBe(0);
  });

  it('同じ中身でも、段階の番号で区別する（1回目に流す前の皿と、2回目の皿は別の品の段階に当てはまらない）', () => {
    const second = viewOf({ style: 'doria', loaded: { patty: 1, corn: 1, potato: 1 }, cares: ['scrape'], stage: 1 });
    expect(candidatesAt(second, 0, TEST_TABLE)).toEqual([]);
    expect(candidatesAt(second, 1, TEST_TABLE).map((d) => d.id)).toEqual(['testHamburg', 'testItalian', 'testDiavola']);
  });
});

describe('既存の2品：表から引いた案内と判定', () => {
  it('入口の案内に、品名と結果が出る', () => {
    const plan = flowPlan(bakeItem('doria', 0, cfg));
    expect(plan.ok && dishTitle(plan.dishes, plan.stage)).toBe('ミラノドリア');
    expect(bakeLabel(bakeItem('doria', U, cfg))).toBe('ミラノドリア 生焼け');
    expect(bakeLabel(bakeItem('pizza', U, cfg, { dough: true, sauce: true, cheese: true, mozz: MOZZ_TOTAL }))).toBe('バッファローピザ 焼き上がり');
  });

  it('生地のない鉄板は流せない（理由に「生地」が出る）', () => {
    expect(flowPlan(bakeItem('pizza', 0, cfg, { dough: false, sauce: false, cheese: false, mozz: 0 }))).toEqual({ ok: false, reason: 'ピザ生地をのせてから流す' });
  });

  it('材料が足りないピザも焼けるが（既存の決まり）、お皿に入れても提供できない', () => {
    const p = { dough: true, sauce: true, cheese: true, mozz: 3 };
    expect(flowPlan(bakeItem('pizza', 0, cfg, p)).ok).toBe(true);
    expect(servableDish({ kind: 'pizzaPlate', dish: { pizza: p, state: 'baked' } })).toBeNull();
    expect(serveHint({ kind: 'pizzaPlate', dish: { pizza: p, state: 'baked' } })).toBe('バッファローピザの材料がそろっていない（モッツァレラあと3つ）');
  });

  it('出口のラベル：ベルトの上の皿を、品名・焼け具合で出す', () => {
    const oven = createOven();
    placeDish(oven, 'lower', 'doria', { x: 0, s: frontS('doria') });
    for (let t = 0; t < cfg.ovenLowerTime + 1; t++) updateOven(oven, 1, cfg);
    expect(bakeLabel(itemFromOven(oven.decks.lower[0], 'lower', cfg))).toBe('ミラノドリア 焼き上がり');
  });
});

describe('game.ts に品の名前で分ける分岐がない', () => {
  it('焼き物の品の id・品名が game.ts に出てこない（品は表を1行足すだけで増える）', () => {
    for (const d of BAKE_TABLE) {
      expect(gameSource).not.toContain(d.id);
      expect(gameSource).not.toContain(dishName(d.id));
    }
  });
});
