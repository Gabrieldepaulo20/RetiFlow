import { test, expect } from '@playwright/test';
import { clearSession, loginAs, USERS } from './helpers';

test.describe('Access matrix sentinels', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
  });

  test('unauthenticated users are routed to the correct login portal', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/login');
    await expect(page.getByText('Entrar na área do cliente')).toBeVisible();

    await clearSession(page);
    await page.goto('/admin');
    await expect(page).toHaveURL('/admin/login');
    await expect(page.getByText('Entrar como administrador')).toBeVisible();
  });

  test('financeiro cannot access admin or disabled settings routes by direct URL', async ({ page }) => {
    await loginAs(page, 'financeiro');

    await page.goto('/admin');
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: 'Painel Administrativo' })).not.toBeVisible();

    await page.goto('/configuracoes');
    await expect(page).toHaveURL('/acesso-negado');
    await expect(page.getByRole('heading', { name: 'Acesso negado' })).toBeVisible();
    await expect(page.getByText('/configuracoes')).toBeVisible();
  });

  test('admin portal and operational portal keep separate redirect behavior', async ({ page }) => {
    await loginAs(page, 'admin');
    await expect(page).toHaveURL('/admin');
    await expect(page.getByRole('heading', { name: 'Painel Administrativo' })).toBeVisible();

    await clearSession(page);
    await page.goto('/login');
    await page.getByLabel(/e-mail/i).fill(USERS.admin.email);
    await page.getByLabel(/senha/i).fill(USERS.admin.password);
    await page.getByRole('button', { name: /entrar/i }).click();

    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Painel Administrativo' })).not.toBeVisible();
  });
});
