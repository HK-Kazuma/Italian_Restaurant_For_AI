import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import { Game } from './game';
import { MOZZ_TOTAL } from './pizza';
import { bakeItem, bakeState, frontS, stateOnExit } from './oven';
import type { BakeState, BakeStyle, OvenDeck, PizzaBuild, Target } from './types';

// ステップB（クック編 4.1）の前に足した、既存の2品の焼け方を固定するテスト。
// 焼き時間の決め方を「皿の種類で決め打ち」から「bake.ts の表」に変えても、結果が同じであることを確かめる。
// 変更前のコードにもある関数（Game・bakeState・bakeItem・stateOnExit）だけを使う。
// 比べる相手は、変更前の決まり（ドリア系 = 下段の時間、ピザ系 = 上段の時間。合計の秒数で、ちょうど = 焼き上がり、1.25倍超 = 焦げ）をここに書き直したもの。

const OLD_BURN_RATIO = 1.25;
function oldState(style: BakeStyle, cooked: number): BakeState {
  const need = style === 'doria' ? cfg.ovenLowerTime : cfg.ovenUpperTime;
  if (cooked <= 1e-6) return 'raw';
  if (cooked < need - 1e-6) return 'half';
  return cooked <= need * OLD_BURN_RATIO + 1e-6 ? 'baked' : 'burnt';
}
const deckTime = (deck: OvenDeck) => (deck === 'upper' ? cfg.ovenUpperTime : cfg.ovenLowerTime);

// 上段・下段の並び（3回まで）すべて
const SEQUENCES: OvenDeck[][] = [];
for (const a of ['upper', 'lower'] as const) {
  SEQUENCES.push([a]);
  for (const b of ['upper', 'lower'] as const) {
    SEQUENCES.push([a, b]);
    for (const c of ['upper', 'lower'] as const) SEQUENCES.push([a, b, c]);
  }
}

const inlet = (deck: OvenDeck, style: BakeStyle): Target => ({ kind: 'ovenInlet', deck, x: 0, s: frontS(style) });
const outlet = (deck: OvenDeck, style: BakeStyle): Target => ({ kind: 'ovenOutlet', deck, lane: style === 'doria' ? 1 : 0 });

function newGame(): Game {
  const g = new Game(cfg, () => 0);
  g.start();
  g.state.nextTicketAt = Infinity;
  return g;
}

describe('既存の2品の焼け方は、表に移しても変わらない', () => {
  it('bakeState：0〜3周ぶんの秒数（5秒きざみ）で、変更前と同じ', () => {
    for (const style of ['doria', 'pizza'] as const) {
      for (let t = 0; t <= cfg.ovenLowerTime * 3; t += 5) expect(bakeState(style, t, cfg), `${style} ${t}`).toBe(oldState(style, t));
    }
  });

  it('bakeItem：ピザ系は、のっている物（生地だけ・モッツァレラ途中・そろった）に関係なく、同じ焼け方', () => {
    const builds: PizzaBuild[] = [
      { dough: true, sauce: false, cheese: false, mozz: 0 },
      { dough: true, sauce: true, cheese: true, mozz: 3 },
      { dough: true, sauce: true, cheese: true, mozz: MOZZ_TOTAL },
    ];
    for (const p of builds) {
      for (const t of [0, cfg.ovenUpperTime, cfg.ovenLowerTime]) {
        expect(bakeItem('pizza', t, cfg, p)).toEqual({ kind: 'bakeDish', style: 'pizza', cooked: t, state: oldState('pizza', t), pizza: p });
      }
    }
    expect(bakeItem('doria', cfg.ovenLowerTime, cfg)).toEqual({ kind: 'bakeDish', style: 'doria', cooked: cfg.ovenLowerTime, state: 'baked' });
  });

  it('stateOnExit：出口で取ったときの焼け具合が、変更前と同じ', () => {
    for (const style of ['doria', 'pizza'] as const) {
      for (const deck of ['upper', 'lower'] as const) {
        for (const before of [0, cfg.ovenUpperTime]) {
          expect(stateOnExit({ style, cooked: before }, deck, cfg)).toBe(oldState(style, before + deckTime(deck)));
        }
      }
    }
  });

  // ゲームの操作で、山から取って、段の並びどおりに流しては取る（焼き上がり・焦げたら止める）
  for (const style of ['doria', 'pizza'] as const) {
    it(`Game：${style === 'doria' ? 'ドリア' : 'ピザ系'}を上段・下段の並び（3回まで）で流して取ると、手の皿・入口の案内が変更前と同じ`, () => {
      for (const seq of SEQUENCES) {
        const g = newGame();
        g.interact({ kind: 'ovenStock', style });
        let cooked = 0;
        for (const deck of seq) {
          const expected = oldState(style, cooked);
          if (expected === 'baked' || expected === 'burnt') {
            expect(g.planInteract(inlet(deck, style)), seq.join('→')).toBeNull(); // 焼き上がり・焦げは流せない
            break;
          }
          expect(g.ovenHint(inlet(deck, style))).toContain(`→ ${({ raw: '焼く前', half: '生焼け', baked: '焼き上がり', burnt: '焦げた' } as const)[oldState(style, cooked + deckTime(deck))]}`);
          g.interact(inlet(deck, style));
          for (let t = 0; t < deckTime(deck) + 1; t++) g.update(1);
          g.interact(outlet(deck, style));
          cooked += deckTime(deck);
          expect(g.state.hand, seq.join('→')).toEqual({ kind: 'bakeDish', style, cooked, state: oldState(style, cooked) });
        }
      }
    });
  }
});
