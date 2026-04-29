import type { FechamentoDadosJson } from '@/api/supabase/fechamentos';
import { cn } from '@/lib/utils';

const MAX_ITEMS_PER_SECTION = 12;

const brl = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const chunkItems = <T,>(items: T[], size: number) => {
  if (items.length === 0) return [[]];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

interface Props {
  dados: FechamentoDadosJson;
  accentColor?: string;
}

export function ClosingHtmlPreview({ dados, accentColor = '#0f7f95' }: Props) {
  const generatedAt = new Date(dados.gerado_em).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const sections = dados.notas.flatMap((nota) => {
    const chunks = chunkItems(nota.itens, MAX_ITEMS_PER_SECTION);
    return chunks.map((itens, chunkIndex) => ({
      nota,
      itens,
      chunkIndex,
      chunksTotal: chunks.length,
    }));
  });

  return (
    <div className="mx-auto w-full max-w-[860px] space-y-4 px-3 py-4 sm:px-5 sm:py-6">
      <div className="rounded-[22px] bg-white p-5 text-slate-900 shadow-sm ring-1 ring-slate-200 sm:p-7">
        <div className="rounded-2xl p-5 text-white" style={{ background: `linear-gradient(135deg, ${accentColor}, #0f172a)` }}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-lg font-bold tracking-wide">RETÍFICA PREMIUM</p>
              <p className="mt-1 text-xs text-cyan-50">Fechamento mensal de serviços</p>
            </div>
            <div className="text-sm text-cyan-50 sm:text-right">
              <p className="font-semibold text-white">{dados.cliente.nome}</p>
              <p>Período: {dados.periodo}</p>
              <p>Emitido em: {generatedAt}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <SummaryCard label="Ordens" value={`${dados.notas.length} O.S.`} />
            <SummaryCard label="Subtotal" value={`R$ ${brl(dados.total_original)}`} />
            <SummaryCard label="Total" value={`R$ ${brl(dados.total_com_desconto)}`} strong />
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {sections.map(({ nota, itens, chunkIndex, chunksTotal }) => {
            const isContinuation = chunkIndex > 0;
            const isLastChunk = chunkIndex === chunksTotal - 1;
            const hasDiscount = nota.desconto_nota > 0;

            return (
              <section
                key={`${nota.id}-${chunkIndex}`}
                className="break-inside-avoid overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <div className="flex items-start justify-between gap-3 border-b px-4 py-3" style={{ backgroundColor: `${accentColor}12`, borderBottomColor: `${accentColor}25` }}>
                  <div className="min-w-0">
                    <p className="font-bold" style={{ color: accentColor }}>
                      {nota.os}{isContinuation ? ' · continuação' : ''}
                    </p>
                    <p className="truncate text-xs text-slate-600">{nota.veiculo || 'Veículo não informado'}</p>
                    {chunksTotal > 1 && (
                      <p className="mt-1 text-[11px] text-slate-500">Parte {chunkIndex + 1} de {chunksTotal}</p>
                    )}
                  </div>
                  <p className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold ring-1" style={{ color: accentColor, borderColor: `${accentColor}25` }}>
                    {nota.placa || 'Sem placa'}
                  </p>
                </div>

                <div className="overflow-hidden">
                  <div className="grid grid-cols-[minmax(0,1fr)_56px_88px_72px_92px] bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase text-slate-500">
                    <span>Descrição</span>
                    <span className="text-center">Qtd</span>
                    <span className="text-right">Unit.</span>
                    <span className="text-right">Desc.</span>
                    <span className="text-right">Total</span>
                  </div>
                  {itens.map((item, index) => (
                    <div
                      key={`${item.descricao}-${index}`}
                      className={cn(
                        'grid grid-cols-[minmax(0,1fr)_56px_88px_72px_92px] items-start gap-0 border-t border-slate-100 px-4 py-2 text-sm',
                        index % 2 === 1 && 'bg-slate-50/60',
                      )}
                    >
                      <span className="min-w-0 pr-3 leading-snug">{item.descricao}</span>
                      <span className="text-center tabular-nums">{item.quantidade}</span>
                      <span className="text-right tabular-nums">R$ {brl(item.preco_unitario)}</span>
                      <span className="text-right tabular-nums">{item.desconto_porcentagem > 0 ? `${item.desconto_porcentagem}%` : '-'}</span>
                      <span className="text-right font-semibold tabular-nums">R$ {brl(item.subtotal)}</span>
                    </div>
                  ))}
                </div>

                {isLastChunk ? (
                  <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    {hasDiscount && (
                      <>
                        <p><span className="text-slate-500">Subtotal:</span> R$ {brl(nota.total_original)}</p>
                        <p><span className="text-slate-500">Desconto:</span> {nota.desconto_nota}%</p>
                      </>
                    )}
                    <p className="font-bold" style={{ color: accentColor }}>Total {nota.os}: R$ {brl(nota.total_com_desconto)}</p>
                  </div>
                ) : (
                  <p className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                    Continua na próxima seção.
                  </p>
                )}
              </section>
            );
          })}
        </div>

        <div className="mt-5 flex flex-col gap-2 rounded-2xl border px-5 py-4 sm:flex-row sm:items-end sm:justify-between" style={{ backgroundColor: `${accentColor}12`, borderColor: `${accentColor}25` }}>
          <div className="text-sm text-slate-600">
            <p>{dados.notas.length} ordem{dados.notas.length !== 1 ? 's' : ''} de serviço · {dados.periodo}</p>
            {dados.total_original !== dados.total_com_desconto && (
              <p className="mt-1">Subtotal: R$ {brl(dados.total_original)} · Descontos: R$ {brl(dados.total_original - dados.total_com_desconto)}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: accentColor }}>Total geral</p>
            <p className="text-2xl font-bold" style={{ color: accentColor }}>R$ {brl(dados.total_com_desconto)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-white/95 px-4 py-3 text-cyan-900">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700/75">{label}</p>
      <p className={cn('mt-1 font-bold tabular-nums', strong ? 'text-lg' : 'text-base')}>{value}</p>
    </div>
  );
}
