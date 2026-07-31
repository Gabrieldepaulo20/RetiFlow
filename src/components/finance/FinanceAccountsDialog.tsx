import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Building2, CircleAlert, Landmark, Plus, WalletCards } from 'lucide-react';
import {
  salvarContaFinanceira,
  type FinanceiroConta,
  type FinanceiroTipoConta,
} from '@/api/supabase/financeiro';
import { FinancialValue } from '@/components/privacy/FinancialValue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import { Switch } from '@/components/ui/switch';
import { useFinancialPrivacy } from '@/contexts/FinancialPrivacyContext';
import { cn } from '@/lib/utils';
import { brl, dateBR, moneyInput } from './financeUi';

const ACCOUNT_TYPES: Array<{ value: FinanceiroTipoConta; label: string }> = [
  { value: 'CAIXA', label: 'Caixa' },
  { value: 'BANCO', label: 'Banco' },
  { value: 'PIX', label: 'PIX' },
  { value: 'CARTEIRA', label: 'Carteira' },
];

const DEFAULT_CUTOFF_DATE = '2026-06-01';

function typeLabel(type: FinanceiroTipoConta) {
  return ACCOUNT_TYPES.find((item) => item.value === type)?.label ?? 'Conta';
}

export function FinanceAccountsDialog({
  accounts,
  open,
  readOnly,
  onClose,
  onSuccess,
  onError,
}: {
  accounts: FinanceiroConta[];
  open: boolean;
  readOnly: boolean;
  onClose: () => void;
  onSuccess: (title: string, description: string) => void | Promise<void>;
  onError: (error: unknown) => void;
}) {
  const { financialValuesHidden } = useFinancialPrivacy();
  const [selectedId, setSelectedId] = useState<string | null>(accounts[0]?.id ?? null);
  const [name, setName] = useState('');
  const [type, setType] = useState<FinanceiroTipoConta>('CAIXA');
  const [openingBalance, setOpeningBalance] = useState('0,00');
  const [cutoffDate, setCutoffDate] = useState(DEFAULT_CUTOFF_DATE);
  const [isDefault, setIsDefault] = useState(false);
  const [confirmOpeningBalance, setConfirmOpeningBalance] = useState(false);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedId) ?? null,
    [accounts, selectedId],
  );
  const isNew = selectedId === null;

  useEffect(() => {
    if (!open) return;
    if (selectedId && !accounts.some((account) => account.id === selectedId)) {
      setSelectedId(accounts[0]?.id ?? null);
    }
  }, [accounts, open, selectedId]);

  useEffect(() => {
    if (!open) return;
    if (selectedAccount) {
      setName(selectedAccount.nome);
      setType(selectedAccount.tipo === 'OUTRA' ? 'CAIXA' : selectedAccount.tipo);
      setOpeningBalance(selectedAccount.saldoInicial.toFixed(2).replace('.', ','));
      setCutoffDate(selectedAccount.dataCorte ?? DEFAULT_CUTOFF_DATE);
      setIsDefault(selectedAccount.padrao);
      setConfirmOpeningBalance(selectedAccount.saldoInicialConfirmado);
      return;
    }

    setName('');
    setType('CAIXA');
    setOpeningBalance('0,00');
    setCutoffDate(DEFAULT_CUTOFF_DATE);
    setIsDefault(accounts.length === 0);
    setConfirmOpeningBalance(false);
  }, [accounts.length, open, selectedAccount]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (readOnly) throw new Error('Configurações financeiras são bloqueadas em modo suporte.');
      const normalizedName = name.trim();
      if (normalizedName.length < 2) throw new Error('Informe um nome com pelo menos 2 caracteres.');
      if (confirmOpeningBalance && !cutoffDate) throw new Error('Informe a data de corte.');

      return salvarContaFinanceira({
        id: selectedAccount?.id,
        nome: normalizedName,
        tipo: type,
        saldoInicial: confirmOpeningBalance ? moneyInput(openingBalance) : null,
        dataCorte: confirmOpeningBalance ? cutoffDate : null,
        padrao: isDefault,
        ativa: selectedAccount?.ativa ?? true,
      });
    },
    onSuccess: async () => {
      await onSuccess(
        isNew ? 'Conta criada' : 'Conta atualizada',
        confirmOpeningBalance
          ? 'O saldo inicial e a data de corte foram confirmados para os cálculos.'
          : 'A conta foi salva; o painel continuará mostrando resultado do período até a base ser confirmada.',
      );
    },
    onError,
  });

  if (readOnly) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !mutation.isPending && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Contas e saldo inicial</DialogTitle>
          <DialogDescription>
            Organize Caixa, Banco, PIX e Carteira. A data de corte separa o histórico estimado do saldo confiável.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 md:grid-cols-[minmax(210px,0.72fr)_minmax(0,1.45fr)]">
          <aside className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Contas</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 rounded-lg px-2 text-xs"
                onClick={() => setSelectedId(null)}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Nova
              </Button>
            </div>

            <div className="max-h-[44vh] space-y-2 overflow-y-auto pr-1">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  className={cn(
                    'w-full rounded-xl border p-3 text-left transition',
                    selectedId === account.id
                      ? 'border-blue-300 bg-white shadow-sm'
                      : 'border-transparent bg-transparent hover:border-slate-200 hover:bg-white/80',
                  )}
                  onClick={() => setSelectedId(account.id)}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">{account.nome}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">{typeLabel(account.tipo)}</span>
                    </span>
                    {account.padrao ? <Badge variant="secondary" className="text-[10px]">Padrão</Badge> : null}
                  </span>
                  <span className="mt-2 block text-xs font-semibold text-slate-700">
                    Base: <FinancialValue>{brl(account.saldoInicial)}</FinancialValue>
                  </span>
                </button>
              ))}
              {!accounts.length ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
                  Nenhuma conta cadastrada.
                </div>
              ) : null}
            </div>
          </aside>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                {type === 'BANCO' ? <Landmark className="h-5 w-5" aria-hidden="true" /> : type === 'CAIXA' ? <Building2 className="h-5 w-5" aria-hidden="true" /> : <WalletCards className="h-5 w-5" aria-hidden="true" />}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{isNew ? 'Nova conta financeira' : 'Editar conta financeira'}</h3>
                <p className="text-xs text-slate-500">Movimentos permanecem vinculados à conta mesmo se o nome mudar.</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="finance-account-name">Nome da conta</Label>
                <Input
                  id="finance-account-name"
                  value={name}
                  maxLength={80}
                  placeholder="Ex.: Caixa geral ou Banco principal"
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="finance-account-type">Tipo</Label>
                <Select value={type} onValueChange={(value) => setType(value as FinanceiroTipoConta)}>
                  <SelectTrigger id="finance-account-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                <div>
                  <Label htmlFor="finance-account-default">Conta padrão</Label>
                  <p className="mt-0.5 text-[11px] text-slate-500">Pré-selecionada ao receber ou pagar.</p>
                </div>
                <Switch
                  id="finance-account-default"
                  checked={isDefault}
                  onCheckedChange={setIsDefault}
                  aria-label="Definir como conta padrão"
                />
              </div>
            </div>

            <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-amber-950">Base do saldo</h3>
                  <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
                    O saldo inicial representa quanto já existia nesta conta na data de corte.
                  </p>
                </div>
                <Switch
                  checked={confirmOpeningBalance}
                  onCheckedChange={setConfirmOpeningBalance}
                  aria-label="Confirmar saldo inicial"
                />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="finance-opening-balance">Saldo inicial</Label>
                  <Input
                    id="finance-opening-balance"
                    type={financialValuesHidden ? 'password' : 'text'}
                    inputMode="decimal"
                    autoComplete="off"
                    value={openingBalance}
                    placeholder="0,00"
                    onChange={(event) => setOpeningBalance(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="finance-cutoff-date">Data de corte</Label>
                  <Input
                    id="finance-cutoff-date"
                    type="date"
                    value={cutoffDate}
                    min="2026-06-01"
                    onChange={(event) => setCutoffDate(event.target.value)}
                  />
                </div>
              </div>

              <Alert className="mt-3 border-amber-300 bg-white/70 text-amber-950">
                <CircleAlert className="h-4 w-4" />
                <AlertTitle>Esta alteração muda a base do saldo</AlertTitle>
                <AlertDescription>
                  Confirme somente com o valor real da conta em {dateBR(cutoffDate)}. Sem confirmação, o painel continuará chamando o total de resultado do período, nunca de saldo real.
                </AlertDescription>
              </Alert>
            </section>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Salvando…' : isNew ? 'Criar conta' : 'Salvar conta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
