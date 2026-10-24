import { describe, expect, it } from 'vitest';
import {
  clearCells,
  clearMatches,
  emptyBoard,
  findGroups,
  findMove,
  nearMiss,
  settle,
  swapWorks,
  type Board,
  type Tile,
} from '../src/core/board';
import { AFTER, BEFORE, score } from '../src/core/check';
import { displaysFor, displayText, keyOf } from '../src/core/fractions';
import { Game, makeSpawn, weights } from '../src/core/game';
import { LEVELS, mudTarget, type Level } from '../src/core/levels';
import { afterCheckOpen, Profiles, unlocked, type Store } from '../src/core/profiles';
import { seeded } from '../src/core/rng';

let id = 1000;
const tile = (key: string | null, extra: Partial<Tile> = {}): Tile => ({
  id: id++,
  key,
  display: key ? { form: 'tag', n: Number(key.split('/')[0]), d: Number(key.split('/')[1]) } : null,
  colour: 0,
  breed: 0,
  ...extra,
});

/** Board from rows of letters: each letter is a value, '.' an empty cell. */
const KEYS: Record<string, string> = { a: '1/2', b: '1/3', c: '1/4', d: '2/3', e: '3/4', f: '1/5' };
function board(rows: string[]): Board {
  const b = emptyBoard(rows.length, rows[0].length);
  rows.forEach((row, r) => [...row].forEach((ch, c) => (b.tiles[r][c] = ch === '.' ? null : tile(KEYS[ch]))));
  return b;
}

describe('fractions', () => {
  it('equal values share a key whatever the form', () => {
    expect(keyOf({ n: 2, d: 4 })).toBe('1/2');
    expect(keyOf({ n: 50, d: 100 })).toBe('1/2');
    expect(keyOf({ n: 3, d: 10 })).toBe('3/10');
  });

  it('shows a value every allowed way', () => {
    const shown = displaysFor('1/2', ['tag', 'bone', 'decimal', 'percent'], [2, 4, 12]).map((d) => `${d.form}:${displayText(d)}`);
    expect(shown).toEqual(['tag:1/2', 'tag:2/4', 'tag:6/12', 'bone:1/2', 'bone:2/4', 'decimal:0.5', 'percent:50%']);
  });

  it('never draws a picture with more parts than a tile can show', () => {
    expect(displaysFor('1/2', ['bowl'], [2, 12, 100]).map((d) => d.d)).toEqual([2]);
  });

  it('skips decimals and percents for values with no exact one', () => {
    expect(displaysFor('1/3', ['decimal', 'percent'], [3])).toEqual([]);
    expect(displaysFor('1/4', ['decimal'], [4]).map(displayText)).toEqual(['0.25']);
  });
});

describe('matching', () => {
  it('matches three equal values in a row even when written differently', () => {
    const b = board(['aab', 'bbc', 'ccd']);
    b.tiles[0][2] = { ...tile('1/2'), display: { form: 'percent', n: 50, d: 100 } };
    const g = findGroups(b);
    expect(g).toHaveLength(1);
    expect(g[0].key).toBe('1/2');
    expect(g[0].makes).toBeUndefined();
  });

  it('four in a line makes zoomies along that line', () => {
    expect(findGroups(board(['aaaa', 'bcdb']))[0].makes).toBe('row');
    expect(findGroups(board(['ab', 'ac', 'ab', 'ac']))[0].makes).toBe('col');
  });

  it('five in a line makes a tennis ball', () => {
    expect(findGroups(board(['aaaaa', 'bcdbc']))[0].makes).toBe('ball');
  });

  it('an L or T shape makes a treat bag', () => {
    const g = findGroups(board(['abb', 'acc', 'aaa']));
    expect(g).toHaveLength(1);
    expect(g[0].cells).toHaveLength(5);
    expect(g[0].makes).toBe('bag');
  });

  it('a swap that makes no line does not count', () => {
    const b = board(['abc', 'bca', 'cab']);
    expect(swapWorks(b, { r: 0, c: 0 }, { r: 0, c: 1 })).toBe(false);
    expect(swapWorks(b, { r: 0, c: 1 }, { r: 1, c: 1 })).toBe(false);
  });

  it('a swap that lines up three works', () => {
    const b = board(['aba', 'cad', 'dcf']);
    expect(swapWorks(b, { r: 0, c: 1 }, { r: 1, c: 1 })).toBe(true);
  });
});

describe('clearing and falling', () => {
  it('clears a match, cleans mud under it, and drops tiles in from above', () => {
    const b = board(['bcd', 'aaa', 'cdb']);
    b.mud[1][1] = true;
    const clear = clearMatches(b, () => id++)!;
    expect(clear.removed.map((t) => t.key)).toEqual(['1/2', '1/2', '1/2']);
    expect(clear.mudCleaned).toEqual([{ r: 1, c: 1 }]);
    const fall = settle(b, () => tile('3/4'));
    expect(fall.moved).toHaveLength(3);
    expect(fall.added).toHaveLength(3);
    expect(b.tiles[1].map((t) => t?.key)).toEqual(['1/3', '1/4', '2/3']);
    expect(b.tiles[0].map((t) => t?.key)).toEqual(['3/4', '3/4', '3/4']);
  });

  it('zoomies clear their whole row when cleared', () => {
    const b = board(['abcd', 'bcdb', 'cdbc']);
    b.tiles[1][0] = tile('1/3', { special: 'row' });
    const clear = clearCells(b, [{ r: 1, c: 0 }]);
    expect(clear.removed).toHaveLength(4);
    expect(b.tiles[1].every((t) => t === null)).toBe(true);
  });

  it('a treat bag clears the 3×3 around it', () => {
    const b = board(['abc', 'bcd', 'cdb', 'dbc']);
    b.tiles[1][1] = tile('1/4', { special: 'bag' });
    expect(clearCells(b, [{ r: 1, c: 1 }]).removed).toHaveLength(9);
    expect(b.tiles[3].every((t) => t !== null)).toBe(true);
  });

  it('a tennis ball clears every tile of the value it is swapped with', () => {
    const b = board(['abab', 'cdcd', 'abab']);
    const ball = tile(null, { special: 'ball' });
    b.tiles[1][0] = ball;
    const clear = clearCells(b, [{ r: 1, c: 0 }], [], new Map([[ball.id, '1/2']]));
    expect(clear.removed.filter((t) => t.key === '1/2')).toHaveLength(4);
    expect(clear.removed).toHaveLength(5);
  });

  it('a new special appears where the child moved', () => {
    const b = board(['bbcb', 'aaaa', 'cdbc']);
    const clear = clearMatches(b, () => id++, [{ r: 1, c: 3 }])!;
    expect(clear.created[0].pos).toEqual({ r: 1, c: 3 });
    expect(clear.created[0].tile.special).toBe('row');
    expect(b.tiles[1][3]?.special).toBe('row');
  });
});

describe('near misses', () => {
  it('spots a swap that lined a tile up next to two equal different values', () => {
    // Moving the 1/3 at (0,2) down puts it next to two halves.
    const b = board(['ccb', 'aad', 'cdc']);
    const miss = nearMiss(b, { r: 0, c: 2 }, { r: 1, c: 2 });
    expect(miss?.moved.key).toBe('1/3');
    expect(miss?.meant.key).toBe('1/2');
    expect(b.tiles[0][2]?.key).toBe('1/3');
  });

  it('says nothing for a random swap', () => {
    const b = board(['abc', 'bca', 'cab']);
    expect(nearMiss(b, { r: 0, c: 0 }, { r: 0, c: 1 })).toBeNull();
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
    for (let seed = 1; seed <= 20; seed++) {
      const g = new Game(level, seeded(seed));
      expect(findGroups(g.board)).toHaveLength(0);
      expect(findMove(g.board)).not.toBeNull();
    }
  });

  it('a board always has a move after every swap', () => {
    for (const level of [LEVELS[0], LEVELS[9], LEVELS[19]]) {
      const g = new Game({ ...level, moves: 400, goal: { kind: 'collect', key: level.values[0], count: 1e9 } }, seeded(7));
      for (let i = 0; i < 300; i++) {
        const [a, z] = g.hint()!;
        const res = g.swap(a, z);
        expect(res.ok).toBe(true);
        expect(findGroups(g.board)).toHaveLength(0);
        expect(g.board.tiles.flat().every((t) => t !== null)).toBe(true);
      }
    }
  });
});

describe('a game', () => {
  it('a bad swap costs no move', () => {
    const g = new Game(LEVELS[0], seeded(3));
    const before = g.movesLeft;
    let bad: [{ r: number; c: number }, { r: number; c: number }] | null = null;
    for (let r = 0; r < 8 && !bad; r++)
      for (let c = 0; c < 7 && !bad; c++) if (!swapWorks(g.board, { r, c }, { r, c: c + 1 })) bad = [{ r, c }, { r, c: c + 1 }];
    const res = g.swap(...bad!);
    expect(res.ok).toBe(false);
    expect(res.phases).toHaveLength(2);
    expect(g.movesLeft).toBe(before);
  });

  it('wins when the goal is met and gives stars for moves left', () => {
    const g = new Game({ ...LEVELS[0], goal: { kind: 'collect', key: '1/2', count: 1 } }, seeded(5));
    for (let i = 0; i < 40 && g.status === 'playing'; i++) g.swap(...g.hint()!);
    expect(g.status).toBe('won');
    expect(g.stars).toBe(3);
  });

  it('loses when moves run out', () => {
    const g = new Game({ ...LEVELS[0], moves: 2, goal: { kind: 'collect', key: '1/2', count: 999 } }, seeded(5));
    g.swap(...g.hint()!);
    g.swap(...g.hint()!);
    expect(g.status).toBe('lost');
  });

  it('values a child mixes up turn up more often', () => {
    expect(weights(['1/3', '3/10', '1/2'], { '1/3|3/10': 2 })).toEqual([2, 2, 1]);
    const level = LEVELS[7];
    const count = (misses: Record<string, number>) => {
      const spawn = makeSpawn(level, seeded(11), misses, () => 0);
      let n = 0;
      for (let i = 0; i < 4000; i++) if (spawn().key === '3/10') n++;
      return n;
    };
    expect(count({ '1/3|3/10': 4 })).toBeGreaterThan(count({}) * 1.3);
  });

  it('tile colours are spread across every value', () => {
    const spawn = makeSpawn(LEVELS[0], seeded(2), {}, () => 0);
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
    profiles.recordStars(p.id, '1-1', 2);
    profiles.recordStars(p.id, '1-1', 1);
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
    profiles.recordStars(a.id, '1-1', 3);
    expect(profiles.get(b.id)!.stars).toEqual({});
    expect(profiles.all()).toHaveLength(2);
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
