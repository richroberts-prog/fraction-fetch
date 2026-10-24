// Draws one tile: a bright card, a dog, and the fraction the dog holds.

import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { Tile } from '../core/board';
import { decimalText, percentText, type Display } from '../core/fractions';

/** Tile colours: bright and random, never tied to value. */
export const PALETTE = [0xff6b8b, 0xffa53d, 0xffd83d, 0x5fd38d, 0x4cc3ff, 0xa98bff];
const INK = 0x2b2340;
const FONT = 'Fredoka, system-ui, sans-serif';


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
  const w = s * 0.6;
  const h = s * 0.76;
  c.addChild(new Graphics().roundRect(-w / 2, -h / 2, w, h, s * 0.14).fill(0xffffff).stroke({ width: s * 0.03, color: INK }));
  const digits = Math.max(String(display.n).length, String(display.d).length);
  const size = s * (digits > 2 ? 0.22 : 0.32);
  const top = label(String(display.n), size);
  top.y = -h * 0.24;
  const bottom = label(String(display.d), size);
  bottom.y = h * 0.26;
  const lineW = Math.min(w - s * 0.08, size * 0.6 * digits + s * 0.06);
  c.addChild(new Graphics().rect(-lineW / 2, -s * 0.016, lineW, s * 0.032).fill(INK), top, bottom);
  return c;
}

/** Decimal or percent on a red collar band. */
function collar(text: string, s: number): Container {
  const c = new Container();
  const w = s * 0.86;
  const h = s * 0.4;
  c.addChild(new Graphics().roundRect(-w / 2, -h / 2, w, h, h / 2).fill(0xe23d4f).stroke({ width: s * 0.03, color: INK }));
  c.addChild(label(text, s * (text.length > 3 ? 0.27 : 0.32), 0xffffff));
  return c;
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
  return collar(percentText(display), s);
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

  // The fraction is the biggest thing on the tile; the dog is a badge in the corner.
  if (tile.display) {
    const v = valueArt(tile.display, s);
    if (tile.display.form === 'tag') v.position.set(s * 0.08, s * 0.04);
    else v.position.set(0, s * 0.1);
    c.addChild(v);
  }
  const dog = new Sprite(dogs[tile.dog % dogs.length]);
  dog.anchor.set(0.5);
  dog.width = dog.height = s * 0.3;
  dog.position.set(-s * 0.3, -s * 0.3);
  c.addChild(dog);

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
