import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, FileText, Loader2, Paperclip, Upload } from 'lucide-react';
import {
  getFinanceiroAnexoSignedUrl,
  getFinanceiroAnexos,
  insertFinanceiroAnexo,
  uploadFinanceiroComprovante,
  type FinanceiroMovimento,
} from '@/api/supabase/financeiro';
import { FinancialValue } from '@/components/privacy/FinancialValue';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { PAYMENT_METHOD_LABELS } from '@/types';
import { brl, dateBR, ORIGEM_LABELS } from './financeUi';

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = /\.(pdf|jpe?g|png|webp)$/i;
const MAX_FILE_SIZE = 15 * 1024 * 1024;

function detail(label: string, value: string | null | undefined) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value || '—'}</dd>
    </div>
  );
}

export function FinanceMovementDetailsDialog({
  movement,
  open,
  readOnly,
  onClose,
}: {
  movement: FinanceiroMovimento | null;
  open: boolean;
  readOnly: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const attachmentsQuery = useQuery({
    queryKey: ['financeiro', 'anexos', movement?.id],
    queryFn: () => getFinanceiroAnexos(movement?.id ?? ''),
    enabled: open && Boolean(movement?.id),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (readOnly) throw new Error('Uploads financeiros são bloqueados em modo suporte.');
      if (!movement) throw new Error('Movimento financeiro não encontrado.');
      if (file.size > MAX_FILE_SIZE) throw new Error('O comprovante deve ter no máximo 15 MB.');
      if (!ALLOWED_TYPES.has(file.type) && !ALLOWED_EXTENSIONS.test(file.name)) {
        throw new Error('Envie um comprovante PDF, JPG, PNG ou WebP.');
      }

      const path = await uploadFinanceiroComprovante({ movimentoId: movement.id, file });
      return insertFinanceiroAnexo({
        movimentoId: movement.id,
        nomeArquivo: file.name,
        caminho: path,
        mimeType: file.type || null,
        tamanhoBytes: file.size,
      });
    },
    onSuccess: async () => {
      if (inputRef.current) inputRef.current.value = '';
      await queryClient.invalidateQueries({ queryKey: ['financeiro', 'anexos', movement?.id] });
      toast({ title: 'Comprovante anexado', description: 'O arquivo privado foi vinculado a este movimento.' });
    },
    onError: (error) => {
      if (inputRef.current) inputRef.current.value = '';
      toast({
        title: 'Não foi possível anexar',
        description: error instanceof Error ? error.message : 'Confira o arquivo e tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const openAttachment = async (attachment: NonNullable<typeof attachmentsQuery.data>[number]) => {
    // Abra a aba durante o clique para evitar que o navegador bloqueie o popup
    // depois da espera pela URL assinada.
    const pendingWindow = window.open('', '_blank');
    if (pendingWindow) pendingWindow.opener = null;
    setOpeningId(attachment.id);
    try {
      const signedUrl = await getFinanceiroAnexoSignedUrl(attachment.caminho, {
        anexoId: attachment.id,
      });
      if (pendingWindow) {
        pendingWindow.location.href = signedUrl;
      } else {
        window.open(signedUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      pendingWindow?.close();
      toast({
        title: 'Não foi possível abrir o comprovante',
        description: error instanceof Error ? error.message : 'A URL temporária não pôde ser gerada.',
        variant: 'destructive',
      });
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !uploadMutation.isPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalhe do movimento</DialogTitle>
          <DialogDescription>
            Origem, responsável, histórico e comprovantes vinculados ao dinheiro movimentado.
          </DialogDescription>
        </DialogHeader>

        {movement ? (
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{movement.descricao}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {ORIGEM_LABELS[movement.origem]} · {movement.direcao === 'ENTRADA' ? 'Entrada' : 'Saída'}
                  </p>
                </div>
                <p className={movement.direcao === 'ENTRADA' ? 'font-display text-xl font-bold text-emerald-700' : 'font-display text-xl font-bold text-rose-700'}>
                  <FinancialValue>{movement.direcao === 'ENTRADA' ? '+' : '−'} {brl(movement.valor)}</FinancialValue>
                </p>
              </div>
              <dl className="mt-4 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-3">
                {detail('Data efetiva', dateBR(movement.dataEfetiva))}
                {detail('Conta', movement.contaNome)}
                {detail('Forma', movement.formaPagamento ? PAYMENT_METHOD_LABELS[movement.formaPagamento] : null)}
                {detail('Responsável', movement.usuarioNome)}
                {detail('Criado em', dateBR(movement.createdAt))}
                {detail('ID da origem', movement.origemId)}
              </dl>
            </section>

            {movement.estornado || movement.motivoEstorno ? (
              <section className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                <p className="font-semibold">Movimento estornado</p>
                <p className="mt-1 text-xs leading-relaxed">{movement.motivoEstorno || 'Motivo não informado.'}</p>
                {movement.estornoDeId ? <p className="mt-2 text-[11px] text-rose-700">Referência: {movement.estornoDeId}</p> : null}
              </section>
            ) : null}

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Paperclip className="h-4 w-4" aria-hidden="true" />
                    Comprovantes
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">Arquivos privados abertos por URL temporária.</p>
                </div>
                {!readOnly ? (
                  <div>
                    <Label htmlFor="finance-proof" className="sr-only">Anexar comprovante</Label>
                    <input
                      ref={inputRef}
                      id="finance-proof"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                      className="sr-only"
                      disabled={uploadMutation.isPending}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) uploadMutation.mutate(file);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 gap-2 rounded-xl"
                      disabled={uploadMutation.isPending}
                      onClick={() => inputRef.current?.click()}
                    >
                      {uploadMutation.isPending
                        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        : <Upload className="h-4 w-4" aria-hidden="true" />}
                      {uploadMutation.isPending ? 'Enviando…' : 'Anexar'}
                    </Button>
                  </div>
                ) : null}
              </div>

              {attachmentsQuery.isLoading ? (
                <div className="flex h-20 items-center justify-center text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Carregando comprovantes
                </div>
              ) : attachmentsQuery.isError ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  Não foi possível carregar os comprovantes deste movimento.
                </p>
              ) : attachmentsQuery.data?.length ? (
                <div className="space-y-2">
                  {attachmentsQuery.data.map((attachment) => (
                    <div key={attachment.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                        <FileText className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{attachment.nomeArquivo}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {dateBR(attachment.createdAt)}
                          {attachment.usuarioNome ? ` · ${attachment.usuarioNome}` : ''}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 rounded-lg text-xs"
                        disabled={openingId === attachment.id}
                        onClick={() => void openAttachment(attachment)}
                      >
                        {openingId === attachment.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          : <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
                        Abrir
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">
                  Nenhum comprovante anexado.
                </div>
              )}
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
