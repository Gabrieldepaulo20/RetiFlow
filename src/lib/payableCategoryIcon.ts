import {
  Building2,
  Car,
  Fuel,
  Landmark,
  MoreHorizontal,
  Package,
  ReceiptText,
  Settings2,
  ShoppingBag,
  Truck,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

const categoryIcons: Record<string, LucideIcon> = {
  Building2,
  Car,
  Fuel,
  Landmark,
  MoreHorizontal,
  Package,
  ReceiptText,
  Settings2,
  ShoppingBag,
  Truck,
  Users,
  Wrench,
  Zap,
};

export function getCategoryIcon(iconName?: string | null): LucideIcon {
  return iconName && categoryIcons[iconName] ? categoryIcons[iconName] : ReceiptText;
}
