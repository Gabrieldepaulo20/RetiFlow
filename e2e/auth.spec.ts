import { test, expect } from '@playwright/test';
import { loginAs, clearSession, USERS } from './helpers';

test.describe('Auth — login and access control', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
  });

  test('redirects / to /login when unauthenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/login');
    await expect(page.getByText('Entrar na área do cliente')).toBeVisible();
  });

  test('redirects protected route to /login when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/login');
  });

  test('shows error for wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/e-mail/i).fill(USERS.financeiro.email);
    await page.getByLabel(/senha/i).fill('senha-errada');
    await page.getByRole('button', { name: /entrar/i }).click();
    // Toast title appears; multiple elements match the same text — first() resolves strict-mode violation
    await expect(page.getByText(/credenciais inválidas/i).first()).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('shows error for nonexistent user', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/e-mail/i).fill('nao-existe@retifica.com');
    await page.getByLabel(/senha/i).fill('demo123');
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page.getByText(/credenciais inválidas/i).first()).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('financeiro can login and reach dashboard', async ({ page }) => {
    await loginAs(page, 'financeiro');
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('admin logs in via /admin/login and reaches admin panel', async ({ page }) => {
    await loginAs(page, 'admin');
    await expect(page).toHaveURL('/admin');
    await expect(page.getByRole('heading', { name: 'Painel Administrativo' })).toBeVisible();
  });

  test('admin is blocked from client portal (/login)', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/e-mail/i).fill(USERS.admin.email);
    await page.getByLabel(/senha/i).fill(USERS.admin.password);
    await page.getByRole('button', { name: /entrar/i }).click();
    // Error: "Use a tela administrativa para acessar a área de gestão."
    await expect(page.getByText(/tela administrativa/i).first()).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('financeiro is blocked from /admin/login portal', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByLabel(/e-mail/i).fill(USERS.financeiro.email);
    await page.getByLabel(/senha/i).fill(USERS.financeiro.password);
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page.getByText(/administrador/i)).toBeVisible();
    await expect(page).toHaveURL('/admin/login');
  });

  test('logout clears session and redirects to login', async ({ page }) => {
    await loginAs(page, 'financeiro');
    await expect(page).toHaveURL('/dashboard');

    // Open user dropdown (last button in header contains avatar + name)
    await page.locator('header').getByRole('button').last().click();
    await page.getByText('Sair').click();
    await expect(page).toHaveURL('/login');

    // After logout, protected route redirects again
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/login');
  });

  test('financeiro blocked from /configuracoes (module disabled)', async ({ page }) => {
    await loginAs(page, 'financeiro');
    await page.goto('/configuracoes');
    await expect(page.getByRole('heading', { name: 'Acesso negado' })).toBeVisible();
  });

  test('financeiro blocked from /admin (role restriction)', async ({ page }) => {
    await loginAs(page, 'financeiro');
    await page.goto('/admin');
    await expect(page).not.toHaveURL('/admin');
  });
});
