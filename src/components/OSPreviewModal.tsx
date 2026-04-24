import { useMemo, useState } from 'react';
import { PDFViewer, pdf } from '@react-pdf/renderer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { IntakeNote, IntakeService, IntakeProduct } from '@/types';
import { Client } from '@/types';
import { Printer, Download, Share2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { buildCustomerAddressLabel } from '@/services/domain/customers';
import { NotaPDFTemplate } from '@/components/notes/NotaPDFTemplate';
import type { NotaServicoDetalhes } from '@/api/supabase/notas';

interface OSPreviewModalProps {
  open: boolean;
  onClose: () => void;
  note: IntakeNote;
  client?: Client;
  services: IntakeService[];
  products: IntakeProduct[];
  accentColor?: string;
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

export default function OSPreviewModal({ open, onClose, note, client, services, products }: OSPreviewModalProps) {
  const { toast } = useToast();
  const [busyAction, setBusyAction] = useState<'download' | 'print' | null>(null);

  const pdfDados = useMemo(
    () => buildPdfDados(note, client, services, products),
    [note, client, services, products],
  );
  const documentNode = useMemo(() => <NotaPDFTemplate dados={pdfDados} />, [pdfDados]);

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
      <DialogContent className="max-w-[96vw] w-full h-[96vh] p-0 gap-0 bg-background overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-card sticky top-0 z-10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle className="text-lg font-bold">
                Preview — {note.number}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Esta visualização usa o mesmo template do PDF final salvo no sistema.
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

        <div className="flex-1 min-h-0 bg-zinc-100">
          <PDFViewer
            width="100%"
            height="100%"
            style={{ border: 'none' }}
            showToolbar={false}
          >
            {documentNode}
          </PDFViewer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
