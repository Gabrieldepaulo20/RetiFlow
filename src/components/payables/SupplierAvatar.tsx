import { useMemo, type CSSProperties } from 'react';
import { getCategoryIcon } from '@/lib/payableCategoryIcon';
import { getSupplierVisual, getSupplierColor, getSupplierInitials } from '@/lib/supplierVisual';
import { cn } from '@/lib/utils';

interface SupplierAvatarProps {
  /** Nome do fornecedor (banco, empresa, ramo). */
  name?: string | null;
  /** Nome do ícone Lucide da categoria da conta (PayableCategory.icon), usado como 2ª camada. */
  categoryIcon?: string | null;
  /** Tamanho do tile em px. */
  size?: number;
  className?: string;
}

/**
 * Avatar visual do fornecedor — 100% local, sem chamadas externas.
 * Resolução em camadas:
 *  1. Marca/ramo reconhecido pelo nome → ícone + cor da marca
 *  2. Ícone da categoria da conta, se informado
 *  3. Inicial + cor determinística
 */
export function SupplierAvatar({ name, categoryIcon, size = 40, className }: SupplierAvatarProps) {
  const safeName = (name ?? '').trim();
  const visual = useMemo(() => getSupplierVisual(safeName), [safeName]);

  const tileStyle: CSSProperties = { width: size, height: size, minWidth: size };
  const iconSize = Math.round(size * 0.5);
  const label = safeName || 'Fornecedor não identificado';

  // 1. Marca / ramo reconhecido
  if (visual) {
    const Icon = visual.Icon;
    return (
      <div
        role="img"
        aria-label={label}
        title={label}
        className={cn('flex items-center justify-center rounded-xl border shadow-sm', className)}
        style={{ ...tileStyle, backgroundColor: `${visual.color}1A`, borderColor: `${visual.color}33` }}
      >
        <Icon style={{ width: iconSize, height: iconSize, color: visual.color }} strokeWidth={2} />
      </div>
    );
  }

  // 2. Ícone da categoria da conta
  if (categoryIcon) {
    const Icon = getCategoryIcon(categoryIcon);
    const color = getSupplierColor(safeName || categoryIcon);
    return (
      <div
        role="img"
        aria-label={label}
        title={label}
        className={cn('flex items-center justify-center rounded-xl border shadow-sm', className)}
        style={{ ...tileStyle, backgroundColor: `${color}1A`, borderColor: `${color}33` }}
      >
        <Icon style={{ width: iconSize, height: iconSize, color }} strokeWidth={2} />
      </div>
    );
  }

  // 3. Inicial + cor determinística
  const color = getSupplierColor(safeName || '?');
  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      className={cn('flex items-center justify-center rounded-xl font-bold text-white shadow-sm', className)}
      style={{ ...tileStyle, backgroundColor: color, fontSize: Math.round(size * 0.36) }}
    >
      {getSupplierInitials(safeName || '?')}
    </div>
  );
}
