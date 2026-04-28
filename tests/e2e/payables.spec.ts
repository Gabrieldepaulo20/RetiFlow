import { test, expect } from '@playwright/test';
import { setupE2E, ensureHydrated } from './helpers/mock-rpc';

test.describe('Módulo de Contas a Pagar', () => {
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

  test('deve listar contas a pagar do seed', async ({ page }) => {
    await page.goto('/contas-a-pagar');
    await ensureHydrated(page);
    // Dado esperado do seed.ts
    await expect(page.getByText(/IPTU — Parcela 2\/10/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('deve abrir o modal de nova conta e salvar', async ({ page }) => {
    await page.goto('/contas-a-pagar');
    await ensureHydrated(page);

    await page.getByRole('button', { name: /Nova Conta/i }).click();
    await expect(page).toHaveURL(/modal=new/);
    await expect(page.getByRole('heading', { name: /Nova conta a pagar/i })).toBeVisible();

    await page.getByPlaceholder(/Ex.: Boleto peças/i).fill('Aluguel Julho');
    await page.getByPlaceholder(/0,00/i).first().fill('3000');

    await page.getByRole('button', { name: /Salvar conta/i }).click();

    await expect(page.getByText(/Conta cadastrada com sucesso/i).first()).toBeVisible();
  });
});
