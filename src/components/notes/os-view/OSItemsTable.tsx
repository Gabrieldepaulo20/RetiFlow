/**
 * Serviços e peças da O.S. numa lista única com etiqueta de tipo, como no design.
 *
 * Em telas estreitas os itens viram cartões empilhados; a grade só aparece de
 * `sm` para cima e ainda assim dentro de um container com rolagem horizontal
 * própria, para nunca empurrar largura na página.
 *
 * Os totais vêm de `note.totalServices` / `note.totalProducts` (valores do RPC),
 * não da soma das linhas — a lista pode estar carregando.
 */

import { Paperclip, Wrench } from 'lucide-react';
import type { Attachment, IntakeNote, IntakeProduct, IntakeService } from '@/types';
import { cn } from '@/lib/utils';
import { OSCard, OSCardTitle } from './OSCard';
import {
  buildOSItemRows,
  formatOSCurrency,
  formatOSQuantity,
  type OSItemKind,
  type OSItemRow,
} from './osViewModel';

const GRID = 'grid grid-cols-[minmax(0,1fr)_96px_68px_116px_124px]';

const KIND_LABEL: Record<OSItemKind, string> = {
  SERVICO: 'Serviço',
  PECA: 'Peça',
};

const KIND_DOT: Record<OSItemKind, string> = {
  SERVICO: 'bg-os-accent',
  PECA: 'bg-os-done',
};

const KIND_TAG: Record<OSItemKind, string> = {
  SERVICO: 'bg-os-accent-soft text-os-accent-ink',
  PECA: 'bg-os-done-soft text-os-done-ink',
};

function KindTag({ kind }: { kind: OSItemKind }) {
  return (
    <span
      className={cn(
        'inline-block rounded-md px-2.5 py-1 text-[11.5px] font-semibold',
        KIND_TAG[kind],
      )}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

function ItemCardMobile({ item }: { item: OSItemRow }) {
  return (
    <div className="border-b border-os-line-soft px-3 py-3 last:border-b-0">
      <div className="flex items-start gap-2.5">
        <span className={cn('mt-1.5 h-[7px] w-[7px] shrink-0 rounded-sm', KIND_DOT[item.kind])} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium text-os-ink">{item.description}</p>
          {item.detail ? <p className="mt-0.5 text-xs text-os-stone">{item.detail}</p> : null}
        </div>
        <KindTag kind={item.kind} />
      </div>
      <div className="mt-2.5 flex items-baseline justify-between gap-3 pl-[17px]">
        <span className="font-os-mono text-xs text-os-slate">
          {formatOSQuantity(item.quantity)} × {formatOSCurrency(item.unitPrice)}
        </span>
        <span className="font-os-mono text-sm font-semibold text-os-ink">
          {formatOSCurrency(item.subtotal)}
        </span>
      </div>
    </div>
  );
}

interface OSItemsTableProps {
  note: IntakeNote;
  services: IntakeService[];
  products: IntakeProduct[];
  /** Itens vindos do RPC ainda carregando — evita mostrar lista vazia como se fosse vazia de verdade. */
  loading?: boolean;
  className?: string;
}

export function OSItemsTable({ note, services, products, loading, className }: OSItemsTableProps) {
  const items = buildOSItemRows(services, products);

  return (
    <OSCard className={cn('overflow-hidden', className)}>
      <OSCardTitle
        icon={Wrench}
        className="px-4 pb-4 pt-5 sm:px-6"
        aside={
          <span className="text-[13px] text-os-stone">
            {items.length} {items.length === 1 ? 'item' : 'itens'} ·{' '}
            <span className="font-semibold text-os-ink">
              {services.length} {services.length === 1 ? 'serviço' : 'serviços'}
            </span>{' '}
            e{' '}
            <span className="font-semibold text-os-ink">
              {products.length} {products.length === 1 ? 'peça' : 'peças'}
            </span>
          </span>
        }
      >
        Serviços e peças
      </OSCardTitle>

      {loading ? (
        <p className="border-t border-os-line-soft px-4 py-8 text-center text-sm text-os-stone sm:px-6">
          Carregando itens…
        </p>
      ) : items.length === 0 ? (
        <p className="border-t border-os-line-soft px-4 py-8 text-center text-sm text-os-stone sm:px-6">
          Nenhum serviço ou peça lançado nesta O.S.
        </p>
      ) : (
        <>
          {/* Estreito: cartões empilhados */}
          <div className="border-t border-os-line-soft sm:hidden">
            {items.map((item) => (
              <ItemCardMobile key={item.key} item={item} />
            ))}
          </div>

          {/* Largo: grade do design, com rolagem própria */}
          <div className="hidden min-w-0 overflow-x-auto sm:block">
            <div className="min-w-[640px]">
              <div
                className={cn(
                  GRID,
                  'border-y border-os-line-soft bg-os-rail px-6 py-2.5',
                  'text-[11.5px] font-semibold uppercase tracking-[0.06em] text-os-stone',
                )}
              >
                <div>Descrição</div>
                <div>Tipo</div>
                <div className="text-right">Qtd</div>
                <div className="text-right">Valor unit.</div>
                <div className="text-right">Subtotal</div>
              </div>

              {items.map((item) => (
                <div
                  key={item.key}
                  className={cn(
                    GRID,
                    'items-center border-b border-os-line-soft px-6 py-3.5 text-[14.5px] text-os-ink last:border-b-0',
                  )}
                >
                  <div className="flex min-w-0 items-start gap-3 pr-4">
                    <span
                      className={cn('mt-1.5 h-[7px] w-[7px] shrink-0 rounded-sm', KIND_DOT[item.kind])}
                    />
                    <div className="min-w-0">
                      <span className="block break-words font-medium">{item.description}</span>
                      {item.detail ? (
                        <span className="mt-0.5 block text-xs text-os-stone">{item.detail}</span>
                      ) : null}
                    </div>
                  </div>
                  <div>
                    <KindTag kind={item.kind} />
                  </div>
                  <div className="text-right font-os-mono">{formatOSQuantity(item.quantity)}</div>
                  <div className="text-right font-os-mono text-os-slate">
                    {formatOSCurrency(item.unitPrice)}
                  </div>
                  <div className="text-right font-os-mono font-semibold">
                    {formatOSCurrency(item.subtotal)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="flex flex-wrap justify-end gap-x-10 gap-y-2 border-t border-os-line-soft bg-os-rail px-4 py-4 sm:px-6">
        <span className="flex items-baseline gap-3 text-[13.5px] text-os-slate">
          Mão de obra
          <span className="font-os-mono text-[15px] font-semibold text-os-ink">
            {formatOSCurrency(note.totalServices)}
          </span>
        </span>
        <span className="flex items-baseline gap-3 text-[13.5px] text-os-slate">
          Peças
          <span className="font-os-mono text-[15px] font-semibold text-os-ink">
            {formatOSCurrency(note.totalProducts)}
          </span>
        </span>
      </div>
    </OSCard>
  );
}

interface OSAttachmentsCardProps {
  attachments: Attachment[];
  className?: string;
}

export function OSAttachmentsCard({ attachments, className }: OSAttachmentsCardProps) {
  if (attachments.length === 0) return null;

  return (
    <OSCard className={cn('p-5 sm:px-6', className)}>
      <OSCardTitle icon={Paperclip} className="mb-3.5">
        Anexos ({attachments.length})
      </OSCardTitle>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {attachments.map((attachment) => (
          <div
            key={attachment.id}
            className="flex items-center gap-2.5 rounded-[10px] border border-os-line-soft bg-os-subtle px-3 py-2.5"
          >
            <span className="w-9 shrink-0 text-center text-[10px] font-bold uppercase text-os-fog">
              {attachment.type}
            </span>
            <span className="truncate text-xs text-os-slate">{attachment.filename}</span>
          </div>
        ))}
      </div>
    </OSCard>
  );
}
