import { test, expect } from '@playwright/test';
import { clearSession, loginAs } from './helpers';

test.describe('Clientes', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await loginAs(page, 'financeiro');
    await page.goto('/clientes');
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
  });

  test('lista clientes do ambiente mock', async ({ page }) => {
    await expect(page.getByRole('row', { name: /José Carlos Mendes/i })).toBeVisible();
  });

  test('cadastra cliente com CEP consultado e feedback de sucesso', async ({ page }) => {
    await page.route('https://viacep.com.br/ws/01310930/json/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          cep: '01310-930',
          logradouro: 'Avenida Paulista',
          bairro: 'Bela Vista',
          localidade: 'São Paulo',
          uf: 'SP',
        }),
      });
    });

    await page.getByRole('button', { name: /novo cliente/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: /novo cliente/i })).toBeVisible();

    await dialog.getByLabel(/nome completo/i).fill('Cliente Teste E2E');
    await dialog.getByLabel(/cpf/i).fill('11171313004');
    await dialog.getByLabel(/telefone/i).fill('11999998888');
    await dialog.getByLabel(/e-mail/i).fill('cliente.e2e@retifica.test');
    await dialog.getByRole('textbox', { name: /cep/i }).fill('01310930');
    await dialog.getByRole('button', { name: /buscar cep/i }).click();

    await expect(dialog.getByLabel(/logradouro/i)).toHaveValue(/Paulista/i);
    await dialog.getByLabel(/número/i).fill('1000');

    await dialog.getByRole('button', { name: /salvar cliente/i }).click();

    await expect(page.getByText(/cliente criado com sucesso/i).first()).toBeVisible();
    await expect(page.getByText('Cliente Teste E2E').first()).toBeVisible();
  });
});
