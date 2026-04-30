import { test, expect } from '@playwright/test';
import { clearSession, loginAs } from './helpers';

test.describe('Route surface sentinels', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
  });

  test('root route goes straight to operational login without exposing a portal chooser', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL('/login');
    await expect(page.getByText('Entrar na área do cliente')).toBeVisible();
    await expect(page.getByText('Escolha o portal de acesso adequado para continuar.')).not.toBeVisible();
  });

  test('legacy unfinished portal-like URLs render 404 instead of hidden app surfaces', async ({ page }) => {
    for (const path of ['/portal', '/entrada', '/cliente']) {
      await page.goto(path);

      await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
      await expect(page.getByText('Escolha o portal de acesso adequado para continuar.')).not.toBeVisible();
      await expect(page.getByRole('link', { name: 'Ir para o login' })).toBeVisible();
    }
  });

  test('admin compatibility route redirects to the active users module for admins', async ({ page }) => {
    await loginAs(page, 'admin');

    await page.goto('/admin/clientes');

    await expect(page).toHaveURL('/admin/usuarios');
    await expect(page.getByRole('heading', { name: 'Usuários do Sistema' })).toBeVisible();
  });
});
