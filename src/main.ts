// Screens: who's playing → level map → play a level, plus the fractions check.

import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import './ui/style.css';
import { registerSW } from 'virtual:pwa-register';
import { nearMiss, swapWorks, type Pos } from './core/board';
import { AFTER, BEFORE, score, type Question } from './core/check';
import { displaysFor, displayText, prettyKey, valueOf, type Display } from './core/fractions';
import { Game, type SwapResult } from './core/game';
import { LEVELS, levelById, mudTarget, nextLevel, WORLDS, type Level } from './core/levels';
import { afterCheckOpen, browserStore, Profiles, totalStars, unlocked, type Profile } from './core/profiles';
import { barSvg } from './ui/bars';
import { BoardView, loadArt } from './ui/board-view';
import * as sound from './ui/sound';
import { BREED_NAMES } from './ui/tile-art';

registerSW({ immediate: true });

const BASE = import.meta.env.BASE_URL;
const store = browserStore();
const profiles = new Profiles(store);
const app = document.getElementById('app')!;
const dogUrl = (i: number) => `${BASE}art/${BREED_NAMES[i % BREED_NAMES.length]}.webp`;

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
  let dog = Math.floor(Math.random() * BREED_NAMES.length);
  const root = screen(html`
    <main class="who">
      <h2>New player</h2>
      <form class="new-player">
        <label>Your name <input name="name" maxlength="20" autocomplete="off" required /></label>
        <p>Pick your dog</p>
        <div class="dogs">
          ${BREED_NAMES.map((n, i) => `<button type="button" class="dog${i === dog ? ' on' : ''}" data-dog="${i}" aria-label="${n}"><img src="${dogUrl(i)}" alt="" /></button>`).join('')}
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
  const root = screen(html`
    <main class="map">
      <header class="bar">
        <button class="icon" data-who aria-label="Change player">⬅</button>
        <img class="avatar" src="${dogUrl(p.dog)}" alt="" />
        <div class="who-name"><strong>${esc(p.name)}</strong><small>⭐ ${totalStars(p)} · ${checkLine(p)}</small></div>
        ${muteButton()}
      </header>
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
  root.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((b) =>
    b.addEventListener('click', () => levelIntro(id, levelById(b.dataset.level!))),
  );
  root.querySelectorAll<HTMLButtonElement>('[data-check]').forEach((b) =>
    b.addEventListener('click', () => checkScreen(id, b.dataset.check as 'before' | 'after')),
  );
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
    return `There are ${total} mud squares. ${prettyKey(`${g.n}/${g.d}`)} of ${total} is ${mudTarget(level)}. Match dogs on top of the mud to clean it.`;
  }
  const shown = [...new Set(displaysFor(g.key, level.forms, level.dens).map(displayText))];
  return `${prettyKey(g.key)} can look like ${shown.join(', ')}, or a picture with ${prettyKey(g.key)} filled in.`;
}

function modal(markup: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `<div class="sheet">${markup}</div>`;
  app.appendChild(wrap);
  return wrap;
}

function levelIntro(id: string, level: Level): void {
  const m = modal(html`
    <h2>Level ${level.id}</h2>
    <p class="goal">${goalText(level)}</p>
    <p class="hint-text">${goalExamples(level)}</p>
    <p>You have <b>${level.moves}</b> moves.</p>
    <div class="row">
      <button class="ghost" data-close>Back</button>
      <button class="big" data-play>Play!</button>
    </div>`);
  m.querySelector('[data-close]')!.addEventListener('click', () => m.remove());
  m.querySelector('[data-play]')!.addEventListener('click', () => void playScreen(id, level));
}

async function playScreen(id: string, level: Level): Promise<void> {
  const p = profiles.get(id)!;
  const root = screen(html`
    <main class="play">
      <header class="bar">
        <button class="icon" data-map aria-label="Back to map">⬅</button>
        <div class="goal-box">
          <small>Level ${level.id}</small>
          <strong>${goalText(level)}</strong>
          <div class="meter"><span data-meter></span></div>
          <small data-progress></small>
        </div>
        <div class="moves"><strong data-moves>${level.moves}</strong><small>moves</small></div>
        ${muteButton()}
      </header>
      <div class="score">Score <b data-score>0</b></div>
      <div class="board-wrap"><div class="board" data-board></div><div class="hand" hidden>👆</div></div>
      <p class="tip" data-tip hidden>Match 3 dogs worth the same! Swipe a dog to swap it with its neighbour.</p>
      <div class="miss" data-miss hidden></div>
    </main>`);
  wireMute(root);
  root.querySelector('[data-map]')!.addEventListener('click', () => mapScreen(id));

  const game = new Game(level, Math.random, p.misses);
  const host = root.querySelector<HTMLElement>('[data-board]')!;
  const view = new BoardView();
  board = view;
  await loadArt(BASE);
  await document.fonts.load('600 20px Fredoka');
  await view.init(host, boardSize());
  view.show(game);
  const onResize = () => {
    if (board === view) view.size = boardSize();
    else window.removeEventListener('resize', onResize);
  };
  window.addEventListener('resize', onResize);

  const update = () => {
    const pr = game.progress;
    root.querySelector('[data-moves]')!.textContent = String(game.movesLeft);
    root.querySelector('[data-score]')!.textContent = String(game.score);
    root.querySelector<HTMLElement>('[data-meter]')!.style.width = `${(pr.done / pr.needed) * 100}%`;
    root.querySelector('[data-progress]')!.textContent =
      level.goal.kind === 'collect' ? `${pr.done} of ${pr.needed}` : `${pr.done} of ${pr.needed} mud squares`;
  };
  update();

  if (level.tutorial) showTutorial(root, view, game);

  view.onClear = (phase) => {
    if (phase.clear.created.length || phase.clear.fired.length) sound.bark();
    else sound.squeak(phase.combo);
    if (phase.combo === 1) {
      const keys = [...new Set(phase.clear.removed.map((t) => t.key).filter((k): k is string => k !== null))];
      profiles.recordMatch(id, keys);
    }
    update();
  };
  view.onBadSwap = (result) => {
    sound.boop();
    if (result.miss) showMiss(root, id, result);
  };
  view.onMove = () => {
    update();
    root.querySelector('.hand')?.setAttribute('hidden', '');
    root.querySelector('[data-tip]')?.setAttribute('hidden', '');
    if (game.status !== 'playing') setTimeout(() => resultModal(id, game), 400);
  };

  // Test hook: lets the end-to-end tests find a good move, or a near-miss swap, in screen pixels.
  const toScreen = (cells: Pos[]) => {
    const rect = view.app.canvas.getBoundingClientRect();
    const scale = rect.width / view.px;
    return cells.map((pos) => {
      const c = view.centre(pos);
      return { x: rect.left + c.x * scale, y: rect.top + c.y * scale };
    });
  };
  (window as unknown as { fetchGame: unknown }).fetchGame = {
    game,
    idle: () => view.idle,
    hint: () => {
      const h = game.hint();
      return h && toScreen(h);
    },
    missMove: () => {
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
          for (const z of [{ r, c: c + 1 }, { r: r + 1, c }]) {
            const a = { r, c };
            if (z.r > 7 || z.c > 7 || swapWorks(game.board, a, z)) continue;
            if (nearMiss(game.board, a, z)) return toScreen([a, z]);
          }
      return null;
    },
  };
}

function boardSize(): number {
  const w = Math.min(window.innerWidth - 36, 760);
  const h = window.innerHeight - 230;
  return Math.max(280, Math.floor(Math.min(w, h) / 8) * 8);
}

function showTutorial(root: HTMLElement, view: BoardView, game: Game): void {
  root.querySelector('[data-tip]')!.removeAttribute('hidden');
  const hand = root.querySelector<HTMLElement>('.hand')!;
  const h = game.hint();
  if (!h) return;
  const [a, z] = h.map((pos) => view.centre(pos));
  hand.style.setProperty('--x0', `${a.x}px`);
  hand.style.setProperty('--y0', `${a.y}px`);
  hand.style.setProperty('--x1', `${z.x}px`);
  hand.style.setProperty('--y1', `${z.y}px`);
  hand.removeAttribute('hidden');
}

function showMiss(root: HTMLElement, id: string, result: SwapResult): void {
  const { moved, meant } = result.miss!;
  profiles.recordMiss(id, moved.key!, meant.key!);
  const a = moved.display as Display;
  const b = meant.display as Display;
  const va = valueOf(moved.key!);
  const vb = valueOf(meant.key!);
  const box = root.querySelector<HTMLElement>('[data-miss]')!;
  box.innerHTML = html`
    <p><b>${displayText(a)}</b> and <b>${displayText(b)}</b> are not the same.</p>
    <div class="bars">
      <div><span>${displayText(a)}</span>${barSvg(a)}</div>
      <div><span>${displayText(b)}</span>${barSvg(b)}</div>
    </div>
    <p><b>${displayText(va > vb ? a : b)}</b> is a bit more. Try again!</p>`;
  box.removeAttribute('hidden');
  box.classList.remove('pop');
  void box.offsetWidth;
  box.classList.add('pop');
  clearTimeout(Number(box.dataset.timer));
  const hide = () => box.setAttribute('hidden', '');
  box.dataset.timer = String(setTimeout(hide, 4500));
  box.onclick = hide;
}

function resultModal(id: string, game: Game): void {
  const won = game.status === 'won';
  sound.tune(won);
  if (won) profiles.recordStars(id, game.level.id, game.stars);
  const next = nextLevel(game.level.id);
  const m = modal(
    won
      ? html`
        <h2>Good dog! 🐾</h2>
        <p class="stars-big">${'★'.repeat(game.stars)}${'☆'.repeat(3 - game.stars)}</p>
        <p>Score <b>${game.score}</b> · ${game.movesLeft} moves left</p>
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
