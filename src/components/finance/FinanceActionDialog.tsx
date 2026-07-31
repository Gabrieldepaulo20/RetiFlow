import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  criarMovimentoManual,
  criarRecebivelManual,
  estornarMovimentoFinanceiro,
  registrarPagamentoConta,
  registrarRecebimentoFechamento,
  registrarRecebimentoManual,
  registrarRecebimentoNota,
  salvarModeloRecorrente,
  transferirContasFinanceiras,
  type CategoriaEntrada,
  type FinanceiroConta,
  type FinanceiroLancamento,
  type FinanceiroModeloRecorrente,
  type FinanceiroMovimento,
} from '@/api/supabase/financeiro';
import { FinancialValue } from '@/components/privacy/FinancialValue';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFinancialPrivacy } from '@/contexts/FinancialPrivacyContext';
import { cn } from '@/lib/utils';
import {
  PAYMENT_METHOD_LABELS,
  RECURRENCE_TYPE_LABELS,
  type PaymentMethod,
  type RecurrenceType,
} from '@/types';
import { brl, dateBR, makeIdempotencyKey, moneyInput, ORIGEM_LABELS } from './financeUi';

export type FinanceDialogKind = 'entrada' | 'liquidar' | 'transferir' | 'estornar' | 'recorrente' | null;

export function FinanceActionDialog({
  kind,
  open,
  readOnly,
  onClose,
  accounts,
  categories,
  payableCategories,
  launch,
  movement,
  model,
  onSuccess,
  onError,
}: {
  kind: FinanceDialogKind;
  open: boolean;
  readOnly: boolean;
  onClose: () => void;
  accounts: FinanceiroConta[];
  categories: CategoriaEntrada[];
  payableCategories: Array<{ id: string; name: string }>;
  launch: FinanceiroLancamento | null;
  movement: FinanceiroMovimento | null;
  model: FinanceiroModeloRecorrente | null;
  onSuccess: (title: string, description: string) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const { financialValuesHidden } = useFinancialPrivacy();
  const today = format(new Date(), 'yyyy-MM-dd');
  const defaultAccount = accounts.find((item) => item.padrao) ?? accounts[0];
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [accountId, setAccountId] = useState(defaultAccount?.id ?? '');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('PIX');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [entryTiming, setEntryTiming] = useState<'REALIZADA' | 'PREVISTA'>('REALIZADA');
  const [entryType, setEntryType] = useState<'MOVIMENTO_MANUAL' | 'APORTE' | 'REEMBOLSO' | 'AJUSTE'>('MOVIMENTO_MANUAL');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [recurrence, setRecurrence] = useState<Exclude<RecurrenceType, 'NENHUMA'>>('MENSAL');
  const [dueDay, setDueDay] = useState('10');
  const idempotencyRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (!open || readOnly) return;
    const nextAccount = accounts.find((item) => item.padrao) ?? accounts[0];
    setDescription(model?.titulo ?? launch?.descricao ?? '');
    setAmount(
      model
        ? String(model.valor).replace('.', ',')
        : launch
          ? String(Math.max(launch.aberto, 0)).replace('.', ',')
          : '',
    );
    setDate(model?.proximaCompetencia?.slice(0, 10) ?? today);
    setAccountId(launch?.contaId ?? nextAccount?.id ?? '');
    setDestinationAccountId(accounts.find((item) => item.id !== nextAccount?.id)?.id ?? '');
    setMethod(model?.formaPagamentoPrevista ?? launch?.formaPagamento ?? 'PIX');
    setCategoryId(
      model?.categoriaId
      ?? (kind === 'recorrente' ? payableCategories[0]?.id : categories[0]?.id)
      ?? '',
    );
    setEntryTiming('REALIZADA');
    setEntryType('MOVIMENTO_MANUAL');
    setNotes('');
    setReason('');
    setRecurrence(model?.recorrencia === 'NENHUMA' ? 'MENSAL' : model?.recorrencia ?? 'MENSAL');
    setDueDay(String(model?.diaVencimento ?? 10));
  }, [accounts, categories, kind, launch, model, open, payableCategories, readOnly, today]);

  useEffect(() => {
    idempotencyRef.current = null;
  }, [kind, launch?.id, model?.id, movement?.id, open]);

  const getStableIdempotencyKey = (prefix: string, numericAmount: number) => {
    const fingerprint = JSON.stringify({
      prefix,
      kind,
      launchId: launch?.id ?? null,
      launchOrigin: launch?.origem ?? null,
      launchOriginId: launch?.origemId ?? null,
      movementId: movement?.id ?? null,
      modelId: model?.id ?? null,
      description: description.trim(),
      amount: numericAmount,
      date,
      accountId,
      destinationAccountId,
      method,
      categoryId,
      entryTiming,
      entryType,
      notes: notes.trim(),
      reason: reason.trim(),
      recurrence,
      dueDay,
    });
    if (idempotencyRef.current?.fingerprint !== fingerprint) {
      idempotencyRef.current = {
        fingerprint,
        key: makeIdempotencyKey(prefix),
      };
    }
    return idempotencyRef.current.key;
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (readOnly) throw new Error('Movimentações financeiras são bloqueadas em modo suporte.');
      const numericAmount = moneyInput(amount);
      if (!kind) throw new Error('Ação financeira inválida.');
      if (numericAmount <= 0 && kind !== 'estornar') throw new Error('Informe um valor maior que zero.');

      if (kind === 'entrada') {
        if (!description.trim()) throw new Error('Informe uma descrição para a entrada.');
        if (!categoryId) throw new Error('Selecione uma categoria de entrada.');
        if (entryTiming === 'PREVISTA') {
          return criarRecebivelManual({
            descricao: description.trim(),
            valor: numericAmount,
            vencimento: date,
            competencia: date.slice(0, 7) + '-01',
            categoriaId: categoryId,
            impactaDre: entryType === 'MOVIMENTO_MANUAL',
            observacoes: notes.trim() || null,
            idempotencyKey: getStableIdempotencyKey('recebivel', numericAmount),
          });
        }
        if (!accountId) throw new Error('Selecione a conta financeira.');
        return criarMovimentoManual({
          direcao: 'ENTRADA',
          origem: entryType,
          descricao: description.trim(),
          valor: numericAmount,
          dataEfetiva: `${date}T12:00:00-03:00`,
          contaId: accountId,
          formaPagamento: method,
          categoriaEntradaId: categoryId,
          impactaDre: entryType === 'MOVIMENTO_MANUAL',
          observacoes: notes.trim() || null,
          idempotencyKey: getStableIdempotencyKey('entrada', numericAmount),
        });
      }

      if (kind === 'liquidar') {
        if (!launch?.origemId) throw new Error('Lançamento sem origem vinculada.');
        if (!accountId) throw new Error('Selecione a conta financeira.');
        const input = {
          valor: numericAmount,
          dataEfetiva: `${date}T12:00:00-03:00`,
          contaId: accountId,
          formaPagamento: method,
          observacoes: notes.trim() || null,
          idempotencyKey: getStableIdempotencyKey('liquidar', numericAmount),
        };
        if (launch.origem === 'NOTA_SERVICO') {
          return registrarRecebimentoNota({ ...input, notaId: launch.origemId });
        }
        if (launch.origem === 'FECHAMENTO') {
          return registrarRecebimentoFechamento({ ...input, fechamentoId: launch.origemId });
        }
        if (launch.origem === 'CONTA_PAGAR') {
          return registrarPagamentoConta({ ...input, contaPagarId: launch.origemId });
        }
        if (launch.origem === 'RECEBIVEL_MANUAL') {
          return registrarRecebimentoManual({
            ...input,
            recebivelManualId: launch.origemId,
            descricao: launch.descricao,
          });
        }
        throw new Error('Esta origem não aceita liquidação por esta tela.');
      }

      if (kind === 'transferir') {
        if (!accountId || !destinationAccountId) throw new Error('Selecione as duas contas.');
        if (accountId === destinationAccountId) throw new Error('A conta de destino precisa ser diferente da origem.');
        return transferirContasFinanceiras({
          contaOrigemId: accountId,
          contaDestinoId: destinationAccountId,
          valor: numericAmount,
          dataEfetiva: `${date}T12:00:00-03:00`,
          descricao: description.trim() || null,
          idempotencyKey: getStableIdempotencyKey('transferencia', numericAmount),
        });
      }

      if (kind === 'estornar') {
        if (!movement) throw new Error('Movimento não encontrado.');
        if (reason.trim().length < 5) {
          throw new Error('Informe um motivo com pelo menos 5 caracteres.');
        }
        return estornarMovimentoFinanceiro({
          movimentoId: movement.id,
          motivo: reason.trim(),
          dataEfetiva: `${date}T12:00:00-03:00`,
          idempotencyKey: getStableIdempotencyKey('estorno', numericAmount),
        });
      }

      if (kind === 'recorrente') {
        if (!description.trim()) throw new Error('Informe o nome do gasto fixo.');
        if (!categoryId) throw new Error('Selecione a categoria da saída.');
        const day = Number(dueDay);
        if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error('O dia do vencimento deve ficar entre 1 e 31.');
        return salvarModeloRecorrente({
          id: model?.id,
          titulo: description.trim(),
          categoriaId: categoryId,
          fornecedorId: model?.fornecedorId ?? null,
          fornecedorNome: model?.fornecedorNome ?? null,
          valor: numericAmount,
          recorrencia: recurrence,
          diaVencimento: day,
          competenciaInicial: `${date.slice(0, 7)}-01`,
          formaPagamentoPrevista: method,
          observacoes: notes.trim() || null,
          ativa: true,
        });
      }

      throw new Error('Ação financeira inválida.');
    },
    onSuccess: async () => {
      idempotencyRef.current = null;
      const message = {
        entrada: ['Entrada registrada', entryTiming === 'PREVISTA' ? 'O valor foi incluído no previsto.' : 'O dinheiro entrou no extrato.'],
        liquidar: [launch?.direcao === 'SAIDA' ? 'Pagamento registrado' : 'Recebimento registrado', 'O saldo aberto e o extrato foram atualizados.'],
        transferir: ['Transferência registrada', 'As duas pontas foram lançadas sem alterar o saldo consolidado.'],
        estornar: ['Estorno registrado', 'O histórico foi preservado e o saldo da obrigação foi recalculado.'],
        recorrente: [model ? 'Gasto fixo atualizado' : 'Gasto fixo salvo', 'O modelo está pronto para gerar as próximas competências.'],
      }[kind ?? 'entrada'];
      await onSuccess(message[0], message[1]);
    },
    onError,
  });

  const title = {
    entrada: 'Nova entrada',
    liquidar: launch?.direcao === 'SAIDA' ? 'Registrar pagamento' : 'Registrar recebimento',
    transferir: 'Transferir entre contas',
    estornar: 'Estornar movimento',
    recorrente: model ? 'Editar gasto fixo' : 'Novo gasto fixo',
  }[kind ?? 'entrada'];

  const submitLabel = {
    entrada: entryTiming === 'PREVISTA' ? 'Criar recebível' : 'Registrar entrada',
    liquidar: launch?.direcao === 'SAIDA' ? 'Confirmar pagamento' : 'Confirmar recebimento',
    transferir: 'Confirmar transferência',
    estornar: 'Confirmar estorno',
    recorrente: model ? 'Salvar alterações' : 'Salvar gasto fixo',
  }[kind ?? 'entrada'];

  return (
    <Dialog open={open && !readOnly} onOpenChange={(next) => !next && !mutation.isPending && onClose()}>
      <DialogContent
        className={cn(
          'flex max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-h-[calc(100dvh-2rem)]',
          kind === 'entrada'
            ? 'sm:max-w-3xl'
            : kind === 'recorrente' || kind === 'transferir'
              ? 'sm:max-w-2xl'
              : 'sm:max-w-xl',
        )}
      >
        <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-4 text-left sm:px-5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {kind === 'estornar'
              ? 'O registro original será preservado e um contramovimento ficará na auditoria.'
              : kind === 'transferir'
                ? 'A saída e a entrada são criadas juntas; o saldo consolidado não muda.'
                : 'Confira conta, data e valor antes de confirmar.'}
          </DialogDescription>
        </DialogHeader>

        <div className={cn(
          'min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5',
          kind === 'entrada' && 'md:grid md:grid-cols-6 md:gap-3 md:space-y-0',
        )}>
          {kind === 'entrada' ? (
            <div className="grid gap-4 sm:grid-cols-2 md:contents">
              <div className="space-y-2 md:col-span-3">
                <Label>Momento</Label>
                <Select value={entryTiming} onValueChange={(value) => setEntryTiming(value as 'REALIZADA' | 'PREVISTA')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REALIZADA">Realizada agora</SelectItem>
                    <SelectItem value="PREVISTA">Prevista para receber</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label>Tipo</Label>
                <Select value={entryType} onValueChange={(value) => setEntryType(value as typeof entryType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MOVIMENTO_MANUAL">Receita avulsa</SelectItem>
                    <SelectItem value="APORTE">Aporte</SelectItem>
                    <SelectItem value="REEMBOLSO">Reembolso</SelectItem>
                    <SelectItem value="AJUSTE">Ajuste</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {kind === 'recorrente' || kind === 'entrada' || kind === 'transferir' ? (
            <div className={cn('space-y-2', kind === 'entrada' && 'md:col-span-6')}>
              <Label htmlFor="finance-description">{kind === 'recorrente' ? 'Nome do gasto fixo' : 'Descrição'}</Label>
              <Input
                id="finance-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={kind === 'recorrente' ? 'Ex.: Aluguel da oficina' : 'Ex.: receita avulsa de usinagem'}
              />
            </div>
          ) : null}

          {kind === 'liquidar' && launch ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="font-semibold text-slate-900">{launch.descricao}</p>
              <p className="mt-1 text-xs text-slate-500">
                Em aberto: <FinancialValue>{brl(launch.aberto)}</FinancialValue> · {ORIGEM_LABELS[launch.origem]}
              </p>
            </div>
          ) : null}

          {kind === 'estornar' && movement ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="font-semibold text-rose-950">{movement.descricao}</p>
              <p className="mt-1 text-xs text-rose-700"><FinancialValue>{brl(movement.valor)}</FinancialValue> · {dateBR(movement.dataEfetiva)}</p>
            </div>
          ) : null}

          {kind !== 'estornar' ? (
            <div className={cn('grid gap-4 sm:grid-cols-2', kind === 'entrada' && 'md:contents')}>
              <div className={cn('space-y-2', kind === 'entrada' && 'md:col-span-3')}>
                <Label htmlFor="finance-amount">Valor</Label>
                <Input
                  id="finance-amount"
                  type={financialValuesHidden ? 'password' : 'text'}
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div className={cn('space-y-2', kind === 'entrada' && 'md:col-span-3')}>
                <Label htmlFor="finance-date">
                  {kind === 'entrada' && entryTiming === 'PREVISTA' ? 'Vencimento' : kind === 'recorrente' ? 'Competência inicial' : 'Data efetiva'}
                </Label>
                <Input id="finance-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="reverse-date">Data do estorno</Label>
              <Input id="reverse-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
          )}

          {kind === 'transferir' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Conta de origem</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{accounts.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Conta de destino</Label>
                <Select value={destinationAccountId} onValueChange={setDestinationAccountId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{accounts.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {(kind === 'liquidar' || (kind === 'entrada' && entryTiming === 'REALIZADA')) ? (
            <div className={cn('grid gap-4 sm:grid-cols-2', kind === 'entrada' && 'md:contents')}>
              <div className={cn('space-y-2', kind === 'entrada' && 'md:col-span-2')}>
                <Label>Conta financeira</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{accounts.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className={cn('space-y-2', kind === 'entrada' && 'md:col-span-2')}>
                <Label>Forma</Label>
                <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {kind === 'entrada' ? (
            <div className="space-y-2 md:col-span-2">
              <Label>Categoria de entrada</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ) : null}

          {kind === 'recorrente' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Categoria da saída</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{payableCategories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Recorrência</Label>
                <Select value={recurrence} onValueChange={(value) => setRecurrence(value as typeof recurrence)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(RECURRENCE_TYPE_LABELS)
                      .filter(([value]) => value !== 'NENHUMA')
                      .map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="finance-due-day">Dia do vencimento</Label>
                <Input id="finance-due-day" type="number" min={1} max={31} value={dueDay} onChange={(event) => setDueDay(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Forma prevista</Label>
                <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {kind === 'estornar' ? (
            <div className="space-y-2">
              <Label htmlFor="reverse-reason">Motivo obrigatório</Label>
              <Textarea
                id="reverse-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explique por que este movimento está sendo estornado."
                minLength={5}
                rows={4}
              />
              <p className="text-xs text-slate-500">Use pelo menos 5 caracteres.</p>
            </div>
          ) : kind !== 'transferir' ? (
            <div className={cn('space-y-2', kind === 'entrada' && 'md:col-span-6')}>
              <Label htmlFor="finance-notes">Observações</Label>
              <Textarea id="finance-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={kind === 'entrada' ? 2 : 3} placeholder="Informação opcional para conferência." />
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 border-t border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-5">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className={cn(kind === 'estornar' && 'bg-rose-700 hover:bg-rose-800')}
          >
            {mutation.isPending ? 'Confirmando…' : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
