import { test, expect, type Page } from '@playwright/test';
import { clearSession, loginAs } from './helpers';

async function openNotes(page: Page) {
  await page.goto('/notas-entrada');
  await expect(page.getByRole('heading', { name: 'Notas de Entrada' })).toBeVisible();
}

test.describe('Notas de Entrada', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, 'financeiro');
  });

  test('lista O.S. e abre detalhe da nota', async ({ page }) => {
    await openNotes(page);

    await page.getByPlaceholder(/buscar por o\.s\. ou cliente/i).fill('OS-2');
    const row = page.locator('tr').filter({ hasText: 'OS-2' }).first();

    await expect(row.getByText('OS-2', { exact: true })).toBeVisible();
    await row.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('OS-2', { exact: true })).toBeVisible();
  });

  test('abre preview do documento com itens da O.S.', async ({ page }) => {
    await openNotes(page);

    await page.getByPlaceholder(/buscar por o\.s\. ou cliente/i).fill('OS-2');
    const row = page.locator('tr').filter({ hasText: 'OS-2' }).first();
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: /mais ações/i }).click();
    await page.getByRole('menuitem', { name: /preview do documento/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/preview — os-2/i)).toBeVisible();
    await expect(dialog.getByText(/descrição dos produtos/i).first()).toBeVisible();
    await expect(dialog.getByText(/plaqueamento de superfície/i).first()).toBeVisible();
  });

  test('ação de baixar nota não expõe href público direto na listagem', async ({ page }) => {
    await openNotes(page);

    await page.getByPlaceholder(/buscar por o\.s\. ou cliente/i).fill('OS-1');
    const row = page.locator('tr').filter({ hasText: 'OS-1' }).first();
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: /mais ações/i }).click();
    const downloadAction = page.getByRole('menuitem', { name: /baixar nota/i });

    await expect(downloadAction).toBeVisible();
    await expect(downloadAction).not.toHaveAttribute('href', /./);
    await expect(page.locator('a[href*="/mock/pdf"], a[href*="/storage/v1/object/public/notas"]')).toHaveCount(0);
  });

  test('cadastra uma nova O.S. com serviço', async ({ page }) => {
    await openNotes(page);

    await page.getByRole('button', { name: /nova o\.s\./i }).click();
    await expect(page.getByRole('heading', { name: /nova ordem de serviço/i })).toBeVisible();

    await page.getByRole('button', { name: /selecionar data/i }).click();
    await page.locator('button').filter({ hasText: /^20$/ }).first().click();

    await page.getByPlaceholder(/digite o nome, documento ou telefone/i).fill('José');
    await page.getByRole('button', { name: /José Carlos Mendes/i }).click();

    await page.getByPlaceholder(/ex: gol 1\.0 8v/i).fill('Uno Mille E2E');

    const description = page.getByPlaceholder(/descrição do serviço/i).first();
    await description.scrollIntoViewIfNeeded();
    await description.fill('Troca de óleo E2E');
    await page.locator('input[type="number"]').nth(1).fill('1');
    await page.getByPlaceholder('0,00').first().fill('150');

    await page.getByRole('button', { name: /salvar o\.s\./i }).click();

    await expect(page.getByText(/criada com sucesso/i).first()).toBeVisible();
  });
});
