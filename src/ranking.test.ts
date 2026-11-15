import { afterEach, describe, expect, it, vi } from 'vitest';
import { NAME_MAX, SCORE_MAX, cleanName, validScore } from './ranking';

describe('ranking: 名前とスコアの整え方', () => {
  it('前後の空白と制御文字を取り、空ならゲストにする', () => {
    expect(cleanName('  たなか  ')).toBe('たなか');
    expect(cleanName('a\nb\tc')).toBe('abc');
    expect(cleanName('   ')).toBe('ゲスト');
    expect(cleanName('')).toBe('ゲスト');
  });

  it(`名前は${NAME_MAX}文字までに切る（絵文字などの2文字分も1文字と数える）`, () => {
    expect(cleanName('あ'.repeat(30))).toBe('あ'.repeat(NAME_MAX));
    expect([...cleanName('🍝'.repeat(30))]).toHaveLength(NAME_MAX);
  });

  it('スコアは1以上で上限以下の整数だけ登録できる', () => {
    expect(validScore(1)).toBe(true);
    expect(validScore(SCORE_MAX)).toBe(true);
    expect(validScore(0)).toBe(false);
    expect(validScore(-5)).toBe(false);
    expect(validScore(SCORE_MAX + 1)).toBe(false);
    expect(validScore(12.5)).toBe(false);
    expect(validScore(Number.NaN)).toBe(false);
  });
});

describe('ranking: 保存先につながっていないとき', () => {
  // .env.local に Firebase の設定が入っていても「つながっていない」状態を試せるよう、
  // 設定値を空にしてから ranking を読み込み直す（ranking は読み込み時に設定を読むため）
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('準備中になり、一覧は空、登録はエラーになる（ゲームは遊べる）', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '');
    vi.stubEnv('VITE_FIREBASE_APP_ID', '');
    vi.resetModules();
    const { ranking } = await import('./ranking');

    expect(ranking.enabled).toBe(false);
    expect(await ranking.top('leading')).toEqual([]);
    await expect(ranking.submit('leading', 'たなか', 100)).rejects.toThrow();
  });
});
