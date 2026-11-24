import { expect, test, type Page } from '@playwright/test';

/** Open access: the map loads straight away, no sign-in step. */
async function login(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('atlas')).toBeVisible();
  await expect(page.locator('.tile').first()).toBeVisible();
}

const threadCount = (page: Page) => page.locator('[data-thread]').count();

async function openLensBySearch(page: Page, q: string, option: RegExp) {
  await page.getByTestId('search-input').fill(q);
  await page.getByTestId('search-results').getByRole('option', { name: option }).first().click();
  await expect(page.getByTestId('lens')).toBeVisible();
}

test.describe('open access and private files (acceptance 13)', () => {
  test('the map opens without any sign-in screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('atlas')).toBeVisible();
    await expect(page.locator('.tile').first()).toBeVisible();
    await expect(page.getByText('خروج')).toHaveCount(0);
    await expect(page.getByTestId('dev-login')).toHaveCount(0);
  });
  test('data API answers without credentials; login endpoints and private files return nothing', async ({ request }) => {
    expect((await request.get('/api/snapshot')).status()).toBe(200);
    for (const p of ['/api/session', '/api/export/snapshot.json']) expect((await request.get(p)).status()).toBe(404);
    for (const p of ['/docs/ASAKIN-INTEGRATION-AUDIT.zip', '/docs/CONFIDENTIAL-risk-triage.md', '/data/private/canonical/systems.json', '/assets/index.js.map', '/design/Main.dc.html']) {
      const r = await request.get(p);
      expect([403, 404]).toContain(r.status());
      const body = await r.body();
      expect(body.subarray(0, 2).toString('latin1')).not.toBe('PK'); // never a ZIP payload
      expect(body.toString('utf8')).not.toMatch(/risk triage|"integrations"/i);
    }
  });
});

test.describe('atlas (design artboards 1–2)', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('renders every system in five lanes, including unaudited ones (acceptance 2)', async ({ page }) => {
    expect(await page.locator('.tile').count()).toBe(48);
    for (const k of ['EXT:REPLIT-OBJECT-STORAGE', 'EXT:BROWSER-PUSH', 'EXT:EJAR', 'EXT:EXPO-PUSH', 'EXT:GCS', 'EXT:GOOGLE-FONTS', 'EXT:UNSPLASH']) {
      await expect(page.getByTestId(`node-${k}`)).toHaveCount(0); // excluded by reviewed decisions DEC-001…007
    }
    await expect(page.locator('.lane-head')).toHaveCount(5);
    await expect(page.getByTestId('node-PAYMENTS')).toHaveAttribute('aria-label', /لم يُفحص بعد/);
    await expect(page.getByTestId('node-SYS-DESIGN-SYSTEM')).toHaveCount(1);
    await expect(page.getByTestId('node-WEB')).toContainText('الموقع العام'); // renamed by reviewed decision DEC-008
  });

  test('threads are hidden until a system is hovered or focused, then only its own appear', async ({ page }) => {
    expect(await threadCount(page)).toBe(0);
    await page.getByTestId('node-APMS').focus();
    await expect.poll(() => threadCount(page)).toBeGreaterThan(0);
    await expect(page.getByTestId('peek')).toContainText('وارد');
    await expect(page.getByTestId('node-APMS')).toHaveClass(/active/);
    await page.getByTestId('mode-all').click();
    expect(await threadCount(page)).toBeGreaterThan(50);
  });

  test('hovering a thread shows the data it carries (acceptance 11)', async ({ page }) => {
    await page.getByTestId('node-APMP').focus();
    await expect.poll(() => threadCount(page)).toBeGreaterThan(0);
    await page.locator('.thread-hit').first().dispatchEvent('mouseover');
    const card = page.getByTestId('thread-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('انقر على الخط');
  });

  test('verification legend filters threads', async ({ page }) => {
    await page.getByTestId('mode-all').click();
    const all = await threadCount(page);
    await page.getByTestId('legend-documented').click();
    await page.getByTestId('legend-partial').click();
    await expect(page.getByTestId('legend-documented')).toHaveAttribute('aria-pressed', 'false');
    const onlyNeeds = await threadCount(page);
    expect(onlyNeeds).toBeGreaterThan(0);
    expect(onlyNeeds).toBeLessThan(all);
  });

  test('zoom controls change the scale', async ({ page }) => {
    const before = Number(await page.getByTestId('atlas-scale').textContent());
    await page.getByTestId('zoom-in').click();
    await expect.poll(async () => Number(await page.getByTestId('atlas-scale').textContent())).toBeGreaterThan(before);
  });
});

test.describe('lens, drawer and impact (design artboards 3–5)', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('request initiator and data direction stay separate (acceptance 6)', async ({ page }) => {
    await openLensBySearch(page, 'AOP', /فرص أساكن/);
    await expect(page.getByTestId('page-title')).toContainText('فرص أساكن');
    // AOP pulls projects from APMP: the APMP row is INCOMING data for AOP.
    const row = page.getByTestId('lens-in').getByTestId('lens-row').filter({ hasText: 'APMP' }).first();
    await expect(row).toBeVisible();
    await row.click();
    const wire = page.getByTestId('drawer').locator('.wire');
    await expect(wire).toHaveAttribute('aria-label', /يبدأ الطلب: فرص أساكن/);
    await expect(wire).toHaveAttribute('aria-label', /تعود البيانات من APMP إلى فرص أساكن/);
  });

  test('drawer tabs: fields, how it works (Registry never a hop), evidence (agent-reported)', async ({ page }) => {
    await openLensBySearch(page, 'AOP', /فرص أساكن/);
    await page.getByTestId('lens-in').getByTestId('lens-row').filter({ hasText: 'APMP' }).first().click();
    await expect(page.getByTestId('field-table')).toBeVisible();
    await page.getByTestId('tab-how').click();
    const how = page.getByTestId('how-tab');
    await expect(how).toContainText('اتجاه التبادل');
    await expect(how).toContainText(/ليس محطة عبور|مباشر بين النظامين/);
    await page.getByTestId('tab-evidence').click();
    await expect(page.getByTestId('evidence-tab')).toContainText('مُبلّغ');
    await expect(page.getByTestId('readonly-note')).toContainText('للقراءة فقط');
    await expect(page.getByText('تعديل حالة التحقق')).toHaveCount(0);
  });

  test('field search opens the drawer on the exact mapping (acceptance 11)', async ({ page }) => {
    await page.getByTestId('search-input').fill('privatePartsAreaSqm');
    await page.getByTestId('search-results').getByRole('option').first().click();
    await expect(page.getByTestId('field-table')).toBeVisible();
    await expect(page.locator('.frow.hl')).toContainText('privatePartsAreaSqm');
    await expect(page.getByTestId('field-detail')).toBeVisible();
  });

  test('impact simulation: change types, rings, potential wording', async ({ page }) => {
    await openLensBySearch(page, 'APMP', /APMP/);
    await page.getByTestId('go-impact').click();
    await expect(page.getByTestId('impact')).toBeVisible();
    await expect(page.getByTestId('page-title')).toContainText('ماذا لو تغيّر');
    expect(Number(await page.getByTestId('impact-direct').textContent())).toBeGreaterThan(0);
    await expect(page.getByTestId('impact')).toContainText('محتمل');
    await page.getByTestId('change-kind').getByRole('button', { name: 'تغيير واجهته البرمجية' }).click();
    await expect(page).toHaveURL(/\/api$/);
    await page.getByTestId('impact-node').first().click();
    await expect(page.getByTestId('lens')).toBeVisible();
  });

  test('browser back returns through the journey', async ({ page }) => {
    await openLensBySearch(page, 'APMP', /APMP/);
    await expect(page).toHaveURL(/#\/system\//);
    await page.goBack();
    await expect(page.getByTestId('atlas')).toBeVisible();
  });

  test('keyboard: Tab to a system, Enter opens it, rows open the drawer, Escape walks back (acceptance 12)', async ({ page }) => {
    await page.getByTestId('search-input').focus();
    let onTile = false;
    for (let i = 0; i < 40 && !onTile; i++) {
      await page.keyboard.press('Tab');
      onTile = await page.evaluate(() => !!document.activeElement?.classList.contains('tile'));
    }
    expect(onTile).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('lens')).toBeVisible();
    const row = page.getByTestId('lens-row').first();
    if (await row.count()) {
      await row.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('drawer')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('drawer')).toHaveCount(0);
    }
    await page.locator('body').press('Escape');
    await expect(page.getByTestId('atlas')).toBeVisible();
    await page.keyboard.press('/');
    await expect(page.getByTestId('search-input')).toBeFocused();
  });

  test('layout at 1366x768: no horizontal page overflow, drawer inside the screen (acceptance 12)', async ({ page }) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await openLensBySearch(page, 'APMP', /APMP/);
    await page.getByTestId('lens-row').first().click();
    const box = await page.getByTestId('drawer').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(1366 + 1);
  });
});

test.describe('narrow screen and motion', () => {
  test('narrow viewport keeps the page inside the screen', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 700 });
    await login(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const frame = await page.getByTestId('atlas').boundingBox();
    expect(frame!.x).toBeGreaterThanOrEqual(0);
    expect(frame!.x + frame!.width).toBeLessThanOrEqual(1024 + 1);
  });

  test('prefers-reduced-motion disables moving data beads', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    await login(page);
    await page.getByTestId('node-APMP').focus();
    await expect.poll(() => threadCount(page)).toBeGreaterThan(0);
    await expect(page.locator('.bead')).toHaveCount(0);
    await ctx.close();
  });

  test('data movement is always animated (no toggle), bounded to documented directions', async ({ page }) => {
    await login(page);
    await expect(page.getByTestId('toggle-motion')).toHaveCount(0);
    await page.getByTestId('node-APMP').focus();
    await expect.poll(() => page.locator('.bead').count()).toBeGreaterThan(0);
    expect(await page.locator('.bead').count()).toBeLessThanOrEqual(2 * (await threadCount(page)));
  });
});

test.describe('PDF export of the current page', () => {
  async function exportPdf(page: Page) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-pdf').click()]);
    const path = await download.path();
    const { readFileSync } = await import('node:fs');
    const bytes = readFileSync(path!);
    return { name: download.suggestedFilename(), bytes };
  }

  test('atlas exports as a PDF named after the view', async ({ page }) => {
    await login(page);
    const { name, bytes } = await exportPdf(page);
    expect(name).toMatch(/^asakin-integration-map_atlas_\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(30_000);
    await expect(page.getByTestId('export-pdf')).toBeEnabled();
  });

  test('lens with an open integration keeps its scroll position and names the file after it', async ({ page }) => {
    await login(page);
    await openLensBySearch(page, 'APMP', /APMP/);
    await page.getByTestId('lens-row').first().click();
    await page.getByTestId('lens').evaluate((el) => { el.scrollTop = 200; });
    const { name, bytes } = await exportPdf(page);
    expect(name).toMatch(/^asakin-integration-map_system-APMP-.+_\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(await page.getByTestId('lens').evaluate((el) => el.scrollTop)).toBe(200);
    await expect(page.getByTestId('drawer')).toBeVisible();
  });
});
