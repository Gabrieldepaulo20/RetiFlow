import { expect, test, type Page } from '@playwright/test';

/**
 * Trava de responsividade do painel Crescimento.
 *
 * POR QUE EXISTE
 *
 * O dono usa o painel num tablet de 11" em paisagem e já encontrou três vezes
 * defeitos de largura que nenhum teste pegava: rolagem horizontal na página,
 * cartão encostado na borda e abas com metade da barra vazia. Nenhum teste
 * unitário consegue pegar isso — jsdom não calcula layout, então `scrollWidth`
 * e `getBoundingClientRect` são sempre zero lá.
 *
 * Este teste roda num navegador real contra a rota `/__probe-layout`, que
 * renderiza as abas verdadeiras com fixture e simula a largura que a barra
 * lateral rouba.
 *
 * O CASO QUE QUEBRA
 *
 * O tablet tem 1280px de viewport, então as media queries `xl:` disparam — mas
 * com o menu aberto sobram 1024px de conteúdo. Regra escrita para 1280 rodando
 * em 1024 é a origem da maior parte dos estouros, e é por isso que a largura da
 * barra lateral é parâmetro do teste em vez de valor fixo.
 */

/** Larguras da barra lateral no AppLayout: aberta (w-64) e recolhida. */
const SIDEBAR_ABERTA = 256;
const SIDEBAR_RECOLHIDA = 68;

type Estouro = { estouro: number; tag: string; classes: string; texto: string };

async function medirEstouro(page: Page): Promise<{ container: number; culpados: Estouro[] }> {
  return page.evaluate(() => {
    const alvo = document.querySelector('[data-probe-main]');
    if (!alvo) throw new Error('sonda de layout não renderizou');
    const limite = alvo.getBoundingClientRect();
    const culpados: Estouro[] = [];

    alvo.querySelectorAll<HTMLElement>('*').forEach((el) => {
      const caixa = el.getBoundingClientRect();
      if (caixa.width === 0 && caixa.height === 0) return;
      const estouro = Math.round(caixa.right - limite.right);
      if (estouro <= 1) return;

      // Conteúdo largo dentro de um container que rola por conta própria é
      // intencional — tabela de 13 colunas tem que rolar. O defeito é o
      // conteúdo que escapa SEM ninguém para contê-lo.
      let no: HTMLElement | null = el.parentElement;
      while (no && no !== alvo) {
        if (getComputedStyle(no).overflowX !== 'visible') return;
        no = no.parentElement;
      }

      culpados.push({
        estouro,
        tag: el.tagName.toLowerCase(),
        classes: (el.className ?? '').toString().slice(0, 160),
        texto: (el.textContent ?? '').trim().slice(0, 50),
      });
    });

    return { container: Math.round(limite.width), culpados };
  });
}

async function abrirSonda(page: Page, aba: 'google' | 'resumo', sidebar: number) {
  await page.goto(`/__probe-layout?aba=${aba}&sidebar=${sidebar}`);
  await expect(page.locator('[data-probe-main]')).toBeVisible();
  // Só a aba Google Ads tem sub-abas; o Resumo não tem tablist nenhum.
  if (aba === 'google') await page.locator('[role="tablist"]').first().waitFor();
  // Garante que o layout assentou antes de medir caixas.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const CENARIOS = [
  { nome: 'tablet 11" paisagem, menu aberto', largura: 1280, altura: 800, sidebar: SIDEBAR_ABERTA },
  { nome: 'tablet 11" paisagem, menu recolhido', largura: 1280, altura: 800, sidebar: SIDEBAR_RECOLHIDA },
  { nome: 'notebook pequeno', largura: 1024, altura: 768, sidebar: SIDEBAR_RECOLHIDA },
] as const;

for (const cenario of CENARIOS) {
  for (const aba of ['google', 'resumo'] as const) {
    test(`aba ${aba} não estoura a largura — ${cenario.nome}`, async ({ page }) => {
      await page.setViewportSize({ width: cenario.largura, height: cenario.altura });
      await abrirSonda(page, aba, cenario.sidebar);

      const { container, culpados } = await medirEstouro(page);

      expect(container).toBeGreaterThan(0);
      expect(
        culpados,
        `Elementos passando da borda direita (container ${container}px): ` +
          JSON.stringify(culpados.slice(0, 5), null, 2),
      ).toEqual([]);
    });
  }
}

test('barra de abas usa todas as colunas que declara', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await abrirSonda(page, 'google', SIDEBAR_ABERTA);

  /*
    Regressão real: a barra principal ficou com `grid-cols-6` depois de cair de
    seis abas para três, então as abas se apertavam na metade esquerda e metade
    da barra ficava vazia. Contar colunas do grid contra o número de gatilhos
    pega exatamente esse caso.
  */
  const barras = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[role="tablist"]')).map((tl) => ({
      colunas: getComputedStyle(tl).gridTemplateColumns.split(' ').filter(Boolean).length,
      gatilhos: tl.querySelectorAll('[role="tab"]').length,
      rola: tl.scrollWidth - tl.clientWidth,
    }));
  });

  expect(barras.length).toBeGreaterThan(0);
  for (const barra of barras) {
    expect(barra.colunas, JSON.stringify(barra)).toBe(barra.gatilhos);
    expect(barra.rola, JSON.stringify(barra)).toBeLessThanOrEqual(1);
  }
});

test('no tablet nenhuma tabela obriga a arrastar para o lado', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await abrirSonda(page, 'google', SIDEBAR_ABERTA);

  /*
    Tabela larga rolando dentro do próprio quadro é aceitável em telas
    pequenas, mas não na largura que o dono usa todo dia. Aqui a exigência é
    mais rígida: na aba visível ao abrir, nada deve pedir arraste horizontal.
  */
  const rolando = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-probe-main] *'))
      .filter((el) => {
        const ox = getComputedStyle(el).overflowX;
        return (ox === 'auto' || ox === 'scroll') && el.scrollWidth - el.clientWidth > 1;
      })
      .map((el) => ({
        excesso: el.scrollWidth - el.clientWidth,
        visivel: el.clientWidth,
        rotulo: el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 40),
      })),
  );

  expect(rolando, JSON.stringify(rolando, null, 2)).toEqual([]);
});
