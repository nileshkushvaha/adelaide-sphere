import { useMemo } from 'react';
import { Button, Select, Space, Typography } from 'antd';
import { SERVICE_ICON_LIBRARY, isServiceIconKey, serviceIconKey, type ServiceIconKey } from '@adelaide-sphere/domain/service-icons';
import {
  AccessibilityIcon, ActivityIcon, BabyIcon, BeerIcon, BikeIcon, BookOpenCheckIcon, BookOpenIcon, BriefcaseIcon, CakeIcon, CalculatorIcon, CameraIcon, CarIcon, CarrotIcon,
  CircleCheckIcon, CircleParkingIcon, ClipboardListIcon, ClockIcon, CoffeeIcon, CpuIcon, CroissantIcon, Disc3Icon, DoorOpenIcon, DropletsIcon, DumbbellIcon, EggFriedIcon,
  FishIcon, FlameIcon, Flower2Icon, FlowerIcon, GiftIcon, GraduationCapIcon, HammerIcon, HandIcon, HeartIcon, HeartPulseIcon, HouseIcon, KeyRoundIcon, LaptopIcon, LeafIcon,
  LockIcon, MartiniIcon, MusicIcon, PackageIcon, PaintbrushIcon, PartyPopperIcon, PawPrintIcon, PizzaIcon, ReceiptIcon, SandwichIcon, ScissorsIcon, ScrollTextIcon, ShirtIcon,
  ShoppingBagIcon, SirenIcon, SmileIcon, SparklesIcon, SprayCanIcon, StethoscopeIcon, SunIcon, SyringeIcon, UtensilsCrossedIcon, UtensilsIcon, WheatIcon, WifiIcon,
  WineIcon, WrenchIcon, ZapIcon, type LucideIcon,
} from 'lucide-react';

/** The same pictures the public site draws for each key, so the picker shows what visitors will see. */
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

interface Props {
  /** The chosen key; supplied by `Form.Item` when used as a control. */
  value?: string | null;
  onChange?: (key: string | null) => void;
  /** The service's name as typed, so the picker can suggest a match. */
  serviceName?: string;
  disabled?: boolean;
}

/**
 * Chooses the icon a service shows on a listing.
 *
 * The library is the shared one in `@adelaide-sphere/domain`, so an editor
 * can only choose what the public site can draw. Left empty, the site matches
 * the name ("Free Wi-Fi" gets the Wi-Fi icon on its own) and the picker says
 * what that match is; choosing one overrides it, for the names that match
 * nothing or match the wrong thing.
 */
export function ServiceIconPicker({ value, onChange, serviceName = '', disabled = false }: Props) {
  const chosen = isServiceIconKey(value) ? value : null;
  const suggested = useMemo(() => serviceIconKey(serviceName), [serviceName]);
  const Preview = ICONS[chosen ?? suggested];
  const options = useMemo(
    () =>
      SERVICE_ICON_LIBRARY.map(({ key, label }) => {
        const Icon = ICONS[key];
        return { value: key, label, searchText: `${label} ${key}`, icon: <Icon aria-hidden="true" style={{ width: 16, height: 16 }} /> };
      }),
    [],
  );

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Space align="center" size={12}>
        <span style={{ display: 'inline-flex', width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: 'var(--ant-color-fill-tertiary)' }}>
          <Preview aria-hidden="true" style={{ width: 20, height: 20 }} />
        </span>
        <Select
          aria-label="Icon"
          showSearch
          allowClear
          disabled={disabled}
          placeholder="Match the name automatically"
          value={chosen ?? undefined}
          onChange={(next) => onChange?.(next ?? null)}
          optionFilterProp="searchText"
          style={{ width: 280 }}
          options={options}
          optionRender={(option) => (
            <Space size={8}>
              {option.data.icon}
              {option.data.label}
            </Space>
          )}
        />
      </Space>
      <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
        {chosen ? (
          <>
            Chosen for this service.{' '}
            {!disabled && (
              <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={() => onChange?.(null)}>
                Match the name instead
              </Button>
            )}
          </>
        ) : suggested === 'generic' ? (
          'Nothing in the name suggests an icon, so a plain tick is shown. Choose one to be specific.'
        ) : (
          <>Matched from the name: {SERVICE_ICON_LIBRARY.find((entry) => entry.key === suggested)?.label ?? suggested}. Choose one to override it.</>
        )}
      </Typography.Text>
    </Space>
  );
}
