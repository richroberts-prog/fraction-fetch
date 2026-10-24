// One play of one level: tap two tiles worth the same to clear them.
// Moves, score, combos, goal progress, and the phases the screen animates.

import { at, clearCells, COLOURS, emptyBoard, fill, findPair, isPair, settle, type Board, type Clear, type Pos, type Rng, type Special, type Tile } from './board';
import { displaysFor } from './fractions';
import { mudGrid, mudTarget, type Level } from './levels';

export const ROWS = 8;
export const COLS = 8;
/** A correct pair within this long of the last one keeps the combo going. */
export const COMBO_MS = 6000;
/** Bonus points for each move left, as zoomies in the finale. */
export const FINALE_POINTS = 100;

/** Each step the screen shows after a pick. grid is the board after the step. */
export type Phase =
  | { kind: 'clear'; grid: (Tile | null)[][]; clear: Clear; pair?: [Pos, Pos] }
  | { kind: 'fall'; grid: (Tile | null)[][] }
  | { kind: 'refill'; grid: (Tile | null)[][] };

export interface PickResult {
  ok: boolean;
  phases: Phase[];
  /** The two tiles when they were not worth the same. */
  miss?: { a: Tile; z: Tile };
  combo: number;
  /** A special tile this pick earned. */
  earned?: Special;
}

export type Status = 'playing' | 'won' | 'lost';

/** Misses per value pair, e.g. {"1/3|3/10": 2}. Keys sorted so the pair has one name. */
export type Misses = Record<string, number>;

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

/** How often each value should appear: values the child mixes up come up more. */
export function weights(values: string[], misses: Misses): number[] {
  return values.map((v) => {
    let n = 0;
    for (const [pair, count] of Object.entries(misses)) if (pair.split('|').includes(v)) n += count;
    return 1 + 0.5 * Math.min(4, n);
  });
}

/** The special a combo earns: zoomies at 3, treat bag at 5, tennis ball at 7, then round again every 2. */
export function comboSpecial(combo: number, rng: Rng): Special | undefined {
  if (combo < 3 || combo % 2 === 0) return undefined;
  const kind = ['zoomies', 'bag', 'ball'][((combo - 3) / 2) % 3];
  if (kind === 'zoomies') return rng() < 0.5 ? 'row' : 'col';
  return kind as Special;
}

export function makeSpawn(level: Level, rng: Rng, misses: Misses, dogs: number[], newId: () => number): () => Tile {
  const w = weights(level.values, misses);
  const total = w.reduce((a, b) => a + b, 0);
  const options = level.values.map((v) => displaysFor(v, level.forms, level.dens));
  options.forEach((o, i) => {
    if (o.length === 0) throw new Error(`level ${level.id}: ${level.values[i]} has no way to show it`);
  });
  return () => {
    let x = rng() * total;
    let i = 0;
    while (x >= w[i] && i < w.length - 1) x -= w[i++];
    const list = options[i];
    return {
      id: newId(),
      key: level.values[i],
      display: list[Math.floor(rng() * list.length)],
      colour: Math.floor(rng() * COLOURS),
      dog: dogs[Math.floor(rng() * dogs.length)],
    };
  };
}

const copyGrid = (b: Board) => b.tiles.map((row) => [...row]);

export interface GameOptions {
  rng?: Rng;
  misses?: Misses;
  /** Dog pictures the tiles may use: the child's collection. */
  dogs?: number[];
}

export class Game {
  readonly board: Board;
  movesLeft: number;
  score = 0;
  collected = 0;
  mudCleaned = 0;
  combo = 0;
  status: Status = 'playing';
  /** Stars, fixed at the moment of winning (before the finale spends the moves). */
  stars = 0;
  private lastHit = -Infinity;
  private nextId = 1;
  private spawn: () => Tile;
  private rng: Rng;

  constructor(
    readonly level: Level,
    options: GameOptions = {},
  ) {
    this.rng = options.rng ?? Math.random;
    this.board = emptyBoard(ROWS, COLS, mudGrid(level));
    this.spawn = makeSpawn(level, this.rng, options.misses ?? {}, options.dogs ?? [0, 1, 2, 3, 4, 5, 6, 7], () => this.nextId++);
    fill(this.board, this.spawn);
    this.movesLeft = level.moves;
  }

  /** How far through the goal, as done / needed. */
  get progress(): { done: number; needed: number } {
    const g = this.level.goal;
    if (g.kind === 'collect') return { done: Math.min(this.collected, g.count), needed: g.count };
    const needed = mudTarget(this.level);
    return { done: Math.min(this.mudCleaned, needed), needed };
  }

  hint(): [Pos, Pos] | null {
    return findPair(this.board);
  }

  /** Puts a tile showing this display at p, for the tutorial's set-up. */
  place(p: Pos, display: Tile['display'], key: string): void {
    const t = this.board.tiles[p.r][p.c]!;
    this.board.tiles[p.r][p.c] = { ...t, id: this.nextId++, key, display, special: undefined };
  }

  /** Turns the tile at p into a tennis ball: what a daily treat buys. */
  giveBall(p: Pos): Tile {
    const t = this.board.tiles[p.r][p.c]!;
    const ball: Tile = { ...t, id: this.nextId++, key: null, display: null, special: 'ball' };
    this.board.tiles[p.r][p.c] = ball;
    return ball;
  }

  private record(clear: Clear, multiplier: number): void {
    this.score += clear.removed.length * 20 * multiplier;
    const g = this.level.goal;
    if (g.kind === 'collect') this.collected += clear.removed.filter((t) => t.key === g.key).length;
    this.mudCleaned += clear.mudCleaned.length;
  }

  private settleInto(phases: Phase[]): void {
    settle(this.board, this.spawn);
    phases.push({ kind: 'fall', grid: copyGrid(this.board) });
    if (!findPair(this.board)) {
      fill(this.board, this.spawn);
      phases.push({ kind: 'refill', grid: copyGrid(this.board) });
    }
  }

  private checkEnd(): void {
    const p = this.progress;
    if (p.done >= p.needed) {
      this.status = 'won';
      const left = this.movesLeft / this.level.moves;
      this.stars = left >= 0.25 ? 3 : left >= 0.1 ? 2 : 1;
    } else if (this.movesLeft <= 0) this.status = 'lost';
  }

  /** The child tapped a, then z. now is the time in ms, for combos. */
  pick(a: Pos, z: Pos, now: number): PickResult {
    const b = this.board;
    const ta = at(b, a);
    const tz = at(b, z);
    if (this.status !== 'playing' || !ta || !tz || (a.r === z.r && a.c === z.c)) return { ok: false, phases: [], combo: this.combo };
    this.movesLeft--;

    if (!isPair(b, a, z)) {
      this.combo = 0;
      this.checkEnd();
      return { ok: false, phases: [], miss: { a: ta, z: tz }, combo: 0 };
    }

    this.combo = now - this.lastHit <= COMBO_MS ? this.combo + 1 : 1;
    this.lastHit = now;
    const earned = comboSpecial(this.combo, this.rng);
    const ball = ta.special === 'ball' ? ta : tz.special === 'ball' ? tz : null;
    const other = ball === ta ? tz : ta;
    const bothBalls = ta.special === 'ball' && tz.special === 'ball';
    const start: Pos[] = bothBalls ? b.tiles.flatMap((row, r) => row.map((_, c) => ({ r, c }))) : [a, z];
    const create: { pos: Pos; tile: Tile }[] = [];
    if (earned) {
      const base = ball ? other : tz;
      create.push({
        pos: z,
        tile: {
          id: this.nextId++,
          key: earned === 'ball' ? null : (base.key ?? ta.key),
          display: earned === 'ball' ? null : (base.display ?? ta.display),
          colour: tz.colour,
          dog: tz.dog,
          special: earned,
        },
      });
      // A ball's own value is unknown; keep valued specials only when the pair had a value.
      if (earned !== 'ball' && !create[0].tile.key) create.pop();
    }
    const ballKeys = new Map<number, string | null>();
    if (ball && !bothBalls) ballKeys.set(ball.id, other.key);

    const phases: Phase[] = [];
    const clear = clearCells(b, start, create, ballKeys);
    this.record(clear, Math.min(this.combo, 5));
    phases.push({ kind: 'clear', grid: copyGrid(b), clear, pair: [a, z] });
    this.settleInto(phases);
    this.checkEnd();
    return { ok: true, phases, combo: this.combo, earned: create.length ? earned : undefined };
  }

  /** After a win, each move left becomes zoomies that tear across the board for bonus points. */
  finale(): Phase[] {
    const phases: Phase[] = [];
    if (this.status !== 'won') return phases;
    while (this.movesLeft > 0) {
      this.movesLeft--;
      const p = { r: Math.floor(this.rng() * ROWS), c: Math.floor(this.rng() * COLS) };
      const t = at(this.board, p)!;
      this.board.tiles[p.r][p.c] = { ...t, special: this.rng() < 0.5 ? 'row' : 'col' };
      const clear = clearCells(this.board, [p]);
      this.score += FINALE_POINTS;
      phases.push({ kind: 'clear', grid: copyGrid(this.board), clear });
      this.settleInto(phases);
    }
    return phases;
  }
}
