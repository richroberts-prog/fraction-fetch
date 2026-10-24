// The board on screen: draws tiles, takes swipes and taps, and animates each phase of a move.

import { Application, Assets, Container, Graphics, Rectangle, Sprite, type Texture } from 'pixi.js';
import type { Pos, Tile } from '../core/board';
import type { Game, Phase, SwapResult } from '../core/game';
import { BREED_NAMES, tileArt } from './tile-art';

type Ease = (t: number) => number;
const easeOut: Ease = (t) => 1 - (1 - t) * (1 - t);
const easeIn: Ease = (t) => t * t;
const bounce: Ease = (t) => {
  const s = 1.6;
  return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
};

interface Tween {
  step(ms: number): boolean;
}

let dogTextures: Texture[] | null = null;

export async function loadArt(base: string): Promise<void> {
  dogTextures ??= await Promise.all(BREED_NAMES.map((n) => Assets.load<Texture>(`${base}art/${n}.webp`)));
}

export class BoardView {
  readonly app = new Application();
  private stage = new Container();
  private mudLayer = new Container();
  /** Mud splats drawn over the tile corners, so mud stays visible under a full board. */
  private mudTop = new Container();
  private tileLayer = new Container();
  private fxLayer = new Container();
  private mask = new Graphics();
  private sprites = new Map<number, Container>();
  private tweens: Tween[] = [];
  private cell = 60;
  private game!: Game;
  private busy = false;
  private down: { pos: Pos; x: number; y: number } | null = null;
  private selected: Pos | null = null;
  private hintTimer = 0;
  private hinting: Container[] = [];
  private raf = 0;
  /** Set when the scene changed outside a tween and needs one draw. */
  private dirty = true;

  /** Called after each swap, with the result, once the animation has played. */
  onMove: (result: SwapResult) => void = () => {};
  /** Called as each clear happens, for sounds. */
  onClear: (phase: Extract<Phase, { kind: 'clear' }>) => void = () => {};
  /** Called on a swap that does not work. */
  onBadSwap: (result: SwapResult) => void = () => {};

  async init(host: HTMLElement, size: number): Promise<void> {
    await this.app.init({
      width: size,
      height: size,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      autoStart: false,
    });
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.stage);
    this.stage.addChild(this.mudLayer, this.tileLayer, this.mudTop, this.fxLayer, this.mask);
    this.tileLayer.mask = this.mask;
    // Own frame loop: draws only while something moves, so an idle board costs no battery.
    let last = performance.now();
    const frame = (now: number) => {
      if (this.app.renderer === null) return;
      this.tick(Math.min(now - last, 100));
      last = now;
      if (this.dirty || this.tweens.length || this.hinting.length) this.app.render();
      this.dirty = false;
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
    const canvas = this.app.canvas;
    canvas.style.touchAction = 'none';
    // Some tablets drop the GPU's memory when turned; the pre-drawn tiles go with it, so redraw them.
    canvas.addEventListener('webglcontextrestored', () =>
      setTimeout(() => {
        if (this.game) this.rebuild();
        this.dirty = true;
      }, 50),
    );
    canvas.addEventListener('pointerdown', (e) => this.pointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.pointerMove(e));
    window.addEventListener('pointerup', () => (this.down = null));
    this.size = size;
  }

  set size(px: number) {
    this.app.renderer.resize(px, px);
    this.cell = px / 8;
    this.mask.clear().rect(0, 0, px, px).fill(0xffffff);
    if (this.game) this.rebuild();
    this.dirty = true;
  }

  show(game: Game): void {
    this.game = game;
    this.busy = false;
    this.selected = null;
    this.rebuild();
    this.dirty = true;
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.app.destroy(true, { children: true, texture: true });
  }

  /** Board-pixel centre of a cell, for tests and the tutorial hand. */
  centre(p: Pos): { x: number; y: number } {
    return { x: (p.c + 0.5) * this.cell, y: (p.r + 0.5) * this.cell };
  }

  /** True when no move is playing out. */
  get idle(): boolean {
    return !this.busy;
  }

  /** Board width in drawing pixels. */
  get px(): number {
    return this.cell * 8;
  }

  // ---- drawing ----

  private rebuild(): void {
    for (const s of this.sprites.values()) s.destroy({ children: true, texture: true });
    this.sprites.clear();
    this.drawMud(this.game.board.mud);
    this.game.board.tiles.forEach((row, r) =>
      row.forEach((t, c) => {
        if (t) this.place(this.make(t), { r, c });
      }),
    );
  }

  private drawMud(mud: boolean[][]): void {
    this.mudLayer.removeChildren().forEach((c) => c.destroy());
    this.mudTop.removeChildren().forEach((c) => c.destroy());
    const s = this.cell;
    const g = new Graphics();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        g.roundRect(c * s + 2, r * s + 2, s - 4, s - 4, s * 0.2).fill({ color: 0xffffff, alpha: 0.35 });
      }
    }
    this.mudLayer.addChild(g);
    mud.forEach((row, r) =>
      row.forEach((m, c) => {
        if (!m) return;
        const blob = new Graphics()
          .roundRect(c * s, r * s, s, s, s * 0.25)
          .fill(0x7a4e2d)
          .circle(c * s + s * 0.3, r * s + s * 0.35, s * 0.1)
          .fill(0x5c3920)
          .circle(c * s + s * 0.7, r * s + s * 0.65, s * 0.13)
          .fill(0x5c3920);
        blob.label = `mud-${r}-${c}`;
        this.mudLayer.addChild(blob);
        const x = c * s;
        const y = r * s;
        const splat = new Graphics()
          .ellipse(x + s * 0.13, y + s * 0.9, s * 0.15, s * 0.1)
          .ellipse(x + s * 0.87, y + s * 0.9, s * 0.15, s * 0.1)
          .ellipse(x + s * 0.5, y + s * 0.95, s * 0.22, s * 0.07)
          .circle(x + s * 0.1, y + s * 0.12, s * 0.07)
          .circle(x + s * 0.9, y + s * 0.14, s * 0.06)
          .fill(0x6b4226)
          .stroke({ width: s * 0.015, color: 0x3d2414 });
        splat.label = blob.label;
        this.mudTop.addChild(splat);
      }),
    );
  }

  /** Draws the tile once into an image, so the board is 64 sprites rather than hundreds of shapes. */
  private make(t: Tile): Container {
    const art = tileArt(t, this.cell, dogTextures!);
    const s = this.cell;
    const texture = this.app.renderer.generateTexture({
      target: art,
      frame: new Rectangle(-s / 2, -s / 2, s, s),
      resolution: this.app.renderer.resolution,
      antialias: true,
    });
    art.destroy({ children: true });
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    this.tileLayer.addChild(sprite);
    this.sprites.set(t.id, sprite);
    return sprite;
  }

  private place(sprite: Container, p: Pos): void {
    const { x, y } = this.centre(p);
    sprite.position.set(x, y);
  }

  // ---- animation ----

  private tick(ms: number): void {
    if (this.tweens.length) this.dirty = true;
    this.tweens = this.tweens.filter((t) => t.step(ms));
    if (!this.busy && this.game?.status === 'playing') {
      this.hintTimer += ms;
      if (this.hintTimer > 7000 && this.hinting.length === 0) this.startHint();
    }
    if (this.hinting.length) {
      const k = Math.sin(performance.now() / 120) * 0.06 + 1.04;
      for (const s of this.hinting) s.scale.set(k);
    }
  }

  private tween(obj: Container, to: { x?: number; y?: number; scale?: number; alpha?: number; rotation?: number }, ms: number, ease: Ease = easeOut): Promise<void> {
    const from = { x: obj.x, y: obj.y, scale: obj.scale.x, alpha: obj.alpha, rotation: obj.rotation };
    let t = 0;
    return new Promise((done) => {
      this.tweens.push({
        step: (dt) => {
          if (obj.destroyed) {
            done();
            return false;
          }
          t = Math.min(1, t + dt / ms);
          const k = ease(t);
          if (to.x !== undefined) obj.x = from.x + (to.x - from.x) * k;
          if (to.y !== undefined) obj.y = from.y + (to.y - from.y) * k;
          if (to.scale !== undefined) obj.scale.set(from.scale + (to.scale - from.scale) * k);
          if (to.alpha !== undefined) obj.alpha = from.alpha + (to.alpha - from.alpha) * k;
          if (to.rotation !== undefined) obj.rotation = from.rotation + (to.rotation - from.rotation) * k;
          if (t >= 1) done();
          return t < 1;
        },
      });
    });
  }

  /** Paw prints that burst out where a tile was cleared. */
  private paws(x: number, y: number, count = 4): void {
    for (let i = 0; i < count; i++) {
      const s = this.cell * 0.12;
      const paw = new Graphics()
        .circle(0, s * 0.5, s)
        .fill(0xffffff)
        .circle(-s * 0.9, -s * 0.6, s * 0.42)
        .fill(0xffffff)
        .circle(0, -s * 0.95, s * 0.42)
        .fill(0xffffff)
        .circle(s * 0.9, -s * 0.6, s * 0.42)
        .fill(0xffffff);
      paw.position.set(x, y);
      paw.rotation = Math.random() * Math.PI * 2;
      this.fxLayer.addChild(paw);
      const angle = Math.random() * Math.PI * 2;
      const dist = this.cell * (0.6 + Math.random() * 0.6);
      void this.tween(paw, { x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist, alpha: 0, scale: 0.4 }, 500).then(() => paw.destroy());
    }
  }

  private flashLine(p: Pos, dir: 'row' | 'col'): void {
    const px = this.cell * 8;
    const g = new Graphics();
    if (dir === 'row') g.rect(0, p.r * this.cell + this.cell * 0.3, px, this.cell * 0.4);
    else g.rect(p.c * this.cell + this.cell * 0.3, 0, this.cell * 0.4, px);
    g.fill({ color: 0xffffff, alpha: 0.9 });
    this.fxLayer.addChild(g);
    void this.tween(g, { alpha: 0 }, 350).then(() => g.destroy());
  }

  /** Moves every tile to where grid says, adding new ones and removing gone ones. */
  private async apply(phase: Phase): Promise<void> {
    const seen = new Set<number>();
    const moves: Promise<void>[] = [];
    // New tiles in a column start stacked above the board and slide down together.
    const fresh = Array.from({ length: 8 }, (_, c) => phase.grid.filter((row) => row[c] && !this.sprites.has(row[c]!.id)).length);
    phase.grid.forEach((row, r) =>
      row.forEach((t, c) => {
        if (!t) return;
        seen.add(t.id);
        const target = this.centre({ r, c });
        let s = this.sprites.get(t.id);
        if (!s) {
          s = this.make(t);
          if (phase.kind === 'fall') {
            s.position.set(target.x, target.y - fresh[c] * this.cell);
          } else {
            s.position.set(target.x, target.y);
            s.scale.set(0.2);
            moves.push(this.tween(s, { scale: 1 }, 260, bounce));
            return;
          }
        }
        if (s.x !== target.x || s.y !== target.y) {
          const rows = Math.abs(target.y - s.y) / this.cell;
          const ms = phase.kind === 'fall' ? 110 + rows * 55 : phase.kind === 'shuffle' ? 420 : 170;
          moves.push(this.tween(s, { x: target.x, y: target.y }, ms, phase.kind === 'fall' ? easeIn : easeOut));
        }
      }),
    );
    for (const [id, s] of this.sprites) {
      if (seen.has(id)) continue;
      this.sprites.delete(id);
      this.paws(s.x, s.y);
      moves.push(this.tween(s, { scale: 0, alpha: 0, rotation: 0.6 }, 220).then(() => s.destroy({ children: true, texture: true })));
    }
    if (phase.kind === 'clear') {
      for (const f of phase.clear.fired) if (f.special === 'row' || f.special === 'col') this.flashLine(f.pos, f.special);
      for (const p of phase.clear.mudCleaned) {
        for (const layer of [this.mudLayer, this.mudTop]) {
          const blob = layer.children.find((m) => m.label === `mud-${p.r}-${p.c}`);
          if (blob) void this.tween(blob as Container, { alpha: 0 }, 300).then(() => blob.destroy());
        }
      }
    }
    await Promise.all(moves);
  }

  // ---- input ----

  private cellAt(e: PointerEvent): Pos | null {
    const rect = this.app.canvas.getBoundingClientRect();
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * 8);
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * 8);
    return r >= 0 && r < 8 && c >= 0 && c < 8 ? { r, c } : null;
  }

  private pointerDown(e: PointerEvent): void {
    const pos = this.cellAt(e);
    if (!pos || this.busy) return;
    this.down = { pos, x: e.clientX, y: e.clientY };
    if (this.selected && Math.abs(this.selected.r - pos.r) + Math.abs(this.selected.c - pos.c) === 1) {
      const from = this.selected;
      this.select(null);
      this.down = null;
      void this.trySwap(from, pos);
      return;
    }
    this.select(this.selected && this.selected.r === pos.r && this.selected.c === pos.c ? null : pos);
  }

  private pointerMove(e: PointerEvent): void {
    if (!this.down || this.busy) return;
    const rect = this.app.canvas.getBoundingClientRect();
    const cellPx = rect.width / 8;
    const dx = e.clientX - this.down.x;
    const dy = e.clientY - this.down.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < cellPx * 0.35) return;
    const from = this.down.pos;
    const to = Math.abs(dx) > Math.abs(dy) ? { r: from.r, c: from.c + Math.sign(dx) } : { r: from.r + Math.sign(dy), c: from.c };
    this.down = null;
    this.select(null);
    if (to.r >= 0 && to.r < 8 && to.c >= 0 && to.c < 8) void this.trySwap(from, to);
  }

  private select(p: Pos | null): void {
    if (this.selected) {
      const t = this.game.board.tiles[this.selected.r][this.selected.c];
      const s = t && this.sprites.get(t.id);
      if (s) void this.tween(s, { scale: 1 }, 120);
    }
    this.selected = p;
    if (p) {
      const t = this.game.board.tiles[p.r][p.c];
      const s = t && this.sprites.get(t.id);
      if (s) void this.tween(s, { scale: 1.12 }, 120);
    }
  }

  private startHint(): void {
    const h = this.game.hint();
    if (!h) return;
    this.hinting = h.map((p) => this.sprites.get(this.game.board.tiles[p.r][p.c]!.id)!).filter(Boolean);
  }

  private stopHint(): void {
    for (const s of this.hinting) if (!s.destroyed) s.scale.set(1);
    this.dirty = true;
    this.hinting = [];
    this.hintTimer = 0;
  }

  async trySwap(a: Pos, z: Pos): Promise<SwapResult | null> {
    if (this.busy) return null;
    this.busy = true;
    this.stopHint();
    const result = this.game.swap(a, z);
    if (!result.ok) {
      if (result.phases.length) {
        this.onBadSwap(result);
        await this.apply(result.phases[0]);
        await this.apply(result.phases[1]);
      }
    } else {
      for (const phase of result.phases) {
        if (phase.kind === 'clear') this.onClear(phase);
        await this.apply(phase);
        if (phase.kind === 'clear') await new Promise((r) => setTimeout(r, 60));
      }
      this.onMove(result);
    }
    this.busy = false;
    this.hintTimer = 0;
    return result;
  }
}
