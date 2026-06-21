import { useState } from 'react';
import { Info } from 'lucide-react';
import { usePayablesData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCategoryIcon } from '@/lib/payableCategoryIcon';
import { cn } from '@/lib/utils';
import { PAYABLE_CATEGORY_CLASS_LABELS, type PayableCategoryClass } from '@/types';

const CLASSES: PayableCategoryClass[] = ['CUSTO', 'DESPESA', 'IMPOSTO', 'FINANCEIRO'];

const CLASS_HELP: Record<PayableCategoryClass, string> = {
  CUSTO: 'Peças/insumos + mão de obra direta — entra no Lucro Bruto (CMV).',
  DESPESA: 'Estrutura: aluguel, energia, admin, pró-labore.',
  IMPOSTO: 'Tributos sobre serviço — dedução da receita.',
  FINANCEIRO: 'Juros, multas, tarifas bancárias.',
};

/**
 * Classifica a classe contábil de cada categoria de Contas a Pagar (base do DRE).
 * Edição desabilitada em modo suporte (a RPC de suporte ainda não aceita p_classe).
 */
export function PlanoDeContasPanel() {
  const { payableCategories, updateCategoriaClasse } = usePayablesData();
  const { isSupportImpersonating } = useAuth();
  const { toast } = useToast();
  const [savingId, setSavingId] = useState<string | null>(null);

  const categories = [...payableCategories]
    .filter((category) => category.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleChange = async (id: string, classe: PayableCategoryClass) => {
    setSavingId(id);
    try {
      await updateCategoriaClasse(id, classe);
      toast({ title: 'Categoria classificada', description: PAYABLE_CATEGORY_CLASS_LABELS[classe] });
    } catch {
      // erro/reversão já tratados no contexto
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Plano de contas — classe das categorias</CardTitle>
        <p className="text-sm text-muted-foreground">
          Define como cada categoria entra no DRE: custo (Lucro Bruto), despesa, imposto ou financeiro.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isSupportImpersonating ? (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Reclassificação desabilitada no modo suporte. Acesse com a conta da empresa para editar.
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {CLASSES.map((classe) => (
            <div key={classe} className="rounded-lg border border-border/60 px-2.5 py-1.5">
              <p className="text-xs font-semibold text-foreground">{PAYABLE_CATEGORY_CLASS_LABELS[classe]}</p>
              <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{CLASS_HELP[classe]}</p>
            </div>
          ))}
        </div>

        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
          {categories.map((category) => {
            const Icon = getCategoryIcon(category.icon);
            return (
              <div key={category.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', category.color)}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{category.name}</span>
                <Select
                  value={category.classe ?? ''}
                  onValueChange={(value) => handleChange(category.id, value as PayableCategoryClass)}
                  disabled={isSupportImpersonating || savingId === category.id}
                >
                  <SelectTrigger className="h-8 w-[150px] text-xs">
                    <SelectValue placeholder="A classificar" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLASSES.map((classe) => (
                      <SelectItem key={classe} value={classe}>{PAYABLE_CATEGORY_CLASS_LABELS[classe]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
          {categories.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma categoria ativa.</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
