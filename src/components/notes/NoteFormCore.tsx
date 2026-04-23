import { useState, useMemo, useEffect, useRef } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  Plus,
  Trash2,
  User,
  Car,
  Wrench,
  FileText,
  DollarSign,
  CalendarDays,
  AlertCircle,
  Search,
} from 'lucide-react';
import { NoteType, FINAL_STATUSES, IntakeNote } from '@/types';
import { generateId } from '@/lib/generateId';
import { cn } from '@/lib/utils';
import { buildCustomerAddressLabel } from '@/services/domain/customers';
import { formatNoteNumber, normalizeNoteNumber } from '@/lib/noteNumbers';
import { pdf } from '@react-pdf/renderer';
import { NotaPDFTemplate } from '@/components/notes/NotaPDFTemplate';
import { getNotaServicoDetalhes, uploadNotaPDF, updateNotaPdfUrl } from '@/api/supabase/notas';

const IS_REAL_AUTH = import.meta.env.VITE_AUTH_MODE === 'real';

/* ─── Shared micro-components ─── */

export function SectionHeader({
  icon,
  title,
  step,
}: {
  icon: React.ReactNode;
  title: string;
  step: number;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <span className="text-[10px] font-bold text-primary">{step}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground/60">{icon}</span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
    </div>
  );
}

export function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export function FormSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-sm p-5">
      {children}
    </div>
  );
}

const numberInputClassName =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

const validarPlaca = (p: string): boolean => {
  const s = p.replace(/[-\s]/g, '').toUpperCase();
  return /^[A-Z]{3}\d{4}$/.test(s) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(s);
};

/* ─── Item types ─── */

interface SubLine {
  id: string;
  text: string;
}

interface ServiceItem {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  subLines: SubLine[];
}

const newItem = (): ServiceItem => ({
  id: generateId('item'),
  description: '',
  quantity: '',
  unitPrice: '',
  discount: '',
  subLines: [],
});

/* ─── NoteFormCore ─── */

export interface NoteFormCoreProps {
  /** Pre-load an existing note for editing */
  editingNote?: IntakeNote;
  /** Pre-fill from URL query params or parent context */
  preClientId?: string;
  preParentId?: string;
  /** Called with the created/updated note on success */
  onSuccess: (note: IntakeNote) => void;
  /** Called when user cancels */
  onCancel: () => void;
  /**
   * When true the component renders without a page header and
   * outputs two sibling divs:
   *   1. overflow-y-auto scrollable body
   *   2. shrink-0 sticky footer with financial summary + actions
   *
   * The parent (NoteFormModal) is responsible for wrapping these in a
   * flex flex-col container (DialogContent already is one).
   */
  isModal?: boolean;
}

export default function NoteFormCore({
  editingNote,
  preClientId = '',
  preParentId = '',
  onSuccess,
  onCancel,
  isModal = false,
}: NoteFormCoreProps) {
  const {
    clients,
    notes,
    addNote,
    addService,
    addProduct,
    getServicesForNote,
    getProductsForNote,
    replaceServicesForNote,
    replaceProductsForNote,
    updateNote,
    noteCounter,
  } = useData();
  const { user } = useAuth();
  const { toast } = useToast();

  const isEditing = Boolean(editingNote);
  const isLocked = editingNote?.status === 'FINALIZADO';

  /* ── Form state ── */
  const [noteType, setNoteType] = useState<NoteType>(
    editingNote?.type ?? (preParentId ? 'COMPRA' : 'SERVICO'),
  );
  const [parentNoteId, setParentNoteId] = useState(
    editingNote?.parentNoteId ?? preParentId,
  );
  const [data, setData] = useState('');
  const [prazo, setPrazo] = useState('');
  const [clientId, setClientId] = useState(editingNote?.clientId ?? preClientId);
  const [vehicleModel, setVehicleModel] = useState('');
  const [engineType, setEngineType] = useState('Cabeçote');
  const [plate, setPlate] = useState('');
  const [km, setKm] = useState('');
  const [complaint, setComplaint] = useState('');
  const [observations, setObservations] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [noteTab, setNoteTab] = useState<'defeito' | 'obs'>('defeito');
  const [items, setItems] = useState<ServiceItem[]>([newItem()]);
  const [clientSearch, setClientSearch] = useState('');
  const [clientResultsOpen, setClientResultsOpen] = useState(false);
  const clientSearchRef = useRef<HTMLDivElement | null>(null);
  const [osNumber, setOsNumber] = useState(() => formatNoteNumber(noteCounter));
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  /* ── Populate form when editing an existing note ── */
  useEffect(() => {
    if (!editingNote) return;

    setNoteType(editingNote.type);
    setParentNoteId(editingNote.parentNoteId || '');
    setData(editingNote.createdAt.split('T')[0] || '');
    setPrazo(editingNote.updatedAt.split('T')[0] || '');
    setClientId(editingNote.clientId);
    setVehicleModel(editingNote.vehicleModel);
    setEngineType(editingNote.engineType || 'Cabeçote');
    setPlate(editingNote.plate || '');
    setKm(editingNote.km ? String(editingNote.km) : '');
    setComplaint(editingNote.complaint);
    setObservations(editingNote.observations);
    setResponsavel(editingNote.responsavel || '');

    const existingItems =
      editingNote.type === 'SERVICO'
        ? getServicesForNote(editingNote.id).map((s) => ({
            id: `svc-${s.id}`,
            description: s.name || s.description,
            quantity: String(s.quantity),
            unitPrice: String(s.price ?? 0),
            discount: '0',
            subLines: [] as SubLine[],
          }))
        : getProductsForNote(editingNote.id).map((p) => ({
            id: `prd-${p.id}`,
            description: p.name,
            quantity: String(p.quantity),
            unitPrice: String(p.unitPrice ?? 0),
            discount: '0',
            subLines: [] as SubLine[],
          }));

    setItems(existingItems.length > 0 ? existingItems : [newItem()]);
  }, [editingNote, getServicesForNote, getProductsForNote]);

  /* ── Keep osNumber in sync with noteCounter when not editing ── */
  useEffect(() => {
    if (!isEditing) {
      setOsNumber(formatNoteNumber(noteCounter));
    }
  }, [noteCounter, isEditing]);

  /* ── Auto-fill from parent note (COMPRA linked to SERVICO) ── */
  const parentNote = parentNoteId ? notes.find((n) => n.id === parentNoteId) : null;
  useEffect(() => {
    if (!parentNote) return;
    setClientId(parentNote.clientId);
    setVehicleModel(parentNote.vehicleModel);
    if (parentNote.engineType) setEngineType(parentNote.engineType);
    if (parentNote.plate) setPlate(parentNote.plate);
    if (parentNote.km) setKm(String(parentNote.km));
    if (parentNote.complaint) setComplaint(parentNote.complaint);
  }, [parentNote]);

  const selectedClient = clients.find((c) => c.id === clientId);
  const activeClients = useMemo(
    () => clients.filter((client) => client.isActive).sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );
  const filteredClients = useMemo(() => {
    const query = clientSearch.trim().toLowerCase();

    if (!query) {
      return activeClients.slice(0, 8);
    }

    return activeClients.filter((client) => {
      const haystack = [
        client.name,
        client.docNumber,
        client.phone || '',
        client.email || '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    }).slice(0, 8);
  }, [activeClients, clientSearch]);

  const serviceNotes = useMemo(
    () => notes.filter((n) => n.type === 'SERVICO' && !FINAL_STATUSES.has(n.status)),
    [notes],
  );

  useEffect(() => {
    if (selectedClient) {
      setClientSearch(selectedClient.name);
      return;
    }

    if (!clientId) {
      setClientSearch('');
    }
  }, [clientId, selectedClient]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!clientSearchRef.current?.contains(event.target as Node)) {
        setClientResultsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, []);

  /* ── Item helpers ── */
  const updateItem = (id: string, field: keyof ServiceItem, value: string | number) =>
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));

  const removeItem = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const addSubLine = (itemId: string) =>
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, subLines: [...item.subLines, { id: generateId('sub'), text: '' }] }
          : item,
      ),
    );

  const updateSubLine = (itemId: string, subId: string, text: string) =>
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, subLines: item.subLines.map((s) => (s.id === subId ? { ...s, text } : s)) }
          : item,
      ),
    );

  const removeSubLine = (itemId: string, subId: string) =>
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, subLines: item.subLines.filter((s) => s.id !== subId) }
          : item,
      ),
    );

  const itemTotals = useMemo(
    () =>
      items.map((item) => {
        const price = parseFloat(item.unitPrice) || 0;
        const disc = parseFloat(item.discount) || 0;
        const qty = parseFloat(item.quantity) || 0;
        const sub = qty * price;
        return sub - sub * (disc / 100);
      }),
    [items],
  );

  const subtotal = useMemo(() => itemTotals.reduce((a, b) => a + b, 0), [itemTotals]);
  const totalDiscount = useMemo(
    () =>
      items.reduce((acc, item) => {
        const price = parseFloat(item.unitPrice) || 0;
        const disc = parseFloat(item.discount) || 0;
        const qty = parseFloat(item.quantity) || 0;
        return acc + (qty * price * disc) / 100;
      }, 0),
    [items],
  );

  /* ── Submit ── */
  const handleSubmit = async () => {
    if (!clientId || !data) {
      toast({ title: 'Preencha cliente e data', variant: 'destructive' });
      return;
    }
    if (plate && !validarPlaca(plate)) {
      toast({ title: 'Placa inválida', description: 'Use o formato ABC-1234 ou ABC1D23 (Mercosul)', variant: 'destructive' });
      return;
    }
    if (items.every((i) => !i.description)) {
      toast({ title: 'Adicione pelo menos um item', variant: 'destructive' });
      return;
    }

    const validItems = items.filter((i) => i.description && (parseFloat(i.unitPrice) || 0) > 0);
    const totalAmount = validItems.reduce((acc, item) => {
      const price = parseFloat(item.unitPrice) || 0;
      const disc = parseFloat(item.discount) || 0;
      const qty = parseFloat(item.quantity) || 1;
      const sub = qty * price;
      return acc + sub - (sub * disc) / 100;
    }, 0);

    const payload = {
      clientId,
      status: editingNote?.status || ('ABERTO' as const),
      type: noteType,
      parentNoteId: parentNoteId || undefined,
      engineType: engineType || 'Cabeçote',
      vehicleModel: vehicleModel || '-',
      plate: plate || undefined,
      km: km ? parseInt(km) : undefined,
      complaint: complaint.trim() || validItems.map((i) => i.description).join('; '),
      observations,
      responsavel: responsavel.trim() || undefined,
      createdByUserId: editingNote?.createdByUserId || user!.id,
      totalServices: noteType === 'SERVICO' ? totalAmount : 0,
      totalProducts: noteType === 'COMPRA' ? totalAmount : 0,
      totalAmount,
    };

    const itemPayload = validItems.map((item) => {
      const price = parseFloat(item.unitPrice) || 0;
      const disc = parseFloat(item.discount) || 0;
      const qty = parseFloat(item.quantity) || 1;
      const sub = qty * price;
      const subText = item.subLines.map((s) => s.text).filter(Boolean).join('\n');
      const fullDescription = subText ? `${item.description}\n${subText}` : item.description;
      return {
        name: item.description,
        description: fullDescription,
        quantity: qty,
        unitPrice: price,
        discount: disc,
        price,
        subtotal: sub - sub * (disc / 100),
      };
    });

    if (editingNote) {
      const dbItensEdit = itemPayload.map((item) => ({
        descricao: item.name,
        quantidade: item.quantity,
        valor: item.unitPrice,
        desconto: item.discount,
        detalhes: item.description !== item.name ? item.description : undefined,
      }));
      await updateNote(editingNote.id, { ...payload, deadline: prazo || undefined }, dbItensEdit);
      if (noteType === 'SERVICO') {
        replaceServicesForNote(
          editingNote.id,
          itemPayload.map((item) => ({
            noteId: editingNote.id,
            name: item.name,
            description: item.description,
            price: item.price,
            quantity: item.quantity,
            subtotal: item.subtotal,
          })),
        );
        replaceProductsForNote(editingNote.id, []);
      } else {
        replaceProductsForNote(
          editingNote.id,
          itemPayload.map((item) => ({
            noteId: editingNote.id,
            name: item.name,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            subtotal: item.subtotal,
          })),
        );
        replaceServicesForNote(editingNote.id, []);
      }
      if (IS_REAL_AUTH) {
        setIsGeneratingPDF(true);
        try {
          const detalhes = await getNotaServicoDetalhes(editingNote.id);
          if (detalhes) {
            const blob = await pdf(<NotaPDFTemplate dados={detalhes} />).toBlob();
            const url = await uploadNotaPDF(blob, editingNote.number);
            await updateNotaPdfUrl(editingNote.id, url);
          } else {
            console.error('[PDF] getNotaServicoDetalhes retornou null para', editingNote.id);
            toast({ title: 'Aviso: PDF não gerado', description: 'Detalhes da OS não encontrados.', variant: 'destructive' });
          }
        } catch (err) {
          console.error('[PDF] Erro ao gerar/salvar PDF na edição:', err);
          toast({ title: 'Aviso: PDF não gerado', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
        } finally {
          setIsGeneratingPDF(false);
        }
      }

      toast({ title: `O.S. ${editingNote.number} atualizada com sucesso!` });
      onSuccess(editingNote);
      return;
    }

    const dbItens = itemPayload.map((item) => ({
      descricao: item.name,
      quantidade: item.quantity,
      valor: item.unitPrice,
      desconto: item.discount,
      detalhes: item.description !== item.name ? item.description : undefined,
    }));

    const note = await addNote(
      { ...payload, number: normalizeNoteNumber(osNumber), deadline: prazo || undefined },
      dbItens,
    );
    itemPayload.forEach((item) => {
      if (noteType === 'SERVICO') {
        addService({
          noteId: note.id,
          name: item.name,
          description: item.description,
          price: item.price,
          quantity: item.quantity,
          subtotal: item.subtotal,
        });
      } else {
        addProduct({
          noteId: note.id,
          name: item.name,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          subtotal: item.subtotal,
        });
      }
    });

    if (parentNoteId) {
      const parent = notes.find((n) => n.id === parentNoteId);
      if (parent && parent.status !== 'AGUARDANDO_COMPRA') {
        void updateNote(parentNoteId, { previousStatus: parent.status, status: 'AGUARDANDO_COMPRA' });
      }
    }

    // Generate and persist PDF (real mode only; non-blocking on failure)
    if (IS_REAL_AUTH) {
      setIsGeneratingPDF(true);
      try {
        const detalhes = await getNotaServicoDetalhes(note.id);
        if (detalhes) {
          const blob = await pdf(<NotaPDFTemplate dados={detalhes} />).toBlob();
          const url = await uploadNotaPDF(blob, note.number);
          await updateNotaPdfUrl(note.id, url);
        } else {
          console.error('[PDF] getNotaServicoDetalhes retornou null para', note.id);
          toast({ title: 'Aviso: PDF não gerado', description: 'Detalhes da OS não encontrados.', variant: 'destructive' });
        }
      } catch (err) {
        console.error('[PDF] Erro ao gerar/salvar PDF na criação:', err);
        toast({ title: 'Aviso: PDF não gerado', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
      } finally {
        setIsGeneratingPDF(false);
      }
    }

    toast({ title: `O.S. ${note.number} criada com sucesso!` });
    onSuccess(note);
  };

  /* ─────────────────── JSX Sections ─────────────────── */

  const section1 = (
    <FormSection>
      <SectionHeader step={1} icon={<CalendarDays className="w-3.5 h-3.5" />} title="Dados da O.S." />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Field label="Número da O.S." required>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-mono text-muted-foreground shrink-0">OS-</span>
            <Input
              type="number"
              min={0}
              max={10000}
              value={osNumber.replace(/\D/g, '')}
              onChange={(e) => setOsNumber(`OS-${e.target.value}`)}
              onBlur={() => setOsNumber(normalizeNoteNumber(osNumber))}
              disabled={isEditing}
              className={cn('font-mono', numberInputClassName)}
            />
          </div>
        </Field>
        <Field label="Tipo da Nota" required>
          <Select
            value={noteType}
            onValueChange={(v) => {
              setNoteType(v as NoteType);
              if (v === 'SERVICO') setParentNoteId('');
            }}
            disabled={isEditing}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SERVICO">Serviço</SelectItem>
              <SelectItem value="COMPRA">Compra</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Data" required>
          <DatePicker
            value={data}
            onChange={setData}
            placeholder="Selecionar data"
          />
        </Field>
        <Field label="Prazo de Entrega">
          <DatePicker
            value={prazo}
            onChange={setPrazo}
            placeholder="Definir prazo"
          />
        </Field>
      </div>

      {noteType === 'COMPRA' && (
        <div className="mt-4">
          <Field label="Vincular a O.S. de Serviço">
            <Select
              value={parentNoteId || '__none__'}
              onValueChange={(v) => setParentNoteId(v === '__none__' ? '' : v)}
              disabled={isEditing}
            >
              <SelectTrigger>
                <SelectValue placeholder="Nenhuma (independente)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhuma (independente)</SelectItem>
                {serviceNotes.map((n) => {
                  const c = clients.find((cl) => cl.id === n.clientId);
                  return (
                    <SelectItem key={n.id} value={n.id}>
                      {n.number} — {c?.name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </Field>
          {parentNote && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              Dados do veículo e cliente serão preenchidos a partir da nota pai.
            </p>
          )}
        </div>
      )}
    </FormSection>
  );

  const section2 = (
    <FormSection>
      <SectionHeader step={2} icon={<User className="w-3.5 h-3.5" />} title="Cliente" />
      <Field label="Selecionar Cliente" required>
        <div ref={clientSearchRef} className="relative">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={clientSearch}
              placeholder="Digite o nome, documento ou telefone do cliente..."
              className="h-10 pl-9"
              onFocus={() => setClientResultsOpen(true)}
              onChange={(event) => {
                setClientSearch(event.target.value);
                setClientResultsOpen(true);
                if (selectedClient && event.target.value !== selectedClient.name) {
                  setClientId('');
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setClientResultsOpen(false);
                }
              }}
            />
          </div>

          {clientResultsOpen && (
            <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-xl border border-border/70 bg-popover shadow-lg">
              <div className="border-b border-border/60 bg-muted/30 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                {clientSearch.trim()
                  ? `${filteredClients.length} cliente(s) encontrado(s)`
                  : 'Comece digitando para filtrar os clientes'}
              </div>

              {filteredClients.length > 0 ? (
                <div className="max-h-64 overflow-y-auto p-1.5">
                  {filteredClients.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => {
                        setClientId(client.id);
                        setClientSearch(client.name);
                        setClientResultsOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                        client.id === clientId ? 'bg-primary/10' : 'hover:bg-muted/70',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{client.name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {client.docNumber}
                          {client.phone ? ` · ${client.phone}` : ''}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Nenhum cliente corresponde ao que foi digitado.
                </div>
              )}
            </div>
          )}
        </div>
      </Field>
      {selectedClient && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-muted/30 rounded-lg border border-border/40">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">
              Documento
            </p>
            <p className="font-medium text-sm mt-0.5">{selectedClient.docNumber}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">
              Telefone
            </p>
            <p className="font-medium text-sm mt-0.5">{selectedClient.phone}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">
              Email
            </p>
            <p className="font-medium text-sm mt-0.5 truncate">{selectedClient.email}</p>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">
              Endereço
            </p>
            <p className="font-medium text-sm mt-0.5">
              {buildCustomerAddressLabel(selectedClient)}
            </p>
          </div>
        </div>
      )}
      <div className="mt-4">
        <Field label="Responsável / Contato">
          <Input
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            placeholder="Quem trouxe o veículo (funcionário, familiar...)"
          />
        </Field>
      </div>
    </FormSection>
  );

  const section3 = (
    <FormSection>
      <SectionHeader step={3} icon={<Car className="w-3.5 h-3.5" />} title="Veículo" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Field label="Modelo / Veículo">
          <Input
            value={vehicleModel}
            onChange={(e) => setVehicleModel(e.target.value)}
            placeholder="Ex: Gol 1.0 8v"
          />
        </Field>
        <Field label="Tipo de Motor">
          <Input
            value={engineType}
            onChange={(e) => setEngineType(e.target.value)}
            placeholder="Ex: Cabeçote"
          />
        </Field>
        <Field label="Placa">
          <Input
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            placeholder="ABC-1234"
            maxLength={8}
          />
        </Field>
        <Field label="KM Atual">
          <Input
            type="number"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            placeholder="0"
            min={0}
            className={numberInputClassName}
          />
        </Field>
      </div>
    </FormSection>
  );

  const section4 = (
    <FormSection>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-primary">4</span>
          </div>
          <div className="flex items-center gap-2">
            <Wrench className="w-3.5 h-3.5 text-muted-foreground/60" />
            <h2 className="text-sm font-semibold text-foreground">
              {noteType === 'COMPRA' ? 'Peças / Produtos' : 'Serviços / Itens'}
            </h2>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setItems((prev) => [...prev, newItem()])}
          className="gap-1.5 h-8 text-xs"
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar item
        </Button>
      </div>

      {/* ── Column headers (desktop) ── */}
      <div className="hidden sm:grid sm:grid-cols-[1fr_52px_108px_60px_96px_60px] gap-2 px-1 text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-1">
        <span>Descrição</span>
        <span className="text-center">Qtd</span>
        <span className="text-right">Valor unit.</span>
        <span className="text-center">Desc.%</span>
        <span className="text-right">Total</span>
        <span />
      </div>
      <Separator className="hidden sm:block mb-2" />

      <div className="space-y-2">
        {items.map((item) => {
          const price = parseFloat(item.unitPrice.replace(',', '.')) || 0;
          const disc  = parseFloat(item.discount.replace(',', '.'))  || 0;
          const rowTotal = (parseFloat(item.quantity) || 0) * price * (1 - disc / 100);

          return (
            <div key={item.id}>
              {/* ── Desktop row ── */}
              <div className="hidden sm:grid sm:grid-cols-[1fr_52px_108px_60px_96px_60px] gap-2 items-start">
                <Textarea
                  value={item.description}
                  onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                  placeholder={noteType === 'COMPRA' ? 'Nome da peça / produto' : 'Descrição do serviço'}
                  className="min-h-[36px] resize-none text-sm py-2 leading-snug"
                  rows={1}
                />
                <Input
                  type="number"
                  min="0"
                  value={item.quantity}
                  onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                  className={cn('h-9 text-sm text-center', numberInputClassName)}
                />
                <Input
                  inputMode="decimal"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(item.id, 'unitPrice', e.target.value)}
                  placeholder="0,00"
                  className={cn('h-9 text-sm text-right', numberInputClassName)}
                />
                <Input
                  inputMode="decimal"
                  value={item.discount}
                  onChange={(e) => updateItem(item.id, 'discount', e.target.value)}
                  placeholder="0"
                  className={cn('h-9 text-sm text-center', numberInputClassName)}
                />
                <div className="text-right text-sm font-semibold tabular-nums pt-2 pr-1">
                  R$ {rowTotal.toFixed(2)}
                </div>
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Adicionar sub-item"
                    className="w-7 h-7 text-muted-foreground hover:text-primary"
                    onClick={() => addSubLine(item.id)}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 text-muted-foreground hover:text-destructive"
                    onClick={() => removeItem(item.id)}
                    disabled={items.length <= 1}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* ── Mobile card ── */}
              <div className="sm:hidden rounded-lg border border-border/50 p-3 space-y-3 bg-muted/10">
                <div className="flex items-start justify-between gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="w-6 h-6 -mr-1 -mt-1 shrink-0 text-muted-foreground hover:text-primary ml-auto"
                    title="Adicionar sub-item"
                    onClick={() => addSubLine(item.id)}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="w-6 h-6 -mr-1 -mt-1 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeItem(item.id)}
                    disabled={items.length <= 1}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <Textarea
                  value={item.description}
                  onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                  placeholder={noteType === 'COMPRA' ? 'Nome da peça / produto' : 'Descrição do serviço'}
                  className="min-h-[36px] resize-none text-sm"
                  rows={1}
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Qtd</p>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                      className={cn('h-9 text-sm text-center', numberInputClassName)}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Valor unit.</p>
                    <Input
                      inputMode="decimal"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(item.id, 'unitPrice', e.target.value)}
                      placeholder="0,00"
                      className={cn('h-9 text-sm text-right', numberInputClassName)}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Desc.%</p>
                    <Input
                      inputMode="decimal"
                      value={item.discount}
                      onChange={(e) => updateItem(item.id, 'discount', e.target.value)}
                      placeholder="0"
                      className={cn('h-9 text-sm text-center', numberInputClassName)}
                    />
                  </div>
                </div>
                <div className="text-right text-sm font-semibold tabular-nums">
                  Total: R$ {rowTotal.toFixed(2)}
                </div>
              </div>

              {/* ── Sub-lines ── */}
              {item.subLines.length > 0 && (
                <div className="mt-1 space-y-1 pl-3 border-l-2 border-border/30 ml-2">
                  {item.subLines.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-2">
                      <Input
                        value={sub.text}
                        onChange={(e) => updateSubLine(item.id, sub.id, e.target.value)}
                        placeholder="Detalhe adicional..."
                        className="h-7 text-xs flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="w-6 h-6 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeSubLine(item.id, sub.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </FormSection>
  );

  const section5 = (
    <FormSection>
      <SectionHeader step={5} icon={<FileText className="w-3.5 h-3.5" />} title="Defeito / Observações" />
      <div className="flex border border-border/50 rounded-lg overflow-hidden mb-3 w-fit">
        <button
          type="button"
          onClick={() => setNoteTab('defeito')}
          className={cn(
            'px-4 py-1.5 text-xs font-medium transition-colors',
            noteTab === 'defeito' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50',
          )}
        >
          Defeito
        </button>
        <button
          type="button"
          onClick={() => setNoteTab('obs')}
          className={cn(
            'px-4 py-1.5 text-xs font-medium transition-colors',
            noteTab === 'obs' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50',
          )}
        >
          Observações
        </button>
      </div>
      {noteTab === 'defeito' ? (
        <Textarea
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          placeholder="Descreva o defeito ou problema relatado pelo cliente..."
          className="min-h-[80px] resize-y text-sm"
        />
      ) : (
        <Textarea
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          placeholder="Anotações internas sobre esta O.S. (não visíveis para o cliente)..."
          className="min-h-[80px] resize-y text-sm"
        />
      )}
    </FormSection>
  );

  const financialSummary = (
    <div className="flex items-center gap-2 flex-wrap">
      <DollarSign className="w-4 h-4 text-primary shrink-0" />
      <span className="text-sm font-semibold text-muted-foreground">Resumo:</span>
      {totalDiscount > 0 && (
        <span className="text-xs text-muted-foreground tabular-nums">
          Subtotal{' '}
          <span className="font-medium text-foreground">
            R$ {(subtotal + totalDiscount).toFixed(2)}
          </span>{' '}
          · Desconto{' '}
          <span className="font-medium text-destructive">
            −R$ {totalDiscount.toFixed(2)}
          </span>{' '}
          ·
        </span>
      )}
      <span className="text-lg font-bold text-primary tabular-nums">
        R$ {subtotal.toFixed(2)}
      </span>
    </div>
  );

  /* ─────────────────── Modal layout ─────────────────── */

  if (isModal) {
    return (
      <div className="relative flex flex-col flex-1 overflow-hidden">
        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {isLocked && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              O.S. finalizada — somente leitura. Reabra a nota para editar.
            </div>
          )}
          {section1}
          {section2}
          {section3}
          {section4}
          {section5}
        </div>

        {/* Generating PDF overlay */}
        {isGeneratingPDF && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm rounded-lg">
            <div className="relative w-10 h-10">
              <svg className="animate-spin w-10 h-10 text-primary" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="17" stroke="currentColor" strokeWidth="3" strokeDasharray="80 26" strokeLinecap="round" />
              </svg>
              <svg className="absolute inset-0 w-10 h-10 text-primary/30" viewBox="0 0 40 40" fill="none" style={{ animation: 'spin-ccw 1.2s linear infinite' }}>
                <circle cx="20" cy="20" r="11" stroke="currentColor" strokeWidth="2.5" strokeDasharray="40 29" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-sm font-medium text-foreground">Gerando nota de serviço...</p>
            <style>{`@keyframes spin-ccw { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }`}</style>
          </div>
        )}

        {/* Sticky footer */}
        <div className="border-t border-border/50 px-6 py-4 shrink-0 bg-muted/20">
          <div className="flex items-center justify-between flex-wrap gap-3">
            {financialSummary}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={onCancel} className="h-9 px-5" disabled={isGeneratingPDF}>
                {isLocked ? 'Fechar' : 'Cancelar'}
              </Button>
              {!isLocked && (
                <Button onClick={handleSubmit} className="h-9 px-6 font-semibold" disabled={isGeneratingPDF}>
                  {isEditing ? 'Salvar alterações' : 'Salvar O.S.'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────────── Page layout ─────────────────── */

  return (
    <div className="max-w-3xl mx-auto pb-12">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-8">
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          className="rounded-lg shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-display font-bold tracking-tight">
            {isEditing ? `Editar ${editingNote?.number}` : 'Nova Ordem de Serviço'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isEditing
              ? 'Atualize os dados da ordem de serviço.'
              : 'Preencha os dados abaixo para registrar a O.S.'}
          </p>
        </div>
      </div>

      <div className="space-y-8">
        {section1}
        {section2}
        {section3}
        {section4}
        {section5}

        {/* Sticky financial */}
        <div className="sticky bottom-4 z-10">
          <div className="bg-card border border-border/60 rounded-xl shadow-md px-5 py-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-muted-foreground">
                  Resumo Financeiro
                </span>
              </div>
              <div className="flex items-center gap-5 text-sm">
                {totalDiscount > 0 && (
                  <>
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">
                        Subtotal
                      </p>
                      <p className="font-semibold tabular-nums">
                        R$ {(subtotal + totalDiscount).toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">
                        Descontos
                      </p>
                      <p className="font-semibold text-destructive tabular-nums">
                        −&nbsp;R$ {totalDiscount.toFixed(2)}
                      </p>
                    </div>
                  </>
                )}
                <div className="text-right">
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">
                    Total Geral
                  </p>
                  <p className="text-xl font-bold text-primary tabular-nums">
                    R$ {subtotal.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel} className="px-8">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} className="px-8 font-semibold">
            {isEditing ? 'Salvar alterações' : 'Salvar O.S.'}
          </Button>
        </div>
      </div>
    </div>
  );
}
