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

test.describe('Módulo de Notas Fiscais (Invoices)', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2E(page);
    await performLogin(page);
  });

  test('deve listar notas fiscais e verificar vínculo com OS', async ({ page }) => {
    await page.goto('/nota-fiscal');
    await ensureHydrated(page);

    // Verifica se a tabela contém itens do seed
    const table = page.locator('table');
    
    // De acordo com o seed, a primeira NF (inv-1) está vinculada à nota n29 (OS-29)
    await expect(table.getByText('OS-29')).toBeVisible({ timeout: 10000 });
    
    // Verifica se o valor da primeira nota está correto
    await expect(table.getByText('R$ 1.686,00')).toBeVisible();
  });

  test('deve visualizar detalhes de uma nota fiscal', async ({ page }) => {
    await page.goto('/nota-fiscal');
    await ensureHydrated(page);

    // Clica na primeira linha da tabela
    await page.locator('table tbody tr').first().click();

    // Verifica se o painel lateral (Sheet) abriu
    const sheet = page.locator('[role="dialog"]');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(/Dados Técnicos/i)).toBeVisible();
    await expect(sheet.getByText(/Integração NFE.io/i)).toBeVisible();
    
    // Verifica se o botão de fechar funciona
    // O botão X em shadcn/ui costuma ter o nome 'Close'
    await sheet.getByRole('button', { name: /Close/i }).click();
    await expect(sheet).not.toBeVisible();
  });

  test('deve registrar uma nova nota fiscal a partir de uma nota de entrada finalizada', async ({ page }) => {
    // 1. Vai para uma Nota de Entrada finalizada sem fatura (n34 -> OS-34)
    // No seed, i=33 é n34. 33%20 = 13. Customers[13] é Fernando Gomes da Silva.
    await page.goto('/notas-entrada/n34');
    await ensureHydrated(page);
    
    // 2. Navega para a aba NF
    await page.getByRole('tab', { name: /nf/i }).click();
    
    // 3. Clica no link para Registrar NF
    await page.getByRole('link', { name: /Registrar NF/i }).click();
    await expect(page).toHaveURL(/\/nota-fiscal/);
    await ensureHydrated(page);

    // 4. Abre o formulário de registro
    await page.getByRole('button', { name: /Registrar NF/i }).click();
    
    // 5. Preenche o formulário
    // Seleciona o cliente (Fernando Gomes da Silva)
    await page.locator('button:has-text("Selecione o cliente")').click();
    await page.getByRole('option', { name: /Fernando Gomes da Silva/i }).click();

    // Seleciona a nota de entrada (OS-34)
    await page.locator('button:has-text("Selecione uma nota finalizada")').click();
    await page.getByRole('option', { name: /OS-34/i }).click();

    // Preenche número e valor
    await page.getByPlaceholder('000001234').fill('999888');
    await page.getByPlaceholder('0,00').fill('1500.50');
    
    // Salva
    await page.getByRole('button', { name: /Registrar NF/i, exact: true }).click();

    // Verifica toast de sucesso
    await expect(page.getByText(/Nota fiscal registrada com sucesso/i).first()).toBeVisible();
    
    // Verifica se apareceu na listagem
    await expect(page.locator('table').getByText('999888')).toBeVisible();
  });
});
