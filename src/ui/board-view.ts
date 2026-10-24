// The board on screen: draws tiles, takes taps, and animates each phase of a pick.

import { Application, Assets, Container, Graphics, Rectangle, Sprite, type Texture } from 'pixi.js';
import type { Pos, Tile } from '../core/board';
import type { Game, Phase, PickResult } from '../core/game';
import { DOG_NAMES } from '../core/profiles';
import { tileArt } from './tile-art';

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
  dogTextures ??= await Promise.all(DOG_NAMES.map((n) => Assets.load<Texture>(`${base}art/${n}.webp`)));
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
  private selected: Pos | null = null;
  private ring = new Graphics();
  /** When set, only this cell takes taps (the tutorial points at one tile at a time). */
  lockTo: Pos | null = null;
  private hintTimer = 0;
  private hinting: Container[] = [];
  private raf = 0;
  /** Set when the scene changed outside a tween and needs one draw. */
  private dirty = true;

  /** Called after each pick, right or wrong, once the animation has played. */
  onPick: (result: PickResult) => void = () => {};
  /** Called as each clear happens, for sounds and effects. */
  onClear: (phase: Extract<Phase, { kind: 'clear' }>) => void = () => {};
  /** Called when a tile is tapped (selected or deselected). */
  onSelect: (p: Pos | null) => void = () => {};

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
      // Real time, so a slow tablet skips frames rather than slowing the game down.
      this.tick(Math.min(now - last, 250));
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
    this.fxLayer.addChild(this.ring);
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
    this.select(null);
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
          const ms = phase.kind === 'fall' ? 110 + rows * 55 : 170;
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
    if (!pos || this.busy || this.game.status !== 'playing') return;
    if (this.lockTo && (this.lockTo.r !== pos.r || this.lockTo.c !== pos.c)) return;
    this.stopHint();
    const sel = this.selected;
    if (sel && sel.r === pos.r && sel.c === pos.c) {
      this.select(null);
      this.onSelect(null);
      return;
    }
    if (!sel) {
      this.select(pos);
      this.onSelect(pos);
      return;
    }
    this.select(null);
    void this.tryPick(sel, pos);
  }

  private select(p: Pos | null): void {
    if (this.selected && this.game) {
      const t = this.game.board.tiles[this.selected.r][this.selected.c];
      const s = t && this.sprites.get(t.id);
      if (s) void this.tween(s, { scale: 1 }, 120);
    }
    this.selected = p;
    this.ring.clear();
    if (p && this.game) {
      const t = this.game.board.tiles[p.r][p.c];
      const s = t && this.sprites.get(t.id);
      if (s) void this.tween(s, { scale: 1.1 }, 120);
      const c = this.centre(p);
      const w = this.cell * 1.02;
      this.ring
        .roundRect(c.x - w / 2, c.y - w / 2, w, w, this.cell * 0.22)
        .stroke({ width: this.cell * 0.08, color: 0xffffff })
        .roundRect(c.x - w / 2, c.y - w / 2, w, w, this.cell * 0.22)
        .stroke({ width: this.cell * 0.035, color: 0xff6b8b });
    }
    this.dirty = true;
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

  /** Wobbles a tile side to side: "not that one". */
  private async wobble(p: Pos): Promise<void> {
    const t = this.game.board.tiles[p.r][p.c];
    const s = t && this.sprites.get(t.id);
    if (!s) return;
    const x = s.x;
    for (const dx of [-0.08, 0.08, -0.05, 0.05, 0]) await this.tween(s, { x: x + dx * this.cell }, 55);
  }

  /** Plays phases from the game (a pick, or the finale) and waits until they finish. */
  async play(phases: Phase[], pair?: [Pos, Pos]): Promise<void> {
    if (pair) {
      // The two dogs run to meet in the middle before they go.
      const [a, z] = pair.map((p) => this.sprites.get(phases[0].kind === 'clear' ? this.idAt(p) : -1));
      if (a && z) {
        const mid = { x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 };
        this.tileLayer.addChild(a, z);
        await Promise.all([this.tween(a, { ...mid, scale: 1.2 }, 220), this.tween(z, { ...mid, scale: 1.2 }, 220)]);
      }
    }
    for (const phase of phases) {
      if (phase.kind === 'clear') this.onClear(phase);
      await this.apply(phase);
      if (phase.kind === 'clear') await new Promise((r) => setTimeout(r, 60));
    }
  }

  /** Sprite id of the tile at p before the pick, found from what is drawn there. */
  private idAt(p: Pos): number {
    const c = this.centre(p);
    for (const [id, s] of this.sprites) if (Math.abs(s.x - c.x) < 1 && Math.abs(s.y - c.y) < 1) return id;
    return -1;
  }

  async tryPick(a: Pos, z: Pos): Promise<PickResult | null> {
    if (this.busy) return null;
    this.busy = true;
    this.stopHint();
    const result = this.game.pick(a, z, performance.now());
    if (result.ok) await this.play(result.phases, [a, z]);
    else if (result.miss) await Promise.all([this.wobble(a), this.wobble(z)]);
    this.onPick(result);
    this.busy = false;
    this.hintTimer = 0;
    return result;
  }

  /** Lets the screen run the finale or a redraw while input waits. */
  async hold(work: () => Promise<void>): Promise<void> {
    this.busy = true;
    try {
      await work();
    } finally {
      this.busy = false;
    }
  }

  redraw(): void {
    this.rebuild();
    this.dirty = true;
  }
}
