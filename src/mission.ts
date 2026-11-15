import type { GameState } from './types';

// 練習キッチンの左上に出す「チュートリアルを受けよう」のミッション。
// どれか1つのチュートリアルを最後までやり遂げたら達成で、そのブラウザでは、もう出さない。
// クック編 C10：それを達成したあとは「クックのチュートリアルを受けよう」を出す（クックの品のチュートリアルを最後までやり遂げたら達成）

const STORAGE_KEY = 'kitchen-time-attack:tutorial-cleared';
const COOK_STORAGE_KEY = 'kitchen-time-attack:cook-tutorial-cleared';

// ミッションの表（順に出す。前のミッションを達成したら、次を出す）
export type MissionId = 'heat' | 'cook';
export const MISSIONS: readonly { id: MissionId; title: string; how: string }[] = [
  { id: 'heat', title: 'チュートリアルを受けよう！', how: '後ろの壁の iPad を取って右クリック →「チュートリアル」' },
  { id: 'cook', title: 'クックのチュートリアルを受けよう！', how: 'iPad の「チュートリアル」で、クックの品を選ぼう' },
];

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): Store | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function loadTutorialCleared(store: Store | null = defaultStore(), key = STORAGE_KEY): boolean {
  try {
    return store?.getItem(key) === '1';
  } catch {
    return false; // 読めなければ、まだ受けていない扱い
  }
}

export function saveTutorialCleared(store: Store | null = defaultStore(), key = STORAGE_KEY): void {
  try {
    store?.setItem(key, '1');
  } catch {
    // 保存できなくても遊べる（次に開いたとき、また出る）
  }
}

// ミッションを出すか：練習キッチンで、チュートリアルの最中ではなく、まだ達成していないとき
export function showMission(state: Pick<GameState, 'mode' | 'phase' | 'tutorial'>, cleared: boolean): boolean {
  if (cleared || state.tutorial !== null) return false;
  return state.mode === 'practice' && (state.phase === 'playing' || state.phase === 'paused');
}

// クックのチュートリアルを受けたか（クック編 C10）
export const loadCookTutorialCleared = (store: Store | null = defaultStore()): boolean => loadTutorialCleared(store, COOK_STORAGE_KEY);
export const saveCookTutorialCleared = (store: Store | null = defaultStore()): void => saveTutorialCleared(store, COOK_STORAGE_KEY);

// いま出すミッション（出さないときは null）。cleared = 各ミッションを達成したか。前のミッションを達成するまで、次は出さない
export function currentMission(
  state: Pick<GameState, 'mode' | 'phase' | 'tutorial'>,
  cleared: Readonly<Record<MissionId, boolean>>,
): (typeof MISSIONS)[number] | null {
  const next = MISSIONS.find((m) => !cleared[m.id]);
  return next && showMission(state, false) ? next : null;
}
