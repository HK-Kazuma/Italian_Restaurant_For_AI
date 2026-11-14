import { describe, expect, it } from 'vitest';
import { BAKE_TABLE, bakeSummary, getBakeDish } from './bake';
import { cardNote, menuPath, menuSections, pickCategory } from './menuList';
import { POSITIONS, getPosition } from './position';
import { MENU, MENU_CATEGORIES, getMenu, type MenuCategory } from './recipe';

// iPad の一覧（クック編設計書 4.9 / C9 の前半）：ポジション → 分類のタブ → カード
// C3 の6品は 2026-11-14 に MENU・BAKE_TABLE へ登録したので、全品 = 登録済みの MENU・BAKE_TABLE
const ALL_MENU = MENU;
const ALL_TABLE = BAKE_TABLE;

const HEAT_CATEGORIES: readonly MenuCategory[] = ['pasta', 'heatStarter', 'heatSoup'];
const COOK_CATEGORIES: readonly MenuCategory[] = ['cookStarter', 'meat', 'pizza', 'doriaGratin', 'cookSoup', 'bread'];

describe('分類の表', () => {
  it('ヒート3つ・クック6つの分類が、名前と英字つきで並ぶ', () => {
    expect(MENU_CATEGORIES.map((c) => c.id)).toEqual([...HEAT_CATEGORIES, ...COOK_CATEGORIES]);
    expect(MENU_CATEGORIES.map((c) => c.name)).toEqual(['パスタ', 'サラダ・前菜', 'スープ', '前菜', '肉料理', 'ピザ', 'ドリア＆グラタン', 'スープ', '焼きたてパン']);
    for (const c of MENU_CATEGORIES) expect(c.en).toMatch(/^[A-Z &]+$/);
    expect(new Set(MENU_CATEGORIES.map((c) => c.id)).size).toBe(MENU_CATEGORIES.length);
  });

  it('全品（ヒート15品・クック8品）が、表にある分類のどれか1つに入る', () => {
    expect(ALL_MENU).toHaveLength(23);
    const ids = new Set(MENU_CATEGORIES.map((c) => c.id));
    for (const m of ALL_MENU) expect(ids.has(m.category), m.id).toBe(true);
  });

  it('ヒートの品はヒートの分類、クックの品はクックの分類', () => {
    for (const m of ALL_MENU) {
      const heat = getPosition('heat').stations.includes(m.station);
      expect(heat ? HEAT_CATEGORIES : COOK_CATEGORIES, m.id).toContain(m.category);
    }
  });

  it('分類ごとの品の数（パスタ8・サラダ前菜6・スープ1・ピザ4・ドリア4）', () => {
    const count = (c: MenuCategory) => ALL_MENU.filter((m) => m.category === c).length;
    expect(HEAT_CATEGORIES.map(count)).toEqual([8, 6, 1]);
    expect(count('pizza')).toBe(4);
    expect(count('doriaGratin')).toBe(4);
  });

  it('番号は、いまはどの品も省略', () => {
    for (const m of ALL_MENU) expect(m.no).toBeUndefined();
  });
});

describe('一覧の分類分け（menuSections）', () => {
  it('どのポジションでも、一覧に出る品は、そのポジションの伝票に出せる品とちょうど同じ（重複なし・漏れなし）', () => {
    for (const p of POSITIONS) {
      for (const [menus, table] of [[MENU, BAKE_TABLE]] as const) {
        const listed = menuSections(p.id, menus, table).flatMap((s) => s.cards.map((c) => c.id));
        const expected = menus.filter((m) => m.enabled && p.stations.includes(m.station)).map((m) => m.id);
        expect(new Set(listed).size).toBe(listed.length);
        expect([...listed].sort()).toEqual([...expected].sort());
      }
    }
  });

  it('分類は表の順、分類の中はメニュー表の順。品のない分類はタブを出さない', () => {
    expect(menuSections('heat').map((s) => s.category.id)).toEqual(HEAT_CATEGORIES);
    expect(menuSections('cook').map((s) => s.category.id)).toEqual(['pizza', 'doriaGratin']);
    expect(menuSections('all').map((s) => s.category.id)).toEqual([...HEAT_CATEGORIES, 'pizza', 'doriaGratin']);
    const pasta = menuSections('heat')[0];
    expect(pasta.cards.map((c) => c.id)).toEqual(MENU.filter((m) => m.category === 'pasta').map((m) => m.id));
  });

  it('C3 の6品（登録済み）は、ピザ・ドリアの分類にメニュー表の順で入る', () => {
    const cook = menuSections('cook');
    expect(cook.map((s) => [s.category.id, s.cards.map((c) => c.id)])).toEqual([
      ['pizza', ['buffaloPizza', 'vegMushroomPizza', 'sausagePizza', 'cornPizza']],
      ['doriaGratin', ['milanoDoria', 'cheeseMilanoDoria', 'tarakoDoria', 'tarakoGratin']],
    ]);
  });

  it('分類の先頭の1品だけが大きいカード', () => {
    for (const p of POSITIONS) {
      for (const s of menuSections(p.id, ALL_MENU, ALL_TABLE)) {
        expect(s.cards.map((c) => c.big)).toEqual(s.cards.map((_, i) => i === 0));
      }
    }
  });

  it('カードには品名・点数・分類の色（サムネの色の四角）が入る', () => {
    const card = menuSections('cook')[0].cards[0];
    expect(card).toMatchObject({ id: 'buffaloPizza', name: 'バッファローピザ', station: 'cook', points: 50, big: true });
    expect(card.color).toBe(MENU_CATEGORIES.find((c) => c.id === 'pizza')!.color);
    expect(card.no).toBeUndefined();
  });

  it('伝票に出ない品（enabled: false）は一覧に出ない', () => {
    const menus = MENU.map((m) => (m.id === 'tarako' ? { ...m, enabled: false } : m));
    const ids = menuSections('heat', menus).flatMap((s) => s.cards.map((c) => c.id));
    expect(ids).not.toContain('tarako');
    expect(menuPath('tarako', menus)).toBeNull();
  });
});

describe('どの品にも3回のタップで着く（ポジション → 分類のタブ → カード）', () => {
  it.each([['いまの MENU（C3 の6品を登録済み）', MENU, BAKE_TABLE]] as const)('%s', (_, menus, table) => {
    for (const m of menus.filter((x) => x.enabled)) {
      const path = menuPath(m.id, menus, table);
      expect(path, m.id).not.toBeNull();
      // 1回目：ポジションのタブ（POSITIONS にある）
      expect(POSITIONS.map((p) => p.id)).toContain(path!.position);
      // 2回目：分類のタブ（そのポジションの一覧にある）
      const section = menuSections(path!.position, menus, table).find((s) => s.category.id === path!.category);
      expect(section, m.id).toBeDefined();
      // 3回目：カード（その分類にある）
      expect(section!.cards.map((c) => c.id)).toContain(m.id);
    }
  });

  it('ヒートの品はヒート、クックの品はクックのタブから着く（担当の狭いポジションが先）', () => {
    expect(menuPath('tarako')).toEqual({ position: 'heat', category: 'pasta' });
    expect(menuPath('cornSoup')).toEqual({ position: 'heat', category: 'heatSoup' });
    expect(menuPath('milanoDoria')).toEqual({ position: 'cook', category: 'doriaGratin' });
  });
});

describe('選んでおく分類（pickCategory）', () => {
  it('前の分類がそのポジションにもあれば残し、なければ先頭', () => {
    expect(pickCategory(menuSections('all'), 'pizza')).toBe('pizza');
    expect(pickCategory(menuSections('heat'), 'pizza')).toBe('pasta');
    expect(pickCategory(menuSections('cook'), null)).toBe('pizza');
    expect(pickCategory([], 'pizza')).toBeNull();
  });
});

describe('カードの一言（焼き方の要約）', () => {
  it('焼き物は表から：ドリアは「下段1周 → 下駄」、ピザは「上段1周 → ピザのお皿」', () => {
    const note = (id: string) => cardNote(ALL_MENU.find((m) => m.id === id)!, ALL_TABLE);
    expect(note('milanoDoria')).toBe('下段1周 → 下駄');
    expect(note('buffaloPizza')).toBe('上段1周 → ピザのお皿');
    expect(note('cheeseMilanoDoria')).toBe('下段1周 → 下駄 → パセリ');
    expect(note('cornPizza')).toBe('上段1周 → ピザのお皿');
  });

  it('要約は表の値から作る（段階・手入れ・仕上げが変われば変わる）', () => {
    const doria = getBakeDish('milanoDoria')!;
    expect(bakeSummary({ ...doria, stages: [{ load: [], need: 1 }, { load: [], care: ['scrape'], need: 2 }], finish: { base: 'board', extras: ['demiglace'] } })).toBe(
      '上段1周 → ヘラではがす → 下段1周 → 板 → デミグラスソース',
    );
  });

  it('皿の品は、鍋で加熱する分があれば「鍋で加熱」、なければ空。一言を持つ品は、その一言', () => {
    const menu = (id: string) => MENU.find((m) => m.id === id)!;
    expect(cardNote(menu('meat'))).toBe('鍋で加熱');
    expect(cardNote(menu('tarako'))).toBe('');
    expect(cardNote({ ...menu('tarako'), note: 'のりは最後' })).toBe('のりは最後');
  });

  it('表に行のない焼き物は、一言なし', () => {
    // C3 の6品の登録（2026-11-14）で、表に行のない焼き物がなくなったため、その品の行を除いた表で確かめる
    expect(cardNote(getMenu('cheeseMilanoDoria'), BAKE_TABLE.filter((d) => d.id !== 'cheeseMilanoDoria'))).toBe('');
  });
});
