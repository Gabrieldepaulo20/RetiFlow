import { test, expect, Page } from '@playwright/test';
import { setupE2E, ensureHydrated } from './helpers/mock-rpc';

async function performLogin(page: Page) {
  await page.goto('/login');
  await ensureHydrated(page);
  await page.fill('input[type="email"]', 'financeiro@retifica.com');
  await page.fill('input[type="password"]', 'demo123');
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await ensureHydrated(page);
}

test.describe('Módulo de Fechamento Mensal', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupE2E(page);
    await performLogin(page);
  });

  test('deve acessar a página de fechamento mensal', async ({ page }) => {
    await page.goto('/fechamento');
    await ensureHydrated(page);
    await expect(page.getByRole('heading', { name: /Fechamento Mensal/i })).toBeVisible();
  });

  test('deve gerar um rascunho de fechamento para um cliente', async ({ page }) => {
    await page.goto('/fechamento');
    await ensureHydrated(page);

    // Seleciona Cliente
    await page.getByRole('combobox').filter({ hasText: /Selecionar cliente/i }).click();
    await page.getByRole('option', { name: /Ana Paula Ferreira/i }).click();

    // Espera carregar períodos
    await expect(page.getByRole('combobox').nth(1)).not.toHaveText(/Carregando/i, { timeout: 10000 });

    // Seleciona Mês (deve aparecer Fevereiro)
    await page.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: /Fevereiro/i }).click();

    // Clica em Gerar rascunho
    await page.getByRole('button', { name: /Gerar rascunho/i }).click();

    // O modal deve abrir automaticamente
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/Rascunho de fechamento/i).first()).toBeVisible();
  });

  test('deve editar rascunho, calcular totais e finalizar fechamento', async ({ page }) => {
    await page.goto('/fechamento');
    await ensureHydrated(page);

    // Gera o rascunho primeiro
    await page.getByRole('combobox').filter({ hasText: /Selecionar cliente/i }).click();
    await page.getByRole('option', { name: /Ana Paula Ferreira/i }).click();
    await expect(page.getByRole('combobox').nth(1)).not.toHaveText(/Carregando/i, { timeout: 10000 });
    await page.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: /Fevereiro/i }).click();
    await page.getByRole('button', { name: /Gerar rascunho/i }).click();

    // O modal abre automaticamente.
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // Altera a quantidade de um item
    const qtyInput = modal.locator('input[type="number"]').nth(0);
    await qtyInput.fill('10');
    
    // Verifica se o total no resumo foi atualizado
    await expect(modal.getByText(/R\$ /i).last()).not.toHaveText(/R\$ 0,00/i);

    // Clica em Visualizar template
    await modal.getByRole('button', { name: /Visualizar/i }).click();
    
    // Agora tem outro dialog por cima
    const previewDialog = page.getByRole('dialog').filter({ hasText: /Template final do fechamento/i });
    await expect(previewDialog).toBeVisible();
    
    // Fecha o preview
    await page.keyboard.press('Escape');

    // Volta para o modal de edição
    await expect(modal).toBeVisible();

    // Clica em Gerar fechamento (dentro do modal)
    await modal.getByRole('button', { name: /Gerar fechamento/i }).click();

    // Verifica toast de sucesso (MOCK mode)
    await expect(page.getByText(/Fechamento gerado \(MOCK\)/i)).toBeVisible();
    
    // O rascunho deve ter sumido da lista na página principal (o modal fechou)
    await expect(page.getByText(/Nenhum rascunho salvo ainda/i)).toBeVisible();
  });
});
