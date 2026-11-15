import type { Game } from './game';
import type { Target } from './types';
// テストだけが使う共有の定数（実装コードからは読まない。ゲームの本体には入らない）。

// チュートリアルのテストの対象から、当面外す品（C7 の鉄板焼き6品のうち、まだ完走テストで裏付けが取れていない品。2026-11-15 に所有者の承認を得て対象外にした）。
// ステップK1 で6品とも裏付けが取れたため、いまは空（定数を消すかどうかは、これを読む3つのテストファイルの整理と合わせて決める）。
//
// C7 の6品は2段階の品（鉄板で1回目 → ヘラではがす → 付け合わせ → 2回目）と、目玉焼き・ソース（レードル・チーズソースの容器）を含み、
// 工程を表から作る形（C10 の自動生成）がなかったため、チュートリアルを用意していなかった（品ごとの手書きの台本は作らない。設計書 §6）。
// ステップK1 で、表から2段階・ヘラではがす・レードル・ヘラですくう付け合わせ（目玉焼き）・チーズソースの容器の工程を作れるようにし、
// 完走テスト（tutorial.test.ts の「メニューを最後まで作る」）で裏付けが取れた品から、この一覧を外している。
// 「提供できる品すべてに工程がある」系のテストは、この一覧の品を除いた残りを今までどおり全件確かめ、
// 「メニューを最後まで作る」のテストは、この一覧の品をケースから外す（ケースそのものは消さない）。
//
// 戻し条件：完走テストの台本（tutorial.test.ts の SCRIPTS）を足し、通ったら、その品をこの一覧から外す（一覧が空になったら、この定数ごと消す）。
export const TUTORIAL_PENDING_C10: readonly string[] = [];

// チュートリアルの先頭の「準備：」の工程（冷蔵庫からケース・パックを出して置く）を、矢印の指すとおりに進める。準備のないメニューでは、何もしない
export function followPrep(g: Game): void {
  for (let i = 0; i < 300; i++) {
    const v = g.tutorialView();
    if (!v || !v.labels[v.step]?.startsWith('準備：')) return;
    const guide = g.tutorialGuide();
    if (!guide) throw new Error(`準備の工程 ${v.step + 1}: 矢印が出ていない`);
    const at = guide.at;
    const target: Target = at.kind === 'surfaceSpot' ? { kind: 'tableTop', surface: at.surface, x: at.x, z: at.z } : (at as Target);
    if (target.kind === 'fridgeDoor') g.rightClick(target);
    else g.interact(target);
    g.update(0.01);
  }
  throw new Error('準備の工程が終わらない');
}
