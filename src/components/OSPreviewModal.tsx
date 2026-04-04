import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { IntakeNote, IntakeService, IntakeProduct } from '@/types';
import { Client } from '@/types';
import { Printer, Download, Share2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { buildCustomerAddressLabel } from '@/services/domain/customers';

interface OSPreviewModalProps {
  open: boolean;
  onClose: () => void;
  note: IntakeNote;
  client?: Client;
  services: IntakeService[];
  products: IntakeProduct[];
  accentColor?: string;
}

function OSDocumentContent({ note, client, services, products, accentColor = 'hsl(var(--primary))' }: Omit<OSPreviewModalProps, 'open' | 'onClose'>) {
  const allItems = [
    ...services.map(s => ({ qty: s.quantity, desc: s.name, unit: s.price, total: s.subtotal })),
    ...products.map(p => ({ qty: p.quantity, desc: p.name, unit: p.unitPrice, total: p.subtotal })),
  ];

  return (
    <div className="bg-white text-black p-6 text-[11px] leading-relaxed font-['Arial',sans-serif] w-full h-full flex flex-col">
      {/* Header */}
      <div className="text-center border-b-2 pb-3 mb-3" style={{ borderColor: accentColor }}>
        <h2 className="text-[15px] font-extrabold tracking-wide" style={{ color: accentColor }}>
          PREMIUM RETÍFICA DE CABEÇOTE
        </h2>
        <p className="text-[9px] text-gray-600 mt-0.5">
          Rua das Indústrias, 1200 — Distrito Industrial — São Paulo/SP — CEP 01234-567
        </p>
        <p className="text-[9px] text-gray-600">
          Tel: (11) 3456-7890 — WhatsApp: (11) 99876-5432 — contato@premiumretifica.com.br
        </p>
      </div>

      {/* OS Info */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <span className="text-[13px] font-extrabold" style={{ color: accentColor }}>O.S. {note.number}</span>
        </div>
        <div className="text-right text-[10px]">
          <p><span className="font-semibold">Data:</span> {new Date(note.createdAt).toLocaleDateString('pt-BR')}</p>
          <p><span className="font-semibold">Prazo:</span> {new Date(note.updatedAt).toLocaleDateString('pt-BR')}</p>
        </div>
      </div>

      {/* Client */}
      <div className="border rounded p-2 mb-3 text-[10px] bg-gray-50">
        <p className="font-bold text-[10px] mb-1" style={{ color: accentColor }}>DADOS DO CLIENTE</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          <p><span className="font-semibold">Nome:</span> {client?.name || '—'}</p>
          <p><span className="font-semibold">Doc:</span> {client?.docNumber || '—'}</p>
          <p className="break-words"><span className="font-semibold">Endereço:</span> {buildCustomerAddressLabel(client)}</p>
          <p><span className="font-semibold">Cidade:</span> {client?.city}/{client?.state}</p>
          <p><span className="font-semibold">Tel:</span> {client?.phone || '—'}</p>
          <p><span className="font-semibold">Email:</span> {client?.email || '—'}</p>
          {note.plate && <p><span className="font-semibold">Placa:</span> {note.plate}</p>}
          <p><span className="font-semibold">Veículo:</span> {note.vehicleModel}</p>
        </div>
      </div>

      {/* Items table */}
      <table className="w-full border-collapse mb-3 flex-1">
        <thead>
          <tr style={{ backgroundColor: accentColor }}>
            <th className="text-white text-left px-2 py-1 text-[9px] font-bold w-[40px]">QTD</th>
            <th className="text-white text-left px-2 py-1 text-[9px] font-bold">DESCRIÇÃO DOS PRODUTOS</th>
            <th className="text-white text-right px-2 py-1 text-[9px] font-bold w-[70px]">VALOR UNI.</th>
            <th className="text-white text-right px-2 py-1 text-[9px] font-bold w-[70px]">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {allItems.map((item, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-2 py-1 border-b border-gray-200 text-[10px]">{item.qty}</td>
              <td className="px-2 py-1 border-b border-gray-200 text-[10px]">{item.desc}</td>
              <td className="px-2 py-1 border-b border-gray-200 text-[10px] text-right">R$ {item.unit.toFixed(2)}</td>
              <td className="px-2 py-1 border-b border-gray-200 text-[10px] text-right font-semibold">R$ {item.total.toFixed(2)}</td>
            </tr>
          ))}
          {/* Fill empty rows to maintain structure */}
          {allItems.length < 5 && Array.from({ length: 5 - allItems.length }).map((_, i) => (
            <tr key={`empty-${i}`}>
              <td className="px-2 py-1 border-b border-gray-200 text-[10px]">&nbsp;</td>
              <td className="px-2 py-1 border-b border-gray-200 text-[10px]"></td>
              <td className="px-2 py-1 border-b border-gray-200 text-[10px]"></td>
              <td className="px-2 py-1 border-b border-gray-200 text-[10px]"></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Total */}
      <div className="flex justify-end mb-3">
        <div className="border-2 px-4 py-1.5 rounded" style={{ borderColor: accentColor }}>
          <span className="font-bold text-[12px]" style={{ color: accentColor }}>
            TOTAL GERAL: R$ {note.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Observations */}
      <div className="text-[8px] text-gray-500 mb-4 space-y-0.5">
        <p className="font-bold text-[9px] text-gray-700">Observações:</p>
        <p>1. O prazo de entrega poderá ser alterado caso seja necessário serviço adicional não previsto.</p>
        <p>2. Peças substituídas ficam à disposição do cliente por até 30 dias após a retirada.</p>
        <p>3. Garantia de 6 meses para os serviços executados conforme contrato.</p>
        {note.observations && <p className="font-semibold text-gray-700 mt-1">{note.observations}</p>}
      </div>

      {/* Signatures */}
      <div className="flex justify-between mt-auto pt-4">
        <div className="text-center w-[45%]">
          <div className="border-t border-black pt-1 text-[9px]">Vendedor</div>
        </div>
        <div className="text-center w-[45%]">
          <div className="border-t border-black pt-1 text-[9px]">Comprador</div>
        </div>
      </div>
    </div>
  );
}

export default function OSPreviewModal({ open, onClose, note, client, services, products, accentColor }: OSPreviewModalProps) {
  const { toast } = useToast();
  const lineCount = services.length + products.length;
  const isA5Dual = lineCount <= 7;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[95vw] w-full max-h-[95vh] overflow-y-auto p-0 gap-0 bg-muted/50" style={{ maxWidth: isA5Dual ? '1100px' : '700px' }}>
        <DialogHeader className="px-6 py-4 border-b bg-card sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-bold">
                Preview — {note.number}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Formato: {isA5Dual ? 'A4 Paisagem — 2 vias A5' : 'A4 Vertical'} ({lineCount} {lineCount === 1 ? 'item' : 'itens'})
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => toast({ title: 'Imprimir (mock)' })}>
                <Printer className="w-4 h-4 mr-1.5" /> Imprimir
              </Button>
              <Button variant="outline" size="sm" onClick={() => toast({ title: 'PDF baixado (mock)' })}>
                <Download className="w-4 h-4 mr-1.5" /> Baixar PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => toast({ title: 'WhatsApp (mock)' })}>
                <Share2 className="w-4 h-4 mr-1.5" /> WhatsApp
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} className="ml-1">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 flex items-center justify-center">
          {isA5Dual ? (
            /* A4 Landscape with 2 A5 side-by-side */
            <div
              className="bg-white shadow-2xl rounded-sm overflow-hidden flex"
              style={{ width: '1050px', aspectRatio: '297/210' }}
            >
              <div className="flex-1 border-r border-dashed border-gray-300">
                <OSDocumentContent note={note} client={client} services={services} products={products} accentColor={accentColor} />
              </div>
              <div className="flex-1">
                <OSDocumentContent note={note} client={client} services={services} products={products} accentColor={accentColor} />
              </div>
            </div>
          ) : (
            /* A4 Portrait single */
            <div
              className="bg-white shadow-2xl rounded-sm overflow-hidden"
              style={{ width: '595px', aspectRatio: '210/297' }}
            >
              <OSDocumentContent note={note} client={client} services={services} products={products} accentColor={accentColor} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
