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

test.describe('Usuários Mega Master no tablet', () => {
  test.use({
    viewport: { width: 1280, height: 800 },
    hasTouch: true,
  });

  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, 'admin');
    await page.evaluate(() => {
      const session = JSON.parse(
        window.localStorage.getItem('auth.session') ?? 'null',
      ) as { user?: { email?: string; name?: string } } | null;
      if (!session?.user) throw new Error('Sessão administrativa mock ausente.');
      session.user.email = 'gabrielwilliam208@gmail.com';
      session.user.name = 'Gabriel Mega Master';
      window.localStorage.setItem('auth.session', JSON.stringify(session));
    });
    await page.goto('/admin/usuarios');
  });

  test('mantém controles acessíveis com menu aberto, fechado e viewport reduzido', async ({ page }) => {
    const sidebar = page.locator('[data-layout-sidebar]');
    const paulaCard = page.locator('[data-admin-user-card="user-2"]');
    const paulaActions = page.locator('[data-admin-user-actions="user-2"]');

    await expect(page.getByRole('heading', { name: 'Usuários do Sistema' })).toBeVisible();
    await expect(sidebar).toHaveAttribute('data-sidebar-collapsed', 'true');
    expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(true);

    const assertContainedLayout = async () => {
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
      }));
      expect(dimensions.documentWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
      expect(dimensions.bodyWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);

      const actionBoxes = await paulaActions.getByRole('button').evaluateAll((buttons) => (
        buttons.map((button) => {
          const rect = button.getBoundingClientRect();
          return { left: rect.left, right: rect.right, height: rect.height };
        })
      ));
      expect(actionBoxes.length).toBe(3);
      actionBoxes.forEach((box) => expect(box.height).toBeGreaterThanOrEqual(44));
      for (let index = 1; index < actionBoxes.length; index += 1) {
        expect(actionBoxes[index].left).toBeGreaterThanOrEqual(actionBoxes[index - 1].right - 1);
      }
    };

    await assertContainedLayout();
    await page.getByRole('button', { name: 'Expandir menu administrativo' }).click();
    await expect(sidebar).toHaveAttribute('data-sidebar-collapsed', 'false');
    await assertContainedLayout();
    await page.getByRole('button', { name: 'Recolher menu administrativo' }).click();

    await paulaCard.getByRole('button', { name: 'Abrir ações de Paula Martins' }).click();
    await expect(page.getByRole('menuitem', { name: 'Configurar módulos' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Modelos e cores' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Promover para Master' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Resetar senha' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Desativar usuário' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Excluir usuário' })).toBeVisible();

    await page.setViewportSize({ width: 1024, height: 640 });
    await page.getByRole('menuitem', { name: 'Configurar módulos' }).click();
    const modulesDialog = page.getByRole('dialog', { name: 'Restrições por Usuário' });
    await expect(modulesDialog).toBeVisible();
    await expect(modulesDialog.getByRole('button', { name: 'Fechar' })).toBeVisible();
    const modulesDialogBox = await modulesDialog.boundingBox();
    expect(modulesDialogBox).not.toBeNull();
    expect(modulesDialogBox!.y + modulesDialogBox!.height).toBeLessThanOrEqual(640);
    await modulesDialog.getByRole('button', { name: 'Fechar' }).click();

    await page.getByRole('button', { name: 'Novo Usuário' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Novo Usuário do Sistema' });
    const createButton = createDialog.getByRole('button', { name: 'Criar Usuário' });
    await expect(createButton).toBeVisible();
    const createButtonBox = await createButton.boundingBox();
    expect(createButtonBox).not.toBeNull();
    expect(createButtonBox!.y + createButtonBox!.height).toBeLessThanOrEqual(640);
    await createDialog.getByRole('button', { name: 'Cancelar' }).click();

    await page.setViewportSize({ width: 700, height: 640 });
    await page.getByRole('button', { name: 'Abrir menu administrativo' }).click();
    const mobileNavigation = page.getByRole('dialog', { name: 'Menu de navegação administrativa' });
    await expect(mobileNavigation.getByRole('link', { name: 'Painel' })).toBeVisible();
    await expect(mobileNavigation.getByRole('link', { name: 'Usuários' })).toBeVisible();
    await expect(mobileNavigation.getByRole('link', { name: 'Configurações' })).toBeVisible();
  });
});
