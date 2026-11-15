import { describe, expect, it } from 'vitest';
import { BAKE_TABLE, isHot, needsCare, scoopOf, type BakeDish } from './bake';
import { DEFAULT_CONFIG, PLAY_CONFIG, type GameConfig } from './config';
import { configFor } from './difficulty';
import { Game, describeTool } from './game';
import { TOOL_HOOKS, OVEN_COUNTER, OVEN_COUNTER_ZS, WORK_FRAMES } from './layout';
import { bakeItem, frontS, laneOfOffset } from './oven';
import { createTicket } from './tickets';
import { getMenu } from './recipe';
import type { BakeStyle, Item, OvenDeck, Target } from './types';

// クック編設計書 4.4（C4）：道具の手（やっとこ・ヘラ）

const hot: GameConfig = { ...DEFAULT_CONFIG, hotHandling: true }; // 本番と同じ（熱い器はやっとこで）
const cfg = DEFAULT_CONFIG;

const hook = (id: 'tongs' | 'spatula'): Target => ({ kind: 'toolHook', id });
const frame = (index: number): Target => ({ kind: 'workFrame', index });
const vessel = (style: BakeStyle): Target => ({ kind: 'vesselStack', style });
const inlet = (deck: OvenDeck, style: BakeStyle): Target => ({ kind: 'ovenInlet', deck, x: 0, s: frontS(style) });
const doriaStock: Target = { kind: 'ovenStock', style: 'doria' };
const getaStack: Target = { kind: 'getaStack' };
const smallStack: Target = { kind: 'plateStack', style: 'small' };
const pass: Target = { kind: 'servePass' };
const slot: Target = { kind: 'pizzaSlot', index: 0 };

function game(c: GameConfig, difficulty: 'trial' | 'leading' | 'associate' | null = 'leading', menus: string[] = []): Game {
  const g = new Game(c, () => 0);
  if (difficulty) g.start(difficulty, 'cook');
  else g.startPractice();
  g.state.nextTicketAt = Infinity;
  g.state.tickets = menus.map((m, i) => createTicket(i + 1, getMenu(m), 0));
  return g;
}
const handOf = (g: Game): Item | null => g.state.hand;
const run = (g: Game, seconds: number) => {
  for (let t = 0; t < seconds; t++) g.update(1);
};

// 左手の器を入口に流して、出口に出てくるまで待つ。出口（そのレーン）を返す
function bake(g: Game, deck: OvenDeck, style: BakeStyle, seconds = deck === 'lower' ? cfg.ovenLowerTime : cfg.ovenUpperTime): Target {
  g.interact(inlet(deck, style));
  expect(g.state.hand).toBeNull();
  const dish = g.state.oven.decks[deck][0];
  run(g, seconds + 1);
  return { kind: 'ovenOutlet', deck, lane: laneOfOffset(dish.x) };
}
const bakeDoria = (g: Game): Target => {
  g.interact(doriaStock);
  return bake(g, 'lower', 'doria');
};
// バッファローピザを組み立てて、上段に流す
function bakePizza(g: Game): Target {
  g.interact({ kind: 'pizzaPanStack' });
  g.interact(slot);
  g.interact({ kind: 'pizzaDoughStack' });
  g.interact(slot);
  for (const id of ['sauce', 'cheese', 'mozzarella', 'mozzarella'] as const) {
    g.interact({ kind: 'pizzaSource', id });
    g.interact(slot);
  }
  g.interact(slot);
  return bake(g, 'upper', 'pizza');
}
// フォッカチオ（焼成パッド）を作業枠で作って、上段に流す
function bakeFocaccia(g: Game): Target {
  g.interact(vessel('bakingPad'));
  g.interact(frame(0));
  g.interact({ kind: 'cookBin', id: 'focaccia' });
  g.interact(frame(0));
  g.interact(frame(0));
  return bake(g, 'upper', 'bakingPad');
}

describe('設定（hotHandling）と難易度', () => {
  it('標準（DEFAULT_CONFIG）はオフ、本番（PLAY_CONFIG）はオン', () => {
    expect(DEFAULT_CONFIG.hotHandling).toBe(false);
    expect(PLAY_CONFIG.hotHandling).toBe(true);
  });

  it('トライアルはオフに上書き。リーディング・アソシエイト・練習キッチンは本番の設定のまま（オン）', () => {
    expect(configFor(PLAY_CONFIG, 'trial').hotHandling).toBe(false);
    expect(configFor(PLAY_CONFIG, 'leading').hotHandling).toBe(true);
    expect(configFor(PLAY_CONFIG, 'associate').hotHandling).toBe(true);
    expect(configFor(PLAY_CONFIG, null).hotHandling).toBe(true);
    expect(game(PLAY_CONFIG, null).hotHandling()).toBe(true);
    expect(game(PLAY_CONFIG, 'trial').hotHandling()).toBe(false);
  });

  it('フックは1台目の具材台の、部屋の中央側の縁にある（作業枠と同じ台）', () => {
    expect(TOOL_HOOKS.counter).toBe(WORK_FRAMES.counter);
    expect(TOOL_HOOKS.x).toBeGreaterThan(OVEN_COUNTER.x + OVEN_COUNTER.width / 2);
    for (const zr of Object.values(TOOL_HOOKS.zr)) expect(Math.abs(OVEN_COUNTER_ZS[0] + zr - OVEN_COUNTER_ZS[0])).toBeLessThan(OVEN_COUNTER.depth / 2);
  });
});

describe('道具のフック（F で取る・戻す・持ち替える）', () => {
  it('最初は何も持っていない。フックで F：取る → 別の道具に持ち替える → 戻す', () => {
    const g = game(hot);
    expect(g.state.tool).toBeNull();
    expect(g.toolHint(hook('tongs'))).toBe('F：やっとこを取る');
    g.useTool(hook('tongs'));
    expect(g.state.tool).toEqual({ kind: 'tongs', dish: null });
    expect(g.toolHint(hook('spatula'))).toBe('F：ヘラに持ち替える');
    g.useTool(hook('spatula'));
    expect(g.state.tool).toEqual({ kind: 'spatula', scoop: null });
    g.useTool(hook('spatula'));
    expect(g.state.tool).toBeNull();
  });

  it('左クリックではフックに何も起きない。左手の物は、道具を取っても変わらない', () => {
    const g = game(hot);
    g.interact(getaStack);
    expect(g.planInteract(hook('tongs'))).toBeNull();
    g.useTool(hook('tongs'));
    expect(g.state.hand).toEqual({ kind: 'geta' });
  });

  it('やっとこで器をつかんでいる間は、戻せない・持ち替えられない（理由が出る）', () => {
    const g = game(hot);
    const out = bakeDoria(g);
    g.useTool(hook('tongs'));
    g.useTool(out);
    expect(g.planTool(hook('tongs'))).toBeNull();
    expect(g.planTool(hook('spatula'))).toBeNull();
    expect(g.toolHint(hook('tongs'))).toContain('置いてから');
  });

  it('練習からゲームに入ると、道具はフックに戻る', () => {
    const g = game(hot, null);
    g.useTool(hook('tongs'));
    g.start('leading', 'cook');
    expect(g.state.tool).toBeNull();
  });
});

describe('熱い器', () => {
  it('オーブンを通った器は熱い。山から取った器・受け台に乗せた器・中身を移して空になった器は熱くない', () => {
    expect(isHot(bakeItem('doria', 0, cfg))).toBe(false);
    expect(isHot(bakeItem('doria', cfg.ovenLowerTime, cfg))).toBe(true);
    expect(isHot(bakeItem('doria', cfg.ovenUpperTime, cfg))).toBe(true); // 生焼け
    expect(isHot({ ...bakeItem('doria', cfg.ovenLowerTime, cfg), geta: true })).toBe(false);
    expect(isHot(bakeItem('bakingPad', 0, cfg, undefined, { blank: true }))).toBe(false);
  });

  it('リーディング：出口の皿を素手で取ろうとすると取れず、理由が出る', () => {
    const g = game(hot, 'leading');
    const out = bakeDoria(g);
    expect(g.ovenHint(out)).toContain('熱い！ やっとこでつかむ（F）');
    g.interact(out);
    expect(g.state.hand).toBeNull();
    expect(g.state.toast?.text).toBe('熱い！ やっとこでつかむ（F）');
    expect(g.state.oven.decks.lower).toHaveLength(1);
  });

  it('リーディング：下駄を持って出口を左クリックしても、ドリアは乗らない（オンのときは、やっとこで F）', () => {
    const g = game(hot, 'leading');
    const out = bakeDoria(g);
    g.interact(getaStack);
    g.interact(out);
    expect(g.state.hand).toEqual({ kind: 'geta' });
    expect(g.state.toast?.text).toBe('熱い！ やっとこでつかむ（F）');
  });

  it('トライアル：出口の皿を素手で取れる（下駄を持って左クリックで乗るのも、今までどおり）', () => {
    const g = game(PLAY_CONFIG, 'trial');
    const out = bakeDoria(g);
    g.interact(out);
    expect(g.state.hand).toMatchObject({ kind: 'bakeDish', style: 'doria', state: 'baked' });
    const h = game(PLAY_CONFIG, 'trial');
    const out2 = bakeDoria(h);
    h.interact(getaStack);
    h.interact(out2);
    expect(h.state.hand).toMatchObject({ kind: 'bakeDish', style: 'doria', state: 'baked', geta: true });
  });

  it('作業枠の熱い器も素手では持ち上げられない（やっとこならつかめる）。冷めた器は素手で持てる', () => {
    const g = game(hot);
    const out = bakeFocaccia(g);
    g.useTool(hook('tongs'));
    g.useTool(out);
    g.useTool(frame(1)); // 熱いパッドを作業枠に置く
    expect(g.state.workFrames[1]).toMatchObject({ style: 'bakingPad', state: 'baked' });
    expect(g.getaHint(frame(1))).toContain('熱い！');
    g.interact(frame(1));
    expect(g.state.hand).toBeNull();
    expect(g.state.workFrames[1]).not.toBeNull();
    expect(g.toolHint(frame(1))).toBe('F：やっとこでつかむ');
    g.useTool(frame(1));
    expect(g.state.tool).toMatchObject({ kind: 'tongs', dish: { style: 'bakingPad', state: 'baked' } });
    // 山から取った（冷めた）器は、やっとこではつかまない
    g.useTool(frame(1));
    g.interact(vessel('doria'));
    g.interact(frame(2));
    g.useTool(frame(1));
    expect(g.planTool(frame(2))).toBeNull();
  });

  it('チュートリアル中は、素手の手順で案内しているので、熱い器の決まりはオフ', () => {
    const g = game(hot, null);
    expect(g.startTutorial('milanoDoria')).toBe(true);
    expect(g.hotHandling()).toBe(false);
  });
});

describe('受け入れ条件：手元で合わせる（下駄 ＋ やっとこ）', () => {
  it('左手に下駄、やっとこで出口のドリアを F でつかむと、左手が「下駄に乗ったドリア」になり、そのまま提供できる', () => {
    const g = game(hot, 'leading', ['milanoDoria']);
    const out = bakeDoria(g);
    g.interact(getaStack);
    g.useTool(hook('tongs'));
    expect(g.toolHint(out)).toBe('F：やっとこでつかむ（左手の下駄に乗せる）');
    g.useTool(out);
    expect(g.state.hand).toEqual({ kind: 'bakeDish', style: 'doria', cooked: cfg.ovenLowerTime, state: 'baked', geta: true });
    expect(g.state.tool).toEqual({ kind: 'tongs', dish: null });
    g.interact(pass);
    expect(g.state.served).toBe(1);
    expect(g.state.mistakes).toBe(0);
  });

  it('先にやっとこでつかんでから下駄を取っても、同じ結果になる', () => {
    const g = game(hot, 'leading', ['milanoDoria']);
    const out = bakeDoria(g);
    g.useTool(hook('tongs'));
    g.useTool(out);
    expect(g.state.tool).toMatchObject({ kind: 'tongs', dish: { style: 'doria', state: 'baked' } });
    expect(g.state.hand).toBeNull();
    g.interact(getaStack);
    expect(g.state.hand).toEqual({ kind: 'bakeDish', style: 'doria', cooked: cfg.ovenLowerTime, state: 'baked', geta: true });
    expect(g.state.tool).toEqual({ kind: 'tongs', dish: null });
    g.interact(pass);
    expect(g.state.served).toBe(1);
  });

  it('焼き上がったピザの鉄板 ＋ 左手のピザのお皿 → 左手が「ピザの入ったお皿」、やっとこに空の鉄板が残る', () => {
    const g = game(hot, 'leading', ['buffaloPizza']);
    const out = bakePizza(g);
    g.useTool(hook('tongs'));
    g.useTool(out);
    g.interact({ kind: 'pizzaPlateStack' });
    expect(g.state.hand).toMatchObject({ kind: 'pizzaPlate', dish: { state: 'baked' } });
    expect(g.state.tool).toMatchObject({ kind: 'tongs', dish: { style: 'pizza', state: 'raw' } });
    g.interact(pass);
    expect(g.state.served).toBe(1);
    // 空の鉄板は、やっとこで鉄板のスタックに戻せる
    const before = g.state.pizzaPanStock;
    g.useTool({ kind: 'pizzaPanStack' });
    expect(g.state.pizzaPanStock).toBe(before + 1);
    expect(g.state.tool).toEqual({ kind: 'tongs', dish: null });
  });

  it('焼き上がった焼成パッド ＋ 左手の小皿 → 左手が「料理ののった小皿」、やっとこに空のパッドが残る（棚の山に戻せる）', () => {
    const g = game(hot, 'leading', ['focaccia']);
    const out = bakeFocaccia(g);
    g.interact(smallStack);
    g.useTool(hook('tongs'));
    g.useTool(out);
    expect(g.state.hand).toMatchObject({ kind: 'bakePlate', from: 'bakingPad', state: 'baked' });
    expect(g.state.tool).toMatchObject({ kind: 'tongs', dish: { style: 'bakingPad', state: 'raw', blank: true } });
    expect(g.toolHint(vessel('bakingPad'))).toContain('山に戻す');
    g.useTool(vessel('bakingPad'));
    expect(g.state.tool).toEqual({ kind: 'tongs', dish: null });
    g.interact(pass);
    expect(g.state.served).toBe(1);
  });

  it('途中の段階・生焼けの器は、受け台を持っていても乗らない（やっとこに残る）', () => {
    const g = game(hot);
    g.interact(doriaStock);
    const out = bake(g, 'upper', 'doria'); // 上段1周 = 生焼け
    g.interact(getaStack);
    g.useTool(hook('tongs'));
    expect(g.toolHint(out)).toBe('F：やっとこでつかむ');
    g.useTool(out);
    expect(g.state.hand).toEqual({ kind: 'geta' });
    expect(g.state.tool).toMatchObject({ kind: 'tongs', dish: { state: 'half' } });
  });
});

describe('やっとこで置く', () => {
  it('作業枠に置いた受け台の上に、F で置ける。作業枠・入口のベルトにも置ける', () => {
    const g = game(hot, 'leading', ['milanoDoria']);
    g.interact(doriaStock);
    const out = bake(g, 'upper', 'doria'); // 生焼け
    g.useTool(hook('tongs'));
    g.useTool(out);
    // 生焼けは、やっとこで入口に戻して焼ける
    expect(g.toolHint(inlet('upper', 'doria'))).toContain('F：ここに流す');
    expect(g.previewOven(inlet('upper', 'doria'))?.valid).toBe(true);
    g.useTool(inlet('upper', 'doria'));
    expect(g.state.tool).toEqual({ kind: 'tongs', dish: null });
    run(g, cfg.ovenUpperTime + 1);
    g.useTool({ kind: 'ovenOutlet', deck: 'upper', lane: laneOfOffset(0) });
    expect(g.state.tool).toMatchObject({ kind: 'tongs', dish: { state: 'baked' } });
    // 作業枠の下駄の上に置く
    g.interact(getaStack);
    expect(g.state.hand).toMatchObject({ geta: true }); // 手元で合わさる
    g.interact(frame(0));
    expect(g.state.workFrames[0]).toMatchObject({ geta: true });
  });

  it('作業枠の受け台（下駄）の上に、やっとこの器を置くと、器が下駄に乗る', () => {
    const g = game(hot);
    const out = bakeDoria(g);
    g.interact(getaStack);
    g.interact(frame(0));
    expect(g.state.workFrames[0]).toEqual({ kind: 'geta' });
    g.useTool(hook('tongs'));
    g.useTool(out);
    expect(g.toolHint(frame(0))).toContain('下駄に乗せる');
    g.useTool(frame(0));
    expect(g.state.workFrames[0]).toMatchObject({ kind: 'bakeDish', style: 'doria', geta: true });
    expect(g.state.tool).toEqual({ kind: 'tongs', dish: null });
  });

  it('つかめるのは1つだけ（器をつかんでいる間は、出口の次の器はつかめない）', () => {
    const g = game(hot);
    g.interact(doriaStock);
    g.interact(inlet('lower', 'doria'));
    g.interact(doriaStock);
    g.interact({ kind: 'ovenInlet', deck: 'lower', x: 0.3, s: frontS('doria') });
    run(g, cfg.ovenLowerTime + 2);
    g.useTool(hook('tongs'));
    const lanes = [...new Set(g.state.oven.decks.lower.map((d) => laneOfOffset(d.x)))];
    g.useTool({ kind: 'ovenOutlet', deck: 'lower', lane: lanes[0] });
    for (const lane of lanes) expect(g.planTool({ kind: 'ovenOutlet', deck: 'lower', lane })).toBeNull();
  });
});

describe('捨てる（右クリック）', () => {
  it('左手の物が先。左手が空なら、やっとこの器を捨てる。道具そのものは捨てられない', () => {
    const g = game(hot);
    const out = bakeDoria(g);
    g.useTool(hook('tongs'));
    g.useTool(out);
    g.interact({ kind: 'noodleRack' });
    g.rightClick(null);
    expect(g.state.hand).toBeNull();
    expect(g.state.tool).toMatchObject({ kind: 'tongs', dish: { style: 'doria' } });
    g.rightClick(null);
    expect(g.state.tool).toEqual({ kind: 'tongs', dish: null });
    g.rightClick(null);
    expect(g.state.tool).toEqual({ kind: 'tongs', dish: null });
    expect(g.state.toast?.text).toContain('捨てられない');
  });

  it('焼いたピザを、やっとこから捨てると、空の鉄板がやっとこに残る', () => {
    const g = game(hot);
    const out = bakePizza(g);
    g.useTool(hook('tongs'));
    g.useTool(out);
    g.rightClick(null);
    expect(g.state.tool).toMatchObject({ kind: 'tongs', dish: { style: 'pizza', state: 'raw' } });
  });

  it('やっとこを持っていても、鍋は投げられる（左手と右クリックの決まりは変わらない）', () => {
    const g = game(hot, null);
    g.useTool(hook('tongs'));
    g.interact({ kind: 'potSlot', index: 0 });
    expect(handOf(g)?.kind).toBe('pot');
    g.rightClick(null, { origin: { x: 0, y: 1.5, z: 0 }, dir: { x: 0, y: 0, z: -1 } } as never);
    expect(g.state.hand).toBeNull();
    expect(g.state.thrownPots).toHaveLength(1);
    expect(g.state.tool).toEqual({ kind: 'tongs', dish: null });
  });
});

describe('ポテトの下調理：やっとこでストック容器に F で空ける（C5 の左クリックからの移行）', () => {
  function potatoPad(g: Game): Target {
    g.interact(vessel('largePad'));
    g.interact(slot);
    g.interact({ kind: 'frozenBag', id: 'potato' });
    g.interact(slot);
    g.state.hand = null;
    g.interact(slot);
    return bake(g, 'lower', 'largePad');
  }
  const bin: Target = { kind: 'cookBin', id: 'potato' };

  it('リーディング：焼き上がったパッドを、やっとこでつかんで F で空ける（+16。やっとこに空のパッドが残る）', () => {
    const g = game(hot);
    const out = potatoPad(g);
    g.interact(out);
    expect(g.state.hand).toBeNull(); // 素手では取れない
    g.useTool(hook('tongs'));
    g.useTool(out);
    const before = g.state.prepStock.potato;
    expect(g.toolHint(bin)).toBe(`F：ポテトを容器に空ける（+${cfg.potatoPerLargePad}）`);
    g.useTool(bin);
    expect(g.state.prepStock.potato).toBe(before + cfg.potatoPerLargePad);
    expect(g.state.tool).toMatchObject({ kind: 'tongs', dish: { style: 'largePad', state: 'raw', blank: true } });
    g.useTool(vessel('largePad'));
    expect(g.state.tool).toEqual({ kind: 'tongs', dish: null });
  });

  it('トライアル（熱い器の決まりがオフ）では、素手で持って左クリックで空ける代用も残る。F でも空けられる', () => {
    const g = game(PLAY_CONFIG, 'trial');
    const out = potatoPad(g);
    g.interact(out);
    const before = g.state.prepStock.potato;
    g.interact(bin);
    expect(g.state.prepStock.potato).toBe(before + cfg.potatoPerLargePad);
    const h = game(PLAY_CONFIG, 'trial');
    const out2 = potatoPad(h);
    h.useTool(hook('tongs'));
    h.useTool(out2);
    h.useTool(bin);
    expect(h.state.prepStock.potato).toBe(before + cfg.potatoPerLargePad);
  });

  it('生焼けのパッドは、やっとこでも空けられない', () => {
    const g = game(hot);
    g.interact(vessel('largePad'));
    g.interact(slot);
    g.interact({ kind: 'frozenBag', id: 'potato' });
    g.interact(slot);
    g.state.hand = null;
    g.interact(slot);
    const out = bake(g, 'upper', 'largePad');
    g.useTool(hook('tongs'));
    g.useTool(out);
    expect(g.planTool(bin)).toBeNull();
  });
});

describe('ヘラ（はがす・すくう・のせる）', () => {
  // ハンバーグ・目玉焼きの品は C7 で表に入る。ここでは、このファイルの中だけで検証用の行を足して確かめる（終わったら除く）
  const table = BAKE_TABLE as BakeDish[];
  const testRows: BakeDish[] = [
    {
      id: 'testHamburg',
      name: '検証用ハンバーグ',
      vessel: 'hamburgPan',
      stages: [
        { load: [{ id: 'patty', count: 1 }], need: 1 },
        { load: [{ id: 'corn', count: 1 }], care: ['scrape'], need: 1 },
      ],
      finish: { base: 'board', extras: ['friedEgg'] },
    },
    { id: 'testEgg', name: '検証用目玉焼き', vessel: 'eggPan', stages: [{ load: [{ id: 'egg', count: 2 }], need: 1 }], finish: { base: 'board' } },
  ];
  const withRows = (fn: () => void) => {
    table.push(...testRows);
    try {
      fn();
    } finally {
      for (const r of testRows) table.splice(table.indexOf(r), 1);
    }
  };
  const pan1 = () => ({ ...bakeItem('hamburgPan', cfg.ovenUpperTime, cfg, undefined, { blank: true, loaded: { patty: 1 } }) });

  it('1回目が焼けたハンバーグの鉄板は、はがすまで次の段階に流せない。F のヘラで1回はがす', () => {
    withRows(() => {
      const g = game(hot);
      const pan = pan1();
      expect(pan.state).toBe('baked');
      expect(needsCare(pan, 'scrape')).toBe(true);
      g.state.workFrames[0] = pan;
      expect(g.planTool(frame(0))).toBeNull(); // 道具を持っていない
      g.useTool(hook('spatula'));
      expect(g.toolHint(frame(0))).toBe('F：ヘラではがす');
      g.useTool(frame(0));
      expect(g.state.workFrames[0]).toMatchObject({ cares: ['scrape'] });
      expect(g.planTool(frame(0))).toBeNull(); // はがすのは1回
    });
  });

  it('トライアル：ヘラの作業（はがす）は、手が空のとき左クリックでもできる', () => {
    withRows(() => {
      const g = game(PLAY_CONFIG, 'trial');
      g.state.workFrames[0] = pan1();
      expect(g.getaHint(frame(0))).toContain('左クリック：ヘラではがす');
      g.interact(frame(0));
      expect(g.state.hand).toBeNull();
      expect(g.state.workFrames[0]).toMatchObject({ cares: ['scrape'] });
      g.interact(frame(0)); // はがしたあとは、今までどおり持ち上げる
      expect(g.state.hand).toMatchObject({ style: 'hamburgPan' });
    });
  });

  it('目玉焼き鉄板から1つすくい、板に乗せた仕上げ中のハンバーグにのせる。すくい終わった鉄板は空の器になる', () => {
    withRows(() => {
      const g = game(hot);
      g.state.workFrames[0] = bakeItem('eggPan', cfg.ovenUpperTime, cfg, undefined, { blank: true, loaded: { egg: 2 } });
      const done = bakeItem('hamburgPan', cfg.ovenUpperTime, cfg, undefined, { blank: true, loaded: { patty: 1, corn: 1 }, stage: 1, cares: ['scrape'] });
      expect(done.state).toBe('baked');
      g.state.workFrames[1] = { ...done, board: true };
      expect(scoopOf(g.state.workFrames[0])).toEqual({ load: 'egg', finish: 'friedEgg' });
      g.useTool(hook('spatula'));
      expect(g.planTool(frame(1))).toBeNull(); // ヘラが空のうちは、のせる物がない
      expect(g.toolHint(frame(0))).toBe('F：目玉焼きを1つすくう');
      g.useTool(frame(0));
      expect(g.state.tool).toEqual({ kind: 'spatula', scoop: 'friedEgg' });
      expect(describeTool(g.state.tool)).toBe('ヘラ（目玉焼き）');
      expect(g.state.workFrames[0]).toMatchObject({ loaded: { egg: 1 } });
      expect(g.planTool(frame(0))).toBeNull(); // すくった物をのせるまで、次はすくえない
      expect(g.planTool(hook('spatula'))).toBeNull(); // のせるまで戻せない
      g.useTool(frame(1));
      expect(g.state.workFrames[1]).toMatchObject({ finishes: ['friedEgg'] });
      expect(g.state.tool).toEqual({ kind: 'spatula', scoop: null });
      g.useTool(frame(0));
      g.useTool(frame(1));
      expect(g.state.workFrames[0]).toMatchObject({ kind: 'bakeDish', style: 'eggPan', state: 'raw', blank: true });
      expect(g.state.workFrames[0]).not.toHaveProperty('loaded');
    });
  });

  it('対象がないとき（焼けていない器・はがす必要のない器）は、ヘラでは何もできない（光らない）', () => {
    const g = game(hot);
    g.useTool(hook('spatula'));
    g.interact(vessel('hamburgPan'));
    g.interact(frame(0));
    expect(g.planTool(frame(0))).toBeNull();
    expect(g.planTool(frame(1))).toBeNull();
    expect(g.toolHint(frame(0))).toBe('');
    const out = bakeDoria(g);
    expect(g.planTool(out)).toBeNull();
  });
});

describe('F でできることがある物だけが光り、F を押すとそのとおりに動く', () => {
  // 色々な状態で、planTool が返す物は useTool で必ず状態が変わり、返さない物は何も変わらない
  const targets = (g: Game): Target[] => [
    hook('tongs'),
    hook('spatula'),
    frame(0),
    frame(1),
    frame(2),
    { kind: 'ovenOutlet', deck: 'lower', lane: 0 },
    { kind: 'ovenOutlet', deck: 'lower', lane: 1 },
    { kind: 'ovenOutlet', deck: 'lower', lane: 2 },
    inlet('lower', 'doria'),
    vessel('doria'),
    vessel('bakingPad'),
    { kind: 'pizzaPanStack' },
    { kind: 'cookBin', id: 'potato' },
    getaStack,
    pass,
    ...g.state.pizzaPlates.map((p): Target => ({ kind: 'pizzaPlate', id: p.id })),
  ];
  const snapshot = (g: Game) => JSON.stringify({ ...g.state, toast: null });

  it('どの状態でも、光る（planTool がある）ことと、F で変わることが一致する', () => {
    const states: Game[] = [];
    const g1 = game(hot);
    bakeDoria(g1);
    g1.useTool(hook('tongs'));
    states.push(g1);
    const g2 = game(hot);
    const o2 = bakeDoria(g2);
    g2.useTool(hook('tongs'));
    g2.useTool(o2);
    states.push(g2);
    const g3 = game(hot);
    bakeFocaccia(g3);
    g3.interact(getaStack);
    g3.interact(frame(1));
    g3.useTool(hook('spatula'));
    states.push(g3);
    states.push(game(hot));
    for (const g of states) {
      for (const t of targets(g)) {
        const copy = new Game(hot, () => 0);
        copy.state = structuredClone(g.state);
        const before = snapshot(copy);
        const plan = copy.planTool(t);
        copy.useTool(t);
        expect(snapshot(copy) !== before, JSON.stringify(t)).toBe(plan !== null);
      }
    }
  });
});
