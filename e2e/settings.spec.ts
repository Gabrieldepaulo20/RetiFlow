import { test, expect } from '@playwright/test';
import { loginAs, clearSession } from './helpers';

test.describe('Configurações', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, 'admin'); 
    await page.goto('/admin/configuracoes');
    await expect(page.getByRole('heading', { name: 'Configurações', exact: true })).toBeVisible();
  });

  test('navega pelas abas de configurações', async ({ page }) => {
    const tabs = [
      'Empresa',
      'Módulos',
      'Aparência',
      'Modelos',
      'Segurança',
      'Usuários'
    ];

    for (const tab of tabs) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('visualiza dados da empresa', async ({ page }) => {
    await page.getByRole('tab', { name: /empresa/i }).click();
    await expect(page.getByText('Razão Social', { exact: true })).toBeVisible();
    await expect(page.getByText('CNPJ', { exact: true })).toBeVisible();
  });
});
