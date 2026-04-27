import { test, expect } from '@playwright/test';
import { setupE2E, ensureHydrated } from './helpers/mock-rpc';

test.describe('Módulo de Clientes', () => {
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

  test('deve listar clientes vindos do seed', async ({ page }) => {
    await page.goto('/clientes');
    await ensureHydrated(page);
    // Dado do seed.ts
    await expect(page.getByText(/Oliveira/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('deve cadastrar um novo cliente', async ({ page }) => {
    await page.goto('/clientes');
    await ensureHydrated(page);
    
    await page.getByRole('button', { name: /Novo Cliente/i }).click();
    await expect(page.getByRole('heading', { name: /Novo cliente/i })).toBeVisible();

    await page.fill('input[name="name"]', 'Novo Cliente Playwright');
    await page.fill('input[name="docNumber"]', '12.345.678/0001-00');
    
    await page.getByRole('button', { name: /Salvar/i }).click();

    await expect(page.getByText(/Cliente cadastrado com sucesso/i).first()).toBeVisible();
  });
});
