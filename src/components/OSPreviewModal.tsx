import { useMemo, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { IntakeNote, IntakeProduct, IntakeService } from '@/types';
import { Client } from '@/types';
import { Download, Printer, Share2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { buildCustomerAddressLabel } from '@/services/domain/customers';
import { NotaPDFTemplate } from '@/components/notes/NotaPDFTemplate';
import type { NotaServicoDetalhes, NotaServicoDetalhesItem } from '@/api/supabase/notas';

const MAX_ROWS = 7;

const DEFAULT_OBSERVATIONS = [
  '1. Este orçamento é válido por 30 dias a partir da data de emissão.',
  '2. O prazo de entrega será combinado após aprovação do orçamento.',
  '3. Em caso de desistência após início do serviço, será cobrado o valor proporcional.',
];

interface OSPreviewModalProps {
  open: boolean;
  onClose: () => void;
  note: IntakeNote;
  client?: Client;
  services: IntakeService[];
  products: IntakeProduct[];
  accentColor?: string;
}

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
};

const splitObservations = (observacoes: string | null) => {
  const lines = observacoes
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines && lines.length > 0 ? lines : DEFAULT_OBSERVATIONS;
};

const chunkItems = <T,>(items: T[], size: number) => {
  if (items.length === 0) return [[]];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

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

function PreviewVia({ dados, itens }: { dados: NotaServicoDetalhes; itens: NotaServicoDetalhesItem[] }) {
  const { cabecalho, financeiro_servicos } = dados;
  const observations = splitObservations(cabecalho.observacoes);
  const paddingRows = Math.max(0, MAX_ROWS - itens.length);

  return (
    <section className="flex h-full w-1/2 flex-col p-5 font-sans text-[13px] leading-snug text-neutral-950">
      <div className="flex shrink-0 items-stretch bg-[#e6e6e6] p-[5px]">
        <div className="flex w-1/2 flex-col items-center justify-center p-[10px] text-center">
          <div className="mb-[5px] h-[28px]" />
          <h2 className="m-0 text-[22px] font-bold leading-tight">PREMIUM</h2>
          <p className="m-0 text-[14px] text-neutral-700">RETÍFICA DE CABEÇOTE</p>
        </div>
        <div className="flex w-1/2 flex-col items-center justify-center border-l border-[#cfcfcf] p-[10px] text-center text-[13px] text-neutral-700">
          <p className="my-1">Av: Fioravante Magro, 1059 – Jardim Boa Vista</p>
          <p className="my-1">Sertãozinho - SP, 14177-578</p>
          <p className="my-1">Contato: (16) 3524-4661</p>
        </div>
      </div>

      <div className="relative mt-[15px] shrink-0 border border-[#dddddd] px-[10px] pb-[6px] pt-[36px]">
        <div className="absolute inset-x-0 top-0 flex items-center justify-around bg-[#dcdcdc] px-[10px] py-1 text-center text-neutral-700">
          <div>
            <strong>O.S:</strong>
            <span className="ml-2 inline-block w-[90px] rounded-full border border-[#cccccc] bg-white px-[10px] py-1 text-center font-bold">
              {cabecalho.os_numero}
            </span>
          </div>
          <div>
            <strong>Data:</strong>
            <span className="ml-2 inline-block w-[90px] rounded-full border border-[#cccccc] bg-white px-[10px] py-1 text-center font-bold">
              {formatDate(cabecalho.data_criacao)}
            </span>
          </div>
          <div>
            <strong>Prazo:</strong>
            <span className="ml-2 inline-block w-[90px] rounded-full border border-[#cccccc] bg-white px-[10px] py-1 text-center font-bold">
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

      <div className="my-[15px] flex-1 overflow-hidden">
        <table className="h-full w-full table-fixed border-collapse border border-[#dddddd]">
          <colgroup>
            <col className="w-[10%]" />
            <col className="w-[57%]" />
            <col className="w-[18%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr className="bg-[#efefef]">
              <th className="border border-[#d0d0d0] px-1 py-[5px] text-center text-[12px] font-bold">QTD.</th>
              <th className="border border-[#d0d0d0] px-1 py-[5px] text-center text-[12px] font-bold">DESCRIÇÃO DOS PRODUTOS</th>
              <th className="border border-[#d0d0d0] px-1 py-[5px] text-center text-[12px] font-bold">VALOR UNI.</th>
              <th className="border border-[#d0d0d0] px-1 py-[5px] text-center text-[12px] font-bold">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => (
              <tr key={item.id_rel}>
                <td className="h-[21px] border border-[#dddddd] px-1 py-[3px] text-center">{item.quantidade}</td>
                <td className="h-[21px] border border-[#dddddd] px-1 py-[3px]">{item.descricao}</td>
                <td className="h-[21px] border border-[#dddddd] px-1 py-[3px] text-right">R$ {formatCurrency(item.preco_unitario)}</td>
                <td className="h-[21px] border border-[#dddddd] px-1 py-[3px] text-right">R$ {formatCurrency(item.subtotal_item)}</td>
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
              <td className="rounded border border-[#d0d0d0] bg-[#efefef] px-1 py-1 text-center text-[13px]">
                R$ {formatCurrency(financeiro_servicos.total_liquido)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mb-[15px] shrink-0 border border-[#dddddd] bg-[#efefef] p-[10px] text-[11px] text-neutral-700">
        <strong>OBSERVAÇÕES:</strong>
        {observations.map((line, index) => (
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
    <div className="mx-auto flex aspect-[297/210] w-[1122px] min-w-[1122px] shrink-0 overflow-hidden bg-white shadow-sm ring-1 ring-black/10">
      <PreviewVia dados={dados} itens={itens} />
      <div className="my-5 w-px border-l border-dashed border-[#cccccc]" />
      <PreviewVia dados={dados} itens={itens} />
    </div>
  );
}

export default function OSPreviewModal({ open, onClose, note, client, services, products }: OSPreviewModalProps) {
  const { toast } = useToast();
  const [busyAction, setBusyAction] = useState<'download' | 'print' | null>(null);

  const pdfDados = useMemo(
    () => buildPdfDados(note, client, services, products),
    [note, client, services, products],
  );
  const documentNode = useMemo(() => <NotaPDFTemplate dados={pdfDados} />, [pdfDados]);
  const pages = useMemo(() => chunkItems(pdfDados.itens_servico, MAX_ROWS), [pdfDados.itens_servico]);

  const buildBlobUrl = async () => {
    const blob = await pdf(documentNode).toBlob();
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
      window.open(url, '_blank', 'noopener,noreferrer');
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

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="flex h-[96vh] w-full max-w-[96vw] flex-col gap-0 overflow-hidden bg-background p-0">
        <DialogHeader className="shrink-0 border-b bg-card px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle className="text-lg font-bold">
                Preview — {note.number}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Visualização rápida no formato final da O.S.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void handlePrint()} disabled={busyAction !== null}>
                <Printer className="w-4 h-4 mr-1.5" /> Abrir para imprimir
              </Button>
              <Button variant="outline" size="sm" onClick={() => void handleDownload()} disabled={busyAction !== null}>
                <Download className="w-4 h-4 mr-1.5" /> Baixar PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => toast({ title: 'Compartilhamento em implementação' })}>
                <Share2 className="w-4 h-4 mr-1.5" /> Compartilhar
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} className="ml-1">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto bg-zinc-100 p-4">
          <div className="flex min-h-full w-max min-w-full flex-col items-center justify-start gap-4">
            {pages.map((items, index) => (
              <PreviewPage key={`${pdfDados.cabecalho.id_nota}-${index}`} dados={pdfDados} itens={items} />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
