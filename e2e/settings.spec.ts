import { test, expect } from '@playwright/test';
import { loginAs, clearSession } from './helpers';

test.describe('Configurações', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, 'admin');
    await page.goto('/admin/configuracoes');
    await expect(page.getByRole('heading', { name: 'Configurações', exact: true })).toBeVisible();
  });

  test('navega pelas abas de configurações', async ({ page }) => {
    const tabs = [
      'Empresa',
      'Módulos',
      'Aparência',
      'Modelos',
      'Segurança',
      'Usuários',
    ];

    for (const tab of tabs) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('explica indisponibilidade dos dados da empresa no modo local', async ({ page }) => {
    await page.getByRole('tab', { name: /empresa/i }).click();
    await expect(page.getByText('Modo local', { exact: true })).toBeVisible();
    await expect(page.getByText(/configurações da empresa dependem do Supabase em modo real/i)).toBeVisible();
  });
});

test.describe('Configurações responsivas no tablet', () => {
  test.use({
    viewport: { width: 1280, height: 800 },
    hasTouch: true,
  });

  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, 'admin');
    await page.goto('/admin/configuracoes');
    await expect(page.getByRole('heading', { name: 'Configurações', exact: true })).toBeVisible();
  });

  test('mantém as abas em uma linha rolável sem criar overflow na página', async ({ page }) => {
    const tabList = page.getByRole('tablist', { name: 'Seções de configurações' });
    const tabs = tabList.getByRole('tab');

    const assertSingleRowAndContainedPage = async () => {
      const tabBoxes = await tabs.evaluateAll((items) => items.map((item) => {
        const rect = item.getBoundingClientRect();
        return { top: rect.top, height: rect.height };
      }));
      expect(tabBoxes).toHaveLength(10);
      tabBoxes.forEach((box) => {
        expect(Math.abs(box.top - tabBoxes[0].top)).toBeLessThanOrEqual(1);
        expect(box.height).toBeGreaterThanOrEqual(44);
      });

      const pageWidths = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
      }));
      expect(pageWidths.documentWidth, JSON.stringify(pageWidths)).toBeLessThanOrEqual(pageWidths.viewport + 1);
      expect(pageWidths.bodyWidth, JSON.stringify(pageWidths)).toBeLessThanOrEqual(pageWidths.viewport + 1);
    };

    await expect(tabList).toBeVisible();
    const railSize = await tabList.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(railSize.scrollWidth).toBeGreaterThan(railSize.clientWidth);
    await assertSingleRowAndContainedPage();

    await page.getByRole('tab', { name: 'Usuários' }).click();
    await expect(page.getByRole('tab', { name: 'Usuários' })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => tabList.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

    await page.setViewportSize({ width: 1024, height: 640 });
    await assertSingleRowAndContainedPage();

    await page.getByRole('tab', { name: 'Módulos' }).click();
    await expect(page.getByRole('tab', { name: 'Módulos' })).toHaveAttribute('aria-selected', 'true');
    const verticalScroll = await page.evaluate(() => ({
      viewportHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
    }));
    expect(verticalScroll.documentHeight).toBeGreaterThan(verticalScroll.viewportHeight);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const lastModuleControl = page.getByRole('switch').last();
    await expect(lastModuleControl).toBeVisible();
    await expect.poll(async () => {
      const box = await lastModuleControl.boundingBox();
      return box ? box.y + box.height : Number.POSITIVE_INFINITY;
    }).toBeLessThanOrEqual(640);

    await page.setViewportSize({ width: 390, height: 844 });
    await assertSingleRowAndContainedPage();
  });
});
