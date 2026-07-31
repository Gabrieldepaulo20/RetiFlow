import { test, expect } from '@playwright/test';
import { loginAs, clearSession } from './helpers';

test.describe('Contas a Pagar', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, 'financeiro');
    await page.goto('/financeiro?tab=saidas');
    await expect(page.getByRole('heading', { name: 'Contas a Pagar' })).toBeVisible();
  });

  test('opens Nova conta a pagar modal via URL param', async ({ page }) => {
    await page.goto('/financeiro?tab=saidas&modal=new');
    await expect(page.getByRole('heading', { name: /nova conta a pagar/i })).toBeVisible();
  });

  test('opens Importar contas modal via URL param', async ({ page }) => {
    await page.goto('/financeiro?tab=saidas&modal=import');
    await expect(page.getByRole('heading', { name: /importar contas/i })).toBeVisible();
  });

  test('compatibility route /contas-a-pagar/nova redirects and opens modal', async ({ page }) => {
    await page.goto('/contas-a-pagar/nova');
    await expect(page).toHaveURL(/financeiro\?.*modal=new/);
    await expect(page).toHaveURL(/financeiro\?.*tab=saidas/);
    await expect(page.getByRole('heading', { name: /nova conta a pagar/i })).toBeVisible();
  });

  test('closes modal and returns to list', async ({ page }) => {
    await page.goto('/financeiro?tab=saidas&modal=new');
    await expect(page.getByRole('heading', { name: /nova conta a pagar/i })).toBeVisible();

    await page.getByRole('button', { name: /fechar|cancelar/i }).first().click();
    await expect(page.getByRole('heading', { name: /nova conta a pagar/i })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Contas a Pagar' })).toBeVisible();
  });
});
