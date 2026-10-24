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
      return raw ? (JSON.parse(raw) as Profile[]) : [];
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

  recordStars(id: string, levelId: string, stars: number): Profile {
    return this.update(id, (p) => {
      p.stars[levelId] = Math.max(p.stars[levelId] ?? 0, stars);
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

export function totalStars(p: Profile): number {
  return Object.values(p.stars).reduce((a, b) => a + b, 0);
}

/** The "after" check opens once the last level is won. */
export function afterCheckOpen(p: Profile): boolean {
  return (p.stars[LEVELS[LEVELS.length - 1].id] ?? 0) > 0;
}
