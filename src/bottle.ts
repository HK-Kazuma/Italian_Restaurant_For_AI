import type { BakeFinishId, BakeLoadId, BottleId, FridgeBottleId, FridgeItemId, SurfaceId } from './types';

// ボトル（手に持って、右クリックで皿にかける・振る物）ごとの決まり。

// granMoravia・cinnamon・garlicSauce は、クック用のボトル（クック編 C6。作業台に置き、作業枠の焼き物に振る・かける）
export const BOTTLE_IDS: BottleId[] = ['dressing', 'paprika', 'garum', 'parsley', 'blackPepper', 'granMoravia', 'cinnamon', 'garlicSauce'];

// クック用のボトル（作業台に置ける。ヒートのボトルは作業台に置けない）
export const COOK_BOTTLE_IDS: readonly BottleId[] = ['granMoravia', 'cinnamon', 'garlicSauce'];

// 最初は冷蔵庫にしまってあるボトル（冷蔵庫の中の物としての id）。取り出すと、ほかのボトルと同じように台の上に置ける
export const BOTTLE_FRIDGE_ITEM: Record<FridgeBottleId, FridgeItemId> = {
  dressing: 'dressingBottle',
  paprika: 'paprikaBottle',
  garum: 'garumBottle',
};
export const isFridgeBottle = (id: string): id is FridgeBottleId => id in BOTTLE_FRIDGE_ITEM;

// 冷蔵庫の中の物が、ボトルならその種類（そうでなければ null）
export function bottleOfFridgeItem(item: FridgeItemId): FridgeBottleId | null {
  return (Object.keys(BOTTLE_FRIDGE_ITEM) as FridgeBottleId[]).find((id) => BOTTLE_FRIDGE_ITEM[id] === item) ?? null;
}

// 置ける台。ドレッシング・パプリカパウダー・ガルムソースはサラダ台だけ、パセリとブラックペッパーはどの台にも置ける（作業台は除く）。
// クック用のボトル（グランモラビア・シナモンパウダー・ガーリックソース）は、作業台（prep）と、壁の吊り棚（shelf）だけ
export const BOTTLE_SURFACES: Record<BottleId, SurfaceId[]> = {
  dressing: ['salad'],
  paprika: ['salad'],
  garum: ['salad'],
  parsley: ['salad', 'left', 'hotWater'],
  blackPepper: ['salad', 'left', 'hotWater'],
  granMoravia: ['prep', 'shelf'],
  cinnamon: ['prep', 'shelf'],
  garlicSauce: ['prep', 'shelf'],
};

// かけられる皿。サラダの皿（サラダ台）か、パスタの皿（左の台）か、焼き物だけ（bake = 作業枠の焼き物。クック用のボトル）
export const BOTTLE_PLATE: Record<BottleId, 'salad' | 'pasta' | 'bake'> = {
  dressing: 'salad',
  paprika: 'salad',
  garum: 'salad',
  parsley: 'pasta',
  blackPepper: 'pasta',
  granMoravia: 'bake',
  cinnamon: 'bake',
  garlicSauce: 'bake',
};

// 焼き物にも振れるボトルと、振ったときに付く焼き物の仕上げ（bake.ts の表の finish.extras）。
// 受け台に乗せた焼き上がりの器（作業枠の上）に振る。振りすぎ（その品の仕上げより多く振る）は、出すと注文ミス（パスタの皿と同じ決まり）
export const BOTTLE_BAKE_FINISH: Partial<Record<BottleId, BakeFinishId>> = {
  parsley: 'parsley',
  cinnamon: 'cinnamon',
  garlicSauce: 'garlicSauce',
};

// 焼く前の器に振ると、のせる物（bake.ts の表の load）になるボトル（クック編 C6）。
// 作業枠の、焼く前の器に振る。のせられるか（数・下敷き）は、器に具を入れるのと同じ決まり（bake.ts の loadRoom）
export const BOTTLE_BAKE_LOAD: Partial<Record<BottleId, BakeLoadId>> = {
  granMoravia: 'granMoravia',
};

// 右クリックしたときの、画面に出す言い方
export const BOTTLE_VERB: Record<BottleId, string> = {
  dressing: 'かけた',
  paprika: '振った',
  garum: 'かけた',
  parsley: '振った',
  blackPepper: '振った',
  granMoravia: '振った',
  cinnamon: '振った',
  garlicSauce: 'かけた',
};

export const BOTTLE_ACTION: Record<BottleId, string> = {
  dressing: 'ドレッシングをかける',
  paprika: 'パプリカパウダーを振る',
  garum: 'ガルムソースをかける',
  parsley: 'パセリを振る',
  blackPepper: 'ブラックペッパーを振る',
  granMoravia: 'グランモラビアを振る',
  cinnamon: 'シナモンパウダーを振る',
  garlicSauce: 'ガーリックソースをかける',
};
