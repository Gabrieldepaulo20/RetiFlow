import { test, expect } from '@playwright/test';
import { setupE2E, ensureHydrated } from './helpers/mock-rpc';
import { STATUS_LABELS, NOTE_STATUS_ORDER } from '../../src/types';

test.describe('Módulo Kanban', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2E(page);
    await page.goto('/login');
    await ensureHydrated(page);
    await page.fill('input[type="email"]', 'financeiro@retifica.com');
    await page.fill('input[type="password"]', 'demo123');
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await ensureHydrated(page);
  });

  test('deve exibir todas as colunas esperadas', async ({ page }) => {
    await page.goto('/kanban');
    await ensureHydrated(page);

    for (const status of NOTE_STATUS_ORDER) {
      const label = STATUS_LABELS[status];
      // Verifica se o título da coluna está visível
      // O seletor busca pelo texto da label. Final statuses têm o sufixo " final" no h2.
      await expect(page.getByRole('heading', { name: label, exact: false })).toBeVisible();
    }
  });

  test('deve abrir detalhes da nota ao clicar no card', async ({ page }) => {
    await page.goto('/kanban');
    await ensureHydrated(page);

    // Espera pelo menos um card estar visível (do seed)
    const firstCard = page.locator('.group.bg-card').first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });

    const cardTitle = await firstCard.locator('p').first().textContent();
    await firstCard.click();

    // Verifica se o modal de detalhes abriu
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    if (cardTitle) {
      // O nome do cliente deve estar no título ou conteúdo do modal
      await expect(modal).toContainText(cardTitle);
    }
  });

  test('deve permitir arrastar uma nota entre colunas e atualizar o status', async ({ page }) => {
    await page.goto('/kanban');
    await ensureHydrated(page);

    // Seleciona o primeiro card da coluna "ABERTO"
    const card = page.locator('[data-rfd-droppable-id="ABERTO"] [data-rfd-draggable-id]').first();
    
    // Verifica se o card existe antes de prosseguir
    try {
      await expect(card).toBeVisible({ timeout: 15000 });
    } catch (e) {
      await page.screenshot({ path: 'test-results/kanban-error.png' });
      const url = page.url();
      throw new Error(`Card não encontrado na coluna ABERTO. URL atual: ${url}. Erro: ${e.message}`);
    }
    
    // Pega o número da nota para conferência (ex: "OS-1")
    const cardText = await card.locator('span.tabular-nums').first().textContent();
    const handle = card.locator('svg.lucide-grip-vertical').locator('xpath=..');
    
    // Alvo é a zona de drop da coluna destino (EM_ANALISE)
    const emAnaliseColumn = page.locator('[data-rfd-droppable-id="EM_ANALISE"]');
    
    // Hover para garantir que o handle apareça (mesmo que opacity-0, ele deve estar lá)
    await handle.hover();
    
    const handleBox = await handle.boundingBox();
    const destBox = await emAnaliseColumn.boundingBox();

    if (handleBox && destBox) {
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      // Espera o dnd reconhecer o "pick up"
      await page.waitForTimeout(200);
      
      // Move para fora do card original primeiro
      await page.mouse.move(handleBox.x + handleBox.width / 2 + 50, handleBox.y + handleBox.height / 2, { steps: 5 });
      
      // Move para o centro da coluna de destino
      await page.mouse.move(destBox.x + destBox.width / 2, destBox.y + destBox.height / 2, { steps: 20 });
      await page.waitForTimeout(200);
      await page.mouse.up();
    } else {
      await card.dragTo(emAnaliseColumn, { force: true });
    }

    // Verifica se o card agora está na coluna de destino
    // Verificamos o card PRIMEIRO, pois o toast pode ser efêmero ou demorar
    await expect(emAnaliseColumn.locator('.group.bg-card').filter({ hasText: cardText || '' })).toBeVisible({ timeout: 10000 });

    // Se o card moveu, o toast deve ter aparecido
    await expect(page.getByText(new RegExp(`${cardText}.*Em Análise`, 'i')).first()).toBeVisible();
  });
});
