import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

type Point = { x: number; y: number };

/** Touch devices tap with a finger, the laptop clicks: both paths get tested. */
let touch = false;
test.beforeEach(({ hasTouch }) => {
  touch = hasTouch;
});

async function tap(page: Page, p: Point) {
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

async function tapPair(page: Page, [a, z]: Point[]) {
  await tap(page, a);
  await tap(page, z);
}

async function waitIdle(page: Page) {
  await page.waitForTimeout(100);
  await page.waitForFunction(() => (window as any).fetchGame.idle(), null, { timeout: 60_000 });
}

const fetchGame = (page: Page, call: string) => page.evaluate((c) => (window as any).fetchGame[c](), call);

/** A saved player, for tests that start part-way through. */
async function seed(page: Page, profile: Record<string, unknown>) {
  await page.goto('./');
  await page.evaluate((p) => {
    localStorage.setItem(
      'fraction-fetch.profiles.v1',
      JSON.stringify([{ id: 'x', name: 'Tess', dog: 0, stars: {}, misses: {}, checks: { before: 5 }, streak: { count: 0 }, treats: 0, seen: ['tutorial'], ...p }]),
    );
  }, profile);
  await page.reload();
  await page.click('.player');
}

async function newPlayer(page: Page, name: string) {
  await page.goto('./');
  await expect(page.getByText("Who's playing?")).toBeVisible();
  await page.click('[data-add]');
  await page.fill('input[name=name]', name);
  await page.click('[data-dog="2"]');
  await page.getByRole('button', { name: "Let's go!" }).click();
}

async function takeCheck(page: Page, rightAnswers: number) {
  await page.getByRole('button', { name: 'Start the check' }).click();
  const right = ['2/4', '6/8', '6', '7/10', '3/10', '7/10', '1/4', '50%', '60%', '0.45'];
  for (let i = 0; i < 10; i++) {
    await expect(page.getByText(`Question ${i + 1} of 10`)).toBeVisible();
    const buttons = page.locator('.answer');
    if (i < rightAnswers) await page.locator(`.answer[data-answer="${right[i]}"]`).click();
    else await buttons.filter({ hasNotText: new RegExp(`^${right[i]}$`) }).first().click();
  }
  await expect(page.locator('.big-score')).toHaveText(`${rightAnswers} / 10`);
  await page.getByRole('button', { name: 'To the levels!' }).click();
}

test('a new player does the check, the tutorial, and wins level 1', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await newPlayer(page, 'Maisie');
  await expect(page.locator('[data-level="1-1"]')).toBeDisabled();
  await takeCheck(page, 7);
  await expect(page.getByText('before 7/10')).toBeVisible();

  await page.click('[data-level="1-1"]');
  await expect(page.getByText('Tap two dogs worth the same')).toBeVisible();
  await page.getByRole('button', { name: 'Play!' }).click();
  await page.waitForFunction(() => (window as any).fetchGame);

  // The whole board fits, big enough to read, with no sideways scroll.
  const box = (await page.locator('canvas').boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  expect(box.width).toBeGreaterThanOrEqual(Math.min(viewport.width, viewport.height) * 0.75);

  // Tutorial: Biscuit points at 1/2; other tiles don't respond.
  const say = page.locator('[data-say]');
  await expect(say).toContainText('Tap the dog holding 1/2');
  await page.screenshot({ path: `test-results/tutorial-${test.info().project.name}.png` });
  const cell = (r: number, c: number) => page.evaluate(([r, c]) => (window as any).fetchGame.cell(r, c), [r, c]);
  const other = await cell(0, 0);
  await tap(page, other);
  await expect(say).toContainText('Tap the dog holding 1/2');
  const a = await cell(3, 1);
  await tap(page, a);
  await expect(say).toContainText('2/4 is worth the same as 1/2');
  const z = await cell(4, 6);
  await tap(page, z);
  await expect(say).toContainText("they're the same size");
  await expect(say.locator('svg')).toHaveCount(2);
  await expect(page.locator('[data-progress]')).toHaveText('2 of 10');
  await say.getByRole('button', { name: 'Got it!' }).click();
  await expect(say).toContainText('Your turn');

  // A wrong pair costs a go and shows the two values as bars.
  const goes = await page.evaluate(() => (window as any).fetchGame.game.movesLeft);
  await tapPair(page, await fetchGame(page, 'wrongPair'));
  await expect(page.locator('[data-miss]')).toContainText('are not the same');
  await expect(page.locator('[data-miss] svg')).toHaveCount(2);
  await page.screenshot({ path: `test-results/miss-${test.info().project.name}.png` });
  expect(await page.evaluate(() => (window as any).fetchGame.game.movesLeft)).toBe(goes - 1);
  await page.locator('[data-miss]').click();
  await waitIdle(page);

  // Quick right pairs build a combo, then the level is won.
  for (let i = 0; i < 25 && !(await page.locator('.modal').isVisible()); i++) {
    if (await page.locator('.banner').isVisible()) break;
    await tapPair(page, await fetchGame(page, 'goalPair'));
    await waitIdle(page);
    if (i === 1) {
      await expect(page.locator('[data-combo]')).toContainText('Combo');
      await expect(page.locator('[data-biscuit]')).toBeHidden();
    }
  }
  const modal = page.locator('.modal');
  await expect(modal).toBeVisible({ timeout: 60_000 });
  // The zoomies finale spent every go left for bonus points.
  expect(await page.evaluate(() => (window as any).fetchGame.game.movesLeft)).toBe(0);
  await expect(modal.getByText('Good dog!')).toBeVisible();
  await expect(modal.locator('.won-dog')).toContainText('New sticker');
  await expect(modal.locator('.treat-news')).toContainText('1-day streak');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test-results/result-${test.info().project.name}.png` });
  await modal.getByRole('button', { name: 'Map' }).click();
  await expect(page.locator('[data-level="1-2"]')).toBeEnabled();
  await expect(page.locator('.perks')).toContainText('1day streak');
  await expect(page.locator('.perks')).toContainText('1treats');
  await expect(page.locator('.perks')).toContainText('1/20sticker book');
  await page.click('[data-book]');
  await expect(page.locator('.sticker:not(.missing)')).toHaveCount(1);
  await expect(page.locator('.sticker:not(.missing)')).toContainText('Collie');
  await page.screenshot({ path: `test-results/book-${test.info().project.name}.png` });

  // Second time round, no tutorial.
  await page.getByRole('button', { name: 'Back to map' }).click();
  await page.click('[data-level="1-1"]');
  await page.getByRole('button', { name: 'Play!' }).click();
  await page.waitForFunction(() => (window as any).fetchGame);
  await expect(page.locator('[data-biscuit]')).toBeHidden();
  expect(errors).toEqual([]);
});

test('running out of goes offers another try', async ({ page }) => {
  await seed(page, {});
  await page.click('[data-level="1-1"]');
  await page.getByRole('button', { name: 'Play!' }).click();
  await page.waitForFunction(() => (window as any).fetchGame);
  for (let i = 0; i < 20; i++) {
    await tapPair(page, await fetchGame(page, 'wrongPair'));
    await waitIdle(page);
    await page.locator('[data-miss]').click({ timeout: 2000 }).catch(() => {});
  }
  const modal = page.locator('.modal');
  await expect(modal.getByText('So close!')).toBeVisible();
  await modal.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('[data-moves]')).toHaveText('20');
});

test('a treat buys a tennis ball that clears a whole value', async ({ page }) => {
  await seed(page, { treats: 1 });
  await page.click('[data-level="1-1"]');
  await page.getByRole('button', { name: 'Play!' }).click();
  await page.waitForFunction(() => (window as any).fetchGame);
  await page.getByRole('button', { name: /Use a treat/ }).click();
  await expect(page.locator('[data-treat]')).toBeHidden();
  const ball = await page.evaluate(() => {
    const g = (window as any).fetchGame.game;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (g.board.tiles[r][c].special === 'ball') return { r, c };
    return null;
  });
  expect(ball).not.toBeNull();
  const before = await page.evaluate(() => (window as any).fetchGame.game.score);
  const a = await page.evaluate(([r, c]) => (window as any).fetchGame.cell(r, c), [ball!.r, ball!.c]);
  const z = await page.evaluate(([r, c]) => (window as any).fetchGame.cell(r, c), [ball!.r === 0 ? 1 : 0, 0]);
  await tapPair(page, [a, z]);
  await waitIdle(page);
  // Every tile of one value went: far more than a pair's 40 points.
  expect(await page.evaluate(() => (window as any).fetchGame.game.score)).toBeGreaterThan(before + 100);
});

test('decimals get a "New!" card the first time only', async ({ page }) => {
  const stars: Record<string, number> = {};
  for (let i = 1; i <= 10; i++) stars[`1-${i}`] = 1;
  await seed(page, { stars });
  await page.click('[data-level="2-1"]');
  await expect(page.locator('.new-card')).toContainText('Decimals!');
  await page.getByRole('button', { name: 'Play!' }).click();
  await page.waitForFunction(() => (window as any).fetchGame);
  await page.getByRole('button', { name: 'Back to map' }).click();
  await page.click('[data-level="2-1"]');
  await expect(page.locator('.modal')).toContainText('Level 2-1');
  await expect(page.locator('.new-card')).toHaveCount(0);
});

test('progress is kept per player across a reload', async ({ page }) => {
  await newPlayer(page, 'Alfie');
  await takeCheck(page, 4);
  await page.getByRole('button', { name: 'Change player' }).click();
  await page.click('[data-add]');
  await page.fill('input[name=name]', 'Bea');
  await page.getByRole('button', { name: "Let's go!" }).click();
  await expect(page.getByRole('button', { name: 'Start the check' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.player')).toHaveCount(3);
  await expect(page.locator('.player', { hasText: 'Alfie' })).toContainText('before 4/10');
  await expect(page.locator('.player', { hasText: 'Bea' })).toContainText('before —');
});

test('sound can be muted and stays muted', async ({ page }) => {
  await newPlayer(page, 'Cal');
  const mute = page.locator('[data-mute]');
  await expect(mute).toHaveAttribute('aria-label', 'Sound on');
  await mute.click();
  await expect(mute).toHaveAttribute('aria-label', 'Sound off');
  await page.reload();
  await page.locator('.player', { hasText: 'Cal' }).click();
  await expect(page.locator('[data-mute]')).toHaveAttribute('aria-label', 'Sound off');
});

test('installs as an app and works offline', async ({ page, context }) => {
  await page.goto('./');
  const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  expect(manifest.name).toBe('Fraction Fetch');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Who's playing?")).toBeVisible();
  await page.click('[data-add]');
  await page.fill('input[name=name]', 'Offline');
  await page.getByRole('button', { name: "Let's go!" }).click();
  await expect(page.locator('.avatar')).toBeVisible();
  expect(await page.locator('.avatar').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

test('turning the tablet keeps the board full size and drawn', async ({ page }) => {
  await seed(page, {});
  await page.click('[data-level="1-1"]');
  await page.getByRole('button', { name: 'Play!' }).click();
  await page.waitForFunction(() => (window as any).fetchGame);
  const start = page.viewportSize()!;
  // Turn it, and drop the GPU memory as some tablets do when turned.
  await page.evaluate(() => {
    const gl = document.querySelector('canvas')!.getContext('webgl2') ?? document.querySelector('canvas')!.getContext('webgl');
    (window as any).lose = gl!.getExtension('WEBGL_lose_context');
    (window as any).lose.loseContext();
  });
  await page.setViewportSize({ width: start.height, height: start.width });
  await page.evaluate(() => (window as any).lose.restoreContext());
  await page.waitForTimeout(1200);
  const box = (await page.locator('canvas').boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(Math.min(start.width, start.height) * 0.85);
  // The board is drawn, not blank: bright tile colours and white number tags cover most of it.
  // The pale park behind scores about 0.1.
  const { data, info } = await sharp(await page.locator('canvas').screenshot()).raw().toBuffer({ resolveWithObject: true });
  let vivid = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 90 || Math.min(r, g, b) > 245) vivid++;
  }
  const coloured = vivid / (info.width * info.height);
  expect(coloured).toBeGreaterThan(0.4);
});
