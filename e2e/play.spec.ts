import { expect, test, type Page } from '@playwright/test';

type Point = { x: number; y: number };

async function swipe(page: Page, [a, z]: Point[]) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(z.x, z.y, { steps: 6 });
  await page.mouse.up();
}

async function tapSwap(page: Page, [a, z]: Point[]) {
  await page.touchscreen.tap(a.x, a.y);
  await page.touchscreen.tap(z.x, z.y);
}

async function waitIdle(page: Page) {
  await page.waitForTimeout(100);
  await page.waitForFunction(() => (window as any).fetchGame.idle(), null, { timeout: 30_000 });
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

test('a new player takes the check, plays level 1, and sees a result', async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await newPlayer(page, 'Maisie');
  // Levels stay locked until the check is done.
  await expect(page.locator('[data-level="1-1"]')).toBeDisabled();
  await takeCheck(page, 7);
  await expect(page.getByText('before 7/10')).toBeVisible();
  await expect(page.locator('[data-level="1-2"]')).toBeDisabled();

  await page.click('[data-level="1-1"]');
  await expect(page.getByText('Collect 10 dogs worth ½').first()).toBeVisible();
  await page.getByRole('button', { name: 'Play!' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('[data-tip]')).toBeVisible();
  await page.waitForFunction(() => (window as any).fetchGame);

  // The whole board fits on screen with no sideways scroll.
  const box = (await page.locator('canvas').boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  await page.screenshot({ path: `test-results/board-${test.info().project.name}.png` });

  // A near-miss swap costs nothing and shows the two values as bars.
  const miss = await page.evaluate(() => (window as any).fetchGame.missMove());
  if (miss) {
    const moves = await page.evaluate(() => (window as any).fetchGame.game.movesLeft);
    if (isMobile) await tapSwap(page, miss);
    else await swipe(page, miss);
    await expect(page.locator('[data-miss]')).toBeVisible();
    await expect(page.locator('[data-miss]')).toContainText('are not the same');
    await expect(page.locator('[data-miss] svg')).toHaveCount(2);
    await page.screenshot({ path: `test-results/miss-${test.info().project.name}.png` });
    expect(await page.evaluate(() => (window as any).fetchGame.game.movesLeft)).toBe(moves);
    await page.locator('[data-miss]').click();
    await waitIdle(page);
  }

  // Play good moves until the level ends.
  let scoreSeen = false;
  for (let i = 0; i < 30; i++) {
    if (await page.locator('.modal').isVisible()) break;
    const h = await page.evaluate(() => (window as any).fetchGame.hint());
    if (isMobile) await tapSwap(page, h);
    else await swipe(page, h);
    await waitIdle(page);
    if (!scoreSeen) {
      await expect(page.locator('[data-score]')).not.toHaveText('0');
      await expect(page.locator('[data-tip]')).toBeHidden();
      scoreSeen = true;
    }
  }
  const modal = page.locator('.modal');
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `test-results/result-${test.info().project.name}.png` });
  const won = await modal.getByText('Good dog!').isVisible();
  if (won) {
    await modal.getByRole('button', { name: 'Map' }).click();
    await expect(page.locator('[data-level="1-2"]')).toBeEnabled();
  } else {
    await expect(modal.getByText('So close!')).toBeVisible();
    await modal.getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('[data-moves]')).toHaveText('20');
  }
  expect(errors).toEqual([]);
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
