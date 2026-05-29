import {
  Banknote,
  Building2,
  Bus,
  Car,
  CreditCard,
  Droplets,
  Dumbbell,
  Flame,
  Fuel,
  GraduationCap,
  HeartPulse,
  Landmark,
  Newspaper,
  Package,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Stethoscope,
  Truck,
  UtensilsCrossed,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Identidade visual de um fornecedor a partir do nome, SEM dependência externa.
 * Camadas de resolução:
 *  1. Marca conhecida (banco, fintech, operadora, utility, varejo) → ícone + cor da marca
 *  2. Ramo por palavra-chave (faculdade, energia, água, alimentação…) → ícone do ramo
 *  3. (no componente) ícone da categoria da conta, se houver
 *  4. (no componente) inicial + cor determinística
 *
 * Retorna sempre uma cor hex (para tint do avatar) e um ícone Lucide.
 */
export interface SupplierVisual {
  Icon: LucideIcon;
  /** Cor base em hex — usada para tint de fundo e cor do ícone. */
  color: string;
  /** Origem da resolução, útil para debug/teste. */
  kind: 'brand' | 'industry';
}

type BrandEntry = { match: string[]; Icon: LucideIcon; color: string };

/**
 * Marcas reconhecidas. `match` são substrings (já normalizadas: minúsculas, sem acento).
 * Ordem importa: entradas mais específicas primeiro.
 */
const KNOWN_BRANDS: BrandEntry[] = [
  // ── Bancos e fintechs ───────────────────────────────────────────────
  { match: ['nubank', 'nu pagamentos'], Icon: CreditCard, color: '#820AD1' },
  { match: ['itau', 'itau unibanco'], Icon: Landmark, color: '#EC7000' },
  { match: ['bradesco'], Icon: Landmark, color: '#CC092F' },
  { match: ['santander'], Icon: Landmark, color: '#EC0000' },
  { match: ['caixa economica', 'caixa'], Icon: Landmark, color: '#005CA9' },
  { match: ['banco do brasil', 'banco brasil'], Icon: Landmark, color: '#FABC04' },
  { match: ['banco inter', 'inter'], Icon: Landmark, color: '#FF8A00' },
  { match: ['c6 bank', 'c6bank', 'c6'], Icon: Landmark, color: '#242424' },
  { match: ['safra'], Icon: Landmark, color: '#003882' },
  { match: ['sicoob'], Icon: Landmark, color: '#007A3D' },
  { match: ['sicredi'], Icon: Landmark, color: '#00853F' },
  { match: ['neon'], Icon: CreditCard, color: '#00CFFF' },
  { match: ['original'], Icon: Landmark, color: '#006633' },
  { match: ['picpay'], Icon: Smartphone, color: '#21C25E' },
  { match: ['mercado pago', 'mercadopago'], Icon: ShoppingCart, color: '#009EE3' },
  { match: ['pagseguro', 'pagbank'], Icon: CreditCard, color: '#00B4D8' },
  { match: ['stone'], Icon: CreditCard, color: '#00A868' },
  // ── Operadoras / telecom ────────────────────────────────────────────
  { match: ['vivo'], Icon: Smartphone, color: '#660099' },
  { match: ['claro', 'net claro'], Icon: Smartphone, color: '#DA291C' },
  { match: ['tim '], Icon: Smartphone, color: '#0032A0' },
  { match: ['oi fibra', 'oi telecom'], Icon: Smartphone, color: '#FF6600' },
  // ── Utilities (energia / água / gás) ────────────────────────────────
  { match: ['enel'], Icon: Zap, color: '#007CC2' },
  { match: ['cpfl'], Icon: Zap, color: '#009A44' },
  { match: ['elektro'], Icon: Zap, color: '#FF6600' },
  { match: ['light '], Icon: Zap, color: '#F37021' },
  { match: ['cemig'], Icon: Zap, color: '#0072CE' },
  { match: ['copel'], Icon: Zap, color: '#00A19A' },
  { match: ['sabesp'], Icon: Droplets, color: '#0076B3' },
  { match: ['comgas', 'gas natural'], Icon: Flame, color: '#E2001A' },
  // ── Varejo / serviços comuns ────────────────────────────────────────
  { match: ['correios'], Icon: Package, color: '#FFB81C' },
  { match: ['amazon'], Icon: ShoppingCart, color: '#FF9900' },
  { match: ['mercado livre', 'mercadolivre'], Icon: ShoppingCart, color: '#FFE600' },
  { match: ['google'], Icon: Sparkles, color: '#4285F4' },
  { match: ['microsoft'], Icon: Sparkles, color: '#00A4EF' },
];

type IndustryEntry = { match: string[]; Icon: LucideIcon; color: string };

/**
 * Ramos de atividade — quando a marca não é reconhecida, inferimos o setor
 * por palavra-chave no nome para escolher um ícone "relacionado".
 */
const INDUSTRIES: IndustryEntry[] = [
  { match: ['faculdade', 'universidade', 'colegio', 'escola', 'curso', 'ensino', 'educac'], Icon: GraduationCap, color: '#6D28D9' },
  { match: ['telefon', 'operadora', 'celular', 'movel', 'telecom'], Icon: Smartphone, color: '#0EA5E9' },
  { match: ['internet', 'fibra', 'banda larga', 'provedor'], Icon: Wifi, color: '#2563EB' },
  { match: ['energia', 'eletric', 'eletrica', 'luz', 'distribuidora de energia'], Icon: Zap, color: '#F59E0B' },
  { match: ['agua', 'saneamento', 'esgoto'], Icon: Droplets, color: '#0891B2' },
  { match: ['gas'], Icon: Flame, color: '#DC2626' },
  { match: ['posto', 'combustivel', 'gasolina', 'diesel', 'etanol'], Icon: Fuel, color: '#B45309' },
  { match: ['salgad', 'lanch', 'restaurant', 'padaria', 'aliment', 'mercado', 'açai', 'acai', 'pizza', 'bar '], Icon: UtensilsCrossed, color: '#EA580C' },
  { match: ['clinica', 'hospital', 'saude', 'medic', 'odonto', 'farmac', 'drogaria'], Icon: Stethoscope, color: '#059669' },
  { match: ['plano de saude', 'unimed', 'amil', 'hapvida'], Icon: HeartPulse, color: '#DC2626' },
  { match: ['seguro', 'seguradora'], Icon: ShieldCheck, color: '#1D4ED8' },
  { match: ['academia', 'fitness', 'crossfit'], Icon: Dumbbell, color: '#7C3AED' },
  { match: ['transporte', 'frete', 'logistica', 'transportadora'], Icon: Truck, color: '#92400E' },
  { match: ['viacao', 'onibus', 'rodoviaria'], Icon: Bus, color: '#1E40AF' },
  { match: ['auto pec', 'autopec', 'pecas', 'retifica', 'mecanica', 'oficina'], Icon: Wrench, color: '#475569' },
  { match: ['veiculo', 'concessionaria', 'automovel', 'ipva'], Icon: Car, color: '#334155' },
  { match: ['aluguel', 'imobiliaria', 'condominio', 'locacao'], Icon: Building2, color: '#0F766E' },
  { match: ['jornal', 'revista', 'assinatura', 'midia'], Icon: Newspaper, color: '#525252' },
  { match: ['imposto', 'tributo', 'prefeitura', 'iptu', 'taxa', 'guia'], Icon: Receipt, color: '#7C2D12' },
  { match: ['banco', 'financ', 'credito', 'emprestimo'], Icon: Banknote, color: '#15803D' },
];

/** Normaliza para busca: minúsculas, sem acentos. */
export function normalizeSupplierText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Resolve marca/ramo a partir do nome. Retorna null se nada bater
 * (o componente decide o fallback: ícone da categoria ou inicial colorida).
 */
export function getSupplierVisual(supplierName?: string | null): SupplierVisual | null {
  if (!supplierName) return null;
  const text = normalizeSupplierText(supplierName);
  if (!text) return null;

  for (const brand of KNOWN_BRANDS) {
    if (brand.match.some((token) => text.includes(token))) {
      return { Icon: brand.Icon, color: brand.color, kind: 'brand' };
    }
  }
  for (const industry of INDUSTRIES) {
    if (industry.match.some((token) => text.includes(token))) {
      return { Icon: industry.Icon, color: industry.color, kind: 'industry' };
    }
  }
  return null;
}

const FALLBACK_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#EF4444',
  '#F97316', '#EAB308', '#22C55E', '#14B8A6',
  '#3B82F6', '#06B6D4',
];

/** Cor determinística a partir do nome (avatar de inicial). */
export function getSupplierColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

/** Inicial(is) para o avatar de fallback. */
export function getSupplierInitials(name: string): string {
  const words = normalizeSupplierText(name).split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
