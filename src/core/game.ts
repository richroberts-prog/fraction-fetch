// One play of one level: moves, score, goal progress, and the phases the screen animates.

import {
  adjacent,
  at,
  BREEDS,
  clearCells,
  clearMatches,
  COLOURS,
  emptyBoard,
  fill,
  findMove,
  nearMiss,
  settle,
  shuffle,
  swapTiles,
  swapWorks,
  type Board,
  type Clear,
  type Pos,
  type Rng,
  type Tile,
} from './board';
import { displaysFor } from './fractions';
import { mudGrid, mudTarget, type Level } from './levels';

export const ROWS = 8;
export const COLS = 8;

/** Each step the screen shows after a swap. grid is the board after the step. */
export type Phase =
  | { kind: 'swap'; grid: (Tile | null)[][]; mud: boolean[][] }
  | { kind: 'clear'; grid: (Tile | null)[][]; mud: boolean[][]; clear: Clear; combo: number }
  | { kind: 'fall'; grid: (Tile | null)[][]; mud: boolean[][] }
  | { kind: 'shuffle'; grid: (Tile | null)[][]; mud: boolean[][] };

export interface SwapResult {
  ok: boolean;
  phases: Phase[];
  /** Set when a failed swap looks like the child thought two different values were equal. */
  miss?: { moved: Tile; meant: Tile };
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

export function makeSpawn(level: Level, rng: Rng, misses: Misses, newId: () => number): () => Tile {
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
      breed: Math.floor(rng() * BREEDS),
    };
  };
}

const copyGrid = (b: Board) => b.tiles.map((row) => [...row]);
const copyMud = (b: Board) => b.mud.map((row) => [...row]);

export class Game {
  readonly board: Board;
  movesLeft: number;
  score = 0;
  collected = 0;
  mudCleaned = 0;
  status: Status = 'playing';
  private nextId = 1;
  private spawn: () => Tile;

  constructor(
    readonly level: Level,
    private rng: Rng = Math.random,
    misses: Misses = {},
  ) {
    this.board = emptyBoard(ROWS, COLS, mudGrid(level));
    this.spawn = makeSpawn(level, rng, misses, () => this.nextId++);
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

  /** 3 stars with a quarter of the moves left, 2 with a tenth, otherwise 1. */
  get stars(): number {
    if (this.status !== 'won') return 0;
    const left = this.movesLeft / this.level.moves;
    return left >= 0.25 ? 3 : left >= 0.1 ? 2 : 1;
  }

  hint(): [Pos, Pos] | null {
    return findMove(this.board);
  }

  swap(a: Pos, z: Pos): SwapResult {
    const b = this.board;
    if (this.status !== 'playing' || !adjacent(a, z) || !at(b, a) || !at(b, z)) return { ok: false, phases: [] };
    const phases: Phase[] = [];
    const snap = (kind: 'swap' | 'fall' | 'shuffle') => phases.push({ kind, grid: copyGrid(b), mud: copyMud(b) });

    if (!swapWorks(b, a, z)) {
      const miss = nearMiss(b, a, z) ?? undefined;
      swapTiles(b, a, z);
      snap('swap');
      swapTiles(b, a, z);
      snap('swap');
      return { ok: false, phases, miss };
    }

    this.movesLeft--;
    const ta = at(b, a)!;
    const tz = at(b, z)!;
    let combo = 0;
    const record = (clear: Clear) => {
      combo++;
      this.score += clear.removed.length * 10 * combo;
      const g = this.level.goal;
      if (g.kind === 'collect') this.collected += clear.removed.filter((t) => t.key === g.key).length;
      this.mudCleaned += clear.mudCleaned.length;
      phases.push({ kind: 'clear', grid: copyGrid(b), mud: copyMud(b), clear, combo });
      settle(b, this.spawn);
      snap('fall');
    };

    swapTiles(b, a, z);
    snap('swap');
    if (ta.special === 'ball' || tz.special === 'ball') {
      // The ball takes the value of the tile it was swapped with. Two balls clear everything.
      const both = ta.special === 'ball' && tz.special === 'ball';
      const ball = ta.special === 'ball' ? ta : tz;
      const other = ball === ta ? tz : ta;
      const ballPos = ball === ta ? z : a;
      const start: Pos[] = both
        ? b.tiles.flatMap((row, r) => row.map((_, c) => ({ r, c })))
        : [ballPos];
      record(clearCells(b, start, [], new Map([[ball.id, other.key]])));
    }

    let prefer: Pos[] = [a, z];
    for (let clear = clearMatches(b, () => this.nextId++, prefer); clear; clear = clearMatches(b, () => this.nextId++, prefer)) {
      record(clear);
      prefer = [];
    }

    if (!findMove(b)) {
      shuffle(b, this.rng, this.spawn);
      snap('shuffle');
    }

    const p = this.progress;
    if (p.done >= p.needed) this.status = 'won';
    else if (this.movesLeft <= 0) this.status = 'lost';
    return { ok: true, phases };
  }
}
