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
    await page.getByRole('combobox', { name: /mês do fechamento/i }).click();
    await page.getByRole('option', { name: /fevereiro/i }).click();

    await expect(page.getByText(/escolha o cliente para fechar fevereiro de 2026/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /gerar rascunho/i })).toBeDisabled();
    await expect(page.getByText(/erro ao carregar períodos do cliente/i)).toHaveCount(0);

    await page.getByRole('combobox', { name: /cliente do fechamento/i }).click();
    await page.getByRole('option', { name: /Ana Paula Ferreira/i }).click();

    await page.getByRole('button', { name: /gerar rascunho/i }).click();

    const draftDialog = page.getByRole('dialog').filter({ hasText: /rascunho de fechamento/i });
    await expect(draftDialog).toBeVisible();
    await expect(draftDialog.getByText(/total a pagar no fechamento/i)).toBeVisible();

    await draftDialog.getByRole('button', { name: /visualizar/i }).click();

    const previewDialog = page.getByRole('dialog').filter({ hasText: /template final do fechamento/i });
    await expect(previewDialog).toBeVisible();
    await expect(previewDialog.getByText(/aparência de impressão/i)).toBeVisible();
    await expect(previewDialog.getByText(/retífica premium/i).first()).toBeVisible();
  });

  test('mostra intervalo personalizado com data inicial e final', async ({ page }) => {
    await page.getByRole('button', { name: /personalizado/i }).click();

    await expect(page.getByRole('button', { name: /selecionar data inicial do fechamento/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /selecionar data final do fechamento/i })).toBeVisible();
    await expect(page.getByText(/fechamento de \d{2}\/\d{2}\/\d{4} a \d{2}\/\d{2}\/\d{4}/i)).toBeVisible();
  });
});
