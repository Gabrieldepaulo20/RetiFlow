import { test, expect } from '@playwright/test';
import { loginAs, clearSession } from './helpers';

test.describe('Kanban (Produção)', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, 'financeiro');
    await page.goto('/kanban');
    await expect(page.getByRole('heading', { name: 'Produção' })).toBeVisible();
  });

  test('lista colunas do Kanban', async ({ page }) => {
    const visibleColumns = [
      'Aberto',
      'Em Análise',
      'Orçamento',
      'Aprovado',
      'Em Execução',
      'Aguardando Compra',
      'Pronto',
      'Entregue'
    ];

    for (const column of visibleColumns) {
      await expect(page.getByText(column, { exact: true }).first()).toBeVisible();
    }
  });

  test('visualiza card de O.S. e abre detalhe', async ({ page }) => {
    // Na semente (seed.ts), temos OS-1 em EM_EXECUCAO
    // Vamos procurar por OS-1
    const os1 = page.getByText('OS-1', { exact: true }).first();
    await expect(os1).toBeVisible();
    
    // Clica no card para abrir o detalhe
    await os1.click();
    
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('OS-1', { exact: true })).toBeVisible();
    
    // Fecha o modal usando a tecla Escape
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('filtra Kanban por texto', async ({ page }) => {
    // Na semente (seed.ts), OS-1 é de Auto Peças Silva e OS-10 é de Ana Paula Ferreira
    // Vamos filtrar por "Ana Paula"
    const searchInput = page.getByPlaceholder(/buscar no kanban por o\.s\./i);
    await searchInput.fill('Ana Paula');
    
    await expect(page.getByText('OS-10', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('OS-1', { exact: true }).first()).not.toBeVisible();
    
    // Limpa filtro
    await searchInput.fill('');
    await expect(page.getByText('OS-1', { exact: true }).first()).toBeVisible();
  });
});
