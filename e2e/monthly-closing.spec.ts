import { test, expect } from '@playwright/test';
import { clearSession, loginAs } from './helpers';

test.describe('Fechamento Mensal', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, 'financeiro');
    await page.goto('/fechamento');
    await expect(page.getByRole('heading', { name: 'Fechamento Mensal' })).toBeVisible();
  });

  test('gera rascunho e visualiza template sem finalizar fechamento mockado', async ({ page }) => {
    await page.getByRole('combobox', { name: /cliente do fechamento/i }).click();
    await page.getByRole('option', { name: /Ana Paula Ferreira/i }).click();

    await expect(page.getByText(/mostrando apenas períodos/i)).toBeVisible();
    await page.getByRole('button', { name: /gerar rascunho/i }).click();

    const draftDialog = page.getByRole('dialog').filter({ hasText: /rascunho de fechamento/i });
    await expect(draftDialog).toBeVisible();
    await expect(draftDialog.getByText(/resumo do rascunho/i)).toBeVisible();

    await draftDialog.getByRole('button', { name: /visualizar/i }).click();

    const previewDialog = page.getByRole('dialog').filter({ hasText: /template final do fechamento/i });
    await expect(previewDialog).toBeVisible();
    await expect(previewDialog.getByText(/aparência de impressão/i)).toBeVisible();
    await expect(previewDialog.getByText(/retífica premium/i).first()).toBeVisible();
  });
});
