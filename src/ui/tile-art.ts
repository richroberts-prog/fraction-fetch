// Draws one tile: a bright card, a dog, and the fraction the dog holds.
// Fraction pictures are drawn in code so every part is exactly equal.

import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { Tile } from '../core/board';
import { decimalText, percentText, type Display } from '../core/fractions';

/** Tile colours: bright and random, never tied to value. */
export const PALETTE = [0xff6b8b, 0xffa53d, 0xffd83d, 0x5fd38d, 0x4cc3ff, 0xa98bff];
const INK = 0x2b2340;
const KIBBLE = 0xc9772e;
const FONT = 'Fredoka, system-ui, sans-serif';

export const BREED_NAMES = ['corgi', 'dachshund', 'dalmatian', 'pug', 'collie', 'labrador', 'husky', 'poodle'];

function shade(colour: number, by: number): number {
  const ch = (shift: number) => Math.max(0, Math.min(255, ((colour >> shift) & 255) + by));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function label(text: string, size: number, colour = INK): Text {
  const t = new Text({ text, style: { fontFamily: FONT, fontSize: size, fontWeight: '600', fill: colour } });
  t.anchor.set(0.5);
  return t;
}

/** Written fraction on a white dog tag: numerator over a line over denominator. */
function tag(display: Display, s: number): Container {
  const c = new Container();
  const w = s * 0.66;
  const h = s * 0.54;
  c.addChild(new Graphics().roundRect(-w / 2, -h / 2, w, h, s * 0.12).fill(0xffffff).stroke({ width: s * 0.025, color: INK }));
  const digits = Math.max(String(display.n).length, String(display.d).length);
  const size = s * (digits > 2 ? 0.18 : 0.24);
  const top = label(String(display.n), size);
  top.y = -h * 0.24;
  const bottom = label(String(display.d), size);
  bottom.y = h * 0.25;
  const lineW = size * 0.6 * digits + s * 0.04;
  c.addChild(new Graphics().rect(-lineW / 2, -s * 0.012, lineW, s * 0.024).fill(INK), top, bottom);
  return c;
}

/** Decimal or percent on a red collar band. */
function collar(text: string, s: number): Container {
  const c = new Container();
  const w = s * 0.86;
  const h = s * 0.32;
  c.addChild(new Graphics().roundRect(-w / 2, -h / 2, w, h, h / 2).fill(0xe23d4f).stroke({ width: s * 0.025, color: INK }));
  c.addChild(new Graphics().circle(w / 2 - h * 0.45, 0, h * 0.18).fill(0xffd83d));
  const t = label(text, s * (text.length > 4 ? 0.2 : 0.23), 0xffffff);
  t.x = -h * 0.2;
  c.addChild(t);
  return c;
}

/** A bone whose middle is split into d equal parts, n of them shaded. */
export function bone(n: number, d: number, s: number): Graphics {
  const g = new Graphics();
  const w = s * 0.66;
  const h = s * 0.26;
  const knob = h * 0.42;
  for (const x of [-w / 2, w / 2]) {
    for (const y of [-h * 0.32, h * 0.32]) g.circle(x, y, knob).fill(0xfff4e0).stroke({ width: s * 0.02, color: INK });
  }
  const part = w / d;
  for (let i = 0; i < d; i++) {
    g.rect(-w / 2 + i * part, -h / 2, part, h).fill(i < n ? KIBBLE : 0xfff4e0);
  }
  g.rect(-w / 2, -h / 2, w, h).stroke({ width: s * 0.02, color: INK });
  for (let i = 1; i < d; i++) {
    g.moveTo(-w / 2 + i * part, -h / 2).lineTo(-w / 2 + i * part, h / 2).stroke({ width: s * 0.014, color: INK });
  }
  return g;
}

/** A food bowl seen from above, split into d equal slices, n of them full. */
export function bowl(n: number, d: number, s: number): Graphics {
  const g = new Graphics();
  const r = s * 0.22;
  g.circle(0, 0, r + s * 0.04).fill(0x7a8cff).stroke({ width: s * 0.02, color: INK });
  g.circle(0, 0, r).fill(0xffffff);
  const start = -Math.PI / 2;
  const step = (Math.PI * 2) / d;
  for (let i = 0; i < n; i++) {
    g.moveTo(0, 0).arc(0, 0, r, start + i * step, start + (i + 1) * step).lineTo(0, 0).fill(KIBBLE);
  }
  if (d > 1) {
    for (let i = 0; i < d; i++) {
      const a = start + i * step;
      g.moveTo(0, 0).lineTo(Math.cos(a) * r, Math.sin(a) * r).stroke({ width: s * 0.014, color: INK });
    }
  }
  g.circle(0, 0, r).stroke({ width: s * 0.02, color: INK });
  return g;
}

function tennisBall(s: number): Graphics {
  const r = s * 0.36;
  const g = new Graphics().circle(0, 0, r).fill(0xd4f03c).stroke({ width: s * 0.03, color: INK });
  g.moveTo(-r * 0.75, -r * 0.65).bezierCurveTo(-r * 0.1, -r * 0.25, -r * 0.1, r * 0.25, -r * 0.75, r * 0.65).stroke({ width: s * 0.04, color: 0xffffff });
  g.moveTo(r * 0.75, -r * 0.65).bezierCurveTo(r * 0.1, -r * 0.25, r * 0.1, r * 0.25, r * 0.75, r * 0.65).stroke({ width: s * 0.04, color: 0xffffff });
  return g;
}

/** The value part of a tile, centred on 0,0. */
export function valueArt(display: Display, s: number): Container {
  if (display.form === 'tag') return tag(display, s);
  if (display.form === 'decimal') return collar(decimalText(display), s);
  if (display.form === 'percent') return collar(percentText(display), s);
  const c = new Container();
  c.addChild(display.form === 'bone' ? bone(display.n, display.d, s) : bowl(display.n, display.d, s));
  return c;
}

/** A whole tile of size s, centred on 0,0. */
export function tileArt(tile: Tile, s: number, dogs: Texture[]): Container {
  const c = new Container();
  const pad = s * 0.05;
  const w = s - pad * 2;
  const colour = PALETTE[tile.colour % PALETTE.length];
  const card = new Graphics()
    .roundRect(-w / 2, -w / 2 + s * 0.035, w, w, s * 0.18)
    .fill(shade(colour, -70))
    .roundRect(-w / 2, -w / 2, w, w, s * 0.18)
    .fill(colour)
    .roundRect(-w / 2 + s * 0.06, -w / 2 + s * 0.04, w - s * 0.12, w * 0.3, s * 0.12)
    .fill({ color: 0xffffff, alpha: 0.28 });
  c.addChild(card);

  if (tile.special === 'ball') {
    c.addChild(tennisBall(s));
    return c;
  }

  const dog = new Sprite(dogs[tile.breed % dogs.length]);
  dog.anchor.set(0.5);
  const big = tile.display?.form === 'tag';
  dog.width = dog.height = s * (big ? 0.36 : 0.44);
  dog.y = -s * (big ? 0.26 : 0.21);
  c.addChild(dog);

  if (tile.display) {
    const v = valueArt(tile.display, s);
    v.y = s * (big ? 0.17 : 0.22);
    c.addChild(v);
  }

  if (tile.special === 'row' || tile.special === 'col') {
    // Speed lines on both edges, along the way the zoomies run.
    const g = new Graphics();
    for (const side of [-1, 1]) {
      for (const k of [-0.12, 0, 0.12]) {
        const along = side * s * 0.36;
        if (tile.special === 'row') g.moveTo(along - s * 0.06, s * k).lineTo(along + s * 0.06, s * k);
        else g.moveTo(s * k, along - s * 0.06).lineTo(s * k, along + s * 0.06);
      }
    }
    g.stroke({ width: s * 0.035, color: 0xffffff });
    c.addChild(g);
    const badge = label(tile.special === 'row' ? '⇆' : '⇅', s * 0.2, 0xffffff);
    badge.position.set(s * 0.33, -s * 0.33);
    c.addChild(badge);
  }
  if (tile.special === 'bag') {
    c.addChild(new Graphics().roundRect(-w / 2, -w / 2, w, w, s * 0.18).stroke({ width: s * 0.06, color: 0xffd83d }));
    const badge = label('🎁', s * 0.2);
    badge.position.set(s * 0.33, -s * 0.33);
    c.addChild(badge);
  }
  return c;
}
