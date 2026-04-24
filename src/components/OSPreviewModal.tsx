import { useEffect, useMemo, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { IntakeNote, IntakeService, IntakeProduct } from '@/types';
import { Client } from '@/types';
import { Printer, Download, Share2, X, FileText } from 'lucide-react';
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const pdfDados = useMemo(
    () => buildPdfDados(note, client, services, products),
    [note, client, services, products],
  );

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoadingPreview(true);
    setPreviewError(null);

    void pdf(<NotaPDFTemplate dados={pdfDados} />)
      .toBlob()
      .then((blob) => {
        if (cancelled) return;
        const nextUrl = URL.createObjectURL(blob);
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return nextUrl;
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setPreviewError(error instanceof Error ? error.message : 'Não foi possível montar o preview da O.S.');
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });

    return () => { cancelled = true; };
  }, [open, pdfDados]);

  useEffect(() => {
    if (!open && previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [open, previewUrl]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleDownload = () => {
    if (!previewUrl) {
      toast({ title: 'PDF ainda não está pronto', variant: 'destructive' });
      return;
    }
    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = `nota-${note.number.replace(/\s+/g, '-').toLowerCase()}.pdf`;
    link.click();
  };

  const handlePrint = () => {
    if (!previewUrl) {
      toast({ title: 'PDF ainda não está pronto', variant: 'destructive' });
      return;
    }
    window.open(previewUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-w-[95vw] w-full h-[95vh] p-0 gap-0 bg-muted/50">
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
              <Button variant="outline" size="sm" onClick={handlePrint} disabled={loadingPreview || !previewUrl}>
                <Printer className="w-4 h-4 mr-1.5" /> Abrir para imprimir
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload} disabled={loadingPreview || !previewUrl}>
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

        <div className="flex-1 min-h-0 bg-muted/40">
          {loadingPreview ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <FileText className="h-8 w-8" />
              <p>Montando o template da O.S...</p>
            </div>
          ) : previewError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Não foi possível renderizar o preview.</p>
                <p className="mt-1 text-sm text-muted-foreground">{previewError}</p>
              </div>
            </div>
          ) : previewUrl ? (
            <iframe
              title={`Preview ${note.number}`}
              src={previewUrl}
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Nenhum PDF disponível para visualização.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
