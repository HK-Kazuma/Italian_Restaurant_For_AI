import { INGREDIENTS } from './ingredients';
import { CASE_SLOT_COUNT } from './layout';
import type { FreeTrayId, FridgeItemId, GameState, IngredientId, Target, TrayId, TrayZone } from './types';

// トレー・ケース：冷蔵庫から取って、サラダ台の置き場に置くと、中身を1回分ずつ取れる。
// 置き場の名前は、どれも「トレー置き場」。置き場は区画（TrayZone）ごとにあり、その区画に置ける種類だけが置ける：
//   spinach … ほうれん草のトレー専用（置き場が1か所）
//   topping … ほうれん草以外の、塩オイルソース・小エビ・サラダチキン・パンチェッタ・きのこ・わかめ・野菜ペースト・ソテーソース・トマトソース。どれをどの置き場に置いてもよい（縦2×横5の10か所）
// ガーリック・唐辛子の容器だけは置き場（区画）を持たず、ボトルと同じように台の上のどこにでも置ける（FREE_TRAY_IDS。置き場所は state.freeTraySpot）。
// 置き場の位置は scene.ts。ここは種類と区画の対応、名前、置き場の空きなど、位置に関係ない決まりだけ。

// クックの具材のケース（作業台のトレー置き場に置く。置いたケースは、それぞれ cookBin / pizzaSource の対象になる）。並びは layout.ts の CASE_KEYS と同じ
export const CASE_TRAY_IDS = ['cPotato', 'cCorn', 'cPatty', 'cChicken', 'cFocaccia', 'cCheeseSauceCup', 'cDemiglace', 'cVegPaste', 'cTarako', 'pSauce', 'pCheese', 'pVegMushroom', 'pSausage', 'pCorn'] as const;
export type CaseTrayId = (typeof CASE_TRAY_IDS)[number];
export const isCaseTray = (id: string): id is CaseTrayId => (CASE_TRAY_IDS as readonly string[]).includes(id);
// ケースの中身を使う対象（ケースを作業台に置くと、この対象で操作できる）
export const CASE_TARGET: Record<CaseTrayId, Target> = {
  cPotato: { kind: 'cookBin', id: 'potato' },
  cCorn: { kind: 'cookBin', id: 'corn' },
  cPatty: { kind: 'cookBin', id: 'patty' },
  cChicken: { kind: 'cookBin', id: 'chicken' },
  cFocaccia: { kind: 'cookBin', id: 'focaccia' },
  cCheeseSauceCup: { kind: 'cookBin', id: 'cheeseSauceCup' },
  cDemiglace: { kind: 'cookBin', id: 'demiglace' },
  cVegPaste: { kind: 'cookBin', id: 'vegPaste' },
  cTarako: { kind: 'cookBin', id: 'tarakoSauce' },
  pSauce: { kind: 'pizzaSource', id: 'sauce' },
  pCheese: { kind: 'pizzaSource', id: 'cheese' },
  pVegMushroom: { kind: 'pizzaSource', id: 'vegMushroom' },
  pSausage: { kind: 'pizzaSource', id: 'sausage' },
  pCorn: { kind: 'pizzaSource', id: 'corn' },
};
// 作業台に置いたケースか、そのケースの対象に視点が合っているときの、ケース（なければ null）
export function caseOfTarget(target: Target | null): CaseTrayId | null {
  if (target?.kind !== 'cookBin' && target?.kind !== 'pizzaSource') return null;
  return CASE_TRAY_IDS.find((id) => {
    const t = CASE_TARGET[id];
    return t.kind === target.kind && (t as { id: string }).id === target.id;
  }) ?? null;
}

export const TRAY_IDS: TrayId[] = ['spinach', 'saltOil', 'shrimp', 'chicken', 'pancetta', 'mushroom', 'wakame', 'vegPaste', 'sauteSauce', 'tomatoSauce', 'garlic', 'chili', ...CASE_TRAY_IDS];

// 台の上のどこにでも置ける容器
export const FREE_TRAY_IDS: FreeTrayId[] = ['garlic', 'chili'];
export const isFreeTray = (id: string): id is FreeTrayId => (FREE_TRAY_IDS as string[]).includes(id);

// その区画の置き場の数（scene.ts の置き場の定義と合わせる）
export const TRAY_SPOT_COUNT: Record<TrayZone, number> = { spinach: 1, topping: 10, cook: CASE_SLOT_COUNT };

// null = 置き場（区画）を持たない（台の上のどこにでも置ける）
export const TRAY_ZONE: Record<TrayId, TrayZone | null> = {
  ...(Object.fromEntries(CASE_TRAY_IDS.map((id) => [id, 'cook'])) as Record<CaseTrayId, TrayZone>),
  spinach: 'spinach',
  saltOil: 'topping',
  shrimp: 'topping',
  chicken: 'topping',
  pancetta: 'topping',
  mushroom: 'topping',
  wakame: 'topping',
  vegPaste: 'topping',
  sauteSauce: 'topping',
  tomatoSauce: 'topping',
  garlic: null,
  chili: null,
};

// 置き場から取れる中身
export const TRAY_CONTENT: Record<Exclude<TrayId, CaseTrayId>, IngredientId> = {
  spinach: 'spinach',
  saltOil: 'saltOilSauce',
  shrimp: 'shrimp',
  chicken: 'chicken',
  pancetta: 'pancetta',
  mushroom: 'mushroom',
  wakame: 'wakame',
  vegPaste: 'vegetablePaste',
  sauteSauce: 'sauteSauce',
  tomatoSauce: 'tomatoSauce',
  garlic: 'garlic',
  chili: 'chili',
};

// 手に持ったときの名前
export const TRAY_NAME: Record<TrayId, string> = {
  cPotato: 'ポテトのケース',
  cCorn: 'コーンのケース',
  cPatty: 'パティのケース',
  cChicken: 'チキンのケース',
  cFocaccia: 'フォッカチオのケース',
  cCheeseSauceCup: 'チーズソースの容器のケース',
  cDemiglace: 'デミグラスソースのケース',
  cVegPaste: '野菜ペーストのケース（クック用）',
  cTarako: 'たらこソースのケース',
  pSauce: 'ピザソースのケース',
  pCheese: 'ピザチーズのケース',
  pVegMushroom: '野菜ときのこのケース',
  pSausage: 'ソーセージのケース',
  pCorn: 'コーンのケース（ピザ用）',
  spinach: 'ほうれん草のトレー',
  saltOil: '塩オイルソースのケース',
  shrimp: '小エビのトレー',
  chicken: 'サラダチキンのトレー',
  pancetta: 'パンチェッタのトレー',
  mushroom: 'きのこのトレー',
  wakame: 'わかめのトレー',
  vegPaste: '野菜ペーストのケース',
  sauteSauce: 'ソテーソースのケース',
  tomatoSauce: 'トマトソースのケース',
  garlic: 'ガーリックの容器',
  chili: '唐辛子の容器',
};

// 置いたあとに置き場に出す名前（中身の名前）
export const trayContentName = (id: TrayId): string => (isCaseTray(id) ? TRAY_NAME[id] : INGREDIENTS[TRAY_CONTENT[id]].name);

// 何も置いていない置き場の名前
export const TRAY_ZONE_NAME: Record<TrayZone, string> = { spinach: 'トレー置き場', topping: 'トレー置き場', cook: 'トレー置き場' };

// 冷蔵庫の中の物としての id
export const TRAY_FRIDGE_ITEM: Record<TrayId, FridgeItemId> = {
  cPotato: 'cPotatoCase',
  cCorn: 'cCornCase',
  cPatty: 'cPattyCase',
  cChicken: 'cChickenCase',
  cFocaccia: 'cFocacciaCase',
  cCheeseSauceCup: 'cCheeseSauceCupCase',
  cDemiglace: 'cDemiglaceCase',
  cVegPaste: 'cVegPasteCase',
  cTarako: 'cTarakoCase',
  pSauce: 'pSauceCase',
  pCheese: 'pCheeseCase',
  pVegMushroom: 'pVegMushroomCase',
  pSausage: 'pSausageCase',
  pCorn: 'pCornCase',
  spinach: 'spinachTray',
  saltOil: 'saltOilCase',
  shrimp: 'shrimpTray',
  chicken: 'chickenTray',
  pancetta: 'pancettaTray',
  mushroom: 'mushroomTray',
  wakame: 'wakameTray',
  vegPaste: 'vegPasteCase',
  sauteSauce: 'sauteSauceCase',
  tomatoSauce: 'tomatoSauceCase',
  garlic: 'garlicBin',
  chili: 'chiliBin',
};

// 冷蔵庫の中の物が、トレー・ケースならその種類（そうでなければ null）
export function trayOfFridgeItem(item: FridgeItemId): TrayId | null {
  return TRAY_IDS.find((id) => TRAY_FRIDGE_ITEM[id] === item) ?? null;
}

type TrayPlacement = Pick<GameState, 'trays' | 'traySpot'>;

// その区画の spot 番目の置き場に置いてあるトレー・ケース（なければ null）
export function trayAt(s: TrayPlacement, zone: TrayZone, spot: number): TrayId | null {
  return TRAY_IDS.find((id) => TRAY_ZONE[id] === zone && s.trays[id] === 'table' && s.traySpot[id] === spot) ?? null;
}

// その区画の、何も置いていない置き場の番号（若い順）
export function freeTraySpots(s: TrayPlacement, zone: TrayZone): number[] {
  return Array.from({ length: TRAY_SPOT_COUNT[zone] }, (_, spot) => spot).filter((spot) => trayAt(s, zone, spot) === null);
}
