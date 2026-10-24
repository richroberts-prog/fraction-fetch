// Children's profiles, saved on this device only. No passwords, nothing leaves the device.

import { pairKey, type Misses } from './game';
import { LEVELS } from './levels';

export interface Profile {
  id: string;
  name: string;
  /** Breed index of the chosen dog avatar. */
  dog: number;
  /** Best stars per level id. */
  stars: Record<string, number>;
  misses: Misses;
  /** Fractions check scores out of 10: before world 1 and after world 2. */
  checks: { before?: number; after?: number };
  /** Days in a row with a win, and the last such day (YYYY-MM-DD, local time). */
  streak: { count: number; last?: string };
  /** Daily treats saved up; each buys a tennis ball in a level. */
  treats: number;
  /** Tile forms the child has been introduced to with a "New!" card. */
  seen: string[];
}

/** Dogs: 0-3 are on every board from the start; 4-23 are won, one per level, for the sticker book. */
export const DOG_NAMES = [
  'corgi', 'dachshund', 'dalmatian', 'pug', 'collie', 'labrador', 'husky', 'poodle',
  'beagle', 'shiba', 'chihuahua', 'frenchie', 'schnauzer', 'westie', 'spaniel', 'greyhound',
  'bernese', 'pomeranian', 'jackrussell', 'cockapoo', 'samoyed', 'boxer', 'maltese', 'newfoundland',
];

/** Dogs on every board from the start. */
const STARTERS = [0, 1, 2, 3];

/** The sticker-book dog each level wins. */
export function stickerFor(levelId: string): number {
  return 4 + LEVELS.findIndex((l) => l.id === levelId);
}

/** Dogs that can appear on this child's board: the starters plus every sticker won. */
export function boardDogs(p: Profile): number[] {
  return [...new Set([...STARTERS, ...Object.keys(p.stars).filter((id) => p.stars[id] > 0).map(stickerFor)])];
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Fills in fields added after a profile was saved. */
function upgrade(p: Profile): Profile {
  p.streak ??= { count: 0 };
  p.treats ??= 0;
  p.seen ??= [];
  return p;
}

export interface Store {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** localStorage, or memory when the browser blocks it (private windows). */
export function browserStore(): Store {
  const memory = new Map<string, string>();
  return {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return memory.get(key) ?? null;
      }
    },
    set(key, value) {
      memory.set(key, value);
      try {
        localStorage.setItem(key, value);
      } catch {
        // Kept in memory for this visit.
      }
    },
  };
}

const KEY = 'fraction-fetch.profiles.v1';

export class Profiles {
  constructor(private store: Store) {}

  all(): Profile[] {
    try {
      const raw = this.store.get(KEY);
      return raw ? (JSON.parse(raw) as Profile[]).map(upgrade) : [];
    } catch {
      return [];
    }
  }

  private save(list: Profile[]): void {
    this.store.set(KEY, JSON.stringify(list));
  }

  get(id: string): Profile | undefined {
    return this.all().find((p) => p.id === id);
  }

  add(name: string, dog: number): Profile {
    const p: Profile = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim().slice(0, 20) || 'Pup',
      dog,
      stars: {},
      misses: {},
      checks: {},
      streak: { count: 0 },
      treats: 0,
      seen: [],
    };
    this.save([...this.all(), p]);
    return p;
  }

  update(id: string, change: (p: Profile) => void): Profile {
    const list = this.all();
    const p = list.find((x) => x.id === id);
    if (!p) throw new Error(`no profile ${id}`);
    change(p);
    this.save(list);
    return p;
  }

  remove(id: string): void {
    this.save(this.all().filter((p) => p.id !== id));
  }

  /**
   * Records a win. The first win of a day extends the streak (or restarts it after a gap)
   * and earns a treat. Returns what was new, for the result screen.
   */
  recordWin(id: string, levelId: string, stars: number, today: Date = new Date()): { sticker: boolean; treat: boolean } {
    let sticker = false;
    let treat = false;
    this.update(id, (p) => {
      sticker = !(p.stars[levelId] > 0);
      p.stars[levelId] = Math.max(p.stars[levelId] ?? 0, stars);
      const day = dayKey(today);
      if (p.streak.last === day) return;
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      p.streak = { count: p.streak.last === dayKey(yesterday) ? p.streak.count + 1 : 1, last: day };
      p.treats += 1;
      treat = true;
    });
    return { sticker, treat };
  }

  useTreat(id: string): boolean {
    let ok = false;
    this.update(id, (p) => {
      if (p.treats > 0) {
        p.treats -= 1;
        ok = true;
      }
    });
    return ok;
  }

  markSeen(id: string, forms: string[]): void {
    this.update(id, (p) => {
      p.seen = [...new Set([...p.seen, ...forms])];
    });
  }

  recordMiss(id: string, a: string, b: string): Profile {
    return this.update(id, (p) => {
      const k = pairKey(a, b);
      p.misses[k] = (p.misses[k] ?? 0) + 1;
    });
  }

  /** A correct match of a value slowly forgives past mix-ups that involved it. */
  recordMatch(id: string, keys: string[]): Profile {
    return this.update(id, (p) => {
      for (const [pair, n] of Object.entries(p.misses)) {
        if (!pair.split('|').some((k) => keys.includes(k))) continue;
        const left = n - 0.25;
        if (left <= 0) delete p.misses[pair];
        else p.misses[pair] = left;
      }
    });
  }
}

/** A level is open when it is the first, or the one before it has a star. */
export function unlocked(p: Profile, levelId: string): boolean {
  const i = LEVELS.findIndex((l) => l.id === levelId);
  if (i <= 0) return true;
  return (p.stars[LEVELS[i - 1].id] ?? 0) > 0;
}

/** The streak as it stands today: it lapses once a whole day is missed. */
export function currentStreak(p: Profile, today: Date = new Date()): number {
  if (!p.streak.last) return 0;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  return p.streak.last === dayKey(today) || p.streak.last === dayKey(yesterday) ? p.streak.count : 0;
}

export function totalStars(p: Profile): number {
  return Object.values(p.stars).reduce((a, b) => a + b, 0);
}

/** The "after" check opens once the last level is won. */
export function afterCheckOpen(p: Profile): boolean {
  return (p.stars[LEVELS[LEVELS.length - 1].id] ?? 0) > 0;
}
