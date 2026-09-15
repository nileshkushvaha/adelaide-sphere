import { isMenuIconKey, type MenuIconKey } from '@adelaide-sphere/domain/menus';
import {
  ArrowRightIcon, BellIcon, BookOpenIcon, BriefcaseIcon, CalendarIcon, CameraIcon, CircleHelpIcon, CoffeeIcon, ExternalLinkIcon, FileTextIcon, FolderIcon, GlobeIcon,
  GraduationCapIcon, HeartIcon, HouseIcon, InfoIcon, MailIcon, MapPinIcon, MessageCircleIcon, NewspaperIcon, PhoneIcon, PlusIcon, SearchIcon, ShieldIcon, ShoppingBagIcon,
  SparklesIcon, StarIcon, StoreIcon, TagIcon, UsersIcon, UtensilsIcon, WrenchIcon, type LucideIcon,
} from 'lucide-react';

/** Typed against the shared library, so a key the admin can offer but this site cannot draw is a compile error. */
const ICONS: Record<MenuIconKey, LucideIcon> = {
  home: HouseIcon, store: StoreIcon, newspaper: NewspaperIcon, info: InfoIcon, mail: MailIcon, phone: PhoneIcon, message: MessageCircleIcon, help: CircleHelpIcon,
  'map-pin': MapPinIcon, tag: TagIcon, folder: FolderIcon, star: StarIcon, users: UsersIcon, calendar: CalendarIcon, shield: ShieldIcon, 'file-text': FileTextIcon,
  book: BookOpenIcon, external: ExternalLinkIcon, search: SearchIcon, plus: PlusIcon, heart: HeartIcon, briefcase: BriefcaseIcon, coffee: CoffeeIcon, utensils: UtensilsIcon,
  wrench: WrenchIcon, 'shopping-bag': ShoppingBagIcon, graduation: GraduationCapIcon, camera: CameraIcon, sparkles: SparklesIcon, bell: BellIcon, 'arrow-right': ArrowRightIcon,
  globe: GlobeIcon,
};

/** A menu item's icon. Decorative: the label beside it carries the meaning. */
export function MenuIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  if (!isMenuIconKey(name)) return null;
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" className={className} />;
}
