// A fraction value and the ways a tile can show it.
// Two tiles match when their values are equal, whatever form they are shown in.

export interface Fraction {
  n: number;
  d: number;
}

export function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

export function simplify(f: Fraction): Fraction {
  const g = gcd(f.n, f.d);
  return { n: f.n / g, d: f.d / g };
}

/** Value key: the simplest form, e.g. "1/2". Equal values share a key. */
export function keyOf(f: Fraction): string {
  const s = simplify(f);
  return `${s.n}/${s.d}`;
}

export function parseKey(key: string): Fraction {
  const [n, d] = key.split('/').map(Number);
  return { n, d };
}

export function valueOf(key: string): number {
  const f = parseKey(key);
  return f.n / f.d;
}

/**
 * How a tile shows its value.
 * tag: written fraction 3/4. bone: a bar in d equal parts, n shaded.
 * bowl: a circle in d equal slices, n filled. decimal: 0.75. percent: 75%.
 */
export type Form = 'tag' | 'bone' | 'bowl' | 'decimal' | 'percent';

export interface Display {
  form: Form;
  /** The fraction as drawn: 2/4 shows as 2/4, not 1/2. For decimal and percent, d is 10 or 100. */
  n: number;
  d: number;
}

/** Most parts a picture can have and still be readable on a phone-sized tile. */
export const MAX_PICTURE_PARTS = 10;

/** True when the value can be written exactly as tenths or hundredths. */
export function hasDecimal(key: string): boolean {
  const { d } = parseKey(key);
  return 100 % d === 0;
}

export function decimalText(display: Display): string {
  // d is 10 or 100 here.
  const places = display.d === 10 ? 1 : 2;
  return (display.n / display.d).toFixed(places);
}

export function percentText(display: Display): string {
  return `${Math.round((display.n / display.d) * 100)}%`;
}

/**
 * Every way to show this value with the forms allowed. Written fractions and pictures use
 * the denominators in dens that the value fits (½ with dens [2, 4, 10] gives 1/2, 2/4, 5/10).
 */
export function displaysFor(key: string, forms: Form[], dens: number[]): Display[] {
  const base = parseKey(key);
  const out: Display[] = [];
  for (const form of forms) {
    if (form === 'decimal' || form === 'percent') {
      if (!hasDecimal(key)) continue;
      if (form === 'percent') {
        out.push({ form, n: (base.n * 100) / base.d, d: 100 });
      } else {
        const d = 10 % base.d === 0 ? 10 : 100;
        out.push({ form, n: (base.n * d) / base.d, d });
      }
      continue;
    }
    for (const d of dens) {
      if (d % base.d !== 0) continue;
      if (form !== 'tag' && d > MAX_PICTURE_PARTS) continue;
      out.push({ form, n: (base.n * d) / base.d, d });
    }
  }
  return out;
}

export function displayKey(display: Display): string {
  return keyOf(display);
}

/** Text a child reads for a display, used for labels and accessibility. */
export function displayText(display: Display): string {
  if (display.form === 'decimal') return decimalText(display);
  if (display.form === 'percent') return percentText(display);
  return `${display.n}/${display.d}`;
}

/** Pretty single-glyph fractions for headings ("collect tiles worth ½"). */
const GLYPHS: Record<string, string> = {
  '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾', '1/5': '⅕', '2/5': '⅖',
  '3/5': '⅗', '4/5': '⅘', '1/6': '⅙', '5/6': '⅚', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝',
  '7/8': '⅞', '1/10': '⅒',
};

export function prettyKey(key: string): string {
  return GLYPHS[key] ?? key;
}
