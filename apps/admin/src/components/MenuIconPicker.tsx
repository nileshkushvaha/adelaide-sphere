import { useMemo } from 'react';
import { Select, Space } from 'antd';
import { MENU_ICON_LIBRARY, isMenuIconKey, type MenuIconKey } from '@adelaide-sphere/domain/menus';
import {
  ArrowRightIcon, BellIcon, BookOpenIcon, BriefcaseIcon, CalendarIcon, CameraIcon, CircleHelpIcon, CoffeeIcon, ExternalLinkIcon, FileTextIcon, FolderIcon, GlobeIcon,
  GraduationCapIcon, HeartIcon, HouseIcon, InfoIcon, MailIcon, MapPinIcon, MessageCircleIcon, NewspaperIcon, PhoneIcon, PlusIcon, SearchIcon, ShieldIcon, ShoppingBagIcon,
  SparklesIcon, StarIcon, StoreIcon, TagIcon, UsersIcon, UtensilsIcon, WrenchIcon, type LucideIcon,
} from 'lucide-react';

/** The same pictures the public site draws for each key, so the picker shows what visitors will see. */
const MENU_ICONS: Record<MenuIconKey, LucideIcon> = {
  home: HouseIcon, store: StoreIcon, newspaper: NewspaperIcon, info: InfoIcon, mail: MailIcon, phone: PhoneIcon, message: MessageCircleIcon, help: CircleHelpIcon,
  'map-pin': MapPinIcon, tag: TagIcon, folder: FolderIcon, star: StarIcon, users: UsersIcon, calendar: CalendarIcon, shield: ShieldIcon, 'file-text': FileTextIcon,
  book: BookOpenIcon, external: ExternalLinkIcon, search: SearchIcon, plus: PlusIcon, heart: HeartIcon, briefcase: BriefcaseIcon, coffee: CoffeeIcon, utensils: UtensilsIcon,
  wrench: WrenchIcon, 'shopping-bag': ShoppingBagIcon, graduation: GraduationCapIcon, camera: CameraIcon, sparkles: SparklesIcon, bell: BellIcon, 'arrow-right': ArrowRightIcon,
  globe: GlobeIcon,
};

interface Props {
  id?: string;
  value?: string | null;
  onChange?: (key: string | null) => void;
  disabled?: boolean;
}

/**
 * Chooses the icon a menu item shows beside its label. The library is the
 * shared one in `@adelaide-sphere/domain`, so an editor can only choose what
 * the public site can draw.
 */
export function MenuIconPicker({ id, value, onChange, disabled = false }: Props) {
  const chosen = isMenuIconKey(value) ? value : undefined;
  const options = useMemo(
    () =>
      MENU_ICON_LIBRARY.map(({ key, label }) => {
        const Icon = MENU_ICONS[key];
        return { value: key, label, searchText: `${label} ${key}`, icon: <Icon aria-hidden="true" style={{ width: 16, height: 16 }} /> };
      }),
    [],
  );
  return (
    <Select
      id={id}
      showSearch
      allowClear
      disabled={disabled}
      placeholder="No icon"
      value={chosen}
      onChange={(next) => onChange?.(next ?? null)}
      optionFilterProp="searchText"
      style={{ width: '100%' }}
      options={options}
      optionRender={(option) => (
        <Space size={8}>
          {option.data.icon}
          {option.data.label}
        </Space>
      )}
      labelRender={(option) => {
        const Icon = isMenuIconKey(option.value) ? MENU_ICONS[option.value] : null;
        return (
          <Space size={8}>
            {Icon && <Icon aria-hidden="true" style={{ width: 14, height: 14, verticalAlign: '-2px' }} />}
            {option.label}
          </Space>
        );
      }}
    />
  );
}
