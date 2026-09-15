import {
  AlignLeftOutlined,
  AppstoreOutlined,
  FontSizeOutlined,
  MailOutlined,
  NotificationOutlined,
  PictureOutlined,
  QuestionCircleOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import type { PageSectionType } from '@adelaide-sphere/domain/page-sections';

/** The icon for a section type. Decorative: the section's label always accompanies it. */
export function SectionIcon({ type }: { type: PageSectionType }) {
  switch (type) {
    case 'header':
      return <FontSizeOutlined aria-hidden="true" />;
    case 'text':
      return <AlignLeftOutlined aria-hidden="true" />;
    case 'imageText':
      return <PictureOutlined aria-hidden="true" />;
    case 'callout':
      return <NotificationOutlined aria-hidden="true" />;
    case 'cards':
      return <AppstoreOutlined aria-hidden="true" />;
    case 'faq':
      return <QuestionCircleOutlined aria-hidden="true" />;
    case 'businesses':
      return <ShopOutlined aria-hidden="true" />;
    case 'contact':
      return <MailOutlined aria-hidden="true" />;
  }
}
