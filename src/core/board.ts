// The grid: pairs, special tiles, clearing, falling and refilling.
// Pure logic with an injected random source, so tests can replay any board.

import type { Display } from './fractions';

export type Rng = () => number;

/** row/col: zoomies, clears a row or column. ball: tennis ball, clears one value. bag: treat bag, clears 3×3. */
export type Special = 'row' | 'col' | 'ball' | 'bag';

export interface Tile {
  id: number;
  /** Value key like "1/2". Null only for a tennis ball, which has no value. */
  key: string | null;
  display: Display | null;
  /** Random looks: never related to value. */
  colour: number;
  dog: number;
  special?: Special;
}

export interface Pos {
  r: number;
  c: number;
}

export interface Board {
  rows: number;
  cols: number;
  tiles: (Tile | null)[][];
  mud: boolean[][];
}

/** Makes new tiles for the board. The level and the child's history decide which values. */
export type Spawn = () => Tile;

export const COLOURS = 6;

export function emptyBoard(rows: number, cols: number, mud?: boolean[][]): Board {
  return {
    rows,
    cols,
    tiles: Array.from({ length: rows }, () => Array<Tile | null>(cols).fill(null)),
    mud: mud ?? Array.from({ length: rows }, () => Array<boolean>(cols).fill(false)),
  };
}

export function at(b: Board, p: Pos): Tile | null {
  return b.tiles[p.r]?.[p.c] ?? null;
}

export function inside(b: Board, p: Pos): boolean {
  return p.r >= 0 && p.r < b.rows && p.c >= 0 && p.c < b.cols;
}

export function same(a: Pos, b: Pos): boolean {
  return a.r === b.r && a.c === b.c;
}

const cellId = (p: Pos) => p.r * 100 + p.c;

/** Two different tiles make a pair when they are worth the same, or one is a tennis ball. */
export function isPair(b: Board, a: Pos, z: Pos): boolean {
  const ta = at(b, a);
  const tz = at(b, z);
  if (!ta || !tz || same(a, z)) return false;
  if (ta.special === 'ball' || tz.special === 'ball') return true;
  return ta.key === tz.key;
}

/** Any pair on the board, for hints. */
export function findPair(b: Board): [Pos, Pos] | null {
  const seen = new Map<string, Pos>();
  for (let r = 0; r < b.rows; r++) {
    for (let c = 0; c < b.cols; c++) {
      const t = b.tiles[r][c];
      if (!t) continue;
      const key = t.special === 'ball' ? '*ball' : t.key!;
      if (key === '*ball') {
        const other = r === 0 && c === 0 ? { r: 0, c: 1 } : { r: 0, c: 0 };
        return [{ r, c }, other];
      }
      const first = seen.get(key);
      if (first) return [first, { r, c }];
      seen.set(key, { r, c });
    }
  }
  return null;
}

/** What one round of clearing did, for the screen and the goals. */
export interface Clear {
  /** Tiles removed, in the order they went. */
  removed: Tile[];
  /** Positions removed, matching removed. */
  where: Pos[];
  /** New special tiles placed by this clear. */
  created: { pos: Pos; tile: Tile }[];
  mudCleaned: Pos[];
  /** Specials that went off, for effects. */
  fired: { pos: Pos; special: Special }[];
}

/** Keys of all valued tiles on the board, most common first. */
function commonKeys(b: Board): string[] {
  const count = new Map<string, number>();
  for (const row of b.tiles) for (const t of row) if (t?.key) count.set(t.key, (count.get(t.key) ?? 0) + 1);
  return [...count.entries()].sort((a, z) => z[1] - a[1]).map(([k]) => k);
}

/** Cells a special clears when it goes off at pos. */
export function blast(b: Board, pos: Pos, special: Special, ballKey?: string | null): Pos[] {
  const out: Pos[] = [];
  if (special === 'row') for (let c = 0; c < b.cols; c++) out.push({ r: pos.r, c });
  if (special === 'col') for (let r = 0; r < b.rows; r++) out.push({ r, c: pos.c });
  if (special === 'bag') {
    for (let r = pos.r - 1; r <= pos.r + 1; r++)
      for (let c = pos.c - 1; c <= pos.c + 1; c++) if (inside(b, { r, c })) out.push({ r, c });
  }
  if (special === 'ball') {
    const key = ballKey ?? commonKeys(b)[0];
    if (key) for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) if (b.tiles[r][c]?.key === key) out.push({ r, c });
  }
  return out;
}

/**
 * Removes the cells given, sets off any specials among them (and any they reach), then
 * places new specials. Mutates the board.
 */
export function clearCells(
  b: Board,
  start: Pos[],
  create: { pos: Pos; tile: Tile }[] = [],
  ballKeys: Map<number, string | null> = new Map(),
): Clear {
  const result: Clear = { removed: [], where: [], created: [], mudCleaned: [], fired: [] };
  const done = new Set<number>();
  const queue = [...start];
  while (queue.length) {
    const p = queue.shift()!;
    if (!inside(b, p) || done.has(cellId(p))) continue;
    done.add(cellId(p));
    const tile = at(b, p);
    if (!tile) continue;
    if (b.mud[p.r][p.c]) {
      b.mud[p.r][p.c] = false;
      result.mudCleaned.push(p);
    }
    b.tiles[p.r][p.c] = null;
    result.removed.push(tile);
    result.where.push(p);
    if (tile.special) {
      result.fired.push({ pos: p, special: tile.special });
      queue.push(...blast(b, p, tile.special, ballKeys.get(tile.id)));
    }
  }
  for (const { pos, tile } of create) {
    b.tiles[pos.r][pos.c] = tile;
    result.created.push({ pos, tile });
  }
  return result;
}

export interface Fall {
  /** Tiles that moved down: from → to. */
  moved: { tile: Tile; from: Pos; to: Pos }[];
  /** New tiles dropped in at the top. */
  added: { tile: Tile; to: Pos }[];
}

/** Drops tiles into gaps and fills the top with new ones. Mutates the board. */
export function settle(b: Board, spawn: Spawn): Fall {
  const fall: Fall = { moved: [], added: [] };
  for (let c = 0; c < b.cols; c++) {
    let write = b.rows - 1;
    for (let r = b.rows - 1; r >= 0; r--) {
      const t = b.tiles[r][c];
      if (!t) continue;
      if (r !== write) {
        b.tiles[write][c] = t;
        b.tiles[r][c] = null;
        fall.moved.push({ tile: t, from: { r, c }, to: { r: write, c } });
      }
      write--;
    }
    for (let r = write; r >= 0; r--) {
      const t = spawn();
      b.tiles[r][c] = t;
      fall.added.push({ tile: t, to: { r, c } });
    }
  }
  return fall;
}

/** Fills the board so that at least one pair exists. */
export function fill(b: Board, spawn: Spawn): void {
  for (let attempt = 0; attempt < 50; attempt++) {
    for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) b.tiles[r][c] = spawn();
    if (findPair(b)) return;
  }
  throw new Error('could not fill board');
}
