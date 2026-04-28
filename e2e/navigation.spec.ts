import { test, expect } from '@playwright/test';
import { loginAs, clearSession } from './helpers';

test.describe('Navigation — authenticated routes', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, 'financeiro');
  });

  test('navigates to Clientes', async ({ page }) => {
    await page.goto('/clientes');
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
  });

  test('navigates to Notas de Entrada', async ({ page }) => {
    await page.goto('/notas-entrada');
    await expect(page.getByRole('heading', { name: 'Notas de Entrada' })).toBeVisible();
  });

  test('navigates to Kanban (Produção)', async ({ page }) => {
    await page.goto('/kanban');
    await expect(page.getByRole('heading', { name: 'Produção' })).toBeVisible();
  });

  test('navigates to Fechamento Mensal', async ({ page }) => {
    await page.goto('/fechamento');
    await expect(page.getByRole('heading', { name: 'Fechamento Mensal' })).toBeVisible();
  });

  test('navigates to Contas a Pagar', async ({ page }) => {
    await page.goto('/contas-a-pagar');
    await expect(page.getByRole('heading', { name: 'Contas a Pagar' })).toBeVisible();
  });

  test('Nota Fiscal shows unavailable screen (not mock actions)', async ({ page }) => {
    await page.goto('/nota-fiscal');
    await expect(page.getByRole('heading', { name: 'Nota Fiscal indisponível' })).toBeVisible();
    await expect(page.getByText(/fora da v1\/piloto/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /registrar|emitir|baixar/i })).not.toBeVisible();
  });

  test('unknown route shows 404 page', async ({ page }) => {
    await page.goto('/pagina-que-nao-existe');
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  });
});
