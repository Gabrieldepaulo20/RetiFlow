import { test, expect } from '@playwright/test';
import { setupE2E, ensureHydrated } from './helpers/mock-rpc';

// Run tests in serial mode to avoid state interference
test.describe.configure({ mode: 'serial' });

test.describe('Configurações e Perfil', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
    await setupE2E(page);
    
    // Login as Admin
    await page.goto('/admin/login');
    await ensureHydrated(page);
    await page.fill('input[type="email"]', 'admin@retifica.com');
    await page.fill('input[type="password"]', 'demo123');
    await page.getByRole('button', { name: /entrar/i }).click();
    
    // Wait for Admin Dashboard
    await expect(page).toHaveURL(/\/admin/);
    await ensureHydrated(page);

    // Go to settings from admin portal
    await page.goto('/admin/configuracoes');
    await ensureHydrated(page);
    await page.waitForTimeout(1500); 
  });

  test('deve navegar entre as abas de configurações', async ({ page }) => {
    // Empresa (default)
    await expect(page.getByTestId('card-title-empresa')).toBeVisible();

    // Módulos
    await page.getByTestId('tab-modulos').click();
    await expect(page.getByText('Controle de Módulos por Perfil')).toBeVisible();

    // Aparência
    await page.getByTestId('tab-aparencia').click();
    await expect(page.getByText('Tema e Cores')).toBeVisible();

    // Modelos
    await page.getByTestId('tab-modelos').click();
    await expect(page.getByText('Modelos da O.S.')).toBeVisible();

    // Segurança
    await page.getByTestId('tab-seguranca').click();
    await expect(page.getByText('Alterar Senha')).toBeVisible();

    // Usuários
    await page.getByTestId('tab-usuarios').click();
    await expect(page.getByText('Usuários do Sistema')).toBeVisible();
  });

  test('deve permitir alterar dados da empresa (localmente)', async ({ page }) => {
    const companyNameInput = page.locator('label:has-text("Razão Social") + input');
    await companyNameInput.fill('Nova Razão Social Teste');
    
    const fantasyNameInput = page.locator('label:has-text("Nome Fantasia") + input');
    await fantasyNameInput.fill('Novo Nome Fantasia');

    await expect(companyNameInput).toHaveValue('Nova Razão Social Teste');
    await expect(fantasyNameInput).toHaveValue('Novo Nome Fantasia');
    
    const saveButton = page.getByRole('button', { name: /Persistência em implementação/i });
    await expect(saveButton).toBeDisabled();
  });

  test('deve aplicar temas de cores', async ({ page }) => {
    await page.getByTestId('tab-aparencia').click();
    await page.waitForTimeout(1000);

    // Select "Azul Royal" theme (second preset)
    await page.getByText('Azul Royal').click();
    
    // Check for toast notification - use status role for toasts
    await expect(page.getByRole('status').getByText('Tema "Azul Royal" aplicado!').first()).toBeVisible();
  });

  test('deve visualizar modelos de O.S.', async ({ page }) => {
    await page.getByTestId('tab-modelos').click();
    await page.waitForTimeout(1000);

    // Click on preview for A5
    await page.locator('div:has-text("Formato A5 Duplo")').getByRole('button', { name: /Visualizar/i }).first().click();
    
    // Modal should open
    await expect(page.getByTestId('os-preview-title')).toBeVisible();
    await expect(page.getByText('Visualização rápida')).toBeVisible();
    
    // Close modal (use Escape if button is tricky to find or has strict mode issues)
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('os-preview-title')).not.toBeVisible();
  });
});

test.describe('Admin - Gestão de Usuários', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
    await setupE2E(page);
    
    await page.goto('/admin/login');
    await ensureHydrated(page);
    await page.fill('input[type="email"]', 'admin@retifica.com');
    await page.fill('input[type="password"]', 'demo123');
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page).toHaveURL(/\/admin/);
    await ensureHydrated(page);

    await page.goto('/admin/usuarios');
    await ensureHydrated(page);
    await page.waitForTimeout(1500);
  });

  test('deve listar usuários do sistema no módulo admin', async ({ page }) => {
    await expect(page.getByTestId('admin-users-title')).toBeVisible();
    
    // Use locator for main content to avoid sidebar conflicts
    const main = page.locator('main');
    await expect(main.getByText('Admin Master').first()).toBeVisible();
    await expect(main.getByText('Paula Martins').first()).toBeVisible();
  });

  test('deve filtrar usuários por nome', async ({ page }) => {
    await page.getByPlaceholder('Buscar por nome ou e-mail...').fill('Paula');
    await page.waitForTimeout(1000); 
    
    const main = page.locator('main');
    await expect(main.getByText('Paula Martins').first()).toBeVisible();
    // Admin Master should be hidden in main content, but might still be in sidebar
    await expect(main.getByText('Admin Master')).not.toBeVisible();
  });

  test('deve criar um novo usuário (localmente)', async ({ page }) => {
    await page.getByTestId('btn-new-user').click();
    
    await page.fill('label:has-text("Nome completo") + input', 'Usuário Teste E2E');
    await page.fill('label:has-text("E-mail") + input', 'teste_e2e@exemplo.com');
    await page.fill('label:has-text("Telefone") + input', '(11) 99999-9999');
    
    // Select role
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Financeiro' }).click();

    await page.getByRole('button', { name: /Criar Usuário/i }).click();

    // Check for success toast
    await expect(page.getByRole('status').getByText('Usuário do sistema criado').first()).toBeVisible();
    
    const main = page.locator('main');
    await expect(main.getByText('Usuário Teste E2E').first()).toBeVisible();
  });

  test('deve gerenciar módulos de um usuário', async ({ page }) => {
    // Paula Martins is user-2 in seed.ts
    await page.getByTestId('btn-modules-user-2').click();

    await expect(page.getByRole('dialog').getByText('Restrições por Usuário')).toBeVisible();
    
    const dashboardSwitch = page.getByTestId('switch-module-dashboard');
    const isChecked = await dashboardSwitch.getAttribute('aria-checked') === 'true';
    
    await dashboardSwitch.click();
    await expect(dashboardSwitch).toHaveAttribute('aria-checked', isChecked ? 'false' : 'true');

    await page.getByRole('button', { name: /Salvar/i }).click();
    await expect(page.getByRole('status').getByText('Restrições atualizadas!').first()).toBeVisible();
  });
});
