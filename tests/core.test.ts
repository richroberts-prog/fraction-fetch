import { describe, expect, it } from 'vitest';
import { clearCells, emptyBoard, findPair, isPair, settle, type Board, type Tile } from '../src/core/board';
import { AFTER, BEFORE, score } from '../src/core/check';
import { displaysFor, displayText, keyOf } from '../src/core/fractions';
import { comboSpecial, COMBO_MS, FINALE_POINTS, Game, makeSpawn, weights } from '../src/core/game';
import { LEVELS, mudTarget, type Level } from '../src/core/levels';
import { afterCheckOpen, boardDogs, currentStreak, Profiles, stickerFor, unlocked, type Store } from '../src/core/profiles';
import { seeded } from '../src/core/rng';

let id = 1000;
const tile = (key: string | null, extra: Partial<Tile> = {}): Tile => ({
  id: id++,
  key,
  display: key ? { form: 'tag', n: Number(key.split('/')[0]), d: Number(key.split('/')[1]) } : null,
  colour: 0,
  dog: 0,
  ...extra,
});

/** Board from rows of letters: each letter is a value. */
const KEYS: Record<string, string> = { a: '1/2', b: '1/3', c: '1/4', d: '2/3', e: '3/4', f: '1/5' };
function board(rows: string[]): Board {
  const b = emptyBoard(rows.length, rows[0].length);
  rows.forEach((row, r) => [...row].forEach((ch, c) => (b.tiles[r][c] = ch === '.' ? null : tile(KEYS[ch]))));
  return b;
}

/** Finds two tiles on a game board: equal values when want is true, different when false. */
function find(g: Game, want: boolean) {
  const cells = g.board.tiles.flatMap((row, r) => row.map((t, c) => ({ r, c, t: t! })));
  for (const x of cells)
    for (const y of cells)
      if ((x.r !== y.r || x.c !== y.c) && !x.t.special && !y.t.special && (x.t.key === y.t.key) === want) return [x, y] as const;
  throw new Error('none');
}

describe('fractions', () => {
  it('equal values share a key whatever the form', () => {
    expect(keyOf({ n: 2, d: 4 })).toBe('1/2');
    expect(keyOf({ n: 50, d: 100 })).toBe('1/2');
    expect(keyOf({ n: 3, d: 10 })).toBe('3/10');
  });

  it('shows a value every allowed way', () => {
    const shown = displaysFor('1/2', ['tag', 'decimal', 'percent'], [2, 4, 12]).map((d) => `${d.form}:${displayText(d)}`);
    expect(shown).toEqual(['tag:1/2', 'tag:2/4', 'tag:6/12', 'decimal:0.5', 'percent:50%']);
  });

  it('skips decimals and percents for values with no exact one', () => {
    expect(displaysFor('1/3', ['decimal', 'percent'], [3])).toEqual([]);
    expect(displaysFor('1/4', ['decimal'], [4]).map(displayText)).toEqual(['0.25']);
  });
});

describe('pairs', () => {
  it('two tiles worth the same make a pair wherever they are, even written differently', () => {
    const b = board(['abc', 'cba']);
    b.tiles[1][2] = { ...tile('1/2'), display: { form: 'percent', n: 50, d: 100 } };
    expect(isPair(b, { r: 0, c: 0 }, { r: 1, c: 2 })).toBe(true);
    expect(isPair(b, { r: 0, c: 0 }, { r: 0, c: 1 })).toBe(false);
    expect(isPair(b, { r: 0, c: 0 }, { r: 0, c: 0 })).toBe(false);
  });

  it('a tennis ball pairs with anything', () => {
    const b = board(['abc']);
    b.tiles[0][1] = tile(null, { special: 'ball' });
    expect(isPair(b, { r: 0, c: 1 }, { r: 0, c: 2 })).toBe(true);
  });

  it('finds a pair for hints', () => {
    expect(findPair(board(['abc', 'dea']))).toEqual([{ r: 0, c: 0 }, { r: 1, c: 2 }]);
    expect(findPair(board(['abc', 'def']))).toBeNull();
  });
});

describe('clearing and falling', () => {
  it('clears tiles, cleans mud under them, and drops tiles in from above', () => {
    const b = board(['bcd', 'aaa', 'cdb']);
    b.mud[1][1] = true;
    const clear = clearCells(b, [{ r: 1, c: 0 }, { r: 1, c: 1 }]);
    expect(clear.removed.map((t) => t.key)).toEqual(['1/2', '1/2']);
    expect(clear.mudCleaned).toEqual([{ r: 1, c: 1 }]);
    const fall = settle(b, () => tile('3/4'));
    expect(fall.moved).toHaveLength(2);
    expect(fall.added).toHaveLength(2);
    expect(b.tiles[1].map((t) => t?.key)).toEqual(['1/3', '1/4', '1/2']);
    expect(b.tiles[0].map((t) => t?.key)).toEqual(['3/4', '3/4', '2/3']);
  });

  it('zoomies clear their whole row', () => {
    const b = board(['abcd', 'bcdb', 'cdbc']);
    b.tiles[1][0] = tile('1/3', { special: 'row' });
    expect(clearCells(b, [{ r: 1, c: 0 }]).removed).toHaveLength(4);
    expect(b.tiles[1].every((t) => t === null)).toBe(true);
  });

  it('a treat bag clears the 3×3 around it', () => {
    const b = board(['abc', 'bcd', 'cdb', 'dbc']);
    b.tiles[1][1] = tile('1/4', { special: 'bag' });
    expect(clearCells(b, [{ r: 1, c: 1 }]).removed).toHaveLength(9);
  });

  it('a tennis ball clears every tile of the value it is paired with', () => {
    const b = board(['abab', 'cdcd', 'abab']);
    const ball = tile(null, { special: 'ball' });
    b.tiles[1][0] = ball;
    const clear = clearCells(b, [{ r: 1, c: 0 }], [], new Map([[ball.id, '1/2']]));
    expect(clear.removed.filter((t) => t.key === '1/2')).toHaveLength(4);
    expect(clear.removed).toHaveLength(5);
  });
});

describe('levels', () => {
  it('has two worlds of ten', () => {
    expect(LEVELS.filter((l) => l.world === 1)).toHaveLength(10);
    expect(LEVELS.filter((l) => l.world === 2)).toHaveLength(10);
  });

  it.each(LEVELS.map((l) => [l.id, l] as [string, Level]))('level %s can be played', (_, level) => {
    for (const v of level.values) expect(displaysFor(v, level.forms, level.dens).length, v).toBeGreaterThan(0);
    if (level.goal.kind === 'collect') expect(level.values).toContain(level.goal.key);
    if (level.goal.kind === 'mud') expect(mudTarget(level)).toBeGreaterThan(0);
    expect(level.values.length).toBeGreaterThanOrEqual(3);
    expect(level.values.length).toBeLessThanOrEqual(5);
    for (let seed = 1; seed <= 10; seed++) expect(findPair(new Game(level, { rng: seeded(seed) }).board)).not.toBeNull();
  });

  it('every level can be won by a child who always finds a pair', () => {
    for (const level of LEVELS) {
      const g = new Game(level, { rng: seeded(9) });
      let t = 0;
      while (g.status === 'playing') {
        // Prefer pairs that help the goal, as a child aiming for it would.
        const goal = level.goal;
        const cells = g.board.tiles.flatMap((row, r) => row.map((x, c) => ({ r, c, x: x! })));
        const good = cells.filter((p) => (goal.kind === 'collect' ? p.x.key === goal.key : g.board.mud[p.r][p.c]));
        const partner = (p: { r: number; c: number; x: Tile }) =>
          cells.find((q) => (q.r !== p.r || q.c !== p.c) && q.x.key === p.x.key && q.x.key !== null);
        const start = good.find((p) => partner(p)) ?? cells.find((p) => partner(p))!;
        g.pick(start, partner(start)!, (t += 1000));
      }
      expect(g.status, level.id).toBe('won');
    }
  });
});

describe('a game', () => {
  it('a wrong pair costs a move, breaks the combo and says which two', () => {
    const g = new Game(LEVELS[0], { rng: seeded(3) });
    const [x, y] = find(g, false);
    const res = g.pick(x, y, 0);
    expect(res.ok).toBe(false);
    expect(res.miss?.a.key).toBe(x.t.key);
    expect(res.miss?.z.key).toBe(y.t.key);
    expect(g.movesLeft).toBe(LEVELS[0].moves - 1);
    expect(g.combo).toBe(0);
  });

  it('a right pair clears both, scores, and refills the board', () => {
    const g = new Game(LEVELS[0], { rng: seeded(3) });
    const [x, y] = find(g, true);
    const res = g.pick(x, y, 0);
    expect(res.ok).toBe(true);
    expect(res.phases.map((p) => p.kind)).toEqual(['clear', 'fall']);
    expect(g.score).toBe(40);
    expect(g.board.tiles.flat().every((t) => t !== null)).toBe(true);
  });

  it('quick pairs build a combo that earns specials; a pause resets it', () => {
    const g = new Game({ ...LEVELS[0], moves: 99 }, { rng: seeded(4) });
    const earned: (string | undefined)[] = [];
    for (let i = 0; i < 7; i++) {
      const [x, y] = find(g, true);
      earned.push(g.pick(x, y, i * 1000).earned);
    }
    expect(g.combo).toBe(7);
    expect(earned.slice(0, 2)).toEqual([undefined, undefined]);
    expect(['row', 'col']).toContain(earned[2]);
    expect(earned[4]).toBe('bag');
    expect(earned[6]).toBe('ball');
    const [x, y] = find(g, true);
    g.pick(x, y, 7000 + COMBO_MS + 1);
    expect(g.combo).toBe(1);
  });

  it('combo specials go zoomies, bag, ball, then round again', () => {
    const r = () => 0.1;
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 13].map((n) => comboSpecial(n, r))).toEqual([
      undefined, undefined, 'row', undefined, 'bag', undefined, 'ball', undefined, 'row', 'bag', 'ball',
    ]);
  });

  it('wins when the goal is met, fixes stars, then the finale spends moves for points', () => {
    const g = new Game({ ...LEVELS[0], goal: { kind: 'collect', key: '1/2', count: 1 } }, { rng: seeded(5) });
    const cells = g.board.tiles.flatMap((row, r) => row.map((t, c) => ({ r, c, t: t! })));
    const halves = cells.filter((x) => x.t.key === '1/2');
    g.pick(halves[0], halves[1], 0);
    expect(g.status).toBe('won');
    expect(g.stars).toBe(3);
    const left = g.movesLeft;
    const before = g.score;
    const phases = g.finale();
    expect(phases.filter((p) => p.kind === 'clear')).toHaveLength(left);
    expect(g.movesLeft).toBe(0);
    expect(g.score).toBe(before + left * FINALE_POINTS);
    expect(g.stars).toBe(3);
  });

  it('loses when moves run out', () => {
    const g = new Game({ ...LEVELS[0], moves: 2, goal: { kind: 'collect', key: '1/2', count: 999 } }, { rng: seeded(5) });
    const [x, y] = find(g, false);
    g.pick(x, y, 0);
    g.pick(x, y, 1);
    expect(g.status).toBe('lost');
  });

  it('a treat turns a tile into a tennis ball', () => {
    const g = new Game(LEVELS[0], { rng: seeded(6) });
    g.giveBall({ r: 2, c: 2 });
    expect(g.board.tiles[2][2]?.special).toBe('ball');
    const res = g.pick({ r: 2, c: 2 }, { r: 0, c: 0 }, 0);
    expect(res.ok).toBe(true);
  });

  it('values a child mixes up turn up more often', () => {
    expect(weights(['1/3', '3/10', '1/2'], { '1/3|3/10': 2 })).toEqual([2, 2, 1]);
    const level = LEVELS[7];
    const count = (misses: Record<string, number>) => {
      const spawn = makeSpawn(level, seeded(11), misses, [0], () => 0);
      let n = 0;
      for (let i = 0; i < 4000; i++) if (spawn().key === '3/10') n++;
      return n;
    };
    expect(count({ '1/3|3/10': 4 })).toBeGreaterThan(count({}) * 1.3);
  });

  it('tile colours are spread across every value', () => {
    const spawn = makeSpawn(LEVELS[0], seeded(2), {}, [0, 1], () => 0);
    const coloursFor = new Map<string, Set<number>>();
    for (let i = 0; i < 600; i++) {
      const t = spawn();
      coloursFor.set(t.key!, (coloursFor.get(t.key!) ?? new Set()).add(t.colour));
    }
    for (const set of coloursFor.values()) expect(set.size).toBe(6);
  });
});

describe('profiles', () => {
  const memory = (): Store => {
    const m = new Map<string, string>();
    return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
  };

  it('keeps best stars, opens levels in order, and remembers mix-ups', () => {
    const profiles = new Profiles(memory());
    const p = profiles.add('  Maisie  ', 2);
    expect(p.name).toBe('Maisie');
    expect(unlocked(p, '1-1')).toBe(true);
    expect(unlocked(p, '1-2')).toBe(false);
    profiles.recordWin(p.id, '1-1', 2);
    profiles.recordWin(p.id, '1-1', 1);
    const after = profiles.get(p.id)!;
    expect(after.stars['1-1']).toBe(2);
    expect(unlocked(after, '1-2')).toBe(true);
    expect(afterCheckOpen(after)).toBe(false);

    profiles.recordMiss(p.id, '3/10', '1/3');
    profiles.recordMiss(p.id, '1/3', '3/10');
    expect(profiles.get(p.id)!.misses).toEqual({ '1/3|3/10': 2 });
    profiles.recordMatch(p.id, ['1/3']);
    expect(profiles.get(p.id)!.misses).toEqual({ '1/3|3/10': 1.75 });
  });

  it('two children keep separate progress', () => {
    const profiles = new Profiles(memory());
    const a = profiles.add('A', 0);
    const b = profiles.add('B', 1);
    profiles.recordWin(a.id, '1-1', 3);
    expect(profiles.get(b.id)!.stars).toEqual({});
    expect(profiles.all()).toHaveLength(2);
  });

  it('wins a sticker dog per level, and those dogs join the board', () => {
    const profiles = new Profiles(memory());
    const p = profiles.add('A', 0);
    expect(boardDogs(p)).toEqual([0, 1, 2, 3]);
    expect(profiles.recordWin(p.id, '1-1', 1).sticker).toBe(true);
    expect(profiles.recordWin(p.id, '1-1', 3).sticker).toBe(false);
    profiles.recordWin(p.id, '1-5', 1);
    expect(boardDogs(profiles.get(p.id)!)).toEqual([0, 1, 2, 3, stickerFor('1-1'), stickerFor('1-5')]);
    expect(new Set(LEVELS.map((l) => stickerFor(l.id))).size).toBe(20);
    expect(LEVELS.map((l) => stickerFor(l.id)).every((d) => d >= 4 && d <= 23)).toBe(true);
  });

  it('the first win each day extends the streak and earns one treat', () => {
    const profiles = new Profiles(memory());
    const p = profiles.add('A', 0);
    const day = (d: number) => new Date(2026, 9, d, 15);
    expect(profiles.recordWin(p.id, '1-1', 1, day(1)).treat).toBe(true);
    expect(profiles.recordWin(p.id, '1-2', 1, day(1)).treat).toBe(false);
    profiles.recordWin(p.id, '1-3', 1, day(2));
    let now = profiles.get(p.id)!;
    expect(now.streak.count).toBe(2);
    expect(now.treats).toBe(2);
    expect(currentStreak(now, day(3))).toBe(2);
    expect(currentStreak(now, day(4))).toBe(0);
    profiles.recordWin(p.id, '1-4', 1, day(5));
    now = profiles.get(p.id)!;
    expect(now.streak.count).toBe(1);
    expect(profiles.useTreat(p.id)).toBe(true);
    expect(profiles.get(p.id)!.treats).toBe(2);
  });

  it('upgrades a profile saved before stickers and streaks', () => {
    const store = memory();
    store.set('fraction-fetch.profiles.v1', JSON.stringify([{ id: 'x', name: 'Old', dog: 1, stars: { '1-1': 2 }, misses: {}, checks: {} }]));
    const p = new Profiles(store).all()[0];
    expect(p.treats).toBe(0);
    expect(p.streak.count).toBe(0);
    expect(p.seen).toEqual([]);
  });

  it('survives a corrupt save', () => {
    const store = memory();
    store.set('fraction-fetch.profiles.v1', '{not json');
    expect(new Profiles(store).all()).toEqual([]);
  });
});

describe('fractions check', () => {
  it('has two matching forms of ten', () => {
    expect(BEFORE).toHaveLength(10);
    expect(AFTER).toHaveLength(10);
    BEFORE.forEach((q, i) => expect(q.options.length).toBe(AFTER[i].options.length));
  });

  it('scores right answers only', () => {
    expect(score(BEFORE, BEFORE.map((q) => q.options[0]))).toBe(10);
    expect(score(BEFORE, BEFORE.map((q) => q.options[1]))).toBe(0);
  });
});
