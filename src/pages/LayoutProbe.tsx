/**
 * Sonda de layout — rota só de desenvolvimento, nunca em produção.
 *
 * POR QUE EXISTE
 *
 * Os defeitos de responsividade que apareceram no painel Crescimento (estouro
 * horizontal, cartão colado na borda, abas com colunas vazias) não são pegos
 * por nenhum teste existente: jsdom não calcula layout, então `scrollWidth` e
 * `getBoundingClientRect` são sempre zero nos testes unitários. E o painel real
 * exige login, o que impede abrir num navegador de inspeção.
 *
 * Esta rota renderiza as abas REAIS com a fixture compartilhada, dentro da
 * MESMA cadeia de classes da casca do app (`AppLayout`), incluindo a largura
 * que a barra lateral rouba. Isso reproduz o caso que quebra de verdade:
 *
 *   O tablet tem 1280px de viewport, então as media queries `xl:` disparam —
 *   mas a barra lateral aberta come 256px, e o conteúdo real tem 1024px. Regra
 *   escrita para 1280 rodando em 1024 é a origem da maior parte dos estouros.
 *
 * COMO USAR
 *
 *   /__probe-layout             barra lateral aberta (256px), o caso pior
 *   /__probe-layout?sidebar=68  barra lateral recolhida
 *   /__probe-layout?aba=resumo    troca a aba medida
 *   /__probe-layout?aba=contatos
 *
 * A função `window.__medirEstouro()` devolve os elementos que passam da borda
 * direita do container, já ordenados pelo tamanho do estouro.
 */
import { useEffect, useMemo } from 'react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { FinancialPrivacyProvider } from '@/contexts/FinancialPrivacyProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BarraDeAbasCrescimento, ContactsTab, GoogleAdsTab, OverviewTab } from '@/pages/MarketingGrowth';
import { buildResumo } from '@/test/fixtures/marketing-resumo';

declare global {
  interface Window {
    __medirEstouro?: () => unknown;
  }
}

export default function LayoutProbe() {
  const [params] = useSearchParams();
  const larguraSidebar = Number(params.get('sidebar') ?? '256');
  const aba = params.get('aba') ?? 'google';
  const resumo = useMemo(() => buildResumo(), []);

  useEffect(() => {
    window.__medirEstouro = () => {
      const alvo = document.querySelector('[data-probe-main]');
      if (!alvo) return { erro: 'container da sonda não encontrado' };
      const limite = alvo.getBoundingClientRect();
      const culpados: { estouro: number; tag: string; classes: string; texto: string }[] = [];

      alvo.querySelectorAll<HTMLElement>('*').forEach((el) => {
        const caixa = el.getBoundingClientRect();
        if (caixa.width === 0 && caixa.height === 0) return;
        const estouro = Math.round(caixa.right - limite.right);
        if (estouro <= 1) return;

        // Só interessa quem estoura sem que um ancestral role por conta própria:
        // tabela larga dentro de `overflow-x-auto` é intencional.
        let no: HTMLElement | null = el.parentElement;
        let contido = false;
        while (no && no !== alvo) {
          const ox = getComputedStyle(no).overflowX;
          if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') { contido = true; break; }
          no = no.parentElement;
        }
        if (contido) return;

        culpados.push({
          estouro,
          tag: el.tagName.toLowerCase(),
          classes: el.className?.toString().slice(0, 200) ?? '',
          texto: (el.textContent ?? '').trim().slice(0, 60),
        });
      });

      return {
        viewport: document.documentElement.clientWidth,
        larguraContainer: Math.round(limite.width),
        paginaRola: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        scrollWidthPagina: document.documentElement.scrollWidth,
        culpados: culpados.sort((a, b) => b.estouro - a.estouro).slice(0, 12),
      };
    };
  }, []);

  return (
    <FinancialPrivacyProvider>
      <TooltipProvider delayDuration={150}>
        {/* Simula a barra lateral fixa, que é o que reduz a largura útil. */}
        <div className="flex min-h-screen">
          <div style={{ width: larguraSidebar }} className="shrink-0 bg-slate-900" />
          {/* Mesmas classes do <main> em AppLayout.tsx */}
          <main
            data-probe-main
            className="min-w-0 flex-1 overflow-x-hidden px-3 py-3 sm:px-4 sm:py-4 md:p-6"
          >
            {/* Espelha o container do MarketingGrowth, que não tem padding
                próprio justamente porque o <main> acima já aplica o dele. */}
            <div className="mx-auto w-full max-w-[1680px] space-y-3">
              {/*
                A barra principal entra aqui de propósito: sem ela, o teste de
                colunas media apenas as sub-abas e passava mesmo com a barra
                principal quebrada — foi o que aconteceu na primeira versão.
              */}
              <Tabs value={aba === 'resumo' ? 'visao' : aba === 'contatos' ? 'contatos' : 'google'} className="space-y-4">
                <BarraDeAbasCrescimento
                  abas={[
                    { valor: 'visao', rotulo: 'Resumo' },
                    { valor: 'google', rotulo: 'Google Ads' },
                    { valor: 'contatos', rotulo: 'Contatos' },
                  ]}
                />
                <TabsContent value="visao"><OverviewTab resumo={resumo} /></TabsContent>
                <TabsContent value="google"><GoogleAdsTab resumo={resumo} /></TabsContent>
                <TabsContent value="contatos">
                  <ContactsTab resumo={resumo} onLinked={() => {}} canManageAttribution />
                </TabsContent>
              </Tabs>
            </div>
          </main>
        </div>
      </TooltipProvider>
    </FinancialPrivacyProvider>
  );
}
