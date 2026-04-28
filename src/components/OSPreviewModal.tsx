import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { IntakeNote, IntakeProduct, IntakeService } from '@/types';
import { Client } from '@/types';
import { Download, Printer, Share2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { buildCustomerAddressLabel } from '@/services/domain/customers';
import { cn } from '@/lib/utils';
import type { NotaServicoDetalhes, NotaServicoDetalhesItem } from '@/api/supabase/notas';
import {
  NOTA_PRINT_LONG_MAX_ROWS,
  NOTA_PRINT_MAX_ROWS,
  NOTA_PRINT_OBSERVATIONS,
  NOTA_PRINT_PAGE,
  NOTA_PRINT_PORTRAIT_PAGE,
} from '@/components/notes/notaPrintLayout';
import { openPdfPrintDialog } from '@/lib/printPdf';
import { shareOrCopyText } from '@/lib/browserShare';
import { generateNotaPdfBlob } from '@/lib/notaPdf';

const MAX_ROWS = NOTA_PRINT_MAX_ROWS;
const LONG_MAX_ROWS = NOTA_PRINT_LONG_MAX_ROWS;

interface OSPreviewModalProps {
  open: boolean;
  onClose: () => void;
  note: IntakeNote;
  client?: Client;
  services: IntakeService[];
  products: IntakeProduct[];
  accentColor?: string;
  dados?: NotaServicoDetalhes | null;
  loadingDados?: boolean;
}

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
};

const chunkItems = <T,>(items: T[], size: number) => {
  if (items.length === 0) return [[]];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

function buildPdfDados(
  note: IntakeNote,
  client: Client | undefined,
  services: IntakeService[],
  products: IntakeProduct[],
): NotaServicoDetalhes {
  const itens_servico = [
    ...services.map((service, index) => ({
      id_rel: `service-${service.id ?? index}`,
      sku: index + 1,
      descricao: service.name,
      detalhes: null,
      quantidade: service.quantity,
      preco_unitario: service.price,
      desconto_porcentagem: service.discount || 0,
      subtotal_item: service.subtotal,
    })),
    ...products.map((product, index) => ({
      id_rel: `product-${product.id ?? index}`,
      sku: services.length + index + 1,
      descricao: product.name,
      detalhes: null,
      quantidade: product.quantity,
      preco_unitario: product.unitPrice,
      desconto_porcentagem: 0,
      subtotal_item: product.subtotal,
    })),
  ];

  return {
    cabecalho: {
      id_nota: note.id,
      os_numero: note.number,
      prazo: note.deadline ?? '',
      defeito: note.complaint,
      observacoes: note.observations || null,
      data_criacao: note.createdAt,
      finalizado_em: note.finalizedAt ?? null,
      total: note.totalAmount,
      total_servicos: note.totalServices,
      total_produtos: note.totalProducts,
      criado_por_usuario: note.createdByUserId || null,
      pdf_url: null,
      cliente: {
        id: client?.id ?? note.clientId,
        nome: client?.name ?? 'Cliente',
        documento: client?.docNumber ?? '',
        endereco: buildCustomerAddressLabel(client),
        cep: client?.cep ?? null,
        cidade: client?.city ?? null,
        telefone: client?.phone ?? null,
        email: client?.email ?? null,
      },
      veiculo: {
        id: `vehicle-${note.id}`,
        modelo: note.vehicleModel,
        placa: note.plate ?? '',
        km: note.km,
        motor: note.engineType,
      },
      status: {
        id: 0,
        nome: note.status,
        index: 0,
        tipo_status: note.status === 'FINALIZADO' ? 'fechado' : 'ativo',
      },
    },
    itens_servico,
    notas_compra_vinculadas: [],
    financeiro_servicos: {
      total_bruto: note.totalAmount,
      total_liquido: note.totalAmount,
    },
  };
}

function PreviewField({ label, value }: { label: string; value?: string | null }) {
  return (
    <span className="mr-2 inline">
      <strong>{label}:</strong> {value?.trim() ? value : '—'}
    </span>
  );
}

function PreviewVia({
  dados,
  itens,
  maxRows = MAX_ROWS,
  fullPage = false,
}: {
  dados: NotaServicoDetalhes;
  itens: NotaServicoDetalhesItem[];
  maxRows?: number;
  fullPage?: boolean;
}) {
  const { cabecalho, financeiro_servicos } = dados;
  const paddingRows = Math.max(0, maxRows - itens.length);

  return (
    <section
      className={cn(
        'flex h-full flex-col font-sans leading-snug text-neutral-950',
        fullPage ? 'w-full p-[24px] text-[14px]' : 'w-1/2 p-[18px] text-[13px]',
      )}
    >
      <div className="flex shrink-0 items-stretch bg-[#e6e6e6] p-1">
        <div className="flex w-1/2 flex-col items-center justify-center p-2.5 text-center">
          <div className="mb-1 h-5" />
          <h2 className="m-0 text-[21px] font-bold leading-tight">PREMIUM</h2>
          <p className="m-0 text-[14px] text-neutral-700">RETÍFICA DE CABEÇOTE</p>
        </div>
        <div className="flex w-1/2 flex-col items-center justify-center border-l border-[#cfcfcf] p-2.5 text-center text-[13px] text-neutral-700">
          <p className="my-0.5">Av: Fioravante Magro, 1059 – Jardim Boa Vista</p>
          <p className="my-0.5">Sertãozinho - SP, 14177-578</p>
          <p className="my-0.5">Contato: (16) 3524-4661</p>
        </div>
      </div>

      <div className="relative mt-3 shrink-0 border border-[#dddddd] px-2.5 pb-1.5 pt-[34px]">
        <div className="absolute inset-x-0 top-0 grid grid-cols-3 items-center bg-[#dcdcdc] px-2.5 py-1 text-center text-neutral-700">
          <div className="whitespace-nowrap">
            <strong className="mr-1.5">O.S:</strong>
            <span className="inline-block min-w-[82px] rounded-full border border-[#cccccc] bg-white px-2.5 py-1 text-center font-bold">
              {cabecalho.os_numero}
            </span>
          </div>
          <div className="whitespace-nowrap">
            <strong className="mr-1.5">Data:</strong>
            <span className="inline-block min-w-[90px] rounded-full border border-[#cccccc] bg-white px-2.5 py-1 text-center font-bold">
              {formatDate(cabecalho.data_criacao)}
            </span>
          </div>
          <div className="whitespace-nowrap">
            <strong className="mr-1.5">Prazo:</strong>
            <span className="inline-block min-w-[90px] rounded-full border border-[#cccccc] bg-white px-2.5 py-1 text-center font-bold">
              {formatDate(cabecalho.prazo)}
            </span>
          </div>
        </div>

        <div className="mb-[3px] flex flex-wrap gap-x-[7px] gap-y-[3px]">
          <PreviewField label="Cliente" value={cabecalho.cliente.nome} />
        </div>
        <div className="mb-[3px] flex flex-wrap gap-x-[7px] gap-y-[3px]">
          <PreviewField label="Documento" value={cabecalho.cliente.documento} />
          <PreviewField label="Endereço" value={cabecalho.cliente.endereco} />
        </div>
        <div className="mb-[3px] flex flex-wrap gap-x-[7px] gap-y-[3px]">
          <PreviewField label="CEP" value={cabecalho.cliente.cep} />
          <PreviewField label="Cidade" value={cabecalho.cliente.cidade} />
          <PreviewField label="Placa" value={cabecalho.veiculo.placa} />
          <PreviewField label="Veículo" value={cabecalho.veiculo.modelo} />
        </div>
        <div className="flex flex-wrap gap-x-[7px] gap-y-[3px]">
          <PreviewField label="Email" value={cabecalho.cliente.email} />
          <PreviewField label="Telefone" value={cabecalho.cliente.telefone} />
        </div>
      </div>

      <div className="my-3 flex-1 overflow-hidden">
        <table className="h-full w-full table-fixed border-collapse border border-[#dddddd]">
          <colgroup>
            <col className="w-[10%]" />
            <col className="w-[52%]" />
            <col className="w-[19%]" />
            <col className="w-[19%]" />
          </colgroup>
          <thead>
            <tr className="bg-[#efefef]">
              <th className="border border-[#d0d0d0] px-1 py-[5px] text-center text-[12px] font-bold">QTD.</th>
              <th className="border border-[#d0d0d0] px-1 py-[5px] text-center text-[12px] font-bold">DESCRIÇÃO DOS PRODUTOS</th>
              <th className="border border-[#d0d0d0] px-1 py-[5px] text-center text-[11px] font-bold">VALOR UNI.</th>
              <th className="border border-[#d0d0d0] px-1 py-[5px] text-center text-[11px] font-bold">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => (
              <tr key={item.id_rel}>
                <td className="h-[21px] border border-[#dddddd] px-1 py-[3px] text-center">{item.quantidade}</td>
                <td className="h-[21px] border border-[#dddddd] px-1 py-[3px]">{item.descricao}</td>
                <td className="h-[21px] whitespace-nowrap border border-[#dddddd] px-1.5 py-[3px] text-right text-[12px]">R$ {formatCurrency(item.preco_unitario)}</td>
                <td className="h-[21px] whitespace-nowrap border border-[#dddddd] px-1.5 py-[3px] text-right text-[12px]">R$ {formatCurrency(item.subtotal_item)}</td>
              </tr>
            ))}
            {Array.from({ length: paddingRows }).map((_, index) => (
              <tr key={`empty-${index}`}>
                <td className="h-[21px] border border-[#eeeeee]">&nbsp;</td>
                <td className="h-[21px] border border-[#eeeeee]" />
                <td className="h-[21px] border border-[#eeeeee]" />
                <td className="h-[21px] border border-[#eeeeee]" />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[#f5f5f5] font-bold">
              <td colSpan={3} className="border-t border-[#dddddd] px-[10px] py-1 text-right text-[13px]">
                TOTAL GERAL
              </td>
              <td className="whitespace-nowrap rounded border border-[#d0d0d0] bg-[#efefef] px-1.5 py-1 text-center text-[12px]">
                R$ {formatCurrency(financeiro_servicos.total_liquido)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mb-3 shrink-0 border border-[#dddddd] bg-[#efefef] p-2.5 text-[11px] text-neutral-700">
        <strong>OBSERVAÇÕES:</strong>
        {NOTA_PRINT_OBSERVATIONS.map((line, index) => (
          <p key={`${line}-${index}`} className="my-[5px]">
            {line}
          </p>
        ))}
      </div>

      <div className="flex shrink-0 justify-evenly gap-5 pt-[10px] text-center text-[12px]">
        <div className="w-[250px]">
          <div className="border-t border-black" />
          <p className="mt-[5px]">Assinatura Vendedor</p>
        </div>
        <div className="w-[250px]">
          <div className="border-t border-black" />
          <p className="mt-[5px]">Assinatura Comprador</p>
        </div>
      </div>
    </section>
  );
}

function PreviewPage({ dados, itens }: { dados: NotaServicoDetalhes; itens: NotaServicoDetalhesItem[] }) {
  return (
    <div
      className="mx-auto flex shrink-0 overflow-hidden bg-white shadow-sm ring-1 ring-black/10"
      style={{
        width: NOTA_PRINT_PAGE.width,
        height: NOTA_PRINT_PAGE.height,
      }}
    >
      <PreviewVia dados={dados} itens={itens} />
      <div className="my-5 w-px border-l border-dashed border-[#cccccc]" />
      <PreviewVia dados={dados} itens={itens} />
    </div>
  );
}

function PreviewPortraitPage({ dados, itens }: { dados: NotaServicoDetalhes; itens: NotaServicoDetalhesItem[] }) {
  return (
    <div
      className="mx-auto flex shrink-0 overflow-hidden bg-white shadow-sm ring-1 ring-black/10"
      style={{
        width: NOTA_PRINT_PORTRAIT_PAGE.width,
        height: NOTA_PRINT_PORTRAIT_PAGE.height,
      }}
    >
      <PreviewVia dados={dados} itens={itens} maxRows={LONG_MAX_ROWS} fullPage />
    </div>
  );
}

export default function OSPreviewModal({
  open,
  onClose,
  note,
  client,
  services,
  products,
  dados,
  loadingDados = false,
}: OSPreviewModalProps) {
  const { toast } = useToast();
  const [busyAction, setBusyAction] = useState<'download' | 'print' | null>(null);
  const [previewViewportRef, previewViewportSize] = useElementSize<HTMLDivElement>();

  const pdfDados = useMemo(
    () => dados ?? buildPdfDados(note, client, services, products),
    [dados, note, client, services, products],
  );
  const usePortraitLayout = pdfDados.itens_servico.length > MAX_ROWS;
  const pageLayout = usePortraitLayout ? NOTA_PRINT_PORTRAIT_PAGE : NOTA_PRINT_PAGE;
  const pageMaxRows = usePortraitLayout ? LONG_MAX_ROWS : MAX_ROWS;
  const pages = useMemo(() => chunkItems(pdfDados.itens_servico, pageMaxRows), [pageMaxRows, pdfDados.itens_servico]);
  const previewScale = useMemo(() => {
    if (!previewViewportSize.width || !previewViewportSize.height) return 1;

    const availableWidth = previewViewportSize.width - pageLayout.viewportPadding;
    const availableHeight = previewViewportSize.height - pageLayout.viewportPadding;
    const scale = Math.min(
      availableWidth / pageLayout.width,
      availableHeight / pageLayout.height,
      1,
    );

    return Math.max(pageLayout.minScale, Number(scale.toFixed(3)));
  }, [pageLayout, previewViewportSize.height, previewViewportSize.width]);

  const scaledPageStyle = useMemo<CSSProperties>(() => ({
    width: pageLayout.width * previewScale,
    height: pageLayout.height * previewScale,
  }), [pageLayout.height, pageLayout.width, previewScale]);

  const buildBlobUrl = async () => {
    const blob = await generateNotaPdfBlob(pdfDados);
    return URL.createObjectURL(blob);
  };

  const handleDownload = async () => {
    setBusyAction('download');
    try {
      const url = await buildBlobUrl();
      const link = document.createElement('a');
      link.href = url;
      link.download = `nota-${note.number.replace(/\s+/g, '-').toLowerCase()}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast({
        title: 'Não foi possível gerar o PDF',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handlePrint = async () => {
    setBusyAction('print');
    try {
      const url = await buildBlobUrl();
      openPdfPrintDialog(url, `O.S. ${note.number}`);
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (error) {
      toast({
        title: 'Não foi possível abrir para impressão',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleShare = async () => {
    try {
      const result = await shareOrCopyText({
        title: `O.S. ${note.number}`,
        text: `O.S. ${note.number} - ${client?.name ?? 'cliente'} - Total R$ ${formatCurrency(note.totalAmount)}`,
        url: window.location.href,
      });

      if (result === 'copied') {
        toast({ title: 'Link copiado', description: 'As informações da O.S. foram copiadas para a área de transferência.' });
      } else if (result === 'unsupported') {
        toast({
          title: 'Compartilhamento indisponível',
          description: 'Este navegador não permite compartilhar nem copiar automaticamente.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast({
        title: 'Não foi possível compartilhar',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="flex h-[96dvh] max-h-[96dvh] w-full max-w-[98vw] flex-col gap-0 overflow-hidden bg-background p-0 [&>button]:right-3 [&>button]:top-3">
        <DialogHeader className="shrink-0 border-b bg-card px-4 py-2.5 pr-14 sm:px-5 sm:pr-16">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <DialogTitle className="text-lg font-bold">
                Preview — {note.number}
              </DialogTitle>
              <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                {usePortraitLayout
                  ? `Formato A4 vertical — ${pages.length} página(s), conforme quantidade de serviços.`
                  : 'Visualização rápida no formato final da O.S.'}
              </p>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-end">
              <Button variant="outline" size="sm" onClick={() => void handlePrint()} disabled={busyAction !== null}>
                <Printer className="w-4 h-4 mr-1.5" /> Abrir para imprimir
              </Button>
              <Button variant="outline" size="sm" onClick={() => void handleDownload()} disabled={busyAction !== null}>
                <Download className="w-4 h-4 mr-1.5" /> Baixar PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => void handleShare()}>
                <Share2 className="w-4 h-4 mr-1.5" /> Compartilhar
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div ref={previewViewportRef} className="min-h-0 flex-1 overflow-auto bg-zinc-100 p-2 sm:p-3">
          {loadingDados && !dados ? (
            <div className="flex min-h-full items-center justify-center text-sm font-medium text-muted-foreground">
              Carregando serviços da O.S...
            </div>
          ) : (
            <div className="flex min-h-full w-full flex-col items-center justify-start gap-3">
              {pages.map((items, index) => (
                <div key={`${pdfDados.cabecalho.id_nota}-${index}`} style={scaledPageStyle}>
                  <div
                    className="origin-top-left"
                    style={{
                      transform: `scale(${previewScale})`,
                      width: pageLayout.width,
                      height: pageLayout.height,
                    }}
                  >
                    {usePortraitLayout
                      ? <PreviewPortraitPage dados={pdfDados} itens={items} />
                      : <PreviewPage dados={pdfDados} itens={items} />
                    }
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
