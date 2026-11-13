import { describe, expect, it } from 'vitest';
import rules from '../firestore.rules?raw';
import { BAKE_TABLE, bakedMenus, findBakedTicket, getBakeDish, servableDish } from './bake';
import { DEFAULT_CONFIG as cfg } from './config';
import { DIFFICULTIES, getDifficulty } from './difficulty';
import { Game } from './game';
import { PIZZA_PLATE_GUIDE } from './layout';
import { bakeItem, frontS } from './oven';
import { MOZZ_TOTAL } from './pizza';
import { POSITIONS, getPosition, menusFor, rankingBoard } from './position';
import { RANKING_BOARDS } from './ranking';
import { MENU, findMatchingTicket, formOf, getMenu, judge } from './recipe';
import { serveScore } from './score';
import { createTicket } from './tickets';
import type { Item, PizzaBuild, Position, Target, Ticket } from './types';

// 深化設計書 4.4：クックの採点接続とポジション選択

// 偏りのない（再現できる）乱数
function seeded(seed = 12345): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const ticket = (id: number, menuId: string, arrivedAt = 0): Ticket => createTicket(id, getMenu(menuId), arrivedAt);
const buffalo: PizzaBuild = { dough: true, sauce: true, cheese: true, mozz: MOZZ_TOTAL };
const doriaItem = (state: 'raw' | 'half' | 'baked' | 'burnt', geta: boolean): Item => ({ kind: 'bakeDish', style: 'doria', cooked: 0, state, ...(geta ? { geta } : {}) });

// --- 設備 ---
const pass: Target = { kind: 'servePass' };
const doriaStock: Target = { kind: 'ovenStock', style: 'doria' };
const getaStack: Target = { kind: 'getaStack' };
const lowerInlet: Target = { kind: 'ovenInlet', deck: 'lower', x: 0, s: frontS('doria') };
const upperDoriaInlet: Target = { kind: 'ovenInlet', deck: 'upper', x: 0, s: frontS('doria') };
const lowerOutlet: Target = { kind: 'ovenOutlet', deck: 'lower', lane: 1 };
const upperDoriaOutlet: Target = { kind: 'ovenOutlet', deck: 'upper', lane: 1 };
const pizzaInlet: Target = { kind: 'ovenInlet', deck: 'upper', x: 0, s: frontS('pizza') };
const pizzaOutlet: Target = { kind: 'ovenOutlet', deck: 'upper', lane: 0 };
const pizzaSlot: Target = { kind: 'pizzaSlot', index: 0 };

// クックを選んだゲーム。伝票は自動では届かないようにして、テストで並べる
function cookGame(tickets: Ticket[] = [], position: Position = 'cook'): Game {
  const g = new Game(cfg, () => 0);
  g.start('leading', position);
  g.state.nextTicketAt = Infinity;
  g.state.tickets = tickets;
  return g;
}

const run = (g: Game, seconds: number) => {
  for (let t = 0; t < seconds; t++) g.update(1);
};

// ドリアを下段で焼いて、下駄に乗せて手に持つ
function makeDoria(g: Game): void {
  g.interact(doriaStock);
  g.interact(lowerInlet);
  run(g, cfg.ovenLowerTime + 1);
  g.interact(getaStack);
  g.interact(lowerOutlet);
}

// バッファローピザを焼いて、お皿に入れて、お皿ごと手に持つ
function makePizza(g: Game, mozzBalls = 2): void {
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
  for (let i = 0; i < mozzBalls; i++) {
    g.interact({ kind: 'pizzaSource', id: 'mozzarella' });
    g.interact(pizzaSlot);
  }
  g.interact(pizzaSlot);
  g.interact(pizzaInlet);
  run(g, cfg.ovenUpperTime + 1);
  g.interact(pizzaOutlet);
  g.interact(plate); // お皿に入れる（鉄板が手に残る）
  g.interact({ kind: 'pizzaPanStack' }); // 鉄板を戻す
  g.interact(plate); // お皿ごと持つ
}

describe('メニュー：クックの2品', () => {
  it('ミラノドリア（30点）とバッファローピザ（50点）が、クックの品として足されている', () => {
    const doria = getMenu('milanoDoria');
    const pizza = getMenu('buffaloPizza');
    // ステップB（クック編 4.1）：形は「焼き物」の1種類にまとめ、どの品かは bake.ts の表を id で引く
    expect(doria).toMatchObject({ name: 'ミラノドリア', station: 'cook', form: 'bake', basePoints: 30, enabled: true });
    expect(pizza).toMatchObject({ name: 'バッファローピザ', station: 'cook', form: 'bake', basePoints: 50, enabled: true });
    expect(doria.ticketItems!.length).toBeGreaterThan(0);
    expect(pizza.ticketItems!.length).toBeGreaterThan(0);
  });

  it('既存の15品は、そのまま（並び・形 = 皿）', () => {
    expect(MENU.slice(0, 15).map((m) => m.id)).toEqual([
      'tarako', 'meat', 'parma', 'peperoncino', 'carbonara', 'penne', 'squidInk', 'mushroomCream', 'spinach',
      'shrimpSalad', 'chickenSalad', 'wakameSalad', 'shrimpCocktail', 'steamedChicken', 'cornSoup',
    ]);
    for (const m of MENU.slice(0, 15)) {
      expect(formOf(m)).toBe('plate');
      expect(m.station).not.toBe('cook');
    }
  });

  it('焼き物の品ごとに、提供の決まりが表（bake.ts）にある', () => {
    for (const m of bakedMenus()) expect(getBakeDish(m.id)).not.toBeNull();
    expect(BAKE_TABLE.map((d) => d.id)).toEqual(['milanoDoria', 'buffaloPizza']);
    expect(bakedMenus().map((m) => m.id)).toEqual(['milanoDoria', 'buffaloPizza']);
  });
});

describe('焼き物の ingredients は空：空の皿の一致判定に引っかからない', () => {
  it('judge：空の皿は、焼き物のレシピと一致しない', () => {
    expect(getMenu('milanoDoria').ingredients).toEqual([]);
    expect(judge([], getMenu('milanoDoria'))).toBe(false);
    expect(judge([], getMenu('buffaloPizza'))).toBe(false);
  });

  it('findMatchingTicket：焼き物の伝票しかなければ、空の皿に合う伝票はない', () => {
    expect(findMatchingTicket([], [ticket(1, 'milanoDoria'), ticket(2, 'buffaloPizza')])).toBeNull();
  });

  it('ゲーム：焼き物の伝票があっても、空の皿は「出せない」だけ（注文ミスにも、提供にもならない）', () => {
    const g = cookGame([ticket(1, 'milanoDoria')], 'all');
    g.state.hand = { kind: 'plate', contents: [] };
    g.interact(pass);
    expect(g.state.toast?.text).toBe('空の皿は出せない');
    expect(g.state.tickets).toHaveLength(1);
    expect(g.state.mistakes).toBe(0);
    expect(g.state.served).toBe(0);
  });
});

describe('焼き物の提供判定（bake.ts）', () => {
  it('ドリア：焼き上がり、かつ下駄に乗っているときだけ提供できる', () => {
    expect(servableDish(doriaItem('baked', true))?.id).toBe('milanoDoria');
    expect(servableDish(doriaItem('baked', false))).toBeNull(); // 下駄なし
    expect(servableDish(doriaItem('half', true))).toBeNull(); // 生焼け
    expect(servableDish(doriaItem('burnt', true))).toBeNull(); // 焦げ
    expect(servableDish(doriaItem('raw', false))).toBeNull();
  });

  it('ピザ：お皿に入っていて、焼き上がり、かつ材料がそろっているときだけ提供できる', () => {
    expect(servableDish({ kind: 'pizzaPlate', dish: { pizza: buffalo, state: 'baked' } })?.id).toBe('buffaloPizza');
    expect(servableDish({ kind: 'pizzaPlate', dish: { pizza: { ...buffalo, mozz: 3 }, state: 'baked' } })).toBeNull(); // 材料不足
    expect(servableDish({ kind: 'pizzaPlate', dish: { pizza: buffalo, state: 'burnt' } })).toBeNull();
    expect(servableDish({ kind: 'pizzaPlate' })).toBeNull(); // 空のお皿
    expect(servableDish(bakeItem('pizza', cfg.ovenUpperTime, cfg, buffalo))).toBeNull(); // 鉄板に乗ったまま
  });

  it('皿・手ぶらは焼き物ではない', () => {
    expect(servableDish(null)).toBeNull();
    expect(servableDish({ kind: 'plate', contents: [] })).toBeNull();
  });

  it('同じ品の伝票が複数あれば、最も古いものを返す。ほかの品の伝票は見ない', () => {
    const tickets = [ticket(1, 'tarako', 0), ticket(2, 'milanoDoria', 9), ticket(3, 'buffaloPizza', 1), ticket(4, 'milanoDoria', 4)];
    expect(findBakedTicket('milanoDoria', tickets)?.id).toBe(4);
    expect(findBakedTicket('buffaloPizza', tickets)?.id).toBe(3);
    expect(findBakedTicket('buffaloPizza', [ticket(1, 'tarako')])).toBeNull();
  });
});

describe('Game：焼き物を提供すると採点される', () => {
  it('ドリア：点・コンボ・提供数が増え、伝票が消える', () => {
    const g = cookGame([ticket(1, 'milanoDoria')]);
    makeDoria(g);
    expect(g.planInteract(pass)).not.toBeNull(); // 光る = 出せる
    expect(g.getaHint(pass)).toBe('左クリック：ミラノドリアを提供台に出す'); // ステップB：案内は表の品名で出す
    const expected = serveScore(getMenu('milanoDoria'), g.state.time, 0, cfg).total;
    g.interact(pass);
    expect(g.state.hand).toBeNull();
    expect(g.state.score).toBe(expected);
    expect(g.state.combo).toBe(1);
    expect(g.state.served).toBe(1);
    expect(g.state.tickets).toHaveLength(0);
    expect(g.state.toast).toMatchObject({ kind: 'good' });
    expect(g.state.toast?.text).toContain('ミラノドリア');
  });

  it('ピザ：点・コンボ・提供数が増え、伝票が消える', () => {
    const g = cookGame([ticket(1, 'buffaloPizza')]);
    makePizza(g);
    expect(g.state.hand).toMatchObject({ kind: 'pizzaPlate', dish: { state: 'baked' } });
    expect(g.getaHint(pass)).toBe('左クリック：バッファローピザを提供台に出す');
    const expected = serveScore(getMenu('buffaloPizza'), g.state.time, 0, cfg).total;
    g.interact(pass);
    expect(g.state.score).toBe(expected);
    expect(g.state.combo).toBe(1);
    expect(g.state.served).toBe(1);
    expect(g.state.tickets).toHaveLength(0);
  });

  it('コンボは皿の提供と続けて数える（ドリア → ピザで2コンボ）', () => {
    const g = cookGame([ticket(1, 'milanoDoria'), ticket(2, 'buffaloPizza')]);
    makeDoria(g);
    g.interact(pass);
    makePizza(g);
    g.interact(pass);
    expect(g.state.combo).toBe(2);
    expect(g.state.maxCombo).toBe(2);
    expect(g.state.served).toBe(2);
  });

  it('同じ品の伝票が複数あれば、最も古い伝票を消す', () => {
    const g = cookGame([ticket(1, 'milanoDoria', 0), ticket(2, 'milanoDoria', 0)]);
    g.state.tickets[1].arrivedAt = -5; // 2番の方が古い
    makeDoria(g);
    g.interact(pass);
    expect(g.state.tickets.map((t) => t.id)).toEqual([1]);
  });

  it('伝票にない焼き物を出すと、注文ミス（−30、コンボが0に戻る）', () => {
    const g = cookGame([ticket(1, 'buffaloPizza')]);
    g.state.score = 100;
    g.state.combo = 3;
    makeDoria(g);
    g.interact(pass);
    expect(g.state.hand).toBeNull();
    expect(g.state.score).toBe(100 - cfg.orderMissPenalty);
    expect(g.state.combo).toBe(0);
    expect(g.state.mistakes).toBe(1);
    expect(g.state.served).toBe(0);
    expect(g.state.tickets).toHaveLength(1); // ピザの伝票は残る
  });

  it('生焼け・焦げ・下駄なしのドリアは出せず、理由がヒントに出る', () => {
    const g = cookGame([ticket(1, 'milanoDoria')]);
    g.interact(doriaStock);
    g.interact(upperDoriaInlet); // 上段1周 = 生焼け
    run(g, cfg.ovenUpperTime + 1);
    g.interact(upperDoriaOutlet);
    expect(g.state.hand).toMatchObject({ style: 'doria', state: 'half' });
    expect(g.planInteract(pass)).toBeNull();
    expect(g.getaHint(pass)).toContain('生焼け');

    g.state.hand = doriaItem('burnt', false);
    expect(g.planInteract(pass)).toBeNull();
    expect(g.getaHint(pass)).toContain('焦げて');

    g.state.hand = doriaItem('baked', false);
    expect(g.planInteract(pass)).toBeNull();
    expect(g.getaHint(pass)).toContain('下駄');
    expect(g.state.tickets).toHaveLength(1);
  });

  it('材料が足りないピザは、焼いてお皿に入れても出せず、理由がヒントに出る', () => {
    const g = cookGame([ticket(1, 'buffaloPizza')]);
    makePizza(g, 1); // モッツァレラ1個（3つ）だけ
    expect(g.state.hand).toMatchObject({ kind: 'pizzaPlate', dish: { state: 'baked', pizza: { mozz: 3 } } });
    expect(g.planInteract(pass)).toBeNull();
    expect(g.getaHint(pass)).toContain('そろっていない');
  });
});

describe('ポジション：届く伝票の絞り込み', () => {
  it('表：ヒート = パスタ・サラダ、クック = 焼き物、通し = 全部', () => {
    expect(POSITIONS.map((p) => p.id)).toEqual(['heat', 'cook', 'all']);
    expect(menusFor('heat').every((m) => m.station !== 'cook')).toBe(true);
    expect(menusFor('heat')).toHaveLength(15);
    expect(menusFor('cook').map((m) => m.id)).toEqual(['milanoDoria', 'buffaloPizza']);
    expect(menusFor('all')).toEqual(MENU);
    expect(getPosition('heat').beta).toBe(false);
    expect(getPosition('cook').beta).toBe(true);
    expect(getPosition('all').beta).toBe(true);
  });

  it('ポジションを指定しないゲームはヒート。練習キッチンは常に通し', () => {
    const g = new Game(cfg, () => 0);
    expect(g.state.position).toBe('all'); // タイトル画面の練習の状態
    g.start();
    expect(g.state.position).toBe('heat');
    g.getReady('trial');
    expect(g.state.position).toBe('heat');
    g.getReady('trial', 'cook');
    expect(g.state.position).toBe('cook');
    g.startPractice();
    expect(g.state.position).toBe('all');
    g.start('associate', 'all');
    expect(g.state.position).toBe('all');
  });

  // 毎回、次の伝票を届けさせて、届いた品を数える（種を固定した乱数）
  const collect = (difficulty: 'trial' | 'leading' | 'associate', position: Position) => {
    const g = new Game(cfg, seeded());
    g.getReady(difficulty, position);
    g.begin();
    const counts = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      g.state.nextTicketAt = 0;
      g.state.tickets = [];
      g.update(0.001);
      for (const t of g.state.tickets) {
        counts.set(t.menuId, (counts.get(t.menuId) ?? 0) + 1);
        expect(getMenu(t.menuId).station).toBe(t.station);
      }
    }
    return counts;
  };

  for (const d of DIFFICULTIES) {
    it(`${d.name}：クックではパスタ・サラダの伝票が1枚も出ず、ヒートでは焼き物の伝票が出ない`, () => {
      const cook = collect(d.id, 'cook');
      expect([...cook.keys()].sort()).toEqual(['buffaloPizza', 'milanoDoria']);
      const heat = collect(d.id, 'heat');
      for (const id of heat.keys()) expect(getMenu(id).station).not.toBe('cook');
      expect(heat.size).toBeGreaterThan(0);
    });
  }

  it('クックでも難易度の重みが効く（トライアルはドリア多め、アソシエイトはピザ多め）', () => {
    const trial = collect('trial', 'cook');
    expect(trial.get('milanoDoria')!).toBeGreaterThan(trial.get('buffaloPizza')! * 2);
    const associate = collect('associate', 'cook');
    expect(associate.get('buffaloPizza')!).toBeGreaterThan(associate.get('milanoDoria')!);
  });

  it('重みの表：トライアル ドリア3・ピザ1／リーディング 各1／アソシエイト ドリア2・ピザ3', () => {
    expect(getDifficulty('trial').menuWeights).toMatchObject({ milanoDoria: 3, buffaloPizza: 1 });
    expect(getDifficulty('leading').menuWeights).toMatchObject({ milanoDoria: 1, buffaloPizza: 1 });
    expect(getDifficulty('associate').menuWeights).toMatchObject({ milanoDoria: 2, buffaloPizza: 3 });
  });

  it('練習キッチンからクックのゲームに入っても、冷蔵庫の配置を引き継ぐ', () => {
    const g = new Game(cfg, () => 0);
    g.startPractice();
    const moved = { ...g.state.fridgeItems.cornSoup, x: g.state.fridgeItems.cornSoup.x + 0.01 };
    g.state.fridgeItems.cornSoup = moved;
    g.getReady('leading', 'cook');
    expect(g.state.position).toBe('cook');
    expect(g.state.fridgeItems.cornSoup).toEqual(moved);
  });
});

describe('ランキング・自己ベストの保存先', () => {
  it('ヒートは難易度の名前そのまま（過去の記録が見える）。クック・通しは -cook・-all を付ける', () => {
    expect(rankingBoard('trial', 'heat')).toBe('trial');
    expect(rankingBoard('leading', 'heat')).toBe('leading');
    expect(rankingBoard('associate', 'cook')).toBe('associate-cook');
    expect(rankingBoard('trial', 'all')).toBe('trial-all');
  });

  it('保存先は 3難易度 × 3ポジション = 9つで、firestore.rules の読み書きの一覧と同じ', () => {
    expect(new Set(RANKING_BOARDS).size).toBe(9);
    const lists = [...rules.matchAll(/board in \[([^\]]*)\]/g)].map((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort());
    expect(lists).toHaveLength(2); // read と create
    for (const list of lists) expect(list).toEqual([...RANKING_BOARDS].sort());
  });
});
