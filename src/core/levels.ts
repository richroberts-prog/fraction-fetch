// The two worlds of v1. Difficulty rises by adding values to the board (3 → 5),
// bigger denominators, more forms, and near-miss values that look alike (⅓ and 3/10).

import type { Form } from './fractions';

export type Goal =
  | { kind: 'collect'; key: string; count: number }
  /** Clean this share of the mud squares, e.g. 3/4. */
  | { kind: 'mud'; n: number; d: number };

export interface Level {
  id: string;
  world: number;
  number: number;
  /** The values on the board; each is shown in several forms. */
  values: string[];
  forms: Form[];
  /** Denominators written fractions may use. */
  dens: number[];
  moves: number;
  goal: Goal;
  /** Rows of the board, top first: '#' is mud, '.' is grass. Omit for no mud. */
  mud?: string[];
  /** Shows the guided first swap. */
  tutorial?: boolean;
}

export interface World {
  number: number;
  name: string;
  topic: string;
}

export const WORLDS: World[] = [
  { number: 1, name: 'Bone Yard', topic: 'Equal fractions' },
  { number: 2, name: 'Dog Park', topic: 'Decimals and percentages' },
];

const MUD_CENTRE = ['........', '........', '..####..', '..####..', '..####..', '..####..', '........', '........'];
const MUD_RING = ['........', '.######.', '.#....#.', '.#....#.', '.#....#.', '.#....#.', '.######.', '........'];
const MUD_BOTTOM = ['........', '........', '........', '........', '########', '########', '########', '########'];
const MUD_CROSS = ['...##...', '...##...', '...##...', '########', '########', '...##...', '...##...', '...##...'];

const w1 = (number: number, l: Omit<Level, 'id' | 'world' | 'number'>): Level => ({ id: `1-${number}`, world: 1, number, ...l });
const w2 = (number: number, l: Omit<Level, 'id' | 'world' | 'number'>): Level => ({ id: `2-${number}`, world: 2, number, ...l });

export const LEVELS: Level[] = [
  w1(1, { values: ['1/2', '1/3', '1/4'], forms: ['tag'], dens: [2, 3, 4, 6, 8], moves: 20, goal: { kind: 'collect', key: '1/2', count: 10 }, tutorial: true }),
  w1(2, { values: ['1/2', '1/3', '1/4'], forms: ['tag'], dens: [2, 3, 4, 6, 8], moves: 20, goal: { kind: 'collect', key: '1/4', count: 12 } }),
  w1(3, { values: ['1/2', '1/4', '3/4'], forms: ['tag'], dens: [2, 4, 8], moves: 22, goal: { kind: 'mud', n: 1, d: 2 }, mud: MUD_CENTRE }),
  w1(4, { values: ['1/2', '1/3', '2/3', '1/4'], forms: ['tag'], dens: [2, 3, 4, 6, 8, 9], moves: 22, goal: { kind: 'collect', key: '2/3', count: 12 } }),
  w1(5, { values: ['1/2', '1/3', '2/3', '1/4'], forms: ['tag'], dens: [2, 3, 4, 6, 8, 12], moves: 24, goal: { kind: 'mud', n: 3, d: 4 }, mud: MUD_RING }),
  w1(6, { values: ['1/2', '1/4', '1/5', '2/5'], forms: ['tag'], dens: [2, 4, 5, 8, 10], moves: 24, goal: { kind: 'collect', key: '2/5', count: 12 } }),
  w1(7, { values: ['1/3', '2/3', '1/6', '5/6'], forms: ['tag'], dens: [3, 6, 9, 12], moves: 24, goal: { kind: 'collect', key: '5/6', count: 12 } }),
  w1(8, { values: ['1/3', '3/10', '1/2', '2/5'], forms: ['tag'], dens: [2, 3, 5, 6, 9, 10, 12], moves: 25, goal: { kind: 'collect', key: '1/3', count: 14 } }),
  w1(9, { values: ['1/4', '1/5', '1/3', '3/8', '1/2'], forms: ['tag'], dens: [2, 3, 4, 5, 6, 8, 10, 12], moves: 26, goal: { kind: 'mud', n: 2, d: 3 }, mud: MUD_BOTTOM }),
  w1(10, { values: ['1/2', '2/3', '3/4', '5/6', '3/5'], forms: ['tag'], dens: [2, 3, 4, 5, 6, 8, 10, 12], moves: 26, goal: { kind: 'collect', key: '3/4', count: 15 } }),

  w2(1, { values: ['1/10', '3/10', '7/10'], forms: ['tag', 'decimal'], dens: [10], moves: 20, goal: { kind: 'collect', key: '7/10', count: 10 } }),
  w2(2, { values: ['1/10', '3/10', '7/10', '9/10'], forms: ['tag', 'decimal'], dens: [10], moves: 22, goal: { kind: 'collect', key: '3/10', count: 12 } }),
  w2(3, { values: ['1/2', '1/10', '7/10'], forms: ['tag', 'decimal'], dens: [2, 10, 100], moves: 22, goal: { kind: 'collect', key: '1/2', count: 12 } }),
  w2(4, { values: ['1/4', '3/4', '1/2', '1/10'], forms: ['tag', 'decimal'], dens: [2, 4, 10, 100], moves: 24, goal: { kind: 'collect', key: '1/4', count: 12 } }),
  w2(5, { values: ['1/2', '1/4', '3/4', '7/10'], forms: ['tag', 'decimal'], dens: [2, 4, 10, 100], moves: 24, goal: { kind: 'mud', n: 3, d: 4 }, mud: MUD_CENTRE }),
  w2(6, { values: ['1/2', '1/4', '1/10'], forms: ['tag', 'percent'], dens: [2, 4, 10, 100], moves: 22, goal: { kind: 'collect', key: '1/4', count: 12 } }),
  w2(7, { values: ['1/5', '2/5', '3/5', '4/5'], forms: ['tag', 'percent'], dens: [5, 10], moves: 24, goal: { kind: 'collect', key: '3/5', count: 12 } }),
  w2(8, { values: ['1/2', '1/4', '3/4', '1/5', '2/5'], forms: ['tag', 'percent', 'decimal'], dens: [2, 4, 5, 10, 100], moves: 25, goal: { kind: 'collect', key: '3/4', count: 14 } }),
  w2(9, { values: ['1/4', '1/5', '1/2', '2/5', '3/10'], forms: ['tag', 'percent', 'decimal'], dens: [2, 4, 5, 10, 100], moves: 26, goal: { kind: 'mud', n: 2, d: 3 }, mud: MUD_CROSS }),
  w2(10, { values: ['1/2', '1/4', '3/4', '1/5', '4/5'], forms: ['tag', 'decimal', 'percent'], dens: [2, 4, 5, 10, 100], moves: 26, goal: { kind: 'collect', key: '4/5', count: 15 } }),
];

export function levelById(id: string): Level {
  const l = LEVELS.find((x) => x.id === id);
  if (!l) throw new Error(`no level ${id}`);
  return l;
}

export function nextLevel(id: string): Level | null {
  const i = LEVELS.findIndex((x) => x.id === id);
  return LEVELS[i + 1] ?? null;
}

export function mudGrid(level: Level): boolean[][] | undefined {
  return level.mud?.map((row) => [...row].map((ch) => ch === '#'));
}

/** Mud squares the child must clean to win. */
export function mudTarget(level: Level): number {
  if (level.goal.kind !== 'mud') return 0;
  const total = (level.mud?.join('').match(/#/g) ?? []).length;
  return Math.ceil((total * level.goal.n) / level.goal.d);
}
