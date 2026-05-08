import { test, expect } from '@playwright/test';
import { loginAs, clearSession } from './helpers';

test.describe('Painel Admin', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, 'admin');
    await page.goto('/admin');
  });

  test('visualiza estatísticas do admin', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Painel Administrativo' })).toBeVisible();
    await expect(page.getByText('Total de Clientes', { exact: true })).toBeVisible();
    await expect(page.getByText('Clientes Ativos', { exact: true })).toBeVisible();
  });

  test('navega para gestão de usuários', async ({ page }) => {
    await page.goto('/admin/usuarios');
    await expect(page.getByRole('heading', { name: 'Usuários do Sistema' })).toBeVisible();
    await expect(page.getByRole('main').getByText('Admin Master')).toBeVisible();
  });
});
