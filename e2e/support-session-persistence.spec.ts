import { expect, test } from '@playwright/test';
import { clearSession, loginAs } from './helpers';

test.describe('Modo suporte persistente no tablet', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await clearSession(page);
    await loginAs(page, 'admin');

    await page.evaluate(() => {
      const storedAuth = JSON.parse(
        window.localStorage.getItem('auth.session') ?? 'null',
      ) as { user?: Record<string, unknown> } | null;
      if (!storedAuth?.user) throw new Error('Sessão administrativa mock ausente.');

      storedAuth.user.email = 'gabrielwilliam208@gmail.com';
      storedAuth.user.name = 'Gabriel Mega Master';
      storedAuth.user.moduleAccess = {
        admin: true,
        dashboard: true,
        clients: true,
        notes: true,
        kanban: true,
        closing: true,
        payables: true,
      };
      window.localStorage.setItem('auth.session', JSON.stringify(storedAuth));

      window.sessionStorage.setItem('support.impersonation', JSON.stringify({
        id: '11111111-1111-4111-8111-111111111111',
        actorUser: storedAuth.user,
        targetUser: {
          id: 'user-2',
          name: 'Paula Martins',
          email: 'financeiro@retifica.com',
          role: 'FINANCEIRO',
          isActive: true,
          createdAt: '2026-01-04T03:00:00.000Z',
          moduleAccess: {
            dashboard: true,
            clients: true,
            notes: true,
            kanban: true,
            closing: true,
            payables: true,
          },
        },
        reason: 'Teste de navegação persistente no tablet',
        startedAt: '2026-08-11T12:00:00.000Z',
        expiresAt: null,
      }));
    });

    await page.reload();
  });

  test('mantém a empresa em rotas, histórico e reload até clicar em sair', async ({ page }) => {
    const supportButton = page.getByRole('button', {
      name: /Suporte: Paula Martins · Sair/i,
    });

    const routes = [
      ['/dashboard', 'Dashboard'],
      ['/clientes', 'Clientes'],
      ['/notas-entrada', 'Notas de Entrada'],
      ['/kanban', 'Produção'],
      ['/fechamento', 'Fechamento Mensal'],
      ['/financeiro', 'Financeiro'],
    ] as const;

    await expect(page.locator('[data-operational-brand]')).toHaveText('Retífica Premium');
    await expect(page.locator('[data-layout-sidebar]')).toHaveAttribute('data-operational-brand-scope', 'tenant');
    await expect(page.locator('[data-layout-sidebar]')).not.toHaveClass(/gawi-sidebar-theme/);
    await expect.poll(() => page.locator('[data-layout-sidebar]').evaluate(
      (element) => getComputedStyle(element).getPropertyValue('--sidebar-background').trim(),
    )).toBe('215 32% 13%');

    for (const [path, heading] of routes) {
      await page.goto(path);
      await expect(page).toHaveURL(path);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expect(supportButton).toBeVisible();
      await expect.poll(async () => page.evaluate(() => {
        const support = JSON.parse(
          window.sessionStorage.getItem('support.impersonation') ?? 'null',
        ) as { id?: string; targetUser?: { id?: string } } | null;
        return `${support?.id ?? 'none'}:${support?.targetUser?.id ?? 'none'}`;
      })).toBe('11111111-1111-4111-8111-111111111111:user-2');
      await expect(page).not.toHaveURL(/\/admin/);
    }

    await page.goBack();
    await expect(supportButton).toBeVisible();
    await page.goForward();
    await expect(supportButton).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Financeiro' })).toBeVisible();
    await expect(supportButton).toBeVisible();

    await supportButton.click();
    await expect(page).toHaveURL('/admin/usuarios');
    await expect(page.locator('[data-layout-sidebar]')).toHaveClass(/gawi-sidebar-theme/);
    await expect(page.getByText('GAWI', { exact: true })).toBeVisible();
    await expect.poll(() => page.locator('[data-layout-sidebar]').evaluate(
      (element) => getComputedStyle(element).getPropertyValue('--sidebar-background').trim(),
    )).toBe('256 53% 27%');
    await expect.poll(async () => page.evaluate(
      () => window.sessionStorage.getItem('support.impersonation'),
    )).toBeNull();
  });
});
