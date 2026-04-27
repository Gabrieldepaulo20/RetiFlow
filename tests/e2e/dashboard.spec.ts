import { test, expect } from '@playwright/test';
import { setupE2E, ensureHydrated } from './helpers/mock-rpc';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2E(page);
    await page.goto('/login');
    await ensureHydrated(page);
    await page.fill('input[type="email"]', 'financeiro@retifica.com');
    await page.fill('input[type="password"]', 'demo123');
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await ensureHydrated(page);
  });

  test('deve exibir os cards de métricas principais', async ({ page }) => {
    await expect(page.getByText(/Em andamento/i).first()).toBeVisible();
    await expect(page.getByText(/Finalizadas/i).first()).toBeVisible();
  });

  test('deve exibir os widgets financeiros', async ({ page }) => {
    await expect(page.getByText(/Comprometido no mês/i)).toBeVisible();
    await expect(page.getByText(/Saldo operacional/i)).toBeVisible();
  });

  test('deve exibir a lista de últimas movimentações', async ({ page }) => {
    await expect(page.getByText(/Últimas Movimentações/i)).toBeVisible();
    // No mock mode, a lista deve ter itens do seed
    await expect(page.locator('.divide-y >> div').first()).toBeVisible();
  });
});
