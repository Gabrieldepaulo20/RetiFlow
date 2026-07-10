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
