import { test, expect } from '@playwright/test';
import { loginAs, clearSession } from './helpers';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, 'financeiro');
    await page.goto('/dashboard');
  });

  test('visualiza KPIs operacionais', async ({ page }) => {
    await expect(page.getByText('Em andamento', { exact: true })).toBeVisible();
    await expect(page.getByText('Finalizadas', { exact: true })).toBeVisible();
    await expect(page.getByText('Ticket médio', { exact: true })).toBeVisible();
  });

  test('visualiza gráficos de faturamento e status', async ({ page }) => {
    await expect(page.getByText('Distribuição por Status', { exact: true })).toBeVisible();
    await expect(page.getByText('Faturamento — 6 meses', { exact: true })).toBeVisible();
  });

  test('visualiza seção financeira', async ({ page }) => {
    await expect(page.getByText('Financeiro — Entradas x Saídas', { exact: true })).toBeVisible();
    await expect(page.getByText('Próximos vencimentos e parcelas', { exact: true })).toBeVisible();
  });
});
