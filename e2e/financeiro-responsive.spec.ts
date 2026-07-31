import { expect, test, type Page } from '@playwright/test';
import { clearSession, loginAs } from './helpers';

async function mockFinanceiroRpcs(page: Page) {
  await page.route('https://example.supabase.co/rest/v1/rpc/**', async (route) => {
    const rpcName = new URL(route.request().url()).pathname.split('/').pop();
    const responses: Record<string, { dados: unknown; total?: number }> = {
      get_financeiro_contas: {
        dados: [{
          id_financeiro_contas: 'conta-1',
          nome: 'Caixa geral',
          tipo: 'CAIXA',
          saldo_inicial: 5000,
          saldo_inicial_confirmado: true,
          data_corte: '2026-06-01',
          ativa: true,
          padrao: true,
        }],
      },
      get_categorias_entradas: {
        dados: [{
          id_categorias_entradas: 'categoria-1',
          nome: 'Serviços',
          impacta_dre: true,
          ativa: true,
        }],
      },
      get_financeiro_resumo: {
        dados: {
          saldo_inicial_informado: true,
          saldo_anterior: 5000,
          entradas_recebidas: 1800,
          saidas_pagas: 600,
          saldo_atual: 6200,
          a_receber: 900,
          a_pagar: 300,
          saldo_projetado: 6800,
          resultado_periodo: 1200,
          faturamento_competencia: 2700,
          despesas_competencia: 900,
          resultado_competencia: 1800,
        },
      },
      get_financeiro_lancamentos: {
        total: 2,
        dados: [
          {
            id_lancamento: 'entrada-1',
            direcao: 'ENTRADA',
            origem: 'NOTA_SERVICO',
            origem_id: 'nota-1',
            origem_numero: 'OS-100',
            pessoa: 'Cliente exemplo',
            descricao: 'Recebimento de serviço',
            categoria_nome: 'Serviços',
            data_efetiva: '2026-07-15',
            previsto: 1800,
            realizado: 1800,
            aberto: 0,
            status: 'PAGO',
          },
          {
            id_lancamento: 'saida-1',
            direcao: 'SAIDA',
            origem: 'CONTA_PAGAR',
            origem_id: 'conta-pagar-1',
            pessoa: 'Fornecedor exemplo',
            descricao: 'Energia da oficina',
            categoria_nome: 'Operacional',
            data_efetiva: '2026-07-18',
            previsto: 600,
            realizado: 600,
            aberto: 0,
            status: 'PAGO',
          },
        ],
      },
      get_financeiro_extrato: {
        total: 1,
        dados: [{
          id_movimento: 'movimento-1',
          direcao: 'ENTRADA',
          origem: 'NOTA_SERVICO',
          origem_id: 'nota-1',
          descricao: 'Recebimento de serviço',
          valor: 1800,
          data_efetiva: '2026-07-15T12:00:00-03:00',
          fk_conta_financeira: 'conta-1',
          conta_nome: 'Caixa geral',
          forma_pagamento: 'PIX',
          saldo_acumulado: 6800,
        }],
      },
      get_financeiro_modelos_recorrentes: { total: 0, dados: [] },
    };
    const response = responses[rpcName ?? ''] ?? { dados: [] };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 200,
        mensagem: 'ok',
        ...response,
      }),
    });
  });
}

for (const scenario of [
  { name: 'desktop 1440x900', viewport: { width: 1440, height: 900 }, stacked: false },
  { name: 'mobile 390x844', viewport: { width: 390, height: 844 }, stacked: true },
] as const) {
  test(`Financeiro mantém layout acessível em ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize(scenario.viewport);
    await mockFinanceiroRpcs(page);
    await clearSession(page);
    await loginAs(page, 'financeiro');
    await page.goto('/financeiro');

    await expect(page.getByRole('heading', { name: 'Financeiro', level: 1 })).toBeVisible();
    await expect(page.getByText('Central Financeiro', { exact: true })).toBeVisible();
    await expect(page.getByText('Saldo atual', { exact: true })).toBeVisible();

    for (const tabName of ['Visão geral', 'Entradas', 'Saídas', 'Gastos fixos', 'DRE', 'Extrato']) {
      await expect(page.getByRole('tab', { name: tabName, exact: true })).toBeVisible();
    }

    const entradas = page.getByRole('heading', { name: 'Entradas', exact: true, level: 3 });
    const saidas = page.getByRole('heading', { name: 'Saídas', exact: true, level: 3 });
    await expect(entradas).toBeVisible();
    await expect(saidas).toBeVisible();
    const entradasBox = await entradas.boundingBox();
    const saidasBox = await saidas.boundingBox();
    expect(entradasBox).not.toBeNull();
    expect(saidasBox).not.toBeNull();

    if (scenario.stacked) {
      expect(Math.abs(saidasBox!.x - entradasBox!.x)).toBeLessThan(4);
      expect(saidasBox!.y).toBeGreaterThan(entradasBox!.y + 100);
    } else {
      expect(Math.abs(saidasBox!.y - entradasBox!.y)).toBeLessThan(4);
      expect(saidasBox!.x).toBeGreaterThan(entradasBox!.x + 300);
    }

    const overflowState = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const isContainedByHorizontalScroller = (element: HTMLElement) => {
        let ancestor = element.parentElement;
        while (ancestor && ancestor !== document.body) {
          const style = getComputedStyle(ancestor);
          const rect = ancestor.getBoundingClientRect();
          if (
            ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX)
            && rect.left >= -1
            && rect.right <= viewportWidth + 1
          ) {
            return true;
          }
          ancestor = ancestor.parentElement;
        }
        return false;
      };
      const uncontained = Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return (
            (rect.left < -1 || rect.right > viewportWidth + 1)
            && !isContainedByHorizontalScroller(element)
          );
        })
        .slice(0, 5)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          text: element.innerText?.trim().replace(/\s+/g, ' ').slice(0, 80) ?? '',
          className: element.className,
        }));
      const financeRoot = document.querySelector<HTMLElement>('[class*="overflow-x-clip"]');
      const diagnostics = {
        clientWidth: viewportWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        documentOverflowX: getComputedStyle(document.documentElement).overflowX,
        bodyOverflowX: getComputedStyle(document.body).overflowX,
        financeRootOverflowX: financeRoot ? getComputedStyle(financeRoot).overflowX : null,
        financeRootWidth: financeRoot ? Math.round(financeRoot.getBoundingClientRect().width) : null,
      };
      return { diagnostics, uncontained };
    });
    expect(overflowState.uncontained).toEqual([]);
    expect(
      overflowState.diagnostics.bodyScrollWidth,
      JSON.stringify(overflowState.diagnostics),
    ).toBeLessThanOrEqual(overflowState.diagnostics.clientWidth + 1);
    expect(overflowState.diagnostics.documentOverflowX).toBe('clip');
    expect(overflowState.diagnostics.bodyOverflowX).toBe('clip');

    const monthScroller = page.getByRole('group', { name: 'Meses do período financeiro' });
    const monthScrollState = await monthScroller.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
      return {
        clientWidth: element.clientWidth,
        scrollLeft: element.scrollLeft,
        scrollWidth: element.scrollWidth,
      };
    });
    expect(monthScrollState.scrollWidth).toBeGreaterThan(monthScrollState.clientWidth);
    expect(monthScrollState.scrollLeft).toBeGreaterThan(0);
  });
}
