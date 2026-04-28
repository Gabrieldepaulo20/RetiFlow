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

test.describe('Módulo de Clientes', () => {
  test.beforeEach(async ({ page }) => {
    // Limpa o estado apenas se necessário ou no início
    await setupE2E(page);
    await performLogin(page);
  });

  test('deve listar clientes vindos do seed', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/clientes');
    await ensureHydrated(page);
    
    // Procura na tabela (desktop)
    const table = page.locator('table');
    await expect(table.getByText(/José Carlos Mendes/i)).toBeVisible({ timeout: 15000 });
  });

  test('deve cadastrar um novo cliente com busca de CEP', async ({ page }) => {
    await page.goto('/clientes');
    await ensureHydrated(page);
    
    await page.getByRole('button', { name: /Novo Cliente/i }).click();
    await expect(page.getByRole('heading', { name: /Novo cliente/i })).toBeVisible();

    // Nome
    await page.getByLabel(/Nome completo/i).fill('Cliente Teste E2E');
    
    // Documento (Masked) - Usamos type para disparar a máscara corretamente
    await page.getByLabel(/CPF/i).type('11171313004', { delay: 50 });
    
    // Telefone
    await page.getByLabel(/Telefone/i).fill('11999998888');

    // CEP (Masked) - Dispara busca
    await page.getByRole('textbox', { name: /CEP/i }).fill('01310-930');
    await page.getByRole('button', { name: /buscar CEP/i }).click();

    // Espera preencher endereço (Av. Paulista em 01310-930)
    await expect(page.getByLabel(/Logradouro/i)).toHaveValue(/Paulista/i, { timeout: 10000 });
    
    // Número
    await page.getByLabel(/Número/i).fill('1000');
    
    await page.getByRole('button', { name: /Salvar/i }).click();

    await expect(page.getByText(/sucesso/i).first()).toBeVisible();
  });
});
