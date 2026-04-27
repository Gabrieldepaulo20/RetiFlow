import { test, expect } from '@playwright/test';
import { setupE2E, ensureHydrated } from './helpers/mock-rpc';

test.describe('Autenticação', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2E(page);
  });

  test('deve realizar login com sucesso no portal do cliente', async ({ page }) => {
    await page.goto('/login');
    await ensureHydrated(page);

    await page.fill('input[type="email"]', 'financeiro@retifica.com');
    await page.fill('input[type="password"]', 'demo123');
    await page.getByRole('button', { name: /entrar/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await ensureHydrated(page);
    await expect(page.locator('aside').getByText('Paula Martins').first()).toBeVisible();
  });

  test('deve mostrar erro com credenciais inválidas', async ({ page }) => {
    await page.goto('/login');
    await ensureHydrated(page);

    await page.fill('input[type="email"]', 'errado@retifica.com');
    await page.fill('input[type="password"]', 'senha_errada');
    await page.getByRole('button', { name: /entrar/i }).click();

    await expect(page.getByText(/Credenciais inválidas/i).first()).toBeVisible();
  });

  test('deve realizar login com sucesso no portal admin', async ({ page }) => {
    await page.goto('/admin/login');
    await ensureHydrated(page);

    await page.fill('input[type="email"]', 'admin@retifica.com');
    await page.fill('input[type="password"]', 'demo123');
    await page.getByRole('button', { name: /entrar/i }).click();

    await expect(page).toHaveURL(/\/admin/);
    await ensureHydrated(page);
    await expect(page.locator('aside').getByText('Admin Master').first()).toBeVisible();
  });
});
