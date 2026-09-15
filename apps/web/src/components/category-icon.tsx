import { BriefcaseBusinessIcon, CarIcon, GraduationCapIcon, HeartPulseIcon, ScissorsIcon, ShoppingBagIcon, StoreIcon, UtensilsCrossedIcon, WineIcon, WrenchIcon, type LucideIcon } from 'lucide-react';
import { categoryVisual, type CategoryVisualKey } from '@/lib/category-visuals';

const ICONS: Record<CategoryVisualKey, LucideIcon> = {
  food: UtensilsCrossedIcon,
  drink: WineIcon,
  shopping: ShoppingBagIcon,
  health: HeartPulseIcon,
  home: WrenchIcon,
  professional: BriefcaseBusinessIcon,
  beauty: ScissorsIcon,
  auto: CarIcon,
  education: GraduationCapIcon,
  general: StoreIcon,
};

/** Decorative category icon: the category name always appears as text beside it, so it is hidden from assistive technology (SRS NFR 011). */
export function CategoryIcon({ slug, className = 'size-6' }: { slug: string; className?: string }) {
  const Icon = ICONS[categoryVisual(slug)];
  return <Icon aria-hidden="true" className={className} strokeWidth={1.6} />;
}
