// Screens: who's playing → level map → play a level, plus the fractions check.

import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import './ui/style.css';
import { registerSW } from 'virtual:pwa-register';
import type { Pos } from './core/board';
import { AFTER, BEFORE, score, type Question } from './core/check';
import { displaysFor, displayText, prettyKey, valueOf, type Display } from './core/fractions';
import { COMBO_MS, Game, type Phase, type PickResult } from './core/game';
import { LEVELS, levelById, mudTarget, nextLevel, WORLDS, type Level } from './core/levels';
import { afterCheckOpen, boardDogs, browserStore, currentStreak, DOG_NAMES, Profiles, stickerFor, totalStars, unlocked, type Profile } from './core/profiles';
import { barSvg } from './ui/bars';
import { BoardView, loadArt } from './ui/board-view';
import * as sound from './ui/sound';

registerSW({ immediate: true });

const BASE = import.meta.env.BASE_URL;
const store = browserStore();
const profiles = new Profiles(store);
const app = document.getElementById('app')!;
const dogUrl = (i: number) => `${BASE}art/${DOG_NAMES[i % DOG_NAMES.length]}.webp`;
/** Dogs a new player can pick as their avatar. */
const AVATARS = 8;

sound.setMuted(store.get('fraction-fetch.muted') === '1');
document.addEventListener('pointerdown', () => sound.unlock(), { capture: true });

let board: BoardView | null = null;

function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? String(values[i]) : ''), '');
}

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function screen(markup: string): HTMLElement {
  board?.destroy();
  board = null;
  app.innerHTML = markup;
  window.scrollTo(0, 0);
  return app;
}

function muteButton(): string {
  return `<button class="icon" data-mute aria-label="${sound.isMuted() ? 'Sound off' : 'Sound on'}">${sound.isMuted() ? '🔇' : '🔊'}</button>`;
}

function wireMute(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>('[data-mute]').forEach((b) =>
    b.addEventListener('click', () => {
      sound.setMuted(!sound.isMuted());
      store.set('fraction-fetch.muted', sound.isMuted() ? '1' : '0');
      b.textContent = sound.isMuted() ? '🔇' : '🔊';
      b.setAttribute('aria-label', sound.isMuted() ? 'Sound off' : 'Sound on');
      if (!sound.isMuted()) sound.squeak();
    }),
  );
}

function checkLine(p: Profile): string {
  const fmt = (n?: number) => (n === undefined ? '—' : `${n}/10`);
  return `Fractions check: before ${fmt(p.checks.before)} · after ${fmt(p.checks.after)}`;
}

// ---------- who's playing ----------

function whoScreen(editing = false): void {
  const list = profiles.all();
  const root = screen(html`
    <main class="who">
      <h1 class="logo">Fraction <span>Fetch</span></h1>
      <h2>Who's playing?</h2>
      <div class="players">
        ${list
          .map(
            (p) => html`
          <button class="player" data-id="${p.id}">
            <img src="${dogUrl(p.dog)}" alt="" />
            <strong>${esc(p.name)}</strong>
            <small>⭐ ${totalStars(p)}</small>
            <small>${checkLine(p)}</small>
            ${editing ? '<span class="remove" aria-label="Remove">✕</span>' : ''}
          </button>`,
          )
          .join('')}
        <button class="player add" data-add><span class="plus">＋</span><strong>New player</strong></button>
      </div>
      ${list.length ? `<button class="link" data-edit>${editing ? 'Done' : 'Remove a player'}</button>` : ''}
    </main>`);
  root.querySelectorAll<HTMLButtonElement>('.player[data-id]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.id!;
      if (editing) {
        const p = profiles.get(id)!;
        if (confirm(`Remove ${p.name} and all their stars?`)) profiles.remove(id);
        whoScreen(true);
      } else mapScreen(id);
    }),
  );
  root.querySelector('[data-add]')!.addEventListener('click', newPlayerScreen);
  root.querySelector('[data-edit]')?.addEventListener('click', () => whoScreen(!editing));
}

function newPlayerScreen(): void {
  let dog = Math.floor(Math.random() * AVATARS);
  const root = screen(html`
    <main class="who">
      <h2>New player</h2>
      <form class="new-player">
        <label>Your name <input name="name" maxlength="20" autocomplete="off" required /></label>
        <p>Pick your dog</p>
        <div class="dogs">
          ${DOG_NAMES.slice(0, AVATARS).map((n, i) => `<button type="button" class="dog${i === dog ? ' on' : ''}" data-dog="${i}" aria-label="${n}"><img src="${dogUrl(i)}" alt="" /></button>`).join('')}
        </div>
        <div class="row">
          <button type="button" class="ghost" data-back>Back</button>
          <button class="big">Let's go!</button>
        </div>
      </form>
    </main>`);
  root.querySelectorAll<HTMLButtonElement>('[data-dog]').forEach((b) =>
    b.addEventListener('click', () => {
      dog = Number(b.dataset.dog);
      root.querySelectorAll('.dog').forEach((x) => x.classList.toggle('on', x === b));
      sound.bark();
    }),
  );
  root.querySelector('[data-back]')!.addEventListener('click', () => whoScreen());
  root.querySelector('form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = (root.querySelector('input') as HTMLInputElement).value;
    const p = profiles.add(name, dog);
    mapScreen(p.id);
  });
  (root.querySelector('input') as HTMLInputElement).focus();
}

// ---------- level map ----------

function mapScreen(id: string): void {
  const p = profiles.get(id);
  if (!p) return whoScreen();
  const needsBefore = p.checks.before === undefined;
  const streak = currentStreak(p);
  const won = LEVELS.filter((l) => (p.stars[l.id] ?? 0) > 0).length;
  const root = screen(html`
    <main class="map">
      <header class="bar">
        <button class="icon" data-who aria-label="Change player">⬅</button>
        <img class="avatar" src="${dogUrl(p.dog)}" alt="" />
        <div class="who-name"><strong>${esc(p.name)}</strong><small>⭐ ${totalStars(p)} · ${checkLine(p)}</small></div>
        ${muteButton()}
      </header>
      <section class="perks">
        <div class="perk"><span>🐾</span><b>${streak}</b><small>day streak</small></div>
        <div class="perk"><span>🦴</span><b>${p.treats}</b><small>treats</small></div>
        <button class="perk book" data-book><span>📒</span><b>${won}/${LEVELS.length}</b><small>sticker book</small></button>
      </section>
      ${
        needsBefore
          ? `<section class="card check-card">
              <h3>First, a quick fractions check</h3>
              <p>10 questions to see what you already know. It's not a test, just do your best!</p>
              <button class="big" data-check="before">Start the check</button>
            </section>`
          : ''
      }
      ${WORLDS.map(
        (w) => html`
        <section class="world">
          <h3>World ${w.number} · ${w.name}</h3>
          <p class="topic">${w.topic}</p>
          <div class="levels">
            ${LEVELS.filter((l) => l.world === w.number)
              .map((l) => {
                const open = !needsBefore && unlocked(p, l.id);
                const stars = p.stars[l.id] ?? 0;
                return `<button class="level${open ? '' : ' locked'}" data-level="${l.id}" ${open ? '' : 'disabled'} aria-label="Level ${l.id}">
                  <span class="num">${open ? l.number : '🔒'}</span>
                  <span class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>
                </button>`;
              })
              .join('')}
          </div>
        </section>`,
      ).join('')}
      ${
        afterCheckOpen(p)
          ? `<section class="card check-card">
              <h3>${p.checks.after === undefined ? 'You finished both worlds!' : 'Fractions check'}</h3>
              <p>${
                p.checks.after === undefined
                  ? 'Take the final fractions check to see how much you have learned.'
                  : `Before: <b>${p.checks.before}/10</b> → After: <b>${p.checks.after}/10</b>`
              }</p>
              ${p.checks.after === undefined ? '<button class="big" data-check="after">Final check</button>' : ''}
            </section>`
          : ''
      }
    </main>`);
  wireMute(root);
  root.querySelector('[data-who]')!.addEventListener('click', () => whoScreen());
  root.querySelector('[data-book]')!.addEventListener('click', () => bookScreen(id));
  root.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((b) =>
    b.addEventListener('click', () => levelIntro(id, levelById(b.dataset.level!))),
  );
  root.querySelectorAll<HTMLButtonElement>('[data-check]').forEach((b) =>
    b.addEventListener('click', () => checkScreen(id, b.dataset.check as 'before' | 'after')),
  );
}

// ---------- sticker book ----------

const dogName = (i: number) => {
  const n = DOG_NAMES[i];
  const names: Record<string, string> = { frenchie: 'French bulldog', jackrussell: 'Jack Russell', shiba: 'Shiba Inu', spaniel: 'Cocker spaniel', bernese: 'Bernese' };
  return names[n] ?? n[0].toUpperCase() + n.slice(1);
};

function bookScreen(id: string): void {
  const p = profiles.get(id)!;
  const root = screen(html`
    <main class="map">
      <header class="bar">
        <button class="icon" data-back aria-label="Back to map">⬅</button>
        <div class="who-name"><strong>${esc(p.name)}'s sticker book</strong><small>Win a level to win its dog. 3 stars makes it gold!</small></div>
      </header>
      <section class="book-grid">
        ${LEVELS.map((l) => {
          const dog = stickerFor(l.id);
          const stars = p.stars[l.id] ?? 0;
          return `<div class="sticker${stars ? '' : ' missing'}${stars === 3 ? ' gold' : ''}">
            <img src="${dogUrl(dog)}" alt="" />
            <strong>${stars ? dogName(dog) : '?'}</strong>
            <small>Level ${l.id}</small>
          </div>`;
        }).join('')}
      </section>
    </main>`);
  root.querySelector('[data-back]')!.addEventListener('click', () => mapScreen(id));
}

// ---------- level intro and play ----------

function goalText(level: Level): string {
  const g = level.goal;
  if (g.kind === 'collect') return `Collect ${g.count} dogs worth ${prettyKey(g.key)}`;
  return `Clean ${prettyKey(`${g.n}/${g.d}`)} of the mud`;
}

function goalExamples(level: Level): string {
  const g = level.goal;
  if (g.kind !== 'collect') {
    const total = (level.mud?.join('').match(/#/g) ?? []).length;
    return `There are ${total} mud squares. ${prettyKey(`${g.n}/${g.d}`)} of ${total} is ${mudTarget(level)}. Clear dogs standing in the mud to clean it.`;
  }
  const shown = [...new Set(displaysFor(g.key, level.forms, level.dens).map(displayText))];
  return `${prettyKey(g.key)} can look like ${shown.join(', ')}.`;
}

/** "New!" cards: shown the first time a child meets decimals or percents. */
const NEW_FORMS: Record<string, string> = {
  decimal: '<b>Decimals!</b> 0.5 is the same as 1/2 and 5/10. 0.7 is 7/10. 0.25 is 25/100, which is 1/4.',
  percent: '<b>Percents!</b> Percent means "out of 100". 50% is 50/100, which is 1/2. 25% is 1/4.',
};

function modal(markup: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `<div class="sheet">${markup}</div>`;
  app.appendChild(wrap);
  return wrap;
}

function levelIntro(id: string, level: Level): void {
  const p = profiles.get(id)!;
  const fresh = level.forms.filter((f) => NEW_FORMS[f] && !p.seen.includes(f));
  const m = modal(html`
    <h2>Level ${level.id}</h2>
    ${fresh.map((f) => `<p class="new-card"><span class="new-tag">New!</span> ${NEW_FORMS[f]}</p>`).join('')}
    <p class="goal">${goalText(level)}</p>
    <p class="hint-text">${goalExamples(level)}</p>
    <p>Tap two dogs worth the same. You have <b>${level.moves}</b> goes.</p>
    <div class="row">
      <button class="ghost" data-close>Back</button>
      <button class="big" data-play>Play!</button>
    </div>`);
  m.querySelector('[data-close]')!.addEventListener('click', () => m.remove());
  m.querySelector('[data-play]')!.addEventListener('click', () => {
    if (fresh.length) profiles.markSeen(id, fresh);
    void playScreen(id, level);
  });
}

const CHEERS = ['Good!', 'Pawsome!', 'Woof-tastic!', 'Fur-midable!', 'Paw-fect!'];
const EARNED: Record<string, string> = { row: 'Zoomies!', col: 'Zoomies!', bag: 'Treat bag!', ball: 'Tennis ball!' };

async function playScreen(id: string, level: Level): Promise<void> {
  const p = profiles.get(id)!;
  const root = screen(html`
    <main class="play">
      <header class="bar hud">
        <button class="icon back" data-map aria-label="Back to map">⬅</button>
        <div class="goal-box">
          <small>Level ${level.id}</small>
          <strong>${goalText(level)}</strong>
          <div class="meter"><span data-meter></span></div>
          <small data-progress></small>
        </div>
        <div class="moves"><strong data-moves>${level.moves}</strong><small>goes</small><small>Score <b data-score>0</b></small></div>
        ${muteButton()}
        <div class="combo" data-combo hidden><b data-combo-n></b><span class="combo-bar"><span></span></span></div>
        <button class="treat" data-treat ${p.treats ? '' : 'hidden'}>🦴 Use a treat <b data-treats>${p.treats}</b></button>
      </header>
      <div class="board-wrap"><div class="board" data-board></div><div class="pops" data-pops></div><div class="spot" data-spot hidden></div></div>
      <div class="biscuit" data-biscuit hidden><img src="${dogUrl(0)}" alt="Biscuit" /><div class="bubble" data-say></div></div>
      <div class="miss" data-miss hidden></div>
    </main>`);
  wireMute(root);
  root.querySelector('[data-map]')!.addEventListener('click', () => mapScreen(id));

  const game = new Game(level, { misses: p.misses, dogs: boardDogs(p) });
  const host = root.querySelector<HTMLElement>('[data-board]')!;
  const view = new BoardView();
  board = view;
  await loadArt(BASE);
  await document.fonts.load('600 20px Fredoka');
  await view.init(host, boardSize(root));
  const tutorial = level.tutorial && !p.seen.includes('tutorial');
  if (tutorial) setUpTutorial(game);
  view.show(game);
  // Some tablet browsers fire their rotate event before the screen size changes, so watch the
  // page's real size instead, and size the board once it settles.
  let resizeTimer = 0;
  const watcher = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (board === view) {
        view.size = boardSize(root);
        onResized();
      } else watcher.disconnect();
    }, 150);
  });
  watcher.observe(document.documentElement);
  let onResized = () => {};

  // Board pixels → page pixels, for pop-ups, the tutorial spotlight and tests.
  const toScreen = (cells: Pos[]) => {
    const rect = view.app.canvas.getBoundingClientRect();
    const scale = rect.width / view.px;
    return cells.map((pos) => {
      const c = view.centre(pos);
      return { x: rect.left + c.x * scale, y: rect.top + c.y * scale };
    });
  };

  const update = () => {
    const pr = game.progress;
    root.querySelector('[data-moves]')!.textContent = String(game.movesLeft);
    root.querySelector('[data-score]')!.textContent = String(game.score);
    root.querySelector<HTMLElement>('[data-meter]')!.style.width = `${(pr.done / pr.needed) * 100}%`;
    root.querySelector('[data-progress]')!.textContent =
      level.goal.kind === 'collect' ? `${pr.done} of ${pr.needed}` : `${pr.done} of ${pr.needed} mud squares`;
  };
  update();

  const pop = (text: string, at: Pos, big = false) => {
    const wrap = root.querySelector<HTMLElement>('.board-wrap')!.getBoundingClientRect();
    const [pt] = toScreen([at]);
    const el = document.createElement('div');
    el.className = `pop-word${big ? ' loud' : ''}`;
    el.textContent = text;
    el.style.left = `${pt.x - wrap.left}px`;
    el.style.top = `${pt.y - wrap.top}px`;
    root.querySelector('[data-pops]')!.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  };

  const showCombo = (n: number) => {
    const box = root.querySelector<HTMLElement>('[data-combo]')!;
    if (n < 2) {
      box.setAttribute('hidden', '');
      return;
    }
    box.removeAttribute('hidden');
    root.querySelector('[data-combo-n]')!.textContent = `Combo ×${n}`;
    // Restart the draining bar: the combo lasts COMBO_MS from this pair.
    const bar = box.querySelector<HTMLElement>('.combo-bar span')!;
    bar.style.animation = 'none';
    void bar.offsetWidth;
    bar.style.animation = `drain ${COMBO_MS}ms linear forwards`;
    clearTimeout(Number(box.dataset.timer));
    box.dataset.timer = String(setTimeout(() => box.setAttribute('hidden', ''), COMBO_MS));
  };

  const shake = () => {
    const w = root.querySelector<HTMLElement>('.board-wrap')!;
    w.classList.remove('shake');
    void w.offsetWidth;
    w.classList.add('shake');
  };

  view.onClear = (phase) => {
    if (phase.clear.fired.length) {
      sound.bark(2);
      shake();
    } else sound.squeak(game.combo || 1);
    update();
  };

  const tut = tutorial ? runTutorial(root, view, toScreen, id) : null;
  if (tut) onResized = tut.reposition;

  view.onPick = (result) => {
    update();
    tut?.picked(result);
    if (result.ok) {
      const [a, z] = (result.phases[0] as Extract<Phase, { kind: 'clear' }>).pair!;
      const mid = { r: (a.r + z.r) / 2, c: (a.c + z.c) / 2 };
      pop(CHEERS[Math.min(result.combo, CHEERS.length) - 1], mid);
      if (result.earned) setTimeout(() => pop(EARNED[result.earned!], z, true), 350);
      showCombo(result.combo);
      const keys = [...new Set((result.phases[0] as Extract<Phase, { kind: 'clear' }>).clear.removed.map((t) => t.key).filter((k): k is string => k !== null))];
      profiles.recordMatch(id, keys);
    } else if (result.miss) {
      sound.boop();
      showCombo(0);
      showMiss(root, id, result);
    }
    if (game.status === 'won') void finish(true);
    else if (game.status === 'lost') setTimeout(() => resultModal(id, game, { sticker: false, treat: false }), 400);
  };

  const finish = async (won: boolean) => {
    if (!won) return;
    const news = profiles.recordWin(id, level.id, game.stars);
    if (game.movesLeft > 0) {
      const banner = root.querySelector<HTMLElement>('[data-pops]')!;
      const el = document.createElement('div');
      el.className = 'banner';
      el.textContent = `Zoomies time! ${game.movesLeft} goes left = bonus!`;
      banner.appendChild(el);
      await new Promise((r) => setTimeout(r, 900));
      await view.hold(() => view.play(game.finale()));
      el.remove();
      update();
    }
    confetti(root);
    setTimeout(() => resultModal(id, game, news), 500);
  };

  const treatBtn = root.querySelector<HTMLButtonElement>('[data-treat]')!;
  treatBtn.addEventListener('click', () => {
    if (!view.idle || game.status !== 'playing' || !profiles.useTreat(id)) return;
    const spot = { r: Math.floor(Math.random() * 8), c: Math.floor(Math.random() * 8) };
    game.giveBall(spot);
    view.redraw();
    sound.bark();
    pop('Tennis ball! Pair it with any dog', spot, true);
    const left = profiles.get(id)!.treats;
    root.querySelector('[data-treats]')!.textContent = String(left);
    if (!left) treatBtn.setAttribute('hidden', '');
  });

  // Test hook: lets the end-to-end tests find pairs in screen pixels.
  (window as unknown as { fetchGame: unknown }).fetchGame = {
    game,
    idle: () => view.idle,
    hint: () => {
      const h = game.hint();
      return h && toScreen(h);
    },
    /** A pair that helps the goal when there is one, as a child aiming for it would pick. */
    goalPair: () => {
      const g = level.goal;
      const cells = game.board.tiles.flatMap((row, r) => row.map((t, c) => ({ r, c, t: t! })));
      const helps = (x: (typeof cells)[number]) => (g.kind === 'collect' ? x.t.key === g.key : game.board.mud[x.r][x.c]);
      for (const x of cells.filter(helps))
        for (const y of cells) if ((x.r !== y.r || x.c !== y.c) && x.t.key && x.t.key === y.t.key) return toScreen([x, y]);
      const h = game.hint();
      return h && toScreen(h);
    },
    wrongPair: () => {
      const cells = game.board.tiles.flatMap((row, r) => row.map((t, c) => ({ r, c, t: t! })));
      for (const x of cells) for (const y of cells) if (x.t.key && y.t.key && x.t.key !== y.t.key) return toScreen([x, y]);
      return null;
    },
    cell: (r: number, c: number) => toScreen([{ r, c }])[0],
  };
}

/**
 * Biggest board that fits the space the HUD leaves: below it when the tablet is upright,
 * beside it when it is on its side.
 */
function boardSize(root: HTMLElement): number {
  const hud = root.querySelector('.hud')!.getBoundingClientRect();
  const frame = 12 + 12 + 12; // page padding, board padding, gap
  const sideways = window.innerWidth > window.innerHeight;
  const w = window.innerWidth - frame - (sideways ? hud.width + 12 : 0);
  const h = window.innerHeight - frame - (sideways ? 0 : hud.bottom);
  return Math.max(240, Math.floor(Math.min(w, h, 880) / 8) * 8);
}

// ---------- tutorial: Biscuit walks the child through their first pair ----------

const TUT_A = { r: 3, c: 1 };
const TUT_B = { r: 4, c: 6 };

/** Puts ½ and 2/4 where Biscuit will point. */
function setUpTutorial(game: Game): void {
  game.place(TUT_A, { form: 'tag', n: 1, d: 2 }, '1/2');
  game.place(TUT_B, { form: 'tag', n: 2, d: 4 }, '1/2');
}

function runTutorial(
  root: HTMLElement,
  view: BoardView,
  toScreen: (cells: Pos[]) => { x: number; y: number }[],
  id: string,
): { picked: (r: PickResult) => void; reposition: () => void } {
  const biscuit = root.querySelector<HTMLElement>('[data-biscuit]')!;
  const say = root.querySelector<HTMLElement>('[data-say]')!;
  const spot = root.querySelector<HTMLElement>('[data-spot]')!;
  let step = 0;
  let target: Pos | null = null;

  const point = (p: Pos | null) => {
    target = p;
    view.lockTo = p ?? { r: -1, c: -1 };
    if (!p) {
      spot.setAttribute('hidden', '');
      return;
    }
    const wrap = root.querySelector<HTMLElement>('.board-wrap')!.getBoundingClientRect();
    const [pt] = toScreen([p]);
    const size = view.app.canvas.getBoundingClientRect().width / 8;
    spot.style.left = `${pt.x - wrap.left - size * 0.6}px`;
    spot.style.top = `${pt.y - wrap.top - size * 0.6}px`;
    spot.style.width = spot.style.height = `${size * 1.2}px`;
    spot.removeAttribute('hidden');
  };

  const show = (html: string) => {
    biscuit.removeAttribute('hidden');
    say.innerHTML = html;
  };

  const steps = [
    () => {
      show("Hi, I'm <b>Biscuit</b>! Let's play. Tap the dog holding <b>1/2</b>.");
      point(TUT_A);
    },
    () => {
      show('<b>2/4</b> is worth the same as <b>1/2</b>. Tap it to make a pair!');
      point(TUT_B);
    },
    () => {
      point(null);
      show(html`Woof! Look, they're the same size:
        <div class="bars"><div><span>1/2</span>${barSvg({ form: 'tag', n: 1, d: 2 })}</div><div><span>2/4</span>${barSvg({ form: 'tag', n: 2, d: 4 })}</div></div>
        <button class="big small" data-next>Got it!</button>`);
      say.querySelector('[data-next]')!.addEventListener('click', next);
    },
    () => {
      view.lockTo = null;
      show('Your turn! Tap <b>any two dogs worth the same</b>. They can be anywhere. Quick pairs make a <b>combo</b>!');
    },
    () => {
      biscuit.setAttribute('hidden', '');
      profiles.markSeen(id, ['tutorial']);
    },
  ];
  const next = () => steps[++step]?.();
  steps[0]();
  view.onSelect = (p) => {
    if (step === 0 && p) next();
  };

  return {
    picked: (r) => {
      if ((step === 1 || step === 3) && r.ok) next();
    },
    reposition: () => point(target),
  };
}

function showMiss(root: HTMLElement, id: string, result: PickResult): void {
  const { a: ta, z: tz } = result.miss!;
  if (!ta.key || !tz.key) return;
  profiles.recordMiss(id, ta.key, tz.key);
  const a = ta.display as Display;
  const b = tz.display as Display;
  const va = valueOf(ta.key);
  const vb = valueOf(tz.key);
  const box = root.querySelector<HTMLElement>('[data-miss]')!;
  box.innerHTML = html`
    <p><b>${displayText(a)}</b> and <b>${displayText(b)}</b> are not the same.</p>
    <div class="bars">
      <div><span>${displayText(a)}</span>${barSvg(a)}</div>
      <div><span>${displayText(b)}</span>${barSvg(b)}</div>
    </div>
    <p><b>${displayText(va > vb ? a : b)}</b> is more. Try again!</p>`;
  box.removeAttribute('hidden');
  box.classList.remove('pop');
  void box.offsetWidth;
  box.classList.add('pop');
  clearTimeout(Number(box.dataset.timer));
  const hide = () => box.setAttribute('hidden', '');
  box.dataset.timer = String(setTimeout(hide, 4500));
  box.onclick = hide;
}

/** Paper confetti in the tile colours, falling over the page. */
function confetti(root: HTMLElement): void {
  const colours = ['#ff6b8b', '#ffa53d', '#ffd83d', '#5fd38d', '#4cc3ff', '#a98bff'];
  const layer = document.createElement('div');
  layer.className = 'confetti';
  for (let i = 0; i < 70; i++) {
    const bit = document.createElement('i');
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.background = colours[i % colours.length];
    bit.style.animationDelay = `${Math.random() * 0.6}s`;
    bit.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
    layer.appendChild(bit);
  }
  root.appendChild(layer);
  setTimeout(() => layer.remove(), 3500);
}

function resultModal(id: string, game: Game, news: { sticker: boolean; treat: boolean }): void {
  const won = game.status === 'won';
  sound.tune(won);
  const next = nextLevel(game.level.id);
  const p = profiles.get(id)!;
  const dog = stickerFor(game.level.id);
  const m = modal(
    won
      ? html`
        <h2>Good dog! 🐾</h2>
        <p class="stars-big">${'★'.repeat(game.stars)}${'☆'.repeat(3 - game.stars)}</p>
        <p>Score <b>${game.score}</b></p>
        ${news.sticker ? `<div class="won-dog"><img src="${dogUrl(dog)}" alt="" /><p>New sticker! You won the <b>${dogName(dog)}</b>. Look out for them on your board!</p></div>` : ''}
        ${news.treat ? `<p class="treat-news">🦴 Daily treat! <b>${currentStreak(p)}-day streak</b>. Use treats in a level for a tennis ball.</p>` : ''}
        <div class="row">
          <button class="ghost" data-map>Map</button>
          ${next ? '<button class="big" data-next>Next level</button>' : '<button class="big" data-map>Finish</button>'}
        </div>`
      : html`
        <h2>So close!</h2>
        <p>You got ${game.progress.done} of ${game.progress.needed}. Try again?</p>
        <div class="row">
          <button class="ghost" data-map>Map</button>
          <button class="big" data-retry>Try again</button>
        </div>`,
  );
  m.querySelectorAll('[data-map]').forEach((b) => b.addEventListener('click', () => mapScreen(id)));
  m.querySelector('[data-next]')?.addEventListener('click', () => levelIntro(id, next!));
  m.querySelector('[data-retry]')?.addEventListener('click', () => void playScreen(id, game.level));
}

// ---------- fractions check ----------

function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function checkScreen(id: string, which: 'before' | 'after'): void {
  const questions: Question[] = which === 'before' ? BEFORE : AFTER;
  const answers: string[] = [];
  const ask = (i: number) => {
    if (i === questions.length) return finish();
    const q = questions[i];
    const root = screen(html`
      <main class="check">
        <header class="bar">
          <button class="icon" data-quit aria-label="Stop the check">⬅</button>
          <div class="dots">${questions.map((_, k) => `<span class="${k < i ? 'done' : k === i ? 'now' : ''}"></span>`).join('')}</div>
        </header>
        <p class="q-num">Question ${i + 1} of ${questions.length}</p>
        <h2 class="q">${q.prompt}</h2>
        <div class="answers">
          ${shuffled(q.options.filter((o) => o !== 'They are equal'))
            .concat(q.options.includes('They are equal') ? ['They are equal'] : [])
            .map((o) => `<button class="answer" data-answer="${o}">${o}</button>`)
            .join('')}
        </div>
      </main>`);
    root.querySelector('[data-quit]')!.addEventListener('click', () => mapScreen(id));
    root.querySelectorAll<HTMLButtonElement>('[data-answer]').forEach((b) =>
      b.addEventListener('click', () => {
        answers[i] = b.dataset.answer!;
        sound.squeak();
        ask(i + 1);
      }),
    );
  };
  const finish = () => {
    const s = score(questions, answers);
    const p = profiles.update(id, (x) => (x.checks[which] = s));
    const root = screen(html`
      <main class="check done">
        <h2>${which === 'before' ? 'Thanks!' : 'All done!'}</h2>
        <p class="big-score">${s} / 10</p>
        <p>${
          which === 'before'
            ? 'Now let\'s play and get even better at fractions.'
            : `Before you started you got ${p.checks.before}/10. Now you got ${s}/10!`
        }</p>
        <button class="big" data-map>${which === 'before' ? 'To the levels!' : 'Back to the map'}</button>
      </main>`);
    sound.tune(true);
    root.querySelector('[data-map]')!.addEventListener('click', () => mapScreen(id));
  };
  ask(0);
}

whoScreen();
