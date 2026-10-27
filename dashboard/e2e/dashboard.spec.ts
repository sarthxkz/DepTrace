import { expect, test, type Page } from '@playwright/test';

/** Collects console errors, including Content Security Policy violations. */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  return errors;
}

test('loads the live analysis without console or CSP errors', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/');
  await expect(page.locator('.project-name')).toHaveText('storefront');
  await expect(page.getByLabel('Analysis summary')).toContainText('23');
  await expect(page.getByRole('region', { name: 'Where to start' })).toContainText(
    '1 new violation not accepted by the baseline',
  );
  await page.goto('/#/graph');
  await expect(page.locator('.graph-canvas canvas').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('draws the real graph and selects nodes by search and by clicking the canvas', async ({
  page,
}) => {
  await page.goto('/#/graph');
  await expect(page.getByText('Showing 23 nodes and 35 dependencies')).toBeVisible();
  await expect(page.locator('.graph-canvas canvas').first()).toBeVisible();

  await page.getByRole('combobox', { name: 'Find a file in the graph' }).fill('pricing');
  await page.getByRole('option', { name: 'src/domain/pricing.ts' }).click();
  await expect(page).toHaveURL(/#\/graph\?focus=src%2Fdomain%2Fpricing\.ts$/);
  await expect(page.getByRole('article', { name: 'Module src/domain/pricing.ts' })).toBeVisible();

  // Center the node, clear the selection, then click the canvas centre: the
  // tap on the drawn node selects it again.
  await page.getByRole('button', { name: 'Center on this file' }).click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/graph$/);
  const box = await page.locator('.graph-canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page).toHaveURL(/#\/graph\?focus=src%2Fdomain%2Fpricing\.ts/);

  await page.getByRole('link', { name: 'Dependents' }).click();
  await expect(page).toHaveURL(/mode=dependents/);
  await page.getByRole('button', { name: 'Fit to screen' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(page).toHaveURL(/#\/graph$/);
});

test('follows a cycle and a violation into the graph', async ({ page }) => {
  await page.goto('/#/cycles');
  await page.getByRole('link', { name: /Cycle 1/ }).click();
  const card = page.getByRole('article', { name: 'Cycle 1' });
  await expect(card).toContainText('runtime');
  await card.getByRole('link', { name: 'Show in graph' }).click();
  await expect(page).toHaveURL(/#\/graph\?cycle=0/);
  await expect(page.getByRole('article', { name: 'Cycle 1' })).toBeVisible();

  await page.goto('/#/violations');
  await page.getByRole('combobox', { name: 'Baseline' }).selectOption('new');
  await page.getByRole('link', { name: /layer-boundaries/ }).click();
  const finding = page.getByRole('article', { name: 'Violation of layer-boundaries' });
  await expect(finding).toContainText('src/ui/product-list.ts:3:30');
  await finding.getByRole('link', { name: 'Show in graph' }).click();
  await expect(page).toHaveURL(/#\/graph\?finding=/);
  await expect(page.locator('.graph-canvas canvas').first()).toBeVisible();
});

test('shows the layer matrix from the configuration', async ({ page }) => {
  await page.goto('/#/layers');
  await page
    .getByRole('link', { name: /^domain imports infrastructure: 1 dependency, forbidden/ })
    .click();
  await expect(page.getByRole('article', { name: 'domain imports infrastructure' })).toContainText(
    'src/domain/pricing.ts',
  );
});

test('rejects an invalid imported file and re-analyzes on request', async ({ page }) => {
  await page.goto('/#/reports');
  await page.getByLabel('Report file').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion": 1, "nodes": "nope"}'),
  });
  await expect(page.getByRole('alert')).toContainText('broken.json was not loaded');
  await page.getByRole('button', { name: 'Re-analyze' }).click();
  await expect(page.getByText('Analysis updated.')).toBeVisible();
});

test('is keyboard operable from the first Tab', async ({ page }) => {
  await page.goto('/#/overview');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Overview' })).toBeFocused();
});

test('navigation works through the drawer @phone', async ({ page }) => {
  await page.goto('/#/overview');
  const menu = page.getByRole('button', { name: 'Sections' });
  const navLink = page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Violations' });
  await expect(navLink).toBeHidden();
  await menu.click();
  await navLink.click();
  await expect(page).toHaveURL(/#\/violations/);
  await expect(page.getByRole('heading', { name: 'Violations', level: 1 })).toBeVisible();
  await expect(navLink).toBeHidden();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
