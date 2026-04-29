import { test, expect, type Page } from '@playwright/test';
import { clearSession, loginAs } from './helpers';

async function expectRouteSurvivesRefresh(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL(path);
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Acesso negado' })).not.toBeVisible();
}

test.describe('Route refresh sentinels', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
  });

  test('financeiro remains on operational routes after refresh', async ({ page }) => {
    await loginAs(page, 'financeiro');

    for (const [path, heading] of [
      ['/dashboard', 'Dashboard'],
      ['/clientes', 'Clientes'],
      ['/notas-entrada', 'Notas de Entrada'],
      ['/contas-a-pagar', 'Contas a Pagar'],
      ['/fechamento', 'Fechamento Mensal'],
    ] as const) {
      await expectRouteSurvivesRefresh(page, path, heading);
    }
  });

  test('admin remains on admin routes after refresh', async ({ page }) => {
    await loginAs(page, 'admin');

    for (const [path, heading] of [
      ['/admin', 'Painel Administrativo'],
      ['/admin/usuarios', 'Usuários do Sistema'],
      ['/admin/configuracoes', 'Configurações'],
    ] as const) {
      await expectRouteSurvivesRefresh(page, path, heading);
    }
  });
});
