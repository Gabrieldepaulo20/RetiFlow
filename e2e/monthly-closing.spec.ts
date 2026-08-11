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
    await expect(draftDialog.getByText(/recebimento ao gerar/i)).toBeVisible();
    await draftDialog.getByRole('button', { name: '50%' }).click();
    await expect(draftDialog.getByText(/restará/i)).toBeVisible();
    await expect(draftDialog.getByRole('button', { name: /gerar e receber/i })).toBeVisible();

    await draftDialog.getByRole('button', { name: /visualizar/i }).click();

    // Preview agora renderiza o PDF real (WYSIWYG) em um iframe A4.
    const previewDialog = page.getByRole('dialog').filter({ hasText: /prévia real do pdf/i });
    await expect(previewDialog).toBeVisible();
    await expect(previewDialog.getByRole('button', { name: /abrir pdf/i })).toBeVisible();
    await expect(previewDialog.locator('iframe')).toBeVisible({ timeout: 20000 });
  });

  test('mostra intervalo personalizado com data inicial e final', async ({ page }) => {
    await page.getByRole('button', { name: /personalizado/i }).click();

    await expect(page.getByRole('button', { name: /selecionar data inicial do fechamento/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /selecionar data final do fechamento/i })).toBeVisible();
    await expect(page.getByText(/fechamento de \d{2}\/\d{2}\/\d{4} a \d{2}\/\d{2}\/\d{4}/i)).toBeVisible();
  });

  test('mantém o fechamento utilizável em tablet 1280x800 sem corte horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Fechamento Mensal' })).toBeVisible();

    const pageOverflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(pageOverflow.scrollWidth).toBeLessThanOrEqual(pageOverflow.clientWidth);

    await page.getByRole('combobox', { name: /mês do fechamento/i }).click();
    await page.getByRole('option', { name: /fevereiro/i }).click();
    await page.getByRole('combobox', { name: /cliente do fechamento/i }).click();
    await page.getByRole('option', { name: /Ana Paula Ferreira/i }).click();
    await page.getByRole('button', { name: /gerar rascunho/i }).click();

    const draftDialog = page.getByRole('dialog').filter({ hasText: /rascunho de fechamento/i });
    await expect(draftDialog).toBeVisible();
    const dialogBox = await draftDialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(1280);

    const generateButton = draftDialog.getByRole('button', { name: /gerar sem entrada/i });
    await generateButton.scrollIntoViewIfNeeded();
    await expect(generateButton).toBeVisible();

    const dialogOverflow = await draftDialog.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(dialogOverflow.scrollWidth).toBeLessThanOrEqual(dialogOverflow.clientWidth);
  });
});
