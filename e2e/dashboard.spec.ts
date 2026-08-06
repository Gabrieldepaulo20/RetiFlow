import { test, expect } from '@playwright/test';
import { loginAs, clearSession } from './helpers';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, 'financeiro');
    await page.goto('/dashboard');
  });

  test('visualiza KPIs financeiros', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Entradas previstas/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Faturamento real/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Ticket médio/i })).toBeVisible();
  });

  test('mantém os sete KPIs em uma linha no tablet deitado', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.reload();

    const cards = page.getByTestId('dashboard-financial-kpis').locator(':scope > *');
    await expect(cards).toHaveCount(7);

    const boxes = await cards.evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, right: rect.right };
    }));

    expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1);
    expect(boxes.at(-1)?.right).toBeLessThanOrEqual(1280);
  });

  test('visualiza gráficos de faturamento e status', async ({ page }) => {
    await expect(page.getByText('Distribuição por Status', { exact: true })).toBeVisible();
    await expect(page.getByText('Faturamento — 6 meses', { exact: true })).toBeVisible();
  });

  test('visualiza seção financeira', async ({ page }) => {
    await expect(page.getByText('Resultado financeiro', { exact: true })).toBeVisible();
    await expect(page.getByText('Caixa do período', { exact: true })).toBeVisible();
    await expect(page.getByText('DRE — resultado do período', { exact: true })).toBeVisible();
  });
});
