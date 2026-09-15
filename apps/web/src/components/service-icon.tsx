import {
  AccessibilityIcon, ActivityIcon, BabyIcon, BeerIcon, BikeIcon, BookOpenCheckIcon, BookOpenIcon, BriefcaseIcon, CakeIcon, CalculatorIcon, CameraIcon, CarIcon, CarrotIcon,
  CircleCheckIcon, CircleParkingIcon, ClipboardListIcon, ClockIcon, CoffeeIcon, CpuIcon, CroissantIcon, Disc3Icon, DoorOpenIcon, DropletsIcon, DumbbellIcon, EggFriedIcon,
  FishIcon, FlameIcon, Flower2Icon, FlowerIcon, GiftIcon, GraduationCapIcon, HammerIcon, HandIcon, HeartIcon, HeartPulseIcon, HouseIcon, KeyRoundIcon, LaptopIcon, LeafIcon,
  LockIcon, MartiniIcon, MusicIcon, PackageIcon, PaintbrushIcon, PartyPopperIcon, PawPrintIcon, PizzaIcon, ReceiptIcon, SandwichIcon, ScissorsIcon, ScrollTextIcon, ShirtIcon,
  ShoppingBagIcon, SirenIcon, SmileIcon, SparklesIcon, SprayCanIcon, StethoscopeIcon, SunIcon, SyringeIcon, UtensilsCrossedIcon, UtensilsIcon, WheatIcon, WifiIcon,
  WineIcon, WrenchIcon, ZapIcon, type LucideIcon,
} from 'lucide-react';
import { isServiceIconKey, serviceIconKey, type ServiceIconKey } from '@adelaide-sphere/domain/service-icons';

const ICONS: Record<ServiceIconKey, LucideIcon> = {
  coffee: CoffeeIcon, breakfast: EggFriedIcon, lunch: SandwichIcon, takeaway: ShoppingBagIcon, catering: UtensilsCrossedIcon, dining: UtensilsIcon, delivery: BikeIcon, functions: PartyPopperIcon, menu: ClipboardListIcon,
  cocktails: MartiniIcon, wine: WineIcon, beer: BeerIcon, music: MusicIcon, room: DoorOpenIcon, snacks: PizzaIcon,
  vaccination: SyringeIcon, surgery: StethoscopeIcon, dental: SmileIcon, grooming: ScissorsIcon, boarding: HouseIcon, microchip: CpuIcon, pets: PawPrintIcon,
  plumbing: WrenchIcon, gas: FlameIcon, electrical: ZapIcon, mechanic: CarIcon, emergency: SirenIcon, water: DropletsIcon, cleaning: SprayCanIcon, painting: PaintbrushIcon, building: HammerIcon, locks: LockIcon, garden: LeafIcon,
  physio: ActivityIcon, massage: HandIcon, yoga: Flower2Icon, pilates: DumbbellIcon, whitening: SparklesIcon, health: HeartPulseIcon,
  books: BookOpenIcon, gifts: GiftIcon, haircut: ScissorsIcon, records: Disc3Icon, clothing: ShirtIcon,
  bread: WheatIcon, pastries: CroissantIcon, seafood: FishIcon, produce: CarrotIcon, wholesale: PackageIcon, cake: CakeIcon,
  flowers: FlowerIcon, wedding: HeartIcon,
  accounting: CalculatorIcon, tax: ReceiptIcon, bookkeeping: BookOpenCheckIcon, conveyancing: KeyRoundIcon, wills: ScrollTextIcon, advice: BriefcaseIcon, legal: ScrollTextIcon,
  wifi: WifiIcon, parking: CircleParkingIcon, accessible: AccessibilityIcon, kids: BabyIcon, outdoor: SunIcon, online: LaptopIcon, hours: ClockIcon, photography: CameraIcon, education: GraduationCapIcon,
  generic: CircleCheckIcon,
};

/**
 * Decorative pictogram beside a service name. The name is always shown as
 * text, so the icon is hidden from assistive technology (SRS NFR 011); it
 * exists so a list of twelve services can be scanned rather than read.
 */
export function ServiceIcon({ name, icon, className = 'size-4' }: { name: string; icon?: string | null; className?: string }) {
  // An editor's choice wins; a name-based match stands in until one is made.
  const Icon = ICONS[isServiceIconKey(icon) ? icon : serviceIconKey(name)];
  return <Icon aria-hidden="true" className={className} strokeWidth={1.8} />;
}
