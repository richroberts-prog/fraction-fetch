// The grid: finding matches, special tiles, clearing, falling, refilling and shuffling.
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
  breed: number;
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
export const BREEDS = 8;

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

export function adjacent(a: Pos, b: Pos): boolean {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

function same(a: Pos, b: Pos): boolean {
  return a.r === b.r && a.c === b.c;
}

const cellId = (p: Pos) => p.r * 100 + p.c;

export interface Group {
  key: string;
  cells: Pos[];
  /** The special tile this match earns, if any. */
  makes?: Special;
}

/** Every line of 3+ same-value tiles, joined into groups when lines of one value touch (L and T shapes). */
export function findGroups(b: Board): Group[] {
  interface Run {
    key: string;
    cells: Pos[];
    dir: 'h' | 'v';
  }
  const runs: Run[] = [];
  for (const dir of ['h', 'v'] as const) {
    const outer = dir === 'h' ? b.rows : b.cols;
    const inner = dir === 'h' ? b.cols : b.rows;
    for (let o = 0; o < outer; o++) {
      let start = 0;
      for (let i = 1; i <= inner; i++) {
        const pos = (k: number): Pos => (dir === 'h' ? { r: o, c: k } : { r: k, c: o });
        const key = at(b, pos(start))?.key ?? null;
        const next = i < inner ? (at(b, pos(i))?.key ?? null) : undefined;
        if (next === key && key !== null) continue;
        if (key !== null && i - start >= 3) {
          runs.push({ key, dir, cells: Array.from({ length: i - start }, (_, k) => pos(start + k)) });
        }
        start = i;
      }
    }
  }

  // Join runs of one value that share a cell.
  const parent = runs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      if (runs[i].key !== runs[j].key) continue;
      if (runs[i].cells.some((p) => runs[j].cells.some((q) => same(p, q)))) parent[find(i)] = find(j);
    }
  }
  const byRoot = new Map<number, Run[]>();
  runs.forEach((run, i) => byRoot.set(find(i), [...(byRoot.get(find(i)) ?? []), run]));

  const groups: Group[] = [];
  for (const members of byRoot.values()) {
    const cells = new Map<number, Pos>();
    for (const run of members) for (const p of run.cells) cells.set(cellId(p), p);
    const longest = Math.max(...members.map((r) => r.cells.length));
    const crosses = members.some((r) => r.dir === 'h') && members.some((r) => r.dir === 'v');
    let makes: Special | undefined;
    if (longest >= 5) makes = 'ball';
    else if (crosses) makes = 'bag';
    else if (longest === 4) makes = members[0].dir === 'h' ? 'row' : 'col';
    groups.push({ key: members[0].key, cells: [...cells.values()], makes });
  }
  return groups;
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

function emptyClear(): Clear {
  return { removed: [], where: [], created: [], mudCleaned: [], fired: [] };
}

/** Keys of all valued tiles on the board, most common first. */
function commonKeys(b: Board): string[] {
  const count = new Map<string, number>();
  for (const row of b.tiles) for (const t of row) if (t?.key) count.set(t.key, (count.get(t.key) ?? 0) + 1);
  return [...count.entries()].sort((a, z) => z[1] - a[1]).map(([k]) => k);
}

function cellsWithKey(b: Board, key: string): Pos[] {
  const out: Pos[] = [];
  for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) if (b.tiles[r][c]?.key === key) out.push({ r, c });
  return out;
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
    if (key) out.push(...cellsWithKey(b, key));
  }
  return out;
}

/**
 * Removes the cells given, sets off any specials among them (and any they reach), and
 * places new specials. Mutates the board.
 */
export function clearCells(
  b: Board,
  start: Pos[],
  create: { pos: Pos; tile: Tile }[] = [],
  ballKeys: Map<number, string | null> = new Map(),
): Clear {
  const result = emptyClear();
  const done = new Set<number>();
  const queue = [...start];
  const protectedCells = new Set(create.map((x) => cellId(x.pos)));
  while (queue.length) {
    const p = queue.shift()!;
    if (!inside(b, p) || done.has(cellId(p))) continue;
    done.add(cellId(p));
    const tile = at(b, p);
    if (b.mud[p.r][p.c] && (tile || protectedCells.has(cellId(p)))) {
      b.mud[p.r][p.c] = false;
      result.mudCleaned.push(p);
    }
    if (!tile) continue;
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

/**
 * Clears every current match once. Returns null when there is nothing to clear.
 * prefer: cells the child just moved, where a new special should appear.
 */
export function clearMatches(b: Board, newId: () => number, prefer: Pos[] = []): Clear | null {
  const groups = findGroups(b);
  if (groups.length === 0) return null;
  const cells: Pos[] = [];
  const create: { pos: Pos; tile: Tile }[] = [];
  for (const g of groups) {
    cells.push(...g.cells);
    if (!g.makes) continue;
    const pos = g.cells.find((p) => prefer.some((q) => same(p, q))) ?? g.cells[Math.floor(g.cells.length / 2)];
    const base = at(b, pos)!;
    create.push({
      pos,
      tile: {
        id: newId(),
        key: g.makes === 'ball' ? null : g.key,
        display: g.makes === 'ball' ? null : base.display,
        colour: base.colour,
        breed: base.breed,
        special: g.makes,
      },
    });
  }
  return clearCells(b, cells, create);
}

export interface Fall {
  /** Tiles that moved down: from → to. */
  moved: { tile: Tile; from: Pos; to: Pos }[];
  /** New tiles, with how many rows above the top they start (for the drop-in). */
  added: { tile: Tile; to: Pos; above: number }[];
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
    const gaps = write + 1;
    for (let r = write; r >= 0; r--) {
      const t = spawn();
      b.tiles[r][c] = t;
      fall.added.push({ tile: t, to: { r, c }, above: gaps });
    }
  }
  return fall;
}

export function swapTiles(b: Board, a: Pos, z: Pos): void {
  const t = b.tiles[a.r][a.c];
  b.tiles[a.r][a.c] = b.tiles[z.r][z.c];
  b.tiles[z.r][z.c] = t;
}

/** True when swapping a and z makes a match (or uses a tennis ball). */
export function swapWorks(b: Board, a: Pos, z: Pos): boolean {
  if (at(b, a)?.special === 'ball' || at(b, z)?.special === 'ball') return true;
  swapTiles(b, a, z);
  const ok = lineAt(b, a) || lineAt(b, z);
  swapTiles(b, a, z);
  return ok;
}

/** True when the tile at p sits in a line of 3+ of its value. */
function lineAt(b: Board, p: Pos): boolean {
  const key = at(b, p)?.key;
  if (!key) return false;
  const run = (dr: number, dc: number) => {
    let n = 0;
    for (let k = 1; at(b, { r: p.r + dr * k, c: p.c + dc * k })?.key === key; k++) n++;
    return n;
  };
  return run(0, -1) + run(0, 1) >= 2 || run(-1, 0) + run(1, 0) >= 2;
}

export function findMove(b: Board): [Pos, Pos] | null {
  for (let r = 0; r < b.rows; r++) {
    for (let c = 0; c < b.cols; c++) {
      for (const z of [{ r, c: c + 1 }, { r: r + 1, c }]) {
        if (inside(b, z) && swapWorks(b, { r, c }, z)) return [{ r, c }, z];
      }
    }
  }
  return null;
}

/** Fills an empty board with no ready-made matches and at least one move. */
export function fill(b: Board, spawn: Spawn): void {
  for (let attempt = 0; attempt < 200; attempt++) {
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        let t = spawn();
        for (let tries = 0; tries < 30; tries++) {
          b.tiles[r][c] = t;
          if (!lineAt(b, { r, c })) break;
          t = spawn();
        }
      }
    }
    if (findGroups(b).length === 0 && findMove(b)) return;
  }
  throw new Error('could not fill board');
}

/** Moves the same tiles around until there are no matches and a move exists. */
export function shuffle(b: Board, rng: Rng, spawn: Spawn): void {
  const tiles = b.tiles.flat().filter((t): t is Tile => t !== null);
  for (let attempt = 0; attempt < 100; attempt++) {
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    let k = 0;
    for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) b.tiles[r][c] = tiles[k++];
    if (findGroups(b).length === 0 && findMove(b)) return;
  }
  // These tiles can't make a move however they sit: deal a fresh board.
  fill(b, spawn);
}

/**
 * When a swap fails, the child often thought the moved tile equalled two others in a line.
 * Returns that pair so the game can show both values side by side.
 */
export function nearMiss(b: Board, a: Pos, z: Pos): { moved: Tile; meant: Tile } | null {
  swapTiles(b, a, z);
  try {
    for (const p of [z, a]) {
      const moved = at(b, p);
      if (!moved?.key) continue;
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        for (let s = -2; s <= 0; s++) {
          const cells = [0, 1, 2].map((k) => ({ r: p.r + dr * (s + k), c: p.c + dc * (s + k) }));
          if (!cells.every((q) => inside(b, q))) continue;
          const others = cells.filter((q) => !same(q, p)).map((q) => at(b, q));
          const [x, y] = others;
          if (x?.key && x.key === y?.key && x.key !== moved.key) return { moved, meant: x };
        }
      }
    }
    return null;
  } finally {
    swapTiles(b, a, z);
  }
}
