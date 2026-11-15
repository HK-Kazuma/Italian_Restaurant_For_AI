import { describe, expect, it } from 'vitest';
import { BAKE_TABLE, PREP_TABLE, getBakeDish } from './bake';
import { DEFAULT_CONFIG as cfg, PLAY_CONFIG } from './config';
import { DIFFICULTIES, getDifficulty, weightsFor } from './difficulty';
import { Game } from './game';
import { TOOL_HOME } from './layout';
import { MISSIONS, currentMission, loadCookTutorialCleared, loadTutorialCleared, saveCookTutorialCleared } from './mission';
import { frontS } from './oven';
import { MENU, type MenuCategory } from './recipe';
import { SOLO_TUTORIALS, hasTutorial, isCookTutorial, matchesTarget, soloTutorial, tutorialSteps, type GuideAt } from './tutorial';
import type { BakeStyle, GameState, Target } from './types';

// クック編 C10（ステップM）：点数（仮）・難易度の出方・チュートリアル

const COOK = MENU.filter((m) => m.station === 'cook' && m.enabled);

describe('クック編 C10：点数（仮）', () => {
  it('クックの品は25品', () => {
    expect(COOK).toHaveLength(25);
  });
  it('分類ごとの点数：フォッカチオ20・前菜30・ドリア30・スープ30・ピザ50・ハンバーグとチキン70・ミックスグリル80', () => {
    const byCategory: Record<string, number> = { bread: 20, cookStarter: 30, doriaGratin: 30, cookSoup: 30, pizza: 50, meat: 70 };
    for (const m of COOK) {
      const want = m.id === 'mixedGrill' ? 80 : byCategory[m.category];
      expect(m.basePoints, m.id).toBe(want);
    }
  });
});

describe('クック編 C10：難易度の出方', () => {
  it('リーディング：クックの品はすべて同じ確率', () => {
    const w = weightsFor('leading');
    for (const m of COOK) expect(w[m.id], m.id).toBe(1);
  });
  it('アソシエイト：肉料理とスープは重み3、ドリアとフォッカチオは1（既存の値で固定されたミラノドリアを除く）', () => {
    const w = weightsFor('associate');
    const fixed = getDifficulty('associate').menuWeights;
    const want: Partial<Record<MenuCategory, number>> = { meat: 3, cookSoup: 3, doriaGratin: 1, bread: 1 };
    for (const m of COOK) {
      if (m.id in fixed) continue;
      const v = want[m.category];
      if (v !== undefined) expect(w[m.id], m.id).toBe(v);
    }
  });
  it('分類の重みより、品ごとの重みが優先される', () => {
    for (const d of DIFFICULTIES) {
      const w = weightsFor(d.id);
      for (const [id, v] of Object.entries(d.menuWeights)) expect(w[id], `${d.id}:${id}`).toBe(v);
    }
  });
  it('トライアル：道具の手はオフ、下調理のストックは減らない', () => {
    expect(getDifficulty('trial').tools?.hotHandling).toBe(false);
    expect(getDifficulty('trial').stock?.prepStockConsume).toBe(false);
  });
});

describe('クック編 C10：チュートリアル', () => {
  it('クックの25品すべてに、チュートリアルの工程がある', () => {
    for (const m of COOK) {
      expect(hasTutorial(m.id), m.id).toBe(true);
      expect(tutorialSteps(m.id, cfg)!.length, m.id).toBeGreaterThan(0);
      expect(getBakeDish(m.id), m.id).not.toBeNull();
    }
  });
});

// --- 独立したチュートリアル（下調理・道具の手）---

type Act = Target | { wait: number } | { tool: Target } | { toolFree: Target };
const vessel = (style: BakeStyle): Target => ({ kind: 'vesselStack', style });
const frame = (index: number): Target => ({ kind: 'workFrame', index });
const slot = (index: number): Target => ({ kind: 'pizzaSlot', index });
const inlet = (deck: 'upper' | 'lower', style: BakeStyle): Target => ({ kind: 'ovenInlet', deck, x: 0, s: frontS(style) });
const outlet = (deck: 'upper' | 'lower', lane = 1): Target => ({ kind: 'ovenOutlet', deck, lane }); // 3列系は x = 0 でまん中のレーン、2列系は 0
const wait = (seconds: number): Act => ({ wait: seconds });

// 矢印どおりに操作する（toolFree = 矢印が台の上の位置（surfaceSpot）を指すときの F。位置だけ確かめる）
function play(id: string, acts: Act[], c = cfg) {
  const g = new Game(c, () => 0);
  g.startPractice();
  expect(g.startTutorial(id)).toBe(true);
  let last = 0;
  for (const act of acts) {
    const guide = g.tutorialGuide();
    const label = `${id} 工程${(g.state.tutorial?.step ?? -1) + 1}`;
    if ('wait' in act) g.update(act.wait);
    else if ('toolFree' in act) {
      expect(guide?.at.kind, label).toBe('surfaceSpot');
      const at = guide!.at as Extract<GuideAt, { kind: 'surfaceSpot' }>;
      expect(act.toolFree, label).toMatchObject({ kind: 'tableTop', surface: at.surface, x: at.x, z: at.z });
      expect(g.planTool(act.toolFree), label).not.toBeNull();
      g.useTool(act.toolFree);
    } else if ('tool' in act) {
      expect(guide, label).not.toBeNull();
      expect(matchesTarget(act.tool, guide!.at), `${label}: 矢印 ${JSON.stringify(guide!.at)} / 操作 ${JSON.stringify(act.tool)}`).toBe(true);
      expect(g.planTool(act.tool), label).not.toBeNull();
      g.useTool(act.tool);
    } else {
      expect(guide, label).not.toBeNull();
      expect(matchesTarget(act, guide!.at), `${label}: 矢印 ${JSON.stringify(guide!.at)} / 操作 ${JSON.stringify(act)}`).toBe(true);
      g.interact(act);
    }
    g.update(0.01);
    const step = g.state.tutorial?.step ?? Infinity;
    expect(step, '工程は戻らない').toBeGreaterThanOrEqual(last);
    last = step;
  }
  return g;
}

describe('クック編 C10：独立したチュートリアル（下調理・道具の手）', () => {
  it('下調理の表の行ごとに1本と、道具の手の1本がある（どれもクックのチュートリアル。伝票の品とは id が重ならない）', () => {
    expect(SOLO_TUTORIALS.map((x) => x.id)).toEqual([...PREP_TABLE.map((r) => r.id), 'toolHands']);
    for (const x of SOLO_TUTORIALS) {
      expect(MENU.some((m) => m.id === x.id)).toBe(false);
      expect(hasTutorial(x.id)).toBe(true);
      expect(isCookTutorial(x.id)).toBe(true);
      expect(tutorialSteps(x.id, cfg)!.length).toBeGreaterThan(0);
    }
  });

  it('道具の手で焼く品は、表から選ぶ（1段階目に手入れがなく、2段階目の前に「はがす」がある最初の行）', () => {
    const first = BAKE_TABLE.find((d) => d.stages.length >= 2 && !(d.stages[0].care ?? []).length && (d.stages[1].care ?? []).includes('scrape'));
    expect(first?.vessel).toBe('hamburgPan');
    expect(tutorialSteps('toolHands', cfg)!.map((x) => x.label).join('\n')).toContain('はがす');
  });

  it('下調理（ポテト）：矢印のとおりに、袋から入れて下段で焼き、ストック容器に空けると、完了する（伝票は届かない）', () => {
    const g = new Game(cfg, () => 0);
    g.startPractice();
    g.startTutorial('potatoPrep');
    expect(g.state.tickets).toEqual([]);
    expect(g.tutorialView()!.menuName).toBe('ポテトの下調理');
    const before = g.state.prepStock.potato;
    const acts: Act[] = [
      vessel('largePad'), slot(0),
      { kind: 'frozenBag', id: 'potato' }, slot(0), { kind: 'frozenBag', id: 'potato' },
      slot(0), inlet('lower', 'largePad'), wait(cfg.ovenLowerTime + 1),
      outlet('lower', 0), { kind: 'cookBin', id: 'potato' }, vessel('largePad'),
    ];
    const p = play('potatoPrep', acts);
    expect(p.state.prepStock.potato).toBe(before + cfg.potatoPerLargePad);
    expect(p.state.tutorial).toBeNull();
    expect(p.state.toast?.text).toBe('ポテトの下調理のチュートリアル完了！');
    expect(p.state.mistakes).toBe(0);
  });

  for (const c of [cfg, PLAY_CONFIG]) {
    it(`道具の手：台の上に置いたやっとこ・ヘラを F で取り、熱い器をつかんで作業枠に置き、はがして、ヘラを台に置くと完了する（hotHandling ${c.hotHandling}）`, () => {
      const g0 = new Game(c, () => 0);
      g0.startPractice();
      g0.startTutorial('toolHands');
      expect(g0.state.toolSpots.tongs).toEqual(TOOL_HOME.tongs); // 道具は台の上に置いてある
      expect(g0.state.tickets).toEqual([]);
      expect(g0.hotHandling()).toBe(true); // 熱い器の決まりはオン
      const pan = 'hamburgPan' as const;
      const acts: Act[] = [
        vessel(pan), frame(0), { kind: 'cookBin', id: 'patty' }, frame(0), frame(0), inlet('upper', pan), wait(cfg.ovenUpperTime + 1),
        { tool: { kind: 'placedTool', id: 'tongs' } },
        { tool: outlet('upper') },
        { tool: frame(0) },
        { tool: { kind: 'placedTool', id: 'spatula' } },
        { tool: frame(0) },
        { toolFree: { kind: 'tableTop', surface: TOOL_HOME.tongs.surface, x: TOOL_HOME.tongs.x, z: TOOL_HOME.tongs.z } },
      ];
      const g = play('toolHands', acts, c);
      expect(g.state.tutorial).toBeNull();
      expect(g.state.toast?.text).toBe('道具の手（やっとこ・ヘラ）のチュートリアル完了！');
      expect(g.state.workFrames[0]).toMatchObject({ kind: 'bakeDish', style: pan, cares: ['scrape'] });
      expect(g.state.tool).toBeNull();
    });
  }

  it('道具の手：熱い器は素手では取れない（チュートリアル中でも、このチュートリアルだけは決まりがオン）', () => {
    const g = new Game(cfg, () => 0);
    g.startPractice();
    g.startTutorial('toolHands');
    expect(g.hotHandling()).toBe(true);
    g.startTutorial('hamburg');
    expect(g.hotHandling()).toBe(false); // 品のチュートリアルは、素手の手順のまま
    g.startTutorial('potatoPrep');
    expect(g.hotHandling()).toBe(false);
  });

  it('道具がフックに掛かっていても、矢印はフックを指す', () => {
    const g = new Game(cfg, () => 0);
    g.startPractice();
    g.startTutorial('toolHands');
    g.state.toolSpots = { tongs: null, spatula: null };
    const steps = tutorialSteps('toolHands', cfg)!;
    const take = steps.find((x) => x.label.startsWith('やっとこを取る'))!;
    expect(take.at(g.state)).toEqual({ kind: 'toolHook', id: 'tongs' });
    expect(soloTutorial('toolHands')!.toolsOnTable).toBe(true);
  });
});

describe('クック編 C10：ミッション「クックのチュートリアルを受けよう」', () => {
  const base: Pick<GameState, 'mode' | 'phase' | 'tutorial'> = { mode: 'practice', phase: 'playing', tutorial: null };
  it('最初のミッションを達成するまでは、最初のミッション。達成したら、クックのミッション。両方達成したら出さない', () => {
    expect(MISSIONS.map((m) => m.id)).toEqual(['heat', 'cook']);
    expect(currentMission(base, { heat: false, cook: false })?.id).toBe('heat');
    expect(currentMission(base, { heat: true, cook: false })?.title).toBe('クックのチュートリアルを受けよう！');
    expect(currentMission(base, { heat: true, cook: true })).toBeNull();
    expect(currentMission({ ...base, mode: 'game' }, { heat: true, cook: false })).toBeNull();
    expect(currentMission({ ...base, tutorial: { menuId: 'hamburg', step: 0, total: 3 } }, { heat: true, cook: false })).toBeNull();
  });
  it('クックの達成は、別に保存する', () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    saveCookTutorialCleared(store);
    expect(loadCookTutorialCleared(store)).toBe(true);
    expect(loadTutorialCleared(store)).toBe(false);
  });
  it('クックのチュートリアルか：クックの品と独立したチュートリアルは、クック。ヒートの品は違う', () => {
    expect(isCookTutorial('hamburg')).toBe(true);
    expect(isCookTutorial('tarako')).toBe(false);
    expect(isCookTutorial('potatoPrep')).toBe(true);
  });
});
