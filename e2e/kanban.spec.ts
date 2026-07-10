import { test, expect } from '@playwright/test';
import { loginAs, clearSession } from './helpers';

test.describe('Kanban (Produção)', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, 'producao');
    await page.goto('/kanban');
    await expect(page.getByRole('heading', { name: 'Produção' })).toBeVisible();
  });

  test('lista colunas do Kanban', async ({ page }) => {
    const visibleColumns = [
      'Aberta',
      'Em Análise',
      'Orçamento',
      'Aprovado',
      'Em Execução',
      'Aguardando Compra',
      'Pronta',
      'Entregue',
    ];

    for (const column of visibleColumns) {
      const heading = page.getByRole('heading', { name: column, exact: true });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
    }
  });

  test('visualiza card de O.S. e abre detalhe', async ({ page }) => {
    const os1 = page.getByText('OS-1', { exact: true }).first();
    await expect(os1).toBeVisible();

    await os1.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('OS-1', { exact: true })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('move uma O.S. diretamente para Entregue e depois reabre como Aberta', async ({ page }) => {
    await page.getByText('OS-1', { exact: true }).first().click();

    const dialog = page.getByRole('dialog');
    const statusControl = dialog.getByRole('combobox', { name: 'Mover OS-1 para outro status' });

    await statusControl.click();
    await page.getByRole('option', { name: 'Entregue', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Aberta');
    await expect(page.getByRole('alertdialog')).toContainText('Entregue');
    await page.getByRole('button', { name: 'Confirmar mudança' }).click();

    await expect(dialog.getByText('Entregue', { exact: true }).first()).toBeVisible();

    await dialog.getByRole('combobox', { name: 'Mover OS-1 para outro status' }).click();
    await page.getByRole('option', { name: 'Aberta', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar mudança' }).click();

    await expect(dialog.getByText('Aberta', { exact: true }).first()).toBeVisible();
  });

  test('filtra Kanban por texto', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/buscar no kanban por o\.s\./i);
    await searchInput.fill('Ana Paula');

    await expect(page.getByText('OS-10', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('OS-1', { exact: true }).first()).not.toBeVisible();

    await searchInput.fill('');
    await expect(page.getByText('OS-1', { exact: true }).first()).toBeVisible();
  });
});

test.describe('Kanban (permissões)', () => {
  test('Financeiro consulta a O.S., mas não recebe controles de mudança de status', async ({ page }) => {
    await clearSession(page);
    await loginAs(page, 'financeiro');
    await page.goto('/kanban');

    await page.getByText('OS-1', { exact: true }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('OS-1', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: 'Mover OS-1 para outro status' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /avançar/i })).toHaveCount(0);
  });
});
