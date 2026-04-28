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

test.describe('Módulo de Notas de Entrada', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2E(page);
    await performLogin(page);
  });

  test('debug: deve listar clientes para confirmar seed', async ({ page }) => {
    await page.goto('/clientes');
    await ensureHydrated(page);
    const table = page.locator('table');
    // José Carlos Mendes está no seed.ts
    await expect(table.getByText(/José Carlos Mendes/i)).toBeVisible({ timeout: 20000 });
  });

  test('deve listar notas de entrada vindas do seed', async ({ page }) => {
    await page.goto('/notas-entrada');
    await ensureHydrated(page);
    
    // Usa a busca para encontrar a nota específica
    await page.getByPlaceholder(/Buscar por O.S. ou cliente/i).fill('OS-2');
    await page.waitForTimeout(1000);
    
    // Verifica se a tabela contém a nota filtrada (usa exact para não pegar OS-20, OS-21, etc)
    const table = page.locator('table');
    await expect(table.getByText('OS-2', { exact: true })).toBeVisible({ timeout: 15000 });
  });

  test('deve abrir detalhes de uma nota ao clicar na linha', async ({ page }) => {
    await page.goto('/notas-entrada');
    await ensureHydrated(page);
    
    // Busca para facilitar o clique
    await page.getByPlaceholder(/Buscar por O.S. ou cliente/i).fill('OS-2');
    await page.waitForTimeout(1000);
    
    // Clica na linha da OS-2
    await page.getByText('OS-2', { exact: true }).click();
    
    // O título do modal é sr-only, então precisamos de includeHidden ou buscar pelo texto visível no cabeçalho
    // Vamos buscar o texto da OS que aparece no cabeçalho do modal (não sr-only)
    const modal = page.locator('[role="dialog"]');
    await expect(modal.getByText('OS-2', { exact: true })).toBeVisible();
  });

  test('deve cadastrar uma nova ordem de serviço', async ({ page }) => {
    await page.goto('/notas-entrada');
    await ensureHydrated(page);
    
    await page.getByRole('button', { name: /Nova O.S./i }).click();
    
    // Preenche Número da OS
    await page.locator('input[type="number"]').first().fill('8888');
    
    // Preenche DATA
    await page.getByRole('button', { name: /Selecionar data/i }).click();
    await page.locator('button:has-text("20")').first().click();

    // Seleciona Cliente
    await page.getByPlaceholder(/Digite o nome, documento ou telefone/i).fill('José');
    await page.getByRole('button', { name: /José Carlos Mendes/i }).click();
    
    // Dados do Veículo
    await page.getByPlaceholder(/Ex: Gol 1.0 8v/i).fill('Uno Mille');
    
    // Adiciona Item
    await page.getByPlaceholder(/Descrição do serviço/i).first().fill('Troca de Óleo');
    await page.locator('input[placeholder="0,00"]').first().fill('150');
    await page.locator('input[type="number"]').nth(1).fill('1');

    // Salva
    await page.getByRole('button', { name: /Salvar O.S./i }).click();

    // Verifica toast de sucesso (usa first para evitar erro de strict mode com aria-status)
    await expect(page.getByText(/criada com sucesso/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('deve editar uma ordem de serviço existente', async ({ page }) => {
    await page.goto('/notas-entrada');
    await ensureHydrated(page);
    
    // Busca nota para editar
    await page.getByPlaceholder(/Buscar por O.S. ou cliente/i).fill('OS-2');
    await page.waitForTimeout(1000);
    
    // Abre modal de edição via dropdown
    const row = page.locator('tr').filter({ hasText: /OS-2/i }).first();
    await row.getByRole('button', { name: /Mais ações/i }).click();
    await page.getByText(/Editar nota/i).click();
    
    // Altera o modelo do veículo
    const vehicleInput = page.getByPlaceholder(/Ex: Gol 1.0 8v/i);
    await vehicleInput.clear();
    await vehicleInput.fill('Gol Quadrado 1.8');
    
    // Salva
    await page.getByRole('button', { name: /Salvar alterações/i }).click();
    
    // Verifica toast de sucesso
    await expect(page.getByText(/atualizada com sucesso/i).first()).toBeVisible();
  });
});
