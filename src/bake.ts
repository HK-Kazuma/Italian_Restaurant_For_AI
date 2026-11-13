import type { GameConfig } from './config';
import { MOZZ_TOTAL, sauceCheesePizza } from './pizza';
import { MENU, formOf, oldestTicket, type MenuItem } from './recipe';
import type {
  BakeBase,
  BakeCare,
  BakeFinishId,
  BakeLoad,
  BakeLoadId,
  BakeProgress,
  BakeState,
  BakeStyle,
  Item,
  PizzaBuild,
  Ticket,
} from './types';

// 焼き物の表と「段階焼き」（クック編設計書 4.1 / C1）。
//
// 1品 = 段階の並び ＋ 仕上げ。1つの段階は、
//   ①流す前にのせる物（種類・数・のせる位置。前の段階までにのせた物に足す）
//   ②流す前に必要な手入れ（ヘラではがす、など）
//   ③必要な焼き時間（U = 上段1周 の何倍か。整数）
// を持つ。焼け具合は段階ごとに数える。いまの段階で焼いた秒数が、必要な時間ちょうどで「焼き上がり」、足りなければ「生焼け」、
// BURN_RATIO 倍を超えたら「焦げ」。焼き上がった段階のあとに次の段階があれば、流すときに秒数を 0 に戻して次の段階へ進む。
//
// 流すとき・取るとき・提供するときは、器の種類・中身・段階から、当てはまる品をこの表から探す（品の名前で分岐しない）。
// 品を足すときは、recipe.ts の MENU に form: 'bake' の品を足し、この表に同じ id の行を足す。
// 表の値の決まり（同じ中身・同じ段階なら必要な時間が同じ、など）は tableProblems で調べ、テスト（bake.test.ts）で縛る。

type OvenTimes = Pick<GameConfig, 'ovenUpperTime' | 'ovenLowerTime'>;

// 焼いた秒数が、必要な秒数のこの倍を超えると焦げる（焦げたあとは戻らない）
export const BURN_RATIO = 1.25;
const EPS = 1e-6;

export const BAKE_STATE_NAME: Record<BakeState, string> = { raw: '焼く前', half: '生焼け', baked: '焼き上がり', burnt: '焦げた' };

// --- 表の型 ---

// のせる位置（見た目用。位置は表で決まり、自動で入る）
export type LoadSpot = 'all' | 'ring' | 'center' | 'left' | 'right' | 'upperLeft' | 'upperRight' | 'lowerCenter' | 'side';
export type LoadSpec = { id: BakeLoadId; count: number; at?: LoadSpot };

export type BakeStage = {
  load: LoadSpec[]; // この段階を流す前にのせる物（前の段階までの物に足す）。これが「そろった」中身で、器に入る上限にもなる
  minLoad?: LoadSpec[]; // 流せる最低限（省略 = load のすべて）。足りないまま焼いた品は、提供のときに「材料がそろっていない」になる
  care?: BakeCare[]; // この段階を流す前に必要な手入れ
  need: number; // 必要な焼き時間（U = 上段1周 の何倍か。整数）
};

export type BakeFinish = {
  base: BakeBase; // 受け台
  extras?: BakeFinishId[]; // ソース・振る物・のせる物（受け台のほか）
};

export type BakeDish = {
  id: string; // メニューの id（recipe.ts の MENU と同じ）
  vessel: BakeStyle; // 器
  stock?: boolean; // 焼く前の中身が入った山から取る品（ドリアなど）。器の山から取った空の器（blank）からは作れない
  stages: BakeStage[]; // 段階（1つ以上）
  finish: BakeFinish; // 仕上げ
};

// --- 表 ---
// 4.0 のメニュー一覧のうち、いま実装している2品。値は既存の動き（ドリア = 下段1周、ピザ = 上段1周）と同じ。
export const BAKE_TABLE: readonly BakeDish[] = [
  // ミラノドリア：ドリアスタックから取った皿（中身はそのまま）を、L（下段1周 = 上段2周）→ 下駄に乗せる
  { id: 'milanoDoria', vessel: 'doria', stock: true, stages: [{ load: [], need: 2 }], finish: { base: 'geta' } },
  // バッファローピザ：生地 → ピザソース1杯 → ピザチーズ1杯 → モッツァレラ2個（6つ）を、U → お皿に移す。
  // 既存の動きのまま、生地さえのっていれば流せる（材料が足りないまま焼いたピザは、提供で「そろっていない」）
  {
    id: 'buffaloPizza',
    vessel: 'pizza',
    stages: [
      {
        load: [
          { id: 'dough', count: 1, at: 'all' },
          { id: 'pizzaSauce', count: 1, at: 'all' },
          { id: 'pizzaCheese', count: 1, at: 'all' },
          { id: 'mozzarella', count: MOZZ_TOTAL, at: 'ring' },
        ],
        minLoad: [{ id: 'dough', count: 1 }],
        need: 1,
      },
    ],
    finish: { base: 'pizzaPlate' },
  },
];

// --- 名前（案内用）---

export const BAKE_LOAD_NAME: Record<BakeLoadId, { name: string; unit: string }> = {
  dough: { name: 'ピザ生地', unit: '枚' },
  pizzaSauce: { name: 'ピザソース', unit: '杯' },
  pizzaCheese: { name: 'ピザチーズ', unit: '杯' },
  mozzarella: { name: 'モッツァレラ', unit: 'つ' },
  patty: { name: 'パティ', unit: '枚' },
  chicken: { name: 'チキン', unit: '枚' },
  shrimp: { name: 'シュリンプ', unit: 'つ' },
  potato: { name: 'ポテト', unit: '個' },
  corn: { name: 'コーン', unit: '杯' },
  sausage: { name: 'ソーセージ', unit: '本' },
};

// name = 案内の「→ ヘラではがす」、before = 「ヘラではがしてから流す」
export const BAKE_CARE_NAME: Record<BakeCare, { name: string; before: string }> = {
  scrape: { name: 'ヘラではがす', before: 'ヘラではがしてから' },
};

export const BAKE_FINISH_NAME: Record<BakeFinishId, string> = {
  demiglace: 'デミグラスソース',
  cheeseSauce: 'チーズソース',
  vegetablePaste: '野菜ペースト',
  parsley: 'パセリ',
  cinnamon: 'シナモンパウダー',
  garlicSauce: 'ガーリックソース',
  friedEgg: '目玉焼き',
};

// 受け台。hint = 受け台に乗せる前に提供台に出そうとしたときの案内。
// moveFrom = 中身を移す受け台（ピザのお皿）のとき、移す前の器（手に持つ物は受け台の側になる）
export const BAKE_BASES: Record<BakeBase, { name: string; hint: string; moveFrom?: BakeStyle }> = {
  geta: { name: '下駄', hint: '下駄に乗せてから出す（提供台の左の下駄の山をクリック）' },
  pizzaPlate: { name: 'ピザのお皿', hint: 'お皿に入れてから出す（提供台の左のピザのお皿を台に置いて、ピザを入れる）', moveFrom: 'pizza' },
  board: { name: '板', hint: '板に乗せてから出す（提供台の左の板の山をクリック）' },
};

// 器ごとの決まり。pizzaBuild = 中身を既存の PizzaBuild（生地・ソース・チーズ・モッツァレラ）でも数える器
// （pizza を持たない皿は、生地・ソース・チーズがのった見た目 = 既存の決まり）
export const BAKE_VESSELS: Record<BakeStyle, { pizzaBuild: boolean }> = {
  doria: { pizzaBuild: false },
  pizza: { pizzaBuild: true },
  bakingPad: { pizzaBuild: false },
  largePad: { pizzaBuild: false },
  hamburgPan: { pizzaBuild: false },
  eggPan: { pizzaBuild: false },
  soupBowl: { pizzaBuild: false },
};

// 品の名前（メニューにない id はそのまま。テスト用の表など）
export const dishName = (id: string): string => MENU.find((m) => m.id === id)?.name ?? id;

export function getBakeDish(id: string, table: readonly BakeDish[] = BAKE_TABLE): BakeDish | null {
  return table.find((d) => d.id === id) ?? null;
}

// --- 中身の計算 ---

const LOAD_IDS = Object.keys(BAKE_LOAD_NAME) as BakeLoadId[];
const countOf = (load: BakeLoad, id: BakeLoadId): number => load[id] ?? 0;

function addSpecs(load: BakeLoad, specs: readonly LoadSpec[]): BakeLoad {
  const out: BakeLoad = { ...load };
  for (const s of specs) out[s.id] = countOf(out, s.id) + s.count;
  return out;
}

// 中身の範囲（その段階を流せる最低限 min と、そろった中身 max）
export type LoadRange = { min: BakeLoad; max: BakeLoad };

// 品の i 番目の段階を流す前の中身の範囲（前の段階までの物を含む）
export function stageRange(dish: BakeDish, i: number): LoadRange {
  let before: BakeLoad = {};
  for (let k = 0; k < i; k++) before = addSpecs(before, dish.stages[k].load);
  const stage = dish.stages[i];
  return { min: addSpecs(before, stage.minLoad ?? stage.load), max: addSpecs(before, stage.load) };
}

// 品のそろった中身（最後の段階まで）
export const fullLoad = (dish: BakeDish): BakeLoad => stageRange(dish, dish.stages.length - 1).max;

const fits = (load: BakeLoad, r: LoadRange): boolean =>
  LOAD_IDS.every((id) => countOf(load, id) >= countOf(r.min, id) && countOf(load, id) <= countOf(r.max, id));
const within = (load: BakeLoad, max: BakeLoad): boolean => LOAD_IDS.every((id) => countOf(load, id) <= countOf(max, id));
const sameLoad = (a: BakeLoad, b: BakeLoad): boolean => LOAD_IDS.every((id) => countOf(a, id) === countOf(b, id));
const rangesOverlap = (a: LoadRange, b: LoadRange): boolean =>
  LOAD_IDS.every((id) => Math.max(countOf(a.min, id), countOf(b.min, id)) <= Math.min(countOf(a.max, id), countOf(b.max, id)));

// 足りない物（min に対して）
function missingOf(load: BakeLoad, min: BakeLoad): [BakeLoadId, number][] {
  return LOAD_IDS.map((id): [BakeLoadId, number] => [id, countOf(min, id) - countOf(load, id)]).filter(([, n]) => n > 0);
}
const loadText = (list: [BakeLoadId, number][]): string =>
  list.map(([id, n]) => (n > 1 ? `${BAKE_LOAD_NAME[id].name}あと${n}${BAKE_LOAD_NAME[id].unit}` : BAKE_LOAD_NAME[id].name)).join('・');

// 品の i 番目の段階までに必要な手入れ
function caresUpTo(dish: BakeDish, i: number): BakeCare[] {
  return dish.stages.slice(0, i + 1).flatMap((s) => s.care ?? []);
}
const hasAll = <T>(done: readonly T[], need: readonly T[]): boolean => need.every((c) => done.includes(c));
function sameMulti<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  const rest = [...b];
  return a.every((x) => {
    const i = rest.indexOf(x);
    if (i < 0) return false;
    rest.splice(i, 1);
    return true;
  });
}

// 既存のピザの中身（生地・ソース・チーズ・モッツァレラ）を、のせた物と数にする
export function pizzaLoad(p: PizzaBuild): BakeLoad {
  const out: BakeLoad = {};
  if (p.dough) out.dough = 1;
  if (p.sauce) out.pizzaSauce = 1;
  if (p.cheese) out.pizzaCheese = 1;
  if (p.mozz > 0) out.mozzarella = p.mozz;
  return out;
}

// --- 焼き皿の見方 ---

// 焼き皿（手に持つ皿・ベルトの上の皿・お皿に移した中身）を、表と比べられる形にしたもの
// blank = 器の山から取った空の器（焼く前の中身が入った山の品 stock には当てはまらない）
export type BakeView = { vessel: BakeStyle; loaded: BakeLoad; stage: number; cares: readonly BakeCare[]; finishes: readonly BakeFinishId[]; blank?: boolean };
type ProgressLike = { style: BakeStyle; pizza?: PizzaBuild } & BakeProgress;

export function viewOf(x: ProgressLike): BakeView {
  const pizza = x.pizza ?? (BAKE_VESSELS[x.style].pizzaBuild ? sauceCheesePizza() : null);
  let loaded: BakeLoad = pizza ? pizzaLoad(pizza) : {};
  if (x.loaded) for (const id of LOAD_IDS) if (countOf(x.loaded, id) > 0) loaded = { ...loaded, [id]: countOf(loaded, id) + countOf(x.loaded, id) };
  return { vessel: x.style, loaded, stage: x.stage ?? 0, cares: x.cares ?? [], finishes: x.finishes ?? [], ...(x.blank ? { blank: true } : {}) };
}

// 進み具合のうち、何かあるものだけ（何もない項目は持たせない。既存の2品の皿は、いままでと同じ形になる）
export function progressOf(x: BakeProgress): BakeProgress {
  const out: BakeProgress = {};
  if (x.loaded && LOAD_IDS.some((id) => countOf(x.loaded!, id) > 0)) out.loaded = { ...x.loaded };
  if (x.stage) out.stage = x.stage;
  if (x.cares?.length) out.cares = [...x.cares];
  if (x.finishes?.length) out.finishes = [...x.finishes];
  if (x.blank) out.blank = true;
  return out;
}

// 見た目の違い（段階・中身・手入れ・仕上げ）を区別する文字列（描き直しが要るか調べるため）
export function progressSignature(x: BakeProgress): string {
  const loaded = LOAD_IDS.filter((id) => countOf(x.loaded ?? {}, id) > 0).map((id) => `${id}${countOf(x.loaded!, id)}`);
  return `${x.stage ?? 0}|${loaded.join(',')}|${(x.cares ?? []).join(',')}|${[...(x.finishes ?? [])].sort().join(',')}${x.blank ? '|blank' : ''}`;
}

// その品の i 番目の段階に、この皿が当てはまるか（器・中身・手入れ）。空の器の山から取った器は、中身の入った山から取る品（stock）には当てはまらない
export function matchesAt(dish: BakeDish, view: BakeView, i: number): boolean {
  if (view.blank && dish.stock) return false;
  return dish.vessel === view.vessel && i < dish.stages.length && fits(view.loaded, stageRange(dish, i)) && hasAll(view.cares, caresUpTo(dish, i));
}

// i 番目の段階に当てはまる品（複数あれば、必要な時間は同じ。tableProblems で縛っている）
export function candidatesAt(view: BakeView, i: number, table: readonly BakeDish[] = BAKE_TABLE): BakeDish[] {
  return table.filter((d) => matchesAt(d, view, i));
}

export const needSeconds = (stage: BakeStage, cfg: OvenTimes): number => stage.need * cfg.ovenUpperTime;

// いまの段階の必要な秒数（当てはまる品がなければ null）
export function currentNeed(view: BakeView, cfg: OvenTimes, table: readonly BakeDish[] = BAKE_TABLE): number | null {
  const dish = candidatesAt(view, view.stage, table)[0];
  return dish ? needSeconds(dish.stages[view.stage], cfg) : null;
}

// いまの段階で焼いた秒数（cooked）からわかる焼け具合。当てはまる品がない皿（ふつうは流せない）は、焼いていれば生焼けとする
export function stateFor(view: BakeView, cooked: number, cfg: OvenTimes, table: readonly BakeDish[] = BAKE_TABLE): BakeState {
  if (cooked <= EPS) return 'raw';
  const need = currentNeed(view, cfg, table);
  if (need === null || cooked < need - EPS) return 'half';
  return cooked <= need * BURN_RATIO + EPS ? 'baked' : 'burnt';
}

// 品の一覧の名前（同じ中身で当てはまる品が複数あるときは並べる）。2段階以上の品は「n回目」を付ける
export function dishTitle(dishes: readonly BakeDish[], stage: number): string {
  if (dishes.length === 0) return '';
  const names = dishes.length <= 2 ? dishes.map((d) => dishName(d.id)).join('・') : `${dishName(dishes[0].id)}など${dishes.length}品`;
  return dishes[0].stages.length > 1 ? `${names} ${stage + 1}回目` : names;
}

// 次の段階の前にすること（「ヘラではがす」「コーン・ポテトをのせる」）
function nextStepText(dish: BakeDish, stage: number): string {
  const next = dish.stages[stage + 1];
  if (!next) return '';
  const parts = (next.care ?? []).map((c) => BAKE_CARE_NAME[c].name);
  const loads = next.load.map((s): [BakeLoadId, number] => [s.id, s.count]);
  if (loads.length) parts.push(`${loadText(loads)}をのせる`);
  parts.push('流す');
  return parts.join(' → ');
}

// --- 流す ---

export type FlowPlan = { ok: true; stage: number; cooked: number; dishes: BakeDish[] } | { ok: false; reason: string };
type BakeDishLike = ProgressLike & { cooked: number; state: BakeState };

// 入口に流すとしたら、どの段階を、いくつの秒数から焼くか。流せないときは、その理由。
// 焼く前・生焼け = いまの段階の続き（秒数は合計）。焼き上がり = 次の段階があれば、秒数を 0 に戻して次の段階へ。焦げ = 流せない
export function flowPlan(item: BakeDishLike, table: readonly BakeDish[] = BAKE_TABLE): FlowPlan {
  if (item.state === 'burnt') return { ok: false, reason: '焦げている（入口には流せない。右クリックで捨てる）' };
  const view = viewOf(item);
  const next = item.state === 'baked';
  const stage = view.stage + (next ? 1 : 0);
  const dishes = candidatesAt(view, stage, table);
  if (dishes.length > 0) return { ok: true, stage, cooked: next ? 0 : item.cooked, dishes };

  // 流せない理由。この皿が向かっている品（中身が、その段階のそろった中身を超えていない品）のうち、最初のものに足りない物・手入れを出す
  const toward = table.filter(
    (d) =>
      d.vessel === view.vessel &&
      !(view.blank && d.stock) &&
      stage < d.stages.length &&
      within(view.loaded, stageRange(d, stage).max) &&
      (!next || matchesAt(d, { ...view, loaded: clampLoad(view.loaded, stageRange(d, view.stage).max) }, view.stage)),
  );
  if (toward.length === 0) return { ok: false, reason: next ? 'もう焼けている（入口には流せない）' : 'この中身の料理はない（流せない）' };
  const d = toward[0];
  const cares = caresUpTo(d, stage).filter((c) => !view.cares.includes(c));
  if (cares.length) return { ok: false, reason: `${cares.map((c) => BAKE_CARE_NAME[c].before).join('、')}流す` };
  const missing = missingOf(view.loaded, stageRange(d, stage).min);
  return { ok: false, reason: `${loadText(missing)}をのせてから流す` };
}

// 中身のうち、max に入る分だけ（次の段階の物を足し始めた皿が、前の段階の品だったかを調べるため）
function clampLoad(load: BakeLoad, max: BakeLoad): BakeLoad {
  const out: BakeLoad = {};
  for (const id of LOAD_IDS) if (countOf(load, id) > 0) out[id] = Math.min(countOf(load, id), countOf(max, id));
  return out;
}

// --- 入れすぎの防止 ---

// 器に入る数の上限（その器を使う、どの品のそろった中身よりも多くは入らない）
export function vesselCapacity(vessel: BakeStyle, id: BakeLoadId, table: readonly BakeDish[] = BAKE_TABLE): number {
  return Math.max(0, ...table.filter((d) => d.vessel === vessel).map((d) => countOf(fullLoad(d), id)));
}

// この皿に、もう1つのせられるか
export function canLoad(view: BakeView, id: BakeLoadId, table: readonly BakeDish[] = BAKE_TABLE): boolean {
  return countOf(view.loaded, id) < vesselCapacity(view.vessel, id, table);
}

// --- 案内（出口の皿・入口のヒント）---

// 焼き皿のラベル：品名・段階・焼け具合（と、焼き上がりで次の段階があれば、次にすること）。
// 例：「ミラノドリア 焼き上がり」「ハンバーグ 1回目 焼き上がり → ヘラではがす → コーン・ポテトをのせる → 流す」
export function bakeLabel(item: BakeDishLike, table: readonly BakeDish[] = BAKE_TABLE): string {
  const view = viewOf(item);
  const dishes = candidatesAt(view, view.stage, table);
  const state = BAKE_STATE_NAME[item.state];
  if (dishes.length === 0) return state;
  const text = `${dishTitle(dishes, view.stage)} ${state}`;
  const next = item.state === 'baked' ? nextStepText(dishes[0], view.stage) : '';
  return next ? `${text} → ${next}` : text;
}

// --- 提供 ---

// 焼き皿が乗せてある受け台（下駄・板。なければ null）
export function baseOf(item: Pick<Extract<Item, { kind: 'bakeDish' }>, 'geta' | 'board'>): BakeBase | null {
  return item.geta ? 'geta' : item.board ? 'board' : null;
}

// 提供台に出そうとしている物を、表と比べられる形にしたもの（base = 乗せてある受け台。なければ null）
type Served = { view: BakeView; state: BakeState; base: BakeBase | null };

function servedOf(item: Item | null): Served | null {
  if (!item) return null;
  if (item.kind === 'bakeDish') return { view: viewOf(item), state: item.state, base: baseOf(item) };
  if (item.kind === 'pizzaPlate' && item.dish && BAKE_BASES.pizzaPlate.moveFrom) {
    return { view: viewOf({ ...item.dish, style: BAKE_BASES.pizzaPlate.moveFrom }), state: item.dish.state, base: 'pizzaPlate' };
  }
  return null;
}

// 最後の段階まで焼き上がっている品（中身はその段階を流せる範囲。そろっているか、仕上げ・受け台は、まだ見ない）
function finishedCandidates(s: Served, table: readonly BakeDish[]): BakeDish[] {
  if (s.state !== 'baked') return [];
  return candidatesAt(s.view, s.view.stage, table).filter((d) => d.stages.length === s.view.stage + 1);
}

// 手に持った物が提供できる焼き物なら、その品。最後の段階が焼き上がりで、中身がそろっていて、受け台と仕上げがそろっているもの
export function servableDish(item: Item | null, table: readonly BakeDish[] = BAKE_TABLE): BakeDish | null {
  const s = servedOf(item);
  if (!s) return null;
  return (
    finishedCandidates(s, table).find(
      (d) => d.finish.base === s.base && sameLoad(s.view.loaded, fullLoad(d)) && sameMulti(s.view.finishes, d.finish.extras ?? []),
    ) ?? null
  );
}

// 手に持った焼き皿を、その受け台に乗せられる・移せるか（最後の段階が焼き上がりで、受け台がそれの品）
export function canTakeBase(item: Item | null, base: BakeBase, table: readonly BakeDish[] = BAKE_TABLE): boolean {
  if (item?.kind !== 'bakeDish' || baseOf(item) !== null) return false;
  const s = servedOf(item);
  return s !== null && finishedCandidates(s, table).some((d) => d.finish.base === base);
}

// 提供台に視点を合わせたときの案内（焼き物でなければ null）
export function serveHint(item: Item | null, table: readonly BakeDish[] = BAKE_TABLE): string | null {
  const s = servedOf(item);
  if (!s) return null;
  const ready = servableDish(item, table);
  if (ready) return `左クリック：${dishName(ready.id)}を提供台に出す`;
  if (s.state === 'burnt') return '焦げていて提供できない（右クリックで捨てる）';
  if (s.state === 'half') return '生焼けで提供できない（もう一度、入口に流して焼く）';
  if (s.state === 'raw') return '焼き上がっていない皿は出せない';
  const finished = finishedCandidates(s, table);
  if (finished.length === 0) {
    const now = candidatesAt(s.view, s.view.stage, table)[0];
    return now ? `まだ途中（${nextStepText(now, s.view.stage)}）` : 'この中身の料理はない（提供できない）';
  }
  const d = finished.find((x) => x.finish.base === s.base) ?? finished[0];
  if (d.finish.base !== s.base) return s.base === null ? BAKE_BASES[d.finish.base].hint : `${BAKE_BASES[s.base].name}では出せない`;
  const missing = missingOf(s.view.loaded, fullLoad(d));
  if (missing.length) return `${dishName(d.id)}の材料がそろっていない（${loadText(missing)}）`;
  const extras = (d.finish.extras ?? []).filter((f) => !s.view.finishes.includes(f));
  if (extras.length) return `仕上げが足りない（${extras.map((f) => BAKE_FINISH_NAME[f]).join('・')}）`;
  return 'この仕上げの料理はない（提供できない）';
}

// その品の伝票のうち、最も古いもの（なければ null = 注文ミス）
export function findBakedTicket(dishId: string, tickets: readonly Ticket[]): Ticket | null {
  return oldestTicket(tickets.filter((t) => t.menuId === dishId));
}

// 焼き物の品（形が「焼き物」の品）
export function bakedMenus(menus: readonly MenuItem[] = MENU): MenuItem[] {
  return menus.filter((m) => formOf(m) === 'bake');
}

// --- 表の整合性 ---
// 守れていない決まりの一覧（空なら OK）。テストで BAKE_TABLE が空になることを確かめる
//   ① 同じ器・同じ中身・同じ段階で当てはまる品どうしは、必要な時間が同じ
//   ② 必要な時間は U の整数倍（1以上）
//   ③ ある品の流す前の中身（1回目）が、同じ器の別の品（同じ品も含む）の途中（2回目以降）の中身と区別できる
//   ④ 流せる最低限は、そろった中身を超えない
//   ⑤ 器・段階・仕上げがまったく同じ品は、2つ置かない（提供のときに区別できない）
//   ⑥ id が重複しない
export function tableProblems(table: readonly BakeDish[] = BAKE_TABLE): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const d of table) {
    if (ids.has(d.id)) out.push(`⑥ ${d.id}：id が重複している`);
    ids.add(d.id);
    if (d.stages.length === 0) out.push(`${d.id}：段階がない`);
    d.stages.forEach((st, i) => {
      if (!Number.isInteger(st.need) || st.need < 1) out.push(`② ${d.id} ${i + 1}回目：必要な時間 ${st.need} が U の整数倍ではない`);
      const r = stageRange(d, i);
      if (!within(r.min, r.max)) out.push(`④ ${d.id} ${i + 1}回目：流せる最低限が、そろった中身を超えている`);
    });
  }
  for (const a of table) {
    for (const b of table) {
      if (a.vessel !== b.vessel) continue;
      const n = Math.min(a.stages.length, b.stages.length);
      if (a !== b) {
        for (let i = 0; i < n; i++) {
          if (rangesOverlap(stageRange(a, i), stageRange(b, i)) && a.stages[i].need !== b.stages[i].need) {
            out.push(`① ${a.id} と ${b.id}：${i + 1}回目の中身が同じなのに、必要な時間が違う`);
          }
        }
        if (a.id < b.id && JSON.stringify([a.stages, a.finish]) === JSON.stringify([b.stages, b.finish])) {
          out.push(`⑤ ${a.id} と ${b.id}：段階と仕上げがまったく同じ`);
        }
      }
      if (a.stages.length === 0) continue;
      for (let j = 1; j < b.stages.length; j++) {
        if (rangesOverlap(stageRange(a, 0), stageRange(b, j))) out.push(`③ ${a.id} の1回目の中身が、${b.id} の${j + 1}回目の中身と区別できない`);
      }
    }
  }
  return out;
}
